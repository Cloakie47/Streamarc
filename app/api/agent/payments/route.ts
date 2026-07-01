import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { getActingUser } from "@/app/lib/require-user"

// GET /api/agent/payments?job_id=<uuid>
// Read-only service-fee ledger for one clip job. Scoped: only the job's video
// owner (the creator who ran it) or an admin may read it.
export async function GET(req: NextRequest) {
  try {
    const actor = await getActingUser()
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const jobId = new URL(req.url).searchParams.get("job_id")
    if (!jobId) {
      return NextResponse.json({ error: "job_id query param required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Authorize: the caller must own the job's source video (or be admin).
    const { data: job } = await supabase.from("agent_jobs").select("video_id").eq("id", jobId).maybeSingle()
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 })
    const { data: video } = await supabase.from("videos").select("creator_id, owner_id").eq("id", job.video_id).maybeSingle()
    const ownerId = video?.owner_id ?? video?.creator_id
    if (ownerId !== actor.id && actor.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("clip_payments")
      .select("id, job_id, creator_id, video_id, direction, amount, circle_tx, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = data ?? []
    const consumed = rows.filter((r) => r.direction === "consume").reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const refunded = rows.filter((r) => r.direction === "refund").reduce((s, r) => s + (Number(r.amount) || 0), 0)

    return NextResponse.json({
      job_id: jobId,
      payments: rows,
      service_fee_charged: Number(consumed.toFixed(6)),
      refunded: Number(refunded.toFixed(6)),
    })
  } catch (err: any) {
    console.error("agent payments fetch failed:", err?.message)
    return NextResponse.json({ error: "payments fetch failed" }, { status: 500 })
  }
}
