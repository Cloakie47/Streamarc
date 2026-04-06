import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("wallet_address")
    .eq("id", id)
    .single()

  return NextResponse.json({ wallet_address: data?.wallet_address ?? null })
}
