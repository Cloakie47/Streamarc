"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { VideoCard, mapRowToVideo, type ApiVideoRow } from "@/app/components/browse/VideoShelf"

/** Renders agent-generated clip rows in the existing browse card grid. */
export default function ClipsGrid({ rows }: { rows: ApiVideoRow[] }) {
  const router = useRouter()
  // Stable identity so memoized VideoCards don't re-render on parent state changes.
  const openWatch = useCallback((id: string) => void router.push(`/watch/${id}`), [router])

  if (rows.length === 0) {
    return <p className="text-sm text-sa-text-3">No agent clips have been published yet — generate some from a video page.</p>
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((r, i) => (
        <VideoCard key={r.id} video={mapRowToVideo(r, i)} onPlay={openWatch} />
      ))}
    </div>
  )
}
