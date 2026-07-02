"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { VideoCard, mapRowToVideo, type ApiVideoRow, type Video } from "@/app/components/browse/VideoShelf";

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

// Default Explore view: EVERY live video, newest first, with NO category filter
// — so untagged videos and clips (which carry no category) are never hidden.
function AllVideosGrid({ onVideoClick }: { onVideoClick: (id: string) => void }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/videos?status=live`)
      .then((r) => r.json())
      .then((data: { videos?: ApiVideoRow[] }) => {
        if (cancelled) return;
        const rows = data.videos ?? [];
        setVideos(rows.map((r, i) => mapRowToVideo(r, i)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="px-1 text-lg font-bold">All videos</h2>
      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <div className="aspect-video w-full animate-pulse rounded-xl bg-sa-surface" />
              <div className="flex gap-3 px-1">
                <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full bg-sa-surface-2" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3.5 w-4/5 animate-pulse rounded bg-sa-surface-2" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-sa-surface-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : videos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No videos yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} onPlay={onVideoClick} />
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
  // Stable identity so memoized VideoCards don't re-render on parent state changes.
  const openWatch = useCallback((id: string) => void router.push(`/watch/${id}`), [router]);

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
      const data = (await res.json()) as { videos?: ApiVideoRow[] };
      const rows = data.videos ?? [];
      setFilteredVideos(rows.map((r, i) => mapRowToVideo(r, i)));
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="aspect-video w-full animate-pulse rounded-xl bg-sa-surface" />
                  <div className="flex gap-3 px-1">
                    <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full bg-sa-surface-2" />
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="h-3.5 w-4/5 animate-pulse rounded bg-sa-surface-2" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-sa-surface-2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No videos in this category yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {filteredVideos.map((v) => (
                <VideoCard key={v.id} video={v} onPlay={openWatch} />
              ))}
            </div>
          )}
        </div>
      )}

      {!activeCategory && <AllVideosGrid onVideoClick={openWatch} />}
    </div>
  );
}
