import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { fetchUnifiedGatewayBalance } from "@/app/lib/gateway-balance"
import { isDubLanguage, DUB_PRICE_USDC, MAX_DUB_SECONDS } from "@/lib/dubs/languages"
import { rateLimit } from "@/app/lib/rate-limit"

// POST /api/dubs/generate  Body: { video_id, language }
// ENQUEUE an AI audio translation (TEST feature, videos <= MAX_DUB_SECONDS).
// Returns immediately — the heavy work (MP4 source -> ElevenLabs dub -> audio
// track upload -> wait-ready -> charge) runs in the worker. The client polls
// /api/dubs/status?job_id=... until ready. Costs DUB_PRICE_USDC, charged in
// the worker ONLY after a confirmed-ready track. Pay-once: an already-dubbed
// language returns { status: "ready" } instantly.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rl = rateLimit(`dubs:${session.user.id}`, 3, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many dub requests, try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
    }

    const { video_id, language } = await req.json()
    if (!video_id || typeof language !== "string" || !isDubLanguage(language)) {
      return NextResponse.json({ error: "video_id and a supported language are required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: video } = await supabase
      .from("videos")
      .select("id, cloudflare_uid, duration_secs, dubs_languages")
      .eq("id", video_id)
      .maybeSingle()
    if (!video?.cloudflare_uid) return NextResponse.json({ error: "video not found" }, { status: 404 })

    // Test-feature gate, enforced server-side (the UI disables the control too).
    const duration = Number(video.duration_secs)
    if (!(duration > 0) || duration > MAX_DUB_SECONDS) {
      return NextResponse.json(
        { error: `Audio translation is in testing. It's available for videos under ${Math.round(MAX_DUB_SECONDS / 60)} minutes.` },
        { status: 400 },
      )
    }

    const current = Array.isArray(video.dubs_languages) ? (video.dubs_languages as string[]) : []

    // Pay-once idempotency: already dubbed — available instantly, no job, no charge.
    if (current.includes(language)) {
      return NextResponse.json({ status: "ready", alreadyExists: true, available: current })
    }

    // Dedupe: a job for this video+language is already in flight — return it.
    const { data: existing } = await supabase
      .from("dub_jobs")
      .select("id")
      .eq("video_id", video_id)
      .eq("language", language)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) return NextResponse.json({ status: "generating", job_id: existing.id })

    // Paid feature: reject up front (fast) if the requester can't pay, so the
    // user gets an immediate top-up prompt instead of a queued job that fails.
    const { data: user } = await supabase
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", session.user.id)
      .single()
    if (!user?.wallet_address || !user?.circle_wallet_id) {
      return NextResponse.json({ error: "Connect a wallet to generate audio translations." }, { status: 400 })
    }
    const bal = await fetchUnifiedGatewayBalance(user.wallet_address as string)
    const arc = bal.chainBalances.find((b) => b.domain === 26)
    const spendable = arc ? parseFloat(arc.balance || "0") : 0
    if (spendable < DUB_PRICE_USDC) {
      return NextResponse.json(
        { error: "Insufficient balance", insufficient: true, needed: DUB_PRICE_USDC, balance: spendable },
        { status: 402 },
      )
    }

    // Enqueue — the worker picks it up and processes it.
    const { data: job, error: jobErr } = await supabase
      .from("dub_jobs")
      .insert({ video_id, language, requester_id: session.user.id, status: "queued" })
      .select("id")
      .single()
    if (jobErr || !job) return NextResponse.json({ error: jobErr?.message ?? "Failed to queue audio translation" }, { status: 500 })

    return NextResponse.json({ status: "generating", job_id: job.id })
  } catch (err) {
    console.error("dub generate enqueue failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to start audio translation" }, { status: 500 })
  }
}
