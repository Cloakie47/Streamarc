import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ is_admin: false });

    const { data } = await getSupabaseAdmin()
      .from("users")
      .select("is_admin")
      .eq("id", user_id)
      .single();

    return NextResponse.json({ is_admin: data?.is_admin ?? false });
  } catch {
    return NextResponse.json({ is_admin: false });
  }
}
