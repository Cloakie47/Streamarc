"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Stream } from "@cloudflare/stream-react";
import {
  Settings,
  Maximize,
  Bookmark,
  Heart,
  UserPlus,
  MessageSquare,
  Send,
  MoreVertical,
  Pencil,
  Trash2,
  Share2,
} from "lucide-react";
import { createWatchSession, endWatchSession, settleWatchSession } from "@/app/lib/payments";
import { PAYMENT_CONFIG } from "@/app/lib/constants";
import { useCurrentUser } from "@/app/lib/auth-client";
import { FROSTED_PLAY_CLASSES, FrostedPauseSvg, FrostedPlayMark, FrostedPlaySvg } from "@/app/components/ui/FrostedPlayMark";
import GenerateClips from "@/app/components/agent/GenerateClips";
import ManualClip from "@/app/components/agent/ManualClip";
import SubtitlesControl from "@/app/components/watch/SubtitlesControl";
import AgentClipsRow, { type AgentClipCard } from "@/app/components/agent/AgentClipsRow";

const { intervalSeconds, freePreviewSeconds } = PAYMENT_CONFIG;

export type UpNextVideo = {
  id: string;
  title: string;
  duration_secs: number | null;
  cloudflare_uid: string | null;
  thumbnail_url: string | null;
  channelLabel: string;
};

function formatUpNextDuration(secs: number | null | undefined) {
  const s = Math.max(0, secs ?? 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function upNextPosterUrl(v: UpNextVideo) {
  if (v.thumbnail_url) return v.thumbnail_url;
  if (v.cloudflare_uid) {
    return `https://videodelivery.net/${v.cloudflare_uid}/thumbnails/thumbnail.jpg?height=720`;
  }
  return null;
}

interface CommentUser {
  channel_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

interface CommentItem {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  users?: CommentUser | CommentUser[] | null;
}

function commentUser(u: CommentItem["users"]): CommentUser | null {
  if (!u) return null;
  return Array.isArray(u) ? u[0] ?? null : u;
}

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
  upNextVideos?: UpNextVideo[];
  canGenerateClips?: boolean;
  agentClips?: AgentClipCard[];
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
  upNextVideos = [],
  canGenerateClips = false,
  agentClips = [],
}: WatchPageProps) {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [secs, setSecs] = useState(0);
  const [free, setFree] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showTopUpPrompt, setShowTopUpPrompt] = useState(false);

  const { userId, balance: userBalance } = useCurrentUser();
  const VIEWER_ID = userId || "";
  const isOwnVideo = VIEWER_ID === creatorId;

  const handleShare = () => {
    const url = `${window.location.origin}/watch/${videoId}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const [balance, setBalance] = useState(userBalance || 0);
  // True when the balance endpoint reported "unknown" (upstream read timed out
  // with no cached value). An unknown balance must never gate playback — only
  // a CONFIRMED low balance may show the insufficient-balance overlay.
  const [balanceUnknown, setBalanceUnknown] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [tipping, setTipping] = useState(false);
  const [tipSuccess, setTipSuccess] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);
  const [savedToWatchlist, setSavedToWatchlist] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [following, setFollowing] = useState(false);
  const [togglingFollow, setTogglingFollow] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [openMenuCommentId, setOpenMenuCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [copied, setCopied] = useState(false);
  const commentMenuRef = useRef<HTMLDivElement | null>(null);

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

  // Active subtitle language shown in the player (null = off). Switching remounts
  // the player with defaultTextTrack; we preserve the playback position so the
  // viewer payment flow keeps tracking from where they were.
  const [captionLang, setCaptionLang] = useState<string | null>(null);
  // Bumping this forces a player remount without changing the language — used to
  // re-fetch the HLS manifest once after a caption turns on, since the manifest
  // can lag behind Cloudflare's "ready" status (the no-caption-icon race).
  const [captionNonce, setCaptionNonce] = useState(0);
  const captionResumeRef = useRef(0);

  // What the <Stream> player mounts: the bare uid normally, or a fresh signed
  // playback TOKEN after a caption change. The bare-uid manifest is browser-
  // cached for 10 min and the iframe's requests can't be cache-busted from
  // outside — a token changes the URL PATH ({token}/manifest/…), so a token-
  // mounted player always fetches a never-cached, current manifest.
  const [playbackSrc, setPlaybackSrc] = useState<string | undefined>(cloudflareUid);
  useEffect(() => setPlaybackSrc(cloudflareUid), [cloudflareUid]);
  const mintPlaybackSrc = useCallback(async (): Promise<string | undefined> => {
    if (!cloudflareUid) return undefined;
    try {
      const r = await fetch("/api/stream/playback-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId }),
      });
      const d = (await r.json()) as { token?: string };
      return typeof d.token === "string" && d.token ? d.token : cloudflareUid;
    } catch {
      return cloudflareUid; // fall back to bare uid — old (cached) behavior
    }
  }, [cloudflareUid, videoId]);

  const applyCaption = (lang: string | null) => {
    captionResumeRef.current = streamRef.current?.currentTime ?? 0;
    void mintPlaybackSrc().then((src) => {
      setPlaybackSrc(src);
      setCaptionLang(lang);
      setCaptionNonce((n) => n + 1);
    });
  };
  // After turning a caption ON, re-remount the player a couple of times (3s and
  // 8s later) so it reloads a manifest that now lists the freshly-ready track —
  // the CDN edge serving the iframe can lag the one our playability check hit.
  useEffect(() => {
    if (!captionLang) return;
    const bump = () => {
      captionResumeRef.current = streamRef.current?.currentTime ?? captionResumeRef.current;
      // Fresh token per bump: the remounted player then loads a never-cached
      // manifest URL, so it can't be served the stale 10-min browser copy.
      void mintPlaybackSrc().then((src) => {
        setPlaybackSrc(src);
        setCaptionNonce((n) => n + 1);
      });
    };
    const t1 = setTimeout(bump, 3000);
    const t2 = setTimeout(bump, 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [captionLang, mintPlaybackSrc]);

  // BILLING INVARIANT: the per-second meter may only tick while the video is
  // ACTUALLY playing. The Stream component fires NO pause event on unmount and
  // a remounted player never autoplays — so any remount (caption switch, the
  // nonce bumps, the background watcher's re-activation) would strand
  // playing=true and keep charging over a paused player. Reset play-state on
  // every remount — keyed on the same inputs as the player's `key` — and let
  // the meter stay off until the NEW player fires a real onPlaying.
  useEffect(() => {
    setPlaying(false);
    setBuffering(false);
  }, [cloudflareUid, captionLang, captionNonce]);

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
            if (typeof data.balance !== "number") {
              // Balance unknown (upstream read timed out and no cached value).
              // Never gate playback on a timeout — settlement still enforces
              // real funds per chunk; this check is only a UX gate.
              setShowTopUpPrompt(false);
              setPlaying(true);
              return;
            }
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
    if (playing && !buffering) {
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
  }, [playing, buffering, free, fireBatch, onBalanceChange, isOwnVideo, ratePerSecond, intervalSeconds]);

  useEffect(() => {
    if (!videoId) return;
    setLoadingComments(true);
    fetch("/api/watch/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, user_id: VIEWER_ID || undefined }),
    })
      .then((r) => r.json())
      .then((data: {
        watchlisted?: boolean;
        favorited?: boolean;
        following?: boolean;
        comments?: CommentItem[];
      }) => {
        setSavedToWatchlist(!!data.watchlisted);
        setFavorited(!!data.favorited);
        setFollowing(!!data.following);
        setComments(data.comments ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [VIEWER_ID, videoId]);

  useEffect(() => {
    if (!openMenuCommentId) return;
    const onDoc = (e: MouseEvent) => {
      if (commentMenuRef.current?.contains(e.target as Node)) return;
      setOpenMenuCommentId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenuCommentId]);

  // Keep the stats strip's balance in sync with the sidebar: both refresh from
  // the same shared event (dispatched after caption/clip/tip charges). Also
  // runs once on mount — /api/watch/init no longer carries balance (it would
  // block comments/user-state on Circle), so this fetch fills it in async.
  useEffect(() => {
    if (!VIEWER_ID) return;
    const refresh = () => {
      fetch("/api/gateway/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: VIEWER_ID }),
      })
        .then((r) => r.json())
        .then((data: { balance?: number }) => {
          if (typeof data.balance === "number") {
            setBalance(data.balance);
            initialBalanceRef.current = data.balance;
            setBalanceUnknown(false);
          } else {
            setBalanceUnknown(true);
          }
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener("gateway-balance-updated", refresh);
    return () => window.removeEventListener("gateway-balance-updated", refresh);
  }, [VIEWER_ID]);

  // Memoized player element: the 1s playback tick re-renders WatchPage, but the
  // <Stream> iframe must not reconcile every second. The element identity only
  // changes when its key inputs do (uid / caption / nonce — the same things
  // that drive its remount key), so React bails out of this subtree on ticks.
  // Handlers only touch stable setState functions; captionResumeRef is read at
  // element-creation time, which coincides exactly with remounts (key change).
  const playerElement = useMemo(() => {
    if (!cloudflareUid) return null;
    return (
      <Stream
        key={`${cloudflareUid}-${captionLang ?? "none"}-${captionNonce}`}
        streamRef={streamRef}
        src={playbackSrc ?? cloudflareUid}
        defaultTextTrack={captionLang ?? undefined}
        startTime={captionResumeRef.current || undefined}
        className="absolute inset-0 w-full h-full z-[1]"
        controls
        onPlaying={() => {
          setBuffering(false);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onEnded={() => setPlaying(false)}
        onSeeking={() => setPlaying(false)}
        // Deliberately NO onSeeked handler: `seeked` fires even when the video
        // is paused, so setting playing=true here started the meter on a
        // paused scrub. When a seek happens DURING playback the player fires
        // `playing` again on resume — onPlaying restores the meter correctly.
      />
    );
  }, [cloudflareUid, captionLang, captionNonce, playbackSrc]);

  // Insufficient-balance overlay REPLACES the player element (unmounting it
  // mid-play with no pause event) — reset play-state when it appears so the
  // meter can't keep ticking with no player mounted at all.
  const showInsufficientOverlay = Boolean(cloudflareUid && !isOwnVideo && balance < 0.001 && !balanceUnknown && VIEWER_ID);
  useEffect(() => {
    if (showInsufficientOverlay) {
      setPlaying(false);
      setBuffering(false);
    }
  }, [showInsufficientOverlay]);

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

  const handleFollow = async () => {
    if (!VIEWER_ID || VIEWER_ID === creatorId) return;
    setTogglingFollow(true);
    try {
      const action = following ? "unfollow" : "follow";
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: VIEWER_ID, target_id: creatorId, action }),
      });
      const data = (await res.json()) as { following?: boolean };
      setFollowing(!!data.following);
    } finally {
      setTogglingFollow(false);
    }
  };

  const handleComment = useCallback(async () => {
    if (!VIEWER_ID || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          user_id: VIEWER_ID,
          content: commentText,
          action: "add",
        }),
      });
      const data = (await res.json()) as { comment?: CommentItem };
      const added = data.comment;
      if (added) {
        setComments((prev) => [added, ...prev]);
        setCommentText("");
      }
    } finally {
      setSubmittingComment(false);
    }
  }, [VIEWER_ID, commentText, videoId]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!VIEWER_ID) return;
    if (!window.confirm("Delete this comment?")) return;
    setOpenMenuCommentId(null);
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment_id: commentId, user_id: VIEWER_ID, action: "delete" }),
    });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, [VIEWER_ID]);

  const handleSaveEdit = useCallback(async () => {
    if (!VIEWER_ID || !editingCommentId || !editCommentText.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment_id: editingCommentId,
          user_id: VIEWER_ID,
          content: editCommentText,
          action: "update",
        }),
      });
      const data = (await res.json()) as { comment?: CommentItem };
      const updated = data.comment;
      if (updated) {
        setComments((prev) => prev.map((c) => (c.id === editingCommentId ? updated : c)));
        setEditingCommentId(null);
        setEditCommentText("");
      }
    } finally {
      setSavingEdit(false);
    }
  }, [VIEWER_ID, editingCommentId, editCommentText]);

  const cancelEdit = useCallback(() => {
    setEditingCommentId(null);
    setEditCommentText("");
  }, []);

  // Memoized comments panel: up to 50 rows that don't depend on the 1s playback
  // tick (secs/balance), so keep the element identity stable across ticks and
  // let React skip reconciling the subtree. Handlers are useCallback'd so deps
  // only change on real comment interactions. (Trade-off: "Xm ago" labels no
  // longer refresh every second — they update on the next comment interaction.)
  const commentsPanel = useMemo(() => (
    <div className="panel mt-6 flex flex-col gap-4 rounded-2xl px-4 py-5">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <MessageSquare size={20} className="shrink-0 text-sa-text-3" />
        <span>Comments</span>
        {comments.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
        )}
      </h3>

      {VIEWER_ID && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            rows={2}
            className="min-h-[72px] flex-1 resize-none rounded-xl border border-sa-border bg-sa-surface-2 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="button"
            onClick={() => void handleComment()}
            disabled={submittingComment || !commentText.trim()}
            className="btn btn-primary inline-flex shrink-0 items-center justify-center gap-2 disabled:opacity-50 sm:min-w-[100px]"
            aria-label="Post comment"
          >
            <Send size={16} />
            <span>Post</span>
          </button>
        </div>
      )}

      {loadingComments ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-sa-surface" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No comments yet. Be the first to comment!</p>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((comment) => {
            const u = commentUser(comment.users);
            const name = u?.channel_name || u?.display_name || "User";
            const initial = name.slice(0, 1).toUpperCase();
            const isOwn = comment.user_id === VIEWER_ID;
            const date = new Date(comment.created_at);
            const ago = Math.floor((Date.now() - date.getTime()) / 60000);
            const timeAgo =
              ago < 1
                ? "just now"
                : ago < 60
                  ? `${ago}m ago`
                  : ago < 1440
                    ? `${Math.floor(ago / 60)}h ago`
                    : `${Math.floor(ago / 1440)}d ago`;
            const isEditing = editingCommentId === comment.id;
            return (
              <div key={comment.id} className="flex gap-3 rounded-xl border border-transparent py-1 transition-colors hover:border-sa-border/60 hover:bg-white/[0.02]">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {u?.avatar_url ? (
                    <img src={u.avatar_url} alt={name} width={36} height={36} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{name}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo}</span>
                    {isOwn && (
                      <div
                        className="relative ml-auto shrink-0"
                        ref={openMenuCommentId === comment.id ? commentMenuRef : undefined}
                      >
                        <button
                          type="button"
                          aria-label="Comment actions"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuCommentId((id) => (id === comment.id ? null : comment.id));
                          }}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuCommentId === comment.id && (
                          <div className="absolute right-0 top-9 z-20 min-w-[140px] rounded-lg border border-sa-border bg-sa-surface py-1 shadow-lg">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-white/[0.06]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuCommentId(null);
                                setEditingCommentId(comment.id);
                                setEditCommentText(comment.content);
                              }}
                            >
                              <Pencil size={14} className="text-muted-foreground" />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-white/[0.06]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuCommentId(null);
                                void handleDeleteComment(comment.id);
                              }}
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editCommentText}
                        onChange={(e) => setEditCommentText(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-sa-border bg-sa-surface-2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingEdit || !editCommentText.trim()}
                          onClick={() => void handleSaveEdit()}
                          className="btn btn-primary btn-sm disabled:opacity-50"
                        >
                          {savingEdit ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          className="btn btn-sm border border-sa-border bg-transparent text-foreground hover:bg-white/[0.06]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground">{comment.content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  ), [
    VIEWER_ID,
    comments,
    loadingComments,
    commentText,
    submittingComment,
    openMenuCommentId,
    editingCommentId,
    editCommentText,
    savingEdit,
    handleComment,
    handleDeleteComment,
    handleSaveEdit,
    cancelEdit,
  ]);

  const handleTip = async () => {
    if (!VIEWER_ID || !tipAmount || VIEWER_ID === creatorId) return;
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
            You&apos;re watching your own video. No charges apply
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="relative"
        >
          {/* Ambient cyan glow beneath the player — makes it look like it's emanating light */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-12 -bottom-3 h-16 bg-sa-blue/[0.08] blur-[60px]"
          />
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
              <div className="absolute inset-0 bg-[#0e1420]" />
            )}
            {/* Cinematic vignette — subtle inset shadow darkening the edges */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[6]"
              style={{ boxShadow: "inset 0 0 140px 30px rgba(0,0,0,0.55)" }}
            />
            {showInsufficientOverlay ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm">
                <p className="text-lg font-bold text-white">Insufficient balance</p>
                <p className="text-sm text-white/60">Top up your Gateway balance to watch this video</p>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("open-top-up"))}
                  className="btn btn-primary"
                >
                  Top up balance
                </button>
              </div>
            ) : (
              playerElement
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
              <div className="absolute bottom-0 inset-x-0 p-4 bg-black/70 flex flex-col gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <div className="relative h-1 w-full cursor-pointer overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full transition-all duration-300 bg-sa-blue" style={{ width: `${progress}%` }} />
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
          className="mt-5 flex flex-col gap-4"
        >
          {/* Title + prominent rate pill */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight leading-tight">{title}</h1>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sa-blue/30 bg-sa-blue/10 px-4 py-2 font-mono text-sm tabular-nums shadow-[0_0_18px_hsla(188,86%,56%,0.15)]">
              <span className={`h-1.5 w-1.5 rounded-full ${playing ? "bg-sa-green animate-pulse shadow-[0_0_6px_rgba(60,217,160,0.8)]" : "bg-sa-text-3"}`} />
              <span className="text-sa-blue">{rateStatusLabel}</span>
            </span>
          </div>

          {/* Creator identity row: avatar + name + follow */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
              onClick={() => window.location.href = `/profile/${creatorId}`}
            >
              <div className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0 border border-sa-border">
                {creator?.avatar_url ? (
                  <img src={creator.avatar_url} alt="Creator" width={40} height={40} decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-sm font-bold text-[hsl(var(--primary-foreground))] bg-sa-blue"
                  >
                    {(creator?.channel_name || creator?.display_name || creatorId).slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground leading-tight">
                  <span className="truncate">
                    {creator?.channel_name || creator?.display_name || "Creator"}
                  </span>
                  {creator?.is_verified && (
                    <svg className="h-4 w-4 shrink-0 text-sa-blue" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </span>
                <span className="text-[11px] text-sa-text-3 mt-0.5">Creator</span>
              </div>
              {VIEWER_ID && !isOwnVideo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleFollow();
                  }}
                  disabled={togglingFollow}
                  className={`ml-1 flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    following
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-sa-border bg-sa-surface-2 text-foreground hover:border-sa-border-hover"
                  }`}
                >
                  <UserPlus size={14} />
                  {following ? "Following" : "Follow"}
                </button>
              )}
            </div>

          </div>

          {/* Action row — contained in a subtle surface so pills stop floating in negative space */}
          {VIEWER_ID && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sa-border/60 bg-sa-surface-2/40 p-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleWatchLater();
                  }}
                  disabled={savingWatchlist}
                  aria-pressed={savedToWatchlist}
                  title={savedToWatchlist ? "Saved to Watch Later" : "Save to Watch Later"}
                  className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-all ${
                    savedToWatchlist
                      ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30"
                      : "text-sa-text-2 hover:bg-white/[0.06] hover:text-foreground"
                  } disabled:opacity-60`}
                >
                  <Bookmark size={15} className={savedToWatchlist ? "fill-current" : ""} />
                  <span>{savedToWatchlist ? "Saved" : "Watch Later"}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleFavorite();
                  }}
                  disabled={togglingFavorite}
                  aria-pressed={favorited}
                  title={favorited ? "Remove from favourites" : "Add to favourites"}
                  className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-all ${
                    favorited
                      ? "bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-500/30"
                      : "text-sa-text-2 hover:bg-white/[0.06] hover:text-foreground"
                  } disabled:opacity-60`}
                >
                  <Heart size={15} className={favorited ? "fill-current" : ""} />
                  <span>{favorited ? "Favourited" : "Favourite"}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare();
                  }}
                  title="Share link"
                  className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium text-sa-text-2 transition-all hover:bg-white/[0.06] hover:text-foreground"
                >
                  <Share2 size={15} />
                  <span>{copied ? "Copied!" : "Share"}</span>
                </button>
              </div>
              {/* Right-side balance: small ownership badge when viewer owns the video,
                  otherwise the tip card below carries the visual weight. */}
              {isOwnVideo && (
                <span className="mr-2 inline-flex items-center gap-1.5 rounded-full bg-sa-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sa-accent ring-1 ring-inset ring-sa-accent/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-sa-accent" />
                  You own this
                </span>
              )}
            </div>
          )}

          {/* Dedicated tip section — only for non-creators */}
          {VIEWER_ID && VIEWER_ID !== creatorId && (
            <div className="rounded-xl border border-sa-border/60 bg-sa-surface-2/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">Send a tip</span>
                  <span className="text-xs text-sa-text-3">Goes directly to the creator</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {["0.01", "0.05", "0.10"].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setTipAmount(amount)}
                      className={`inline-flex h-9 items-center justify-center rounded-full px-3.5 text-[13px] font-semibold tabular-nums transition-all ${
                        tipAmount === amount
                          ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40"
                          : "bg-sa-surface text-sa-text-2 ring-1 ring-inset ring-sa-border/60 hover:bg-white/[0.05] hover:text-foreground"
                      }`}
                    >
                      ${amount}
                    </button>
                  ))}
                  <div className="flex h-9 w-[8.5rem] items-center rounded-full bg-sa-surface ring-1 ring-inset ring-sa-border/60 focus-within:ring-primary/40">
                    <span className="pl-3 text-[13px] text-sa-text-3">$</span>
                    <input
                      type="number"
                      value={tipAmount}
                      onChange={(e) => setTipAmount(e.target.value)}
                      placeholder="Custom"
                      min="0.001"
                      step="0.001"
                      className="h-full w-full bg-transparent px-2 text-[13px] tabular-nums placeholder:text-sa-text-3 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTip}
                    disabled={tipping || !tipAmount || Number.parseFloat(tipAmount) < 0.001}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition hover:bg-sa-cyan disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {tipping ? "Sending…" : "Send tip"}
                  </button>
                </div>
              </div>
              {(tipError || tipSuccess) && (
                <div className="mt-3 text-xs">
                  {tipError && <p className="text-destructive">{tipError}</p>}
                  {tipSuccess && <p className="text-green-400">Tip sent — thanks for supporting the creator!</p>}
                </div>
              )}
            </div>
          )}

          {/* Subtitles — available to everyone; generate paid translations */}
          <SubtitlesControl videoId={videoId} cloudflareUid={cloudflareUid} activeLang={captionLang} onActivate={applyCaption} />

          {/* Description */}
          {description && (
            <div className="panel p-4">
              <p className="text-sm text-sa-text-3 leading-relaxed">{description}</p>
            </div>
          )}

          {/* Clipping: owner/admin gets two paths — let the agent find moments
              (paid) or cut it yourself (free) — plus this video's clips. */}
          {canGenerateClips && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <GenerateClips
                  videoId={videoId}
                  ratePerSecond={ratePerSecond}
                  durationSecs={durationSecs}
                  videoTitle={title}
                />
              </div>
              {cloudflareUid && (
                <div className="flex-1">
                  <ManualClip
                    videoId={videoId}
                    sourceCloudflareUid={cloudflareUid}
                    durationSecs={durationSecs}
                    ratePerSecond={ratePerSecond}
                    videoTitle={title}
                  />
                </div>
              )}
            </div>
          )}
          {agentClips.length > 0 && <AgentClipsRow clips={agentClips} />}

          {/* Disclaimer (hidden during free preview; no “first N seconds free” copy) */}
          {!free && (
            <p className="text-xs text-sa-text-3">
              {playing
                ? isOwnVideo
                  ? "You're the creator. Playback is free."
                  : (
                    <>
                      Paying <span className="font-mono tabular-nums text-sa-blue">${formatSubCentsShows(ratePerSecond)}/sec</span> · batch every {intervalSeconds}s via Circle x402 · pause anytime
                    </>
                  )
                : "Paused. Charges stopped instantly."}
            </p>
          )}

          {/* Stats: full-width horizontal row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Session Cost", value: `$${cost.toFixed(4)}`, color: "text-sa-accent" },
              { label: "Seconds Paid", value: `${paidSecs}s`, color: "text-foreground" },
              { label: "Balance", value: `$${balance.toFixed(4)}`, color: "text-sa-green" },
              { label: "Current Rate", value: rateStatusLabel, color: "text-sa-blue" },
            ].map((stat) => (
              <div key={stat.label} className="panel-muted px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sa-text-3">{stat.label}</p>
                <p className={`mt-1.5 font-mono text-base font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {commentsPanel}

        </motion.div>

      </div>

      {/* ── Right: Chapters + Up next ── */}
      <div className="flex w-full flex-shrink-0 flex-col gap-3 xl:w-[340px]">
        {chapters && chapters.length > 0 && (
          <div className="panel flex max-h-[min(50vh,320px)] flex-col gap-2 overflow-y-auto p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sa-text-3">Chapters</p>
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
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg bg-transparent px-3 py-2 text-left text-sm transition-all duration-200 border-l-2 ${
                      isActive
                        ? "bg-sa-blue/10 text-foreground border-sa-blue shadow-[0_0_18px_hsla(188,86%,56%,0.12)_inset]"
                        : "text-sa-text-3 border-transparent hover:bg-sa-surface-2/50 hover:text-foreground"
                    }`}
                  >
                    <span className={`w-9 flex-shrink-0 font-mono text-[11px] tabular-nums ${isActive ? "text-sa-blue" : "text-sa-text-3"}`}>
                      {mm}:{ss}
                    </span>
                    <span className="font-medium leading-snug">{chapter.title}</span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-sa-blue shadow-[0_0_8px_hsl(188,86%,56%)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {upNextVideos.length > 0 && (
          <>
            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-sa-text-3">Up next</h3>
            {upNextVideos.map((v) => {
              const poster = upNextPosterUrl(v);
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => router.push(`/watch/${v.id}`)}
                  className="panel group flex w-full cursor-pointer gap-3 p-3 text-left transition-colors hover:border-sa-border-hover"
                >
                  <div className="relative aspect-video w-[136px] flex-shrink-0 overflow-hidden rounded-xl">
                    {poster ? (
                      <img src={poster} alt="" width={272} height={153} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-[#0e1420]" />
                    )}
                    <div className="absolute inset-0 bg-black/30" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/15 opacity-70 backdrop-blur-sm transition-all group-hover:scale-110 group-hover:opacity-100">
                        <FrostedPlaySvg className="ml-0.5 h-2.5 w-2.5 fill-current text-white" />
                      </div>
                    </div>
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-px font-mono text-[9px] font-bold text-white/80 backdrop-blur-sm">
                      {formatUpNextDuration(v.duration_secs)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-col justify-center gap-1 py-0.5">
                    <h4 className="line-clamp-2 text-[13px] font-semibold leading-snug transition-colors group-hover:text-foreground">{v.title}</h4>
                    <span className="text-[11px] text-sa-text-3">{v.channelLabel}</span>
                    <span className="text-[11px] text-sa-text-3">Suggested next</span>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
