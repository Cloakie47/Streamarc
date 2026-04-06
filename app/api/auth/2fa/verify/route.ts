import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { verifySync } from "otplib"

export async function POST(req: NextRequest) {
  try {
    const { user_id, code } = await req.json()

    if (!user_id || !code) {
      return NextResponse.json({ error: "user_id and code required" }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("totp_secret, totp_enabled")
      .eq("id", user_id)
      .single()

    if (!user?.totp_secret) {
      return NextResponse.json({ error: "2FA not set up" }, { status: 400 })
    }

    const { valid: isValid } = verifySync({
      secret: user.totp_secret,
      token: String(code).trim(),
    })

    if (!isValid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 })
    }

    // Enable 2FA
    await getSupabaseAdmin()
      .from("users")
      .update({ totp_enabled: true })
      .eq("id", user_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("2FA verify error:", err?.message)
    return NextResponse.json({ error: "2FA verification failed" }, { status: 500 })
  }
}
