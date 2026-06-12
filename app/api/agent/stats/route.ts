import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// GET /api/agent/stats
// Aggregate view across all agent_jobs and the agent's own payment_batches:
// payments made, settled USDC, average transaction size, budget utilization,
// cost per clip, distinct creators paid, and clips created.
//
// The agent's payments are the payment_batches whose viewer_id is the agent's
// users row. That row is keyed by its Phase 1 Circle wallet id.
const AGENT_CIRCLE_WALLET_ID = "6c9ba578-3d84-5614-a953-be512f179630"

const round6 = (n: number) => Number(n.toFixed(6))

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: agentUser } = await supabase
      .from("users")
      .select("id")
      .eq("circle_wallet_id", AGENT_CIRCLE_WALLET_ID)
      .maybeSingle()
    const agentId = agentUser?.id ?? null

    const [{ data: jobs }, batchesRes] = await Promise.all([
      supabase.from("agent_jobs").select("status, budget_usdc, clips, receipt"),
      agentId
        ? supabase.from("payment_batches").select("amount, creator_id").eq("viewer_id", agentId)
        : Promise.resolve({ data: [] as Array<{ amount: number | string | null; creator_id: string | null }> }),
    ])

    const batches = batchesRes.data ?? []
    const allJobs = jobs ?? []

    // --- Payments (from the agent's payment_batches) ---
    const paymentsMade = batches.length
    const totalSettled = batches.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
    const avgTransaction = paymentsMade > 0 ? totalSettled / paymentsMade : 0
    const distinctCreators = new Set(batches.map((b) => b.creator_id).filter(Boolean)).size

    // --- Clips + budget utilization (from agent_jobs receipts) ---
    let clipsCreated = 0
    let budgetWithReceipts = 0
    let paidWithReceipts = 0
    const statusCounts: Record<string, number> = {}
    for (const j of allJobs) {
      statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1
      if (Array.isArray(j.clips)) clipsCreated += j.clips.length
      const receipt = j.receipt as { budget_given?: number; total_paid?: number } | null
      if (receipt && typeof receipt.total_paid === "number") {
        budgetWithReceipts += Number(receipt.budget_given) || Number(j.budget_usdc) || 0
        paidWithReceipts += Number(receipt.total_paid) || 0
      }
    }

    const budgetUtilizationPct = budgetWithReceipts > 0 ? (paidWithReceipts / budgetWithReceipts) * 100 : 0
    const costPerClip = clipsCreated > 0 ? totalSettled / clipsCreated : 0

    return NextResponse.json({
      jobs_total: allJobs.length,
      jobs_by_status: statusCounts,
      payments_made: paymentsMade,
      total_settled_usdc: round6(totalSettled),
      average_transaction_usdc: round6(avgTransaction),
      budget_utilization_pct: Number(budgetUtilizationPct.toFixed(2)),
      clips_created: clipsCreated,
      cost_per_clip_usdc: round6(costPerClip),
      distinct_creators_paid: distinctCreators,
    })
  } catch (err: any) {
    console.error("agent stats failed:", err?.message)
    return NextResponse.json({ error: "stats failed" }, { status: 500 })
  }
}
