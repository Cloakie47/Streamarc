// lib/dubs/languages.ts
// AI dubbing (TEST FEATURE) — config + language set. Mirrors the paid-captions
// pattern: async worker job, pay-once per language, charge only on success.

import { languageName } from "../captions/languages.ts"

/** Dubbing is in testing — only short videos are eligible. */
export const MAX_DUB_SECONDS = 120

/**
 * Price per language per video (USDC). Covers the ~$0.66 cost of a 2-min dub
 * at ElevenLabs' ~$0.33/min plus margin. Tunable.
 */
export const DUB_PRICE_USDC = 0.75

/**
 * Dubbable languages: the caption set MINUS the ones ElevenLabs Dubbing's
 * 29-language set does not cover — Malayalam and Vietnamese (caption-only).
 * Turkish IS in the 29. "en" stays in — useful for non-English source videos.
 */
export const DUB_LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "zh", name: "Mandarin (Chinese)", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
] as const

export function isDubLanguage(code: string): boolean {
  return DUB_LANGUAGES.some((l) => l.code === code)
}

/** Human label used both in the UI and as the Cloudflare audio-track label. */
export function dubLabel(code: string): string {
  return languageName(code)
}
