import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

// Source-of-truth category metadata used by the grouped endpoint.
// Ids match the values stored in `videos.categories[]`.
const CATEGORIES = [
  { id: "project-demo", label: "Project Demos", icon: "🏗️" },
  { id: "tutorial", label: "Tutorials", icon: "📚" },
  { id: "defi", label: "DeFi", icon: "🏦" },
  { id: "bridges", label: "Bridges & Cross-chain", icon: "🌉" },
  { id: "infrastructure", label: "Infrastructure", icon: "⚙️" },
  { id: "governance", label: "Governance", icon: "🗳️" },
  { id: "nft", label: "NFTs", icon: "🖼️" },
  { id: "ai-agents", label: "AI & Agents", icon: "🤖" },
  { id: "ama", label: "AMA", icon: "🎙️" },
  { id: "talks", label: "Talks & Panels", icon: "🎤" },
  { id: "irl", label: "IRL Moments", icon: "📍" },
  { id: "random", label: "Random", icon: "🎲" },
] as const;

const MAX_PER_CATEGORY = 8;
const NEW_WINDOW_DAYS = 7;

type VideoRow = {
  id: string;
  title: string;
  duration_secs: number | null;
  rate_per_sec: number | null;
  views: number | null;
  categories: string[] | null;
  created_at: string;
  cloudflare_uid: string | null;
  thumbnail_url: string | null;
  creator_id: string | null;
};

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("videos")
      .select(
        "id, title, duration_secs, rate_per_sec, views, categories, created_at, cloudflare_uid, thumbnail_url, creator_id",
      )
      .eq("status", "live")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("grouped videos query failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const videos = (data ?? []) as VideoRow[];

    const cutoff = Date.now() - NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const newThisWeek = videos
      .filter((v) => new Date(v.created_at).getTime() >= cutoff)
      .slice(0, MAX_PER_CATEGORY);

    const grouped: Record<
      string,
      { label: string; icon: string; videos: VideoRow[] }
    > = {};
    for (const cat of CATEGORIES) {
      const matched = videos
        .filter(
          (v) => Array.isArray(v.categories) && v.categories.includes(cat.id),
        )
        .slice(0, MAX_PER_CATEGORY);
      grouped[cat.id] = { label: cat.label, icon: cat.icon, videos: matched };
    }

    return NextResponse.json({
      categories: grouped,
      new_this_week: newThisWeek,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("grouped videos route failed:", message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
