"use client"

import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react"

// Draggable filmstrip trim control. Thumbnails span [boundStart, boundEnd] and
// the two handles set the clip in/out within those bounds — for agent review
// the bounds are the analyzed (purchased) region; for manual clipping they are
// the whole video. The clip length is held within [minLen, maxLen]. Pointer
// events cover both mouse and touch.
const THUMB_COUNT = 10
const DEFAULT_MIN_LEN = 20
const DEFAULT_MAX_LEN = 90
const STREAM_HOST = "https://customer-l6swr9mq7yyb3m7m.cloudflarestream.com"

const fmtTime = (s: number) => {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`
}

export interface TrimSelectorProps {
  /** Lower bound the in-point can reach (analyzed_start for agent, 0 for manual). */
  boundStart: number
  /** Upper bound the out-point can reach (analyzed_end for agent, duration for manual). */
  boundEnd: number
  /** Current in/out (committed) — the selector reflects these and reports back via onChange. */
  start: number
  end: number
  /** Source video uid for the filmstrip thumbnails. */
  sourceUid: string
  /** Called on drag end with the new whole-second in/out. */
  onChange: (start: number, end: number) => void
  /** Min clip length in seconds (default 20). Capped to the bound span. */
  minLen?: number
  /** Max clip length in seconds (default 90). */
  maxLen?: number
}

export default function TrimSelector({
  boundStart,
  boundEnd,
  start,
  end,
  sourceUid,
  onChange,
  minLen = DEFAULT_MIN_LEN,
  maxLen = DEFAULT_MAX_LEN,
}: TrimSelectorProps) {
  const span = Math.max(1, boundEnd - boundStart)
  const minLength = Math.min(minLen, span)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [localStart, setLocalStart] = useState(start)
  const [localEnd, setLocalEnd] = useState(end)
  const [dragging, setDragging] = useState<null | "in" | "out" | "move">(null)
  // For "move" (sliding the whole window): the pointer time + window at grab.
  const moveAnchor = useRef<{ pointerT: number; start: number; end: number } | null>(null)

  // Reflect committed props when not actively dragging (e.g. after a refetch).
  useEffect(() => {
    if (dragging) return
    setLocalStart(start)
    setLocalEnd(end)
  }, [start, end, dragging])

  const thumbs = Array.from({ length: THUMB_COUNT }, (_, i) => {
    const t = boundStart + (span * (i + 0.5)) / THUMB_COUNT
    return `${STREAM_HOST}/${sourceUid}/thumbnails/thumbnail.jpg?time=${Math.round(t)}s&height=80`
  })

  const pct = (t: number) => Math.min(100, Math.max(0, ((t - boundStart) / span) * 100))

  const timeFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return boundStart
    const rect = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return boundStart + frac * span
  }

  const beginDrag = (which: "in" | "out" | "move") => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation() // don't also trigger the track's tap-to-jump
    e.currentTarget.setPointerCapture(e.pointerId)
    if (which === "move") moveAnchor.current = { pointerT: timeFromClientX(e.clientX), start: localStart, end: localEnd }
    setDragging(which)
  }

  // Tap anywhere on the strip (outside the handles/band) to jump the whole
  // window there — fast positioning in a long video. Preserves clip length.
  const tapToJump = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = timeFromClientX(e.clientX)
    const width = localEnd - localStart
    const ns = Math.max(boundStart, Math.min(t - width / 2, boundEnd - width))
    setLocalStart(ns)
    setLocalEnd(ns + width)
    onChange(Math.round(ns), Math.round(ns + width))
  }

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const t = timeFromClientX(e.clientX)
    if (dragging === "in") {
      // in stays >= boundStart and within [end-maxLen, end-minLength]
      const lo = Math.max(boundStart, localEnd - maxLen)
      const hi = localEnd - minLength
      setLocalStart(Math.min(hi, Math.max(lo, t)))
    } else if (dragging === "out") {
      // out stays <= boundEnd and within [start+minLength, start+maxLen]
      const lo = localStart + minLength
      const hi = Math.min(boundEnd, localStart + maxLen)
      setLocalEnd(Math.min(hi, Math.max(lo, t)))
    } else {
      // move: slide the whole window, preserving its length, clamped to bounds.
      const anchor = moveAnchor.current
      if (!anchor) return
      const width = anchor.end - anchor.start
      const ns = Math.max(boundStart, Math.min(anchor.start + (t - anchor.pointerT), boundEnd - width))
      setLocalStart(ns)
      setLocalEnd(ns + width)
    }
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* capture may already be gone */
    }
    setDragging(null)
    moveAnchor.current = null
    onChange(Math.round(localStart), Math.round(localEnd))
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-black/20 p-2">
      <div className="flex items-center justify-between text-[10px] tabular-nums">
        <span className="text-muted-foreground">In {fmtTime(localStart)}</span>
        <span className="text-foreground font-semibold">{Math.round(localEnd - localStart)}s</span>
        <span className="text-muted-foreground">Out {fmtTime(localEnd)}</span>
      </div>

      <div ref={trackRef} onPointerDown={tapToJump} className="relative h-20 w-full cursor-pointer select-none touch-none overflow-hidden rounded-md bg-black">
        {/* Filmstrip background */}
        <div className="absolute inset-0 flex">
          {thumbs.map((u, i) => (
            <div key={i} className="h-full flex-1 bg-cover bg-center" style={{ backgroundImage: `url("${u}")` }} />
          ))}
        </div>

        {/* Dim regions outside the selection */}
        <div className="absolute inset-y-0 left-0 bg-black/60" style={{ width: `${pct(localStart)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-black/60" style={{ width: `${100 - pct(localEnd)}%` }} />

        {/* Selected region — drag the band to slide the whole window fast. */}
        <div
          role="slider"
          aria-label="Move selection"
          aria-valuenow={Math.round(localStart)}
          onPointerDown={beginDrag("move")}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`absolute inset-y-0 touch-none border-y-2 border-primary bg-primary/10 ${dragging === "move" ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ left: `${pct(localStart)}%`, right: `${100 - pct(localEnd)}%` }}
        />

        {/* In handle */}
        <div
          role="slider"
          aria-label="Clip start"
          aria-valuenow={Math.round(localStart)}
          onPointerDown={beginDrag("in")}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute inset-y-0 -ml-2 flex w-4 cursor-ew-resize touch-none items-center justify-center"
          style={{ left: `${pct(localStart)}%` }}
        >
          <div className="h-full w-1.5 rounded bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
        </div>

        {/* Out handle */}
        <div
          role="slider"
          aria-label="Clip end"
          aria-valuenow={Math.round(localEnd)}
          onPointerDown={beginDrag("out")}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute inset-y-0 -ml-2 flex w-4 cursor-ew-resize touch-none items-center justify-center"
          style={{ left: `${pct(localEnd)}%` }}
        >
          <div className="h-full w-1.5 rounded bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
        </div>
      </div>
    </div>
  )
}
