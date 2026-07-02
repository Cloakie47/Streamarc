import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { MAX_RATE_PER_SEC } from "@/app/lib/constants"

// Long-form ceiling (podcasts, AMAs, recorded Spaces). Was 300 (5 min).
const MAX_DURATION_SECONDS = 3600 // 1 hour

export async function POST(req: NextRequest) {
  try {
    const { user_id, title, description, rate_per_sec, categories, file_size } = await req.json()

    if (!user_id || !title) {
      return NextResponse.json({ error: "user_id and title required" }, { status: 400 })
    }

    // tus needs the total byte length up front to provision the upload.
    const uploadLength = Number(file_size)
    if (!Number.isFinite(uploadLength) || uploadLength <= 0) {
      return NextResponse.json({ error: "Valid file_size required" }, { status: 400 })
    }

    // Watch-rate ceiling, enforced SERVER-side (the UI cap is advisory only).
    // A rate must be a finite number, > 0, and <= MAX_RATE_PER_SEC.
    const rate = rate_per_sec === undefined || rate_per_sec === null ? 0.00003 : Number(rate_per_sec)
    if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_RATE_PER_SEC) {
      return NextResponse.json(
        { error: `rate_per_sec must be > 0 and at most $${MAX_RATE_PER_SEC}/sec` },
        { status: 400 },
      )
    }

    // Any signed-in user may upload — no creator whitelist/approval step.
    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("id")
      .eq("id", user_id)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Request a one-time tus (resumable) upload URL from Cloudflare Stream.
    // direct_user=true makes the returned Location URL usable directly by the
    // browser without exposing our API token. Video options (name, duration
    // cap, creator) ride along as tus headers/metadata instead of a JSON body.
    // Upload-Metadata is a comma-separated list of `key base64(value)` pairs.
    const uploadMetadata = [
      `name ${Buffer.from(String(title), "utf-8").toString("base64")}`,
      `maxDurationSeconds ${Buffer.from(String(MAX_DURATION_SECONDS), "utf-8").toString("base64")}`,
    ].join(",")

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(uploadLength),
          "Upload-Creator": String(user_id),
          "Upload-Metadata": uploadMetadata,
        },
      }
    )

    // tus creation succeeds with 201 Created (response.ok covers 2xx).
    if (!response.ok) {
      const err = await response.text()
      console.error("Cloudflare Stream tus create error:", response.status, err)
      return NextResponse.json({ error: "Failed to get upload URL" }, { status: 500 })
    }

    // The resumable upload URL is in the Location header; the video id is in
    // the stream-media-id header (not the response body).
    const uploadURL = response.headers.get("Location")
    const videoUID = response.headers.get("stream-media-id")

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
        rate_per_sec: rate,
        cloudflare_uid: videoUID,
        views: 0,
        total_earned: 0,
        categories: Array.isArray(categories) ? categories : [],
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
