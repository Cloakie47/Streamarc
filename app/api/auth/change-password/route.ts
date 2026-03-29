import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-server";
import bcrypt from "bcryptjs";
import { auth } from "@/app/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { current_password, new_password } = await req.json();

    if (!current_password || !new_password) {
      return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
    }

    if (new_password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("password_hash")
      .eq("id", session.user.id)
      .single();

    if (!user?.password_hash) {
      return NextResponse.json({ error: "No password set — sign in with Google" }, { status: 400 });
    }

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const password_hash = await bcrypt.hash(new_password, 12);

    await supabaseAdmin.from("users").update({ password_hash }).eq("id", session.user.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Change password error:", err?.message);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
