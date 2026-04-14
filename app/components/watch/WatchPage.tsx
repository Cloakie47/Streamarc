"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { Stream } from "@cloudflare/stream-react";
import { Settings, Maximize, Bookmark, Heart } from "lucide-react";
import { createWatchSession, endWatchSession, settleWatchSession } from "@/app/lib/payments";
import { PAYMENT_CONFIG } from "@/app/lib/constants";
import { useCurrentUser } from "@/app/lib/auth-client";
import { FROSTED_PLAY_CLASSES, FrostedPauseSvg, FrostedPlayMark, FrostedPlaySvg } from "@/app/components/ui/FrostedPlayMark";

const upNext = [
  { id: "2", title: "Cross-chain bridge live demo", project: "BridgeARC", duration: "7:14", bg: "from-[#021610] to-[#041e18]" },
  { id: "3", title: "Smart contract deployment", project: "ArcDev", duration: "9:01", bg: "from-[#140410] to-[#200818]" },
  { id: "4", title: "NFT marketplace walkthrough", project: "ArcMarket", duration: "3:55", bg: "from-[#0e0520] to-[#160a30]" },
  { id: "5", title: "Staking mechanism explained", project: "ArcStake", duration: "5:28", bg: "from-[#050c20] to-[#091430]" },
  { id: "6", title: "Governance voting explained", project: "ArcGov", duration: "6:12", bg: "from-[#081020] to-[#0c1830]" },
];

const { intervalSeconds, freePreviewSeconds } = PAYMENT_CONFIG;

function formatSubCentsShows(rate: number) {
  if (rate >= 0.01) return rate.toFixed(2);
  return rate.toFixed(5);
}

export interface WatchPageProps {
  videoId: string;
  creatorId: string;
  title: string;
  description: string;
  cloudflareUid?: string;
  ratePerSecond: number;
  durationSecs: number;
  creator?: {
    id: string;
    display_name: string | null;
    channel_name: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
  } | null;
  chapters?: { time: number; title: string }[] | null;
  onBalanceChange?: (bal: number) => void;
}

export default function WatchPage({
  videoId,
  creatorId,
  title,
  description,
  cloudflareUid,
  ratePerSecond,
  durationSecs,
  creator,
  chapters,
  onBalanceChange,
}: WatchPageProps) {
  const [playing, setPlaying] = useState(false);
  const [secs, setSecs] = useState(0);
  const [free, setFree] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showTopUpPrompt, setShowTopUpPrompt] = useState(false);

  const { userId, balance: userBalance } = useCurrentUser();
  const VIEWER_ID = userId || "";
  const isOwnVideo = VIEWER_ID === creatorId;

  const [balance, setBalance] = useState(userBalance || 0);
  const [tipAmount, setTipAmount] = useState("");
  const [tipping, setTipping] = useState(false);
  const [tipSuccess, setTipSuccess] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [savedToWatchlist, setSavedToWatchlist] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionSettledRef = useRef(false);
  const lastSettledSecsRef = useRef(0);
  const initialBalanceRef = useRef(userBalance ?? 0);
  const prevPlayingRef = useRef(false);
  const creatingSessionRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamRef = useRef<any>(null);

  const handlePlay = () => {
    if (!playing && !isOwnVideo && balance < 0.001) {
      if (userId) {
        fetch("/api/gateway/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.balance > 0.001) {
              setBalance(data.balance);
              initialBalanceRef.current = data.balance;
              setShowTopUpPrompt(false);
              setPlaying(true);
            } else {
              setShowTopUpPrompt(true);
            }
          });
        return;
      }
      setShowTopUpPrompt(true);
      return;
    }
    setShowTopUpPrompt(false);
    setPlaying((p) => !p);
  };

  useEffect(() => {
    initialBalanceRef.current = userBalance ?? 0;
  }, [userBalance]);

  useEffect(() => {
    secsRef.current = secs;
  }, [secs]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const recordHistory = useCallback(
    (totalSecs: number) => {
      if (!VIEWER_ID || totalSecs < 3) return;
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: VIEWER_ID,
          video_id: videoId,
          action: "add",
          seconds_watched: totalSecs,
        }),
        keepalive: true,
      }).catch(() => {});
    },
    [VIEWER_ID, videoId],
  );

  const settleIfNeeded = useCallback(
    async (reason: "pause" | "unload") => {
      const sid = sessionIdRef.current;
      if (!VIEWER_ID || !sid) return;

      const totalSecsWatched = secsRef.current;

      if (!sessionSettledRef.current) {
        const alreadyPaid = lastSettledSecsRef.current;
        const paidSeconds = Math.max(0, totalSecsWatched - Math.max(alreadyPaid, freePreviewSeconds));

        if (paidSeconds > 0 && !isOwnVideo) {
          sessionSettledRef.current = true;
          const result = await settleWatchSession(
            sid,
            VIEWER_ID,
            creatorId,
            videoId,
            paidSeconds,
            { keepalive: reason === "unload" },
          );
          if (result.success) {
            lastSettledSecsRef.current = totalSecsWatched;
            sessionSettledRef.current = false;
            window.dispatchEvent(new CustomEvent("gateway-balance-updated"));
          } else {
            sessionSettledRef.current = false;
            console.error("Settlement failed:", result.error);
          }
        }
      }

      if (reason === "unload") {
        await endWatchSession(sid, totalSecsWatched);
        setSessionId(null);
      }
    },
    [VIEWER_ID, isOwnVideo, creatorId, videoId],
  );

  useEffect(() => {
    if (!VIEWER_ID) return;

    if (sessionId) return;
    if (creatingSessionRef.current) return;
    creatingSessionRef.current = true;

    createWatchSession(VIEWER_ID, videoId).then((id) => {
      creatingSessionRef.current = false;
      if (id) {
        sessionSettledRef.current = false;
        lastSettledSecsRef.current = 0;
        setSecs(0);
        secsRef.current = 0;
        setFree(true);
        setSessionId(id);
      }
    });
  }, [VIEWER_ID, sessionId, videoId]);

  useEffect(() => {
    const handleUnload = () => {
      recordHistory(secsRef.current);
      void settleIfNeeded("unload");
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [settleIfNeeded, recordHistory]);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("gateway-balance-live", { detail: { balance: initialBalanceRef.current } }));
      void settleIfNeeded("unload");
    };
  }, [settleIfNeeded]);

  useEffect(() => {
    if (prevPlayingRef.current && !playing) {
      recordHistory(secsRef.current);
      window.dispatchEvent(new CustomEvent("gateway-balance-live", { detail: { balance } }));
      void settleIfNeeded("pause");
    }
    prevPlayingRef.current = playing;
  }, [playing, settleIfNeeded, balance, recordHistory]);

  const fireBatch = useCallback(async (secondsCovered: number) => {
    void secondsCovered;
  }, []);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setSecs((s) => {
          const next = s + 1;
          secsRef.current = next;

          if (next > freePreviewSeconds && free) {
            setFree(false);
          }

          const paidSecs = next - freePreviewSeconds;
          if (
            !isOwnVideo &&
            next > freePreviewSeconds &&
            paidSecs > 0 &&
            paidSecs % intervalSeconds === 0
          ) {
            void fireBatch(intervalSeconds);
          }

          if (!isOwnVideo && next > freePreviewSeconds) {
            const costAccrued = (next - freePreviewSeconds) * ratePerSecond;
            const newBal = Math.max(0, initialBalanceRef.current - costAccrued);
            setBalance(newBal);
            window.dispatchEvent(new CustomEvent("gateway-balance-live", { detail: { balance: newBal } }));
            setTimeout(() => onBalanceChange?.(newBal), 0);
          }

          return next;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, free, fireBatch, onBalanceChange, isOwnVideo, ratePerSecond, intervalSeconds]);

  useEffect(() => {
    if (!VIEWER_ID) return
    fetch("/api/gateway/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: VIEWER_ID }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.balance !== undefined) {
          setBalance(data.balance)
          initialBalanceRef.current = data.balance
        }
      })
      .catch(() => {})
  }, [VIEWER_ID])

  useEffect(() => {
    if (!VIEWER_ID || !videoId) return;
    fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: VIEWER_ID, video_id: videoId, action: "check" }),
    })
      .then((r) => r.json())
      .then((data: { saved?: boolean }) => setSavedToWatchlist(!!data.saved))
      .catch(() => {});
  }, [VIEWER_ID, videoId]);

  useEffect(() => {
    if (!VIEWER_ID || !videoId) return;
    fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: VIEWER_ID, video_id: videoId, action: "check" }),
    })
      .then((r) => r.json())
      .then((data: { favorited?: boolean }) => setFavorited(!!data.favorited))
      .catch(() => {});
  }, [VIEWER_ID, videoId]);

  const cost = isOwnVideo || free ? 0 : (secs - freePreviewSeconds) * ratePerSecond;
  const paidSecs = isOwnVideo || free ? 0 : secs - freePreviewSeconds;
  const progress = Math.min((secs / Math.max(durationSecs, 1)) * 100, 100);
  const currentTime = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const totalTime = `${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, "0")}`;
  const rateStatusLabel = `$${formatSubCentsShows(ratePerSecond)}/sec`;

  const handleEnlarge = (e: React.MouseEvent) => {
    e.stopPropagation();
    const player = document.querySelector(".player-container");
    if (player) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        player.requestFullscreen?.();
      }
    }
  };

  const handleChapterClick = (time: number) => {
    if (streamRef.current) {
      streamRef.current.currentTime = time;
      void streamRef.current.play();
    }
  };

  const handleWatchLater = async () => {
    if (!VIEWER_ID) return;
    setSavingWatchlist(true);
    try {
      const action = savedToWatchlist ? "remove" : "add";
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: VIEWER_ID, video_id: videoId, action }),
      });
      const data = (await res.json()) as { saved?: boolean };
      setSavedToWatchlist(!!data.saved);
    } finally {
      setSavingWatchlist(false);
    }
  };

  const handleFavorite = async () => {
    if (!VIEWER_ID) return;
    setTogglingFavorite(true);
    try {
      const action = favorited ? "remove" : "add";
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: VIEWER_ID, video_id: videoId, action }),
      });
      const data = (await res.json()) as { favorited?: boolean };
      setFavorited(!!data.favorited);
    } finally {
      setTogglingFavorite(false);
    }
  };

  const handleTip = async () => {
    if (!VIEWER_ID || !tipAmount || isOwnVideo) return;
    setTipping(true);
    setTipError(null);
    setTipSuccess(false);
    try {
      const res = await fetch("/api/gateway/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewer_id: VIEWER_ID,
          creator_id: creatorId,
          video_id: videoId,
          amount: tipAmount,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTipError(data.error ?? "Tip failed");
      } else {
        setTipSuccess(true);
        setTipAmount("");
        window.dispatchEvent(new CustomEvent("gateway-balance-updated"));
        setTimeout(() => setTipSuccess(false), 5000);
      }
    } catch {
      setTipError("Tip failed");
    } finally {
      setTipping(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-12 xl:flex-row">
      {/* ── Left: video + metadata + stats ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {showTopUpPrompt && (
          <div className="mb-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-5 py-3 text-sm text-yellow-200">
            Your Gateway balance is too low to watch.
            <button
              type="button"
              onClick={() => setShowTopUpPrompt(false)}
              className="ml-2 cursor-pointer border-none bg-transparent text-yellow-400 underline"
            >
              Top up in sidebar
            </button>
          </div>
        )}

        {isOwnVideo && (
          <div className="mb-3 rounded-xl border border-sa-blue/30 bg-sa-blue/10 px-5 py-3 text-sm text-foreground">
            You&apos;re watching your own video — no charges apply
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div
            role={cloudflareUid ? undefined : "button"}
            tabIndex={cloudflareUid ? undefined : 0}
            onKeyDown={cloudflareUid ? undefined : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handlePlay();
              }
            }}
            onClick={cloudflareUid ? undefined : handlePlay}
            className={`player-container panel aspect-video w-full overflow-hidden relative group bg-black ${!cloudflareUid ? "cursor-pointer" : ""}`}
          >
            {!cloudflareUid && (
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a2333] via-[#111827] to-black" />
            )}
            {cloudflareUid && (
              <Stream
                streamRef={streamRef}
                src={cloudflareUid}
                className="absolute inset-0 w-full h-full z-[1]"
                controls
                onPlaying={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onWaiting={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onSeeking={() => setPlaying(false)}
                onSeeked={() => setPlaying(true)}
              />
            )}

            {!cloudflareUid && (
              <div className={`absolute inset-0 z-[5] flex items-center justify-center transition-opacity duration-200 ${
                playing ? "opacity-0 group-hover:opacity-100" : "opacity-100"
              }`}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                  aria-label={playing ? "Pause" : "Play"}
                  className={`${FROSTED_PLAY_CLASSES} h-16 w-16 cursor-pointer border-none p-0`}
                >
                  {playing ? (
                    <FrostedPauseSvg className="h-6 w-6 fill-current text-white drop-shadow-md" />
                  ) : (
                    <FrostedPlaySvg className="ml-1 h-6 w-6 fill-current text-white drop-shadow-md" />
                  )}
                </button>
              </div>
            )}

            {!cloudflareUid && (
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <div className="relative h-1 w-full cursor-pointer overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full transition-all duration-300" style={{ background: "linear-gradient(90deg, hsl(214 58% 69%), hsl(193 42% 67%))", width: `${progress}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                      aria-label={playing ? "Pause" : "Play"}
                      className={`h-8 w-8 cursor-pointer border-none p-0 ${FROSTED_PLAY_CLASSES}`}
                    >
                      {playing ? <FrostedPauseSvg className="h-[38%] w-[38%] fill-current drop-shadow-md" /> : <FrostedPlaySvg className="ml-0.5 h-[38%] w-[38%] fill-current drop-shadow-md" />}
                    </button>
                    <span className="font-mono text-xs font-medium text-white/70">{currentTime} / {totalTime}</span>
                    {!free && playing && !isOwnVideo && (
                      <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 backdrop-blur-md">
                        <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-sa-red" />
                        <span className="text-[11px] font-semibold tabular-nums text-white/90">${cost.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={(e) => e.stopPropagation()} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer bg-transparent border-none">
                      <Settings size={16} />
                    </button>
                    <button type="button" onClick={handleEnlarge} aria-label="Fullscreen" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all cursor-pointer bg-transparent border-none">
                      <Maximize size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Chapter list — shown below player for any video with chapters ── */}
        {chapters && chapters.length > 0 && (
          <div className="mt-3 panel p-4 flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sa-text-3 mb-1">Chapters</p>
            <div className="flex flex-col gap-0.5">
              {chapters.map((chapter, i) => {
                const mm = Math.floor(chapter.time / 60);
                const ss = String(chapter.time % 60).padStart(2, "0");
                const isActive = secs >= chapter.time && (i === chapters.length - 1 || secs < chapters[i + 1].time);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleChapterClick(chapter.time)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-left w-full border-none bg-transparent cursor-pointer ${
                      isActive
                        ? "bg-sa-surface-2 text-foreground"
                        : "text-sa-text-3 hover:bg-sa-surface-2/50 hover:text-foreground"
                    }`}
                  >
                    <span className="font-mono text-[11px] tabular-nums w-9 flex-shrink-0 text-sa-accent">
                      {mm}:{ss}
                    </span>
                    <span className="font-medium leading-snug">{chapter.title}</span>
                    {isActive && (
                      <span className="ml-auto flex-shrink-0 h-1.5 w-1.5 rounded-full bg-sa-accent animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-5 flex flex-col gap-4"
        >
          {/* Title */}
          <h1 className="text-2xl font-semibold tracking-tight leading-snug">{title}</h1>

          {/* Creator row — inline, compact */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
              onClick={() => window.location.href = `/profile/${creatorId}`}
            >
              <div className="h-9 w-9 rounded-full overflow-hidden flex-shrink-0 border border-sa-border">
                {creator?.avatar_url ? (
                  <img src={creator.avatar_url} alt="Creator" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-sm font-bold text-[hsl(var(--primary-foreground))]"
                    style={{ background: "linear-gradient(135deg, #9ab7dc, #c8d9ef)" }}
                  >
                    {(creator?.channel_name || creator?.display_name || creatorId).slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">
                  {creator?.channel_name || creator?.display_name || "Creator"}
                </span>
                {creator?.is_verified && (
                  <svg className="h-4 w-4 text-sa-blue" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                {VIEWER_ID && (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleWatchLater();
                      }}
                      disabled={savingWatchlist}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        savedToWatchlist
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "border-sa-border text-sa-text-3 hover:text-foreground hover:border-sa-border-hover"
                      }`}
                    >
                      <Bookmark size={14} className={savedToWatchlist ? "fill-current" : ""} />
                      {savedToWatchlist ? "Saved" : "Watch Later"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleFavorite();
                      }}
                      disabled={togglingFavorite}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        favorited
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : "border-sa-border text-sa-text-3 hover:text-foreground hover:border-sa-border-hover"
                      }`}
                    >
                      <Heart size={14} className={favorited ? "fill-current" : ""} />
                      {favorited ? "Favourited" : "Favourite"}
                    </button>
                  </span>
                )}
                <span className="text-sa-text-3">·</span>
                <span className="text-sa-text-3">{totalTime}</span>
                <span className="text-sa-text-3">·</span>
                <span className="rounded-full bg-sa-surface-2 px-2.5 py-0.5 font-mono text-xs tabular-nums text-foreground border border-sa-border">
                  {rateStatusLabel}
                </span>
              </div>
            </div>

            {!isOwnVideo && VIEWER_ID && (
              <div className="flex flex-wrap items-center gap-2">
                {["0.01", "0.05", "0.10"].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setTipAmount(amount)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                      tipAmount === amount
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-sa-border text-sa-text-3 hover:text-foreground hover:border-sa-border-hover"
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
                <input
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="Amount"
                  min="0.001"
                  step="0.001"
                  className="h-9 w-24 rounded-lg border border-sa-border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={handleTip}
                  disabled={tipping || !tipAmount || Number.parseFloat(tipAmount) < 0.001}
                  className="btn btn-primary btn-sm disabled:opacity-50"
                >
                  {tipping ? "Sending..." : "Tip"}
                </button>
              </div>
            )}
          </div>

          {(!isOwnVideo && VIEWER_ID) && (tipError || tipSuccess) && (
            <div className="flex items-center gap-2 text-xs">
              {tipError && <p className="text-destructive">{tipError}</p>}
              {tipSuccess && <p className="text-green-400">Tip sent!</p>}
            </div>
          )}

          {/* Description */}
          {description && (
            <div className="panel p-4">
              <p className="text-sm text-sa-text-3 leading-relaxed">{description}</p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-sa-text-3">
            {free
              ? `First ${freePreviewSeconds}s free. Payments fire every ${intervalSeconds}s after preview ends.`
              : playing
                ? isOwnVideo
                  ? "You're the creator — playback is free."
                  : `Paying $${formatSubCentsShows(ratePerSecond)}/sec · batch every ${intervalSeconds}s via Circle x402 · pause anytime`
                : "Paused — charges stopped instantly."}
          </p>

          {/* Stats — full-width horizontal row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Session Cost", value: `$${cost.toFixed(4)}`, color: "text-sa-accent" },
              { label: "Seconds Paid", value: `${paidSecs}s`, color: "text-foreground" },
              { label: "Balance", value: `$${balance.toFixed(4)}`, color: "text-sa-green" },
              { label: "Current Rate", value: rateStatusLabel, color: "text-foreground" },
            ].map((stat) => (
              <div key={stat.label} className="panel-muted px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sa-text-3">{stat.label}</p>
                <p className={`mt-1.5 text-base font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

        </motion.div>

      </div>

      {/* ── Right: single Up next column ── */}
      <div className="w-full flex-shrink-0 flex flex-col gap-3 xl:w-[340px]">
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-sa-text-3">Up next</h3>
        {upNext.map((v) => (
          <div key={v.id} className="panel flex gap-3 group cursor-pointer p-3 transition-colors hover:border-sa-border-hover">
            <div className="w-[136px] aspect-video rounded-xl overflow-hidden flex-shrink-0 relative">
              <div className={`absolute inset-0 bg-gradient-to-br ${v.bg}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all">
                  <FrostedPlaySvg className="ml-0.5 h-2.5 w-2.5 fill-current text-white" />
                </div>
              </div>
              <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-white/80 bg-black/60 backdrop-blur-sm rounded px-1 py-px">
                {v.duration}
              </span>
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-1 py-0.5">
              <h4 className="line-clamp-2 text-[13px] font-semibold leading-snug transition-colors group-hover:text-foreground">{v.title}</h4>
              <span className="text-[11px] text-sa-text-3">{v.project}</span>
              <span className="text-[11px] text-sa-text-3">Suggested next</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
