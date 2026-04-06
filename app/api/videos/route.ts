import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "live";
    const creator_id = searchParams.get("creator_id");

    let query = getSupabaseAdmin()
      .from("videos")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (creator_id) {
      query = query.eq("creator_id", creator_id);
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
