// scripts/agent-run.ts
// Phase 2: the Clip Agent's transcript + decision loop, runnable directly so we
// can watch its real decisions before any queue/worker plumbing.
//
//   node scripts/agent-run.ts <videoId> <budgetUsdc>
//
// Flow:
//   1. Load the video (cloudflare_uid, rate_per_sec, duration_secs, creator).
//   2. Transcribe via Cloudflare captions (lib/agent/transcript).
//   3. Speech-density pre-check: decline with ZERO spend on music/silent video.
//   4. Decision loop:
//        - pre-flight: whole-video cost vs budget.
//        - planned probe pass: 25s windows (skipping the first ~90s of intro),
//          ~half the budget, evenly spread; PAY each window via settle-core
//          BEFORE scoring it with claude-haiku-4-5. The planned pass always runs
//          to completion (no early-stop — it is already budgeted).
//        - re-probe: if nothing cleared the bar but >= 40% of budget remains,
//          sample the unexplored midpoints before concluding 0 clips.
//          Diminishing-returns (3 consecutive low) only stops this extra pass.
//        - expand high-scoring regions to ~75s (pay before consuming), then
//          "follow the thought": buy +15s extensions on any edge that cuts
//          mid-sentence (up to 2 per region) within budget.
//        - final selection with claude-sonnet-4-6: the model proposes ranked
//          candidates (confidence + reasoning); the CODE applies the rules
//          (single region, 20-60s, snapped to sentence boundaries) and logs an
//          accept/reject verdict per candidate. Skipped when no region cleared
//          the threshold. If 0 clips are accepted and budget remains, extend the
//          top regions once and re-select before concluding.
//   5. Print the full decision_log + selected clips + a summary line.
//
// Payments reuse the verified Phase 1 path exactly (lib/settle-core) and record
// payment_batches + earnings the way scripts/test-settle.ts does, with the
// owner_id ?? creator_id resale resolution and one idempotency key per window.
// This script SELECTS clips and logs decisions only — it does NOT create
// Cloudflare clips (that is Phase 3).

import "../lib/agent/env.ts"
import { randomUUID } from "node:crypto"
import { createGatewayWallet } from "../lib/agent/wallet.ts"
import { getTranscript, textForInterval, totalWords, type Segment } from "../lib/agent/transcript.ts"
import { scoreProbe, selectClips, type PurchasedRegion, type SelectedClip } from "../lib/agent/analyze.ts"
import { settlePerSecond } from "../lib/settle-core/index.ts"
import { getSupabaseAdmin } from "../app/lib/supabase-server.ts"

const AGENT_REF = "clip-agent-001"

// --- Tunable decision-loop parameters ---
// Probe windows are 25s, not 8s: an 8s fragment of conversation always reads as
// an "incomplete thought" and scores low regardless of content — the window
// size was being scored, not the moment. 25s holds a complete thought and gives
// the scorer real signal.
const PROBE_SECONDS = 25 // length of each probe window
const MAX_PROBES = 6
const PROBE_BUDGET_FRACTION = 0.5 // initial planned probes use ~half the budget
const INTRO_SKIP_SECONDS = 90 // skip the first 90s (intros/housekeeping rarely clip well)
const PROBE_SCORE_THRESHOLD = 6 // >= this (0-10) is "clip-worthy" and worth expanding
const TARGET_REGION_SECONDS = 75 // grow a strong probe to ~this many contiguous seconds (25s probe + ~25s each side)
const MAX_STRONG_REGIONS = 3 // stop securing regions after this many (the "3 clips" stop condition)
const EXTENSION_SECONDS = 15 // "follow the thought": buy this much more when an edge cuts mid-sentence
const MAX_EXTENSIONS_PER_REGION = 2 // cap follow-the-thought growth per region
const SENTENCE_EDGE_TOLERANCE = 3 // a sentence must END within this many seconds of the edge, else it's mid-thought
const RETRY_MIN_BUDGET = 0.05 // if selection yields 0 clips, extend + re-select once when at least this much budget remains
const REPROBE_MIN_BUDGET_FRACTION = 0.4 // re-probe only if >= this fraction of budget is still unspent
const DIMINISHING_LOW_SCORE = 3 // probes scoring below this count toward "diminishing returns"
const DIMINISHING_STREAK = 3 // this many consecutive low re-probes ends ADDITIONAL probing
const MIN_WORDS = 12 // speech-density floor (below this → decline)
const MIN_WORDS_PER_SECOND = 0.2 // speech-density floor

interface DecisionEntry {
  time: string
  action: string
  reason: string
  cost: number
  budget_remaining: number
}

interface Purchase {
  start: number
  end: number
  seconds: number
  cost: number
  idempotencyKey: string
  creatorTx: string
  platformTx: string | null
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Does this cue text end on a sentence terminator (allowing a trailing quote/bracket)? */
function endsSentence(text: string): boolean {
  return /[.!?…]["'”’)\]]?\s*$/.test(text.trim())
}

async function main() {
  const videoId = process.argv[2]
  const budget = Number(process.argv[3])

  if (!videoId || !Number.isFinite(budget) || budget <= 0) {
    throw new Error("Usage: node scripts/agent-run.ts <videoId> <budgetUsdc>  (budget must be a positive number)")
  }

  const supabase = getSupabaseAdmin()

  // --- Agent payer identity (Phase 1 wallet + users row) ---
  const wallet = await createGatewayWallet(AGENT_REF)
  if (!wallet) throw new Error("Agent Circle wallet not found — run agent-setup first")

  const { data: agentUser, error: agentErr } = await supabase
    .from("users")
    .select("id")
    .eq("circle_wallet_id", wallet.id)
    .maybeSingle()
  if (agentErr) throw new Error(`agent users lookup failed: ${agentErr.message}`)
  if (!agentUser?.id) throw new Error("Agent users row not found — run agent-setup first")
  const viewerId: string = agentUser.id

  // --- Load the video + resolve the earnings recipient (owner_id ?? creator_id) ---
  const { data: video, error: videoErr } = await supabase
    .from("videos")
    .select("id, title, cloudflare_uid, rate_per_sec, duration_secs, creator_id, owner_id")
    .eq("id", videoId)
    .single()
  if (videoErr || !video) throw new Error(`video ${videoId} not found: ${videoErr?.message ?? "no row"}`)
  if (!video.cloudflare_uid) throw new Error(`video ${videoId} has no cloudflare_uid`)

  const rate = Number(video.rate_per_sec)
  const duration = Number(video.duration_secs)
  const earningsRecipientId: string | null = video.owner_id ?? video.creator_id
  if (!earningsRecipientId) throw new Error(`video ${videoId} has no creator_id/owner_id to pay`)
  if (!(duration > 0)) throw new Error(`video ${videoId} has no positive duration_secs (${video.duration_secs})`)

  const { data: recipient, error: recipientErr } = await supabase
    .from("users")
    .select("wallet_address")
    .eq("id", earningsRecipientId)
    .maybeSingle()
  if (recipientErr) throw new Error(`earnings recipient lookup failed: ${recipientErr.message}`)
  const creatorAddress: string | undefined = recipient?.wallet_address ?? undefined
  if (!creatorAddress) throw new Error(`earnings recipient ${earningsRecipientId} has no wallet_address to receive payment`)

  // Narrowed, non-null locals so the nested closures (buyWindow / recordPurchase)
  // keep the guarantees the guards above just established.
  const payerWalletId: string = wallet.id
  const payerAddress: string = wallet.address
  const creatorWallet: string = creatorAddress
  const videoIdResolved: string = video.id
  const videoTitle: string | undefined = video.title ?? undefined
  const recipientId: string = earningsRecipientId

  console.log("Clip Agent run:")
  console.log(
    JSON.stringify(
      {
        videoId: video.id,
        title: video.title,
        cloudflare_uid: video.cloudflare_uid,
        durationSecs: duration,
        ratePerSec: rate,
        budgetUsdc: budget,
        payerAddress: wallet.address,
        creatorAddress,
        earningsRecipientId,
      },
      null,
      2,
    ),
  )

  // --- Decision log plumbing ---
  const decisionLog: DecisionEntry[] = []
  let budgetRemaining = budget
  let totalSpent = 0
  const purchases: Purchase[] = []

  function log(action: string, reason: string, cost = 0) {
    const entry: DecisionEntry = {
      time: new Date().toISOString(),
      action,
      reason,
      cost: Number(cost.toFixed(6)),
      budget_remaining: Number(budgetRemaining.toFixed(6)),
    }
    decisionLog.push(entry)
    console.log(`  [${action}] ${reason}${cost ? ` (cost ${cost.toFixed(6)}, left ${budgetRemaining.toFixed(6)})` : ""}`)
  }

  function printOutcome(clips: SelectedClip[]) {
    const secondsBought = purchases.reduce((n, p) => n + p.seconds, 0)
    const savings = budget - totalSpent

    console.log("\n=== DECISION LOG ===")
    console.log(JSON.stringify(decisionLog, null, 2))

    console.log("\n=== SELECTED CLIPS ===")
    if (clips.length === 0) {
      console.log("(none)")
    } else {
      clips.forEach((c, i) => {
        console.log(
          `\n  Clip ${i + 1}: ${fmt(c.start)}–${fmt(c.end)} (${c.start.toFixed(1)}s–${c.end.toFixed(1)}s, ${Math.round(
            c.end - c.start,
          )}s, confidence ${c.confidence.toFixed(2)})`,
        )
        console.log(`    Title: ${c.title}`)
        console.log(`    Hook:  ${c.hook}`)
      })
    }

    console.log("\n=== SUMMARY ===")
    console.log(
      JSON.stringify(
        {
          budget_given: Number(budget.toFixed(6)),
          total_spent: Number(totalSpent.toFixed(6)),
          seconds_bought: secondsBought,
          savings: Number(savings.toFixed(6)),
          clips_found: clips.length,
          windows_purchased: purchases.length,
        },
        null,
        2,
      ),
    )
  }

  // --- Pay for [start, end) via settle-core, then record it like test-settle ---
  // Serialized (awaited in order); one idempotency key per window; guarded by
  // circle_transaction_id so a re-record is a no-op.
  async function buyWindow(rawStart: number, rawEnd: number, why: string): Promise<Purchase | null> {
    const start = Math.max(0, Math.min(duration, rawStart))
    const end = Math.max(0, Math.min(duration, rawEnd))
    const seconds = Math.round(end - start)
    if (seconds <= 0) return null

    const cost = seconds * rate
    if (cost > budgetRemaining + 1e-9) {
      log("skip-buy", `${why}: ${fmt(start)}–${fmt(end)} costs ${cost.toFixed(6)} but only ${budgetRemaining.toFixed(6)} left`, 0)
      return null
    }

    const idempotencyKey = randomUUID()
    const result = await settlePerSecond({
      payerWalletId,
      payerAddress,
      creatorAddress: creatorWallet,
      seconds,
      ratePerSecond: rate,
    })

    budgetRemaining -= result.amount
    totalSpent += result.amount
    const purchase: Purchase = {
      start,
      end,
      seconds,
      cost: result.amount,
      idempotencyKey,
      creatorTx: result.creatorTx,
      platformTx: result.platformTx,
    }
    purchases.push(purchase)

    await recordPurchase(result, seconds, idempotencyKey)
    log("buy", `${why}: bought ${fmt(start)}–${fmt(end)} (${seconds}s) — creatorTx ${result.creatorTx.slice(0, 12)}…`, result.amount)
    return purchase
  }

  // Mirror scripts/test-settle.ts: watch_sessions + payment_batches + earnings.
  async function recordPurchase(
    result: Awaited<ReturnType<typeof settlePerSecond>>,
    seconds: number,
    idempotencyKey: string,
  ) {
    const { data: existing } = await supabase
      .from("payment_batches")
      .select("id")
      .eq("circle_transaction_id", result.creatorTx)
      .maybeSingle()
    if (existing?.id) return // already recorded (idempotent)

    const { data: session, error: sessionErr } = await supabase
      .from("watch_sessions")
      .insert({ viewer_id: viewerId, video_id: videoIdResolved, started_at: new Date().toISOString() })
      .select("id")
      .single()
    if (sessionErr || !session) throw new Error(`watch_sessions insert failed: ${sessionErr?.message ?? "no row"}`)

    await supabase
      .from("watch_sessions")
      .update({
        actual_amount: result.amount,
        authorized_amount: result.amount,
        seconds_paid: seconds,
        total_cost: result.amount,
      })
      .eq("id", session.id)

    const { data: batch, error: batchErr } = await supabase
      .from("payment_batches")
      .insert({
        session_id: session.id,
        viewer_id: viewerId,
        creator_id: recipientId,
        video_id: videoIdResolved,
        amount: result.amount,
        seconds_covered: seconds,
        chain: "arcTestnet",
        circle_transaction_id: result.creatorTx,
        status: "settled",
        settled_at: new Date().toISOString(),
      })
      .select("id")
      .single()
    if (batchErr || !batch) throw new Error(`payment_batches insert failed: ${batchErr?.message ?? "no row"}`)

    const { error: earningsErr } = await supabase.from("earnings").insert({
      creator_id: recipientId,
      video_id: videoIdResolved,
      batch_id: batch.id,
      gross_amount: result.amount,
      platform_fee: result.platformFee,
      net_amount: result.netToCreator,
    })
    if (earningsErr) throw new Error(`earnings insert failed: ${earningsErr.message}`)
  }

  // ============================ TRANSCRIPT ============================
  console.log("\nGenerating / fetching captions (Cloudflare)…")
  if (!(rate > 0)) {
    log("decline", `rate_per_sec is ${rate} — cannot run a paying agent on a non-priced video`, 0)
    printOutcome([])
    return
  }

  const segments: Segment[] = await getTranscript(video.cloudflare_uid)
  const words = totalWords(segments)
  const wordsPerSecond = words / duration
  console.log(`  captions: ${segments.length} cues, ${words} words (${wordsPerSecond.toFixed(2)} words/sec over ${duration}s)`)

  // ====================== SPEECH-DENSITY PRE-CHECK ======================
  if (words < MIN_WORDS || wordsPerSecond < MIN_WORDS_PER_SECOND) {
    log(
      "decline",
      `sparse captions (${words} words, ${wordsPerSecond.toFixed(2)} words/sec < ${MIN_WORDS_PER_SECOND}) — likely music/silent; declining with zero spend`,
      0,
    )
    printOutcome([])
    return
  }

  // ============================ DECISION LOOP ============================
  // Pre-flight: can we afford the whole video, or must we allocate?
  const fullCost = duration * rate
  log(
    "preflight",
    fullCost <= budget
      ? `whole-video cost ${fullCost.toFixed(6)} <= budget ${budget.toFixed(6)} — could buy all ${duration}s, but will still probe to spend only where it pays off`
      : `whole-video cost ${fullCost.toFixed(6)} > budget ${budget.toFixed(6)} — must allocate budget to the best moments`,
    0,
  )

  interface ScoredProbe extends Purchase {
    score: number
    reason: string
  }
  const scoredProbes: ScoredProbe[] = []

  // Pay for a window (BEFORE analyzing), then score it. Returns the score, or
  // null if the purchase was skipped (out of budget).
  async function probeWindow(ws: number, we: number, label: string): Promise<number | null> {
    const purchase = await buyWindow(ws, we, label)
    if (!purchase) return null
    const text = textForInterval(segments, purchase.start, purchase.end)
    const { score, reason } = await scoreProbe({
      windowStart: purchase.start,
      windowEnd: purchase.end,
      durationSecs: duration,
      text,
      videoTitle,
    })
    scoredProbes.push({ ...purchase, score, reason })
    log("score-probe", `${fmt(purchase.start)}–${fmt(purchase.end)} scored ${score}/10 — ${reason}`, 0)
    return score
  }

  // --- Planned probe pass: budgeted up front, and ALWAYS run to completion ---
  // (no diminishing-returns early-stop here — these probes are already paid for
  // in plan; stopping short would leave the timeline under-sampled).
  const probeBudget = budget * PROBE_BUDGET_FRACTION
  // Skip the intro. For short videos, fall back to ~10% so we don't skip everything.
  const usableStart = Math.min(INTRO_SKIP_SECONDS, duration * 0.1, Math.max(0, duration - PROBE_SECONDS))
  const usableDuration = Math.max(PROBE_SECONDS, duration - usableStart)
  const maxByBudget = Math.floor(probeBudget / (PROBE_SECONDS * rate))
  const maxByDuration = Math.floor(usableDuration / PROBE_SECONDS)
  const numProbes = Math.max(1, Math.min(MAX_PROBES, maxByBudget, maxByDuration))

  const plannedCenters: number[] = []
  for (let i = 0; i < numProbes; i++) plannedCenters.push(usableStart + ((i + 0.5) / numProbes) * usableDuration)

  log(
    "plan-probes",
    `planned ${numProbes} probe(s) of ${PROBE_SECONDS}s, evenly spread across ${fmt(usableStart)}–${fmt(
      duration,
    )} (skipping the first ${Math.round(usableStart)}s); probe budget ~${probeBudget.toFixed(6)}`,
    0,
  )

  for (let i = 0; i < plannedCenters.length; i++) {
    const start = Math.max(usableStart, Math.min(duration - PROBE_SECONDS, plannedCenters[i] - PROBE_SECONDS / 2))
    await probeWindow(start, start + PROBE_SECONDS, `probe ${i + 1}/${numProbes}`)
  }

  // --- Re-probe: if nothing cleared the bar but budget remains, sample the gaps
  // before concluding there are no clips. Diminishing-returns applies only here. ---
  let strong = scoredProbes.filter((p) => p.score >= PROBE_SCORE_THRESHOLD)
  if (strong.length === 0 && budgetRemaining >= budget * REPROBE_MIN_BUDGET_FRACTION) {
    log(
      "re-probe",
      `planned pass found nothing >= ${PROBE_SCORE_THRESHOLD}/10, but ${((budgetRemaining / budget) * 100).toFixed(
        0,
      )}% of budget remains — sampling unexplored midpoints before giving up`,
      0,
    )
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

  // --- Nothing clip-worthy anywhere we sampled: conclude 0 clips, skip the sonnet call ---
  if (strong.length === 0) {
    log(
      "skip-final-select",
      `sampled ${scoredProbes.length} window(s) across the timeline; none scored >= ${PROBE_SCORE_THRESHOLD}/10 — concluding with 0 clips and returning ${(
        budget - totalSpent
      ).toFixed(6)} unspent (no final-selection call made)`,
      0,
    )
    printOutcome([])
    return
  }

  // A boundary is "mid-thought" if no sentence ends near it (or a cue straddles it).
  function thoughtContinuesAt(time: number, side: "start" | "end"): boolean {
    const straddling = segments.find((s) => s.start < time - 0.1 && s.end > time + 0.1)
    if (straddling) return true
    if (side === "end") {
      const near = segments
        .filter((s) => s.end <= time + 0.1 && s.end >= time - SENTENCE_EDGE_TOLERANCE)
        .sort((a, b) => b.end - a.end)[0]
      if (!near) return false // silence at the edge — a clean cut
      return !endsSentence(near.text)
    }
    const near = segments
      .filter((s) => s.start >= time - 0.1 && s.start <= time + SENTENCE_EDGE_TOLERANCE)
      .sort((a, b) => a.start - b.start)[0]
    if (!near) return false
    const prev = segments.filter((s) => s.end <= near.start + 0.1).sort((a, b) => b.end - a.end)[0]
    if (!prev || near.start - prev.end > 1.5) return false // gap before the edge — a clean start
    return !endsSentence(prev.text)
  }

  // Follow the thought: while an edge cuts mid-sentence and budget remains, buy a
  // 15s extension on that side (up to 2 per region). Reads as a cost-vs-value call.
  async function followThought(rs: number, re: number, score: number): Promise<{ start: number; end: number }> {
    let start = rs
    let end = re
    const extCost = EXTENSION_SECONDS * rate
    for (let used = 0; used < MAX_EXTENSIONS_PER_REGION; ) {
      if (end < duration && extCost <= budgetRemaining + 1e-9 && thoughtContinuesAt(end, "end")) {
        log("extend-region", `thought continues at ${fmt(end)} (end edge), buying +${EXTENSION_SECONDS}s`, 0)
        const p = await buyWindow(end, end + EXTENSION_SECONDS, `extend <${score}/10> end`)
        if (!p) break
        end = p.end
        used++
        continue
      }
      if (start > 0 && extCost <= budgetRemaining + 1e-9 && thoughtContinuesAt(start, "start")) {
        log("extend-region", `thought continues at ${fmt(start)} (start edge), buying +${EXTENSION_SECONDS}s`, 0)
        const p = await buyWindow(start - EXTENSION_SECONDS, start, `extend <${score}/10> start`)
        if (!p) break
        start = p.start
        used++
        continue
      }
      break
    }
    return { start, end }
  }

  // --- Expand strong probes into contiguous regions big enough for a 20-60s clip ---
  strong.sort((a, b) => b.score - a.score)
  const securedRegions: Array<{ start: number; end: number; score: number }> = []
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

    // Buy the gaps around the already-owned probe window (pay before consuming).
    if (probe.start - targetStart >= 1) await buyWindow(targetStart, probe.start, `expand <${probe.score}/10>`)
    if (targetEnd - probe.end >= 1) await buyWindow(probe.end, targetEnd, `expand <${probe.score}/10>`)

    // Follow the thought past either edge — but only from the ACTUAL contiguous
    // owned interval around the probe. A gap-buy above may have been skipped for
    // budget, so extending from the target bounds could buy a detached island
    // (the 24:31 case: end-extended to 25:21-25:36 while 24:56-25:21 was skipped).
    const ownedHere = mergeRegions(purchases, segments).find(
      (r) => probe.start >= r.start - 0.6 && probe.end <= r.end + 0.6,
    )
    const rs = ownedHere ? ownedHere.start : probe.start
    const re = ownedHere ? ownedHere.end : probe.end
    const grown = await followThought(rs, re, probe.score)
    securedRegions.push({ start: grown.start, end: grown.end, score: probe.score })
  }

  // --- Final selection: model proposes ranked candidates, code applies the rules ---
  async function runSelection(phase: string) {
    const regions = mergeRegions(purchases, segments)
    log("final-select", `${phase}: selecting over ${regions.length} purchased region(s) with claude-sonnet-4-6`, 0)
    const result = await selectClips({ regions, segments, durationSecs: duration, videoTitle, maxClips: MAX_STRONG_REGIONS })

    if (result.noCandidatesReason) {
      log("no-candidates", result.noCandidatesReason, 0)
    } else {
      log("candidates", `sonnet proposed ${result.candidates.length} candidate(s)`, 0)
      for (const v of result.verdicts) {
        const c = v.candidate
        if (v.accepted && v.clip) {
          if (v.adjusted) log("adjust-clip", v.adjusted, 0)
          log("accept-clip", `"${c.title}" ${fmt(v.clip.start)}–${fmt(v.clip.end)} (confidence ${Number(c.confidence).toFixed(2)}) — accepted`, 0)
        } else {
          log("reject-clip", `"${c.title}" ${fmt(c.start)}–${fmt(c.end)} (confidence ${Number(c.confidence).toFixed(2)}) — rejected: ${v.rule}`, 0)
        }
      }
    }
    return result.accepted
  }

  let clips = await runSelection("initial")

  // --- Retry before surrender: extend top regions once and re-select ---
  if (clips.length === 0 && budgetRemaining >= RETRY_MIN_BUDGET && securedRegions.length > 0) {
    log(
      "retry-selection",
      `0 clips accepted with ${budgetRemaining.toFixed(6)} budget left — extending top region(s) +${EXTENSION_SECONDS}s each side and re-selecting once`,
      0,
    )
    const extCost = EXTENSION_SECONDS * rate
    for (const r of [...securedRegions].sort((a, b) => b.score - a.score).slice(0, MAX_STRONG_REGIONS)) {
      if (r.start > 0 && extCost <= budgetRemaining + 1e-9) await buyWindow(Math.max(0, r.start - EXTENSION_SECONDS), r.start, `retry-extend <${r.score}/10> start`)
      if (r.end < duration && extCost <= budgetRemaining + 1e-9) await buyWindow(r.end, Math.min(duration, r.end + EXTENSION_SECONDS), `retry-extend <${r.score}/10> end`)
    }
    clips = await runSelection("retry")
  }

  log("complete", `selected ${clips.length} clip(s); finished ${(budget - totalSpent).toFixed(6)} under budget`, 0)
  printOutcome(clips)
}

/** Merge overlapping/adjacent purchased intervals into contiguous regions with transcript. */
function mergeRegions(purchases: Purchase[], segments: Segment[]): PurchasedRegion[] {
  if (purchases.length === 0) return []
  const sorted = [...purchases].sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const p of sorted) {
    const last = merged[merged.length - 1]
    if (last && p.start <= last.end + 0.5) {
      last.end = Math.max(last.end, p.end)
    } else {
      merged.push({ start: p.start, end: p.end })
    }
  }
  return merged.map((r) => ({ start: r.start, end: r.end, transcript: textForInterval(segments, r.start, r.end) }))
}

main().catch((err) => {
  console.error("agent-run failed:", err?.message ?? err)
  process.exit(1)
})
