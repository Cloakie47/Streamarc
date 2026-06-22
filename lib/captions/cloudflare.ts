// lib/captions/cloudflare.ts
// Cloudflare Stream caption-track operations for the paid multi-language
// subtitles feature (full-video subtitles, separate from the agent's clip
// captions). English generation/source-VTT reuse lib/agent/transcript.ts;
// this module adds the cross-language list/status/upload the feature needs.
//
//   GET /accounts/{ACCT}/stream/{uid}/captions                  (list tracks)
//   GET /accounts/{ACCT}/stream/{uid}/captions/{lang}           (one track status)
//   PUT /accounts/{ACCT}/stream/{uid}/captions/{lang}           (upload .vtt — multipart)
//
// No payment and no database work here.

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const STREAM_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`

const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 120_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in env")
  }
  return { Authorization: `Bearer ${API_TOKEN}`, ...(extra ?? {}) }
}

export type CaptionState = "ready" | "inprogress" | "none"

interface CaptionTrack {
  language: string
  label?: string
  status?: string
  generated?: boolean
}

/** List the caption tracks Cloudflare currently holds for this video. */
export async function listCaptionTracks(uid: string): Promise<CaptionTrack[]> {
  const res = await fetch(`${STREAM_BASE}/${uid}/captions`, { headers: authHeaders() })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`caption list failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { result?: CaptionTrack[] }
  return Array.isArray(data.result) ? data.result : []
}

/** Delete the caption track for a language. Ignores 404 (nothing to delete). */
export async function deleteCaptionTrack(uid: string, lang: string): Promise<void> {
  const res = await fetch(`${STREAM_BASE}/${uid}/captions/${lang}`, { method: "DELETE", headers: authHeaders() })
  if (!res.ok && res.status !== 404) {
    throw new Error(`caption delete failed: ${res.status} ${await res.text()}`)
  }
}

/** Status of one language's caption track. "none" = not present. */
export async function getCaptionState(uid: string, lang: string): Promise<CaptionState> {
  const res = await fetch(`${STREAM_BASE}/${uid}/captions/${lang}`, { headers: authHeaders() })
  if (res.status === 404) return "none"
  if (!res.ok) throw new Error(`caption status check failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { result?: { status?: string } }
  const status = data.result?.status
  if (status === "ready") return "ready"
  if (status) return "inprogress"
  return "none"
}

/**
 * Upload a WebVTT caption file for `lang`. Cloudflare expects multipart/form-data
 * with a `file` field; the label is auto-generated from the language tag.
 */
export async function uploadCaptionVtt(uid: string, lang: string, vtt: string): Promise<void> {
  const form = new FormData()
  form.append("file", new Blob([vtt], { type: "text/vtt" }), `${lang}.vtt`)
  // Don't set Content-Type — fetch adds the multipart boundary itself.
  const res = await fetch(`${STREAM_BASE}/${uid}/captions/${lang}`, {
    method: "PUT",
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) throw new Error(`caption upload failed: ${res.status} ${await res.text()}`)
}

/** Poll until the given language's track is `ready` (uploaded tracks process quickly). */
export async function waitForCaptionReady(uid: string, lang: string): Promise<void> {
  const startedAt = Date.now()
  for (;;) {
    const state = await getCaptionState(uid, lang)
    if (state === "ready") return
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`caption ${lang} not ready within ${POLL_TIMEOUT_MS / 1000}s for ${uid}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
}
