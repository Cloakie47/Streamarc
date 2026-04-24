import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("user_id") as string;

    if (!file || !userId) {
      return NextResponse.json({ error: "file and user_id required" }, { status: 400 });
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 4MB)" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("Avatar upload error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl;

    await supabase.from("users").update({ avatar_url: url }).eq("id", userId);

    return NextResponse.json({ success: true, url });
  } catch (err: unknown) {
    console.error("Avatar upload failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
