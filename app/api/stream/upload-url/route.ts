import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const { user_id, title, description, rate_per_sec } = await req.json()

    if (!user_id || !title) {
      return NextResponse.json({ error: "user_id and title required" }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("id")
      .eq("id", user_id)
      .single()

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get one-time upload URL from Cloudflare Stream
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds: 300,
          meta: { name: title },
          creator: user_id,
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error("Cloudflare Stream error:", err)
      return NextResponse.json({ error: "Failed to get upload URL" }, { status: 500 })
    }

    const data = await response.json()
    const uploadURL = data.result?.uploadURL
    const videoUID = data.result?.uid

    if (!uploadURL || !videoUID) {
      return NextResponse.json({ error: "Invalid response from Cloudflare" }, { status: 500 })
    }

    // Create video record in DB with processing status
    const { data: video } = await getSupabaseAdmin()
      .from("videos")
      .insert({
        creator_id: user_id,
        title,
        description: description ?? "",
        status: "processing",
        rate_per_sec: rate_per_sec ?? 0.00003,
        cloudflare_uid: videoUID,
        views: 0,
        total_earned: 0,
      })
      .select()
      .single()

    if (!video) {
      return NextResponse.json({ error: "Failed to create video record" }, { status: 500 })
    }

    return NextResponse.json({
      uploadURL,
      videoUID,
      videoId: video.id,
    })
  } catch (err: any) {
    console.error("Upload URL generation failed:", err?.message)
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 })
  }
}
