import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// GET /api/captions/status?job_id=...
// Poll target for the Subtitles control. Returns the job's status
// (queued | running | ready | failed), the charge/tx on success, any error, and
// the video's current available languages so the client can update in one call.
export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get("job_id")
    if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const { data: job } = await supabase
      .from("caption_jobs")
      .select("id, video_id, language, status, charged, circle_tx, error")
      .eq("id", jobId)
      .maybeSingle()
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })

    const { data: video } = await supabase.from("videos").select("captions_languages").eq("id", job.video_id).maybeSingle()
    const available = Array.isArray(video?.captions_languages) ? (video!.captions_languages as string[]) : []

    return NextResponse.json({
      status: job.status,
      language: job.language,
      charged: Number(job.charged ?? 0),
      tx: job.circle_tx ?? null,
      error: job.error ?? null,
      available,
    })
  } catch (err: any) {
    console.error("caption status failed:", err?.message)
    return NextResponse.json({ error: "status fetch failed" }, { status: 500 })
  }
}
