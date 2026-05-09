import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

export async function POST(req: NextRequest) {
  try {
    const { user_id, limit } = await req.json()
    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 })
    }

    const requested = typeof limit === "number" ? limit : DEFAULT_LIMIT
    const safeLimit = Math.max(1, Math.min(MAX_LIMIT, requested))

    const { data, error } = await getSupabaseAdmin()
      .from("transactions")
      .select(
        "id, type, source_chain, destination_chain, amount, fee, recipient_address, tx_hash, status, created_at",
      )
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(safeLimit)

    if (error) {
      console.error("Transactions query failed:", error.message)
      return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 })
    }

    return NextResponse.json({ transactions: data ?? [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Transactions route failed:", message)
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 })
  }
}
