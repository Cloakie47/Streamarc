"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { Stream } from "@cloudflare/stream-react";
import { Settings, Maximize } from "lucide-react";
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

const REAL_CREATOR_ID = "bef48cbd-e0cf-4a0c-819b-06e66bc6fa09";
const LEGACY_CREATOR_ID = "9a2c81f5-8fa1-4b4c-8029-bd89e3f5c941";

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
  onBalanceChange,
}: WatchPageProps) {
  const [playing, setPlaying] = useState(false);
  const [secs, setSecs] = useState(0);
  const [free, setFree] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showTopUpPrompt, setShowTopUpPrompt] = useState(false);

  const { userId, balance: userBalance } = useCurrentUser();
  const VIEWER_ID = userId || "";
  const isOwnVideo =
    VIEWER_ID === creatorId ||
    (VIEWER_ID === REAL_CREATOR_ID && creatorId === LEGACY_CREATOR_ID);

  const [balance, setBalance] = useState(userBalance || 0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secsRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sessionSettledRef = useRef(false);
  const lastSettledSecsRef = useRef(0);
  const initialBalanceRef = useRef(userBalance ?? 0);
  const prevPlayingRef = useRef(false);
  const creatingSessionRef = useRef(false);

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

  const settleIfNeeded = useCallback(
    async (reason: "pause" | "unload") => {
      const sid = sessionIdRef.current;
      if (!VIEWER_ID || !sid || sessionSettledRef.current) return;

      const totalSecsWatched = secsRef.current;
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
      void settleIfNeeded("unload");
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [settleIfNeeded]);

  useEffect(() => {
    return () => {
      void settleIfNeeded("unload");
    };
  }, [settleIfNeeded]);

  useEffect(() => {
    if (prevPlayingRef.current && !playing) {
      void settleIfNeeded("pause");
    }
    prevPlayingRef.current = playing;
  }, [playing, settleIfNeeded]);

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

  const cost = isOwnVideo || free ? 0 : (secs - freePreviewSeconds) * ratePerSecond;
  const paidSecs = isOwnVideo || free ? 0 : secs - freePreviewSeconds;
  const progress = Math.min((secs / Math.max(durationSecs, 1)) * 100, 100);
  const currentTime = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const totalTime = `${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, "0")}`;
  const creatorShort = creatorId.slice(0, 2).toUpperCase();

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

  return (
    <div className="flex gap-6 pb-12">
      {/* ── Left: video + metadata + stats ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {showTopUpPrompt && (
          <div className="mb-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-5 py-3 text-sm text-yellow-400">
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
          <div className="mb-3 rounded-xl border border-sa-blue/30 bg-sa-blue/10 px-5 py-3 text-sm text-sa-blue">
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
            className={`player-container aspect-video w-full rounded-2xl overflow-hidden relative group bg-black ${!cloudflareUid ? "cursor-pointer" : ""}`}
          >
            {!cloudflareUid && (
              <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-[#0c0c0e] to-black" />
            )}
            {cloudflareUid && (
              <Stream
                src={cloudflareUid}
                className="absolute inset-0 w-full h-full z-[1]"
                controls
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
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
                <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden cursor-pointer">
                  <div className="h-full rounded-full transition-all duration-300" style={{ background: "var(--sa-accent)", width: `${progress}%` }} />
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4"
        >
          <h1 className="text-xl font-bold tracking-tight leading-snug">{title}</h1>
          <div className="flex items-center gap-3 mt-2 text-sa-text-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #5eb0ff, #3b82f6)" }}
              >
                {creatorShort}
              </div>
              <span className="text-sm font-medium text-foreground">Creator</span>
            </div>
            <span className="w-1 h-1 rounded-full bg-sa-text-3" />
            <span className="text-sm">{totalTime}</span>
            <span className="inline-flex rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs tabular-nums text-white/80">
              {rateStatusLabel}
            </span>
          </div>
        </motion.div>

        {description && (
          <div className="mt-4 rounded-xl bg-sa-surface/60 border border-sa-border/40 p-4">
            <p className="text-sm text-sa-text-3 leading-relaxed">{description}</p>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-sa-text-3">
          {free
            ? `First ${freePreviewSeconds}s free. Payments fire every ${intervalSeconds}s after preview ends.`
            : playing
              ? isOwnVideo
                ? "You're the creator — playback is free."
                : `Paying $${formatSubCentsShows(ratePerSecond)}/sec · batch every ${intervalSeconds}s via Circle x402 · pause anytime`
              : "Paused — charges stopped instantly."}
        </p>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 rounded-xl overflow-hidden border border-sa-border/40">
          {[
            { label: "Session Cost", value: `$${cost.toFixed(4)}`, color: "text-sa-accent" },
            { label: "Seconds Paid", value: `${paidSecs}s`, color: "text-foreground" },
            { label: "Balance", value: `$${balance.toFixed(4)}`, color: "text-sa-green" },
            { label: "Current Rate", value: rateStatusLabel, color: "text-foreground" },
          ].map((stat, i) => (
            <div key={stat.label} className={`px-4 py-3 bg-sa-surface/40 ${i > 0 ? "border-l border-sa-border/30" : ""}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-sa-text-3 mb-0.5">{stat.label}</p>
              <p className={`text-sm font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: single Up next column ── */}
      <div className="w-[300px] flex-shrink-0 flex flex-col gap-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-sa-text-3 mb-3">Up next</h3>
        {upNext.map((v) => (
          <div key={v.id} className="flex gap-3 group cursor-pointer rounded-xl p-2 -mx-2 hover:bg-white/[0.03] transition-colors">
            <div className="w-[120px] aspect-video rounded-lg overflow-hidden flex-shrink-0 relative">
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
            <div className="flex flex-col gap-1 min-w-0 py-0.5">
              <h4 className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:text-sa-accent transition-colors">{v.title}</h4>
              <span className="text-[11px] text-sa-text-3">{v.project}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
