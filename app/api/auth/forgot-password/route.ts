import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-server";
import { sendVerificationCode, generateCode } from "@/app/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("id, email, password_hash")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    // Always return success to prevent email enumeration
    if (!user || !user.password_hash) {
      return NextResponse.json({ success: true });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Delete existing reset codes for this user
    await supabaseAdmin
      .from("verification_codes")
      .delete()
      .eq("user_id", user.id)
      .eq("type", "password_reset")
      .eq("used", false);

    // Create reset code
    await supabaseAdmin.from("verification_codes").insert({
      user_id: user.id,
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt,
      type: "password_reset",
    });

    await sendVerificationCode(email, code);

    return NextResponse.json({ success: true, user_id: user.id });
  } catch (err: any) {
    console.error("Forgot password error:", err?.message);
    return NextResponse.json({ error: "Failed to send reset code" }, { status: 500 });
  }
}
