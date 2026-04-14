import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { user_id, target_id, action } = await req.json();

    if (!user_id || !action) {
      return NextResponse.json({ error: "user_id and action required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "follow") {
      if (!target_id) {
        return NextResponse.json({ error: "target_id required" }, { status: 400 });
      }
      await supabase.from("follows").upsert({ follower_id: user_id, following_id: target_id });
      return NextResponse.json({ success: true, following: true });
    }

    if (action === "unfollow") {
      if (!target_id) {
        return NextResponse.json({ error: "target_id required" }, { status: 400 });
      }
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user_id)
        .eq("following_id", target_id);
      return NextResponse.json({ success: true, following: false });
    }

    if (action === "check") {
      if (!target_id) {
        return NextResponse.json({ error: "target_id required" }, { status: 400 });
      }
      const { data } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user_id)
        .eq("following_id", target_id)
        .maybeSingle();
      return NextResponse.json({ following: !!data });
    }

    if (action === "counts") {
      if (!target_id) {
        return NextResponse.json({ error: "target_id required" }, { status: 400 });
      }
      const [followers, following] = await Promise.all([
        supabase.from("follows").select("id", { count: "exact" }).eq("following_id", target_id),
        supabase.from("follows").select("id", { count: "exact" }).eq("follower_id", target_id),
      ]);
      return NextResponse.json({
        followers: followers.count ?? 0,
        following: following.count ?? 0,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Follows error:", message);
    return NextResponse.json({ error: "Follow operation failed" }, { status: 500 });
  }
}
