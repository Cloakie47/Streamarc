// lib/captions/languages.ts
// The languages offered for paid multi-language subtitles. Pure data — safe to
// import from both server routes and client components. Codes are Cloudflare
// Stream / BCP-47 language tags.

export interface SubtitleLanguage {
  /** Cloudflare/BCP-47 language tag. */
  code: string
  /** English display name. */
  name: string
  /** Name in the language itself (for the picker). */
  native: string
}

export const SUBTITLE_LANGUAGES: SubtitleLanguage[] = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "zh", name: "Mandarin (Chinese)", native: "中文" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "ja", name: "Japanese", native: "日本語" },
]

export const SUBTITLE_LANGUAGE_CODES = SUBTITLE_LANGUAGES.map((l) => l.code)

export function isSubtitleLanguage(code: string): boolean {
  return SUBTITLE_LANGUAGE_CODES.includes(code)
}

export function languageName(code: string): string {
  return SUBTITLE_LANGUAGES.find((l) => l.code === code)?.name ?? code
}

/** Price (USDC) to generate a non-English subtitle track. English is free. */
export const SUBTITLE_FEE_USDC = 0.05
