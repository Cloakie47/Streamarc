import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { fetchUnifiedGatewayBalance } from "@/app/lib/gateway-balance"

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

async function getBalance(supabase: Supabase, user_id: string): Promise<number> {
  const { data: user } = await supabase
    .from("users")
    .select("wallet_address, circle_wallet_id")
    .eq("id", user_id)
    .single()

  if (!user?.wallet_address || !user?.circle_wallet_id) return 0

  // Settlement pulls from ARC domain 26 only, so the watch page should gate
  // and display the ARC-spendable amount, not the unified total.
  const result = await fetchUnifiedGatewayBalance(user.wallet_address as string)
  const arcChain = result.chainBalances.find((b) => b.domain === 26)
  return arcChain ? parseFloat(arcChain.balance || "0") : 0
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
        balance: 0,
      })
    }

    const [watchlisted, favorited, following, comments, balance] = await Promise.all([
      getWatchlisted(supabase, user_id, video_id),
      getFavorited(supabase, user_id, video_id),
      getFollowingForVideo(supabase, user_id, video_id),
      getComments(supabase, video_id),
      getBalance(supabase, user_id),
    ])

    return NextResponse.json({ watchlisted, favorited, following, comments, balance })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Watch init failed:", message)
    return NextResponse.json({ error: "Watch init failed" }, { status: 500 })
  }
}
