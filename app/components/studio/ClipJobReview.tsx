"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Stream, type StreamPlayerApi } from "@cloudflare/stream-react"
import { Scissors, Loader2, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react"
import TrimSelector from "@/app/components/studio/TrimSelector"
import { MAX_RATE_PER_SEC } from "@/app/lib/constants"

interface DecisionEntry {
  time: string
  action: string
  reason: string
  cost: number
  budget_remaining: number
}

interface JobClip {
  status?: "pending" | "approved" | "discarded"
  start: number
  end: number
  analyzed_start: number
  analyzed_end: number
  suggested_title: string
  hook: string
  confidence: number
  transcript_excerpt?: string
  uid?: string
  video_row_id?: string
  title?: string
  description?: string
  rate_per_sec?: number
}

interface Receipt {
  strategy?: string
  total_paid?: number
  budget_given?: number
  /** Fixed service fee actually settled (new pricing model). */
  service_fee?: number
  service_fee_tx?: string | null
  /** Metered consumption (skim + footage), excluding the fee. */
  processing?: number
  estimated_quote?: number
  max_quote?: number
  tier_breakdown?: { skim_spend: number; footage_spend: number }
  seconds_bought?: number
  settlements?: string[]
  service_fee_charged?: number
  refunded?: number
  insufficient_funds?: boolean
}

interface JobStatus {
  status: string
  decision_log?: DecisionEntry[]
  receipt?: Receipt
  clips?: JobClip[]
  error?: string | null
}

const fmtUsd = (n: number | undefined) => `$${(n ?? 0).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`

const TERMINAL_STATUSES = new Set(["done", "failed"])

function actionClass(action: string): string {
  if (action.startsWith("consume") || action === "extend-region" || action === "service-fee") return "text-amber-400"
  if (action === "accept-clip" || action === "propose-clip" || action === "complete" || action === "refund" || action === "funding-ok") return "text-emerald-400"
  if (action === "reject-clip" || action === "decline" || action === "refund-failed" || action === "fund-failed" || action === "fee-failed" || action === "insufficient-balance" || action.startsWith("skip") || action.startsWith("stop")) return "text-rose-400"
  if (action === "fund-budget" || action === "moment-found" || action === "editorial-brief" || action === "strategy" || action === "candidates" || action === "moments-analyzed" || action === "keyword-focus") return "text-cyan-400"
  if (action === "self-critique" || action === "self-critique-swap" || action === "pause-snap" || action === "cap-flex" || action === "confidence") return "text-violet-400"
  return "text-sa-text-3"
}

// Clean, human progress derived from the decision log (not the raw dump).
function progressPhrase(log: DecisionEntry[]): string {
  if (log.length === 0) return "Queued. Waiting for the agent to start…"
  const has = (a: string) => log.some((e) => e.action === a)
  const moments = log.filter((e) => e.action === "moment-found").length
  const last = log[log.length - 1].action
  if (has("propose-clip") || last === "complete") return "Preparing clip proposals…"
  if (last === "self-critique" || last === "self-critique-swap") return "Reviewing clip quality…"
  if (last === "final-select" || last === "candidates" || last === "accept-clip" || last === "reject-clip") return "Selecting the best clips…"
  if (last.startsWith("consume") || last === "extend-region" || last.startsWith("skip") || last.startsWith("stop")) return "Buying & analyzing footage…"
  if (moments > 0) return `Found ${moments} valuable moment${moments === 1 ? "" : "s"}, analyzing…`
  if (last === "editorial-brief" || last === "moments-analyzed") return "Studying the video…"
  if (last === "fund-budget") return "Reserving budget…"
  if (last === "transcript" || last === "funding-ok") return "Reading the transcript…"
  return "Working…"
}

export interface ClipJobReviewProps {
  jobId: string
  sourceCloudflareUid: string
  sourceRate: number
  videoTitle: string
}

export default function ClipJobReview({ jobId, sourceCloudflareUid, sourceRate, videoTitle }: ClipJobReviewProps) {
  const [job, setJob] = useState<JobStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const lastPaidRef = useRef<number | null>(null)

  // Load from the DB by id (so refresh / return always reflects current state).
  const fetchJob = async (): Promise<JobStatus | null> => {
    try {
      const res = await fetch(`/api/agent/status?job_id=${jobId}`)
      const data = (await res.json()) as JobStatus
      if (!res.ok) {
        setLoadError((data as { error?: string })?.error ?? "Failed to load job")
        return null
      }
      setJob(data)
      return data
    } catch {
      setLoadError("Network error loading job")
      return null
    }
  }

  // Poll only while running; stop at a terminal status.
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      const data = await fetchJob()
      if (!active) return
      // The agent charges the wallet per chunk as the job runs — refresh the
      // displayed balance when the SPEND actually changes. (Dispatching every
      // 3s tick made Sidebar + watch listeners refetch + re-render at 0.33Hz
      // for the whole job — a re-render/network storm for no new information.)
      if (data) {
        const paid = Number(data.receipt?.total_paid ?? 0)
        if (paid !== lastPaidRef.current) {
          lastPaidRef.current = paid
          window.dispatchEvent(new CustomEvent("gateway-balance-updated"))
        }
      }
      if (data && TERMINAL_STATUSES.has(data.status)) return
      timer = setTimeout(tick, 3000)
    }
    tick()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const status = job?.status ?? "loading"
  const isFailed = status === "failed"
  const isDone = status === "done"
  const isRunning = !TERMINAL_STATUSES.has(status) && status !== "loading"
  const log = job?.decision_log ?? []
  const receipt = job?.receipt
  const clips = job?.clips ?? []
  const pendingCount = clips.filter((c) => c.status === "pending").length

  return (
    <div className="mx-auto w-full max-w-[680px] px-4 py-6 flex flex-col gap-5">
      {/* Back to the clip jobs list */}
      <Link href="/studio/clips" className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={16} />
        Clip Jobs
      </Link>

      {/* Status header */}
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isFailed ? "border-rose-500/30 bg-rose-500/10 text-rose-400" : "border-primary/20 bg-primary/10 text-primary"}`}>
          {isRunning ? <Loader2 size={18} className="animate-spin" /> : <Scissors size={18} />}
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{videoTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {status === "loading"
              ? "Loading…"
              : isFailed
                ? "Agent failed"
                : isDone
                  ? receipt?.insufficient_funds
                    ? "Insufficient balance"
                    : pendingCount > 0
                      ? `Ready for review: ${pendingCount} clip${pendingCount === 1 ? "" : "s"} pending`
                      : "Completed"
                  : progressPhrase(log)}
          </p>
        </div>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {isFailed && job?.error && <p className="text-sm text-destructive">{job.error}</p>}

      {/* Insufficient balance */}
      {isDone && receipt?.insufficient_funds && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold text-amber-300">Insufficient balance</p>
          <p className="text-xs text-muted-foreground">Your Gateway balance didn&apos;t cover this run. No funds were charged. Top up and run the agent again.</p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-top-up"))}
            className="self-start rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity"
          >
            Top up balance
          </button>
        </div>
      )}

      {/* Service-fee receipt */}
      {receipt && !receipt.insufficient_funds && (
        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">{receipt.strategy ?? "—"}</span>
            <span className="text-xs text-muted-foreground">service-fee receipt</span>
          </div>
          {/* Cost transparency: itemized fee + metered processing vs the quote —
              the max is a CAP, not the price. */}
          {typeof receipt.service_fee === "number" ? (
            <p className="mb-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 tabular-nums">
              Service fee {fmtUsd(receipt.service_fee)} + processing {fmtUsd(receipt.processing)} ={" "}
              {fmtUsd(receipt.total_paid)} charged
              <span className="block text-[11px] font-normal text-emerald-300/80">
                Estimate was ~{fmtUsd(receipt.estimated_quote)}, max {fmtUsd(receipt.max_quote ?? receipt.budget_given)}. You paid
                for what was used.
              </span>
            </p>
          ) : typeof receipt.budget_given === "number" ? (
            <p className="mb-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300 tabular-nums">
              Charged {fmtUsd(receipt.service_fee_charged ?? receipt.total_paid)} of your {fmtUsd(receipt.budget_given)} budget cap
              <span className="block text-[11px] font-normal text-emerald-300/80">You only pay for what the agent actually consumed. The budget is a ceiling, not the price.</span>
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {typeof receipt.service_fee === "number" ? (
              <>
                <Stat label="Charged (total)" value={fmtUsd(receipt.total_paid)} />
                <Stat label="Service fee" value={fmtUsd(receipt.service_fee)} />
                <Stat label="Processing" value={fmtUsd(receipt.processing)} />
              </>
            ) : (
              <Stat label="Service fee paid" value={fmtUsd(receipt.service_fee_charged ?? receipt.total_paid)} />
            )}
            <Stat label="Refunded" value={fmtUsd(receipt.refunded)} />
            <Stat label="Skim spend" value={fmtUsd(receipt.tier_breakdown?.skim_spend)} />
            <Stat label="Footage spend" value={fmtUsd(receipt.tier_breakdown?.footage_spend)} />
            <Stat label="Seconds processed" value={`${receipt.seconds_bought ?? 0}s`} />
            <Stat label="Settlements" value={`${receipt.settlements?.length ?? 0}`} />
          </div>
        </div>
      )}

      {/* Collapsible raw decision log */}
      {log.length > 0 && (
        <div className="rounded-xl border border-border bg-background/40">
          <button type="button" onClick={() => setShowLog((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
            {showLog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            View agent decision log ({log.length})
          </button>
          {showLog && (
            <div className="max-h-72 overflow-y-auto border-t border-border bg-black/50 p-3 font-mono text-[11px] leading-relaxed">
              {log.map((e, i) => (
                <div key={i} className="flex flex-wrap gap-x-2">
                  <span className={`shrink-0 font-semibold ${actionClass(e.action)}`}>[{e.action}]</span>
                  <span className="text-sa-text-2 flex-1 min-w-[12rem]">{e.reason}</span>
                  {e.cost > 0 && <span className="shrink-0 text-amber-400/80">−{fmtUsd(e.cost)} · left {fmtUsd(e.budget_remaining)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review cards */}
      {!isRunning && status !== "loading" && !receipt?.insufficient_funds && (
        <div className="flex flex-col gap-4">
          {clips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clips were proposed for this job. See the decision log; you only paid for what was consumed.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Review each clip: preview the segment, set the title, description and watch price, nudge the in/out points, then Approve to publish (or Discard). Nothing is published until you approve it.</p>
              {clips.map((c, i) =>
                c.status === "approved" ? (
                  <PublishedClipCard key={i} clip={c} />
                ) : c.status === "discarded" ? (
                  <div key={i} className="rounded-xl border border-border/50 bg-background/30 p-3 text-xs text-muted-foreground">Discarded: “{c.suggested_title}” (not published).</div>
                ) : (
                  <PendingClipCard key={i} jobId={jobId} index={i} clip={c} sourceCloudflareUid={sourceCloudflareUid} defaultRate={sourceRate} onChanged={fetchJob} />
                ),
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function PublishedClipCard({ clip }: { clip: JobClip }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 overflow-hidden bg-black/30">
      <div className="relative aspect-video bg-black">{clip.uid && <Stream src={clip.uid} controls className="absolute inset-0 w-full h-full" />}</div>
      <div className="p-3 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold leading-snug">{clip.title ?? clip.suggested_title}</p>
          <span className="shrink-0 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold">Published</span>
        </div>
        {clip.description && <p className="text-xs text-sa-text-3 leading-relaxed">{clip.description}</p>}
        {clip.video_row_id && (
          <a href={`/watch/${clip.video_row_id}`} className="mt-1 text-xs text-primary hover:underline">
            Open clip →
          </a>
        )}
      </div>
    </div>
  )
}

function PendingClipCard({
  jobId,
  index,
  clip,
  sourceCloudflareUid,
  defaultRate,
  onChanged,
}: {
  jobId: string
  index: number
  clip: JobClip
  sourceCloudflareUid: string
  defaultRate: number
  onChanged: () => void | Promise<unknown>
}) {
  const [title, setTitle] = useState(clip.suggested_title ?? "")
  const [description, setDescription] = useState(clip.hook ?? "")
  const [rate, setRate] = useState(String(clip.rate_per_sec ?? defaultRate ?? 0))
  const [start, setStart] = useState(clip.start)
  const [end, setEnd] = useState(clip.end)
  const [busy, setBusy] = useState<null | "approve" | "discard">(null)
  const [error, setError] = useState<string | null>(null)
  const playerRef = useRef<StreamPlayerApi | undefined>(undefined)

  async function approve() {
    if (!title.trim()) {
      setError("Title required")
      return
    }
    setBusy("approve")
    setError(null)
    try {
      const res = await fetch("/api/agent/clips/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, index, title: title.trim(), description: description.trim(), rate_per_sec: Number(rate) || 0, start, end }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Approve failed")
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed")
      setBusy(null)
    }
  }

  async function discard() {
    setBusy("discard")
    setError(null)
    try {
      const res = await fetch("/api/agent/clips/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, index }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Discard failed")
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discard failed")
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold">Pending review</span>
        <span className="text-[10px] rounded bg-white/5 border border-border px-1.5 py-0.5">{Math.round((clip.confidence ?? 0) * 100)}% confidence</span>
      </div>

      {/* Preview: the SOURCE video scrubbed to [start, end]. Remounts on nudge so
          startTime updates; onTimeUpdate stops playback at the out-point. */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <Stream
          key={`${start}-${end}`}
          streamRef={playerRef}
          src={sourceCloudflareUid}
          startTime={`${start}s`}
          controls
          className="absolute inset-0 w-full h-full"
          onTimeUpdate={() => {
            const p = playerRef.current
            if (p && p.currentTime >= end) {
              p.pause()
              p.currentTime = start
            }
          }}
        />
      </div>

      {clip.transcript_excerpt && <p className="text-xs text-sa-text-3 leading-relaxed line-clamp-3 italic">“{clip.transcript_excerpt}”</p>}

      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Watch price (USDC / second), max ${MAX_RATE_PER_SEC}/sec</label>
        <input type="number" step="0.00001" min="0" max={MAX_RATE_PER_SEC} value={rate} onChange={(e) => setRate(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
      </div>

      {/* Trim — draggable filmstrip bounded to the analyzed footage. Drag the
          In/Out handles; on release the card's start/end update (same state the
          steppers fed), so the preview and Approve use the new values. */}
      <TrimSelector
        boundStart={clip.analyzed_start}
        boundEnd={clip.analyzed_end}
        start={start}
        end={end}
        sourceUid={sourceCloudflareUid}
        onChange={(s, e) => {
          setStart(s)
          setEnd(e)
        }}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={discard} disabled={busy !== null} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium hover:bg-white/5 transition-colors disabled:opacity-50">
          {busy === "discard" ? "Discarding…" : "Discard"}
        </button>
        <button type="button" onClick={approve} disabled={busy !== null} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
          {busy === "approve" ? "Publishing…" : "Approve & publish"}
        </button>
      </div>
    </div>
  )
}

