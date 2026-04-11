import { NextRequest, NextResponse } from "next/server";
// Re-enable AI chapters: import { generateChaptersWithTranscriptionLegacy } from "@/app/lib/generate-chapters-transcription-legacy"
// and return generateChaptersWithTranscriptionLegacy({ video_id, cloudflare_uid, user_id }) instead of the 403 below.

export async function POST(req: NextRequest) {
  try {
    await req.json();

    return NextResponse.json(
      { error: "AI chapter generation is disabled. Use the chapter editor instead." },
      { status: 403 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Chapter generation failed:", message);
    return NextResponse.json({ error: "Failed to generate chapters" }, { status: 500 });
  }
}
