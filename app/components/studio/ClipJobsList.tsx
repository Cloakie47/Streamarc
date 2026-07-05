"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Scissors, Loader2, ChevronRight } from "lucide-react"

interface JobRow {
  id: string
  video_id: string
  video_title: string
  status: string
  pending_count: number
  approved_count: number
  total_clips: number
  created_at: string
}

function statusLabel(j: JobRow): { text: string; cls: string } {
  if (j.status === "failed") return { text: "Failed", cls: "text-rose-400 border-rose-500/30 bg-rose-500/10" }
  if (j.status !== "done")
    return { text: j.status === "running" ? "Running" : "Queued", cls: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" }
  if (j.pending_count > 0) return { text: "Ready for review", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" }
  return { text: "Completed", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" }
}

export default function ClipJobsList() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/agent/jobs")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return
        if (d?.error) setError(d.error)
        else setJobs(d.jobs ?? [])
      })
      .catch(() => active && setError("Failed to load jobs"))
    return () => {
      active = false
    }
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (jobs === null)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </p>
    )
  if (jobs.length === 0)
    return <p className="text-sm text-muted-foreground">No clip jobs yet. Start one from a video&apos;s “Generate Clips” button.</p>

  return (
    <div className="flex flex-col gap-2">
      {jobs.map((j) => {
        const s = statusLabel(j)
        return (
          <Link
            key={j.id}
            href={`/studio/clips/${j.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/40 transition-colors"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
              <Scissors size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{j.video_title}</p>
              <p className="text-xs text-muted-foreground">
                {j.approved_count > 0 ? `${j.approved_count} published · ` : ""}
                {j.pending_count} pending · {new Date(j.created_at).toLocaleDateString()}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>{s.text}</span>
            <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
          </Link>
        )
      })}
    </div>
  )
}
