"use client"

import { useEffect, useRef, useState } from "react"
import { Captions, Check, Loader2, ChevronDown } from "lucide-react"
import { SUBTITLE_LANGUAGES, SUBTITLE_FEE_USDC, languageName } from "@/lib/captions/languages"

interface SubtitlesControlProps {
  videoId: string
  /** Cloudflare Stream uid — used to verify the HLS manifest actually lists a track before turning it on. */
  cloudflareUid?: string
  /** The language code currently shown in the player, or null for off. */
  activeLang: string | null
  /** Turn a track on (code) or off (null) in the player. */
  onActivate: (lang: string | null) => void
}

// The player iframe builds its CC menu from the HLS manifest it fetched at
// mount time — which can lag Cloudflare's caption-API "ready" status (manifest
// regeneration + CDN cache). So we never assert a track is On until the PUBLIC
// manifest (the same artifact the player reads) actually lists it.
// cache: "reload" both bypasses the browser cache AND overwrites the cached
// entry with the fresh copy. The manifest is served with max-age=600, so a
// browser that cached it pre-generation would otherwise feed the player a
// caption-less manifest for up to 10 minutes. Every poll here refreshes that
// shared cache entry, so by the time we remount the player, its manifest
// request hits a current copy. (Same URL on purpose — a cache-busted URL
// would leave the player's own cache key stale.)

// Measured (2026-07): the manifest lags the caption API's "ready" by ~60s (CDN
// cache TTL) — both track adds and deletes propagated on that cadence. The
// visible verify window must comfortably outlast it.
const VERIFY_ATTEMPTS = 40 // × 3s ≈ 120s of "Finishing up…"
const VERIFY_INTERVAL_MS = 3000
// Past that, a background watcher keeps checking (spinner off, buttons usable)
// and re-fires activation the moment the track lands — no user action needed.
const WATCH_ATTEMPTS = 36 // × 5s ≈ 3 more minutes
const WATCH_INTERVAL_MS = 5000
async function manifestHasTrack(uid: string, lang: string): Promise<boolean> {
  try {
    const res = await fetch(`https://videodelivery.net/${uid}/manifest/video.m3u8`, { cache: "reload" })
    if (!res.ok) return false
    const text = await res.text()
    return text.split("\n").some((l) => l.includes("TYPE=SUBTITLES") && l.includes(`LANGUAGE="${lang}"`))
  } catch {
    return false
  }
}

// Subtitles control shown to everyone on the watch page. Generation is ASYNC:
// /generate enqueues a job, we poll /status until the track is ready on the
// caption API, then verify PLAYABILITY (the track appears in the HLS manifest)
// before turning it on — "generating… → finishing up… → On", never a blank wait
// and never an On the player can't actually render.
export default function SubtitlesControl({ videoId, cloudflareUid, activeLang, onActivate }: SubtitlesControlProps) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [open, setOpen] = useState(false)
  const [generatingLang, setGeneratingLang] = useState<string | null>(null)
  const [finishingLang, setFinishingLang] = useState<string | null>(null)
  // Language whose generation just SUCCEEDED — drives the reassurance alert so
  // the user knows it worked and will appear on its own, never "is it broken?".
  const [successLang, setSuccessLang] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [insufficient, setInsufficient] = useState(false)
  const jobPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manifestPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  // The language the user most recently asked to turn on. Any verify/watch loop
  // whose language no longer matches this aborts silently — so a slow watcher
  // for an old selection can never re-activate over a newer one (or over Off).
  const requestedLangRef = useRef<string | null>(null)

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
    fetch(`/api/captions/list?video_id=${encodeURIComponent(videoId)}`)
      .then((r) => r.json())
      .then((d) => active && setAvailable(Array.isArray(d?.available) ? d.available : []))
      .catch(() => active && setAvailable([]))
    return () => {
      active = false
    }
  }, [videoId])

  // Verify the manifest lists the track, THEN activate. Poll up to ~120s — the
  // CDN was measured to lag API-ready by ~60s, so the visible window must
  // outlast that. If it STILL isn't listed, activate best-effort and hand off
  // to a background watcher that re-fires activation when the track lands.
  function verifyThenActivate(lang: string) {
    if (!cloudflareUid) {
      onActivate(lang)
      return
    }
    requestedLangRef.current = lang
    if (manifestPollRef.current) clearTimeout(manifestPollRef.current)
    setFinishingLang(lang)
    let attempts = 0
    const tick = async () => {
      const playable = await manifestHasTrack(cloudflareUid, lang)
      if (!mountedRef.current || requestedLangRef.current !== lang) return
      if (playable) {
        setFinishingLang(null)
        onActivate(lang) // WatchPage remounts the player with defaultTextTrack
        return
      }
      if (attempts >= VERIFY_ATTEMPTS) {
        console.warn(`[subtitles] manifest still missing "${lang}" after ~${(VERIFY_ATTEMPTS * VERIFY_INTERVAL_MS) / 1000}s — activating best-effort, watching in background`)
        setFinishingLang(null)
        onActivate(lang)
        watchInBackground(lang)
        return
      }
      attempts++
      manifestPollRef.current = setTimeout(tick, VERIFY_INTERVAL_MS)
    }
    void tick()
  }

  // Safety net for a slower-than-measured CDN: quietly keep checking after the
  // visible window times out, and the moment the manifest lists the track,
  // re-fire onActivate — WatchPage remounts the player, whose CC menu is built
  // from the (now-updated) manifest. The caption appears with no user action.
  function watchInBackground(lang: string) {
    if (!cloudflareUid) return
    let attempts = 0
    const tick = async () => {
      const playable = await manifestHasTrack(cloudflareUid, lang)
      if (!mountedRef.current || requestedLangRef.current !== lang) return
      if (playable) {
        onActivate(lang)
        return
      }
      if (attempts >= WATCH_ATTEMPTS) {
        console.warn(`[subtitles] background watch gave up — "${lang}" never appeared in the manifest`)
        return
      }
      attempts++
      manifestPollRef.current = setTimeout(tick, WATCH_INTERVAL_MS)
    }
    void tick()
  }

  function onReady(lang: string, availableLangs: string[] | undefined, charged: number) {
    setAvailable(Array.isArray(availableLangs) ? availableLangs : (prev) => Array.from(new Set([...(prev ?? []), lang])))
    if (charged > 0) window.dispatchEvent(new CustomEvent("gateway-balance-updated"))
    setGeneratingLang(null)
    setSuccessLang(lang)
    verifyThenActivate(lang)
  }

  function pollJob(jobId: string, lang: string) {
    const tick = async () => {
      try {
        const r = await fetch(`/api/captions/status?job_id=${encodeURIComponent(jobId)}`)
        const s = await r.json()
        if (!mountedRef.current) return
        if (s.status === "ready") return onReady(lang, s.available, Number(s.charged ?? 0))
        if (s.status === "failed") {
          setError(s.error ?? "Subtitle generation failed — please try again.")
          setGeneratingLang(null)
          return
        }
        jobPollRef.current = setTimeout(tick, 3000) // queued/running — keep waiting
      } catch {
        if (mountedRef.current) jobPollRef.current = setTimeout(tick, 3000) // transient — retry
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
      const res = await fetch("/api/captions/generate", {
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
      if (!res.ok) throw new Error(data?.error ?? "Failed to start subtitle generation")
      if (data.status === "ready") {
        // Already generated — no job, no charge; still verify playability first.
        onReady(lang, data.available, 0)
        return
      }
      if (data.job_id) pollJob(data.job_id, lang)
      else setGeneratingLang(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start subtitle generation")
      setGeneratingLang(null)
    }
  }

  const isAvailable = (code: string) => (available ?? []).includes(code)
  const busy = generatingLang !== null || finishingLang !== null

  // Live elapsed counter for the whole wait (generation ~10s + CDN ~60s), so
  // the ~70s to a visible caption feels alive rather than frozen. One timer
  // spans both phases: generating -> finishing (the state handoff is batched,
  // so `busy` never flickers false in between and the clock keeps running).
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-white/5 transition-colors"
      >
        <Captions size={16} />
        Subtitles
        {busy ? (
          <Loader2 size={13} className="animate-spin text-primary" />
        ) : (
          activeLang && <span className="text-xs uppercase text-primary">{activeLang}</span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-2xl">
          {/* Off */}
          <button
            type="button"
            onClick={() => {
              // Cancel any pending verify/background watch so it can't re-activate later.
              requestedLangRef.current = null
              if (manifestPollRef.current) clearTimeout(manifestPollRef.current)
              setFinishingLang(null)
              onActivate(null)
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-white/5"
          >
            <span>Off</span>
            {activeLang === null && <Check size={14} className="text-primary" />}
          </button>

          <div className="my-1 h-px bg-border" />

          {SUBTITLE_LANGUAGES.map((l) => {
            const avail = isAvailable(l.code)
            const generating = generatingLang === l.code
            const finishing = finishingLang === l.code
            const isEnglish = l.code === "en"
            return (
              <button
                key={l.code}
                type="button"
                disabled={busy}
                onClick={() => (avail ? verifyThenActivate(l.code) : generate(l.code))}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-60"
              >
                <span className="flex flex-col items-start">
                  <span>{l.native}</span>
                  {generating ? (
                    <span className="text-[11px] text-primary tabular-nums">
                      Generating {l.name} subtitles… usually ready in about a minute · {elapsedLabel}
                    </span>
                  ) : finishing ? (
                    <span className="text-[11px] text-primary tabular-nums">
                      Finishing up — waiting for the video CDN to list the track… · {elapsedLabel}
                    </span>
                  ) : (
                    !avail && (
                      <span className="text-[11px] text-muted-foreground">
                        Generate {l.name} — {isEnglish ? "free" : `$${SUBTITLE_FEE_USDC.toFixed(2)}`}
                      </span>
                    )
                  )}
                </span>
                {generating || finishing ? (
                  <Loader2 size={14} className="animate-spin text-primary" />
                ) : avail ? (
                  activeLang === l.code ? <Check size={14} className="text-primary" /> : <span className="text-[11px] text-muted-foreground">On</span>
                ) : null}
              </button>
            )
          })}

          {successLang && (
            <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
              ✓ {languageName(successLang)} subtitles generated and saved. They&apos;ll appear in the player
              automatically — usually within about a minute. You can keep watching.
            </div>
          )}
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
