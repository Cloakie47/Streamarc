import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { sendVerificationCode, generateCode } from "@/app/lib/email"
import { withDeadline } from "@/app/lib/with-timeout"
import { rateLimit, clientIp } from "@/app/lib/rate-limit"

export async function POST(req: NextRequest) {
  try {
    // Per-IP throttle: no user exists yet, so key on the client IP to stop
    // account-creation + verification-email spam.
    const rl = rateLimit(`signup:${clientIp(req)}`, 5, 10 * 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many signup attempts, try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } })
    }

    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    // Check if email already exists
    const { data: existing } = await getSupabaseAdmin()
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
      // User exists but unverified â€” update password and resend code
      userId = existing.id
      await getSupabaseAdmin()
        .from("users")
        .update({ password_hash: passwordHash })
        .eq("id", userId)
    } else {
      // Create Supabase auth user first to get UUID
      const { data: authData, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: false,
      })

      if (authError || !authData?.user) {
        console.error("Auth create error:", authError?.message)
        return NextResponse.json({ error: "Failed to create account" }, { status: 500 })
      }

      const { data: newUser, error: createError } = await getSupabaseAdmin()
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
    await getSupabaseAdmin()
      .from("verification_codes")
      .delete()
      .eq("email", email.toLowerCase())
      .eq("used", false)

    // Create verification code
    await getSupabaseAdmin().from("verification_codes").insert({
      user_id: userId,
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt,
    })

    // Send the code. Bounded so a hung SMTP connection (common on hosts that
    // block outbound SMTP) can't leave the signup request — and the client
    // spinner — stuck forever. On failure we surface a clear, retryable error.
    try {
      await withDeadline(sendVerificationCode(email, code), 15000, "verification email")
    } catch (mailErr: any) {
      console.error("Signup email send failed:", mailErr?.message)
      return NextResponse.json(
        { error: "Couldn't send the verification email — please try again in a moment." },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, user_id: userId })
  } catch (err: any) {
    console.error("Signup error:", err?.message)
    return NextResponse.json({ error: "Signup failed" }, { status: 500 })
  }
}
