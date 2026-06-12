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
 * Score one probed window with the cheap model — a WHERE-to-look-closer signal,
 * not a stand-alone-clip judgment. The window is a deliberate fragment of a long
 * conversation, so the prompt tells the model NOT to penalize incompleteness and
 * to estimate whether the surrounding 1-2 minutes holds a clip-worthy moment.
 * ("Can this stand alone?" is the FINAL-selection criterion — the sonnet call.)
 * `text` is the transcript of just that window (may be empty → low score).
 */
export async function scoreProbe(p: {
  windowStart: number
  windowEnd: number
  durationSecs: number
  text: string
  videoTitle?: string
}): Promise<ProbeScore> {
  const sampleSecs = Math.round(p.windowEnd - p.windowStart)
  const posMin = (p.windowStart / 60).toFixed(1)
  const totalMin = Math.round(p.durationSecs / 60)

  const user = `You are a clip scout sampling a long video to decide WHERE to look closer. This is a SHORT ${sampleSecs}-second SAMPLE taken at about minute ${posMin} of a ${totalMin}-minute conversation.

Do NOT penalize this sample for being incomplete or for "cutting off" — it is deliberately a fragment, not a finished clip. You are NOT judging whether this fragment can stand alone.

Score 0-10 the LIKELIHOOD that the surrounding 1-2 minutes around this sample contains a clip-worthy moment.
Signals that RAISE the score: a story starting, a strong or controversial claim, specific named numbers or facts, emotional energy, disagreement or tension, or a question being answered directly.
Signals that LOWER the score: filler, logistics/housekeeping, pure small talk, or dead air.

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
}): Promise<EditorialBrief> {
  if (p.segments.length === 0) return EMPTY_BRIEF
  const transcript = p.segments.map((s) => `${Math.round(s.start)}s ${s.text}`).join("\n")
  const totalMin = Math.round(p.durationSecs / 60)

  const user = `You are a senior video editor preparing to clip a ${totalMin}-minute video. Read the FULL transcript and produce an EDITORIAL BRIEF.

The creator's goal for these clips is: ${p.goal}

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
  p: { videoTitle?: string; goal: string; brief: EditorialBrief; durationSecs: number },
): Promise<ValuableMoment[]> {
  if (segs.length === 0) return []
  const transcript = segs.map((s) => `${Math.round(s.start)}s ${s.text}`).join("\n")

  const user = `You are finding the most valuable short-form clip moments in a segment of a longer ${p.brief.genre} video.

The creator's goal for these clips is: ${p.goal}
What makes a moment important in THIS video (score against THESE criteria, not a generic rubric): ${p.brief.importance_criteria}

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
async function mergeMoments(candidates: ValuableMoment[], p: { goal: string; brief: EditorialBrief; durationSecs: number }): Promise<ValuableMoment[]> {
  const list = candidates.map((m, i) => `${i + 1}. ${fmt(m.start)}-${fmt(m.end)} (score ${m.score}) — ${m.what}`).join("\n")

  const user = `You are merging candidate clip moments found across overlapping chunks of a long ${p.brief.genre} video into the GLOBAL best list.

The creator's goal: ${p.goal}
Importance criteria for this video: ${p.brief.importance_criteria}

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
 * Apply the rules to one candidate by SEMANTICS, not punctuation. Locate the
 * model's exact opening_words / closing_words in the cues to set start/end, then:
 *   - PAUSE-BASED end snap: if the gap to the next cue is < 0.5s the speaker
 *     hasn't finished, so extend through cues until a >= 0.5s pause (max +8s,
 *     90s cap); if none, keep the cue end. Mirror snap pulls the start back to a
 *     post-pause speech onset within 3s.
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

  // --- PAUSE-BASED END SNAP ---
  // The end maps to the END of the cue holding the closing words. If the silence
  // gap to the NEXT cue is < 0.5s, the speaker hasn't finished — extend through
  // subsequent cues until a >= 0.5s pause, bounded by +8s, the region, and the
  // 90s hard cap. If no pause is found within those limits, keep the cue end.
  let endIdx = segments.findIndex((s) => s.start === words[closeMatch.last].cueStart && s.end === endCueEnd)
  if (endIdx >= 0) {
    const origEnd = endCueEnd
    while (endIdx + 1 < segments.length) {
      const cur = segments[endIdx]
      const next = segments[endIdx + 1]
      if (next.start - cur.end >= PAUSE_GAP_SECONDS) break // speaker paused — a real sentence end
      if (next.end - origEnd > MAX_PAUSE_EXTENSION_SECONDS) break
      if (next.end - startCueStart > HARD_CAP_SECONDS) break
      if (next.end > region.end + 0.5) break
      endIdx++
    }
    if (segments[endIdx].end > origEnd + 0.05) {
      endCueEnd = segments[endIdx].end
      snapNotes.push(`end extended +${(endCueEnd - origEnd).toFixed(1)}s to speech pause`)
    }
  }

  // --- PAUSE-BASED START SNAP (mirror) ---
  // Prefer starting at a speech onset that follows a >= 0.5s pause, within 3s
  // before the mapped start (so we don't open mid-sentence). Pick the latest
  // such onset at/before the mapped start; if none, keep the mapped start.
  {
    const origStart = startCueStart
    let bestOnset: number | null = null
    for (const cand of segments) {
      if (cand.start < origStart - START_PAUSE_LOOKBACK_SECONDS || cand.start > origStart + 0.05) continue
      const prev = segments.filter((s) => s.end <= cand.start + 0.05).sort((a, b) => b.end - a.end)[0]
      const precededByPause = !prev || cand.start - prev.end >= PAUSE_GAP_SECONDS
      if (precededByPause && (bestOnset === null || cand.start > bestOnset)) bestOnset = cand.start
    }
    if (bestOnset !== null && bestOnset < origStart - 0.05) {
      startCueStart = bestOnset
      snapNotes.push(`start moved -${(origStart - bestOnset).toFixed(1)}s to a speech onset after a pause`)
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
      confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0)),
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
  verdict: string
}

/**
 * Self-critique pass (one extra call before clip creation): show the model its
 * own accepted clips and have it verify each opens on a hook within ~3s, stands
 * alone, ends complete, and stays on a SINGLE topic. single_topic is a LOGGED
 * CHECK only — it does not re-cut clips (text-based re-cutting fuzzy-matched to
 * the wrong locations and made cuts worse). The critique may demote/replace AT
 * MOST ONE clip with a better candidate from the purchased regions; the
 * replacement is re-validated in code before it is swapped in.
 */
export async function selfCritique(p: {
  clips: SelectedClip[]
  regions: PurchasedRegion[]
  segments: Segment[]
  videoTitle?: string
  goal: string
  brief?: EditorialBrief | null
}): Promise<{ clips: SelectedClip[]; critiques: ClipCritique[]; swap: string | null }> {
  if (p.clips.length === 0) return { clips: [], critiques: [], swap: null }

  const clipText = p.clips
    .map(
      (c, i) =>
        `Clip ${i + 1}: "${c.title}" — hook: ${c.hook}\n  range ${fmt(c.start)}-${fmt(c.end)}\n  transcript: """${textForInterval(p.segments, c.start, c.end)}"""`,
    )
    .join("\n\n")

  const regionText = p.regions
    .map((r, i) => `Region ${i + 1}: ${fmt(r.start)}-${fmt(r.end)}\n"""${r.transcript || "(no speech)"}"""`)
    .join("\n\n")

  const user = `You are doing a final quality check on short-form clips before they are published.

The creator's goal: ${p.goal}${p.brief?.importance_criteria ? `\nImportance criteria for this video: ${p.brief.importance_criteria}` : ""}

For EACH clip below, verify FOUR things:
- opens_on_hook: does it open on a hook within the first ~3 seconds?
- stands_alone: does it make sense without any surrounding context?
- ends_complete: does it end on a completed thought (not mid-sentence)?
- single_topic: does it cover exactly ONE topic / idea arc, WITHOUT drifting into a second topic?
Give a one-line "verdict" per clip.

You MAY demote and replace AT MOST ONE clip with a clearly better candidate drawn from the PURCHASED regions, via "replacement" (replace_index 1-based, plus exact opening_words/closing_words copied verbatim from the regions, title, hook). Only replace if clearly better; otherwise omit "replacement".

CLIPS:
${clipText}

PURCHASED REGIONS (for any replacement):
${regionText}

Return ONLY JSON, no other text:
{"clips": [{"opens_on_hook": <bool>, "stands_alone": <bool>, "ends_complete": <bool>, "single_topic": <bool>, "verdict": "..."}], "replacement": {"replace_index": <1-based>, "opening_words": "...", "closing_words": "...", "title": "...", "hook": "..."}}
(omit "replacement" entirely if no swap)`

  const out = await callClaude({ model: SELECTION_MODEL, maxTokens: 1200, user, temperature: 0 })
  const parsed = parseJson<{
    clips?: Array<{ opens_on_hook?: boolean; stands_alone?: boolean; ends_complete?: boolean; single_topic?: boolean; verdict?: string }>
    replacement?: { replace_index?: number; opening_words?: string; closing_words?: string; title?: string; hook?: string }
  }>(out, {})

  const critiques: ClipCritique[] = p.clips.map((c, i) => {
    const v = parsed.clips?.[i]
    return {
      title: c.title,
      opens_on_hook: !!v?.opens_on_hook,
      stands_alone: !!v?.stands_alone,
      ends_complete: !!v?.ends_complete,
      // Default to true when the model omits it, so a missing field doesn't flag a false drift.
      single_topic: v?.single_topic !== false,
      verdict: String(v?.verdict ?? "no verdict").slice(0, 280),
    }
  })

  const clips = [...p.clips]
  let swap: string | null = null
  const rep = parsed.replacement
  if (rep && Number.isFinite(Number(rep.replace_index)) && rep.opening_words && rep.closing_words) {
    const idx = Math.round(Number(rep.replace_index)) - 1
    if (idx >= 0 && idx < clips.length) {
      const candidate: ClipCandidate = {
        opening_words: rep.opening_words,
        closing_words: rep.closing_words,
        title: String(rep.title ?? clips[idx].title),
        hook: String(rep.hook ?? clips[idx].hook),
        confidence: clips[idx].confidence,
        reasoning: "self-critique replacement",
      }
      const verdict = validateCandidate(candidate, p.regions, p.segments)
      if (verdict.accepted && verdict.clip) {
        swap = `replaced clip ${idx + 1} ("${clips[idx].title}") with "${verdict.clip.title}" ${fmt(verdict.clip.start)}-${fmt(verdict.clip.end)}`
        clips[idx] = verdict.clip
      } else {
        swap = `proposed replacement for clip ${idx + 1} rejected (${verdict.rule}); kept original`
      }
    }
  }

  return { clips, critiques, swap }
}
