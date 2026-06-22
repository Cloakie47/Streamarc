import { auth } from "@/app/lib/auth"
import { redirect, notFound } from "next/navigation"
import AppShell from "@/app/components/layout/AppShell"
import ClipJobReview from "@/app/components/studio/ClipJobReview"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ jobId: string }>
}

// Studio review page for one clip job. The job (incl. pending proposals) is
// loaded from the DB by the client component on mount and re-fetched live, so a
// hard refresh or returning later always shows the current state.
export default async function StudioClipJobPage({ params }: Props) {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const { jobId } = await params
  const supabase = getSupabaseAdmin()

  const { data: job } = await supabase.from("agent_jobs").select("id, video_id").eq("id", jobId).maybeSingle()
  if (!job) notFound()

  const { data: video } = await supabase
    .from("videos")
    .select("id, title, cloudflare_uid, rate_per_sec, creator_id, owner_id")
    .eq("id", job.video_id)
    .maybeSingle()
  if (!video?.cloudflare_uid) notFound()

  // Owner/admin only.
  const ownerId = (video as { owner_id?: string | null }).owner_id ?? video.creator_id
  const role = (session.user as { role?: string }).role
  if (session.user.id !== ownerId && role !== "admin") notFound()

  return (
    <AppShell currentPage="studio-clips">
      <ClipJobReview
        jobId={job.id}
        sourceCloudflareUid={video.cloudflare_uid}
        sourceRate={Number(video.rate_per_sec ?? 0)}
        videoTitle={video.title ?? "Clip job"}
      />
    </AppShell>
  )
}
