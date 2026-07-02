import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { isSpeechTooSparse, MIN_AI_CLIP_SECONDS } from "@/app/lib/clip-config"
import { rateLimit } from "@/app/lib/rate-limit"
import { withTimeout } from "@/app/lib/with-timeout"
import { measureSpeechDensity } from "@/lib/agent/transcript"

const NO_SPEECH_ERROR = "This video doesn't have enough speech for AI clipping — use manual clipping instead."

// Sane ceiling for a single clip job's budget cap (USDC). The agent only ever
// spends what it consumes per chunk; this just blocks fat-finger / abusive values.
const MAX_CLIP_BUDGET_USDC = 5

// POST /api/agent/enqueue-ui
// Browser-facing enqueue. Authenticates via the NextAuth session (NOT the
// AGENT_API_KEY secret, which must never reach the browser) and authorizes the
// caller as the video's owner (owner_id ?? creator_id) or an admin before
// inserting the agent_jobs row. The key-gated /api/agent/enqueue route is left
// untouched for server-to-server use.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const rl = rateLimit(`enqueue-ui:${session.user.id}`, 5, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many clip jobs, try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
    }

    const { video_id, budget_usdc, goal } = await req.json()
    const budget = Number(budget_usdc)
    if (!video_id || !Number.isFinite(budget) || budget <= 0) {
      return NextResponse.json({ error: "video_id and a positive budget_usdc are required" }, { status: 400 })
    }
    if (budget > MAX_CLIP_BUDGET_USDC) {
      return NextResponse.json({ error: `Budget too large — max is $${MAX_CLIP_BUDGET_USDC.toFixed(2)} per clip job` }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: video, error: videoErr } = await supabase
      .from("videos")
      .select("id, creator_id, owner_id, duration_secs, cloudflare_uid")
      .eq("id", video_id)
      .maybeSingle()
    if (videoErr) return NextResponse.json({ error: videoErr.message }, { status: 500 })
    if (!video) return NextResponse.json({ error: "video not found" }, { status: 404 })

    const ownerId = video.owner_id ?? video.creator_id
    const role = (session.user as { role?: string }).role
    if (session.user.id !== ownerId && role !== "admin") {
      return NextResponse.json({ error: "Only the video's owner can generate clips" }, { status: 403 })
    }

    // AI clipping is only for longer videos — never run the agent on a too-short
    // one (manual clipping has no minimum and is unaffected).
    const durationSecs = Number(video.duration_secs)
    if (!(durationSecs >= MIN_AI_CLIP_SECONDS)) {
      return NextResponse.json(
        { error: `AI clipping requires videos at least ${Math.round(MIN_AI_CLIP_SECONDS / 60)} minutes long — use manual clipping for shorter ones.` },
        { status: 400 },
      )
    }

    // Speech-density gate: the agent needs a transcript, so music/anime/silent
    // videos are rejected BEFORE a job (and any charge) exists. Prefer the
    // persisted measurement (pure DB read, written by the worker/this route);
    // fall back to one bounded VTT probe when the video already has an English
    // track. Unknown density passes through — the pipeline's own pre-check
    // still declines at $0 spend.
    let speechWps: number | null = null
    const { data: densityRow, error: densityErr } = await supabase
      .from("videos")
      .select("speech_wps")
      .eq("id", video_id)
      .maybeSingle() // separate query: tolerates the column not existing yet
    if (!densityErr && typeof (densityRow as { speech_wps?: number } | null)?.speech_wps === "number") {
      speechWps = Number((densityRow as { speech_wps: number }).speech_wps)
    }
    if (speechWps === null && video.cloudflare_uid) {
      const measured = await withTimeout(measureSpeechDensity(video.cloudflare_uid as string, durationSecs), 3000, null).catch(() => null)
      if (measured) {
        speechWps = measured.wordsPerSecond
        // Best effort persist so next time this is a pure DB read.
        await supabase.from("videos").update({ speech_wps: Number(measured.wordsPerSecond.toFixed(4)) }).eq("id", video_id)
      }
    }
    if (speechWps !== null && isSpeechTooSparse(speechWps * durationSecs, speechWps)) {
      return NextResponse.json({ error: NO_SPEECH_ERROR }, { status: 400 })
    }

    const resolvedGoal =
      typeof goal === "string" && goal.trim() ? goal.trim().slice(0, 500) : "maximize viewer interest and shareability"

    const { data, error } = await supabase
      .from("agent_jobs")
      .insert({ video_id, budget_usdc: Number(budget_usdc), goal: resolvedGoal, status: "queued" })
      .select("id, status")
      .single()
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "failed to enqueue job" }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, status: data.status })
  } catch (err: any) {
    console.error("agent enqueue-ui failed:", err?.message)
    return NextResponse.json({ error: "enqueue failed" }, { status: 500 })
  }
}
