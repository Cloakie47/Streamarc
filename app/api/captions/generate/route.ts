import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { fetchUnifiedGatewayBalance } from "@/app/lib/gateway-balance"
import { isSubtitleLanguage, SUBTITLE_FEE_USDC } from "@/lib/captions/languages"
import { rateLimit } from "@/app/lib/rate-limit"

// Belt-and-suspenders: the heavy pipeline now runs in the worker, but this route
// still does a Circle balance read — give it plenty of headroom so nothing is
// killed at a platform default.
export const maxDuration = 300

// POST /api/captions/generate  Body: { video_id, language }
// ENQUEUE a caption generation. Returns immediately — the heavy work (English
// ensure -> translate -> upload -> wait-ready -> charge) runs in the worker so a
// long run can't be killed by a serverless timeout. The client polls
// /api/captions/status?job_id=... until ready. English is free; other languages
// cost $0.05 (charged in the worker ONLY after a confirmed-ready track).
// Idempotent: an already-generated language returns { status: "ready" } instantly.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rl = rateLimit(`captions:${session.user.id}`, 5, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many subtitle requests, try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
    }

    const { video_id, language } = await req.json()
    if (!video_id || typeof language !== "string" || !isSubtitleLanguage(language)) {
      return NextResponse.json({ error: "video_id and a supported language are required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: video } = await supabase
      .from("videos")
      .select("id, cloudflare_uid, captions_languages")
      .eq("id", video_id)
      .maybeSingle()
    if (!video?.cloudflare_uid) return NextResponse.json({ error: "video not found" }, { status: 404 })

    const current = Array.isArray(video.captions_languages) ? (video.captions_languages as string[]) : []

    // Idempotent: already generated — turn on instantly, no job, no charge.
    if (current.includes(language)) {
      return NextResponse.json({ status: "ready", alreadyExists: true, available: current })
    }

    // Dedupe: a job for this video+language is already in flight — return it.
    const { data: existing } = await supabase
      .from("caption_jobs")
      .select("id")
      .eq("video_id", video_id)
      .eq("language", language)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) return NextResponse.json({ status: "generating", job_id: existing.id })

    // Non-English is paid: reject up front (fast) if the requester can't pay, so
    // the user gets an immediate top-up prompt instead of a queued job that fails.
    if (language !== "en") {
      const { data: user } = await supabase
        .from("users")
        .select("wallet_address, circle_wallet_id")
        .eq("id", session.user.id)
        .single()
      if (!user?.wallet_address || !user?.circle_wallet_id) {
        return NextResponse.json({ error: "Connect a wallet to generate paid subtitles." }, { status: 400 })
      }
      const bal = await fetchUnifiedGatewayBalance(user.wallet_address as string)
      const arc = bal.chainBalances.find((b) => b.domain === 26)
      const spendable = arc ? parseFloat(arc.balance || "0") : 0
      if (spendable < SUBTITLE_FEE_USDC) {
        return NextResponse.json(
          { error: "Insufficient balance", insufficient: true, needed: SUBTITLE_FEE_USDC, balance: spendable },
          { status: 402 },
        )
      }
    }

    // Enqueue — the worker picks it up and processes it.
    const { data: job, error: jobErr } = await supabase
      .from("caption_jobs")
      .insert({ video_id, language, requester_id: session.user.id, status: "queued" })
      .select("id")
      .single()
    if (jobErr || !job) return NextResponse.json({ error: jobErr?.message ?? "Failed to queue generation" }, { status: 500 })

    return NextResponse.json({ status: "generating", job_id: job.id })
  } catch (err: any) {
    console.error("caption generate enqueue failed:", err?.message)
    return NextResponse.json({ error: err?.message ?? "Failed to start subtitle generation" }, { status: 500 })
  }
}
