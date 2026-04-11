import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { notFound } from "next/navigation"
import WatchPage from "@/app/components/watch/WatchPage"

interface Props {
  params: Promise<{ videoId: string }>
}

export default async function WatchVideoPage({ params }: Props) {
  const { videoId } = await params
  const supabase = getSupabaseAdmin()

  const { data: video } = await supabase
    .from("videos")
    .select("id, creator_id, title, description, status, rate_per_sec, duration_secs, cloudflare_uid, chapters")
    .eq("id", videoId)
    .eq("status", "live")
    .single()

  if (!video) notFound()

  const { data: creator } = await supabase
    .from("users")
    .select("id, display_name, channel_name, avatar_url, is_verified")
    .eq("id", video.creator_id)
    .single()

  return (
    <WatchPage
      videoId={video.id}
      creatorId={video.creator_id}
      title={video.title}
      description={video.description ?? ""}
      cloudflareUid={video.cloudflare_uid ?? undefined}
      ratePerSecond={Number(video.rate_per_sec ?? 0.00003)}
      durationSecs={video.duration_secs ?? 272}
      creator={creator}
      chapters={
        video.chapters
          ? (typeof video.chapters === "string"
              ? (JSON.parse(video.chapters) as { time: number; title: string }[])
              : (video.chapters as { time: number; title: string }[]))
          : null
      }
    />
  )
}
