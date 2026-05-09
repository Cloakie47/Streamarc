import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const { creator_id } = await req.json()
    if (!creator_id) return NextResponse.json({ error: "creator_id required" }, { status: 400 })

    const { data: dbVideos } = await getSupabaseAdmin()
      .from("videos")
      .select("id, title, created_at, status, views, total_earned, cloudflare_uid, chapters, duration_secs, accepts_offers, owner_id")
      .eq("creator_id", creator_id)
      .order("created_at", { ascending: false })

    // Fetch videos owned but not created by this user
    const { data: ownedVideos } = await getSupabaseAdmin()
      .from("videos")
      .select("id, title, created_at, status, views, total_earned, cloudflare_uid, chapters, duration_secs, accepts_offers, owner_id, original_creator_id, creator_id")
      .eq("owner_id", creator_id)
      .neq("creator_id", creator_id)
      .order("created_at", { ascending: false })

    const videoIds = dbVideos?.map(v => v.id) ?? []

    // Collect the "other party" user IDs for display:
    //   - For created+sold videos: the current owner (owner_id !== creator)
    //   - For purchased videos: the original creator (original_creator_id ?? creator_id)
    const otherPartyIds = new Set<string>()
    for (const v of dbVideos ?? []) {
      if (v.owner_id && v.owner_id !== creator_id) otherPartyIds.add(v.owner_id)
    }
    for (const v of ownedVideos ?? []) {
      const oc = v.original_creator_id ?? v.creator_id
      if (oc && oc !== creator_id) otherPartyIds.add(oc)
    }

    const { data: otherUsers } = otherPartyIds.size > 0
      ? await getSupabaseAdmin()
          .from("users")
          .select("id, display_name, channel_name")
          .in("id", Array.from(otherPartyIds))
      : { data: [] }

    const userMap = new Map<string, { display_name: string | null; channel_name: string | null }>()
    for (const u of otherUsers ?? []) {
      userMap.set(u.id, { display_name: u.display_name ?? null, channel_name: u.channel_name ?? null })
    }

    // Get avg watch time per video from settled sessions
    const { data: sessions } = videoIds.length > 0
      ? await getSupabaseAdmin()
          .from("watch_sessions")
          .select("video_id, seconds_watched")
          .in("video_id", videoIds)
          .gt("seconds_watched", 0)
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
        accepts_offers: v.accepts_offers ?? false,
        is_sold: v.owner_id !== null && v.owner_id !== creator_id,
        owner_id: v.owner_id ?? null,
        current_owner: v.owner_id && v.owner_id !== creator_id
          ? (userMap.get(v.owner_id) ?? null)
          : null,
      }
    })

    return NextResponse.json({
      videos,
      owned_videos: (ownedVideos ?? []).map(v => {
        const originalCreatorId = v.original_creator_id ?? v.creator_id
        return {
          id: v.id,
          title: v.title,
          created_at: v.created_at,
          views: v.views ?? 0,
          avg_watch_seconds: 0,
          earned: 0,
          status: v.status ?? "live",
          cloudflare_uid: v.cloudflare_uid ?? null,
          chapters: v.chapters ?? null,
          duration_secs: v.duration_secs ?? null,
          accepts_offers: v.accepts_offers ?? false,
          is_owned: true,
          original_creator: originalCreatorId && originalCreatorId !== creator_id
            ? (userMap.get(originalCreatorId) ?? null)
            : null,
        }
      }),
    })
  } catch (err: any) {
    console.error("Videos fetch error:", err?.message)
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 })
  }
}
