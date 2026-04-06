import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const { video_id, cloudflare_uid } = await req.json()

    if (!video_id || !cloudflare_uid) {
      return NextResponse.json({ error: "video_id and cloudflare_uid required" }, { status: 400 })
    }

    // Check video status on Cloudflare
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${cloudflare_uid}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to check video status" }, { status: 500 })
    }

    const data = await response.json()
    const ready = data.result?.readyToStream
    const duration = data.result?.duration
    const thumbnail = data.result?.thumbnail

    if (ready) {
      // Update video status to live
      await getSupabaseAdmin()
        .from("videos")
        .update({
          status: "live",
          duration_secs: Math.round(duration ?? 0),
          thumbnail_url: thumbnail ?? null,
        })
        .eq("id", video_id)
    }

    return NextResponse.json({ ready, duration, thumbnail })
  } catch (err: any) {
    console.error("Video status check failed:", err?.message)
    return NextResponse.json({ error: "Status check failed" }, { status: 500 })
  }
}
