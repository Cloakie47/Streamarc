import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { video_id, user_id, content, action, comment_id } = await req.json();

    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "add") {
      if (!video_id || !user_id || !content?.trim()) {
        return NextResponse.json({ error: "video_id, user_id and content required" }, { status: 400 });
      }

      const { data } = await supabase
        .from("comments")
        .insert({ video_id, user_id, content: content.trim() })
        .select("id, content, created_at, user_id, users(display_name, channel_name, avatar_url)")
        .single();

      return NextResponse.json({ success: true, comment: data });
    }

    if (action === "list") {
      if (!video_id) return NextResponse.json({ error: "video_id required" }, { status: 400 });

      const { data } = await supabase
        .from("comments")
        .select("id, content, created_at, user_id, users(display_name, channel_name, avatar_url)")
        .eq("video_id", video_id)
        .order("created_at", { ascending: false })
        .limit(50);

      return NextResponse.json({ comments: data ?? [] });
    }

    if (action === "update") {
      if (!comment_id || !user_id || !content?.trim()) {
        return NextResponse.json({ error: "comment_id, user_id and content required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("comments")
        .update({ content: content.trim() })
        .eq("id", comment_id)
        .eq("user_id", user_id)
        .select("id, content, created_at, user_id, users(display_name, channel_name, avatar_url)")
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Update failed" }, { status: 400 });
      }

      return NextResponse.json({ success: true, comment: data });
    }

    if (action === "delete") {
      if (!comment_id || !user_id) {
        return NextResponse.json({ error: "comment_id and user_id required" }, { status: 400 });
      }

      await supabase.from("comments").delete().eq("id", comment_id).eq("user_id", user_id);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Comments error:", message);
    return NextResponse.json({ error: "Comments operation failed" }, { status: 500 });
  }
}
