import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { getActingUser } from "@/app/lib/require-user"

// GET /api/agent/status?job_id=<uuid>
// Read-only job status + its decision_log, receipt, and clips. Scoped: only the
// job's video owner (the creator who ran it) or an admin may read it.
export async function GET(req: NextRequest) {
  try {
    const actor = await getActingUser()
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const jobId = new URL(req.url).searchParams.get("job_id")
    if (!jobId) {
      return NextResponse.json({ error: "job_id query param required" }, { status: 400 })
    }

    const { data, error } = await getSupabaseAdmin()
      .from("agent_jobs")
      .select("id, video_id, budget_usdc, goal, status, decision_log, receipt, clips, error, created_at, updated_at")
      .eq("id", jobId)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: "job not found" }, { status: 404 })
    }

    // Authorize: caller must own the job's source video (or be admin).
    const { data: video } = await getSupabaseAdmin().from("videos").select("creator_id, owner_id").eq("id", data.video_id).maybeSingle()
    const ownerId = video?.owner_id ?? video?.creator_id
    if (ownerId !== actor.id && actor.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error("agent status fetch failed:", err?.message)
    return NextResponse.json({ error: "status fetch failed" }, { status: 500 })
  }
}
