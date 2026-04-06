import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function PATCH(req: NextRequest) {
  try {
    const {
      user_id,
      display_name,
      channel_name,
      bio,
      x_handle,
      reddit_handle,
      telegram_handle,
    } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("users")
      .update({
        display_name,
        channel_name,
        bio,
        x_handle,
        reddit_handle,
        telegram_handle,
      })
      .eq("id", user_id);

    if (error) {
      console.error("Profile update failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Profile update failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
