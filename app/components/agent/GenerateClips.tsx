"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Scissors, X, Loader2, Sparkles } from "lucide-react"
import { MIN_AI_CLIP_SECONDS } from "@/app/lib/clip-config"

const fmtUsd = (n: number | undefined) => `$${(n ?? 0).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`

export interface GenerateClipsProps {
  videoId: string
  ratePerSecond: number
  durationSecs: number
  videoTitle: string
}

// Watch-page control (owner/admin only): starts a clip job and routes the
// creator to the Studio review page. The job/review UI itself lives in Studio
// (/studio/clips/[jobId]) — nothing is rendered inline on the public watch page.
export default function GenerateClips({ videoId, ratePerSecond, durationSecs, videoTitle }: GenerateClipsProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [budget, setBudget] = useState("0.60")
  const [goal, setGoal] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const budgetNum = Number(budget) || 0
  const skimCost = durationSecs * ratePerSecond * 0.1
  const skimThreshold = skimCost + 75 * ratePerSecond
  const willSkim = budgetNum >= skimThreshold
  const footageBudget = Math.max(0, budgetNum - skimCost)
  const estRegions = willSkim ? Math.min(3, Math.max(1, Math.floor(footageBudget / (ratePerSecond * 60)))) : 0
  const estCost = willSkim ? skimCost + estRegions * 60 * ratePerSecond : budgetNum
  const recommendedBudget = skimCost + 3 * 90 * ratePerSecond
  const belowRecommended = budgetNum < recommendedBudget
  // AI clipping is only offered for longer videos; manual clipping has no minimum.
  const tooShort = durationSecs < MIN_AI_CLIP_SECONDS

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
      // Review happens in Studio — route there instead of rendering inline.
      router.push(`/studio/clips/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the agent")
      setSubmitting(false)
    }
  }

  return (
    <div>
      {tooShort ? (
        <>
          <button
            type="button"
            disabled
            aria-disabled
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/40 text-primary-foreground py-2.5 text-sm font-bold cursor-not-allowed opacity-60"
          >
            <Sparkles size={16} />
            Generate Clips with the AI Agent
          </button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            AI clipping is for videos over {Math.round(MIN_AI_CLIP_SECONDS / 60)} minutes — use manual clipping for shorter ones.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
        >
          <Sparkles size={16} />
          Generate Clips with the AI Agent
        </button>
      )}

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
              An AI agent reads &amp; clips <span className="text-foreground">{videoTitle}</span> for you — fully autonomous. This is a paid service. You&apos;ll review and publish each clip in Studio.
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

                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  You pay per second consumed as the agent works — each chunk is its own on-chain settlement on Arc. Your budget is a spending cap; you&apos;re only charged for what&apos;s used. Est. cost for this video:{" "}
                  <span className="text-foreground font-semibold">~{fmtUsd(estCost)}</span>.
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
