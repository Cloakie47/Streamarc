import { supabaseAdmin } from "@/app/lib/supabase-server"
import { notFound } from "next/navigation"
import WatchPage from "@/app/components/watch/WatchPage"

interface Props {
  params: Promise<{ videoId: string }>
}

export default async function WatchVideoPage({ params }: Props) {
  const { videoId } = await params

  const { data: video } = await supabaseAdmin
    .from("videos")
    .select("id, creator_id, title, description, status, rate_per_sec, duration_secs, cloudflare_uid")
    .eq("id", videoId)
    .eq("status", "live")
    .single()

  if (!video) notFound()

  return (
    <WatchPage
      videoId={video.id}
      creatorId={video.creator_id}
      title={video.title}
      description={video.description ?? ""}
      cloudflareUid={video.cloudflare_uid ?? undefined}
      ratePerSecond={Number(video.rate_per_sec ?? 0.00003)}
      durationSecs={video.duration_secs ?? 272}
    />
  )
}
