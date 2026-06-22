import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// GET /api/agent/payments?job_id=<uuid>
// Read-only service-fee ledger for one clip job: the prepay, each metered
// consume charge, and the refund. This is NOT creator earnings.
export async function GET(req: NextRequest) {
  try {
    const jobId = new URL(req.url).searchParams.get("job_id")
    if (!jobId) {
      return NextResponse.json({ error: "job_id query param required" }, { status: 400 })
    }

    const { data, error } = await getSupabaseAdmin()
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
