"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Eye, Lock, Bookmark } from "lucide-react";
import { FrostedPlayMark } from "@/app/components/ui/FrostedPlayMark";
import { useCurrentUser } from "@/app/lib/auth-client";

interface Video {
  id: string;
  title: string;
  project: string;
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

interface ApiVideoRow {
  id: string;
  title: string;
  duration_secs: number | null;
  views: number | null;
  rate_per_sec: number | null;
  thumbnail_url?: string | null;
  cloudflare_uid?: string | null;
  created_at: string;
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

function mapRowToVideo(row: ApiVideoRow, i: number): Video {
  const words = row.title.trim().split(/\s+/);
  const project = words.slice(0, 2).join(" ") || "Creator";
  const avatar = (words[0]?.slice(0, 2) ?? "SA").toUpperCase();
  return {
    id: row.id,
    title: row.title,
    project,
    projectAvatar: avatar,
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

function VideoCard({ video, onPlay }: { video: Video; onPlay: (videoId: string) => void }) {
  const { userId } = useCurrentUser();
  const [saved, setSaved] = useState(false);
  const placeholder = isPlaceholderId(video.id);
  const [hovered, setHovered] = useState(false);
  const previewUrl = video.cloudflareUid
    ? `https://videodelivery.net/${video.cloudflareUid}/manifest/video.m3u8`
    : null;

  useEffect(() => {
    if (!userId || placeholder) return;
    fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, video_id: video.id, action: "check" }),
    })
      .then((r) => r.json())
      .then((data: { saved?: boolean }) => setSaved(data.saved ?? false))
      .catch(() => {});
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
      <div className={`video-card relative aspect-video hover-lift ${placeholder ? "" : "group-hover:border-sa-border-hover"}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#182233] via-[#202b40] to-[#131c2c]" />
        <div
          className={`absolute inset-0 bg-gradient-to-br opacity-[0.2] ${video.thumbnail}`}
          aria-hidden
        />
        {previewUrl && hovered && !placeholder ? (
          <video
            className="absolute inset-0 h-full w-full object-cover z-[1]"
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
            className={`absolute inset-0 h-full w-full object-cover z-[1] ${hovered && !placeholder ? "preview-kenburns" : ""}`}
          />
        ) : (
          <div className={`absolute inset-0 z-[1] bg-gradient-to-br ${video.thumbnail} opacity-35 ${hovered && !placeholder ? "preview-kenburns" : ""}`} />
        )}
        {/* Noise texture */}
        <div className="absolute inset-0 z-[2] mix-blend-overlay pointer-events-none opacity-40" style={{ backgroundImage: NOISE_SVG, backgroundRepeat: "repeat" }} />
        {/* Top inner glow */}
        <div className="absolute inset-x-0 top-0 h-24 z-[2] pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.04), transparent)" }} />

        <div className="absolute top-3 left-3 flex gap-2 z-10">
          {placeholder ? (
            <span className="rounded-md bg-sa-blue/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary-foreground))]">Soon</span>
          ) : (
            <>
              {video.isLive && <span className="rounded-md bg-sa-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Live</span>}
              {video.isNew && <span className="rounded-md bg-[hsl(216_24%_24%/0.92)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>}
            </>
          )}
        </div>

        <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10">
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
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-sa-border bg-sa-surface-2 text-[10px] font-bold">
          {video.projectAvatar}
        </div>
        <div className="flex flex-col gap-1 overflow-hidden">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight transition-colors group-hover:text-foreground">{video.title}</h3>
          <div className="flex items-center gap-2 text-xs text-sa-text-3">
            <span>{video.project}</span>
            {!placeholder && (
              <>
                <span className="w-1 h-1 rounded-full bg-sa-text-3" />
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3 opacity-80" />
                  {formatViews(video.views)}
                </span>
              </>
            )}
            <span className="w-1 h-1 rounded-full bg-sa-text-3" />
            <span className="font-medium text-sa-accent">${video.pricePerSecond}/s</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FeaturedSection({ videos, onPlay }: { videos: Video[]; onPlay: (videoId: string) => void }) {
  if (videos.length === 0) {
    return (
      <section className="flex flex-col gap-6 px-6">
        <h2 className="text-2xl font-bold tracking-tight">Featured demos</h2>
        <p className="text-sm text-sa-text-3">No videos yet. Be the first to upload.</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Featured demos</h2>
        <span className="text-sm text-sa-text-3">Trending and newly uploaded</span>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

function AllDemos({ videos, onPlay }: { videos: Video[]; onPlay: (videoId: string) => void }) {
  if (videos.length === 0) {
    return (
      <section className="flex flex-col gap-6 px-6">
        <h2 className="text-2xl font-bold tracking-tight">All demos</h2>
        <p className="text-sm text-sa-text-3">No videos yet. Be the first to upload.</p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">All demos</h2>
        <span className="text-sm text-sa-text-3">{videos.length} videos</span>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} onPlay={onPlay} />
        ))}
      </div>
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

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-sa-text-3">
        Loading demos...
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-8">
      <FeaturedSection videos={featuredList} onPlay={onPlay} />
      <AllDemos videos={videos} onPlay={onPlay} />
    </div>
  );
}
