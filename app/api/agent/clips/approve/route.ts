import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { createCloudflareClip, insertClipVideoRow, triggerClipCaptions } from "@/lib/agent/clip"
import { MAX_RATE_PER_SEC } from "@/app/lib/constants"

// POST /api/agent/clips/approve
// Body: { job_id, index, title, description, rate_per_sec, start, end }
// Session-authed (owner of the source video, or admin). NOW creates the clip on
// Cloudflare with the creator's adjusted start/end, inserts the videos row with
// the creator's title/description/price (status 'live'), and marks the proposal
// approved with the created video_row_id. The Cloudflare token stays server-side.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const { job_id, index, title, description, rate_per_sec, start, end } = await req.json()
    if (!job_id || typeof index !== "number") {
      return NextResponse.json({ error: "job_id and numeric index are required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: job, error: jobErr } = await supabase.from("agent_jobs").select("id, video_id, clips").eq("id", job_id).maybeSingle()
    if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })

    const { data: video, error: videoErr } = await supabase
      .from("videos")
      .select("id, cloudflare_uid, creator_id, owner_id")
      .eq("id", job.video_id)
      .maybeSingle()
    if (videoErr) return NextResponse.json({ error: videoErr.message }, { status: 500 })
    if (!video?.cloudflare_uid) return NextResponse.json({ error: "source video not found" }, { status: 404 })

    const ownerId = video.owner_id ?? video.creator_id
    const role = (session.user as { role?: string }).role
    if (session.user.id !== ownerId && role !== "admin") {
      return NextResponse.json({ error: "Only the video's owner can approve clips" }, { status: 403 })
    }

    const clips = (Array.isArray(job.clips) ? job.clips : []) as Array<Record<string, unknown>>
    const clip = clips[index]
    if (!clip) return NextResponse.json({ error: "clip not found at index" }, { status: 404 })
    // Idempotent: already approved → return the existing row.
    if (clip.status === "approved" && clip.video_row_id) {
      return NextResponse.json({ video_row_id: clip.video_row_id, uid: clip.uid, status: "approved" })
    }

    // Clamp the creator's start/end to the analyzed bounds — never trust the client.
    const aStart = Number(clip.analyzed_start ?? clip.start)
    const aEnd = Number(clip.analyzed_end ?? clip.end)
    const s = Math.floor(Math.max(aStart, Math.min(Number(start), aEnd)))
    const e = Math.ceil(Math.min(aEnd, Math.max(Number(end), aStart)))
    if (!(e > s)) return NextResponse.json({ error: "invalid start/end" }, { status: 400 })

    const finalTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 200) : String(clip.suggested_title ?? "Clip")
    const finalDescription = typeof description === "string" ? description.trim().slice(0, 2000) : ""
    // Rate ceiling: 0 allowed (free clip), above MAX_RATE_PER_SEC rejected.
    const requestedRate = Number(rate_per_sec)
    if (rate_per_sec !== undefined && rate_per_sec !== null && (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > MAX_RATE_PER_SEC)) {
      return NextResponse.json({ error: `rate_per_sec must be between 0 and $${MAX_RATE_PER_SEC}/sec` }, { status: 400 })
    }
    const finalRate = Number.isFinite(requestedRate) && requestedRate >= 0 ? requestedRate : 0

    // Create on Cloudflare NOW, then publish the videos row.
    const { uid, durationSecs } = await createCloudflareClip(video.cloudflare_uid, s, e)
    const videoRowId = await insertClipVideoRow(supabase, {
      creatorId: ownerId,
      title: finalTitle,
      description: finalDescription,
      ratePerSec: finalRate,
      durationSecs,
      cloudflareUid: uid,
    })
    await triggerClipCaptions(uid) // best-effort CC

    clips[index] = {
      ...clip,
      status: "approved",
      uid,
      video_row_id: videoRowId,
      title: finalTitle,
      description: finalDescription,
      rate_per_sec: finalRate,
      start: s,
      end: e,
    }
    const { error: updErr } = await supabase.from("agent_jobs").update({ clips, updated_at: new Date().toISOString() }).eq("id", job_id)
    if (updErr) {
      // The proposal couldn't be marked approved — un-publish the just-created
      // clip so an UNAPPROVED clip can never be left live in Browse/Explore/clips.
      await supabase.from("videos").delete().eq("id", videoRowId)
      return NextResponse.json({ error: `clip publish failed (rolled back): ${updErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ video_row_id: videoRowId, uid, status: "approved" })
  } catch (err: any) {
    console.error("clip approve failed:", err?.message)
    return NextResponse.json({ error: err?.message ?? "approve failed" }, { status: 500 })
  }
}
