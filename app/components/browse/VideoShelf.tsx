"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Eye, Lock, Bookmark, Film } from "lucide-react";
import { FrostedPlayMark } from "@/app/components/ui/FrostedPlayMark";
import { useCurrentUser } from "@/app/lib/auth-client";

// ONE shared fetch of the user's watchlisted video-ids, deduped across every
// card on the page (previously each card POSTed its own "check" — an N+1
// burst of 8-20 requests on every grid mount). Short TTL keeps the badge
// fresh across navigations; card toggles mutate the cached set directly.
const WATCHLIST_IDS_TTL_MS = 30_000;
let watchlistIdsCache: { userId: string; fetchedAt: number; promise: Promise<Set<string>> } | null = null;
function fetchWatchlistIds(userId: string): Promise<Set<string>> {
  const now = Date.now();
  if (watchlistIdsCache && watchlistIdsCache.userId === userId && now - watchlistIdsCache.fetchedAt < WATCHLIST_IDS_TTL_MS) {
    return watchlistIdsCache.promise;
  }
  const promise = fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, action: "ids" }),
  })
    .then((r) => r.json())
    .then((d: { video_ids?: string[] }) => new Set<string>(Array.isArray(d.video_ids) ? d.video_ids : []))
    .catch(() => new Set<string>());
  watchlistIdsCache = { userId, fetchedAt: now, promise };
  return promise;
}

export interface Video {
  id: string;
  title: string;
  creatorId: string | null;
  creatorName: string;
  creatorAvatarUrl: string | null;
  projectAvatar: string;
  thumbnail: string;
  thumbnailUrl?: string | null;
  cloudflareUid?: string | null;
  duration: number;
  views: number;
  pricePerSecond: number;
  isLive: boolean;
  isNew: boolean;
  category: string;
}

interface ApiCreator {
  id: string;
  display_name: string | null;
  channel_name: string | null;
  avatar_url: string | null;
}

export interface ApiVideoRow {
  id: string;
  title: string;
  creator_id: string | null;
  duration_secs: number | null;
  views: number | null;
  rate_per_sec: number | null;
  thumbnail_url?: string | null;
  cloudflare_uid?: string | null;
  created_at: string;
  users?: ApiCreator | ApiCreator[] | null;
}

const THUMB_GRADIENTS = [
  "from-rose-600 to-orange-500",
  "from-emerald-600 to-teal-500",
  "from-sky-600 to-blue-500",
  "from-amber-600 to-yellow-500",
  "from-fuchsia-600 to-pink-500",
  "from-lime-600 to-green-500",
  "from-violet-600 to-indigo-500",
  "from-cyan-600 to-blue-400",
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function isNewVideo(createdAt: string): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 7 * 24 * 60 * 60 * 1000;
}

function creatorProfileFromRow(row: ApiVideoRow): {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  initials: string;
} {
  const raw = row.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  if (!u) {
    return { id: row.creator_id, name: "Unknown", avatarUrl: null, initials: "?" };
  }
  const name =
    (u.channel_name && u.channel_name.trim()) || (u.display_name && u.display_name.trim()) || "Unknown";
  const forInitials = (u.channel_name || u.display_name || "CR").replace(/\s+/g, " ").trim();
  const parts = forInitials.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
      : (forInitials.slice(0, 2) || "CR").toUpperCase();
  return {
    id: u.id ?? row.creator_id,
    name,
    avatarUrl: u.avatar_url ?? null,
    initials: initials.slice(0, 2),
  };
}

export function mapRowToVideo(row: ApiVideoRow, i: number): Video {
  const c = creatorProfileFromRow(row);
  return {
    id: row.id,
    title: row.title,
    creatorId: c.id,
    creatorName: c.name,
    creatorAvatarUrl: c.avatarUrl,
    projectAvatar: c.initials,
    thumbnail: THUMB_GRADIENTS[i % THUMB_GRADIENTS.length],
    thumbnailUrl: row.thumbnail_url ?? null,
    cloudflareUid: row.cloudflare_uid ?? null,
    duration: row.duration_secs ?? 0,
    views: row.views ?? 0,
    pricePerSecond: Number(row.rate_per_sec ?? 0.00003),
    isLive: true,
    isNew: isNewVideo(row.created_at),
    category: "Demo",
  };
}

function isPlaceholderId(id: string) {
  return id.startsWith("placeholder");
}

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`;

export const VideoCard = memo(function VideoCard({ video, onPlay }: { video: Video; onPlay: (videoId: string) => void }) {
  const { userId } = useCurrentUser();
  const [saved, setSaved] = useState(false);
  const placeholder = isPlaceholderId(video.id);
  const [hovered, setHovered] = useState(false);
  const previewUrl = video.cloudflareUid
    ? `https://videodelivery.net/${video.cloudflareUid}/manifest/video.m3u8`
    : null;

  useEffect(() => {
    if (!userId || placeholder) return;
    let active = true;
    // Shared, deduped id-set — one network request per grid, not per card.
    void fetchWatchlistIds(userId).then((ids) => {
      if (active) setSaved(ids.has(video.id));
    });
    return () => {
      active = false;
    };
  }, [userId, video.id, placeholder]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-3 group cursor-pointer ${placeholder ? "opacity-60" : ""}`}
      onClick={() => {
        if (placeholder) return;
        onPlay(video.id);
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
    >
      <div className={`focus-ring video-card relative aspect-video hover-lift ${placeholder ? "" : "group-hover:border-sa-border-hover"}`}>
        <div className="absolute inset-0 bg-[#182233]" />
        {previewUrl && hovered && !placeholder ? (
          <video
            className="absolute inset-0 h-full w-full object-cover z-[1] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
            src={previewUrl}
            muted
            autoPlay
            loop
            playsInline
          />
        ) : video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover z-[1] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 z-[1] bg-sa-blue/15 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105" />
        )}
        {/* Noise texture */}
        <div className="absolute inset-0 z-[2] mix-blend-overlay pointer-events-none opacity-40" style={{ backgroundImage: NOISE_SVG, backgroundRepeat: "repeat" }} />

        {/* Bottom gradient overlay for legibility of pills and duration */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-2/5 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        <div className="absolute top-3 left-3 flex gap-2 z-10">
          {placeholder ? (
            <span className="rounded-md bg-sa-blue/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary-foreground))]">Soon</span>
          ) : (
            <>
              {video.isNew && <span className="rounded-md bg-[hsl(216_24%_24%/0.92)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>}
            </>
          )}
        </div>

        {/* Rate pill — always visible bottom-left, signature cyan */}
        {!placeholder && (
          <span className="absolute bottom-3 left-3 z-10 inline-flex items-center rounded-md bg-black/55 px-2 py-1 font-mono text-[11px] tabular-nums text-sa-blue backdrop-blur-md ring-1 ring-inset ring-sa-blue/30">
            ${video.pricePerSecond}/s
          </span>
        )}

        <div className="absolute bottom-3 right-3 z-10 rounded-md bg-black/65 backdrop-blur-md px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-white ring-1 ring-inset ring-white/10">
          {formatDuration(video.duration)}
        </div>

        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 z-10
          ${placeholder ? "opacity-0 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-90"}
        `}>
          {placeholder ? (
            <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-xl flex items-center justify-center border border-white/10">
              <Lock className="h-6 w-6 text-white/40" strokeWidth={1.5} />
            </div>
          ) : (
            <FrostedPlayMark sizeClass="w-14 h-14" />
          )}
        </div>

        {userId && (
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const action = saved ? "remove" : "add";
              const res = await fetch("/api/watchlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, video_id: video.id, action }),
              });
              const data = (await res.json()) as { saved?: boolean };
              setSaved(!!data.saved);
              // Keep the shared id-set in sync so sibling grids stay correct.
              void watchlistIdsCache?.promise.then((ids) => {
                if (data.saved) ids.add(video.id);
                else ids.delete(video.id);
              });
            }}
            className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg backdrop-blur-sm border transition-colors ${
              saved
                ? "bg-primary/20 border-primary/40 text-primary"
                : "bg-black/40 border-white/10 text-white/60 hover:text-white"
            }`}
          >
            <Bookmark size={14} className={saved ? "fill-current" : ""} />
          </button>
        )}
      </div>

      <div className="flex gap-3 px-1">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-sa-border bg-sa-surface-2 text-[10px] font-bold">
          {video.creatorAvatarUrl ? (
            <img src={video.creatorAvatarUrl} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            video.projectAvatar
          )}
        </div>
        <div className="flex flex-col gap-1 overflow-hidden">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight transition-colors group-hover:text-foreground">{video.title}</h3>
          <div className="flex min-w-0 items-center gap-2 text-xs text-sa-text-3">
            {placeholder || !video.creatorId ? (
              <span className="min-w-0 truncate">{video.creatorName}</span>
            ) : (
              <Link
                href={`/profile/${video.creatorId}`}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 truncate hover:text-foreground hover:underline"
              >
                {video.creatorName}
              </Link>
            )}
            {!placeholder && (
              <>
                <span className="w-1 h-1 rounded-full bg-sa-text-3" />
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3 opacity-80" />
                  {formatViews(video.views)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

function SectionHeader({ title, seeAllHref }: { title: string; seeAllHref?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
        <span aria-hidden className="inline-block h-7 w-[3px] rounded-full bg-sa-blue shadow-[0_0_8px_hsla(188,86%,56%,0.55)]" />
        {title}
      </h2>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="text-sm font-semibold text-sa-blue transition-colors hover:text-sa-cyan"
        >
          See all →
        </Link>
      )}
    </div>
  );
}

function FeaturedSection({ videos, onPlay }: { videos: Video[]; onPlay: (videoId: string) => void }) {
  if (videos.length === 0) return null;
  return (
    <section className="flex flex-col gap-5">
      <SectionHeader title="Trending" seeAllHref="/explore" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

// Browse preview shows only the first 2 rows of "All demos" (4-col xl grid → 8);
// the rest live on the "See all" → /explore all-videos view.
const ALL_DEMOS_PREVIEW_COUNT = 8;

function AllDemos({ videos, onPlay }: { videos: Video[]; onPlay: (videoId: string) => void }) {
  if (videos.length === 0) return null;
  return (
    <section className="flex flex-col gap-5">
      <SectionHeader title="All demos" seeAllHref="/explore" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {videos.slice(0, ALL_DEMOS_PREVIEW_COUNT).map((v) => (
          <VideoCard key={v.id} video={v} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

function ShelfSkeleton() {
  return (
    <div className="space-y-12 pb-8">
      {[0, 1].map((s) => (
        <section key={s} className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="h-8 w-48 skeleton-shimmer rounded-lg" />
            <div className="h-4 w-16 skeleton-shimmer rounded" />
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="aspect-video skeleton-shimmer rounded-xl" />
                <div className="flex gap-3 px-1">
                  <div className="skeleton-shimmer h-9 w-9 flex-shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="skeleton-shimmer h-3.5 w-4/5 rounded" />
                    <div className="skeleton-shimmer h-3 w-3/5 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ShelfEmpty() {
  return (
    <section className="flex flex-col items-center gap-4 py-20 px-6 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-sa-blue/30 bg-sa-surface-2/60 shadow-[0_0_32px_hsla(188,86%,56%,0.15)]">
        <Film size={32} className="text-sa-blue" />
        <span aria-hidden className="absolute -bottom-1 -right-1 inline-flex h-3 w-3 animate-pulse rounded-full bg-sa-blue shadow-[0_0_8px_hsl(188,86%,56%)]" />
      </div>
      <h3 className="text-xl font-bold tracking-tight">No videos yet</h3>
      <p className="max-w-sm text-sm text-sa-text-3">
        Creators are on their way — check back soon or be the first to upload a demo.
      </p>
    </section>
  );
}

export default function VideoShelf({ onPlay }: { onPlay: (videoId: string) => void }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/videos?status=live");
        const data = await res.json();
        const rows = (data.videos ?? []) as ApiVideoRow[];
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setVideos(rows.map((r, i) => mapRowToVideo(r, i)));
        } else {
          setVideos([]);
        }
      } catch {
        if (!cancelled) setVideos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    window.addEventListener("streamarc-videos-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("streamarc-videos-updated", load);
    };
  }, []);

  const featured = videos.filter((v) => v.isLive || v.isNew).slice(0, 4);
  const featuredList = featured.length > 0 ? featured : videos;

  if (loading) return <ShelfSkeleton />;
  if (videos.length === 0) return <ShelfEmpty />;

  return (
    <div className="space-y-12 pb-8">
      <FeaturedSection videos={featuredList} onPlay={onPlay} />
      <AllDemos videos={videos} onPlay={onPlay} />
    </div>
  );
}
