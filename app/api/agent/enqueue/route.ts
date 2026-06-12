import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// POST /api/agent/enqueue
// Auth: header `x-agent-key` must equal env AGENT_API_KEY (server secret — NOT
// the viewer trust model). Body: { video_id, budget_usdc }. Inserts an
// agent_jobs row in status 'queued' and returns its id; the worker drains it.
export async function POST(req: NextRequest) {
  try {
    const expected = process.env.AGENT_API_KEY
    if (!expected) {
      return NextResponse.json({ error: "AGENT_API_KEY is not configured on the server" }, { status: 500 })
    }
    if (req.headers.get("x-agent-key") !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { video_id, budget_usdc, goal } = await req.json()
    if (!video_id || !(Number(budget_usdc) > 0)) {
      return NextResponse.json({ error: "video_id and a positive budget_usdc are required" }, { status: 400 })
    }

    // Optional creator goal for the clips; flows through to both analysis passes.
    const resolvedGoal = typeof goal === "string" && goal.trim() ? goal.trim().slice(0, 500) : "maximize viewer interest and shareability"

    const { data, error } = await getSupabaseAdmin()
      .from("agent_jobs")
      .insert({ video_id, budget_usdc: Number(budget_usdc), goal: resolvedGoal, status: "queued" })
      .select("id, status")
      .single()
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "failed to enqueue job" }, { status: 500 })
    }

    return NextResponse.json({ id: data.id, status: data.status })
  } catch (err: any) {
    console.error("agent enqueue failed:", err?.message)
    return NextResponse.json({ error: "enqueue failed" }, { status: 500 })
  }
}
