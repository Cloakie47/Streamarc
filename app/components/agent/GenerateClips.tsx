"use client"

import { useState, useEffect, useRef } from "react"
import { Stream } from "@cloudflare/stream-react"
import { Scissors, X, Loader2, Sparkles } from "lucide-react"

interface DecisionEntry {
  time: string
  action: string
  reason: string
  cost: number
  budget_remaining: number
}

interface JobClip {
  uid: string
  video_row_id: string
  title: string
  hook: string
  confidence: number
  start?: number
  end?: number
}

interface Receipt {
  strategy?: string
  total_paid?: number
  tier_breakdown?: { skim_spend: number; footage_spend: number }
  seconds_bought?: number
  windows?: number
  settlements?: string[]
  savings?: number
  budget_given?: number
  moments_found?: number
}

interface JobStatus {
  status: string
  decision_log?: DecisionEntry[]
  receipt?: Receipt
  clips?: JobClip[]
  error?: string | null
}

const fmtUsd = (n: number | undefined) => `$${(n ?? 0).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`

// Colour the terminal feed by action so the agent's reasoning is scannable.
function actionClass(action: string): string {
  if (action.startsWith("buy") || action === "extend-region") return "text-amber-400"
  if (action === "accept-clip" || action === "clip-created" || action === "complete") return "text-emerald-400"
  if (action === "reject-clip" || action === "decline" || action === "clip-error" || action.startsWith("skip") || action.startsWith("stop")) return "text-rose-400"
  if (action === "moment-found" || action === "editorial-brief" || action === "strategy" || action === "candidates" || action === "moments-analyzed") return "text-cyan-400"
  if (action === "self-critique" || action === "self-critique-swap" || action === "pause-snap" || action === "cap-flex") return "text-violet-400"
  return "text-sa-text-3"
}

export interface GenerateClipsProps {
  videoId: string
  ratePerSecond: number
  durationSecs: number
  videoTitle: string
}

export default function GenerateClips({ videoId, ratePerSecond, durationSecs, videoTitle }: GenerateClipsProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [budget, setBudget] = useState("0.60")
  const [goal, setGoal] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const budgetNum = Number(budget) || 0
  const skimCost = durationSecs * ratePerSecond * 0.1
  const skimThreshold = skimCost + 75 * ratePerSecond
  const willSkim = budgetNum >= skimThreshold
  const footageBudget = Math.max(0, budgetNum - skimCost)
  const estRegions = willSkim ? Math.min(3, Math.max(1, Math.floor(footageBudget / (ratePerSecond * 60)))) : 0
  // 80% of agent spend returns to the creator as earnings, so net cost is ~20% of the budget.
  const netCost = budgetNum * 0.2
  // A comfortable budget: full-transcript skim + 3 clip regions (~90s each) at this video's rate.
  const recommendedBudget = skimCost + 3 * 90 * ratePerSecond
  const belowRecommended = budgetNum < recommendedBudget

  async function submit() {
    if (!(budgetNum > 0)) {
      setError("Enter a budget greater than 0")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/agent/enqueue-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, budget_usdc: budgetNum, goal: goal.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to start the agent")
      setJobId(data.id)
      setModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the agent")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!jobId && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <Sparkles size={16} />
          Generate Clips with the AI Agent
        </button>
      )}

      {jobId && <LiveJob jobId={jobId} onReset={() => setJobId(null)} />}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Scissors size={18} className="text-primary" />
              <h2 className="text-lg font-bold">Generate Clips</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              An AI agent pays per second to read &amp; clip <span className="text-foreground">{videoTitle}</span> — fully autonomous.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  Budget (USDC)
                </label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  step="0.05"
                  min="0"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  {willSkim ? (
                    <>
                      Full-transcript skim ≈ <span className="text-foreground">{fmtUsd(skimCost)}</span> + up to{" "}
                      <span className="text-foreground">{estRegions}</span> clip region{estRegions === 1 ? "" : "s"} at this video&apos;s rate.
                    </>
                  ) : (
                    <>
                      Sampling mode — budget is below the skim threshold (≈ <span className="text-foreground">{fmtUsd(skimThreshold)}</span>); the agent will probe-sample instead.
                    </>
                  )}
                </p>

                <p className="mt-1.5 text-xs text-muted-foreground">
                  Estimated net cost to you: <span className="text-foreground font-semibold">~${netCost.toFixed(2)}</span>{" "}
                  (80% of agent spend returns to you as earnings)
                </p>

                {belowRecommended && (
                  <p className="mt-1.5 text-xs text-amber-400 leading-relaxed">
                    ⚠ Below the recommended <span className="font-semibold">${recommendedBudget.toFixed(2)}</span> (skim + 3 clip regions).
                    {budgetNum < skimThreshold
                      ? " The agent will fall back to sampling mode — lower-quality, fewer clips."
                      : " It may secure fewer clips."}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  Goal (optional)
                </label>
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="What should these clips achieve? e.g. surface the most surprising claims"
                  rows={2}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || !(budgetNum > 0)}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {submitting ? "Starting…" : "Run agent"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TERMINAL_STATUSES = new Set(["done", "failed"])

function LiveJob({ jobId, onReset }: { jobId: string; onReset: () => void }) {
  const [job, setJob] = useState<JobStatus | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      try {
        const res = await fetch(`/api/agent/status?job_id=${jobId}`)
        const data = (await res.json()) as JobStatus
        if (!active) return
        if (!res.ok) {
          setPollError((data as { error?: string })?.error ?? "Failed to load job status")
        } else {
          setJob(data)
          if (TERMINAL_STATUSES.has(data.status)) return // stop polling
        }
      } catch {
        if (active) setPollError("Network error while polling job status")
      }
      if (active) timer = setTimeout(poll, 3000)
    }

    poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [jobId])

  // Auto-scroll the terminal feed as it grows.
  const log = job?.decision_log ?? []
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [log.length])

  const status = job?.status ?? "queued"
  const isDone = status === "done"
  const isFailed = status === "failed"
  const isRunning = !TERMINAL_STATUSES.has(status)
  const receipt = job?.receipt
  const clips = job?.clips ?? []

  return (
    <div className="panel p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 size={15} className="animate-spin text-primary" />
          ) : (
            <Scissors size={15} className={isFailed ? "text-rose-400" : "text-emerald-400"} />
          )}
          <h3 className="text-sm font-bold">
            {isRunning ? "Agent working…" : isFailed ? "Agent failed" : "Clips ready"}
          </h3>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{status}</span>
        </div>
        {!isRunning && (
          <button type="button" onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            New run
          </button>
        )}
      </div>

      {/* Terminal-style decision feed — the centerpiece */}
      <div
        ref={feedRef}
        className="max-h-72 overflow-y-auto rounded-xl border border-border bg-black/50 p-3 font-mono text-[11px] leading-relaxed"
      >
        {log.length === 0 && <p className="text-muted-foreground">Queued — waiting for the worker to pick up the job…</p>}
        {log.map((e, i) => (
          <div key={i} className="flex flex-wrap gap-x-2">
            <span className={`shrink-0 font-semibold ${actionClass(e.action)}`}>[{e.action}]</span>
            <span className="text-sa-text-2 flex-1 min-w-[12rem]">{e.reason}</span>
            {e.cost > 0 && (
              <span className="shrink-0 text-amber-400/80">
                −{fmtUsd(e.cost)} · left {fmtUsd(e.budget_remaining)}
              </span>
            )}
          </div>
        ))}
        {pollError && <p className="mt-2 text-rose-400">{pollError}</p>}
      </div>

      {isFailed && job?.error && <p className="text-sm text-destructive">{job.error}</p>}

      {/* Receipt summary */}
      {isDone && receipt && (
        <div className="rounded-xl border border-border bg-background/50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {receipt.strategy ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">payment receipt</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Stat label="Total paid" value={fmtUsd(receipt.total_paid)} />
            <Stat label="Saved" value={fmtUsd(receipt.savings)} />
            <Stat label="Skim spend" value={fmtUsd(receipt.tier_breakdown?.skim_spend)} />
            <Stat label="Footage spend" value={fmtUsd(receipt.tier_breakdown?.footage_spend)} />
            <Stat label="Seconds bought" value={`${receipt.seconds_bought ?? 0}s`} />
            <Stat label="Settlements" value={`${receipt.settlements?.length ?? 0}`} />
          </div>
        </div>
      )}

      {/* Clips */}
      {isDone && (
        <div className="flex flex-col gap-4">
          {clips.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The agent finished but selected no clips — see the decision log above for why (it returns unspent budget).
            </p>
          ) : (
            clips.map((c) => (
              <div key={c.video_row_id || c.uid} className="rounded-xl border border-border overflow-hidden bg-black/30">
                <div className="relative aspect-video bg-black">
                  <Stream src={c.uid} controls className="absolute inset-0 w-full h-full" />
                </div>
                <div className="p-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold leading-snug">{c.title}</p>
                    <span className="shrink-0 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold">
                      {Math.round((c.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  {c.hook && <p className="text-xs text-sa-text-3 leading-relaxed">{c.hook}</p>}
                </div>
              </div>
            ))
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
