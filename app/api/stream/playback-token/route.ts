import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { getActingUser } from "@/app/lib/require-user"
import { rateLimit } from "@/app/lib/rate-limit"
import { withDeadline } from "@/app/lib/with-timeout"

// POST /api/stream/playback-token  Body: { video_id }
// Mints a short-lived Cloudflare Stream playback token for the video's uid.
// Why: after a caption is generated, the player must be remounted with URLs
// the browser has never cached. The bare-uid manifest is browser-cached for
// 10 minutes (max-age=600) and the iframe's own requests cannot be
// cache-busted from outside — but a signed token goes in the URL PATH
// ({token}/manifest/video.m3u8), so a token-mounted player always fetches a
// fresh manifest and sees the just-added caption track. Verified: token
// playback works for videos with requireSignedURLs=false.
export async function POST(req: NextRequest) {
  try {
    const actor = await getActingUser()
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const rl = rateLimit(`playback-token:${actor.id}`, 30, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
    }

    const { video_id } = await req.json()
    if (!video_id) return NextResponse.json({ error: "video_id required" }, { status: 400 })

    const { data: video } = await getSupabaseAdmin().from("videos").select("cloudflare_uid").eq("id", video_id).maybeSingle()
    if (!video?.cloudflare_uid) return NextResponse.json({ error: "video not found" }, { status: 404 })

    // 12h expiry: the token is validated on every manifest/segment request, so
    // it must comfortably outlast one viewing session (each caption remount
    // mints a fresh one anyway).
    const res = await withDeadline(
      fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${video.cloudflare_uid}/token`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 12 * 3600 }),
        },
      ),
      8000,
      "playback token mint",
    )
    if (!res.ok) {
      console.error("[playback-token] CF error:", res.status, await res.text().catch(() => ""))
      return NextResponse.json({ error: "token mint failed" }, { status: 502 })
    }
    const data = (await res.json()) as { result?: { token?: string } }
    const token = data?.result?.token
    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "token mint failed" }, { status: 502 })
    }
    return NextResponse.json({ token })
  } catch (err) {
    console.error("[playback-token] failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "token mint failed" }, { status: 500 })
  }
}
