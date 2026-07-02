import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { notFound, redirect } from "next/navigation"
import WatchPage, { type UpNextVideo } from "@/app/components/watch/WatchPage"
import { MAX_RATE_PER_SEC } from "@/app/lib/constants"

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

  // Measured speech density (words/sec) for the AI-clipping gate. Separate
  // best-effort query so a missing column (migration not run yet) can never
  // break the watch page — null = unknown, the UI stays enabled.
  let speechWps: number | null = null
  const { data: densityRow, error: densityErr } = await supabase
    .from("videos")
    .select("speech_wps")
    .eq("id", videoId)
    .maybeSingle()
  if (!densityErr && typeof (densityRow as { speech_wps?: number } | null)?.speech_wps === "number") {
    speechWps = Number((densityRow as { speech_wps: number }).speech_wps)
  }

  const { data: agentJobs } = await supabase
    .from("agent_jobs")
    .select("clips")
    .eq("video_id", videoId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(20)

  type RawAgentClip = { status?: string; uid?: string; video_row_id?: string; title?: string; suggested_title?: string; hook?: string; confidence?: number }
  const rawClips: RawAgentClip[] = ((agentJobs ?? []) as Array<{ clips: unknown }>).flatMap((j) =>
    Array.isArray(j.clips) ? (j.clips as RawAgentClip[]) : [],
  )
  // Only APPROVED proposals (created on Cloudflare + published) surface here.
  const approved = rawClips.filter((c) => c.status === "approved" && c.uid && c.video_row_id)
  const clipRowIds = approved.map((c) => c.video_row_id).filter(Boolean) as string[]
  let liveIds = new Set<string>()
  if (clipRowIds.length > 0) {
    const { data: liveRows } = await supabase.from("videos").select("id").in("id", clipRowIds).eq("status", "live")
    liveIds = new Set((liveRows ?? []).map((r) => r.id))
  }
  const seenClip = new Set<string>()
  const agentClips = approved
    .filter((c) => liveIds.has(c.video_row_id!) && !seenClip.has(c.video_row_id!) && seenClip.add(c.video_row_id!))
    .map((c) => ({
      video_row_id: c.video_row_id!,
      uid: c.uid!,
      title: c.title ?? c.suggested_title ?? "Clip",
      hook: c.hook ?? "",
      confidence: Number(c.confidence) || 0,
    }))

  // Manual clips: videos cut by hand from this source. Surfaced alongside agent
  // clips (same shape); confidence 0 so no agent-style badge is shown.
  const { data: manualRows } = await supabase
    .from("videos")
    .select("id, cloudflare_uid, title, description")
    .eq("clipped_from", videoId)
    .eq("clip_origin", "manual")
    .eq("status", "live")
    .order("created_at", { ascending: false })
  for (const m of (manualRows ?? []) as Array<{ id: string; cloudflare_uid: string | null; title: string | null; description: string | null }>) {
    if (!m.cloudflare_uid || seenClip.has(m.id)) continue
    seenClip.add(m.id)
    agentClips.push({ video_row_id: m.id, uid: m.cloudflare_uid, title: m.title ?? "Clip", hook: m.description ?? "", confidence: 0 })
  }

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
      // Clamped to the platform ceiling so the meter/display always match what
      // settle-session (also clamped) will actually charge.
      ratePerSecond={Math.min(Number(video.rate_per_sec ?? 0.00003), MAX_RATE_PER_SEC)}
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
      speechWps={speechWps}
    />
  )
}
