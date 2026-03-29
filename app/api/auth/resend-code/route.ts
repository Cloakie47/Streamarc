import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/app/lib/supabase-server"
import { sendVerificationCode, generateCode } from "@/app/lib/email"

export async function POST(req: NextRequest) {
  try {
    const { user_id, email } = await req.json()

    if (!user_id || !email) {
      return NextResponse.json({ error: "user_id and email required" }, { status: 400 })
    }

    // Check user exists and is not already verified
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, email_verified")
      .eq("id", user_id)
      .single()

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.email_verified) {
      return NextResponse.json({ error: "Email already verified" }, { status: 400 })
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Delete existing unused codes
    await supabaseAdmin
      .from("verification_codes")
      .delete()
      .eq("user_id", user_id)
      .eq("used", false)

    // Create new code
    await supabaseAdmin.from("verification_codes").insert({
      user_id,
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt,
    })

    await sendVerificationCode(email, code)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("Resend code error:", err?.message)
    return NextResponse.json({ error: "Failed to resend code" }, { status: 500 })
  }
}
