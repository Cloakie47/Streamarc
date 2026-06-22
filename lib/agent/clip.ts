// lib/agent/clip.ts
// Phase 3: turn an accepted clip selection into a real, playable StreamArc video.
//
//   createCloudflareClip()  — POST /accounts/{ACCT}/stream/clip with whole-second
//                             bounds, then poll the new uid until readyToStream.
//   insertClipVideoRow()    — insert a videos row for the clip so it shows up on
//                             the platform (rate_per_sec 0, status 'live').
//
// Validated against SPIKE-RESULTS.md §2 (clip API returns a new uid, ready in
// ~40s, publicly playable). Uses the same Cloudflare creds as transcript.ts. No
// payment or settle-core involvement here.

import type { SupabaseClient } from "@supabase/supabase-js"

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const STREAM_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 180_000 // clips were ready in ~40s in the spike

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cfFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in env")
  }
  return fetch(`${STREAM_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_TOKEN}`, ...(init?.headers ?? {}) },
  })
}

export interface CreatedCloudflareClip {
  uid: string
  /** Final clip duration reported by Cloudflare once ready (falls back to end-start). */
  durationSecs: number
}

/**
 * Create a clip from `sourceUid` over [startSeconds, endSeconds] (whole seconds)
 * and poll the new video uid until it is ready to stream.
 */
export async function createCloudflareClip(
  sourceUid: string,
  startSeconds: number,
  endSeconds: number,
): Promise<CreatedCloudflareClip> {
  const start = Math.max(0, Math.floor(startSeconds))
  const end = Math.max(start + 1, Math.ceil(endSeconds))

  const res = await cfFetch(`/clip`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clippedFromVideoUID: sourceUid, startTimeSeconds: start, endTimeSeconds: end }),
  })
  if (!res.ok) throw new Error(`clip create failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { result?: { uid?: string } }
  const uid = data.result?.uid
  if (!uid) throw new Error("clip create returned no uid")

  const startedAt = Date.now()
  for (;;) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) throw new Error(`clip ${uid} not ready within ${POLL_TIMEOUT_MS / 1000}s`)
    await sleep(POLL_INTERVAL_MS)
    const statusRes = await cfFetch(`/${uid}`)
    if (!statusRes.ok) continue
    const statusData = (await statusRes.json()) as { result?: { readyToStream?: boolean; duration?: number } }
    if (statusData.result?.readyToStream) {
      const reported = Number(statusData.result.duration)
      // Give the clip a representative poster (a frame from its midpoint) so every
      // clip shows a distinct still instead of the default first frame. Best-effort.
      await setClipThumbnail(uid).catch((e) => console.warn(`clip ${uid} thumbnail set failed:`, e?.message ?? e))
      return { uid, durationSecs: reported > 0 ? Math.round(reported) : end - start }
    }
  }
}

/**
 * Point the clip's poster at a frame from WITHIN it (default: the midpoint). The
 * clip is a fresh video that starts at 0, so pct 0.5 = the clip's middle. This
 * makes the Cloudflare-generated thumbnail.jpg distinct and representative per
 * clip, with no manual upload. Used by both the agent and manual clip paths.
 */
export async function setClipThumbnail(uid: string, pct = 0.5): Promise<void> {
  const res = await cfFetch(`/${uid}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ thumbnailTimestampPct: pct }),
  })
  if (!res.ok) throw new Error(`set thumbnail failed: ${res.status} ${await res.text()}`)
}

/**
 * Kick off English caption generation on a freshly-created clip so it ships with
 * CC. Fire-and-forget: trigger generation, then one status check. Best-effort —
 * never throws (caption generation failing must not fail clip creation).
 * Returns the caption status after the single check ("inprogress" | "ready" |
 * "none" | "error").
 */
export async function triggerClipCaptions(uid: string): Promise<string> {
  try {
    await cfFetch(`/${uid}/captions/en/generate`, { method: "POST" })
    const statusRes = await cfFetch(`/${uid}/captions/en`)
    if (!statusRes.ok) return "none"
    const data = (await statusRes.json()) as { result?: { status?: string } }
    return data.result?.status ?? "inprogress"
  } catch {
    return "error"
  }
}

export interface ClipVideoRowInput {
  /** owner_id ?? creator_id of the source video — the clip is attributed to them. */
  creatorId: string
  title: string
  durationSecs: number
  cloudflareUid: string
  /** Creator-chosen watch price (USDC/sec). Defaults to 0 if omitted. */
  ratePerSec?: number
  /** Creator-chosen description. */
  description?: string
  /** Source video this clip was cut from (set for manual clips so the surfaces can group them). */
  clippedFrom?: string
  /** How the clip was created — 'agent' or 'manual'. Left unset (NULL) for legacy/agent rows. */
  clipOrigin?: "agent" | "manual"
}

/** Insert a videos row for a newly-created clip and return its id. */
export async function insertClipVideoRow(supabase: SupabaseClient, input: ClipVideoRowInput): Promise<string> {
  const row: Record<string, unknown> = {
    creator_id: input.creatorId,
    title: input.title,
    description: input.description ?? null,
    rate_per_sec: input.ratePerSec ?? 0,
    status: "live",
    duration_secs: input.durationSecs,
    cloudflare_uid: input.cloudflareUid,
    // Poster the card surfaces render. createCloudflareClip set thumbnailTimestampPct
    // to the clip midpoint, so this still is distinct/representative per clip.
    thumbnail_url: `https://videodelivery.net/${input.cloudflareUid}/thumbnails/thumbnail.jpg`,
    views: 0,
    total_earned: 0,
  }
  // Only set when provided so the agent path's rows are unchanged (NULL).
  if (input.clippedFrom) row.clipped_from = input.clippedFrom
  if (input.clipOrigin) row.clip_origin = input.clipOrigin

  const { data, error } = await supabase.from("videos").insert(row).select("id").single()
  if (error || !data) throw new Error(`clip video row insert failed: ${error?.message ?? "no row"}`)
  return data.id as string
}
