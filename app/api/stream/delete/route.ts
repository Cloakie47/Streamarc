import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { video_id, user_id } = await req.json();

    if (!video_id || !user_id) {
      return NextResponse.json({ error: "video_id and user_id required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Verify ownership
    const { data: video } = await supabase
      .from("videos")
      .select("id, creator_id, cloudflare_uid")
      .eq("id", video_id)
      .single();

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (video.creator_id !== user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete from Cloudflare Stream
    if (video.cloudflare_uid) {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${video.cloudflare_uid}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          },
        }
      );
      if (!cfRes.ok) {
        console.error("Cloudflare delete failed:", await cfRes.text());
      }
    }

    // Delete from DB
    await supabase.from("videos").delete().eq("id", video_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Delete video failed:", err?.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
