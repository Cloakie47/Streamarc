import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { user_id, project_name, description, twitter } = await req.json();
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("whitelist_requests")
      .select("id, status")
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error:
            existing.status === "pending"
              ? "You already have a pending request"
              : `Your request was ${existing.status}`,
        },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase.from("whitelist_requests").insert({
      user_id,
      project_name,
      description,
      twitter,
      status: "pending",
    });

    if (insertError) {
      console.error("Whitelist request insert:", insertError.message);
      return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Whitelist request error:", message);
    return NextResponse.json({ error: "Failed to submit request" }, { status: 500 });
  }
}
