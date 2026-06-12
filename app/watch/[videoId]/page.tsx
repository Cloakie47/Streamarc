import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { notFound, redirect } from "next/navigation"
import WatchPage, { type UpNextVideo } from "@/app/components/watch/WatchPage"

type CreatorRow = { channel_name: string | null; display_name: string | null }

function channelLabelFromJoin(users: CreatorRow | CreatorRow[] | null) {
  if (!users) return "Creator"
  const u = Array.isArray(users) ? users[0] : users
  if (!u) return "Creator"
  if (u.channel_name?.trim()) return u.channel_name
  if (u.display_name?.trim()) return u.display_name
  return "Creator"
}

interface Props {
  params: Promise<{ videoId: string }>
}

export default async function WatchVideoPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const { videoId } = await params
  const supabase = getSupabaseAdmin()

  const { data: video } = await supabase
    .from("videos")
    .select("id, creator_id, owner_id, title, description, status, rate_per_sec, duration_secs, cloudflare_uid, chapters")
    .eq("id", videoId)
    .eq("status", "live")
    .single()

  if (!video) notFound()

  // Clip Agent: who may generate clips, and this video's already-published clips.
  const ownerId = (video as { owner_id?: string | null }).owner_id ?? video.creator_id
  const role = (session.user as { role?: string }).role
  const canGenerateClips = session.user.id === ownerId || role === "admin"

  const { data: agentJobs } = await supabase
    .from("agent_jobs")
    .select("clips")
    .eq("video_id", videoId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(20)

  type RawAgentClip = { uid?: string; video_row_id?: string; title?: string; hook?: string; confidence?: number }
  const rawClips: RawAgentClip[] = ((agentJobs ?? []) as Array<{ clips: unknown }>).flatMap((j) =>
    Array.isArray(j.clips) ? (j.clips as RawAgentClip[]) : [],
  )
  const clipRowIds = rawClips.map((c) => c.video_row_id).filter(Boolean) as string[]
  let liveIds = new Set<string>()
  if (clipRowIds.length > 0) {
    const { data: liveRows } = await supabase.from("videos").select("id").in("id", clipRowIds).eq("status", "live")
    liveIds = new Set((liveRows ?? []).map((r) => r.id))
  }
  const seenClip = new Set<string>()
  const agentClips = rawClips
    .filter((c) => c.uid && c.video_row_id && liveIds.has(c.video_row_id) && !seenClip.has(c.video_row_id) && seenClip.add(c.video_row_id))
    .map((c) => ({
      video_row_id: c.video_row_id!,
      uid: c.uid!,
      title: c.title ?? "Clip",
      hook: c.hook ?? "",
      confidence: Number(c.confidence) || 0,
    }))

  const [{ data: creator }, { data: upNextRows }] = await Promise.all([
    supabase
      .from("users")
      .select("id, display_name, channel_name, avatar_url, is_verified")
      .eq("id", video.creator_id)
      .single(),
    supabase
      .from("videos")
      .select(
        "id, title, duration_secs, cloudflare_uid, thumbnail_url, users!creator_id (channel_name, display_name)",
      )
      .eq("status", "live")
      .neq("id", videoId)
      .order("created_at", { ascending: false })
      .limit(8),
  ])

  type UpNextRow = {
    id: string
    title: string
    duration_secs: number | null
    cloudflare_uid: string | null
    thumbnail_url: string | null
    users: CreatorRow | CreatorRow[] | null
  }

  const upNextVideos: UpNextVideo[] = ((upNextRows as UpNextRow[] | null) ?? []).map((v) => ({
    id: v.id,
    title: v.title,
    duration_secs: v.duration_secs,
    cloudflare_uid: v.cloudflare_uid,
    thumbnail_url: v.thumbnail_url,
    channelLabel: channelLabelFromJoin(v.users),
  }))

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
      upNextVideos={upNextVideos}
      canGenerateClips={canGenerateClips}
      agentClips={agentClips}
    />
  )
}
