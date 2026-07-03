// lib/dubs/elevenlabs.ts
// ElevenLabs Dubbing API client (worker-side only — the key never reaches the
// browser). Flow: create dub from a source MP4 URL -> poll until "dubbed" ->
// download the audio-only MP3 for the target language.
//
//   POST /v1/dubbing                      (multipart: source_url, target_lang)
//   GET  /v1/dubbing/{id}                 (status: dubbing | dubbed | failed)
//   GET  /v1/dubbing/{id}/audio/{lang}    (audio-only MP3 bytes)
//
// Requires ELEVENLABS_API_KEY (paid plan with dubbing; see route docs).

const BASE = "https://api.elevenlabs.io/v1/dubbing"

const POLL_INTERVAL_MS = 10_000
const POLL_TIMEOUT_MS = 10 * 60_000 // dubbing a <=2min video typically takes 1-4 min

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error("ELEVENLABS_API_KEY must be set in env")
  return key
}

/**
 * Map ElevenLabs' error body to a clear, user-facing message. Most important:
 * exhausted credits must not read as an opaque HTTP failure.
 */
function elevenLabsError(context: string, status: number, body: string): Error {
  const lower = body.toLowerCase()
  if (status === 401 && lower.includes("quota")) {
    return new Error("ElevenLabs credits exhausted — audio translation is temporarily unavailable. (quota_exceeded)")
  }
  if (lower.includes("quota_exceeded") || lower.includes("insufficient credits") || lower.includes("character limit")) {
    return new Error("ElevenLabs credits exhausted — audio translation is temporarily unavailable. (quota_exceeded)")
  }
  if (status === 401) {
    return new Error(`ElevenLabs API key rejected (${context}) — check ELEVENLABS_API_KEY.`)
  }
  return new Error(`ElevenLabs ${context} failed: ${status} ${body.slice(0, 300)}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Start a dub from a publicly fetchable source video URL. Returns the dubbing id. */
export async function createDub(sourceUrl: string, targetLang: string): Promise<string> {
  const form = new FormData()
  form.append("source_url", sourceUrl)
  form.append("target_lang", targetLang)
  form.append("mode", "automatic")
  form.append("num_speakers", "0") // auto-detect
  // Keep the creator's own voice (voice cloning ON — the API default; stated
  // explicitly so the intent survives API-default changes).
  form.append("disable_voice_cloning", "false")

  const res = await fetch(BASE, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw elevenLabsError("dub create", res.status, body)
  }
  const data = (await res.json()) as { dubbing_id?: string }
  if (!data.dubbing_id) throw new Error(`ElevenLabs dub create returned no dubbing_id: ${JSON.stringify(data).slice(0, 300)}`)
  return data.dubbing_id
}

/** Poll until the dub is done. Throws with ElevenLabs' own error text on failure/timeout. */
export async function waitForDub(dubbingId: string): Promise<void> {
  const startedAt = Date.now()
  for (;;) {
    const res = await fetch(`${BASE}/${dubbingId}`, { headers: { "xi-api-key": apiKey() } })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw elevenLabsError("dub status", res.status, body)
    }
    const data = (await res.json()) as { status?: string; error?: string | null }
    if (data.status === "dubbed") return
    if (data.status === "failed") {
      throw new Error(`ElevenLabs dubbing failed: ${data.error ?? "no error detail provided"}`)
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`ElevenLabs dubbing timed out after ${POLL_TIMEOUT_MS / 1000}s (status: ${data.status ?? "unknown"})`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

/** Download the dubbed audio-only MP3 for the target language. */
export async function fetchDubbedAudio(dubbingId: string, lang: string): Promise<Buffer> {
  const res = await fetch(`${BASE}/${dubbingId}/audio/${lang}`, { headers: { "xi-api-key": apiKey() } })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw elevenLabsError("dubbed-audio download", res.status, body)
  }
  return Buffer.from(await res.arrayBuffer())
}
