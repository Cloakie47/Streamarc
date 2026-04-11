import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const { creator_id } = await req.json()
    if (!creator_id) return NextResponse.json({ error: "creator_id required" }, { status: 400 })

    const { data: dbVideos } = await getSupabaseAdmin()
      .from("videos")
      .select("id, title, created_at, status, views, total_earned, cloudflare_uid, chapters, duration_secs")
      .eq("creator_id", creator_id)
      .order("created_at", { ascending: false })

    const videoIds = dbVideos?.map(v => v.id) ?? []

    // Get avg watch time per video from settled sessions
    const { data: sessions } = videoIds.length > 0
      ? await getSupabaseAdmin()
          .from("watch_sessions")
          .select("video_id, seconds_watched")
          .in("video_id", videoIds)
          .eq("settled", true)
      : { data: [] }

    // Get net earnings per video
    const { data: earnings } = videoIds.length > 0
      ? await getSupabaseAdmin()
          .from("earnings")
          .select("video_id, net_amount")
          .eq("creator_id", creator_id)
          .in("video_id", videoIds)
      : { data: [] }

    const videos = (dbVideos ?? []).map(v => {
      const videoSessions = sessions?.filter(s => s.video_id === v.id) ?? []
      const videoEarnings = earnings?.filter(e => e.video_id === v.id) ?? []
      const avg_watch_seconds = videoSessions.length > 0
        ? videoSessions.reduce((sum, s) => sum + (s.seconds_watched ?? 0), 0) / videoSessions.length
        : 0
      const earned = videoEarnings.reduce((sum, e) => sum + parseFloat(e.net_amount ?? 0), 0)

      return {
        id: v.id,
        title: v.title,
        created_at: v.created_at,
        views: v.views ?? videoSessions.length,
        avg_watch_seconds,
        earned,
        status: v.status ?? "live",
        cloudflare_uid: v.cloudflare_uid ?? null,
        chapters: v.chapters ?? null,
        duration_secs: v.duration_secs ?? null,
      }
    })

    return NextResponse.json({ videos })
  } catch (err: any) {
    console.error("Videos fetch error:", err?.message)
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 })
  }
}
