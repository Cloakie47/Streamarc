import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const { creator_id } = await req.json()
    if (!creator_id) return NextResponse.json({ error: "creator_id required" }, { status: 400 })

    const supabase = getSupabaseAdmin()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [{ data: earnings }, { data: creatorVideos }] = await Promise.all([
      supabase
        .from("earnings")
        .select("net_amount, gross_amount, created_at")
        .eq("creator_id", creator_id),
      supabase
        .from("videos")
        .select("id")
        .eq("creator_id", creator_id),
    ])

    const videoIds = creatorVideos?.map((v) => v.id) ?? []

    const { data: sessions } =
      videoIds.length > 0
        ? await supabase
            .from("watch_sessions")
            .select("seconds_watched, viewer_id")
            .in("video_id", videoIds)
            .gt("seconds_watched", 0)
        : { data: [] }

    const total_earned = earnings?.reduce((sum, e) => sum + parseFloat(e.net_amount ?? 0), 0) ?? 0
    const today_earned = earnings
      ?.filter(e => new Date(e.created_at) >= today)
      ?.reduce((sum, e) => sum + parseFloat(e.net_amount ?? 0), 0) ?? 0

    const total_views = sessions?.length ?? 0
    const avg_watch_seconds = total_views > 0
      ? (sessions?.reduce((sum, s) => sum + (s.seconds_watched ?? 0), 0) ?? 0) / total_views
      : 0

    return NextResponse.json({ total_earned, today_earned, total_views, avg_watch_seconds })
  } catch (err: any) {
    console.error("Earnings fetch error:", err?.message)
    return NextResponse.json({ error: "Failed to fetch earnings" }, { status: 500 })
  }
}
