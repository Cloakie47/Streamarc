import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { MIN_AI_CLIP_SECONDS } from "@/app/lib/clip-config"

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

    const { video_id, budget_usdc, goal } = await req.json()
    if (!video_id || !(Number(budget_usdc) > 0)) {
      return NextResponse.json({ error: "video_id and a positive budget_usdc are required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: video, error: videoErr } = await supabase
      .from("videos")
      .select("id, creator_id, owner_id, duration_secs")
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
