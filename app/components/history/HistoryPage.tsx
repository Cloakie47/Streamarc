"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { History, MoreVertical, Trash2 } from "lucide-react";

interface HistoryItem {
  id: string;
  watched_at: string;
  seconds_watched: number;
  video_id: string;
  videos:
    | {
        id: string;
        title: string;
        duration_secs: number | null;
        rate_per_sec: number | null;
        views: number | null;
        cloudflare_uid: string | null;
        thumbnail_url: string | null;
        creator_id: string;
        creator: {
          channel_name: string | null;
          display_name: string | null;
        } | null;
      }
    | {
        id: string;
        title: string;
        duration_secs: number | null;
        rate_per_sec: number | null;
        views: number | null;
        cloudflare_uid: string | null;
        thumbnail_url: string | null;
        creator_id: string;
        creator: {
          channel_name: string | null;
          display_name: string | null;
        } | null;
      }[]
    | null;
}

type DisplayHistoryItem = HistoryItem & { sourceIds: string[] };

function buildDedupedHistory(history: HistoryItem[]): DisplayHistoryItem[] {
  const byKey = new Map<string, HistoryItem[]>();
  for (const item of history) {
    if (!normalizeVideo(item.videos)) continue;
    const k = `${dayBucketKey(item.watched_at)}::${item.video_id}`;
    const list = byKey.get(k) ?? [];
    list.push(item);
    byKey.set(k, list);
  }
  const out: DisplayHistoryItem[] = [];
  for (const items of byKey.values()) {
    const best = items.reduce((a, b) =>
      new Date(b.watched_at) > new Date(a.watched_at) ? b : a,
    );
    out.push({ ...best, sourceIds: items.map((i) => i.id) });
  }
  out.sort(
    (a, b) =>
      new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime(),
  );
  return out;
}

function normalizeVideo(
  v: HistoryItem["videos"],
): {
  id: string;
  title: string;
  duration_secs: number | null;
  rate_per_sec: number | null;
  views: number | null;
  cloudflare_uid: string | null;
  thumbnail_url: string | null;
  creator_id: string;
  creator: {
    channel_name: string | null;
    display_name: string | null;
  } | null;
} | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function posterUrl(video: NonNullable<ReturnType<typeof normalizeVideo>>): string | null {
  if (video.thumbnail_url) return video.thumbnail_url;
  if (video.cloudflare_uid) {
    return `https://videodelivery.net/${video.cloudflare_uid}/thumbnails/thumbnail.jpg?height=720`;
  }
  return null;
}

function creatorLabel(video: NonNullable<ReturnType<typeof normalizeVideo>>): string {
  const c = video.creator;
  if (c?.channel_name?.trim()) return c.channel_name;
  if (c?.display_name?.trim()) return c.display_name;
  return "Creator";
}

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

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sectionLabelForWatchedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const itemStart = startOfLocalDay(d);
  const diffMs = todayStart.getTime() - itemStart.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const y = d.getFullYear();
  const cy = now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: y !== cy ? "numeric" : undefined,
  });
}

function dayBucketKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function HistoryPage({ userId }: { userId: string }) {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action: "list" }),
      });
      const data = (await res.json()) as { history?: HistoryItem[] };
      setHistory(data.history ?? []);
    } catch {
      console.error("Failed to fetch history");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    if (!menuOpenId) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpenId]);

  const dedupedHistory = useMemo(
    () => buildDedupedHistory(history),
    [history],
  );

  const grouped = useMemo(() => {
    const groups: {
      label: string;
      key: string;
      items: DisplayHistoryItem[];
    }[] = [];
    let lastKey: string | null = null;
    for (const item of dedupedHistory) {
      const v = normalizeVideo(item.videos);
      if (!v) continue;
      const key = dayBucketKey(item.watched_at);
      const label = sectionLabelForWatchedAt(item.watched_at);
      if (key !== lastKey) {
        groups.push({ label, key, items: [item] });
        lastKey = key;
      } else {
        groups[groups.length - 1]?.items.push(item);
      }
    }
    return groups;
  }, [dedupedHistory]);

  const handleClear = async () => {
    if (!confirm("Clear all watch history?")) return;
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action: "clear" }),
    });
    setHistory([]);
  };

  const handleRemove = async (sourceIds: string[]) => {
    setMenuOpenId(null);
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action: "remove", ids: sourceIds }),
    });
    const idSet = new Set(sourceIds);
    setHistory((prev) => prev.filter((h) => !idSet.has(h.id)));
  };

  return (
    <div className="mx-auto max-w-[1400px] pb-16 pt-2">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <History size={28} className="shrink-0 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Watch history</h1>
          <span className="text-sm text-muted-foreground">({dedupedHistory.length})</span>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => void handleClear()}
            className="flex shrink-0 items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-destructive sm:mt-1"
          >
            <Trash2 size={14} />
            Clear history
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 py-2">
              <div className="h-[94px] w-[168px] shrink-0 animate-pulse rounded-lg bg-sa-surface-2" />
              <div className="flex flex-1 flex-col justify-center gap-2 py-1">
                <div className="h-4 max-w-[70%] animate-pulse rounded bg-sa-surface-2" />
                <div className="h-3 max-w-[45%] animate-pulse rounded bg-sa-surface-2" />
              </div>
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-sa-surface-2" />
            </div>
          ))}
        </div>
      ) : dedupedHistory.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sa-surface-2">
            <History size={32} className="text-muted-foreground" />
          </div>
          <p className="text-lg font-medium">No watch history yet</p>
          <p className="text-sm text-muted-foreground">Videos you watch will appear here</p>
          <button type="button" onClick={() => router.push("/?page=browse")} className="btn btn-primary mt-2">
            Browse Videos
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {grouped.map((section) => (
            <section key={section.key}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">{section.label}</h2>
              <ul className="flex flex-col gap-1">
                {section.items.map((item, i) => {
                  const video = normalizeVideo(item.videos);
                  if (!video) return null;
                  const thumb = posterUrl(video);
                  const dur = video.duration_secs ?? 0;
                  const progressPct =
                    dur > 0 ? Math.min(100, (item.seconds_watched / dur) * 100) : 0;
                  return (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
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
                              <History size={24} className="text-white/20" />
                            </div>
                          )}
                          <span className="absolute bottom-2 right-1.5 rounded bg-black/75 px-1 py-0.5 font-mono text-[10px] font-bold text-white">
                            {formatDuration(video.duration_secs)}
                          </span>
                          {dur > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/50">
                              <div
                                className="h-full bg-red-500"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          )}
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
                          </p>
                        </div>
                        <div className="relative flex shrink-0 items-start pt-1" ref={menuOpenId === item.id ? menuRef : undefined}>
                          <button
                            type="button"
                            className="rounded-lg p-2 text-sa-text-3 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                            aria-label="More actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId((id) => (id === item.id ? null : item.id));
                            }}
                          >
                            <MoreVertical size={18} />
                          </button>
                          {menuOpenId === item.id && (
                            <div className="absolute right-0 top-10 z-20 min-w-[200px] rounded-lg border border-sa-border bg-sa-surface py-1 shadow-lg">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-white/[0.06]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRemove(item.sourceIds);
                                }}
                              >
                                <Trash2 size={14} className="text-muted-foreground" />
                                Remove from watch history
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
