"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { motion } from "motion/react";

const CATEGORIES = [
  { id: "new-this-week", label: "🔥 New This Week" },
  { id: "project-demo", label: "🏗️ Project Demos" },
  { id: "tutorial", label: "📚 Tutorials" },
  { id: "defi", label: "🏦 DeFi" },
  { id: "bridges", label: "🌉 Bridges & Cross-chain" },
  { id: "infrastructure", label: "⚙️ Infrastructure" },
  { id: "governance", label: "🗳️ Governance" },
  { id: "nft", label: "🖼️ NFTs" },
  { id: "ai-agents", label: "🤖 AI & Agents" },
  { id: "ama", label: "🎙️ AMA" },
  { id: "talks", label: "🎤 Talks & Panels" },
  { id: "irl", label: "📍 IRL Moments" },
  { id: "random", label: "🎲 Random" },
];

interface Video {
  id: string;
  title: string;
  duration_secs: number | null;
  rate_per_sec: number | null;
  views: number | null;
  categories: string[] | null;
}

function formatDuration(secs: number | null): string {
  if (!secs) return "0:00";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function VideoCard({ video, index, onClick }: { video: Video; index: number; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group flex w-56 flex-shrink-0 cursor-pointer flex-col gap-2"
      onClick={onClick}
    >
      <div className="relative aspect-video overflow-hidden rounded-xl border border-white/[0.06]">
        <div className="absolute inset-0 bg-[#0c0d14]" />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <PlayCircle size={32} className="fill-white/10 text-white" />
        </div>
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
          {formatDuration(video.duration_secs)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-1">
        <h3 className="line-clamp-2 text-xs font-medium transition-colors group-hover:text-sa-accent">{video.title}</h3>
        <span className="text-[10px] font-mono tabular-nums text-sa-blue">
          ${video.rate_per_sec ?? 0}/s
        </span>
      </div>
    </motion.div>
  );
}

function CategoryRow({
  category,
  onVideoClick,
}: {
  category: { id: string; label: string };
  onVideoClick: (id: string) => void;
}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/videos?status=live&category=${encodeURIComponent(category.id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setVideos(data.videos ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category.id]);

  if (!loading && videos.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="px-1 text-lg font-bold">{category.label}</h2>
      {loading ? (
        <div className="flex gap-4 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-video w-56 flex-shrink-0 animate-pulse rounded-xl bg-sa-surface" />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
          {videos.map((v, i) => (
            <VideoCard key={v.id} video={v} index={i} onClick={() => onVideoClick(v.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
  const [filtering, setFiltering] = useState(false);

  const handleCategoryFilter = async (categoryId: string) => {
    if (activeCategory === categoryId) {
      setActiveCategory(null);
      setFilteredVideos([]);
      return;
    }
    setActiveCategory(categoryId);
    setFiltering(true);
    try {
      const res = await fetch(`/api/videos?status=live&category=${encodeURIComponent(categoryId)}`);
      const data = (await res.json()) as { videos?: Video[] };
      setFilteredVideos(data.videos ?? []);
    } finally {
      setFiltering(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 px-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Explore</h1>
        <p className="mt-1 text-sm text-muted-foreground">Discover crypto content by category</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => void handleCategoryFilter(cat.id)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeCategory === cat.id
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-sa-border bg-transparent text-muted-foreground hover:border-sa-border-hover hover:text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {activeCategory && (
        <div className="flex flex-col gap-4">
          {filtering ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-xl bg-sa-surface" />
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No videos in this category yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredVideos.map((v, i) => (
                <VideoCard key={v.id} video={v} index={i} onClick={() => void router.push(`/watch/${v.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {!activeCategory && (
        <div className="flex flex-col gap-10">
          {CATEGORIES.map((cat) => (
            <CategoryRow key={cat.id} category={cat} onVideoClick={(id) => void router.push(`/watch/${id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
