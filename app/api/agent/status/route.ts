import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// GET /api/agent/status?job_id=<uuid>
// Read-only job status + its decision_log, receipt, and clips.
export async function GET(req: NextRequest) {
  try {
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

    return NextResponse.json(data)
  } catch (err: any) {
    console.error("agent status fetch failed:", err?.message)
    return NextResponse.json({ error: "status fetch failed" }, { status: 500 })
  }
}
