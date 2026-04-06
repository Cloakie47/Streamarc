import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { generateSecret, generateURI } from "otplib"
import QRCode from "qrcode"

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("email, totp_enabled")
      .eq("id", user_id)
      .single()

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.totp_enabled) {
      return NextResponse.json({ error: "2FA already enabled" }, { status: 400 })
    }

    // Generate TOTP secret (otplib v13+ API)
    const secret = generateSecret()

    // Save secret (not yet enabled until verified)
    await getSupabaseAdmin()
      .from("users")
      .update({ totp_secret: secret })
      .eq("id", user_id)

    const otpauth = generateURI({
      issuer: "StreamArc",
      label: user.email ?? user_id,
      secret,
    })
    const qrCode = await QRCode.toDataURL(otpauth)

    return NextResponse.json({ success: true, secret, qr_code: qrCode })
  } catch (err: any) {
    console.error("2FA setup error:", err?.message)
    return NextResponse.json({ error: "2FA setup failed" }, { status: 500 })
  }
}
