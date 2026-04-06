import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("Cloudflare Stream webhook:", JSON.stringify(body));

    const uid = body?.uid;
    const readyToStream = body?.readyToStream;
    const duration = body?.duration;
    const thumbnail = body?.thumbnail;

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    if (readyToStream) {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("videos")
        .update({
          status: "live",
          duration_secs: Math.round(duration ?? 0),
          thumbnail_url: thumbnail ?? null,
        })
        .eq("cloudflare_uid", uid);

      console.log("Video marked live:", uid);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Webhook error:", err?.message);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
