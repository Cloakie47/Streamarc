import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

type Supabase = ReturnType<typeof getSupabaseAdmin>

async function getWatchlisted(supabase: Supabase, user_id: string, video_id: string) {
  const { data } = await supabase
    .from("watchlist")
    .select("id")
    .eq("user_id", user_id)
    .eq("video_id", video_id)
    .maybeSingle()
  return !!data
}

async function getFavorited(supabase: Supabase, user_id: string, video_id: string) {
  const { data } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user_id)
    .eq("video_id", video_id)
    .maybeSingle()
  return !!data
}

async function getFollowingForVideo(supabase: Supabase, user_id: string, video_id: string) {
  const { data: video } = await supabase
    .from("videos")
    .select("creator_id")
    .eq("id", video_id)
    .single()
  const creatorId = video?.creator_id
  if (!creatorId || creatorId === user_id) return false
  const { data } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", user_id)
    .eq("following_id", creatorId)
    .maybeSingle()
  return !!data
}

async function getComments(supabase: Supabase, video_id: string) {
  const { data } = await supabase
    .from("comments")
    .select("id, content, created_at, user_id, users(display_name, channel_name, avatar_url)")
    .eq("video_id", video_id)
    .order("created_at", { ascending: false })
    .limit(50)
  return data ?? []
}

export async function POST(req: NextRequest) {
  try {
    const { video_id, user_id } = await req.json()
    if (!video_id) {
      return NextResponse.json({ error: "video_id required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (!user_id) {
      // Anonymous viewer: only public data
      const comments = await getComments(supabase, video_id)
      return NextResponse.json({
        watchlisted: false,
        favorited: false,
        following: false,
        comments,
      })
    }

    // Balance is deliberately NOT fetched here: it blocks on Circle/RPC and
    // would hold up comments + user state. The client fills it in async via
    // the dedicated /api/gateway/balance endpoint (timeout-bounded + cached).
    const [watchlisted, favorited, following, comments] = await Promise.all([
      getWatchlisted(supabase, user_id, video_id),
      getFavorited(supabase, user_id, video_id),
      getFollowingForVideo(supabase, user_id, video_id),
      getComments(supabase, video_id),
    ])

    return NextResponse.json({ watchlisted, favorited, following, comments })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Watch init failed:", message)
    return NextResponse.json({ error: "Watch init failed" }, { status: 500 })
  }
}
