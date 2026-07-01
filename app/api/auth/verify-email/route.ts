import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { createGatewayWallet } from "@/app/lib/circle-wallets"
import { withTimeout } from "@/app/lib/with-timeout"

export async function POST(req: NextRequest) {
  try {
    const { user_id, code } = await req.json()

    if (!user_id || !code) {
      return NextResponse.json({ error: "user_id and code required" }, { status: 400 })
    }

    // Find valid code
    const { data: verificationCode } = await getSupabaseAdmin()
      .from("verification_codes")
      .select("*")
      .eq("user_id", user_id)
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (!verificationCode) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 })
    }

    // Mark code as used
    await getSupabaseAdmin()
      .from("verification_codes")
      .update({ used: true })
      .eq("id", verificationCode.id)

    // Mark user as verified
    await getSupabaseAdmin()
      .from("users")
      .update({ email_verified: true })
      .eq("id", user_id)

    // Wallet creation must NEVER block verification. If Circle is slow/unreachable
    // (a hung SDK call would otherwise leave the signup spinner stuck forever),
    // bound it and return success anyway — the wallet is created lazily on the
    // first balance fetch (see /api/gateway/balance). createGatewayWallet is
    // idempotent (keyed by refId=user_id), so the retry is safe.
    const wallet = await withTimeout(createGatewayWallet(user_id), 20000, null)
    if (wallet) {
      await getSupabaseAdmin()
        .from("users")
        .update({
          wallet_address: wallet.address,
          circle_wallet_id: wallet.id,
          eoa_wallet_id: wallet.eoaId,
          eoa_wallet_address: wallet.eoaAddress,
        })
        .eq("id", user_id)
    } else {
      console.warn(`verify-email: wallet not ready in time for ${user_id} — will create lazily on first balance fetch`)
    }

    return NextResponse.json({ success: true, wallet_address: wallet?.address ?? null })
  } catch (err: any) {
    console.error("Verify email error:", err?.message)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}
