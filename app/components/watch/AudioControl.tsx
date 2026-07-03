"use client"

import { useEffect, useRef, useState } from "react"
import { AudioLines, Check, Loader2, ChevronDown } from "lucide-react"
import { DUB_LANGUAGES, DUB_PRICE_USDC, MAX_DUB_SECONDS, dubLabel } from "@/lib/dubs/languages"

interface AudioControlProps {
  videoId: string
  /** Cloudflare Stream uid — used to verify the manifest lists the new audio track. */
  cloudflareUid?: string
  /** Source video duration — dubbing is gated to short videos while in testing. */
  durationSecs: number
  /** Remount the player (fresh token) so its native audio menu picks up the new track. */
  onTrackAdded: () => void
}

// PLAYER NOTE (v1): @cloudflare/stream-react exposes NO audio-track prop (its
// iframe params cover defaultTextTrack but not audio). Alternate audio is
// surfaced by the player's own settings (⚙) menu, built from the HLS manifest.
// So this control GENERATES tracks and remounts the player when one lands;
// the viewer switches audio in the player's native menu. Documented limitation.

// Same measured reality as captions: the manifest lags "ready" by ~60s, so we
// verify (cache:"reload" refreshes the browser's copy) before declaring done.
const VERIFY_ATTEMPTS = 40 // × 3s ≈ 120s
const VERIFY_INTERVAL_MS = 3000

async function manifestHasAudio(uid: string, label: string): Promise<boolean> {
  try {
    const res = await fetch(`https://videodelivery.net/${uid}/manifest/video.m3u8`, { cache: "reload" })
    if (!res.ok) return false
    const text = await res.text()
    return text.split("\n").some((l) => l.includes("TYPE=AUDIO") && l.includes(`NAME="${label}"`))
  } catch {
    return false
  }
}

// Audio (dubbing) control — TEST feature, mirrors SubtitlesControl's UX:
// generate is ASYNC (worker job), we poll /status until ready, verify the
// manifest lists the track, then remount the player. Pay-once per language.
export default function AudioControl({ videoId, cloudflareUid, durationSecs, onTrackAdded }: AudioControlProps) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [open, setOpen] = useState(false)
  const [generatingLang, setGeneratingLang] = useState<string | null>(null)
  const [finishingLang, setFinishingLang] = useState<string | null>(null)
  const [successLang, setSuccessLang] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [insufficient, setInsufficient] = useState(false)
  const jobPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manifestPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const tooLong = durationSecs > MAX_DUB_SECONDS

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (jobPollRef.current) clearTimeout(jobPollRef.current)
      if (manifestPollRef.current) clearTimeout(manifestPollRef.current)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetch(`/api/dubs/list?video_id=${encodeURIComponent(videoId)}`)
      .then((r) => r.json())
      .then((d) => active && setAvailable(Array.isArray(d?.available) ? d.available : []))
      .catch(() => active && setAvailable([]))
    return () => {
      active = false
    }
  }, [videoId])

  // Wait for the manifest to list the track, then remount the player so its
  // native audio menu shows it. On timeout, remount anyway (token remount
  // reads an origin-fresh manifest, so this is best-effort belt-and-braces).
  function verifyThenRefresh(lang: string) {
    if (!cloudflareUid) {
      onTrackAdded()
      return
    }
    setFinishingLang(lang)
    let attempts = 0
    const tick = async () => {
      const listed = await manifestHasAudio(cloudflareUid, dubLabel(lang))
      if (!mountedRef.current) return
      if (listed || attempts >= VERIFY_ATTEMPTS) {
        setFinishingLang(null)
        onTrackAdded()
        return
      }
      attempts++
      manifestPollRef.current = setTimeout(tick, VERIFY_INTERVAL_MS)
    }
    void tick()
  }

  function onReady(lang: string, availableLangs: string[] | undefined, charged: number) {
    setAvailable(Array.isArray(availableLangs) ? availableLangs : (prev) => Array.from(new Set([...(prev ?? []), lang])))
    if (charged > 0) window.dispatchEvent(new CustomEvent("gateway-balance-updated"))
    setGeneratingLang(null)
    setSuccessLang(lang)
    verifyThenRefresh(lang)
  }

  function pollJob(jobId: string, lang: string) {
    const tick = async () => {
      try {
        const r = await fetch(`/api/dubs/status?job_id=${encodeURIComponent(jobId)}`)
        const s = await r.json()
        if (!mountedRef.current) return
        if (s.status === "ready") return onReady(lang, s.available, Number(s.charged ?? 0))
        if (s.status === "failed") {
          setError(s.error ?? "Audio translation failed — please try again.")
          setGeneratingLang(null)
          return
        }
        jobPollRef.current = setTimeout(tick, 3000)
      } catch {
        if (mountedRef.current) jobPollRef.current = setTimeout(tick, 3000)
      }
    }
    void tick()
  }

  async function generate(lang: string) {
    setError(null)
    setInsufficient(false)
    setSuccessLang(null)
    setGeneratingLang(lang)
    try {
      const res = await fetch("/api/dubs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, language: lang }),
      })
      const data = await res.json()
      if (res.status === 402 || data?.insufficient) {
        setInsufficient(true)
        setGeneratingLang(null)
        return
      }
      if (!res.ok) throw new Error(data?.error ?? "Failed to start audio translation")
      if (data.status === "ready") {
        onReady(lang, data.available, 0)
        return
      }
      if (data.job_id) pollJob(data.job_id, lang)
      else setGeneratingLang(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start audio translation")
      setGeneratingLang(null)
    }
  }

  const isAvailable = (code: string) => (available ?? []).includes(code)
  const busy = generatingLang !== null || finishingLang !== null

  // Live elapsed counter across the whole wait (dub ~1-4 min + track ~90s),
  // same pattern as SubtitlesControl.
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const waitStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (!busy) {
      waitStartRef.current = null
      setElapsedSecs(0)
      return
    }
    if (waitStartRef.current === null) waitStartRef.current = Date.now()
    const timer = setInterval(() => {
      if (waitStartRef.current !== null) setElapsedSecs(Math.floor((Date.now() - waitStartRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [busy])
  const elapsedLabel = `${Math.floor(elapsedSecs / 60)}:${String(elapsedSecs % 60).padStart(2, "0")}`

  if (tooLong) {
    return (
      <div className="relative">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium opacity-60 cursor-not-allowed"
        >
          <AudioLines size={16} />
          Audio
        </button>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Audio translation is in testing — available for videos under {Math.round(MAX_DUB_SECONDS / 60)} minutes.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
      >
        <AudioLines size={16} />
        Audio
        {busy && <Loader2 size={13} className="animate-spin text-primary" />}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-2xl">
          {DUB_LANGUAGES.map((l) => {
            const avail = isAvailable(l.code)
            const generating = generatingLang === l.code
            const finishing = finishingLang === l.code
            return (
              <button
                key={l.code}
                type="button"
                disabled={busy || avail}
                onClick={() => generate(l.code)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-60"
              >
                <span className="flex flex-col items-start">
                  <span>{l.native}</span>
                  {generating ? (
                    <span className="text-[11px] text-primary tabular-nums">
                      Translating audio… usually ready in a few minutes · {elapsedLabel}
                    </span>
                  ) : finishing ? (
                    <span className="text-[11px] text-primary tabular-nums">
                      Finishing up — adding the track to the player… · {elapsedLabel}
                    </span>
                  ) : avail ? (
                    <span className="text-[11px] text-muted-foreground">Ready — switch audio in the player&apos;s ⚙ menu</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Generate {l.name} — ${DUB_PRICE_USDC.toFixed(2)}
                    </span>
                  )}
                </span>
                {generating || finishing ? (
                  <Loader2 size={14} className="animate-spin text-primary" />
                ) : avail ? (
                  <Check size={14} className="text-primary" />
                ) : null}
              </button>
            )
          })}

          {successLang && (
            <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
              ✓ {dubLabel(successLang)} audio generated and saved. Switch to it in the player&apos;s ⚙ menu — it may
              take up to a minute to appear. You can keep watching.
            </div>
          )}
          {insufficient && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
              <p className="text-amber-300">Not enough balance to generate (${DUB_PRICE_USDC.toFixed(2)}).</p>
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
            AI audio translation (testing) — keeps the creator&apos;s voice. Saved to this video for everyone — paid once.
          </p>
        </div>
      )}
    </div>
  )
}
