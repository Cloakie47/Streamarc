import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"

// POST /api/agent/clips/discard
// Body: { job_id, index }
// Session-authed (owner of the source video, or admin). Marks the proposal
// discarded — nothing is created on Cloudflare.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const { job_id, index } = await req.json()
    if (!job_id || typeof index !== "number") {
      return NextResponse.json({ error: "job_id and numeric index are required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: job, error: jobErr } = await supabase.from("agent_jobs").select("id, video_id, clips").eq("id", job_id).maybeSingle()
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })

    const { data: video, error: videoErr } = await supabase
      .from("videos")
      .select("creator_id, owner_id")
      .eq("id", job.video_id)
      .maybeSingle()
    if (videoErr) return NextResponse.json({ error: videoErr.message }, { status: 500 })
    if (!video) return NextResponse.json({ error: "source video not found" }, { status: 404 })

    const ownerId = video.owner_id ?? video.creator_id
    const role = (session.user as { role?: string }).role
    if (session.user.id !== ownerId && role !== "admin") {
      return NextResponse.json({ error: "Only the video's owner can discard clips" }, { status: 403 })
    }

    const clips = (Array.isArray(job.clips) ? job.clips : []) as Array<Record<string, unknown>>
    const clip = clips[index]
    if (!clip) return NextResponse.json({ error: "clip not found at index" }, { status: 404 })
    if (clip.status === "approved") {
      return NextResponse.json({ error: "clip already approved/published" }, { status: 409 })
    }

    clips[index] = { ...clip, status: "discarded" }
    const { error: updErr } = await supabase.from("agent_jobs").update({ clips, updated_at: new Date().toISOString() }).eq("id", job_id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ status: "discarded" })
  } catch (err: any) {
    console.error("clip discard failed:", err?.message)
    return NextResponse.json({ error: err?.message ?? "discard failed" }, { status: 500 })
  }
}
