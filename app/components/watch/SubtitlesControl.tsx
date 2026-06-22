"use client"

import { useEffect, useState } from "react"
import { Captions, Check, Loader2, ChevronDown } from "lucide-react"
import { SUBTITLE_LANGUAGES, SUBTITLE_FEE_USDC } from "@/lib/captions/languages"

interface SubtitlesControlProps {
  videoId: string
  /** The language code currently shown in the player, or null for off. */
  activeLang: string | null
  /** Turn a track on (code) or off (null) in the player. */
  onActivate: (lang: string | null) => void
}

// Subtitles control shown to everyone on the watch page. Lists the languages
// already generated (free to turn on) and the ones that can be generated for
// $0.05 (English is free). Generating a language makes it available to all
// future viewers — paid once, benefits everyone.
export default function SubtitlesControl({ videoId, activeLang, onActivate }: SubtitlesControlProps) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [open, setOpen] = useState(false)
  const [busyLang, setBusyLang] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [insufficient, setInsufficient] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/captions/list?video_id=${encodeURIComponent(videoId)}`)
      .then((r) => r.json())
      .then((d) => active && setAvailable(Array.isArray(d?.available) ? d.available : []))
      .catch(() => active && setAvailable([]))
    return () => {
      active = false
    }
  }, [videoId])

  async function generate(lang: string) {
    setBusyLang(lang)
    setError(null)
    setInsufficient(false)
    try {
      const res = await fetch("/api/captions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, language: lang }),
      })
      const data = await res.json()
      if (res.status === 402 || data?.insufficient) {
        setInsufficient(true)
        return
      }
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate subtitles")
      setAvailable(Array.isArray(data.available) ? data.available : (prev) => Array.from(new Set([...(prev ?? []), lang])))
      onActivate(lang) // turn the new track on
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate subtitles")
    } finally {
      setBusyLang(null)
    }
  }

  const isAvailable = (code: string) => (available ?? []).includes(code)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
      >
        <Captions size={16} />
        Subtitles
        {activeLang && <span className="text-xs uppercase text-primary">{activeLang}</span>}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-2xl">
          {/* Off */}
          <button
            type="button"
            onClick={() => onActivate(null)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-white/5"
          >
            <span>Off</span>
            {activeLang === null && <Check size={14} className="text-primary" />}
          </button>

          <div className="my-1 h-px bg-border" />

          {SUBTITLE_LANGUAGES.map((l) => {
            const avail = isAvailable(l.code)
            const busy = busyLang === l.code
            const isEnglish = l.code === "en"
            return (
              <button
                key={l.code}
                type="button"
                disabled={busy || busyLang !== null}
                onClick={() => (avail ? onActivate(l.code) : generate(l.code))}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-60"
              >
                <span className="flex flex-col items-start">
                  <span>{l.native}</span>
                  {!avail && (
                    <span className="text-[11px] text-muted-foreground">
                      Generate {l.name} — {isEnglish ? "free" : `$${SUBTITLE_FEE_USDC.toFixed(2)}`}
                    </span>
                  )}
                </span>
                {busy ? (
                  <Loader2 size={14} className="animate-spin text-primary" />
                ) : avail ? (
                  activeLang === l.code ? <Check size={14} className="text-primary" /> : <span className="text-[11px] text-muted-foreground">On</span>
                ) : null}
              </button>
            )
          })}

          {insufficient && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
              <p className="text-amber-300">Not enough balance to generate (${SUBTITLE_FEE_USDC.toFixed(2)}).</p>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("open-top-up"))}
                className="mt-1 rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90"
              >
                Top up balance
              </button>
            </div>
          )}
          {error && <p className="mt-2 px-1 text-xs text-destructive">{error}</p>}
          <p className="mt-2 px-1 text-[10px] text-muted-foreground">
            Generated subtitles are saved to this video for everyone — paid once.
          </p>
        </div>
      )}
    </div>
  )
}
