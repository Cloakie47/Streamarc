import { getSupabaseAdmin } from "./supabase-server"

// Aggregate stats for the Clip Agent, shared by GET /api/agent/stats and the
// public /agent page. The agent's payments are the payment_batches whose
// viewer_id is the agent's users row, keyed by its Phase 1 Circle wallet id.
const AGENT_CIRCLE_WALLET_ID = "6c9ba578-3d84-5614-a953-be512f179630"

const round6 = (n: number) => Number(n.toFixed(6))

export interface AgentStats {
  jobs_total: number
  jobs_by_status: Record<string, number>
  payments_made: number
  total_settled_usdc: number
  average_transaction_usdc: number
  budget_utilization_pct: number
  clips_created: number
  cost_per_clip_usdc: number
  distinct_creators_paid: number
  /** Total clip service fees collected by the platform (sum of 'consume' ledger rows). */
  total_service_fees_collected_usdc: number
  /** Total paid-subtitle translation fees collected (sum of caption_payments). */
  translation_fees_collected_usdc: number
}

export async function getAgentStats(): Promise<AgentStats> {
  const supabase = getSupabaseAdmin()

  const { data: agentUser } = await supabase.from("users").select("id").eq("circle_wallet_id", AGENT_CIRCLE_WALLET_ID).maybeSingle()
  const agentId = agentUser?.id ?? null

  const [{ data: jobs }, batchesRes, { data: clipFees }, { data: captionFees }] = await Promise.all([
    supabase.from("agent_jobs").select("status, budget_usdc, clips, receipt"),
    agentId
      ? supabase.from("payment_batches").select("amount, creator_id").eq("viewer_id", agentId)
      : Promise.resolve({ data: [] as Array<{ amount: number | string | null; creator_id: string | null }> }),
    // Clip service-fee ledger: 'consume' rows are the fees actually collected.
    supabase.from("clip_payments").select("amount").eq("direction", "consume"),
    // Paid-subtitle translation fees (every caption_payments row is a collected fee).
    supabase.from("caption_payments").select("amount"),
  ])

  const batches = batchesRes.data ?? []
  const allJobs = jobs ?? []
  const totalServiceFees = (clipFees ?? []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  const totalTranslationFees = (captionFees ?? []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  // Payments (the agent's payment_batches)
  const paymentsMade = batches.length
  const totalSettled = batches.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
  const avgTransaction = paymentsMade > 0 ? totalSettled / paymentsMade : 0
  const distinctCreators = new Set(batches.map((b) => b.creator_id).filter(Boolean)).size

  // Clips + budget utilization (agent_jobs receipts)
  let clipsCreated = 0
  let budgetWithReceipts = 0
  let paidWithReceipts = 0
  const statusCounts: Record<string, number> = {}
  for (const j of allJobs) {
    statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1
    if (Array.isArray(j.clips)) clipsCreated += (j.clips as Array<{ status?: string }>).filter((c) => c.status === "approved").length
    const receipt = j.receipt as { budget_given?: number; total_paid?: number } | null
    if (receipt && typeof receipt.total_paid === "number") {
      budgetWithReceipts += Number(receipt.budget_given) || Number(j.budget_usdc) || 0
      paidWithReceipts += Number(receipt.total_paid) || 0
    }
  }

  const budgetUtilizationPct = budgetWithReceipts > 0 ? (paidWithReceipts / budgetWithReceipts) * 100 : 0
  const costPerClip = clipsCreated > 0 ? totalSettled / clipsCreated : 0

  return {
    jobs_total: allJobs.length,
    jobs_by_status: statusCounts,
    payments_made: paymentsMade,
    total_settled_usdc: round6(totalSettled),
    average_transaction_usdc: round6(avgTransaction),
    budget_utilization_pct: Number(budgetUtilizationPct.toFixed(2)),
    clips_created: clipsCreated,
    cost_per_clip_usdc: round6(costPerClip),
    distinct_creators_paid: distinctCreators,
    total_service_fees_collected_usdc: round6(totalServiceFees),
    translation_fees_collected_usdc: round6(totalTranslationFees),
  }
}
