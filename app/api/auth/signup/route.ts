import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { supabaseAdmin } from "@/app/lib/supabase-server"
import { sendVerificationCode, generateCode } from "@/app/lib/email"

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    // Check if email already exists
    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id, email_verified")
      .eq("email", email.toLowerCase())
      .maybeSingle()

    if (existing?.email_verified) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    let userId: string

    if (existing) {
      // User exists but unverified — update password and resend code
      userId = existing.id
      await supabaseAdmin
        .from("users")
        .update({ password_hash: passwordHash })
        .eq("id", userId)
    } else {
      // Create Supabase auth user first to get UUID
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: false,
      })

      if (authError || !authData?.user) {
        console.error("Auth create error:", authError?.message)
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
      }

      const { data: newUser, error: createError } = await supabaseAdmin
        .from("users")
        .insert({
          id: authData.user.id,
          email: email.toLowerCase(),
          password_hash: passwordHash,
          role: "creator",
          email_verified: false,
          gateway_balance: 0,
        })
        .select("id")
        .single()

      if (createError) {
        console.error("Create user error:", createError.message)
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
      }

      userId = newUser.id
    }

    // Delete any existing unused codes for this email
    await supabaseAdmin
      .from("verification_codes")
      .delete()
      .eq("email", email.toLowerCase())
      .eq("used", false)

    // Create verification code
    await supabaseAdmin.from("verification_codes").insert({
      user_id: userId,
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt,
    })

    // Send email
    await sendVerificationCode(email, code)

    return NextResponse.json({ success: true, user_id: userId })
  } catch (err: any) {
    console.error("Signup error:", err?.message)
    return NextResponse.json({ error: "Signup failed" }, { status: 500 })
  }
}
