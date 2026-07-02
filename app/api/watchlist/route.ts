import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { user_id, video_id, action } = await req.json();

    if (!user_id || !action) {
      return NextResponse.json({ error: "user_id and action required" }, { status: 400 });
    }
    if (action !== "list" && action !== "ids" && !video_id) {
      return NextResponse.json({ error: "video_id required for this action" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "add") {
      await supabase.from("watchlist").upsert({ user_id, video_id });
      return NextResponse.json({ success: true, saved: true });
    }

    if (action === "remove") {
      await supabase.from("watchlist").delete().eq("user_id", user_id).eq("video_id", video_id);
      return NextResponse.json({ success: true, saved: false });
    }

    // Lightweight id-set for card grids: ONE request replaces the old
    // per-card "check" burst (N+1) on Browse/Explore.
    if (action === "ids") {
      const { data } = await supabase.from("watchlist").select("video_id").eq("user_id", user_id);
      return NextResponse.json({ video_ids: (data ?? []).map((r) => r.video_id) });
    }

    if (action === "check") {
      const { data } = await supabase
        .from("watchlist")
        .select("id")
        .eq("user_id", user_id)
        .eq("video_id", video_id)
        .maybeSingle();
      return NextResponse.json({ saved: !!data });
    }

    if (action === "list") {
      const { data: rows } = await supabase
        .from("watchlist")
        .select(
          "video_id, created_at, videos(id, title, duration_secs, rate_per_sec, views, cloudflare_uid, creator_id, thumbnail_url)",
        )
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });

      const list = rows ?? [];
      const creatorIds = [
        ...new Set(
          list
            .map((r) => {
              const v = r.videos as { creator_id?: string } | null;
              return v?.creator_id;
            })
            .filter((id): id is string => !!id),
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

      const videos = list.map((row) => {
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

      return NextResponse.json({ videos });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Watchlist error:", message);
    return NextResponse.json({ error: "Watchlist operation failed" }, { status: 500 });
  }
}
