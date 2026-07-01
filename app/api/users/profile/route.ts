import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { getActingUser } from "@/app/lib/require-user";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("users")
      .select(
        "display_name, channel_name, bio, avatar_url, x_handle, reddit_handle, telegram_handle, is_whitelisted"
      )
      .eq("id", user_id)
      .single();

    return NextResponse.json(data ?? {});
  } catch (err: any) {
    console.error("Profile fetch failed:", err?.message);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // Only the AUTHENTICATED user can edit their own profile.
    const actor = await getActingUser();
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const user_id = actor.id;

    const {
      display_name,
      channel_name,
      bio,
      x_handle,
      reddit_handle,
      telegram_handle,
    } = await req.json();

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
