import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { video_id, user_id, admin_id } = await req.json();
    const actorId = user_id ?? admin_id;

    if (!video_id || !actorId) {
      return NextResponse.json({ error: "video_id and user_id (or admin_id) required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: video } = await supabase
      .from("videos")
      .select("id, creator_id, cloudflare_uid")
      .eq("id", video_id)
      .single();

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const { data: adminCheck } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", actorId)
      .single();

    if (video.creator_id !== actorId && !adminCheck?.is_admin) {
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
