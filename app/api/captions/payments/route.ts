import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

// GET /api/captions/payments[?video_id=<uuid>]
// Read-only ledger of paid subtitle (translation) generations. Each row is a
// $0.05 service fee settled requester -> platform. Optionally filter by video.
// This is a service fee, NOT creator earnings.
export async function GET(req: NextRequest) {
  try {
    const videoId = req.nextUrl.searchParams.get("video_id")

    let query = getSupabaseAdmin()
      .from("caption_payments")
      .select("id, video_id, requester_id, language, amount, circle_tx, created_at")
      .order("created_at", { ascending: false })
    if (videoId) query = query.eq("video_id", videoId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = data ?? []
    const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

    return NextResponse.json({
      payments: rows,
      total_caption_fees_collected: Number(total.toFixed(6)),
    })
  } catch (err: any) {
    console.error("caption payments fetch failed:", err?.message)
    return NextResponse.json({ error: "payments fetch failed" }, { status: 500 })
  }
}
