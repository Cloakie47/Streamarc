import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { createCloudflareClip, insertClipVideoRow, triggerClipCaptions } from "@/lib/agent/clip"
import { MAX_RATE_PER_SEC } from "@/app/lib/constants"

// POST /api/clips/manual
// Body: { video_id, title, description, rate_per_sec, start, end }
// Session-authed (owner of the source video, or admin). The creator hand-picks
// the segment — there is NO agent, NO analysis, NO per-second consumption and NO
// service fee. We just cut the creator's own footage via the SAME Cloudflare clip
// path the agent uses, publish a videos row (status 'live') tagged clip_origin
// 'manual', and kick off captions. The Cloudflare token stays server-side.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const { video_id, title, description, rate_per_sec, start, end } = await req.json()
    if (!video_id) return NextResponse.json({ error: "video_id is required" }, { status: 400 })

    const supabase = getSupabaseAdmin()

    const { data: video, error: videoErr } = await supabase
      .from("videos")
      .select("id, cloudflare_uid, creator_id, owner_id, duration_secs, rate_per_sec")
      .eq("id", video_id)
      .maybeSingle()
    if (videoErr) return NextResponse.json({ error: videoErr.message }, { status: 500 })
    if (!video?.cloudflare_uid) return NextResponse.json({ error: "source video not found" }, { status: 404 })

    const ownerId = video.owner_id ?? video.creator_id
    const role = (session.user as { role?: string }).role
    if (session.user.id !== ownerId && role !== "admin") {
      return NextResponse.json({ error: "Only the video's owner can clip it" }, { status: 403 })
    }

    // Manual clipping spans the WHOLE video — clamp to [0, duration]. Never trust
    // the client. Duration falls back generously if the source row lacks it.
    const sourceDuration = Number(video.duration_secs) > 0 ? Number(video.duration_secs) : Number(end)
    const s = Math.floor(Math.max(0, Math.min(Number(start), sourceDuration)))
    const e = Math.ceil(Math.min(sourceDuration, Math.max(Number(end), 0)))
    if (!(e > s)) return NextResponse.json({ error: "invalid start/end" }, { status: 400 })

    const finalTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 200) : "Clip"
    const finalDescription = typeof description === "string" ? description.trim().slice(0, 2000) : ""
    // Default to the source video's rate (same convention as agent clips).
    // Rate ceiling: 0 is allowed (free clip), anything above MAX_RATE_PER_SEC
    // is rejected; the source-rate fallback is clamped in case a legacy row
    // still exceeds the ceiling.
    const requestedRate = Number(rate_per_sec)
    if (rate_per_sec !== undefined && rate_per_sec !== null && (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > MAX_RATE_PER_SEC)) {
      return NextResponse.json({ error: `rate_per_sec must be between 0 and $${MAX_RATE_PER_SEC}/sec` }, { status: 400 })
    }
    const finalRate = Number.isFinite(requestedRate) && requestedRate >= 0
      ? requestedRate
      : Math.min(Number(video.rate_per_sec ?? 0), MAX_RATE_PER_SEC)

    // Create on Cloudflare (same path as the agent), then publish the videos row.
    const { uid, durationSecs } = await createCloudflareClip(video.cloudflare_uid, s, e)
    const videoRowId = await insertClipVideoRow(supabase, {
      creatorId: ownerId,
      title: finalTitle,
      description: finalDescription,
      ratePerSec: finalRate,
      durationSecs,
      cloudflareUid: uid,
      clippedFrom: video.id,
      clipOrigin: "manual",
    })
    await triggerClipCaptions(uid) // best-effort CC

    return NextResponse.json({ video_row_id: videoRowId, uid, status: "live" })
  } catch (err: any) {
    console.error("manual clip failed:", err?.message)
    return NextResponse.json({ error: err?.message ?? "manual clip failed" }, { status: 500 })
  }
}
