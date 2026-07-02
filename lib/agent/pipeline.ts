// lib/agent/pipeline.ts
// The single Clip Agent pipeline shared by scripts/agent-run.ts and worker/
// index.ts (no duplication). One call runs the whole job:
//
//   transcript -> speech-density pre-check -> STRATEGY decision:
//     • SKIM (preferred): pay 10%-rate read access to the WHOLE transcript,
//       analyze every cue to find the most valuable moments across the entire
//       video, then buy those regions' footage at full rate. Analyzes 100% of
//       the video, not a ~10% probe sample.
//     • SAMPLING (low-budget fallback): the verified probe / re-probe / expand
//       path, unchanged.
//   -> final selection (semantic cuts) -> PROPOSE clips (pending review; nothing
//      is created on Cloudflare here) -> receipt. The creator approves/edits each
//      proposal in the UI, which then creates + publishes it (see clips/approve).
//
// Every decision is appended to a decision_log and streamed to an optional
// onLog callback (the worker persists a partial log if the job throws).
//
// PAYMENT MODEL (nanopayments, service fee — not a faucet): generating clips is
// a paid service. The CREATOR (owner_id ?? creator_id) is the paying customer.
// There is NO prepay/escrow and NO refund: the agent settles each consumed chunk
// (CHUNK_SECONDS) as its own REAL on-chain payment (creator -> PLATFORM) as it
// goes, so a job produces a stream of small settlements. `budget` is a SPEND CAP
// checked up front (balance must cover it) and never exceeded. Net to platform =
// seconds consumed × rate. NO 80/20 split, NO creator earnings row (the studio
// income query reads `earnings` only, so it is never miscounted). The human-
// viewer flow (settle-session / settlePerSecond) is untouched; this path uses
// settleServiceFee per chunk. Clips are inserted as the creator's own videos.

import { getTranscript, textForInterval, totalWords, type Segment } from "./transcript.ts"
import {
  scoreProbe,
  selectClips,
  findValuableMoments,
  generateEditorialBrief,
  selfCritique,
  type PurchasedRegion,
  type EditorialBrief,
  type ClipCritique,
} from "./analyze.ts"
import { settleServiceFee } from "../settle-core/index.ts"
import { fetchUnifiedGatewayBalance } from "../../app/lib/gateway-balance.ts"
import { getSupabaseAdmin } from "../../app/lib/supabase-server.ts"
import { MAX_RATE_PER_SEC } from "../../app/lib/constants.ts"

const DEFAULT_GOAL = "maximize viewer interest and shareability"
const ARC_DOMAIN = 26 // Circle Gateway domain for Arc — settlements pull from this balance

// --- Nanopayments: settle per chunk as the agent consumes ---
// Each consumed chunk is its own real on-chain settlement (creator -> platform),
// so a job produces a stream of small payments instead of one prepay + refund.
// Chunk size is ADAPTIVE per phase (skim vs footage): small/sub-cent when
// possible, but bounded so long videos don't fire ~100 settlements. See planChunk.
const MIN_CHUNK_SECONDS = 15 // never settle in pieces smaller than this
const TARGET_SETTLEMENTS = 20 // per-phase target count
const MAX_SETTLEMENTS = 40 // per-phase ceiling (planChunk grows chunks past sub-cent to stay <= this)
const SUBCENT_CAP = 0.008 // USD per-chunk ceiling we try to stay under (sub-cent)
const SETTLEMENT_HARD_CAP = MAX_SETTLEMENTS * 2 // job-wide runaway backstop (skim + footage phases)

// --- Two-tier consumption ---
const TRANSCRIPT_SKIM_FRACTION = 0.1 // reading the transcript costs 10% of the full per-second rate
const SKIM_MIN_FOOTAGE_SECONDS = 75 // skim is only chosen if at least this much footage is also affordable
const MOMENT_TARGET_SECONDS = 90 // footage region target around a valuable moment (hard clip cap is also 90)
const MOMENT_PAD_SECONDS = 8 // padding around a moment's reported range before capping
const MIN_FOOTAGE_SECONDS = 20 // don't buy a footage region smaller than the min clip length

// --- Sampling-fallback parameters (verified on the 48-min AMA) ---
const PROBE_SECONDS = 25
const MAX_PROBES = 6
const PROBE_BUDGET_FRACTION = 0.5
const INTRO_SKIP_SECONDS = 90
const PROBE_SCORE_THRESHOLD = 6
const TARGET_REGION_SECONDS = 75
const REPROBE_MIN_BUDGET_FRACTION = 0.4
const DIMINISHING_LOW_SCORE = 3
const DIMINISHING_STREAK = 3

// --- Shared ---
const MAX_STRONG_REGIONS = 3 // the "3 clips" stop condition
const EXTENSION_SECONDS = 15 // follow-the-thought / retry extension size
const MAX_EXTENSIONS_PER_REGION = 2
const SENTENCE_EDGE_TOLERANCE = 3
const RETRY_MIN_BUDGET = 0.05
const MIN_WORDS = 12 // speech-density floor
const MIN_WORDS_PER_SECOND = 0.2

export interface DecisionEntry {
  time: string
  action: string
  reason: string
  cost: number
  budget_remaining: number
}

/**
 * A clip the agent SELECTED but has NOT created on Cloudflare. It is written to
 * agent_jobs.clips as a pending proposal; the creator approves/edits each one in
 * the UI, and only then is it created on Cloudflare + published as a videos row.
 */
export interface PendingClip {
  /** pending → awaiting creator review; approved → created + published; discarded → never created. */
  status: "pending" | "approved" | "discarded"
  /** Selected clip bounds (seconds). The creator may nudge within [analyzed_start, analyzed_end]. */
  start: number
  end: number
  /** The purchased/analyzed region the clip sits in — nudge limits. */
  analyzed_start: number
  analyzed_end: number
  suggested_title: string
  hook: string
  confidence: number
  transcript_excerpt: string
  opening_words: string
  closing_words: string
  // --- set on approval ---
  video_row_id?: string
  /** Cloudflare clip uid (set on approval). */
  uid?: string
  /** Creator's final title/description/price (set on approval). */
  title?: string
  description?: string
  rate_per_sec?: number
}

export interface Receipt {
  strategy: "skim" | "sampling"
  goal: string
  budget_given: number
  /** Service fee charged to the creator (consumed seconds × rate), creator → platform. */
  service_fee_charged: number
  /** Unused budget refunded to the creator, platform → creator. */
  refunded: number
  /** Net the creator paid for the service (== service_fee_charged). */
  total_paid: number
  /** Spend split by tier: 10%-rate transcript read vs full-rate footage. */
  tier_breakdown: { skim_spend: number; footage_spend: number }
  seconds_bought: number
  windows: number
  moments_found: number
  /** Pass-1 editorial brief (skim strategy only; null for sampling). */
  editorial_brief: EditorialBrief | null
  /** Self-critique verdicts + any swap made before clip creation. */
  self_critique: { critiques: ClipCritique[]; swap: string | null } | null
  /** Settlement tx ids: [prepay (creator→platform), refund (platform→creator)]. */
  settlements: string[]
  /** Set when the job was declined because the creator's Gateway balance < budget. */
  insufficient_funds?: boolean
  /** Proposed clips (summary only — nothing is created until the creator approves). */
  proposed_clips: Array<{ range: string; title: string; confidence: number }>
  savings: number
  decision_count: number
}

export interface PipelineResult {
  /** true when the agent declined with zero/partial spend (sparse captions, no clip-worthy moment, unpriced video). */
  declined: boolean
  decisionLog: DecisionEntry[]
  /** Pending clip proposals (NOT yet created on Cloudflare). */
  clips: PendingClip[]
  receipt: Receipt
}

export interface RunClipAgentParams {
  videoId: string
  budgetUsdc: number
  /** agent_jobs row id, recorded on each clip_payments ledger row (null for CLI runs). */
  jobId?: string
  /** The creator's goal for these clips; flows into both analysis passes. */
  goal?: string
  /** Called for each decision as it happens (live logging / partial-log capture). */
  onLog?: (entry: DecisionEntry) => void
  /** Deprecated/ignored — clips are now proposed for creator review, never auto-created. */
  createClips?: boolean
}

interface Purchase {
  start: number
  end: number
  seconds: number
  cost: number
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const round6 = (n: number) => Number(n.toFixed(6))

/** Does this cue text end on a sentence terminator (allowing a trailing quote/bracket)? */
function endsSentence(text: string): boolean {
  return /[.!?…]["'”’)\]]?\s*$/.test(text.trim())
}

/** Merge overlapping/adjacent purchased intervals into contiguous regions with transcript. */
function mergeRegions(purchases: Purchase[], segments: Segment[]): PurchasedRegion[] {
  if (purchases.length === 0) return []
  const sorted = [...purchases].sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const p of sorted) {
    const last = merged[merged.length - 1]
    if (last && p.start <= last.end + 0.5) last.end = Math.max(last.end, p.end)
    else merged.push({ start: p.start, end: p.end })
  }
  return merged.map((r) => ({ start: r.start, end: r.end, transcript: textForInterval(segments, r.start, r.end) }))
}

/**
 * Run the full Clip Agent pipeline for one video + budget. Returns the decision
 * log, the clips created, and a receipt. Throws on hard errors (missing wallet,
 * unreachable Supabase, failed settlement); callers persist a terminal status.
 */
export async function runClipAgent(params: RunClipAgentParams): Promise<PipelineResult> {
  const { videoId, budgetUsdc: budget, onLog } = params
  const goal = (params.goal ?? "").trim() || DEFAULT_GOAL
  const jobId: string | null = params.jobId ?? null
  if (!videoId || !Number.isFinite(budget) || budget <= 0) {
    throw new Error("runClipAgent: videoId and a positive budgetUsdc are required")
  }

  const supabase = getSupabaseAdmin()

  // --- Running state ---
  const decisionLog: DecisionEntry[] = []
  let budgetRemaining = budget // remaining headroom under the spend CAP (not an escrow)
  let totalSpent = 0 // sum of per-chunk settlements actually made (creator -> platform)
  let skimSpend = 0
  const purchases: Purchase[] = [] // consumed windows (feed the regions)
  const securedRegions: Array<{ start: number; end: number; score: number }> = []
  let momentsFound = 0
  let strategyLabel: "skim" | "sampling" = "sampling"
  let editorialBrief: EditorialBrief | null = null
  let selfCritiqueResult: { critiques: ClipCritique[]; swap: string | null } | null = null
  // Nanopayment money flow: NO prepay/escrow. The agent settles each consumed
  // chunk as its own real on-chain payment (creator -> platform). `budget` is a
  // spend CAP; settlementTxs collects every chunk tx for the receipt/ledger.
  const settlementTxs: string[] = []
  let consumptionHalted = false // set if a chunk settlement fails mid-job (balance drift)
  let footageChunkSeconds: number | null = null // adaptive footage chunk, planned once on first buy
  let insufficientFunds = false

  function log(action: string, reason: string, cost = 0) {
    const entry: DecisionEntry = { time: new Date().toISOString(), action, reason, cost: round6(cost), budget_remaining: round6(budgetRemaining) }
    decisionLog.push(entry)
    onLog?.(entry)
  }

  // --- Load the video + resolve the CREATOR (owner_id ?? creator_id) — the paying customer ---
  const { data: video, error: videoErr } = await supabase
    .from("videos")
    .select("id, title, cloudflare_uid, rate_per_sec, duration_secs, creator_id, owner_id")
    .eq("id", videoId)
    .single()
  if (videoErr || !video) throw new Error(`video ${videoId} not found: ${videoErr?.message ?? "no row"}`)
  if (!video.cloudflare_uid) throw new Error(`video ${videoId} has no cloudflare_uid`)

  // Consumption-rate ceiling: even if a stored rate somehow exceeds the
  // platform max, the agent never charges above MAX_RATE_PER_SEC/sec. Both the
  // skim (10% of rate) and footage (full rate) derive from this capped value.
  // (Math.min keeps 0/NaN semantics — the rate>0 guard below still declines.)
  const rate = Math.min(Number(video.rate_per_sec), MAX_RATE_PER_SEC)
  const duration = Number(video.duration_secs)
  const creatorId: string | null = video.owner_id ?? video.creator_id
  if (!creatorId) throw new Error(`video ${videoId} has no creator_id/owner_id`)
  if (!(duration > 0)) throw new Error(`video ${videoId} has no positive duration_secs (${video.duration_secs})`)

  // The CREATOR is the payer — their Circle wallet funds the service fee. The
  // agent's pre-funded wallet is no longer involved in the money flow.
  const { data: creatorRow, error: creatorErr } = await supabase
    .from("users")
    .select("wallet_address, circle_wallet_id")
    .eq("id", creatorId)
    .maybeSingle()
  if (creatorErr) throw new Error(`creator lookup failed: ${creatorErr.message}`)
  if (!creatorRow?.wallet_address || !creatorRow?.circle_wallet_id) {
    throw new Error(`creator ${creatorId} has no Circle wallet (wallet_address/circle_wallet_id) to pay the service fee`)
  }

  // The platform is the service-fee RECIPIENT of every per-chunk settlement. It
  // no longer signs anything (no refund), so only its address is load-bearing;
  // PLATFORM_WALLET_ID is still required for config consistency.
  const platformWalletId = process.env.PLATFORM_WALLET_ID
  const platformAddress = process.env.PLATFORM_WALLET_ADDRESS
  if (!platformWalletId || !platformAddress) {
    throw new Error("PLATFORM_WALLET_ID and PLATFORM_WALLET_ADDRESS must be set (platform is the service-fee recipient)")
  }

  // Narrowed, non-null locals for the nested closures.
  const payerWalletId: string = creatorRow.circle_wallet_id
  const payerAddress: string = creatorRow.wallet_address
  const platformToAddress: string = platformAddress // settlement recipient (narrowed for closures)
  const videoIdResolved: string = video.id
  const videoTitle: string | undefined = video.title ?? undefined
  const recipientId: string = creatorId // clips are inserted as the creator's own videos
  const sourceCloudflareUid: string = video.cloudflare_uid

  log(
    "start",
    `clip service for "${videoTitle ?? videoIdResolved}" (${duration}s @ ${rate}/s) — creator ${creatorId.slice(0, 8)}… pays per chunk as consumed, up to a ${budget.toFixed(6)} USDC cap (no prepay)`,
    0,
  )

  // --- Receipt / finish helpers ---
  function buildReceipt(clips: PendingClip[]): Receipt {
    return {
      strategy: strategyLabel,
      goal,
      budget_given: round6(budget),
      service_fee_charged: round6(totalSpent),
      refunded: 0, // no prepay/refund — pay-as-consumed
      total_paid: round6(totalSpent),
      tier_breakdown: { skim_spend: round6(skimSpend), footage_spend: round6(totalSpent - skimSpend) },
      seconds_bought: purchases.reduce((n, p) => n + p.seconds, 0),
      windows: purchases.length,
      moments_found: momentsFound,
      editorial_brief: editorialBrief,
      self_critique: selfCritiqueResult,
      settlements: settlementTxs, // every per-chunk settlement (the nanopayment stream)
      insufficient_funds: insufficientFunds || undefined,
      proposed_clips: clips.map((c) => ({ range: `${fmt(c.start)}-${fmt(c.end)}`, title: c.suggested_title, confidence: c.confidence })),
      savings: 0,
      decision_count: decisionLog.length,
    }
  }

  // Build the receipt and finish. No refund: the creator only ever paid for the
  // chunks actually consumed (each its own settlement), so there is nothing to
  // return. Always reaches a terminal status, even if consumption halted early.
  async function finish(clips: PendingClip[], declined: boolean): Promise<PipelineResult> {
    log(
      "complete",
      `${clips.length} clip(s) proposed; charged creator ${totalSpent.toFixed(6)} across ${settlementTxs.length} per-chunk settlement(s) (cap ${budget.toFixed(6)})`,
      0,
    )
    const receipt = buildReceipt(clips)
    receipt.decision_count = decisionLog.length
    return { declined, decisionLog, clips, receipt }
  }

  // --- Service-fee ledger (queryable clip_payments rows) ---
  // Auditable record of the money flow, written with the service-role client.
  // This is NOT creator earnings — it is never written to the `earnings` table
  // (which the studio income query reads), so studio totals are unaffected.
  // Best-effort: a ledger insert failure is logged but never fails the job.
  // Every row is a 'consume' carrying the REAL on-chain tx of that chunk's
  // settlement (there is no prepay/refund anymore).
  async function recordClipPayment(direction: "consume", amount: number, circleTx: string | null) {
    const { error } = await supabase.from("clip_payments").insert({
      job_id: jobId,
      creator_id: recipientId,
      video_id: videoIdResolved,
      direction,
      amount,
      circle_tx: circleTx,
    })
    if (error) log("ledger-warn", `clip_payments insert (${direction}) failed: ${error.message}`, 0)
  }

  // --- Settle consumption as a STREAM of small per-chunk payments ---
  // Splits `totalSeconds` at `perSecRate` into CHUNK_SECONDS pieces and settles
  // each as its own real on-chain payment (creator → platform), recording a
  // 'consume' ledger row with the real tx. Honors the spend CAP (never settles
  // beyond `budget`) and stops cleanly if a settlement fails (balance drift) by
  // setting `consumptionHalted`. Returns the seconds actually settled.
  // Plan the chunk size for one settlement phase from its OWN rate + total
  // seconds: small (sub-cent) when possible, but bounded so the count stays
  // reasonable. (1) hit ~TARGET_SETTLEMENTS, (2) clamp to [MIN, sub-cent ceiling],
  // (3) fallback: if even a sub-cent chunk would exceed MAX_SETTLEMENTS, grow the
  // chunk past sub-cent so the count stays <= MAX_SETTLEMENTS.
  function planChunk(totalPhaseSeconds: number, perSecRate: number): { chunkSeconds: number; estCount: number } {
    const total = Math.max(1, Math.round(totalPhaseSeconds))
    const maxSecondsForSubcent = perSecRate > 0 ? SUBCENT_CAP / perSecRate : total
    const subcentCeil = Math.max(MIN_CHUNK_SECONDS, maxSecondsForSubcent)
    let chunk = Math.min(subcentCeil, Math.max(MIN_CHUNK_SECONDS, total / TARGET_SETTLEMENTS))
    if (Math.ceil(total / chunk) > MAX_SETTLEMENTS) chunk = total / MAX_SETTLEMENTS
    chunk = Math.max(MIN_CHUNK_SECONDS, Math.round(chunk))
    return { chunkSeconds: chunk, estCount: Math.max(1, Math.ceil(total / chunk)) }
  }

  async function settleChunks(totalSeconds: number, perSecRate: number, chunkSeconds: number, label: string, kind: "skim" | "footage"): Promise<number> {
    let consumed = 0
    while (consumed < totalSeconds) {
      if (consumptionHalted) break
      if (settlementTxs.length >= SETTLEMENT_HARD_CAP) {
        log("stop-budget", `reached settlement hard cap (${SETTLEMENT_HARD_CAP}) — stopping consumption`, 0)
        break
      }
      const chunkSecs = Math.min(chunkSeconds, totalSeconds - consumed)
      const chunkCost = chunkSecs * perSecRate
      if (!(chunkCost > 0)) break
      // Spend cap: never settle beyond the budget.
      if (totalSpent + chunkCost > budget + 1e-9) {
        log("stop-budget", `${label}: next ${chunkSecs}s chunk (${chunkCost.toFixed(6)}) would exceed budget cap ${budget.toFixed(6)} (spent ${totalSpent.toFixed(6)}) — stopping`, 0)
        break
      }
      let tx: string
      try {
        const r = await settleServiceFee({ payerWalletId, payerAddress, toAddress: platformToAddress, amountUsdc: chunkCost })
        tx = r.tx
      } catch (err) {
        consumptionHalted = true
        log("stop-balance", `${label}: chunk settlement of ${chunkCost.toFixed(6)} failed (${(err as Error)?.message ?? String(err)}) — stopping; ${consumed}s already settled this window`, 0)
        break
      }
      totalSpent += chunkCost
      budgetRemaining -= chunkCost
      if (kind === "skim") skimSpend += chunkCost
      settlementTxs.push(tx)
      consumed += chunkSecs
      log("settle-chunk", `${chunkSecs}s consumed, paid ${chunkCost.toFixed(6)} (tx ${tx.slice(0, 12)}…)`, chunkCost)
      await recordClipPayment("consume", chunkCost, tx)
    }
    return consumed
  }

  // --- Buy footage for [start, end), settling each CHUNK_SECONDS as its own
  // payment. Returns a Purchase covering the portion actually settled (which may
  // be shorter than requested if the cap/balance stopped it mid-window), or null
  // if nothing was consumed. No earnings row is ever written — the creator PAYS.
  async function buyWindow(rawStart: number, rawEnd: number, why: string): Promise<Purchase | null> {
    if (consumptionHalted) return null
    const start = Math.max(0, Math.min(duration, rawStart))
    const end = Math.max(0, Math.min(duration, rawEnd))
    const seconds = Math.round(end - start)
    if (seconds <= 0) return null

    // Plan footage chunking ONCE, from an estimate of total footage seconds for
    // the job (affordable seconds, capped to the realistic 3-region footage).
    if (footageChunkSeconds === null) {
      const footageBudget = Math.max(0, budget - totalSpent)
      const affordable = rate > 0 ? Math.floor(footageBudget / rate) : 0
      const estFootageSeconds = Math.max(seconds, Math.min(affordable, MAX_STRONG_REGIONS * MOMENT_TARGET_SECONDS))
      const plan = planChunk(estFootageSeconds, rate)
      footageChunkSeconds = plan.chunkSeconds
      log("chunk-plan", `(footage): ${footageChunkSeconds}s chunks, ~${plan.estCount} settlements`, 0)
    }

    const consumedSeconds = await settleChunks(seconds, rate, footageChunkSeconds, why, "footage")
    if (consumedSeconds <= 0) return null

    const purchase: Purchase = { start, end: start + consumedSeconds, seconds: consumedSeconds, cost: consumedSeconds * rate }
    purchases.push(purchase)
    return purchase
  }

  // --- Shared region helpers (used by both strategies) ---
  function thoughtContinuesAt(time: number, side: "start" | "end"): boolean {
    const straddling = segments.find((s) => s.start < time - 0.1 && s.end > time + 0.1)
    if (straddling) return true
    if (side === "end") {
      const near = segments.filter((s) => s.end <= time + 0.1 && s.end >= time - SENTENCE_EDGE_TOLERANCE).sort((a, b) => b.end - a.end)[0]
      if (!near) return false
      return !endsSentence(near.text)
    }
    const near = segments.filter((s) => s.start >= time - 0.1 && s.start <= time + SENTENCE_EDGE_TOLERANCE).sort((a, b) => a.start - b.start)[0]
    if (!near) return false
    const prev = segments.filter((s) => s.end <= near.start + 0.1).sort((a, b) => b.end - a.end)[0]
    if (!prev || near.start - prev.end > 1.5) return false
    return !endsSentence(prev.text)
  }

  // maxExtendSecs bounds how many seconds this region may BUY via extension, so
  // one region can't eat the budget reserved for other top moments.
  async function followThought(rs: number, re: number, score: number, maxExtendSecs: number): Promise<{ start: number; end: number }> {
    let start = rs
    let end = re
    let extended = 0
    const extCost = EXTENSION_SECONDS * rate
    for (let used = 0; used < MAX_EXTENSIONS_PER_REGION; ) {
      if (extended + EXTENSION_SECONDS > maxExtendSecs + 1e-9) {
        log("stop-extend", `region spend cap reached (~${Math.round(maxExtendSecs)}s of extension) — reserving budget for other top moments`, 0)
        break
      }
      if (end < duration && extCost <= budgetRemaining + 1e-9 && thoughtContinuesAt(end, "end")) {
        log("extend-region", `thought continues at ${fmt(end)} (end edge), buying +${EXTENSION_SECONDS}s`, 0)
        const p = await buyWindow(end, end + EXTENSION_SECONDS, `extend <${score}/10> end`)
        if (!p) break
        extended += p.seconds
        end = p.end
        used++
        continue
      }
      if (start > 0 && extCost <= budgetRemaining + 1e-9 && thoughtContinuesAt(start, "start")) {
        log("extend-region", `thought continues at ${fmt(start)} (start edge), buying +${EXTENSION_SECONDS}s`, 0)
        const p = await buyWindow(start - EXTENSION_SECONDS, start, `extend <${score}/10> start`)
        if (!p) break
        extended += p.seconds
        start = p.start
        used++
        continue
      }
      break
    }
    return { start, end }
  }

  // Buy a region around a seed (full rate) and follow the thought past its edges.
  // ownedSeed: an already-purchased core (probe window) to buy the gaps around;
  // null = buy the whole target (a fresh moment region).
  async function secureRegion(targetStart: number, targetEnd: number, score: number, ownedSeed: { start: number; end: number } | null, maxRegionSecs: number) {
    if (securedRegions.length >= MAX_STRONG_REGIONS) return
    // Measure how many seconds THIS region buys so the per-region cap is enforced
    // across the core buy + extensions (reserving budget for other top moments).
    const startIdx = purchases.length
    const regionSecs = () => purchases.slice(startIdx).reduce((n, p) => n + p.seconds, 0)
    if (ownedSeed) {
      if (ownedSeed.start - targetStart >= 1) await buyWindow(targetStart, ownedSeed.start, `expand <${score}/10>`)
      if (targetEnd - ownedSeed.end >= 1) await buyWindow(ownedSeed.end, targetEnd, `expand <${score}/10>`)
    } else {
      const bought = await buyWindow(targetStart, targetEnd, `footage <${score}/10>`)
      if (!bought) return
    }
    // Follow the thought from the ACTUAL contiguous owned interval (a gap-buy may
    // have been skipped), so we never extend a detached edge into an island.
    const center = (targetStart + targetEnd) / 2
    const ownedHere = mergeRegions(purchases, segments).find((r) => center >= r.start - 0.6 && center <= r.end + 0.6)
    if (!ownedHere) return
    const remainingForExtend = Math.max(0, maxRegionSecs - regionSecs())
    const grown = await followThought(ownedHere.start, ownedHere.end, score, remainingForExtend)
    securedRegions.push({ start: grown.start, end: grown.end, score })
  }

  // ============================ FUNDING + TRANSCRIPT ============================
  if (!(rate > 0)) {
    log("decline", `rate_per_sec is ${rate} — cannot price a clip job for a non-priced video`, 0)
    return await finish([], true)
  }

  // --- Funding check (before any money moves): the creator's Gateway balance
  // must cover the budget. If not, decline cleanly (the UI offers a top-up). ---
  const gateway = await fetchUnifiedGatewayBalance(payerAddress)
  const spendable = parseFloat(gateway.chainBalances.find((b) => b.domain === ARC_DOMAIN)?.balance ?? "0")
  if (spendable + 1e-9 < budget) {
    insufficientFunds = true
    log("insufficient-balance", `creator Gateway balance ${spendable.toFixed(6)} < budget ${budget.toFixed(6)} — insufficient balance, top up to run`, 0)
    return await finish([], true)
  }
  log("funding-ok", `creator Gateway balance ${spendable.toFixed(6)} covers the ${budget.toFixed(6)} budget`, 0)

  const segments: Segment[] = await getTranscript(sourceCloudflareUid)
  const words = totalWords(segments)
  const wordsPerSecond = words / duration
  log("transcript", `${segments.length} cues, ${words} words (${wordsPerSecond.toFixed(2)} words/sec over ${duration}s)`, 0)

  // ====================== SPEECH-DENSITY PRE-CHECK ======================
  if (words < MIN_WORDS || wordsPerSecond < MIN_WORDS_PER_SECOND) {
    log(
      "decline",
      `sparse captions (${words} words, ${wordsPerSecond.toFixed(2)} words/sec < ${MIN_WORDS_PER_SECOND}) — likely music/silent; declining with zero spend`,
      0,
    )
    return await finish([], true)
  }

  // ====================== STRATEGY (two-tier consumption) ======================
  const skimRate = rate * TRANSCRIPT_SKIM_FRACTION
  const skimCost = duration * skimRate
  const minFootageCost = SKIM_MIN_FOOTAGE_SECONDS * rate

  // --- SKIM strategy: pay full-transcript read access, analyze whole video, buy best moments ---
  async function runSkimStrategy() {
    // (a) pay read access to the whole transcript (at the 10% skim rate) BEFORE
    //     analyzing it — as a STREAM of small per-chunk settlements, not one payment.
    const skimSeconds = Math.round(duration)
    const skimPlan = planChunk(skimSeconds, skimRate)
    log("chunk-plan", `(skim): ${skimPlan.chunkSeconds}s chunks, ~${skimPlan.estCount} settlements`, 0)
    const skimmed = await settleChunks(skimSeconds, skimRate, skimPlan.chunkSeconds, "skim transcript read", "skim")
    if (skimmed <= 0) {
      log("skip-buy", `could not settle any transcript-read chunk (budget cap ${budget.toFixed(6)}, spent ${totalSpent.toFixed(6)}) — skipping skim`, 0)
      return
    }
    log("consume-skim", `read ${skimmed}/${skimSeconds}s transcript at ${Math.round(TRANSCRIPT_SKIM_FRACTION * 100)}% rate via ${Math.ceil(skimmed / skimPlan.chunkSeconds)} chunk settlement(s)`, 0)

    // (b) PASS 1 — editorial brief: define what "important" means for THIS video.
    editorialBrief = await generateEditorialBrief({ segments, durationSecs: duration, videoTitle, goal })
    log("editorial-brief", editorialBrief.summary, 0)

    // (c) PASS 2 — moment finding against the brief's criteria (chunked for long videos).
    const { moments, chunks } = await findValuableMoments({ segments, durationSecs: duration, videoTitle, goal, brief: editorialBrief })
    momentsFound = moments.length
    log("moments-analyzed", `analyzed ${chunks} chunk(s); found ${moments.length} candidate moment(s) against the brief`, 0)
    if (moments.length === 0) return
    for (const m of moments) log("moment-found", `${fmt(m.start)}–${fmt(m.end)} value ${m.score}/10 — ${m.what}${m.why ? ` (${m.why})` : ""}`, 0)

    // (d) buy footage for the best moments — HIGHEST value-score FIRST, spread
    // across DISTINCT moments. Cap each moment to ~1/MAX_STRONG_REGIONS of the
    // footage budget so the top ~3 moments each get footage, instead of one
    // cluster eating the whole budget via core+extension buys.
    const ranked = [...moments].sort((a, b) => b.score - a.score || a.start - b.start)
    const footageBudgetSecs = Math.floor((budgetRemaining + 1e-9) / rate)
    const perMomentCapSecs = Math.max(MIN_FOOTAGE_SECONDS, Math.floor(footageBudgetSecs / MAX_STRONG_REGIONS))
    const maxRegionSecs = Math.min(MOMENT_TARGET_SECONDS + MAX_EXTENSIONS_PER_REGION * EXTENSION_SECONDS, perMomentCapSecs)
    log("strategy", `footage budget ~${footageBudgetSecs}s — buying top moments first, capping each to ~${maxRegionSecs}s to spread across the best ${MAX_STRONG_REGIONS}`, 0)

    for (const m of ranked) {
      if (securedRegions.length >= MAX_STRONG_REGIONS) {
        log("stop-buying", `secured ${MAX_STRONG_REGIONS} regions (the 3-clip stop condition)`, 0)
        break
      }
      if (consumptionHalted) break
      const affordable = Math.floor((budgetRemaining + 1e-9) / rate)
      if (affordable < MIN_FOOTAGE_SECONDS) {
        log("stop-buying", `only ${affordable}s of footage affordable (< ${MIN_FOOTAGE_SECONDS}s min) — budget exhausted`, 0)
        break
      }
      // Spread across DISTINCT moments: skip one whose midpoint is already inside
      // a secured region (avoid spending a second region's budget on the same cluster).
      const mid = (m.start + m.end) / 2
      if (securedRegions.some((r) => mid >= r.start - 1 && mid <= r.end + 1)) {
        log("skip-buy", `moment ${fmt(m.start)} (${m.score}/10) overlaps a secured region — skipping to spread across distinct top moments`, 0)
        continue
      }
      // Anchor footage at the MOMENT's start (with a small lead so the selector's
      // opening words stay in-bounds), capped to the per-moment budget share;
      // followThought handles the tail within the same cap.
      const len = Math.min(MOMENT_TARGET_SECONDS, affordable, maxRegionSecs)
      let ts = Math.max(0, m.start - MOMENT_PAD_SECONDS)
      const te = Math.min(duration, ts + len)
      ts = Math.max(0, te - len)
      await secureRegion(ts, te, m.score, null, maxRegionSecs)
    }
  }

  // --- SAMPLING strategy (low-budget fallback): probe / re-probe / expand ---
  interface ScoredProbe extends Purchase {
    score: number
    reason: string
  }
  const scoredProbes: ScoredProbe[] = []

  async function runSamplingStrategy() {
    async function probeWindow(ws: number, we: number, label: string): Promise<number | null> {
      const purchase = await buyWindow(ws, we, label)
      if (!purchase) return null
      const text = textForInterval(segments, purchase.start, purchase.end)
      const { score, reason } = await scoreProbe({ windowStart: purchase.start, windowEnd: purchase.end, durationSecs: duration, text, videoTitle })
      scoredProbes.push({ ...purchase, score, reason })
      log("score-probe", `${fmt(purchase.start)}–${fmt(purchase.end)} scored ${score}/10 — ${reason}`, 0)
      return score
    }

    const probeBudget = budget * PROBE_BUDGET_FRACTION
    const usableStart = Math.min(INTRO_SKIP_SECONDS, duration * 0.1, Math.max(0, duration - PROBE_SECONDS))
    const usableDuration = Math.max(PROBE_SECONDS, duration - usableStart)
    const maxByBudget = Math.floor(probeBudget / (PROBE_SECONDS * rate))
    const maxByDuration = Math.floor(usableDuration / PROBE_SECONDS)
    const numProbes = Math.max(1, Math.min(MAX_PROBES, maxByBudget, maxByDuration))

    const plannedCenters: number[] = []
    for (let i = 0; i < numProbes; i++) plannedCenters.push(usableStart + ((i + 0.5) / numProbes) * usableDuration)

    log("plan-probes", `planned ${numProbes} probe(s) of ${PROBE_SECONDS}s across ${fmt(usableStart)}–${fmt(duration)} (skipping first ${Math.round(usableStart)}s); probe budget ~${probeBudget.toFixed(6)}`, 0)

    for (let i = 0; i < plannedCenters.length; i++) {
      const start = Math.max(usableStart, Math.min(duration - PROBE_SECONDS, plannedCenters[i] - PROBE_SECONDS / 2))
      await probeWindow(start, start + PROBE_SECONDS, `probe ${i + 1}/${numProbes}`)
    }

    let strong = scoredProbes.filter((p) => p.score >= PROBE_SCORE_THRESHOLD)
    if (strong.length === 0 && budgetRemaining >= budget * REPROBE_MIN_BUDGET_FRACTION) {
      log("re-probe", `planned pass found nothing >= ${PROBE_SCORE_THRESHOLD}/10, but ${((budgetRemaining / budget) * 100).toFixed(0)}% of budget remains — sampling unexplored midpoints`, 0)
      const reCenters: number[] = []
      for (let i = 0; i < plannedCenters.length - 1; i++) reCenters.push((plannedCenters[i] + plannedCenters[i + 1]) / 2)

      let lowStreak = 0
      for (let i = 0; i < reCenters.length; i++) {
        const start = Math.max(usableStart, Math.min(duration - PROBE_SECONDS, reCenters[i] - PROBE_SECONDS / 2))
        const score = await probeWindow(start, start + PROBE_SECONDS, `re-probe ${i + 1}/${reCenters.length}`)
        if (score === null) {
          log("stop-probing", "out of budget during re-probe", 0)
          break
        }
        lowStreak = score < DIMINISHING_LOW_SCORE ? lowStreak + 1 : 0
        if (lowStreak >= DIMINISHING_STREAK && i < reCenters.length - 1) {
          log("stop-probing", `${lowStreak} consecutive re-probes below ${DIMINISHING_LOW_SCORE}/10 — diminishing returns`, 0)
          break
        }
      }
      strong = scoredProbes.filter((p) => p.score >= PROBE_SCORE_THRESHOLD)
    }

    strong.sort((a, b) => b.score - a.score)
    // Same per-region budget cap as the skim path: don't let one expansion eat
    // the budget reserved for the other top probes.
    const samplingFootageSecs = Math.floor((budgetRemaining + 1e-9) / rate)
    const samplingPerRegionSecs = Math.max(MIN_FOOTAGE_SECONDS, Math.floor(samplingFootageSecs / MAX_STRONG_REGIONS))
    const samplingMaxRegionSecs = Math.min(TARGET_REGION_SECONDS + MAX_EXTENSIONS_PER_REGION * EXTENSION_SECONDS, samplingPerRegionSecs)
    for (const probe of strong) {
      if (securedRegions.length >= MAX_STRONG_REGIONS) {
        log("stop-expanding", `secured ${MAX_STRONG_REGIONS} strong regions (the 3-clip stop condition)`, 0)
        break
      }
      if (budgetRemaining < rate) {
        log("stop-expanding", "budget exhausted before finishing expansion", 0)
        break
      }
      const center = (probe.start + probe.end) / 2
      const targetStart = Math.max(0, center - TARGET_REGION_SECONDS / 2)
      const targetEnd = Math.min(duration, center + TARGET_REGION_SECONDS / 2)
      await secureRegion(targetStart, targetEnd, probe.score, { start: probe.start, end: probe.end }, samplingMaxRegionSecs)
    }
  }

  // No prepay/escrow: the up-front funding check above confirmed the balance
  // covers the budget cap; from here the agent settles each consumed chunk as
  // its own real payment (creator → platform) inside buyWindow / the skim.

  // --- Strategy decision (logged at preflight) ---
  if (budget >= skimCost + minFootageCost) {
    strategyLabel = "skim"
    log("strategy", `full-transcript skim affordable (${skimCost.toFixed(6)} skim + ~${minFootageCost.toFixed(6)} footage <= budget ${budget.toFixed(6)}) — skimming the whole transcript`, 0)
    await runSkimStrategy()
  } else {
    strategyLabel = "sampling"
    log("strategy", `budget too small for skim (need ${(skimCost + minFootageCost).toFixed(6)}, have ${budget.toFixed(6)}) — sampling via probes`, 0)
    await runSamplingStrategy()
  }

  // --- Nothing secured anywhere: conclude with 0 clips, skip the selection call ---
  if (securedRegions.length === 0) {
    const reason =
      strategyLabel === "skim"
        ? momentsFound === 0
          ? "whole-transcript analysis surfaced no valuable moments"
          : `found ${momentsFound} moment(s) but could not secure footage within budget`
        : `sampled ${scoredProbes.length} window(s); none scored >= ${PROBE_SCORE_THRESHOLD}/10`
    log("skip-final-select", `${reason} — concluding with 0 clips, returning ${(budget - totalSpent).toFixed(6)} unspent`, 0)
    return await finish([], true)
  }

  // --- Final selection: model proposes by exact opening/closing words, code cuts ---
  async function runSelection(phase: string) {
    const regions = mergeRegions(purchases, segments)
    log("final-select", `${phase}: selecting over ${regions.length} purchased region(s) with the selection model`, 0)
    const result = await selectClips({ regions, segments, durationSecs: duration, videoTitle, maxClips: MAX_STRONG_REGIONS, goal, brief: editorialBrief })

    if (result.noCandidatesReason) {
      log("no-candidates", result.noCandidatesReason, 0)
    } else {
      log("candidates", `selection model proposed ${result.candidates.length} candidate(s)`, 0)
      for (const v of result.verdicts) {
        const c = v.candidate
        if (v.accepted && v.clip) {
          if (v.snapNote) log("pause-snap", v.snapNote, 0)
          if (v.adjusted) log("cap-flex", v.adjusted, 0)
          log("accept-clip", `"${c.title}" ${fmt(v.clip.start)}–${fmt(v.clip.end)} (confidence ${Number(c.confidence).toFixed(2)}) — accepted`, 0)
        } else {
          log("reject-clip", `"${c.title}" — rejected: ${v.rule}`, 0)
        }
      }
    }
    return result.accepted
  }

  let selected = await runSelection("initial")

  // --- Retry before surrender: extend top regions once and re-select ---
  if (selected.length === 0 && budgetRemaining >= RETRY_MIN_BUDGET && securedRegions.length > 0) {
    log("retry-selection", `0 clips accepted with ${budgetRemaining.toFixed(6)} budget left — extending top region(s) +${EXTENSION_SECONDS}s each side and re-selecting once`, 0)
    const extCost = EXTENSION_SECONDS * rate
    for (const r of [...securedRegions].sort((a, b) => b.score - a.score).slice(0, MAX_STRONG_REGIONS)) {
      if (r.start > 0 && extCost <= budgetRemaining + 1e-9) await buyWindow(Math.max(0, r.start - EXTENSION_SECONDS), r.start, `retry-extend <${r.score}/10> start`)
      if (r.end < duration && extCost <= budgetRemaining + 1e-9) await buyWindow(r.end, Math.min(duration, r.end + EXTENSION_SECONDS), `retry-extend <${r.score}/10> end`)
    }
    selected = await runSelection("retry")
  }

  // --- Self-critique: verify each accepted clip; allow at most one swap ---
  if (selected.length > 0) {
    const crit = await selfCritique({ clips: selected, regions: mergeRegions(purchases, segments), segments, videoTitle, goal, brief: editorialBrief })
    selfCritiqueResult = { critiques: crit.critiques, swap: crit.swap }
    for (const v of crit.critiques) {
      // "no verdict" is the sentinel selfCritique uses when the model returned no
      // per-clip data (parse miss): the booleans are meaningless defaults, so don't
      // render them as ✗ failures. The critique is ADVISORY — it never gates
      // acceptance; only an explicit swap (below) changes selection.
      if (v.verdict === "no verdict") {
        log("self-critique", `"${v.title}": no usable verdict returned (advisory check skipped) — clip kept`, 0)
      } else {
        log(
          "self-critique",
          `"${v.title}": hook ${v.opens_on_hook ? "✓" : "✗"}, stands-alone ${v.stands_alone ? "✓" : "✗"}, complete ${v.ends_complete ? "✓" : "✗"}, single-topic ${v.single_topic ? "✓" : "✗"} — ${v.verdict}`,
          0,
        )
      }
    }
    if (crit.swap) log("self-critique-swap", crit.swap, 0)
    selected = crit.clips
  }

  // ============================ CLIP PROPOSALS (no Cloudflare yet) ============================
  // Do NOT create anything on Cloudflare here. Write pending proposals to the job;
  // the creator reviews/edits/prices each one in the UI, and ONLY THEN is it
  // created on Cloudflare + published (see /api/agent/clips/approve). Generation
  // was paid for already; publishing is free and the creator's choice.
  const regionsForBounds = mergeRegions(purchases, segments)
  const proposals: PendingClip[] = selected.map((clip) => {
    // Nudge limits = the purchased/analyzed region the clip sits in.
    const region = regionsForBounds.find((r) => clip.start >= r.start - 0.5 && clip.end <= r.end + 0.5)
    const analyzedStart = Math.max(0, Math.floor(region ? region.start : clip.start))
    const analyzedEnd = Math.min(Math.floor(duration), Math.ceil(region ? region.end : clip.end))
    return {
      status: "pending" as const,
      start: Math.max(0, Math.floor(clip.start)),
      end: Math.min(Math.floor(duration), Math.ceil(clip.end)),
      analyzed_start: analyzedStart,
      analyzed_end: analyzedEnd,
      suggested_title: clip.title,
      hook: clip.hook,
      confidence: clip.confidence,
      transcript_excerpt: textForInterval(segments, clip.start, clip.end).slice(0, 600),
      opening_words: clip.opening_words,
      closing_words: clip.closing_words,
    }
  })
  for (const p of proposals) {
    log("propose-clip", `"${p.suggested_title}" ${fmt(p.start)}–${fmt(p.end)} (confidence ${p.confidence.toFixed(2)}) — pending creator review`, 0)
  }

  return await finish(proposals, false)
}
