import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// GET /api/captions/list?video_id=...
// Public: returns the set of subtitle languages already generated for a video,
// read from the videos.captions_languages column (so the UI knows what's
// available without hitting Cloudflare on every watch).
export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("video_id")
    if (!videoId) return NextResponse.json({ error: "video_id required" }, { status: 400 })

    const { data: video } = await getSupabaseAdmin()
      .from("videos")
      .select("captions_languages")
      .eq("id", videoId)
      .maybeSingle()

    const available = Array.isArray(video?.captions_languages) ? (video!.captions_languages as string[]) : []
    return NextResponse.json({ available })
  } catch (err: any) {
    console.error("captions list failed:", err?.message)
    return NextResponse.json({ error: "Failed to load subtitle languages" }, { status: 500 })
  }
}
