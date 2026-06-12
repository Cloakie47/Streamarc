import { NextResponse } from "next/server"
import { getAgentStats } from "@/app/lib/agent-stats"

// GET /api/agent/stats
// Aggregate view across all agent_jobs and the agent's own payment_batches.
// Logic lives in app/lib/agent-stats.ts so the public /agent page can reuse it.
export async function GET() {
  try {
    return NextResponse.json(await getAgentStats())
  } catch (err: any) {
    console.error("agent stats failed:", err?.message)
    return NextResponse.json({ error: "stats failed" }, { status: 500 })
  }
}
