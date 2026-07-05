// lib/agent/transcript.ts
// Cloudflare-captions transcript source for the Clip Agent.
//
// Generates English captions for a Stream video (if not already present),
// polls until ready, downloads the VTT, and parses it into ordered
// [{ start, end, text }] segments with millisecond-precision timestamps.
//
// Endpoints/behaviour were validated in SPIKE-RESULTS.md §1:
//   POST /accounts/{ACCT}/stream/{uid}/captions/en/generate   (start generation)
//   GET  /accounts/{ACCT}/stream/{uid}/captions/en            (poll status)
//   GET  /accounts/{ACCT}/stream/{uid}/captions/en/vtt        (raw text/vtt)
// All three use the API domain + Bearer token. Generation took < ~40s for a
// 60s video in the spike; we poll up to a few minutes to be safe.
//
// This module does NO payment and NO database work — it is pure transcription.

export interface Segment {
  /** Cue start, seconds (float, ms precision). */
  start: number
  /** Cue end, seconds. */
  end: number
  /** Spoken text for the cue. */
  text: string
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
const STREAM_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream`

const LANG = "en"
const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 180_000 // 3 min — generation was sub-40s in the spike

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cfFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!ACCOUNT_ID || !API_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in env")
  }
  return fetch(`${STREAM_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_TOKEN}`, ...(init?.headers ?? {}) },
  })
}

type CaptionState = "ready" | "inprogress" | "none" | "error"

/**
 * Thrown when Cloudflare reports the caption track errored — it could not
 * transcribe the video (typically no captionable speech: music, silence).
 * Callers treat this as a clean no-speech DECLINE, never a raw failure.
 */
export class CaptionsUnavailableError extends Error {
  constructor(uid: string) {
    super(`Cloudflare could not generate captions for ${uid}. The video likely has no captionable speech.`)
    this.name = "CaptionsUnavailableError"
  }
}

/** Current generation status for the English caption track. "none" = not requested yet. */
async function getCaptionState(uid: string): Promise<CaptionState> {
  const res = await cfFetch(`/${uid}/captions/${LANG}`)
  if (res.status === 404) return "none"
  if (!res.ok) throw new Error(`caption status check failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { result?: { status?: string } }
  const status = data.result?.status
  if (status === "ready") return "ready"
  if (status === "error") return "error" // CF gave up — fail fast, don't poll to timeout
  if (status) return "inprogress"
  return "none"
}

/**
 * Ensure English captions exist and are ready. Idempotent: if they're already
 * `ready` we return immediately without regenerating; if generation is already
 * in progress we just poll it.
 *
 * Exported for reuse by the paid-subtitles feature (English source track). The
 * agent pipeline's behaviour is unchanged.
 */
export async function ensureCaptions(uid: string): Promise<void> {
  let state = await getCaptionState(uid)

  if (state === "ready") return // already generated — do not regenerate
  if (state === "error") throw new CaptionsUnavailableError(uid) // fail fast, no 3-min poll

  if (state === "none") {
    const gen = await cfFetch(`/${uid}/captions/${LANG}/generate`, { method: "POST" })
    // 409 = a generation is already underway for this language; treat as in-progress.
    if (!gen.ok && gen.status !== 409) {
      throw new Error(`caption generate failed: ${gen.status} ${await gen.text()}`)
    }
    state = "inprogress"
  }

  const startedAt = Date.now()
  while (state !== "ready") {
    if (state === "error") throw new CaptionsUnavailableError(uid) // CF gave up mid-generation
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`caption generation timed out after ${POLL_TIMEOUT_MS / 1000}s for ${uid}`)
    }
    await sleep(POLL_INTERVAL_MS)
    state = await getCaptionState(uid)
  }
}

/** Download the raw VTT for the English caption track. Exported for reuse by the paid-subtitles feature. */
export async function fetchVtt(uid: string): Promise<string> {
  const res = await cfFetch(`/${uid}/captions/${LANG}/vtt`)
  if (!res.ok) throw new Error(`vtt download failed: ${res.status} ${await res.text()}`)
  return res.text()
}

/** Parse `HH:MM:SS.mmm` / `MM:SS.mmm` / `SS.mmm` into seconds. */
function timeToSeconds(ts: string): number {
  const parts = ts.trim().split(":")
  if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2])
  if (parts.length === 2) return +parts[0] * 60 + parseFloat(parts[1])
  return parseFloat(parts[0])
}

/**
 * Parse a WEBVTT document into ordered segments. Tolerates the WEBVTT header,
 * numeric cue identifiers, NOTE blocks, and multi-line cue text. Cue lines look
 * like `00:00:01.120 --> 00:00:02.100`.
 */
export function parseVtt(vtt: string): Segment[] {
  const lines = vtt.replace(/\r\n/g, "\n").split("\n")
  const segments: Segment[] = []

  for (let i = 0; i < lines.length; i++) {
    const arrow = lines[i].indexOf("-->")
    if (arrow === -1) continue

    const start = timeToSeconds(lines[i].slice(0, arrow))
    // The end timestamp is the first token after the arrow (cue settings, if any, follow it).
    const end = timeToSeconds((lines[i].slice(arrow + 3).trim().split(/\s+/)[0] ?? ""))

    const textLines: string[] = []
    i++
    for (; i < lines.length && lines[i].trim() !== ""; i++) textLines.push(lines[i].trim())

    const text = textLines.join(" ").trim()
    if (Number.isFinite(start) && Number.isFinite(end) && text) segments.push({ start, end, text })
  }

  return segments.sort((a, b) => a.start - b.start)
}

/**
 * End-to-end: generate (if needed) → poll → download VTT → parse.
 * Returns ordered segments; an empty array means the video has no captionable
 * speech (the caller's speech-density pre-check handles that case).
 */
export async function getTranscript(uid: string): Promise<Segment[]> {
  await ensureCaptions(uid)
  const vtt = await fetchVtt(uid)
  return parseVtt(vtt)
}

/** Total spoken words across all segments. */
export function totalWords(segments: Segment[]): number {
  return segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0)
}

/**
 * Cheap speech-density probe for the pre-charge AI-clipping gate: if the video
 * already has a READY (or errored) English track, measure words + words/sec
 * from the VTT — one small fetch. Returns null when density can't be known
 * cheaply (no track yet / still generating): callers must treat null as
 * "unknown, allow through" — the pipeline's own pre-check still declines at $0.
 */
export async function measureSpeechDensity(
  uid: string,
  durationSecs: number,
): Promise<{ words: number; wordsPerSecond: number } | null> {
  const state = await getCaptionState(uid)
  if (state === "error") return { words: 0, wordsPerSecond: 0 } // CF couldn't transcribe = no speech
  if (state !== "ready") return null
  const vtt = await fetchVtt(uid)
  const words = totalWords(parseVtt(vtt))
  return { words, wordsPerSecond: durationSecs > 0 ? words / durationSecs : 0 }
}

/** Concatenated transcript text for cues overlapping [start, end). */
export function textForInterval(segments: Segment[], start: number, end: number): string {
  return segments
    .filter((s) => s.end > start && s.start < end)
    .map((s) => s.text)
    .join(" ")
    .trim()
}
