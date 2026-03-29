import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"

const ADMIN_USER_ID = "56917d75-3471-4d21-8bca-1010de7dbbc2"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || session.user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [usersRes, earningsRes, sessionsRes, sessionsCount] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id, email, wallet_address, circle_wallet_id, gateway_balance, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("earnings")
      .select("id, creator_id, gross_amount, platform_fee, net_amount, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("watch_sessions")
      .select("id, viewer_id, creator_id, video_id, seconds_watched, total_cost, settled, created_at")
      .eq("settled", true)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("watch_sessions")
      .select("id", { count: "exact" })
      .eq("settled", true),
  ])

  const totalPlatformFees =
    earningsRes.data?.reduce((sum, e) => sum + parseFloat(String(e.platform_fee ?? 0)), 0) ?? 0

  const totalGrossVolume =
    earningsRes.data?.reduce((sum, e) => sum + parseFloat(String(e.gross_amount ?? 0)), 0) ?? 0

  return NextResponse.json({
    users: usersRes.data ?? [],
    earnings: earningsRes.data ?? [],
    sessions: sessionsRes.data ?? [],
    stats: {
      total_users: usersRes.data?.length ?? 0,
      total_platform_fees: totalPlatformFees,
      total_gross_volume: totalGrossVolume,
      total_sessions: sessionsCount.count ?? 0,
    },
  })
}
