import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { admin_id } = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", admin_id)
      .single();

    if (!admin?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, display_name, channel_name, created_at, is_admin, is_whitelisted")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin users query:", error.message);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    return NextResponse.json({ users: users ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin users error:", message);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
