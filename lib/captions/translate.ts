// lib/captions/translate.ts
// Translate a WebVTT caption file's cue text into a target language with
// claude-haiku-4-5, preserving the WEBVTT structure and every timecode exactly.
// Only the spoken text between timestamps is translated; the header, cue
// identifiers, NOTE blocks, and `-->` timecode lines are kept byte-for-byte.
//
// Mirrors the existing raw-HTTP Claude call convention in lib/agent/analyze.ts
// (x-api-key + anthropic-version), not the SDK.

import { languageName } from "./languages.ts"

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const MODEL = "claude-haiku-4-5"
// Keep batches small: non-Latin scripts (Devanagari, Chinese, Malayalam) are
// token-heavy, so a large batch + low max_tokens truncates the JSON mid-array
// and parsing fails — which previously fell back to English silently.
const BATCH_SIZE = 40
const MAX_TOKENS = 16000
const LOG = "[captions/translate]"

interface Cue {
  /** Index of the line in the VTT that holds this cue's text (we replace it). */
  lineIndex: number
  text: string
}

/**
 * Walk the VTT, returning the line array plus the cues (a timecode line is any
 * line containing `-->`; the cue text is the run of non-empty lines after it,
 * which we collapse onto the first text line so timecodes are never disturbed).
 */
function extractCues(vtt: string): { lines: string[]; cues: Cue[] } {
  const lines = vtt.replace(/\r\n/g, "\n").split("\n")
  const cues: Cue[] = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("-->") === -1) continue
    // Collect the text lines following the timecode line.
    const textLineIndices: number[] = []
    let j = i + 1
    for (; j < lines.length && lines[j].trim() !== ""; j++) textLineIndices.push(j)
    if (textLineIndices.length === 0) continue
    const text = textLineIndices.map((k) => lines[k].trim()).join(" ").trim()
    if (text) {
      // Collapse onto the first text line; blank the rest so the cue keeps its
      // timecode but the translated text sits on one line.
      cues.push({ lineIndex: textLineIndices[0], text })
      for (let k = 1; k < textLineIndices.length; k++) lines[textLineIndices[k]] = ""
    }
    i = j - 1
  }
  return { lines, cues }
}

/**
 * Parse a model response into a per-index lookup. The model is asked for a JSON
 * object keyed by cue id ({ "0": "...", "1": "..." }); we also accept a bare
 * array (mapping by position) for resilience. Returns a function that yields the
 * translation for a local cue index, or null if nothing parseable was found.
 *
 * Mapping by KEY (not array length) is the fix for the count-mismatch bug:
 * translation legitimately merges/splits prose, so an N-in / N-out array check
 * fails constantly. Keyed mapping guarantees each input cue maps to one output.
 */
function parseTranslations(raw: string): ((i: number) => string | undefined) | null {
  const stripped = raw.replace(/```json/gi, "").replace(/```/g, "").trim()

  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s)
    } catch {
      return undefined
    }
  }

  // Prefer an object keyed by cue id.
  const objStart = stripped.indexOf("{")
  const objEnd = stripped.lastIndexOf("}")
  for (const candidate of [stripped, objStart !== -1 && objEnd > objStart ? stripped.slice(objStart, objEnd + 1) : ""]) {
    if (!candidate) continue
    const parsed = tryParse(candidate)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      return (i: number) => {
        const v = obj[String(i)]
        return typeof v === "string" ? v : undefined
      }
    }
  }

  // Fall back to a positional array if that's what came back.
  const arrStart = stripped.indexOf("[")
  const arrEnd = stripped.lastIndexOf("]")
  for (const candidate of [stripped, arrStart !== -1 && arrEnd > arrStart ? stripped.slice(arrStart, arrEnd + 1) : ""]) {
    if (!candidate) continue
    const parsed = tryParse(candidate)
    if (Array.isArray(parsed)) {
      return (i: number) => {
        const v = parsed[i]
        return typeof v === "string" ? v : undefined
      }
    }
  }

  return null
}

interface BatchResult {
  /** One entry per input cue — translated where possible, source English otherwise. */
  texts: string[]
  /** True if the response parsed at all (false = retry-worthy: empty/unparseable). */
  parsed: boolean
  /** Number of cues that fell back to English (missing/blank keys). */
  missing: number
  /** Why parsing failed (set only when parsed === false). */
  reason?: string
}

async function translateBatch(texts: string[], targetLang: string, label: string): Promise<BatchResult> {
  const langName = languageName(targetLang)
  // Key each cue by its local index so the model maps input->output by id, not
  // by array position — so merging/splitting prose can't drop or shift cues.
  const input: Record<string, string> = {}
  texts.forEach((t, i) => {
    input[String(i)] = t
  })

  const user = `You are a professional subtitle translator. Translate each English subtitle cue into ${langName}.

You are given a JSON object that maps a cue id (a string number) to that cue's English text. Return a JSON object with the SAME keys, where each value is the ${langName} translation of that cue's text.

Rules:
- Translate each cue in the context of its neighbours, but return exactly ONE translation per cue id.
- Output ONLY a JSON object keyed by the same ids — no prose, no markdown code fences, no arrays, nothing before or after the object.
- Every input id MUST appear exactly once in the output. Do not merge, split, add, or drop ids.
- Each value MUST be the ${langName} translation of that cue. Do NOT leave any value in English. Keep proper nouns / brand names if they have no common ${langName} form.

Input (${texts.length} cues):
${JSON.stringify(input)}`

  console.log(`${LOG} ${label}: sending ${texts.length} cues -> ${langName} (${targetLang})`)

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: user }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error(`${LOG} ${label}: HTTP ${res.status} from Claude: ${errText}`)
    throw new Error(`translation request failed: ${res.status} ${errText}`)
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>
    stop_reason?: string
    usage?: unknown
  }
  const raw = data.content?.find((b) => b.type === "text")?.text ?? ""

  console.log(`${LOG} ${label}: stop_reason=${data.stop_reason ?? "?"} usage=${JSON.stringify(data.usage)} raw_len=${raw.length}`)
  console.log(`${LOG} ${label}: raw Claude response >>>\n${raw}\n<<<`)

  if (!raw.trim()) {
    console.error(`${LOG} ${label}: parse failed reason=empty-response — will retry, else English for this batch`)
    return { texts, parsed: false, missing: texts.length, reason: "empty-response" }
  }
  if (data.stop_reason === "max_tokens") {
    console.error(`${LOG} ${label}: response was TRUNCATED (stop_reason=max_tokens) — JSON likely incomplete; reduce BATCH_SIZE`)
  }

  const lookup = parseTranslations(raw)
  if (!lookup) {
    console.error(`${LOG} ${label}: parse failed reason=no-json — will retry, else English for this batch`)
    return { texts, parsed: false, missing: texts.length, reason: "no-json" }
  }

  // Map by key — every cue gets its own translation; only missing/blank ids fall
  // back to English, and only for THAT cue (never the whole batch).
  let missing = 0
  const out = texts.map((src, i) => {
    const v = lookup(i)
    if (typeof v === "string" && v.trim()) return v.trim()
    missing++
    console.warn(`${LOG} ${label}: per-cue FALLBACK cue=${i} (missing/blank translation) — kept English: "${src.slice(0, 60)}"`)
    return src
  })

  const firstTranslated = out.find((t, i) => t !== texts[i])
  console.log(`${LOG} ${label}: ${texts.length - missing}/${texts.length} cues translated. e.g. "${(texts[0] ?? "").slice(0, 50)}" -> "${(firstTranslated ?? out[0] ?? "").slice(0, 50)}"`)
  return { texts: out, parsed: true, missing }
}

/**
 * Translate the cue text of an English VTT into `targetLang`, returning a new
 * VTT with identical timecodes/structure and translated text.
 */
export async function translateVtt(englishVtt: string, targetLang: string): Promise<string> {
  const { lines, cues } = extractCues(englishVtt)
  console.log(`${LOG} translateVtt: ${cues.length} cues -> ${languageName(targetLang)} (${targetLang}), batchSize=${BATCH_SIZE}`)
  if (cues.length === 0) {
    console.warn(`${LOG} translateVtt: no cues found in source VTT — returning source unchanged`)
    return englishVtt
  }

  const totalBatches = Math.ceil(cues.length / BATCH_SIZE)
  let missingCues = 0

  for (let i = 0; i < cues.length; i += BATCH_SIZE) {
    const batchNo = Math.floor(i / BATCH_SIZE) + 1
    const batch = cues.slice(i, i + BATCH_SIZE)
    const sourceTexts = batch.map((c) => c.text)

    let result = await translateBatch(sourceTexts, targetLang, `batch ${batchNo}/${totalBatches}`)
    // Retry ONLY when the whole response was unparseable (transient/truncated),
    // not for partial per-cue misses — those are handled per-cue.
    if (!result.parsed) {
      console.warn(`${LOG} batch ${batchNo}/${totalBatches}: retrying once after ${result.reason}`)
      result = await translateBatch(sourceTexts, targetLang, `batch ${batchNo}/${totalBatches} (retry)`)
    }
    if (!result.parsed) {
      console.error(`${LOG} batch ${batchNo}/${totalBatches}: GAVE UP after retry (${result.reason}) — these ${batch.length} cues stay ENGLISH`)
    }

    missingCues += result.missing
    batch.forEach((cue, k) => {
      lines[cue.lineIndex] = result.texts[k]
    })
  }

  if (missingCues > 0) {
    console.error(`${LOG} translateVtt: WARNING — ${missingCues}/${cues.length} cue(s) fell back to ENGLISH for "${targetLang}".`)
  } else {
    console.log(`${LOG} translateVtt: complete — all ${cues.length} cue(s) translated to ${targetLang}`)
  }
  return lines.join("\n")
}
