import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "live";
    const search = searchParams.get("search") ?? "";
    const creator_id = searchParams.get("creator_id");
    const category = searchParams.get("category") ?? "";

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("videos")
      .select(
        "id, title, description, duration_secs, rate_per_sec, views, created_at, cloudflare_uid, thumbnail_url, categories, creator_id, users!creator_id(id, display_name, channel_name, avatar_url)"
      )
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (creator_id) {
      query = query.eq("creator_id", creator_id);
    }

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    if (category && category !== "new-this-week") {
      query = query.contains("categories", [category]);
    }

    if (category === "new-this-week") {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("created_at", sevenDaysAgo);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ videos: data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { creator_id, title, description, cloudflare_uid, duration_secs } =
      body;

    const { data, error } = await getSupabaseAdmin()
      .from("videos")
      .insert({
        creator_id,
        title,
        description,
        cloudflare_uid,
        duration_secs,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ video: data });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
