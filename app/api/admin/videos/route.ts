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

    const { data: videos, error } = await supabase
      .from("videos")
      .select("id, title, creator_id, views, status, created_at, users!creator_id(email, display_name, channel_name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin videos query:", error.message);
      return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
    }

    return NextResponse.json({ videos: videos ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin videos error:", message);
    return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 });
  }
}
