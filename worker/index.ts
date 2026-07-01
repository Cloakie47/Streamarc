// worker/index.ts
// Phase 3: long-lived Node worker that drains the agent_jobs queue.
//
//   node worker/index.ts        (npm run agent:worker)
//
// Polls every 5s for the oldest status='queued' job, claims it (queued ->
// running, optimistically so two workers can't grab the same row), runs the
// shared pipeline (lib/agent/pipeline.ts), and writes a TERMINAL status:
//   - success  -> status 'done'   + decision_log + receipt + clips
//   - error    -> status 'failed' + error + the partial decision_log
// Crash-safety: every claimed job ends in a terminal status via try/catch, so a
// pipeline error never leaves a job stuck in 'running'.

import "../lib/agent/env.ts"
import { getSupabaseAdmin } from "../app/lib/supabase-server.ts"
import { runClipAgent, type DecisionEntry } from "../lib/agent/pipeline.ts"
import { runCaptionJob } from "../lib/captions/pipeline.ts"

const POLL_INTERVAL_MS = 5000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type Supabase = ReturnType<typeof getSupabaseAdmin>

interface AgentJob {
  id: string
  video_id: string
  budget_usdc: number
  goal: string | null
}

/** Fetch the oldest queued job and atomically flip it to 'running'. Returns null if none/lost-race. */
async function claimNextJob(supabase: Supabase): Promise<AgentJob | null> {
  const { data: queued, error } = await supabase
    .from("agent_jobs")
    .select("id, video_id, budget_usdc, goal")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`queue poll failed: ${error.message}`)
  if (!queued) return null

  // Optimistic claim: only succeeds if the row is still 'queued'.
  const { data: claimed, error: claimErr } = await supabase
    .from("agent_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", queued.id)
    .eq("status", "queued")
    .select("id, video_id, budget_usdc, goal")
    .maybeSingle()
  if (claimErr) throw new Error(`job claim failed: ${claimErr.message}`)
  return claimed ?? null // null = another worker claimed it first
}

async function processJob(supabase: Supabase, job: AgentJob): Promise<void> {
  console.log(`[worker] running job ${job.id} (video ${job.video_id}, budget ${job.budget_usdc})`)

  // Capture the decision log live so we can persist a partial log if the pipeline throws.
  const partialLog: DecisionEntry[] = []
  const onLog = (e: DecisionEntry) => {
    partialLog.push(e)
    console.log(`  [job ${job.id.slice(0, 8)}] [${e.action}] ${e.reason}`)
  }

  try {
    const result = await runClipAgent({ jobId: job.id, videoId: job.video_id, budgetUsdc: Number(job.budget_usdc), goal: job.goal ?? undefined, onLog, createClips: true })
    const { error } = await supabase
      .from("agent_jobs")
      .update({
        status: "done",
        decision_log: result.decisionLog,
        receipt: result.receipt,
        clips: result.clips,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
    if (error) throw new Error(`failed to write 'done' status: ${error.message}`)
    console.log(`[worker] job ${job.id} done — ${result.clips.length} clip(s), paid ${result.receipt.total_paid}`)
  } catch (err) {
    const message = (err as Error)?.message ?? String(err)
    console.error(`[worker] job ${job.id} failed: ${message}`)
    // Always write a terminal status — never leave a job stuck in 'running'.
    const { error: writeErr } = await supabase
      .from("agent_jobs")
      .update({ status: "failed", error: message, decision_log: partialLog, updated_at: new Date().toISOString() })
      .eq("id", job.id)
    if (writeErr) console.error(`[worker] CRITICAL: could not write 'failed' status for ${job.id}: ${writeErr.message}`)
  }
}

// ---------------- caption jobs (paid multi-language subtitles) ----------------
interface CaptionJob {
  id: string
  video_id: string
  language: string
  requester_id: string | null
}

/** Claim the oldest queued caption job (queued -> running), optimistically. */
async function claimNextCaptionJob(supabase: Supabase): Promise<CaptionJob | null> {
  const { data: queued, error } = await supabase
    .from("caption_jobs")
    .select("id, video_id, language, requester_id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`caption queue poll failed: ${error.message}`)
  if (!queued) return null

  const { data: claimed, error: claimErr } = await supabase
    .from("caption_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", queued.id)
    .eq("status", "queued")
    .select("id, video_id, language, requester_id")
    .maybeSingle()
  if (claimErr) throw new Error(`caption job claim failed: ${claimErr.message}`)
  return claimed ?? null
}

async function processCaptionJob(supabase: Supabase, job: CaptionJob): Promise<void> {
  console.log(`[worker] caption job ${job.id} (video ${job.video_id}, lang ${job.language})`)
  try {
    const result = await runCaptionJob(supabase, { videoId: job.video_id, language: job.language, requesterId: job.requester_id })
    const { error } = await supabase
      .from("caption_jobs")
      .update({ status: result.status, charged: result.charged, circle_tx: result.circleTx, error: result.error, updated_at: new Date().toISOString() })
      .eq("id", job.id)
    if (error) throw new Error(`failed to write caption job status: ${error.message}`)
    console.log(`[worker] caption job ${job.id} -> ${result.status}${result.charged ? ` (charged ${result.charged})` : ""}`)
  } catch (err) {
    const message = (err as Error)?.message ?? String(err)
    console.error(`[worker] caption job ${job.id} failed: ${message}`)
    const { error: writeErr } = await supabase
      .from("caption_jobs")
      .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
      .eq("id", job.id)
    if (writeErr) console.error(`[worker] CRITICAL: could not write caption 'failed' for ${job.id}: ${writeErr.message}`)
  }
}

async function main() {
  const supabase = getSupabaseAdmin()
  console.log(`[worker] worker started; polling agent_jobs + caption_jobs every ${POLL_INTERVAL_MS / 1000}s`)

  for (;;) {
    let job: AgentJob | null = null
    let captionJob: CaptionJob | null = null
    try {
      job = await claimNextJob(supabase)
      if (!job) captionJob = await claimNextCaptionJob(supabase)
    } catch (err) {
      console.error(`[worker] poll error: ${(err as Error)?.message ?? err}`)
    }

    if (job) {
      await processJob(supabase, job) // serial: one job at a time
    } else if (captionJob) {
      await processCaptionJob(supabase, captionJob)
    } else {
      await sleep(POLL_INTERVAL_MS)
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err?.message ?? err)
  process.exit(1)
})
