import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { getActingUser } from "@/app/lib/require-user";

export async function POST(req: NextRequest) {
  try {
    // Actor = the AUTHENTICATED user; the owner check compares against this, not
    // a body-supplied user_id/admin_id (which an attacker sets to the real owner).
    const actor = await getActingUser();
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const actorId = actor.id;

    const { video_id } = await req.json();
    if (!video_id) {
      return NextResponse.json({ error: "video_id required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: video } = await supabase
      .from("videos")
      .select("id, creator_id, owner_id, cloudflare_uid")
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

    const ownerId = video.owner_id ?? video.creator_id;
    if (ownerId !== actorId && !adminCheck?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete from Cloudflare Stream. 404 = already gone, which is fine — the
    // DB cleanup below must still run so the row doesn't orphan.
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
      if (!cfRes.ok && cfRes.status !== 404) {
        console.error("Cloudflare delete failed:", cfRes.status, await cfRes.text());
      }
    }

    // Related records first (best effort per table — some may not exist yet or
    // hold no rows), so FK references can't block the row delete below.
    const related: Array<{ table: string; column: string }> = [
      { table: "watch_sessions", column: "video_id" },
      { table: "comments", column: "video_id" },
      { table: "favorites", column: "video_id" },
      { table: "watchlist", column: "video_id" },
      { table: "caption_jobs", column: "video_id" },
      { table: "dub_jobs", column: "video_id" },
      { table: "agent_jobs", column: "video_id" },
    ];
    for (const r of related) {
      const { error } = await supabase.from(r.table).delete().eq(r.column, video_id);
      if (error) console.warn(`[delete] related cleanup ${r.table} skipped:`, error.message);
    }

    // Delete the video row — surface failure instead of claiming success.
    const { error: deleteErr } = await supabase.from("videos").delete().eq("id", video_id);
    if (deleteErr) {
      console.error("Video row delete failed:", deleteErr.message);
      return NextResponse.json({ error: `Delete failed: ${deleteErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Delete video failed:", err?.message);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
