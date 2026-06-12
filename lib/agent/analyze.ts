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

import type { Segment } from "./transcript.ts"

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const SCORING_MODEL = "claude-haiku-4-5"
const SELECTION_MODEL = "claude-sonnet-4-6"

// Final-selection rule constants (enforced in code, not by the model).
const MIN_CLIP_SECONDS = 20
const MAX_CLIP_SECONDS = 60
const SNAP_TOLERANCE_SECONDS = 3 // how far we'll snap a proposed edge to a real cue boundary
const PAD_SECONDS = 1 // padding added outside the snapped speech, then clamped to the region

export interface ProbeScore {
  /** Clip-worthiness, 0 (skip) to 10 (must-clip). */
  score: number
  reason: string
}

export interface SelectedClip {
  /** Clip start, seconds. */
  start: number
  /** Clip end, seconds. */
  end: number
  title: string
  hook: string
  /** Model confidence, 0-1. */
  confidence: number
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

async function callClaude(opts: { model: string; maxTokens: number; user: string }): Promise<string> {
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

  const out = await callClaude({ model: SCORING_MODEL, maxTokens: 300, user })
  const parsed = parseJson<ProbeScore>(out, { score: 0, reason: "unparseable scoring response" })
  const score = Math.max(0, Math.min(10, Number(parsed.score) || 0))
  return { score, reason: String(parsed.reason ?? "").slice(0, 200) }
}

/** A raw proposal from the selection model, before code applies the rules. */
export interface ClipCandidate {
  start: number
  end: number
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
  /** Set when an accepted clip was trimmed (e.g. too-long → tail-trimmed); message for an 'adjust-clip' log. */
  adjusted?: string
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

/** Closest value within `tol`, or null if none is that close. */
function nearestWithin(values: number[], target: number, tol: number): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (const v of values) {
    const d = Math.abs(v - target)
    if (d <= tol && d < bestDist) {
      best = v
      bestDist = d
    }
  }
  return best
}

/**
 * Apply the hard rules to one candidate. Order of operations (the fix):
 *   (a) pick the MERGED purchased interval the candidate overlaps most — never
 *       check against an individual buy window;
 *   (b) snap each edge to the nearest real cue boundary within 3s (fall back to
 *       the raw edge if no cue is that close — don't reject for it);
 *   (c) pad outward, then CLAMP into that interval — padding goes only into
 *       purchased territory, zero pad at an edge is fine, and it can never push
 *       the clip out of bounds (this is the 14:48 -> 14:49 and exact-window cases);
 *   (d) only THEN check length; if > 60s, trim the tail (the lower-energy end)
 *       to the nearest sentence boundary that fits, logging the adjustment
 *       rather than rejecting. Reject only if no >= 20s span fits.
 * `intervals` are already the merged contiguous regions.
 */
function validateCandidate(
  c: ClipCandidate,
  intervals: PurchasedRegion[],
  segments: Segment[],
): CandidateVerdict {
  const rawStart = Number(c.start)
  const rawEnd = Number(c.end)
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) {
    return { candidate: c, accepted: false, rule: "malformed" }
  }

  // (a) the merged interval the candidate overlaps most.
  let region: PurchasedRegion | null = null
  let bestOverlap = 0
  for (const iv of intervals) {
    const overlap = Math.min(rawEnd, iv.end) - Math.max(rawStart, iv.start)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      region = iv
    }
  }
  if (!region || bestOverlap <= 0) return { candidate: c, accepted: false, rule: "out-of-bounds" }
  const reg = region

  const regionSegs = segments.filter((s) => s.end > reg.start && s.start < reg.end)
  const clamp = (t: number) => Math.min(Math.max(t, reg.start), reg.end)

  // (b) snap to nearest cue boundary within tolerance, else keep the raw edge.
  const coreStart = nearestWithin(regionSegs.map((s) => s.start), rawStart, SNAP_TOLERANCE_SECONDS) ?? rawStart
  const coreEnd = nearestWithin(regionSegs.map((s) => s.end), rawEnd, SNAP_TOLERANCE_SECONDS) ?? rawEnd

  // (c) pad outward, then clamp into the merged interval (pad only into purchased time).
  const s = clamp(coreStart - PAD_SECONDS)
  let e = clamp(coreEnd + PAD_SECONDS)
  if (e <= s) return { candidate: c, accepted: false, rule: "boundary" }

  // (d) length.
  let len = e - s
  if (len < MIN_CLIP_SECONDS) return { candidate: c, accepted: false, rule: "too-short" }

  let adjusted: string | undefined
  if (len > MAX_CLIP_SECONDS) {
    const wasSeconds = Math.round(len)
    // Trim the tail to the nearest sentence end that fits under 60s (>= 20s kept).
    const target = s + MAX_CLIP_SECONDS
    const cueEnds = regionSegs
      .map((seg) => seg.end)
      .filter((ce) => ce <= target && ce - s >= MIN_CLIP_SECONDS && ce <= reg.end)
    const trimmedEnd = cueEnds.length > 0 ? Math.max(...cueEnds) : target // fallback: hard trim to 60s
    e = clamp(Math.min(trimmedEnd, target))
    len = e - s
    if (len < MIN_CLIP_SECONDS) return { candidate: c, accepted: false, rule: "too-long" }
    adjusted = `trimmed to ${fmt(s)}–${fmt(e)} (was ${wasSeconds}s, capped to ${Math.round(len)}s on a sentence boundary)`
  }

  return {
    candidate: c,
    accepted: true,
    adjusted,
    clip: {
      start: s,
      end: e,
      title: String(c.title ?? "Untitled clip").slice(0, 120),
      hook: String(c.hook ?? "").slice(0, 280),
      confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0)),
    },
  }
}

/**
 * Final selection. The model proposes ranked, self-contained candidates with
 * confidence + reasoning (and a stated reason if it genuinely finds none); the
 * CODE applies the hard rules (single region, 20-60s, snapped to sentence
 * boundaries) and decides what to accept. The threshold call lives here, not in
 * a silent model refusal — every candidate comes back with an accept/reject
 * verdict for the caller to log.
 */
export async function selectClips(p: {
  regions: PurchasedRegion[]
  segments: Segment[]
  durationSecs: number
  videoTitle?: string
  maxClips?: number
}): Promise<SelectionResult> {
  const maxClips = p.maxClips ?? 3
  if (p.regions.length === 0) {
    return { candidates: [], verdicts: [], accepted: [], noCandidatesReason: "no purchased regions to select from" }
  }

  const regionText = p.regions
    .map(
      (r, i) =>
        `Region ${i + 1}: ${fmt(r.start)}–${fmt(r.end)} (${r.start.toFixed(1)}s–${r.end.toFixed(1)}s, ${Math.round(
          r.end - r.start,
        )}s)\n"""${r.transcript || "(no speech)"}"""`,
    )
    .join("\n\n")

  const user = `You are an expert short-form video editor reviewing the PURCHASED regions of a longer video and proposing the best clips.

Video title: ${p.videoTitle ?? "(unknown)"}

Your job is to RANK and PROPOSE, not to gatekeep. Always return the best 1-${maxClips} candidates that are coherent and self-contained — a complete thought, exchange, story, or answer — even if they are not perfectly viral. Express quality with the confidence score (0-1); do NOT silently refuse. Only return an empty list if NO coherent, self-contained moment exists in any region, and then say why in "no_candidates_reason".

For each candidate aim for:
- A 20-60 second moment that lies within a SINGLE region (these are the only seconds available).
- Start and end on sentence boundaries. The agent's code will snap your edges to the nearest real caption boundary and add padding, so approximate good boundaries — you don't need to be frame-accurate.
- A punchy title (<= 8 words) and a one-line hook that would make someone stop scrolling.
- A short "reasoning" sentence: why this moment is clip-worthy.

Regions (timestamps in seconds):
${regionText}

Return ONLY JSON, no other text:
{"candidates": [{"start": <sec>, "end": <sec>, "title": "...", "hook": "...", "confidence": <0-1>, "reasoning": "..."}], "no_candidates_reason": ""}`

  const out = await callClaude({ model: SELECTION_MODEL, maxTokens: 1500, user })
  const parsed = parseJson<{ candidates?: ClipCandidate[]; no_candidates_reason?: string }>(out, {})

  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : []
  // Rank by confidence so the strongest fill the maxClips slots first.
  candidates.sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))

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
