"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Twitter,
  MessageCircle,
  Eye,
  Film,
  Calendar,
  Zap,
  UserPlus,
  Users,
  Share2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/app/lib/auth-client";
import { FrostedPlayMark } from "@/app/components/ui/FrostedPlayMark";

export interface Creator {
  id: string;
  display_name: string | null;
  channel_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_verified: boolean | null;
  x_handle: string | null;
  reddit_handle: string | null;
  telegram_handle: string | null;
  created_at: string;
}

export interface Video {
  id: string;
  title: string;
  description: string | null;
  duration_secs: number | null;
  rate_per_sec: number | null;
  views: number | null;
  total_earned: number | null;
  thumbnail_url: string | null;
  cloudflare_uid: string | null;
  created_at: string;
  status?: string | null;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "0:00";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number | null): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatRate(rate: number | null): string {
  if (rate == null) return "0";
  if (rate >= 0.01) return rate.toFixed(2);
  return rate.toFixed(5);
}

const THUMB_GRADIENTS = [
  "from-rose-600 to-orange-500",
  "from-emerald-600 to-teal-500",
  "from-sky-600 to-blue-500",
  "from-violet-600 to-indigo-500",
];

export default function CreatorProfile({
  creator,
  videos,
}: {
  creator: Creator;
  videos: Video[];
}) {
  const router = useRouter();
  const { userId } = useCurrentUser();
  const [tab, setTab] = useState<"videos" | "about">("videos");
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [togglingFollow, setTogglingFollow] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: creator.id, target_id: creator.id, action: "counts" }),
    })
      .then((r) => r.json())
      .then((data: { followers?: number }) => setFollowerCount(data.followers ?? 0))
      .catch(() => {});

    if (!userId || userId === creator.id) return;
    fetch("/api/follows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, target_id: creator.id, action: "check" }),
    })
      .then((r) => r.json())
      .then((data: { following?: boolean }) => setFollowing(data.following ?? false))
      .catch(() => {});
  }, [userId, creator.id]);

  const handleFollow = async () => {
    if (!userId || userId === creator.id) return;
    setTogglingFollow(true);
    try {
      const action = following ? "unfollow" : "follow";
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, target_id: creator.id, action }),
      });
      const data = (await res.json()) as { following?: boolean };
      const nowFollowing = !!data.following;
      setFollowing(nowFollowing);
      setFollowerCount((prev) => (nowFollowing ? prev + 1 : prev - 1));
    } finally {
      setTogglingFollow(false);
    }
  };

  const displayName = creator.channel_name || creator.display_name || "Creator";
  const joinedYear = new Date(creator.created_at).getFullYear();
  const totalViews = videos.reduce((sum, v) => sum + (v.views ?? 0), 0);
  const avgRate =
    videos.length > 0
      ? videos.reduce((sum, v) => sum + (v.rate_per_sec ?? 0), 0) / videos.length
      : 0;

  const hasSocials = creator.x_handle || creator.reddit_handle || creator.telegram_handle;

  const featuredTitle = videos[0]?.title;
  const avgRateDisplay = `$${formatRate(avgRate)}/s`;

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col pb-12">
      {/* ── Hero Banner (Kick-style wide header) ── */}
      <div className="panel relative h-48 w-full overflow-hidden sm:h-56 lg:h-64">
        {creator.banner_url ? (
          <>
            <img src={creator.banner_url} alt="Banner" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f18] via-[#0a0f18]/50 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0d1520] via-[#152030] to-[#0a1018]" />
        )}
        <div className="absolute inset-y-0 right-0 hidden w-2/5 bg-gradient-to-l from-primary/5 to-transparent md:block" />
      </div>

      {/* ── Channel header: avatar + identity + actions (Kick-inspired) ── */}
      <div className="relative z-[1] px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="-mt-16 flex flex-col gap-6 sm:-mt-20 lg:flex-row lg:items-start lg:gap-10"
        >
          {/* Avatar: accent ring */}
          <div className="shrink-0">
            <div className="h-28 w-28 overflow-hidden rounded-full bg-sa-surface shadow-xl ring-4 ring-primary/45 ring-offset-4 ring-offset-background sm:h-32 sm:w-32">
              {creator.avatar_url ? (
                <img src={creator.avatar_url} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary/15 text-3xl font-bold text-primary sm:text-4xl">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{displayName}</h1>
                  {creator.is_verified && (
                    <svg className="h-6 w-6 shrink-0 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                {featuredTitle && (
                  <p className="line-clamp-2 max-w-3xl text-sm font-medium leading-snug text-sa-text-3 sm:text-base">
                    {featuredTitle}
                  </p>
                )}
                {!featuredTitle && (
                  <p className="text-sm text-sa-text-3">Creator on StreamArc</p>
                )}
                {/* Tag pills */}
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-primary/35 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {videos.length} video{videos.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-sa-border bg-sa-surface-2 px-3 py-1 text-xs font-medium text-sa-text-3">
                    {formatViews(totalViews)} views
                  </span>
                  <span className="rounded-full border border-sa-border bg-sa-surface-2 px-3 py-1 text-xs text-sa-text-3">
                    Joined {joinedYear}
                  </span>
                  {videos.length > 0 && (
                    <span className="rounded-full border border-sa-border bg-sa-surface-2 px-3 py-1 font-mono text-xs tabular-nums text-sa-accent">
                      ~{avgRateDisplay} avg
                    </span>
                  )}
                </div>
              </div>

              {userId && userId !== creator.id && (
                <button
                  type="button"
                  onClick={() => void handleFollow()}
                  disabled={togglingFollow}
                  className={`inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all sm:w-auto lg:min-w-[160px] ${
                    following
                      ? "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                      : "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95"
                  }`}
                >
                  <UserPlus size={18} />
                  {following ? "Following" : "Follow"}
                </button>
              )}
            </div>

            {/* Stats strip: accent numbers like Kick viewers/followers */}
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-sa-border/60 pt-5 text-sm">
              <span className="inline-flex items-center gap-2">
                <Eye size={18} className="text-primary" />
                <span className="font-semibold text-primary">{formatViews(totalViews)}</span>
                <span className="text-sa-text-3">total views</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <Users size={18} className="text-primary" />
                <span className="font-semibold text-primary">{followerCount.toLocaleString()}</span>
                <span className="text-sa-text-3">followers</span>
              </span>
              <button
                type="button"
                onClick={() => void handleShare()}
                className="ml-auto inline-flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sa-text-3 transition-colors hover:border-sa-border hover:bg-white/[0.04] hover:text-foreground"
                aria-label="Copy profile link"
              >
                <Share2 size={16} />
                <span className="hidden sm:inline">Share</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── About card (Kick-style large block) ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="panel mt-10 mb-8 rounded-2xl p-6 sm:p-8"
        >
            <div className="mb-4 flex flex-col gap-1 border-b border-sa-border/80 pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-foreground sm:text-xl">About {displayName}</h2>
                {creator.is_verified && (
                  <svg className="h-5 w-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <p className="text-sm font-semibold text-primary">{followerCount.toLocaleString()} followers</p>
            </div>

            {hasSocials && (
              <div className="mb-5 flex flex-wrap gap-3">
                {creator.x_handle && (
                  <a
                    href={`https://x.com/${creator.x_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="panel-muted inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-sa-text-3 transition-colors hover:text-foreground"
                  >
                    <Twitter size={14} />
                    <span className="max-w-[200px] truncate">x.com/{creator.x_handle}</span>
                  </a>
                )}
                {creator.reddit_handle && (
                  <a
                    href={`https://reddit.com/u/${creator.reddit_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="panel-muted inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-sa-text-3 transition-colors hover:text-foreground"
                  >
                    <span className="text-[10px] font-bold">r/</span>
                    <span className="max-w-[200px] truncate">u/{creator.reddit_handle}</span>
                  </a>
                )}
                {creator.telegram_handle && (
                  <a
                    href={`https://t.me/${creator.telegram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="panel-muted inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-sa-text-3 transition-colors hover:text-foreground"
                  >
                    <MessageCircle size={14} />
                    <span className="max-w-[200px] truncate">t.me/{creator.telegram_handle}</span>
                  </a>
                )}
              </div>
            )}

            {creator.bio ? (
              <p className="text-sm leading-relaxed text-foreground/95 whitespace-pre-line">{creator.bio}</p>
            ) : (
              <p className="text-sm text-sa-text-3">No bio yet.</p>
            )}
        </motion.div>

        {/* ── Tab Navigation ── */}
        <div className="flex items-center gap-1 mb-8">
          <button
            type="button"
            onClick={() => setTab("videos")}
            className={`nav-tab ${tab === "videos" ? "nav-tab-active" : "nav-tab-inactive"}`}
          >
            Videos
          </button>
          <button
            type="button"
            onClick={() => setTab("about")}
            className={`nav-tab ${tab === "about" ? "nav-tab-active" : "nav-tab-inactive"}`}
          >
            About
          </button>
        </div>

        {/* ── Videos Tab ── */}
        {tab === "videos" && (
          <>
            {videos.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <div className="panel-muted flex h-14 w-14 items-center justify-center rounded-2xl">
                  <Film size={28} className="text-sa-text-3" />
                </div>
                <p className="text-sm text-sa-text-3">No videos yet</p>
                <p className="text-xs text-sa-text-3/70">This creator hasn&apos;t published any content</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {videos.map((video, i) => (
                  <motion.div
                    key={video.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => router.push(`/watch/${video.id}`)}
                    className="video-card hover-lift flex flex-col cursor-pointer group"
                    onHoverStart={() => setHoveredVideoId(video.id)}
                    onHoverEnd={() => setHoveredVideoId((current) => (current === video.id ? null : current))}
                  >
                    <div className="relative aspect-video overflow-hidden rounded-t-2xl">
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${THUMB_GRADIENTS[i % THUMB_GRADIENTS.length]} opacity-30`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-br from-[#182233] via-[#223047] to-[#131c2c]" />
                      {video.thumbnail_url && (
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ${hoveredVideoId === video.id ? "preview-kenburns" : ""}`}
                        />
                      )}
                      {!video.thumbnail_url && (
                        <div className={`absolute inset-0 bg-gradient-to-br ${THUMB_GRADIENTS[i % THUMB_GRADIENTS.length]} opacity-40 ${hoveredVideoId === video.id ? "preview-kenburns" : ""}`} />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <FrostedPlayMark sizeClass="w-12 h-12" />
                      </div>
                      <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold text-white bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded">
                        {formatDuration(video.duration_secs)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 p-4">
                      <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-sa-accent transition-colors">
                        {video.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-sa-text-3">
                        <span className="flex items-center gap-1">
                          <Eye size={11} />
                          {formatViews(video.views)}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-sa-text-3" />
                        <span className="payment-ticker text-sa-accent font-bold">
                          ${formatRate(video.rate_per_sec)}/s
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── About Tab (details only; bio/socials live in About card above) ── */}
        {tab === "about" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-2xl"
          >
            <div className="panel p-6">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-sa-text-3">Channel details</h3>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-3 text-sa-text-3">
                  <Calendar size={16} />
                  <span>Joined {joinedYear}</span>
                </div>
                <div className="flex items-center gap-3 text-sa-text-3">
                  <Film size={16} />
                  <span>
                    {videos.length} video{videos.length !== 1 ? "s" : ""} published
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sa-text-3">
                  <Eye size={16} />
                  <span>{formatViews(totalViews)} total views</span>
                </div>
                <div className="flex items-center gap-3 text-sa-text-3">
                  <Users size={16} />
                  <span>{followerCount.toLocaleString()} followers</span>
                </div>
                {videos.length > 0 && (
                  <div className="flex items-center gap-3 text-sa-text-3">
                    <Zap size={16} className="text-sa-accent" />
                    <span className="payment-ticker font-medium text-sa-accent">Average rate {avgRateDisplay}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
