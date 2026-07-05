// lib/agent/analyze.ts
// The Clip Agent's "judgment" — the two Claude calls in the decision loop.
//
//   scoreProbe()  — claude-haiku-4-5 (cheap): rate one probed window 0-10 for
//                   clip-worthiness, with a one-line reason.
//   selectClips() — claude-sonnet-4-6 (stronger): over the transcript the agent
//                   actually PURCHASED, pick up to 3 clips (20-60s, on sentence
//                   boundaries with 1-2s pad), each with a title and a hook.
//
// Model ids are the current Haiku 4.5 / Sonnet 4.6 ids (per the claude-api
// skill). Calls go to the Anthropic Messages API over fetch with the same
// headers the existing repo path uses (app/lib/generate-chapters-
// transcription-legacy.ts) — x-api-key + anthropic-version: 2023-06-01 — so the
// agent adds no new SDK dependency. No payment or DB work happens here.

import { textForInterval, type Segment } from "./transcript.ts"

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const SCORING_MODEL = "claude-haiku-4-5"
const MOMENT_MODEL = "claude-sonnet-4-6" // whole-transcript valuable-moment finder (fixed)
// Final-selection model is env-overridable so we can trial claude-opus-4-8 with
// a one-line .env change.
const SELECTION_MODEL = process.env.CLIP_SELECT_MODEL || "claude-sonnet-4-6"

// Final-selection rule constants (enforced in code, not by the model).
const MIN_CLIP_SECONDS = 20
const SOFT_CAP_SECONDS = 60 // preferred maximum
const HARD_CAP_SECONDS = 90 // allowed when needed to finish a complete thought (cap-flex)
const LEAD_PAD_SECONDS = 0.3 // tight lead pad — auto-captions are noisy at the head, and silence reads badly
const TAIL_PAD_SECONDS = 0.5
const DEAD_AIR_GAP_SECONDS = 1.5 // a cue gap larger than this is silence/applause; don't begin/end across it
const PAUSE_GAP_SECONDS = 0.5 // a gap to the next cue >= this means the speaker actually paused (a real sentence end)
const MAX_PAUSE_EXTENSION_SECONDS = 8 // cap how far end-snapping will extend looking for a pause
const START_PAUSE_LOOKBACK_SECONDS = 3 // how far back to snap a clip start to a post-pause speech onset

// --- Sentence-aware boundaries (pauses alone cut mid-thought on fast speech) ---
const SENTENCE_LOOKBACK_SECONDS = 6 // start snap: how far back to look for a true sentence start
const CONNECTIVE_SKIP_WINDOW_SECONDS = 6 // skip a leading transitional filler sentence within this window
/** Does this cue text end a sentence (allowing a trailing quote/bracket)? */
const SENTENCE_END_RE = /[.!?…]["'”’)\]]?\s*$/
function endsSentenceText(text: string): boolean {
  return SENTENCE_END_RE.test(text.trim())
}
/** Transitional filler openers a clip should not start on ("So, next we will…"). */
const LEADING_CONNECTIVE_RE = /^(so|and|but|then|next|also|now|okay|ok|or|plus|well|anyway|right)[,\s]/i

export interface ProbeScore {
  /** Clip-worthiness, 0 (skip) to 10 (must-clip). */
  score: number
  reason: string
}

export interface SelectedClip {
  /** Clip start, seconds (derived from locating opening_words in the cues). */
  start: number
  /** Clip end, seconds (derived from locating closing_words in the cues). */
  end: number
  title: string
  hook: string
  /** Model confidence, 0-1. */
  confidence: number
  /** The exact spoken words the clip opens on (used to locate the cut). */
  opening_words: string
  /** The exact spoken words the clip closes on. */
  closing_words: string
}

/** A contiguous span the agent paid for, with its transcript, offered to the final selector. */
export interface PurchasedRegion {
  start: number
  end: number
  transcript: string
}

/** mm:ss for prompt readability. */
function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Sonnet 4.6 / Haiku 4.5 (and older) accept `temperature`; Opus 4.7+, Fable, and
 * Mythos reject sampling params with a 400. Guards the CLIP_SELECT_MODEL=opus
 * override so an explicit temperature doesn't break the request.
 */
function supportsTemperature(model: string): boolean {
  return !/opus-4-[789]|fable|mythos/i.test(model)
}

async function callClaude(opts: { model: string; maxTokens: number; user: string; temperature?: number }): Promise<string> {
  const includeTemp = opts.temperature !== undefined && supportsTemperature(opts.model)
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      ...(includeTemp ? { temperature: opts.temperature } : {}),
      messages: [{ role: "user", content: opts.user }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${opts.model} error ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  return data.content?.find((b) => b.type === "text")?.text ?? ""
}

/** Strip ```json fences and parse, falling back on malformed output. */
function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim()) as T
  } catch {
    return fallback
  }
}

/**
 * Tolerant JSON-object extraction for model responses that may wrap the JSON in
 * code fences or leading/trailing prose. Strips fences, tries a direct parse,
 * then falls back to the first '{' … last '}'. Returns null if nothing parses.
 * (Same robust approach as the subtitle-translation parser.)
 */
function extractJsonObject<T>(text: string): T | null {
  const stripped = text.replace(/```json/gi, "").replace(/```/g, "").trim()
  const tryParse = (s: string): T | null => {
    try {
      const v = JSON.parse(s)
      return v && typeof v === "object" ? (v as T) : null
    } catch {
      return null
    }
  }
  const direct = tryParse(stripped)
  if (direct) return direct
  const start = stripped.indexOf("{")
  const end = stripped.lastIndexOf("}")
  if (start !== -1 && end > start) {
    const sliced = tryParse(stripped.slice(start, end + 1))
    if (sliced) return sliced
  }
  return null
}

/**
 * Score one probed window with the cheap model — a WHERE-to-look-closer signal,
 * not a stand-alone-clip judgment. The window is a deliberate fragment of a long
 * conversation, so the prompt tells the model NOT to penalize incompleteness and
 * to estimate whether the surrounding 1-2 minutes holds a clip-worthy moment.
 * ("Can this stand alone?" is the FINAL-selection criterion — the sonnet call.)
 * `text` is the transcript of just that window (may be empty → low score).
 */
/**
 * Optional creator-provided focus keywords, injected into brief/scoring
 * prompts as a BIAS (weight keyword-relevant moments up), never a filter.
 */
function keywordFocusBlock(keywords?: string | null): string {
  if (!keywords) return ""
  return `
FOCUS KEYWORDS: the creator asked to prioritize moments about: ${keywords}. Treat segments matching or closely related to these keywords as HIGHER-PRIORITY clip targets and weight their scores up accordingly. This is a bias, NOT a filter — a clearly superior moment on another topic should still be surfaced.
`
}

export async function scoreProbe(p: {
  windowStart: number
  windowEnd: number
  durationSecs: number
  text: string
  videoTitle?: string
  keywords?: string | null
}): Promise<ProbeScore> {
  const sampleSecs = Math.round(p.windowEnd - p.windowStart)
  const posMin = (p.windowStart / 60).toFixed(1)
  const totalMin = Math.round(p.durationSecs / 60)

  const user = `You are a clip scout sampling a long video to decide WHERE to look closer. This is a SHORT ${sampleSecs}-second SAMPLE taken at about minute ${posMin} of a ${totalMin}-minute conversation.

Do NOT penalize this sample for being incomplete or for "cutting off" — it is deliberately a fragment, not a finished clip. You are NOT judging whether this fragment can stand alone.

Score 0-10 the LIKELIHOOD that the surrounding 1-2 minutes around this sample contains a clip-worthy moment.
Signals that RAISE the score: a story starting, a strong or controversial claim, specific named numbers or facts, emotional energy, disagreement or tension, or a question being answered directly.
Signals that LOWER the score: filler, logistics/housekeeping, pure small talk, or dead air.
${keywordFocusBlock(p.keywords)}
Video title: ${p.videoTitle ?? "(unknown)"}
Sample (around minute ${posMin} of ${totalMin}):
"""
${p.text || "(no speech in this sample)"}
"""

Return ONLY JSON, no other text: {"score": <number 0-10>, "reason": "<one short sentence>"}`

  const out = await callClaude({ model: SCORING_MODEL, maxTokens: 300, user, temperature: 0 })
  const parsed = parseJson<ProbeScore>(out, { score: 0, reason: "unparseable scoring response" })
  const score = Math.max(0, Math.min(10, Number(parsed.score) || 0))
  return { score, reason: String(parsed.reason ?? "").slice(0, 200) }
}

// Long videos are analyzed in overlapping chunks so long-context attention
// doesn't drop moments in the middle.
const CHUNK_THRESHOLD_SECONDS = 1200 // > 20 min → chunk
const CHUNK_SECONDS = 600 // ~10 min windows
const CHUNK_OVERLAP_SECONDS = 60 // 1 min overlap

/** PASS 1 — an editorial reading of the whole video that defines what "important" means HERE. */
export interface EditorialBrief {
  genre: string
  speakers: string
  themes: Array<{ title: string; start: number; end: number }>
  audience: string
  /** What makes a moment clip-worthy for THIS specific video (genre/goal-derived, not generic). */
  importance_criteria: string
  /** One-line: genre + the derived importance criteria. */
  summary: string
}

/** A high-value moment located against the editorial brief's criteria. */
export interface ValuableMoment {
  start: number
  end: number
  score: number
  what: string
  why: string
}

const EMPTY_BRIEF: EditorialBrief = {
  genre: "unknown",
  speakers: "unknown",
  themes: [],
  audience: "general",
  importance_criteria: "strong claims, announcements, specific numbers, complete stories, and sharp direct answers",
  summary: "unknown — generic criteria",
}

/**
 * PASS 1: read the FULL transcript and produce an editorial brief — genre,
 * speakers, themes, audience, and (critically) what "importance" means for THIS
 * video, derived from its genre/content and the creator's goal (not a generic
 * rubric). The brief steers pass-2 moment scoring.
 */
export async function generateEditorialBrief(p: {
  segments: Segment[]
  durationSecs: number
  videoTitle?: string
  goal: string
  keywords?: string | null
}): Promise<EditorialBrief> {
  if (p.segments.length === 0) return EMPTY_BRIEF
  const transcript = p.segments.map((s) => `${Math.round(s.start)}s ${s.text}`).join("\n")
  const totalMin = Math.round(p.durationSecs / 60)

  const user = `You are a senior video editor preparing to clip a ${totalMin}-minute video. Read the FULL transcript and produce an EDITORIAL BRIEF.

The creator's goal for these clips is: ${p.goal}
${keywordFocusBlock(p.keywords)}
Determine:
- genre: what kind of video this is (AMA, tutorial, debate, sermon, comedy, interview, keynote, panel, ...).
- speakers: who is speaking (names/roles if inferable).
- themes: the 3-5 main themes/segments, each with a rough start and end second.
- audience: who this is for.
- importance_criteria: CRITICALLY — what makes a moment "important" / clip-worthy FOR THIS SPECIFIC video. Derive it from the genre, the content, and the creator's goal. Be concrete to this video; do NOT give a generic rubric.

Video title: ${p.videoTitle ?? "(unknown)"}
Full transcript (each line "<startSecond>s <text>"):
"""
${transcript}
"""

Return ONLY JSON, no other text:
{"genre":"...","speakers":"...","themes":[{"title":"...","start":<sec>,"end":<sec>}],"audience":"...","importance_criteria":"...","summary":"<one line: genre + the importance criteria>"}`

  const out = await callClaude({ model: MOMENT_MODEL, maxTokens: 1500, user, temperature: 0 })
  const parsed = parseJson<Partial<EditorialBrief>>(out, {})
  return {
    genre: String(parsed.genre ?? EMPTY_BRIEF.genre).slice(0, 120),
    speakers: String(parsed.speakers ?? EMPTY_BRIEF.speakers).slice(0, 280),
    themes: Array.isArray(parsed.themes)
      ? parsed.themes.slice(0, 8).map((t) => ({ title: String(t?.title ?? "").slice(0, 120), start: Number(t?.start) || 0, end: Number(t?.end) || 0 }))
      : [],
    audience: String(parsed.audience ?? EMPTY_BRIEF.audience).slice(0, 200),
    importance_criteria: String(parsed.importance_criteria ?? EMPTY_BRIEF.importance_criteria).slice(0, 600),
    summary: String(parsed.summary ?? `${parsed.genre ?? "unknown"} — ${parsed.importance_criteria ?? ""}`).slice(0, 300),
  }
}

function cleanMoments(raw: ValuableMoment[], durationSecs: number): ValuableMoment[] {
  return raw
    .map((m) => ({
      start: Math.max(0, Math.min(durationSecs, Number(m.start) || 0)),
      end: Math.max(0, Math.min(durationSecs, Number(m.end) || 0)),
      score: Math.max(0, Math.min(10, Number(m.score) || 0)),
      what: String(m.what ?? "").slice(0, 280),
      why: String(m.why ?? "").slice(0, 280),
    }))
    .filter((m) => m.end > m.start)
    // Deterministic ranking: score desc, then timestamp asc to break ties.
    .sort((a, b) => b.score - a.score || a.start - b.start)
}

/** Find moments within one [rangeStart, rangeEnd] segment, scored against the brief. */
async function findMomentsInRange(
  segs: Segment[],
  rangeStart: number,
  rangeEnd: number,
  p: { videoTitle?: string; goal: string; brief: EditorialBrief; durationSecs: number; keywords?: string | null },
): Promise<ValuableMoment[]> {
  if (segs.length === 0) return []
  const transcript = segs.map((s) => `${Math.round(s.start)}s ${s.text}`).join("\n")

  const user = `You are finding the most valuable short-form clip moments in a segment of a longer ${p.brief.genre} video.

The creator's goal for these clips is: ${p.goal}
What makes a moment important in THIS video (score against THESE criteria, not a generic rubric): ${p.brief.importance_criteria}
${keywordFocusBlock(p.keywords)}

This is the segment from ${fmt(rangeStart)} to ${fmt(rangeEnd)}. Identify the most valuable moments WITHIN it — each a self-contained thought (usually 20-90s) — with an approximate start/end second, a 0-10 score AGAINST THE CRITERIA ABOVE, what is said, and why it matters.

Segment transcript (each line "<startSecond>s <text>"):
"""
${transcript}
"""

Return ONLY JSON, no other text:
{"moments": [{"start": <sec>, "end": <sec>, "score": <0-10>, "what": "...", "why": "..."}]}`

  const out = await callClaude({ model: MOMENT_MODEL, maxTokens: 2000, user, temperature: 0 })
  const parsed = parseJson<{ moments?: ValuableMoment[] }>(out, {})
  return cleanMoments(Array.isArray(parsed.moments) ? parsed.moments : [], p.durationSecs)
}

/** Final ranking call: merge candidates from all chunks into the global top 5-8. */
async function mergeMoments(candidates: ValuableMoment[], p: { goal: string; brief: EditorialBrief; durationSecs: number; keywords?: string | null }): Promise<ValuableMoment[]> {
  const list = candidates.map((m, i) => `${i + 1}. ${fmt(m.start)}-${fmt(m.end)} (score ${m.score}) — ${m.what}`).join("\n")

  const user = `You are merging candidate clip moments found across overlapping chunks of a long ${p.brief.genre} video into the GLOBAL best list.

The creator's goal: ${p.goal}
Importance criteria for this video: ${p.brief.importance_criteria}
${keywordFocusBlock(p.keywords)}

Candidate moments (may include near-duplicates from overlapping chunks):
${list}

Merge duplicates and return the GLOBAL top 5-8 moments, re-ranked against the criteria. KEEP each moment's original start/end seconds and its what/why.

Return ONLY JSON, no other text:
{"moments": [{"start": <sec>, "end": <sec>, "score": <0-10>, "what": "...", "why": "..."}]}`

  const out = await callClaude({ model: MOMENT_MODEL, maxTokens: 2000, user, temperature: 0 })
  const parsed = parseJson<{ moments?: ValuableMoment[] }>(out, {})
  const merged = cleanMoments(Array.isArray(parsed.moments) ? parsed.moments : [], p.durationSecs)
  return merged.length > 0 ? merged : candidates // fall back to raw candidates if the merge call returns nothing
}

/**
 * PASS 2: find the 5-8 most valuable moments scored against the pass-1 criteria.
 * For videos longer than ~20 min, run pass 2 in overlapping ~10-min chunks and
 * merge — long-context attention otherwise misses middle moments. Returns the
 * moments plus how many chunks were analyzed.
 */
export async function findValuableMoments(p: {
  segments: Segment[]
  durationSecs: number
  videoTitle?: string
  goal: string
  brief: EditorialBrief
  keywords?: string | null
}): Promise<{ moments: ValuableMoment[]; chunks: number }> {
  if (p.segments.length === 0) return { moments: [], chunks: 0 }

  // Short video: a single pass-2 call over the whole transcript.
  if (p.durationSecs <= CHUNK_THRESHOLD_SECONDS) {
    const moments = await findMomentsInRange(p.segments, 0, p.durationSecs, p)
    return { moments: moments.slice(0, 8), chunks: 1 }
  }

  // Long video: overlapping chunks → merge.
  const stride = CHUNK_SECONDS - CHUNK_OVERLAP_SECONDS
  const all: ValuableMoment[] = []
  let chunks = 0
  for (let start = 0; start < p.durationSecs; start += stride) {
    const end = Math.min(start + CHUNK_SECONDS, p.durationSecs)
    const segs = p.segments.filter((s) => s.end > start && s.start < end)
    if (segs.length > 0) {
      chunks++
      all.push(...(await findMomentsInRange(segs, start, end, p)))
    }
    if (end >= p.durationSecs) break
  }

  const merged = await mergeMoments(cleanMoments(all, p.durationSecs), p)
  return { moments: merged.slice(0, 8), chunks }
}

/** A raw proposal from the selection model, before code applies the rules. */
export interface ClipCandidate {
  /** The exact words the clip should OPEN on, as spoken (~5 words). Code locates these in the cues. */
  opening_words: string
  /** The exact words the clip should CLOSE on, as spoken (~5 words). */
  closing_words: string
  title: string
  hook: string
  confidence: number
  reasoning: string
}

/** Per-candidate outcome after the code applies the hard rules — the transparency record. */
export interface CandidateVerdict {
  candidate: ClipCandidate
  accepted: boolean
  /** Rejection rule when not accepted: out-of-bounds / too-short / too-long / boundary / malformed / beyond-top-N. */
  rule?: string
  /** Set when an accepted clip hit cap-flex (60-90s); message for a 'cap-flex' log. */
  adjusted?: string
  /** Set when pause-based snapping moved an edge; message for a 'pause-snap' log. */
  snapNote?: string
  /** The snapped, validated clip when accepted. */
  clip?: SelectedClip
}

export interface SelectionResult {
  /** Everything the model proposed, in its ranked order. */
  candidates: ClipCandidate[]
  /** One verdict per candidate, so the caller can log accept/reject + rule. */
  verdicts: CandidateVerdict[]
  /** The clips that passed the rules (already capped to maxClips). */
  accepted: SelectedClip[]
  /** Set when the model deliberately proposed nothing — its stated reason. */
  noCandidatesReason: string | null
}

/** Normalize text into comparable word tokens (lowercase, alphanumeric only). */
function normalizeWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
}

interface StreamWord {
  w: string
  cueStart: number
  cueEnd: number
}

/** Flatten all cues into a word stream, each word carrying its cue's start/end. */
function buildWordStream(segments: Segment[]): StreamWord[] {
  const out: StreamWord[] = []
  for (const s of segments) {
    for (const raw of s.text.split(/\s+/)) {
      const w = raw.toLowerCase().replace(/[^a-z0-9]/g, "")
      if (w) out.push({ w, cueStart: s.start, cueEnd: s.end })
    }
  }
  return out
}

/** First contiguous occurrence of `phrase` in `words` at/after `fromIdx`. */
function findContiguous(words: StreamWord[], phrase: string[], fromIdx: number): { first: number; last: number } | null {
  for (let i = Math.max(0, fromIdx); i + phrase.length <= words.length; i++) {
    let ok = true
    for (let k = 0; k < phrase.length; k++) {
      if (words[i + k].w !== phrase[k]) {
        ok = false
        break
      }
    }
    if (ok) return { first: i, last: i + phrase.length - 1 }
  }
  return null
}

/**
 * Locate a spoken phrase in the word stream, tolerant to a misheard edge: tries
 * the full phrase, then shrinks (from the tail for an opening anchor, from the
 * head for a closing anchor) down to a single word.
 */
function locateRun(words: StreamWord[], phrase: string[], fromIdx: number, anchor: "start" | "end"): { first: number; last: number } | null {
  let pw = phrase.slice()
  while (pw.length >= 2) {
    const m = findContiguous(words, pw, fromIdx)
    if (m) return m
    pw = anchor === "end" ? pw.slice(1) : pw.slice(0, -1)
  }
  const single = anchor === "end" ? phrase[phrase.length - 1] : phrase[0]
  return single ? findContiguous(words, [single], fromIdx) : null
}

/**
 * Apply the rules to one candidate. Locate the model's exact opening_words /
 * closing_words in the cues to set start/end, then make the edges SENTENCE-AWARE:
 *   - END: snap to the nearest cue that COMPLETES a sentence (. ? ! …), within
 *     the region and the 90s cap (cap-flex); pause-walk fallback (>= 0.5s gap,
 *     max +8s) when the transcript has no clean sentence edge (noted in log).
 *   - START: snap to a sentence START (previous cue ends a sentence) within 6s
 *     back; post-pause onset fallback within 3s. Then skip a leading
 *     transitional filler sentence ("So, next we will…") within 6s forward.
 *   - dead-air edge pads: tight lead pad (≤0.3s, never across a >1.5s gap); end
 *     at cue-end +0.5s, never into a >1.5s gap;
 *   - both edges must fall inside ONE purchased region;
 *   - length: ≥20s; ≤60s preferred; up to 90s to finish a thought (cap-flex);
 *     >90s → too-long (triggers one selection retry).
 */
function validateCandidate(c: ClipCandidate, intervals: PurchasedRegion[], segments: Segment[]): CandidateVerdict {
  const opening = normalizeWords(c.opening_words ?? "")
  const closing = normalizeWords(c.closing_words ?? "")
  if (opening.length === 0 || closing.length === 0) return { candidate: c, accepted: false, rule: "malformed" }

  const words = buildWordStream(segments)
  const openMatch = locateRun(words, opening, 0, "start")
  if (!openMatch) return { candidate: c, accepted: false, rule: "boundary" } // opening words not found in cues
  const closeMatch = locateRun(words, closing, openMatch.first, "end")
  if (!closeMatch) return { candidate: c, accepted: false, rule: "boundary" }

  let startCueStart = words[openMatch.first].cueStart
  let endCueEnd = words[closeMatch.last].cueEnd
  if (endCueEnd <= startCueStart) return { candidate: c, accepted: false, rule: "malformed" }

  // Both edges must lie within a single purchased region.
  const region = intervals.find((r) => startCueStart >= r.start - 0.5 && endCueEnd <= r.end + 0.5)
  if (!region) return { candidate: c, accepted: false, rule: "out-of-bounds" }

  const snapNotes: string[] = []

  // --- SENTENCE-AWARE END SNAP (pause fallback) ---
  // The end maps to the END of the cue holding the closing words. Prefer the
  // end of a COMPLETED SENTENCE (cue text ending . ? ! …): scan forward from
  // the closing cue to the nearest sentence-ending cue, bounded by the region
  // and the 90s hard cap (cap-flex may extend to finish the thought). Only if
  // no sentence edge exists in that window, fall back to the old pause walk
  // (>= 0.5s gap, max +8s) and note that the transcript had no clean edge.
  let endIdx = segments.findIndex((s) => s.start === words[closeMatch.last].cueStart && s.end === endCueEnd)
  if (endIdx >= 0) {
    const origEnd = endCueEnd
    let sentenceIdx = -1
    for (let k = endIdx; k < segments.length; k++) {
      const cue = segments[k]
      if (cue.end > region.end + 0.5) break
      if (cue.end - startCueStart > HARD_CAP_SECONDS) break
      if (endsSentenceText(cue.text)) {
        sentenceIdx = k
        break
      }
    }
    if (sentenceIdx >= 0) {
      endIdx = sentenceIdx
      if (segments[endIdx].end > origEnd + 0.05) {
        endCueEnd = segments[endIdx].end
        snapNotes.push(`end snapped +${(endCueEnd - origEnd).toFixed(1)}s to sentence end`)
      }
      // sentenceIdx === endIdx with no extension: the closing cue already ends
      // a sentence — perfect edge, nothing to note.
    } else {
      while (endIdx + 1 < segments.length) {
        const cur = segments[endIdx]
        const next = segments[endIdx + 1]
        if (next.start - cur.end >= PAUSE_GAP_SECONDS) break // speaker paused
        if (next.end - origEnd > MAX_PAUSE_EXTENSION_SECONDS) break
        if (next.end - startCueStart > HARD_CAP_SECONDS) break
        if (next.end > region.end + 0.5) break
        endIdx++
      }
      if (segments[endIdx].end > origEnd + 0.05) {
        endCueEnd = segments[endIdx].end
        snapNotes.push(`end extended +${(endCueEnd - origEnd).toFixed(1)}s to speech pause`)
      }
      snapNotes.push("boundary: no clean sentence edge (end)")
    }
  }

  // --- SENTENCE-AWARE START SNAP (pause fallback) ---
  // Prefer starting at the START of a sentence: a cue whose PREVIOUS cue ends
  // with sentence punctuation (or no previous cue at all), searched within a
  // 6s lookback. Only if no sentence start exists, fall back to the old
  // post-pause speech onset (3s lookback) and note the missing clean edge.
  {
    const origStart = startCueStart
    let bestSentence: number | null = null
    let bestPause: number | null = null
    for (const cand of segments) {
      if (cand.start < origStart - SENTENCE_LOOKBACK_SECONDS || cand.start > origStart + 0.05) continue
      const prev = segments.filter((s) => s.end <= cand.start + 0.05).sort((a, b) => b.end - a.end)[0]
      const startsSentence = !prev || endsSentenceText(prev.text)
      const precededByPause = !prev || cand.start - prev.end >= PAUSE_GAP_SECONDS
      if (startsSentence && (bestSentence === null || cand.start > bestSentence)) bestSentence = cand.start
      if (precededByPause && cand.start >= origStart - START_PAUSE_LOOKBACK_SECONDS && (bestPause === null || cand.start > bestPause)) {
        bestPause = cand.start
      }
    }
    if (bestSentence !== null) {
      if (bestSentence < origStart - 0.05) {
        startCueStart = bestSentence
        snapNotes.push(`start snapped -${(origStart - bestSentence).toFixed(1)}s to a sentence start`)
      }
      // bestSentence === origStart: mapped start already begins a sentence.
    } else {
      if (bestPause !== null && bestPause < origStart - 0.05) {
        startCueStart = bestPause
        snapNotes.push(`start moved -${(origStart - bestPause).toFixed(1)}s to a speech onset after a pause`)
      }
      snapNotes.push("boundary: no clean sentence edge (start)")
    }
  }

  // --- LEADING-CONNECTIVE SKIP ---
  // A clip must not open on transitional filler ("So, next we will be
  // exploring…"). If the chosen start cue begins with a connective, advance to
  // the NEXT sentence start within a small window — as long as enough clip
  // remains to stay above the minimum length and reach the closing words.
  {
    const startIdx = segments.findIndex((s) => Math.abs(s.start - startCueStart) < 0.05)
    if (startIdx >= 0 && LEADING_CONNECTIVE_RE.test(segments[startIdx].text.trim())) {
      for (let k = startIdx; k + 1 < segments.length; k++) {
        const nxt = segments[k + 1]
        if (nxt.start - startCueStart > CONNECTIVE_SKIP_WINDOW_SECONDS) break
        if (endsSentenceText(segments[k].text)) {
          if (nxt.start < endCueEnd - MIN_CLIP_SECONDS) {
            snapNotes.push(`start advanced +${(nxt.start - startCueStart).toFixed(1)}s past connective opener to the next sentence start`)
            startCueStart = nxt.start
          }
          break
        }
      }
    }
  }

  // --- Dead-air edge pads (small, applied on the snapped cue boundaries) ---
  const prevCue = segments.filter((s) => s.end <= startCueStart - 0.05).sort((a, b) => b.end - a.end)[0]
  const leadGap = prevCue ? startCueStart - prevCue.end : Infinity
  let start = leadGap > DEAD_AIR_GAP_SECONDS ? startCueStart : Math.max(region.start, startCueStart - LEAD_PAD_SECONDS)

  const nextCue = segments.filter((s) => s.start >= endCueEnd - 0.05).sort((a, b) => a.start - b.start)[0]
  const tailGap = nextCue ? nextCue.start - endCueEnd : Infinity
  // End at cue-end + 0.5s, but never pad into a >1.5s gap (silence/applause).
  let end = tailGap > DEAD_AIR_GAP_SECONDS ? endCueEnd : Math.min(region.end, endCueEnd + TAIL_PAD_SECONDS)

  start = Math.max(0, Math.max(region.start, start))
  end = Math.min(region.end, end)
  if (end <= start) return { candidate: c, accepted: false, rule: "boundary" }

  const len = end - start
  if (len < MIN_CLIP_SECONDS) return { candidate: c, accepted: false, rule: "too-short" }
  if (len > HARD_CAP_SECONDS) return { candidate: c, accepted: false, rule: "too-long" }

  const adjusted = len > SOFT_CAP_SECONDS ? `cap-flex: ${Math.round(len)}s (>60s soft cap, within 90s hard cap) to finish the thought` : undefined

  return {
    candidate: c,
    accepted: true,
    adjusted,
    snapNote: snapNotes.length ? snapNotes.join("; ") : undefined,
    clip: {
      start,
      end,
      title: String(c.title ?? "Untitled clip").slice(0, 120),
      hook: String(c.hook ?? "").slice(0, 280),
      // Preserve NaN: it is the "inherit from the replaced clip" sentinel used
      // by selfCritique's rebuilt cuts (|| 0 would silently turn it into 0).
      confidence: Number.isFinite(Number(c.confidence)) ? Math.max(0, Math.min(1, Number(c.confidence))) : Number.NaN,
      opening_words: String(c.opening_words ?? "").slice(0, 200),
      closing_words: String(c.closing_words ?? "").slice(0, 200),
    },
  }
}

function buildSelectionPrompt(
  p: { regions: PurchasedRegion[]; videoTitle?: string; maxClips: number; goal?: string; criteria?: string },
  extra: string,
): string {
  const regionText = p.regions
    .map(
      (r, i) =>
        `Region ${i + 1}: ${fmt(r.start)}–${fmt(r.end)} (${Math.round(r.end - r.start)}s)\n"""${r.transcript || "(no speech)"}"""`,
    )
    .join("\n\n")

  return `You are an expert short-form video editor reviewing the PURCHASED regions of a longer video and proposing the best clips.

Video title: ${p.videoTitle ?? "(unknown)"}
The creator's goal for these clips is: ${p.goal ?? "maximize viewer interest and shareability"}${p.criteria ? `\nWhat makes a moment important in THIS video: ${p.criteria}` : ""}

Your job is to RANK and PROPOSE, not to gatekeep. Always return the best 1-${p.maxClips} candidates that are coherent and self-contained — a complete thought, exchange, story, or answer — even if they are not perfectly viral. Express quality with the confidence score (0-1); do NOT silently refuse. Only return an empty list if NO coherent, self-contained moment exists in any region, and then say why in "no_candidates_reason".

For each candidate:
- It must lie within a SINGLE region (these are the only seconds available).
- SINGLE TOPIC: each clip must cover exactly ONE topic / idea arc — hook, development, completion. If the region contains a topic transition, the clip must EITHER end at the sentence that completes the FIRST topic (put closing_words there), OR start at the transition if the second topic is the stronger clip. NEVER include a partial second topic.
- It should be a COMPLETE thought, ideally 20-60 seconds (up to 90s only if needed to finish the thought).
- "opening_words": the FIRST ~5 words of the clip, copied EXACTLY as in the transcript. "closing_words": the LAST ~5 words of the clip, copied EXACTLY. The agent's code locates these exact words in the captions to set the cut points, so copy them verbatim — do not paraphrase.
- closing_words MUST be the final words of a COMPLETED spoken sentence — the point where the speaker actually finishes the thought and stops. NEVER end mid-clause or mid-sentence.
- A punchy "title" (<= 8 words) and a one-line "hook" that would make someone stop scrolling.
- A short "reasoning" sentence.
${extra ? `\n${extra}\n` : ""}
Regions (timestamps in seconds):
${regionText}

Return ONLY JSON, no other text:
{"candidates": [{"opening_words": "...", "closing_words": "...", "title": "...", "hook": "...", "confidence": <0-1>, "reasoning": "..."}], "no_candidates_reason": ""}`
}

/**
 * Final selection. The model proposes ranked, self-contained candidates by their
 * exact opening/closing words; the CODE locates those words in the cues to set
 * semantic cut points (auto-caption punctuation is unreliable) and applies the
 * length/dead-air rules. Every candidate returns an accept/reject verdict. If a
 * candidate's complete thought runs past the 90s hard cap, one retry asks for a
 * tighter complete thought that fits.
 */
export async function selectClips(p: {
  regions: PurchasedRegion[]
  segments: Segment[]
  durationSecs: number
  videoTitle?: string
  maxClips?: number
  goal?: string
  brief?: EditorialBrief | null
}): Promise<SelectionResult> {
  const maxClips = p.maxClips ?? 3
  if (p.regions.length === 0) {
    return { candidates: [], verdicts: [], accepted: [], noCandidatesReason: "no purchased regions to select from" }
  }

  async function attempt(extra: string): Promise<SelectionResult> {
    const user = buildSelectionPrompt(
      { regions: p.regions, videoTitle: p.videoTitle, maxClips, goal: p.goal, criteria: p.brief?.importance_criteria },
      extra,
    )
    const out = await callClaude({ model: SELECTION_MODEL, maxTokens: 1500, user, temperature: 0 })
    const parsed = parseJson<{ candidates?: ClipCandidate[]; no_candidates_reason?: string }>(out, {})

    const candidates = (Array.isArray(parsed.candidates) ? parsed.candidates : []).sort(
      (a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0),
    )
    if (candidates.length === 0) {
      const reason = String(parsed.no_candidates_reason || "").trim() || "model proposed no coherent self-contained moments"
      return { candidates: [], verdicts: [], accepted: [], noCandidatesReason: reason }
    }

    const verdicts: CandidateVerdict[] = []
    const accepted: SelectedClip[] = []
    for (const c of candidates) {
      const verdict = validateCandidate(c, p.regions, p.segments)
      if (verdict.accepted && verdict.clip) {
        if (accepted.length < maxClips) {
          accepted.push(verdict.clip)
          verdicts.push(verdict)
        } else {
          verdicts.push({ candidate: c, accepted: false, rule: `beyond-top-${maxClips}` })
        }
      } else {
        verdicts.push(verdict)
      }
    }
    return { candidates, verdicts, accepted, noCandidatesReason: null }
  }

  const first = await attempt("")

  // One retry when a complete thought overran the hard cap and we still have room.
  const overran = first.verdicts.some((v) => v.rule === "too-long")
  if (overran && first.accepted.length < maxClips) {
    const second = await attempt(
      "NOTE: a previous attempt produced clips that ran past the 90-second hard cap. For each clip, choose a TIGHTER opening/closing that captures the single best COMPLETE thought within ~60 seconds (90s absolute maximum).",
    )
    const better = second.accepted.length >= first.accepted.length ? second : first
    return {
      candidates: better.candidates,
      verdicts: [...first.verdicts, ...second.verdicts],
      accepted: better.accepted,
      noCandidatesReason: better.noCandidatesReason,
    }
  }

  return first
}

/** Per-clip self-critique verdict. */
export interface ClipCritique {
  title: string
  opens_on_hook: boolean
  stands_alone: boolean
  ends_complete: boolean
  /** Does the clip stay on exactly one topic (no drift into a partial second topic)? */
  single_topic: boolean
  /** 0-10 quality score the critique assigned (undefined if the model omitted it). */
  score?: number
  /** One-line reasoning behind the verdict. */
  reasoning?: string
  verdict: string
}

/**
 * Self-critique pass (the FINAL quality gate before clips are offered to the
 * creator). It evaluates EVERY proposed clip against the four criteria (opens on
 * a hook within ~3s, stands alone, ends complete, single topic), then returns a
 * RANKED final selection of the best clips — it may promote a lower-confidence
 * clip, drop one that fails badly, and pull a clearly-better replacement from the
 * purchased regions. Every final clip's opening/closing words are re-validated in
 * code (located in the cues) before it is kept. Clips remain PENDING proposals —
 * the creator approves/discards in the UI; the critique only curates.
 *
 * Safety: never returns zero clips when a coherent candidate exists — if nothing
 * validates, it keeps the original selection (best-of) with a logged note.
 */
interface RawEvaluation {
  clip?: number
  opens_on_hook?: boolean
  stands_alone?: boolean
  ends_complete?: boolean
  single_topic?: boolean
  score?: number
  reasoning?: string
}

/** Map raw model evaluations onto clips, aligned by the 1-based `clip` index. */
function buildCritiques(clips: Array<{ title: string }>, evaluations: RawEvaluation[] | undefined): ClipCritique[] {
  const evalByIndex = new Map<number, RawEvaluation>()
  ;(evaluations ?? []).forEach((e, i) => {
    const idx = Number.isFinite(Number(e?.clip)) ? Math.round(Number(e.clip)) - 1 : i
    if (idx >= 0 && idx < clips.length && !evalByIndex.has(idx)) evalByIndex.set(idx, e)
  })
  return clips.map((c, i) => {
    const e = evalByIndex.get(i)
    const reasoning = String(e?.reasoning ?? "").slice(0, 280)
    const score = Number.isFinite(Number(e?.score)) ? Math.max(0, Math.min(10, Math.round(Number(e!.score)))) : undefined
    return {
      title: c.title,
      opens_on_hook: !!e?.opens_on_hook,
      stands_alone: !!e?.stands_alone,
      ends_complete: !!e?.ends_complete,
      single_topic: e?.single_topic !== false,
      score,
      reasoning: reasoning || undefined,
      // Real verdict when evaluated; sentinel only when the model genuinely
      // returned nothing for this clip (the pipeline logs that case gracefully).
      verdict: reasoning ? reasoning : e ? `score ${score ?? "?"}/10` : "no verdict",
    }
  })
}

/**
 * Base confidence for a critique-rebuilt cut with no selection-model number of
 * its own: the selection confidence of the ORIGINAL clip it overlaps (i.e. the
 * clip it replaces), else the mean of the originals.
 */
function inheritedConfidence(clip: { start: number; end: number }, originals: SelectedClip[]): number {
  const overlapping = originals.find((o) => clip.start < o.end && clip.end > o.start)
  if (overlapping && Number.isFinite(overlapping.confidence)) return overlapping.confidence
  const finite = originals.map((o) => o.confidence).filter((n) => Number.isFinite(n))
  return finite.length > 0 ? finite.reduce((s, n) => s + n, 0) / finite.length : 0.75
}

/**
 * Evaluations-only critique of a FINAL clip set (post-swap / post-extension):
 * the four quality booleans + score per clip, no re-selection. The pipeline
 * uses this to price each proposal's confidence against the exact cut the
 * creator will see. Aligned by index with the input clips.
 */
export async function critiqueClips(p: {
  clips: SelectedClip[]
  segments: Segment[]
  videoTitle?: string
  goal: string
  brief: EditorialBrief | null
}): Promise<ClipCritique[]> {
  if (p.clips.length === 0) return []
  const brief = p.brief ?? EMPTY_BRIEF
  const clipBlocks = p.clips
    .map(
      (c, i) =>
        `Clip ${i + 1}: "${c.title}" — hook: ${c.hook}\n  range ${fmt(c.start)}-${fmt(c.end)}\n  transcript: """${textForInterval(p.segments, c.start, c.end)}"""`,
    )
    .join("\n\n")

  const user = `You are quality-checking FINAL short clips cut from a ${brief.genre} video before they are shown to the creator.

The creator's goal: ${p.goal}
Importance criteria for this video: ${brief.importance_criteria}

Judge EVERY clip on all four criteria:
- opens_on_hook: opens on a hook within the first ~3 seconds
- stands_alone: makes sense without any surrounding context
- ends_complete: ends on a completed thought (not mid-sentence)
- single_topic: covers exactly ONE topic / idea arc (no drift into a second topic)

Video title: ${p.videoTitle ?? "(unknown)"}

${clipBlocks}

Return ONLY JSON, no other text:
{"evaluations":[{"clip":<1-based index>,"opens_on_hook":<bool>,"stands_alone":<bool>,"ends_complete":<bool>,"single_topic":<bool>,"score":<0-10>,"reasoning":"..."}]}`

  const out = await callClaude({ model: SELECTION_MODEL, maxTokens: 1500, user, temperature: 0 })
  const parsed = extractJsonObject<{ evaluations?: RawEvaluation[] }>(out)
  return buildCritiques(p.clips, parsed?.evaluations)
}

export async function selfCritique(p: {
  clips: SelectedClip[]
  regions: PurchasedRegion[]
  segments: Segment[]
  videoTitle?: string
  goal: string
  brief?: EditorialBrief | null
  maxClips?: number
}): Promise<{ clips: SelectedClip[]; critiques: ClipCritique[]; swap: string | null }> {
  if (p.clips.length === 0) return { clips: [], critiques: [], swap: null }
  const maxClips = p.maxClips ?? p.clips.length
  const same = (a: SelectedClip, b: SelectedClip) => Math.abs(a.start - b.start) < 1 && Math.abs(a.end - b.end) < 1

  const clipText = p.clips
    .map(
      (c, i) =>
        `Clip ${i + 1}: "${c.title}" — hook: ${c.hook} (confidence ${c.confidence.toFixed(2)})\n  range ${fmt(c.start)}-${fmt(c.end)}\n  transcript: """${textForInterval(p.segments, c.start, c.end)}"""`,
    )
    .join("\n\n")

  const regionText = p.regions
    .map((r, i) => `Region ${i + 1}: ${fmt(r.start)}-${fmt(r.end)}\n"""${r.transcript || "(no speech)"}"""`)
    .join("\n\n")

  const user = `You are the FINAL quality gate that curates the best short-form clips before a creator reviews them. You decide the final set: pick the BEST clips available, in quality order.

The creator's goal: ${p.goal}${p.brief?.importance_criteria ? `\nImportance criteria for this video: ${p.brief.importance_criteria}` : ""}

Quality criteria — judge EVERY proposed clip on all four:
- opens_on_hook: opens on a hook within the first ~3 seconds
- stands_alone: makes sense without any surrounding context
- ends_complete: ends on a completed thought (not mid-sentence)
- single_topic: covers exactly ONE topic / idea arc (no drift into a second topic)

Your job:
1) For EACH proposed clip, give the four booleans, a score 0-10, and a one-line reasoning.
2) Build the FINAL ranked selection of the best clips (at most ${maxClips}), in DESCENDING quality order. You MAY:
   - promote a lower-confidence clip above a higher one if it is genuinely a better standalone clip;
   - DROP a clip that fails badly (e.g. no hook AND does not stand alone) and replace it with a clearly better moment from the PURCHASED regions;
   - keep a clip as-is.
   For each final clip give opening_words and closing_words copied VERBATIM from the transcript/regions (~5 words each) so the cut can be located, plus a punchy title, a one-line hook, and a one-line reasoning for why it made the cut / its rank.
NEVER return zero final clips if at least one coherent clip exists — always return the best available.

PROPOSED CLIPS:
${clipText}

PURCHASED REGIONS (you may draw replacements from these):
${regionText}

Return ONLY JSON, no prose, no code fences:
{"evaluations":[{"clip":<1-based proposed index>,"opens_on_hook":<bool>,"stands_alone":<bool>,"ends_complete":<bool>,"single_topic":<bool>,"score":<0-10>,"reasoning":"..."}],"final":[{"source":"clip"|"region","ref":<1-based index into proposed clips OR purchased regions>,"opening_words":"...","closing_words":"...","title":"...","hook":"...","reasoning":"..."}]}`

  const out = await callClaude({ model: SELECTION_MODEL, maxTokens: 3000, user, temperature: 0 })
  const parsed = extractJsonObject<{
    evaluations?: Array<{ clip?: number; opens_on_hook?: boolean; stands_alone?: boolean; ends_complete?: boolean; single_topic?: boolean; score?: number; reasoning?: string }>
    final?: Array<{ source?: string; ref?: number; opening_words?: string; closing_words?: string; title?: string; hook?: string; reasoning?: string }>
  }>(out)

  // SAFETY: unparseable response → keep the original selection rather than nuke it.
  if (!parsed) {
    return { clips: p.clips.slice(0, maxClips), critiques: [], swap: "self-critique response unparseable — kept original selection" }
  }

  // --- Per-clip verdicts (one per PROPOSED clip), aligned by `clip` index. ---
  const critiques: ClipCritique[] = buildCritiques(p.clips, parsed.evaluations)

  // --- Build the ranked final selection from the model's `final` list. Each is
  // re-validated in code (opening/closing words located in the cues). ---
  const finalClips: SelectedClip[] = []
  const rejected: string[] = []
  for (const item of Array.isArray(parsed.final) ? parsed.final : []) {
    if (finalClips.length >= maxClips) break
    const refIdx = Math.round(Number(item?.ref)) - 1
    const isClip = String(item?.source ?? "").toLowerCase() !== "region"
    const resolvedRef = isClip && refIdx >= 0 && refIdx < p.clips.length
    // Base confidence CARRIES the selection model's number. Region-sourced (or
    // unresolvable-ref) picks have no direct selection confidence — mark NaN
    // and inherit AFTER validation from the original clip they overlap, i.e.
    // the clip they effectively replace. (This was a hardcoded 0.7 before,
    // which stamped every rebuilt clip with the same constant.)
    const baseConfidence = resolvedRef ? p.clips[refIdx].confidence : Number.NaN
    const candidate: ClipCandidate = {
      opening_words: String(item?.opening_words ?? ""),
      closing_words: String(item?.closing_words ?? ""),
      title: String(item?.title ?? "Clip"),
      hook: String(item?.hook ?? ""),
      confidence: baseConfidence,
      reasoning: String(item?.reasoning ?? "self-critique selection"),
    }
    const verdict = validateCandidate(candidate, p.regions, p.segments)
    if (verdict.accepted && verdict.clip && !finalClips.some((fc) => same(fc, verdict.clip!))) {
      if (!Number.isFinite(verdict.clip.confidence)) {
        verdict.clip.confidence = inheritedConfidence(verdict.clip, p.clips)
      }
      finalClips.push(verdict.clip)
    } else if (!verdict.accepted) {
      rejected.push(`"${candidate.title}" (${verdict.rule})`)
    }
  }

  // NEVER SHRINK the set: if a model pick failed validation (or the model
  // returned fewer than proposed), backfill with the best ORIGINAL proposed
  // clips (already validated by selection) so the creator still gets ~the same
  // count. A flagged clip they can review beats no clip.
  const targetCount = Math.min(maxClips, p.clips.length)
  const backfilled: string[] = []
  if (finalClips.length < targetCount) {
    const byConfidence = [...p.clips].sort((a, b) => b.confidence - a.confidence)
    for (const oc of byConfidence) {
      if (finalClips.length >= targetCount) break
      if (!finalClips.some((fc) => same(fc, oc))) {
        finalClips.push(oc)
        backfilled.push(`"${oc.title}"`)
      }
    }
  }

  // SAFETY: if STILL nothing (shouldn't happen when p.clips is non-empty, since
  // backfill restores originals), keep the original best-of.
  if (finalClips.length === 0) {
    const note = rejected.length ? ` (final picks rejected by validation: ${rejected.join(", ")})` : ""
    return { clips: p.clips.slice(0, maxClips), critiques, swap: `self-critique produced no valid final clips — kept original selection${note}` }
  }

  // --- Summarize the curation (additions / drops / backfill / re-rank). ---
  const dropped = p.clips.filter((oc) => !finalClips.some((fc) => same(fc, oc)))
  const added = finalClips.filter((fc) => !p.clips.some((oc) => same(fc, oc)))
  const sameSetSameOrder =
    finalClips.length === p.clips.length && finalClips.every((fc, i) => same(fc, p.clips[i]))

  let swap: string | null = null
  if (!sameSetSameOrder) {
    const parts: string[] = []
    for (const a of added) parts.push(`added "${a.title}" ${fmt(a.start)}-${fmt(a.end)}`)
    for (const d of dropped) parts.push(`dropped "${d.title}"`)
    if (backfilled.length) parts.push(`kept ${backfilled.join(", ")} (no valid replacement — set not shrunk)`)
    if (rejected.length) parts.push(`region replacement(s) rejected by validation: ${rejected.join(", ")}`)
    if (parts.length === 0) parts.push(`re-ranked by quality: ${finalClips.map((fc) => `"${fc.title}"`).join(" > ")}`)
    swap = parts.join("; ")
  }

  return { clips: finalClips, critiques, swap }
}
