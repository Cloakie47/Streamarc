"use client";

import { motion } from "motion/react";
import { Twitter, MessageCircle, PlayCircle, Eye } from "lucide-react";
import { useRouter } from "next/navigation";

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
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
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
  const displayName = creator.channel_name || creator.display_name || "Creator";
  const joinedYear = new Date(creator.created_at).getFullYear();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Banner */}
      <div className="relative w-full h-48 bg-gradient-to-br from-primary/30 to-transparent overflow-hidden">
        {creator.banner_url ? (
          <img src={creator.banner_url} alt="Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-sa-blue/10" />
        )}
      </div>

      {/* Profile info */}
      <div className="px-6 pb-8">
        <div className="flex items-end gap-4 -mt-12 mb-6">
          <div className="w-24 h-24 rounded-full border-4 border-background overflow-hidden bg-sa-surface flex-shrink-0">
            {creator.avatar_url ? (
              <img src={creator.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-primary bg-primary/10">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="mb-2 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{displayName}</h1>
              {creator.is_verified && (
                <svg className="w-5 h-5 text-sa-blue" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Joined {joinedYear} · {videos.length} videos
            </p>
          </div>
        </div>

        {/* Bio */}
        {creator.bio && (
          <p className="text-sm text-muted-foreground max-w-2xl mb-4 leading-relaxed">{creator.bio}</p>
        )}

        {/* Social links */}
        <div className="flex items-center gap-3 mb-8 flex-wrap">
          {creator.x_handle && (
            <a
              href={`https://x.com/${creator.x_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Twitter size={14} />@{creator.x_handle}
            </a>
          )}
          {creator.reddit_handle && (
            <a
              href={`https://reddit.com/u/${creator.reddit_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="text-xs font-bold">r/</span>
              {creator.reddit_handle}
            </a>
          )}
          {creator.telegram_handle && (
            <a
              href={`https://t.me/${creator.telegram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageCircle size={14} />
              {creator.telegram_handle}
            </a>
          )}
        </div>

        {/* Videos grid */}
        <h2 className="text-lg font-bold mb-4">Videos</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No videos yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video, i) => (
              <motion.div
                key={video.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => router.push(`/watch/${video.id}`)}
                className="flex flex-col gap-3 cursor-pointer group"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden border border-white/[0.06]">
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${THUMB_GRADIENTS[i % THUMB_GRADIENTS.length]} opacity-30`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0c0d14] via-[#131528] to-[#090a10]" />
                  {video.thumbnail_url && (
                    <img
                      src={video.thumbnail_url}
                      alt={video.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <PlayCircle size={40} className="text-white fill-white/10" />
                  </div>
                  <span className="absolute bottom-2 right-2 text-[10px] font-mono font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                    {formatDuration(video.duration_secs)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 px-1">
                  <h3 className="text-sm font-medium line-clamp-2 group-hover:text-sa-accent transition-colors">
                    {video.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye size={11} />
                      {formatViews(video.views)}
                    </span>
                    <span>·</span>
                    <span className="text-sa-accent">${formatRate(video.rate_per_sec)}/s</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
