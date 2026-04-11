import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { video_id, chapters, user_id } = await req.json();

    if (!video_id || !chapters) {
      return NextResponse.json({ error: "video_id and chapters required" }, { status: 400 });
    }

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: row, error: fetchErr } = await supabase
      .from("videos")
      .select("creator_id")
      .eq("id", video_id)
      .single();

    if (fetchErr || !row) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (row.creator_id !== user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("videos")
      .update({ chapters: JSON.stringify(chapters) })
      .eq("id", video_id);

    if (error) {
      console.error("Save chapters DB error:", error.message);
      return NextResponse.json({ error: "Failed to save chapters" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Save chapters failed:", message);
    return NextResponse.json({ error: "Failed to save chapters" }, { status: 500 });
  }
}
