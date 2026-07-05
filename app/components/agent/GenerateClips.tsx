"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Scissors, X, Loader2, Sparkles } from "lucide-react"
import { isSpeechTooSparse, MIN_AI_CLIP_SECONDS, MAX_AI_CLIP_SECONDS, computeClipQuote } from "@/app/lib/clip-config"

const fmtUsd2 = (n: number) => `$${n.toFixed(2)}`
/** Sub-cent figures at sensible precision: $0.01175 -> $0.012 */
const fmtUsd3 = (n: number) => `$${n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`

export interface GenerateClipsProps {
  videoId: string
  ratePerSecond: number
  durationSecs: number
  videoTitle: string
  /** Measured speech density (words/sec) — null = unknown (gate stays open; the server still checks). */
  speechWps?: number | null
}

// Watch-page control (owner/admin only): starts a clip job and routes the
// creator to the Studio review page. The job/review UI itself lives in Studio
// (/studio/clips/[jobId]) — nothing is rendered inline on the public watch page.
export default function GenerateClips({ videoId, durationSecs, videoTitle, speechWps = null }: GenerateClipsProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [goal, setGoal] = useState("")
  const [keywords, setKeywords] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Computed quote — the same pure function the server uses authoritatively.
  const quote = computeClipQuote(durationSecs)
  // AI clipping length band (testing): 2-60 minutes. Manual clipping has no limits.
  const tooShort = durationSecs < MIN_AI_CLIP_SECONDS
  const tooLong = durationSecs > MAX_AI_CLIP_SECONDS
  // The agent needs speech: gate off music/anime/silent videos (measured
  // density persisted on the row). Unknown (null) stays enabled — the server
  // gate re-checks before any job is created.
  const noSpeech = typeof speechWps === "number" && isSpeechTooSparse(speechWps * durationSecs, speechWps)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/agent/enqueue-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, goal: goal.trim() || undefined, keywords: keywords.trim() || undefined }),
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
      {tooShort || tooLong || noSpeech ? (
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
            {noSpeech
              ? "This video doesn't have enough speech for AI clipping. Use manual clipping instead."
              : tooLong
                ? "AI clipping supports videos up to 60 minutes during testing."
                : `AI clipping is for videos over ${Math.round(MIN_AI_CLIP_SECONDS / 60)} minutes. Use manual clipping for shorter ones.`}
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
              An AI agent reads and clips <span className="text-foreground">{videoTitle}</span>{" "}
              for you, fully autonomously. This is a paid service. You&apos;ll review and publish each clip in Studio.
            </p>

            <div className="flex flex-col gap-4">
              {/* Computed quote — no user-set budget. The server recomputes the
                  same numbers authoritatively; max is the hard consumption cap. */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  Estimated ~{fmtUsd2(quote.estimated)} <span className="font-normal text-muted-foreground">(max {fmtUsd2(quote.max)})</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {fmtUsd2(quote.fee)} service fee + metered processing (transcript skim {fmtUsd3(quote.skim)} + footage as consumed).
                  Each chunk is its own on-chain settlement on Arc. <span className="text-foreground">You pay only what the agent actually uses.</span>
                </p>
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

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                  Focus keywords (optional)
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="pricing, roadmap, demo"
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  Comma-separated topics the agent should prioritize. A bias, not a filter: a clearly better moment on another topic is still surfaced.
                </p>
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
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {submitting ? "Starting…" : `Run agent (~${fmtUsd2(quote.estimated)})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
