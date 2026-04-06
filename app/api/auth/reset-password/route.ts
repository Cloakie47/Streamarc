import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { user_id, code, new_password } = await req.json();

    if (!user_id || !code || !new_password) {
      return NextResponse.json({ error: "user_id, code and new_password required" }, { status: 400 });
    }

    if (new_password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Verify reset code
    const { data: resetCode } = await getSupabaseAdmin()
      .from("verification_codes")
      .select("*")
      .eq("user_id", user_id)
      .eq("code", code)
      .eq("type", "password_reset")
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!resetCode) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
    }

    // Mark code as used
    await getSupabaseAdmin()
      .from("verification_codes")
      .update({ used: true })
      .eq("id", resetCode.id);

    // Hash new password
    const password_hash = await bcrypt.hash(new_password, 12);

    // Update password
    await getSupabaseAdmin().from("users").update({ password_hash }).eq("id", user_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Reset password error:", err?.message);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
