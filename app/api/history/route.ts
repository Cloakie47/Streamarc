import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { user_id, action, video_id, seconds_watched, id: historyRowId } = await req.json();

    if (!user_id || !action) {
      return NextResponse.json({ error: "user_id and action required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "add") {
      if (!video_id) {
        return NextResponse.json({ error: "video_id required for add" }, { status: 400 });
      }
      await supabase.from("watch_history").insert({
        user_id,
        video_id,
        seconds_watched: seconds_watched ?? 0,
        watched_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    if (action === "list") {
      const { data: rows } = await supabase
        .from("watch_history")
        .select(
          "id, watched_at, seconds_watched, video_id, videos(id, title, duration_secs, rate_per_sec, views, cloudflare_uid, creator_id, thumbnail_url)",
        )
        .eq("user_id", user_id)
        .order("watched_at", { ascending: false })
        .limit(50);

      const list = rows ?? [];
      const creatorIds = [
        ...new Set(
          list
            .map((r) => {
              const raw = r.videos as
                | { creator_id?: string }
                | { creator_id?: string }[]
                | null;
              const v = Array.isArray(raw) ? raw[0] : raw;
              return v?.creator_id;
            })
            .filter((cid): cid is string => !!cid),
        ),
      ];

      const creatorById = new Map<
        string,
        { channel_name: string | null; display_name: string | null }
      >();
      if (creatorIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, channel_name, display_name")
          .in("id", creatorIds);
        users?.forEach((u) => {
          creatorById.set(u.id, {
            channel_name: u.channel_name ?? null,
            display_name: u.display_name ?? null,
          });
        });
      }

      type VideoRow = {
        id: string;
        title: string;
        duration_secs: number | null;
        rate_per_sec: number | null;
        views: number | null;
        cloudflare_uid: string | null;
        creator_id: string;
        thumbnail_url: string | null;
      };

      const history = list.map((row) => {
        const raw = row.videos as VideoRow | VideoRow[] | null;
        const v = Array.isArray(raw) ? raw[0] ?? null : raw;
        if (!v) {
          return { ...row, videos: null };
        }
        const c = creatorById.get(v.creator_id);
        return {
          ...row,
          videos: {
            ...v,
            creator: c
              ? { channel_name: c.channel_name, display_name: c.display_name }
              : null,
          },
        };
      });

      return NextResponse.json({ history });
    }

    if (action === "clear") {
      await supabase.from("watch_history").delete().eq("user_id", user_id);
      return NextResponse.json({ success: true });
    }

    if (action === "remove") {
      if (!historyRowId) {
        return NextResponse.json({ error: "id required for remove" }, { status: 400 });
      }
      await supabase
        .from("watch_history")
        .delete()
        .eq("id", historyRowId)
        .eq("user_id", user_id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("History error:", message);
    return NextResponse.json({ error: "History operation failed" }, { status: 500 });
  }
}
