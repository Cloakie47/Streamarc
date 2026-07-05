// Shared clip configuration — pure constants, safe to import from both client
// components and server routes.

/**
 * Minimum source-video length (seconds) for AI clipping ("Generate Clips with
 * the AI Agent"). Shorter videos can still be clipped MANUALLY (no minimum).
 */
export const MIN_AI_CLIP_SECONDS = 120

/**
 * Maximum source-video length for AI clipping while in testing. Manual
 * clipping has no maximum.
 */
export const MAX_AI_CLIP_SECONDS = 60 * 60 // 60 minutes

// ---------------------------------------------------------------------------
// Clip-agent pricing (computed quote — the user no longer sets a budget).
// SETTLEMENT MECHANICS ARE UNCHANGED: per-chunk nanopayments with adaptive
// chunking; these constants only set the RATES and the quote/cap math.
// The agent consumption rate is INDEPENDENT of the viewer watch-rate band
// ($0.00005–0.0001/s), which is untouched.
// ---------------------------------------------------------------------------

/** Agent consumption rate (USDC per second of footage bought at full rate). */
export const CLIP_RATE_PER_SEC = 0.001

/** Transcript skim bills at this fraction of CLIP_RATE_PER_SEC. */
export const SKIM_RATE_FRACTION = 0.05

/** Fixed service fee: base + per-minute of source duration, settled once at job start. */
export const CLIP_SERVICE_FEE_BASE = 0.1
export const CLIP_SERVICE_FEE_PER_MIN = 0.002

/**
 * Footage allowance used for quoting: the pipeline buys up to ~3 strong
 * regions (~100s each incl. extensions), so the max metered footage is this
 * many seconds at CLIP_RATE_PER_SEC. Estimates assume ~70% utilization.
 */
export const CLIP_FOOTAGE_ALLOWANCE_SECONDS = 300
export const CLIP_FOOTAGE_UTILIZATION = 0.7

export interface ClipQuote {
  /** Fixed service fee for this duration. */
  fee: number
  /** Full-transcript skim cost (metered, but fully consumed on every skim job). */
  skim: number
  /** Expected footage spend (~70% of the allowance). */
  footageEstimate: number
  /** Full footage allowance (100%). */
  footageMax: number
  /** fee + skim + footageEstimate — what a typical job costs. */
  estimated: number
  /** fee + skim + footageMax — the hard consumption cap for the job. */
  max: number
}

const round6 = (n: number) => Number(n.toFixed(6))

/** Server-authoritative quote; the modal uses the same pure function for display. */
export function computeClipQuote(durationSecs: number): ClipQuote {
  const fee = round6(CLIP_SERVICE_FEE_BASE + CLIP_SERVICE_FEE_PER_MIN * (durationSecs / 60))
  const skim = round6(durationSecs * CLIP_RATE_PER_SEC * SKIM_RATE_FRACTION)
  const footageMax = round6(CLIP_FOOTAGE_ALLOWANCE_SECONDS * CLIP_RATE_PER_SEC)
  const footageEstimate = round6(footageMax * CLIP_FOOTAGE_UTILIZATION)
  return {
    fee,
    skim,
    footageEstimate,
    footageMax,
    estimated: round6(fee + skim + footageEstimate),
    max: round6(fee + skim + footageMax),
  }
}

/**
 * Speech-density floor for AI clipping — the agent needs a transcript to work
 * with, so music/anime/silent videos are gated to MANUAL clipping instead.
 * SINGLE SOURCE OF TRUTH: the pipeline's pre-check, the enqueue gate, and the
 * watch-page UI all read these same thresholds.
 */
export const MIN_SPEECH_WORDS = 12
export const MIN_SPEECH_WORDS_PER_SECOND = 0.2

/** True when a measured word count / words-per-second is too sparse for AI clipping. */
export function isSpeechTooSparse(words: number, wordsPerSecond: number): boolean {
  return words < MIN_SPEECH_WORDS || wordsPerSecond < MIN_SPEECH_WORDS_PER_SECOND
}
