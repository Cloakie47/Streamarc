import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/app/lib/supabase-server"
import { createGatewayWallet } from "@/app/lib/circle-wallets"

export async function POST(req: NextRequest) {
  try {
    const { user_id, code } = await req.json()

    if (!user_id || !code) {
      return NextResponse.json({ error: "user_id and code required" }, { status: 400 })
    }

    // Find valid code
    const { data: verificationCode } = await supabaseAdmin
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
    await supabaseAdmin
      .from("verification_codes")
      .update({ used: true })
      .eq("id", verificationCode.id)

    // Mark user as verified
    await supabaseAdmin
      .from("users")
      .update({ email_verified: true })
      .eq("id", user_id)

    const wallet = await createGatewayWallet(user_id)
    if (wallet) {
      await supabaseAdmin
        .from("users")
        .update({
          wallet_address: wallet.address,
          circle_wallet_id: wallet.id,
          eoa_wallet_id: wallet.eoaId,
          eoa_wallet_address: wallet.eoaAddress,
        })
        .eq("id", user_id)
    }

    return NextResponse.json({ success: true, wallet_address: wallet?.address ?? null })
  } catch (err: any) {
    console.error("Verify email error:", err?.message)
    return NextResponse.json({ error: "Verification failed" }, { status: 500 })
  }
}
