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

    const { data: requests, error } = await supabase
      .from("whitelist_requests")
      .select(
        "id, user_id, project_name, description, twitter, status, created_at, users!user_id(email, display_name, channel_name)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin requests list:", error.message);
      return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
    }

    return NextResponse.json({ requests: requests ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin requests error:", message);
    return NextResponse.json({ error: "Failed to fetch requests" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { admin_id, request_id, status } = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", admin_id)
      .single();

    if (!admin?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("whitelist_requests")
      .update({ status })
      .eq("id", request_id);

    if (updateError) {
      console.error("Admin requests PATCH:", updateError.message);
      return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Admin requests PATCH error:", message);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}
