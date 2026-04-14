"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Twitter, MessageCircle, Eye, Film, Calendar, Zap, UserPlus } from "lucide-react";
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

  const statPills: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; pulse?: boolean }[] = [
    { icon: Eye, label: "Views", value: formatViews(totalViews) },
    { icon: Film, label: "Videos", value: String(videos.length) },
    { icon: Calendar, label: "Joined", value: String(joinedYear) },
    { icon: Zap, label: "Earning", value: `$${formatRate(avgRate)}/s`, pulse: true },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-6 pb-12">
      {/* ── Hero Banner ── */}
      <div className="panel relative h-56 w-full overflow-hidden lg:h-64">
        {creator.banner_url ? (
          <>
            <img src={creator.banner_url} alt="Banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#101826]/70 via-[#101826]/20 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1c2639] via-[#223047] to-[#182233]" />
        )}
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-sa-blue/10 to-transparent md:block" />
      </div>

      {/* ── Profile Info ── */}
      <div className="px-4 lg:px-8 pb-8">
        {/* Avatar — overlaps the banner */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="-mt-14 mb-4"
        >
          <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-background bg-sa-surface shadow-[0_10px_22px_rgba(9,18,32,0.18)]">
            {creator.avatar_url ? (
              <img src={creator.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-primary bg-primary/10">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </motion.div>

        {/* Identity — name, follow, bio, social icons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          {/* Name + verified + follow button */}
          <div className="mb-2 flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            {creator.is_verified && (
              <svg className="w-5 h-5 text-sa-blue flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Bio snippet */}
          {creator.bio && (
            <p className="text-sm text-sa-text-3 line-clamp-2 max-w-xl mb-3">{creator.bio}</p>
          )}

          <div className="mb-6 flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-xl font-bold">{videos.length}</span>
              <span className="text-xs text-muted-foreground">Videos</span>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="flex flex-col">
              <span className="text-xl font-bold">{followerCount}</span>
              <span className="text-xs text-muted-foreground">Followers</span>
            </div>
            {userId && userId !== creator.id && (
              <button
                type="button"
                onClick={() => void handleFollow()}
                disabled={togglingFollow}
                className={`ml-auto flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                  following
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-primary bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                <UserPlus size={16} />
                {following ? "Following" : "Follow"}
              </button>
            )}
          </div>

          {/* Social icon pills */}
          {hasSocials && (
            <div className="flex items-center gap-2">
              {creator.x_handle && (
                <a
                  href={`https://x.com/${creator.x_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`@${creator.x_handle}`}
                    className="panel-muted flex h-8 w-8 items-center justify-center rounded-full text-sa-text-3 transition-colors hover:text-foreground"
                  >
                    <Twitter size={14} />
                </a>
              )}
              {creator.reddit_handle && (
                <a
                  href={`https://reddit.com/u/${creator.reddit_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`u/${creator.reddit_handle}`}
                    className="panel-muted flex h-8 w-8 items-center justify-center rounded-full text-sa-text-3 transition-colors hover:text-foreground"
                  >
                    <span className="text-[10px] font-bold leading-none">r/</span>
                </a>
              )}
              {creator.telegram_handle && (
                <a
                  href={`https://t.me/${creator.telegram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={creator.telegram_handle}
                    className="panel-muted flex h-8 w-8 items-center justify-center rounded-full text-sa-text-3 transition-colors hover:text-foreground"
                  >
                    <MessageCircle size={14} />
                </a>
              )}
            </div>
          )}
        </motion.div>

        {/* ── Stat Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-3 flex-wrap mb-6"
        >
          {statPills.map((pill) => (
            <div
              key={pill.label}
              className={`panel-muted flex items-center gap-2 rounded-full px-4 py-2 text-xs ${
                pill.pulse ? "payment-ticker" : "text-sa-text-3"
              }`}
            >
              <pill.icon size={13} className={pill.pulse ? "text-sa-accent" : ""} />
              <span className="text-sa-text-3 font-medium">{pill.label}</span>
              <span className={pill.pulse ? "text-sa-accent font-bold" : "text-foreground font-bold"}>{pill.value}</span>
            </div>
          ))}
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

        {/* ── About Tab ── */}
        {tab === "about" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-2xl flex flex-col gap-6"
          >
            {creator.bio ? (
              <div className="panel p-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-sa-text-3 mb-3">Bio</h3>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{creator.bio}</p>
              </div>
            ) : (
              <div className="panel p-6">
                <p className="text-sm text-sa-text-3">This creator hasn&apos;t added a bio yet.</p>
              </div>
            )}

            {hasSocials && (
              <div className="panel p-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-sa-text-3 mb-3">Social Links</h3>
                <div className="flex flex-col gap-3">
                  {creator.x_handle && (
                    <a
                      href={`https://x.com/${creator.x_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-sm text-sa-text-3 hover:text-foreground transition-colors"
                    >
                      <Twitter size={16} />
                      <span>@{creator.x_handle}</span>
                    </a>
                  )}
                  {creator.reddit_handle && (
                    <a
                      href={`https://reddit.com/u/${creator.reddit_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-sm text-sa-text-3 hover:text-foreground transition-colors"
                    >
                      <span className="text-sm font-bold w-4 text-center">r/</span>
                      <span>u/{creator.reddit_handle}</span>
                    </a>
                  )}
                  {creator.telegram_handle && (
                    <a
                      href={`https://t.me/${creator.telegram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-sm text-sa-text-3 hover:text-foreground transition-colors"
                    >
                      <MessageCircle size={16} />
                      <span>{creator.telegram_handle}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="panel p-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-sa-text-3 mb-3">Details</h3>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-3 text-sa-text-3">
                  <Calendar size={16} />
                  <span>Joined {joinedYear}</span>
                </div>
                <div className="flex items-center gap-3 text-sa-text-3">
                  <Film size={16} />
                  <span>{videos.length} video{videos.length !== 1 ? "s" : ""} published</span>
                </div>
                <div className="flex items-center gap-3 text-sa-text-3">
                  <Eye size={16} />
                  <span>{formatViews(totalViews)} total views</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
