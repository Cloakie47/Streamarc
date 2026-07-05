import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { isSpeechTooSparse, MIN_AI_CLIP_SECONDS, MAX_AI_CLIP_SECONDS, computeClipQuote } from "@/app/lib/clip-config"
import { rateLimit } from "@/app/lib/rate-limit"
import { withTimeout } from "@/app/lib/with-timeout"
import { measureSpeechDensity } from "@/lib/agent/transcript"

const NO_SPEECH_ERROR = "This video doesn't have enough speech for AI clipping. Use manual clipping instead."

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

    // Pricing is a COMPUTED quote now — any client-supplied budget is ignored.
    const { video_id, goal, keywords } = await req.json()
    if (!video_id) {
      return NextResponse.json({ error: "video_id is required" }, { status: 400 })
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

    // AI clipping length gates (manual clipping has no limits and is unaffected):
    // under 2 minutes and over 60 minutes are both unavailable.
    const durationSecs = Number(video.duration_secs)
    if (!(durationSecs >= MIN_AI_CLIP_SECONDS)) {
      return NextResponse.json(
        { error: `AI clipping requires videos at least ${Math.round(MIN_AI_CLIP_SECONDS / 60)} minutes long. Use manual clipping for shorter ones.` },
        { status: 400 },
      )
    }
    if (durationSecs > MAX_AI_CLIP_SECONDS) {
      return NextResponse.json(
        { error: "AI clipping supports videos up to 60 minutes during testing." },
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

    // Optional keyword focus: sanitized comma list, appended to the goal as a
    // parseable suffix (no schema change) — the pipeline strips it back out
    // and threads the keywords into brief/scoring as a bias.
    const cleanedKeywords =
      typeof keywords === "string"
        ? keywords
            .split(",")
            .map((k) => k.replace(/[\[\]]/g, "").trim())
            .filter(Boolean)
            .slice(0, 8)
            .map((k) => k.slice(0, 40))
            .join(", ")
        : ""
    const storedGoal = cleanedKeywords ? `${resolvedGoal}\n[keyword-focus: ${cleanedKeywords}]` : resolvedGoal

    // Server-authoritative quote: budget_usdc stores the MAX (the pipeline's
    // hard consumption cap = fee + skim + full footage allowance).
    const quote = computeClipQuote(durationSecs)

    const { data, error } = await supabase
      .from("agent_jobs")
      .insert({ video_id, budget_usdc: quote.max, goal: storedGoal, status: "queued" })
      .select("id, status")
      .single()
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "failed to enqueue job" }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, status: data.status, quote })
  } catch (err: any) {
    console.error("agent enqueue-ui failed:", err?.message)
    return NextResponse.json({ error: "enqueue failed" }, { status: 500 })
  }
}
