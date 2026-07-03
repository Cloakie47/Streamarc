import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// GET /api/dubs/list?video_id=...
// Public: returns the set of dubbed-audio languages already generated for a
// video, read from videos.dubs_languages (no Cloudflare call on watch loads).
export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("video_id")
    if (!videoId) return NextResponse.json({ error: "video_id required" }, { status: 400 })

    const { data: video } = await getSupabaseAdmin()
      .from("videos")
      .select("dubs_languages")
      .eq("id", videoId)
      .maybeSingle()

    const available = Array.isArray(video?.dubs_languages) ? (video!.dubs_languages as string[]) : []
    return NextResponse.json({ available })
  } catch (err) {
    console.error("dubs list failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Failed to load dubbed languages" }, { status: 500 })
  }
}
