import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ status: null });

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("whitelist_requests")
      .select("status")
      .eq("user_id", user_id)
      .maybeSingle();

    return NextResponse.json({ status: data?.status ?? null });
  } catch {
    return NextResponse.json({ status: null });
  }
}
