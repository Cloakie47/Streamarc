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
      const { data: video } = await supabase
        .from("videos")
        .update({
          status: "live",
          duration_secs: Math.round(duration ?? 0),
          thumbnail_url: thumbnail ?? null,
        })
        .eq("cloudflare_uid", uid)
        .select("id")
        .single();

      console.log("Video marked live:", uid);

      // Trigger chapter generation
      fetch(`${process.env.NEXTAUTH_URL}/api/stream/generate-chapters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: video?.id, cloudflare_uid: uid }),
      }).catch((err: unknown) =>
        console.error("Chapter generation failed:", err instanceof Error ? err.message : err),
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Webhook error:", err?.message);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
