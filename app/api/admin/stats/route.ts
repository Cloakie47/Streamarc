import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { admin_id } = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", admin_id)
      .single();

    if (!admin?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const [usersCountRes, videosCountRes, earningsRes, sessionsRes, balanceRes] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase.from("videos").select("*", { count: "exact", head: true }),
      supabase.from("earnings").select("gross_amount, platform_fee, net_amount"),
      supabase.from("watch_sessions").select("seconds_watched"),
      fetch("https://gateway-api-testnet.circle.com/v1/balances?address=0xfa53779d7cb905489d84f1ab2da309624427cafa")
        .then((r) => r.json())
        .catch(() => null),
    ]);

    const earnings = earningsRes.data;
    const sessions = sessionsRes.data;

    const total_gross = earnings?.reduce((s, e) => s + parseFloat(String(e.gross_amount ?? 0)), 0) ?? 0;
    const total_platform_fees = earnings?.reduce((s, e) => s + parseFloat(String(e.platform_fee ?? 0)), 0) ?? 0;
    const total_creator_earnings = earnings?.reduce((s, e) => s + parseFloat(String(e.net_amount ?? 0)), 0) ?? 0;
    const total_watch_seconds =
      sessions?.reduce((s, e) => s + (Number((e as { seconds_watched?: number }).seconds_watched) || 0), 0) ?? 0;
    const platform_wallet_balance = parseFloat(
      String(
        (balanceRes as { balances?: { amount?: string }[] } | null)?.balances?.[0]?.amount ?? "0"
      )
    );

    return NextResponse.json({
      total_users: usersCountRes.count ?? 0,
      total_videos: videosCountRes.count ?? 0,
      total_watch_seconds,
      total_platform_fees,
      total_gross,
      total_creator_earnings,
      platform_wallet_balance,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin stats error:", message);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
