// Shared clip configuration — pure constants, safe to import from both client
// components and server routes.

/**
 * Minimum source-video length (seconds) for AI clipping ("Generate Clips with
 * the AI Agent"). Shorter videos can still be clipped MANUALLY (no minimum).
 */
export const MIN_AI_CLIP_SECONDS = 120

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
