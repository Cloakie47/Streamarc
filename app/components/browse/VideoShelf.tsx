"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Eye, Lock, PlayCircle } from "lucide-react";
import { FrostedPlayMark } from "@/app/components/ui/FrostedPlayMark";
import { DEFAULT_WATCH_VIDEO_ID } from "@/app/lib/constants";

interface Video {
  id: string;
  title: string;
  project: string;
  projectAvatar: string;
  thumbnail: string;
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
  total_views: number | null;
  rate_per_sec: number | null;
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

const FALLBACK_VIDEOS: Video[] = [
  {
    id: DEFAULT_WATCH_VIDEO_ID,
    title: "ArcSwap v3 — Concentrated Liquidity Demo",
    project: "ArcSwap",
    projectAvatar: "AS",
    thumbnail: "from-rose-600 to-orange-500",
    duration: 847,
    views: 14283,
    pricePerSecond: 0.00003,
    isLive: true,
    isNew: false,
    category: "DeFi",
  },
  {
    id: "placeholder-2",
    title: "Cross-chain bridge live demo",
    project: "BridgeARC",
    projectAvatar: "BA",
    thumbnail: "from-emerald-600 to-teal-500",
    duration: 434,
    views: 8921,
    pricePerSecond: 0.00003,
    isLive: true,
    isNew: true,
    category: "Bridges",
  },
  {
    id: "placeholder-3",
    title: "Smart contract deployment walkthrough",
    project: "ArcDev",
    projectAvatar: "AD",
    thumbnail: "from-sky-600 to-blue-500",
    duration: 541,
    views: 5432,
    pricePerSecond: 0.00003,
    isLive: true,
    isNew: false,
    category: "Infrastructure",
  },
  {
    id: "placeholder-4",
    title: "NFT marketplace — full product demo",
    project: "ArcMarket",
    projectAvatar: "AM",
    thumbnail: "from-violet-600 to-indigo-500",
    duration: 235,
    views: 3201,
    pricePerSecond: 0.00003,
    isLive: true,
    isNew: true,
    category: "NFT",
  },
  {
    id: "placeholder-5",
    title: "Governance voting system explained",
    project: "ArcGov",
    projectAvatar: "AG",
    thumbnail: "from-amber-600 to-yellow-500",
    duration: 372,
    views: 2891,
    pricePerSecond: 0.00003,
    isLive: false,
    isNew: false,
    category: "Governance",
  },
  {
    id: "placeholder-6",
    title: "Staking mechanism — ArcStake v2",
    project: "ArcStake",
    projectAvatar: "AK",
    thumbnail: "from-fuchsia-600 to-pink-500",
    duration: 328,
    views: 1654,
    pricePerSecond: 0.00003,
    isLive: true,
    isNew: false,
    category: "DeFi",
  },
  {
    id: "placeholder-7",
    title: "Token launchpad — fair launch walkthrough",
    project: "ArcPad",
    projectAvatar: "AP",
    thumbnail: "from-lime-600 to-green-500",
    duration: 612,
    views: 4710,
    pricePerSecond: 0.00003,
    isLive: false,
    isNew: true,
    category: "DeFi",
  },
  {
    id: "placeholder-8",
    title: "On-chain analytics dashboard demo",
    project: "ArcScan",
    projectAvatar: "AC",
    thumbnail: "from-cyan-600 to-blue-400",
    duration: 495,
    views: 3842,
    pricePerSecond: 0.00003,
    isLive: false,
    isNew: false,
    category: "Infrastructure",
  },
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
    duration: row.duration_secs ?? 0,
    views: row.total_views ?? 0,
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
  const placeholder = isPlaceholderId(video.id);

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
    >
      <div className={`relative aspect-video rounded-sa-card overflow-hidden border border-white/[0.06] transition-all duration-300
        ${placeholder ? "" : "group-hover:border-sa-accent/30 group-hover:shadow-[0_0_48px_-12px_hsl(12_85%_58%/0.2)]"}
      `}
        style={{ boxShadow: "0 8px 32px -8px rgba(0,0,0,0.5)" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#0c0d14] via-[#131528] to-[#090a10]" />
        <div
          className={`absolute inset-0 bg-gradient-to-br opacity-[0.28] mix-blend-screen ${video.thumbnail}`}
          aria-hidden
        />
        {/* Noise texture */}
        <div className="absolute inset-0 z-[1] mix-blend-overlay pointer-events-none" style={{ backgroundImage: NOISE_SVG, backgroundRepeat: "repeat" }} />
        {/* Top inner glow */}
        <div className="absolute inset-x-0 top-0 h-24 z-[1] pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.04), transparent)" }} />

        <div className="absolute top-3 left-3 flex gap-2 z-10">
          {placeholder ? (
            <span className="bg-sa-blue/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Soon</span>
          ) : (
            <>
              {video.isLive && <span className="bg-sa-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">Live</span>}
              {video.isNew && <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">New</span>}
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
            <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
              <PlayCircle size={32} className="text-white fill-white/10" />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 px-1">
        <div className="w-8 h-8 rounded-full bg-sa-surface-2 flex-shrink-0 flex items-center justify-center text-[10px] font-bold border border-white/[0.06]">
          {video.projectAvatar}
        </div>
        <div className="flex flex-col gap-1 overflow-hidden">
          <h3 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-sa-accent transition-colors">{video.title}</h3>
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
            <span className="text-sa-accent font-medium">${video.pricePerSecond}/s</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FeaturedSection({ videos, onPlay }: { videos: Video[]; onPlay: (videoId: string) => void }) {
  return (
    <section className="flex flex-col gap-6 px-6">
      <h2 className="text-2xl font-bold tracking-tight">Featured demos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

function AllDemos({ videos, onPlay }: { videos: Video[]; onPlay: (videoId: string) => void }) {
  return (
    <section className="flex flex-col gap-6 px-6">
      <h2 className="text-2xl font-bold tracking-tight">All demos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {videos.map((v) => (
          <VideoCard key={v.id} video={v} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

export default function VideoShelf({ onPlay }: { onPlay: (videoId: string) => void }) {
  const [videos, setVideos] = useState<Video[]>(FALLBACK_VIDEOS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/videos?status=live");
        const data = await res.json();
        const rows = (data.videos ?? []) as ApiVideoRow[];
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          const realVideos = rows.map(mapRowToVideo);
          const realIds = new Set(realVideos.map((v) => v.id));
          const extras = FALLBACK_VIDEOS.filter((v) => !realIds.has(v.id));
          setVideos([...realVideos, ...extras]);
        } else {
          setVideos(FALLBACK_VIDEOS);
        }
      } catch {
        if (!cancelled) setVideos(FALLBACK_VIDEOS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = videos.filter((v) => v.isLive || v.isNew).slice(0, 4);
  const featuredList = featured.length > 0 ? featured : videos;

  if (loading) {
    return (
      <div className="px-6 py-12 text-center text-sm text-sa-text-3">
        Loading demos...
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <FeaturedSection videos={featuredList} onPlay={onPlay} />
      <AllDemos videos={videos} onPlay={onPlay} />
    </div>
  );
}
