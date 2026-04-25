"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Heart, Play, Shuffle, Trash2, ListOrdered } from "lucide-react";
import { useCurrentUser } from "@/app/lib/auth-client";

interface FavoriteVideo {
  video_id: string;
  created_at: string;
  videos: {
    id: string;
    title: string;
    duration_secs: number | null;
    rate_per_sec: number | null;
    views: number | null;
    cloudflare_uid: string | null;
    creator_id: string;
    thumbnail_url: string | null;
    creator: {
      channel_name: string | null;
      display_name: string | null;
    } | null;
  } | null;
}

type SortMode = "recent" | "title";

function formatDuration(secs: number | null): string {
  if (!secs) return "0:00";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number | null | undefined): string {
  if (n == null) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatSavedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatLastUpdated(items: FavoriteVideo[]): string {
  const dates = items
    .map((i) => new Date(i.created_at).getTime())
    .filter((t) => !Number.isNaN(t));
  if (dates.length === 0) return "";
  const latest = new Date(Math.max(...dates));
  return formatSavedDate(latest.toISOString());
}

function posterUrl(video: NonNullable<FavoriteVideo["videos"]>): string | null {
  if (video.thumbnail_url) return video.thumbnail_url;
  if (video.cloudflare_uid) {
    return `https://videodelivery.net/${video.cloudflare_uid}/thumbnails/thumbnail.jpg?height=720`;
  }
  return null;
}

function creatorLabel(video: NonNullable<FavoriteVideo["videos"]>): string {
  const c = video.creator;
  if (c?.channel_name?.trim()) return c.channel_name;
  if (c?.display_name?.trim()) return c.display_name;
  return "Creator";
}

function shuffleIds(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FavouritesPage({ userId }: { userId: string }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [videos, setVideos] = useState<FavoriteVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [shuffleOrder, setShuffleOrder] = useState<string[] | null>(null);

  const fetchFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action: "list" }),
      });
      const data = (await res.json()) as { videos?: FavoriteVideo[] };
      setVideos(data.videos ?? []);
      setShuffleOrder(null);
    } catch {
      console.error("Failed to fetch favorites");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchFavorites();
  }, [fetchFavorites]);

  const sortedVideos = useMemo(() => {
    const rows = videos.filter(
      (v): v is FavoriteVideo & { videos: NonNullable<FavoriteVideo["videos"]> } => !!v.videos,
    );
    const copy = [...rows];
    if (sortMode === "title") {
      copy.sort((a, b) => a.videos!.title.localeCompare(b.videos!.title));
    } else {
      copy.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return copy;
  }, [videos, sortMode]);

  const displayVideos = useMemo(() => {
    if (!shuffleOrder?.length) return sortedVideos;
    const map = new Map(sortedVideos.map((v) => [v.video_id, v]));
    return shuffleOrder.map((id) => map.get(id)).filter(Boolean) as typeof sortedVideos;
  }, [sortedVideos, shuffleOrder]);

  const firstVideo = displayVideos[0]?.videos ?? null;
  const lastUpdatedLabel = formatLastUpdated(videos);

  const handleRemove = async (videoId: string) => {
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, video_id: videoId, action: "remove" }),
    });
    setVideos((prev) => prev.filter((v) => v.video_id !== videoId));
    setShuffleOrder((prev) => (prev ? prev.filter((id) => id !== videoId) : null));
  };

  const ownerLabel =
    user?.display_name?.trim() ||
    user?.email?.split("@")[0] ||
    "You";

  return (
    <div className="mx-auto max-w-[1400px] pb-16 pt-2">
      {loading ? (
        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="shrink-0 space-y-4 lg:w-[min(100%,380px)]">
            <div className="aspect-video w-full animate-pulse rounded-2xl bg-sa-surface-2" />
            <div className="h-8 w-48 animate-pulse rounded-lg bg-sa-surface-2" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-sa-surface-2" />
          </div>
          <div className="min-h-[320px] flex-1 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="h-[94px] w-[168px] shrink-0 animate-pulse rounded-lg bg-sa-surface-2" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 max-w-[75%] animate-pulse rounded bg-sa-surface-2" />
                  <div className="h-3 max-w-[50%] animate-pulse rounded bg-sa-surface-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sa-surface-2">
            <Heart size={32} className="text-muted-foreground" />
          </div>
          <p className="text-lg font-medium">No favourites yet</p>
          <p className="text-sm text-muted-foreground">
            Click the heart icon on any video to add it here
          </p>
          <button type="button" onClick={() => router.push("/?page=browse")} className="btn btn-primary mt-2">
            Browse videos
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-10">
          <div className="w-full shrink-0 lg:sticky lg:top-24 lg:w-[min(100%,380px)]">
            <div
              className="panel relative overflow-hidden rounded-2xl border border-sa-border p-0"
              style={{
                background: "hsl(213 50% 9% / 0.92)",
                boxShadow: "0 24px 48px rgba(4, 10, 24, 0.45)",
              }}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-black/40">
                {firstVideo && posterUrl(firstVideo) ? (
                  <img
                    src={posterUrl(firstVideo)!}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#0e1420]">
                    <Heart className="h-16 w-16 text-red-400/30" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-black/40" />
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-start gap-2">
                  <Heart size={22} className="mt-0.5 shrink-0 fill-red-400 text-red-400" />
                  <div>
                    <h1 className="text-xl font-bold tracking-tight text-foreground">Favourites</h1>
                    <p className="mt-1 text-sm text-sa-text-3">{ownerLabel}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {videos.length} video{videos.length === 1 ? "" : "s"}
                      {lastUpdatedLabel ? ` · Last updated ${lastUpdatedLabel}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!firstVideo}
                    onClick={() => firstVideo && router.push(`/watch/${firstVideo.id}`)}
                    className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    <Play size={18} className="fill-current" />
                    Play all
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShuffleOrder(shuffleIds(sortedVideos.map((v) => v.video_id)))
                    }
                    className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-white/10"
                  >
                    <Shuffle size={18} />
                    Shuffle
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
                Favourite videos
              </span>
              <div className="flex items-center gap-2">
                <ListOrdered size={14} className="text-sa-text-3" />
                <select
                  value={sortMode}
                  onChange={(e) => {
                    setSortMode(e.target.value as SortMode);
                    setShuffleOrder(null);
                  }}
                  className="rounded-lg border border-sa-border bg-sa-surface-2 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/35"
                >
                  <option value="recent">Recently added</option>
                  <option value="title">Title (A–Z)</option>
                </select>
              </div>
            </div>

            <ul className="flex flex-col gap-1">
              {displayVideos.map((item, i) => {
                const video = item.videos!;
                const thumb = posterUrl(video);
                return (
                  <motion.li
                    key={item.video_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.35) }}
                    className="group"
                  >
                    <div className="flex gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-sa-border hover:bg-white/[0.03]">
                      <button
                        type="button"
                        onClick={() => router.push(`/watch/${video.id}`)}
                        className="relative h-[94px] w-[168px] shrink-0 overflow-hidden rounded-lg bg-black/50 text-left"
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#0e1420]">
                            <Heart size={24} className="text-red-400/35" />
                          </div>
                        )}
                        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-0.5 font-mono text-[10px] font-bold text-white">
                          {formatDuration(video.duration_secs)}
                        </span>
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5 pr-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/watch/${video.id}`)}
                          className="line-clamp-2 text-left text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-sa-accent"
                        >
                          {video.title}
                        </button>
                        <p className="line-clamp-2 text-xs text-sa-text-3">
                          {creatorLabel(video)}
                          <span className="mx-1.5 text-sa-border">·</span>
                          {formatViews(video.views)} views
                          <span className="mx-1.5 text-sa-border">·</span>
                          Added {formatSavedDate(item.created_at)}
                          <span className="mx-1.5 text-sa-border">·</span>
                          <span className="font-mono tabular-nums text-sa-accent">
                            ${video.rate_per_sec ?? 0}/s
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-start pt-1">
                        <button
                          type="button"
                          onClick={() => void handleRemove(video.id)}
                          className="rounded-lg p-2 text-sa-text-3 transition-colors hover:bg-red-500/10 hover:text-red-400"
                          title="Remove from Favourites"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
