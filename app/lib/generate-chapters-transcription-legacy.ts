import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

/**
 * Full AI + transcription flow — kept for when AI chapter generation is re-enabled from POST or webhooks.
 */
export async function generateChaptersWithTranscriptionLegacy(body: {
  video_id: string;
  cloudflare_uid: string;
  user_id?: string;
}): Promise<NextResponse> {
  const { video_id, cloudflare_uid, user_id } = body;

  if (!video_id || !cloudflare_uid) {
    return NextResponse.json({ error: "video_id and cloudflare_uid required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: existingVideo } = await supabase
    .from("videos")
    .select("id, creator_id, title, description, duration_secs, chapters")
    .eq("id", video_id)
    .single();

  if (!existingVideo) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (user_id && existingVideo.creator_id !== user_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (existingVideo.chapters) {
    const cached =
      typeof existingVideo.chapters === "string"
        ? (JSON.parse(existingVideo.chapters) as { time: number; title: string }[])
        : (existingVideo.chapters as { time: number; title: string }[]);
    return NextResponse.json({ success: true, chapters: cached, cached: true });
  }

  const captionsRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${cloudflare_uid}/captions`,
    {
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      },
    },
  );

  let transcript = "";

  if (captionsRes.ok) {
    const captionsData = (await captionsRes.json()) as { result?: Array<{ language?: string }> };
    const captions = captionsData.result ?? [];

    if (captions.length > 0) {
      const customerCode = process.env.NEXT_PUBLIC_CLOUDFLARE_CUSTOMER_CODE;
      const subdomain = customerCode?.split(".")[0]?.replace("customer-", "") ?? "";
      const vttRes = await fetch(
        `https://customer-${subdomain}.cloudflarestream.com/${cloudflare_uid}/captions/${captions[0].language}`,
      );
      if (vttRes.ok) {
        transcript = await vttRes.text();
      }
    }
  }

  if (!transcript) {
    transcript = `Video title: ${existingVideo.title}\nDescription: ${existingVideo.description ?? "No description"}\nDuration: ${existingVideo.duration_secs ?? 0} seconds`;
  }

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are analyzing a video transcript or description to generate chapter markers.

Based on the following content, generate 3-7 chapter markers with timestamps and titles.

Content:
${transcript.slice(0, 8000)}

Return ONLY a valid JSON array in this exact format, no other text:
[
  {"time": 0, "title": "Introduction"},
  {"time": 45, "title": "Main Topic"},
  {"time": 120, "title": "Demo"}
]

Rules:
- "time" must be in seconds (integer)
- "title" must be short (2-5 words)
- First chapter must start at 0
- Space chapters evenly through the video
- If no transcript is available, create logical chapters based on the title/description`,
        },
      ],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    console.error("Claude error:", err);
    return NextResponse.json({ error: "Failed to generate chapters" }, { status: 500 });
  }

  const claudeData = (await claudeRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = claudeData.content?.find((b) => b.type === "text")?.text ?? "[]";

  let chapters: { time: number; title: string }[] = [];
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    chapters = JSON.parse(clean) as { time: number; title: string }[];
  } catch {
    console.error("Failed to parse chapters:", text);
    chapters = [{ time: 0, title: "Introduction" }];
  }

  await supabase.from("videos").update({ chapters: JSON.stringify(chapters) }).eq("id", video_id);

  console.log("Chapters generated:", chapters);

  return NextResponse.json({ success: true, chapters });
}
