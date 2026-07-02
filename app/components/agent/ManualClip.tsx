"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Stream, type StreamPlayerApi } from "@cloudflare/stream-react"
import { Scissors, X, Loader2 } from "lucide-react"
import TrimSelector from "@/app/components/studio/TrimSelector"
import { MAX_RATE_PER_SEC } from "@/app/lib/constants"

export interface ManualClipProps {
  videoId: string
  sourceCloudflareUid: string
  durationSecs: number
  ratePerSecond: number
  videoTitle: string
}

// Watch-page control (owner/admin only): clip your own video by hand — pick the
// segment on the filmstrip, set title/description/price, and cut. FREE: no agent,
// no analysis, no per-second consumption, no service fee. The cut happens via the
// same Cloudflare clip path the agent uses (server-side, in /api/clips/manual).
export default function ManualClip({ videoId, sourceCloudflareUid, durationSecs, ratePerSecond, videoTitle }: ManualClipProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [rate, setRate] = useState(String(ratePerSecond ?? 0))
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Math.min(90, Math.max(20, Math.round(durationSecs))))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const playerRef = useRef<StreamPlayerApi | undefined>(undefined)

  async function create() {
    if (!title.trim()) {
      setError("Title required")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/clips/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          title: title.trim(),
          description: description.trim(),
          rate_per_sec: Number(rate) || 0,
          start,
          end,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "Failed to create clip")
      // Clip is live — open it.
      router.push(`/watch/${data.video_row_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create clip")
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold hover:bg-white/5 transition-colors"
      >
        <Scissors size={16} />
        Clip manually — free
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
          <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => !busy && setModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
              disabled={busy}
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Scissors size={18} className="text-primary" />
              <h2 className="text-lg font-bold">Clip manually</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Cut <span className="text-foreground">{videoTitle}</span> yourself — drag the handles to pick the segment. This is free; you&apos;re just clipping your own footage.
            </p>

            <div className="flex flex-col gap-4">
              {/* Preview: the source video scrubbed to [start, end]. Remounts on
                  change so startTime updates; onTimeUpdate stops at the out-point. */}
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

              {/* Trim across the WHOLE video (bounds 0 → duration). */}
              <TrimSelector
                boundStart={0}
                boundEnd={Math.max(1, Math.round(durationSecs))}
                start={start}
                end={end}
                sourceUid={sourceCloudflareUid}
                onChange={(s, e) => {
                  setStart(s)
                  setEnd(e)
                }}
              />

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Clip title" className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50" />

                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Watch price (USDC / second) — max ${MAX_RATE_PER_SEC}/sec</label>
                <input type="number" step="0.00001" min="0" max={MAX_RATE_PER_SEC} value={rate} onChange={(e) => setRate(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={busy || !title.trim()}
                  className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
                  {busy ? "Creating clip…" : "Create clip"}
                </button>
              </div>
              {busy && <p className="text-xs text-muted-foreground">Cutting on Cloudflare — this can take up to a minute.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
