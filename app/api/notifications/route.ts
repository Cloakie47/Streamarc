import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { user_id, action, notification_id } = await req.json();
    if (!user_id || !action) {
      return NextResponse.json({ error: "user_id and action required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "list") {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, message, read, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(20);
      return NextResponse.json({ notifications: data ?? [] });
    }

    if (action === "mark_read") {
      await supabase.from("notifications").update({ read: true }).eq("user_id", user_id);
      return NextResponse.json({ success: true });
    }

    if (action === "mark_one_read") {
      if (!notification_id) {
        return NextResponse.json({ error: "notification_id required" }, { status: 400 });
      }
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notification_id)
        .eq("user_id", user_id);
      return NextResponse.json({ success: true });
    }

    if (action === "unread_count") {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("read", false);
      return NextResponse.json({ count: count ?? 0 });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Notifications error:", message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
