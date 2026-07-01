import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { getActingUser } from "@/app/lib/require-user"

// GET /api/captions/payments[?video_id=<uuid>]
// Read-only ledger of paid subtitle (translation) generations. Scoped to the
// authenticated user: without video_id you see only YOUR OWN caption payments;
// with video_id you must be that video's creator/owner (or admin) to see them.
// Never returns other users' financial rows.
export async function GET(req: NextRequest) {
  try {
    const actor = await getActingUser()
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const supabase = getSupabaseAdmin()
    const videoId = req.nextUrl.searchParams.get("video_id")

    let query = supabase
      .from("caption_payments")
      .select("id, video_id, requester_id, language, amount, circle_tx, created_at")
      .order("created_at", { ascending: false })

    if (videoId) {
      // A specific video's caption ledger — only its creator/owner (or admin).
      const { data: video } = await supabase.from("videos").select("creator_id, owner_id").eq("id", videoId).maybeSingle()
      if (!video) return NextResponse.json({ error: "video not found" }, { status: 404 })
      const ownerId = video.owner_id ?? video.creator_id
      if (ownerId !== actor.id && actor.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      query = query.eq("video_id", videoId)
    } else if (actor.role !== "admin") {
      // No video filter — a user only sees their own caption payments.
      query = query.eq("requester_id", actor.id)
    }

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
