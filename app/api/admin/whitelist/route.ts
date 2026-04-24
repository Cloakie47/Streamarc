import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { createNotification } from "@/app/lib/notify";

export async function POST(req: NextRequest) {
  try {
    const { admin_id, user_id, is_whitelisted } = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", admin_id)
      .single();

    if (!admin?.is_admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await supabase
      .from("users")
      .update({ is_whitelisted })
      .eq("id", user_id);

    if (is_whitelisted) {
      await createNotification(
        user_id,
        "whitelist",
        "Creator access approved!",
        "You can now upload videos to StreamArc",
      );
    }

    return NextResponse.json({ success: true, is_whitelisted });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Whitelist error:", message);
    return NextResponse.json({ error: "Failed to update whitelist" }, { status: 500 });
  }
}
