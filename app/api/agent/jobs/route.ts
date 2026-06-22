import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"

// GET /api/agent/jobs
// Read-only list of the caller's clip jobs (admins see all). One row per
// agent_jobs row: source video title, status, pending/approved clip counts, date.
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const supabase = getSupabaseAdmin()
    const role = (session.user as { role?: string }).role

    const jobSelect = "id, video_id, status, clips, created_at, updated_at"
    let jobRows: Array<{ id: string; video_id: string; status: string; clips: unknown; created_at: string }> = []

    if (role === "admin") {
      const { data, error } = await supabase.from("agent_jobs").select(jobSelect).order("created_at", { ascending: false }).limit(200)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      jobRows = (data ?? []) as typeof jobRows
    } else {
      // Jobs whose source video the caller owns (creator_id or owner_id).
      const { data: myVideos } = await supabase.from("videos").select("id").or(`creator_id.eq.${session.user.id},owner_id.eq.${session.user.id}`)
      const ids = (myVideos ?? []).map((v) => v.id)
      if (ids.length === 0) return NextResponse.json({ jobs: [] })
      const { data, error } = await supabase.from("agent_jobs").select(jobSelect).in("video_id", ids).order("created_at", { ascending: false }).limit(200)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      jobRows = (data ?? []) as typeof jobRows
    }

    const videoIds = Array.from(new Set(jobRows.map((j) => j.video_id).filter(Boolean)))
    const titleById = new Map<string, string>()
    if (videoIds.length > 0) {
      const { data: vids } = await supabase.from("videos").select("id, title").in("id", videoIds)
      for (const v of vids ?? []) titleById.set(v.id, v.title ?? "Untitled")
    }

    const jobs = jobRows.map((j) => {
      const clips = Array.isArray(j.clips) ? (j.clips as Array<{ status?: string }>) : []
      return {
        id: j.id,
        video_id: j.video_id,
        video_title: titleById.get(j.video_id) ?? "Untitled",
        status: j.status,
        pending_count: clips.filter((c) => c.status === "pending").length,
        approved_count: clips.filter((c) => c.status === "approved").length,
        total_clips: clips.length,
        created_at: j.created_at,
      }
    })

    return NextResponse.json({ jobs })
  } catch (err: any) {
    console.error("agent jobs fetch failed:", err?.message)
    return NextResponse.json({ error: "jobs fetch failed" }, { status: 500 })
  }
}
