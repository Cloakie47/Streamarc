"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  Users,
  PlayCircle,
  DollarSign,
  Clock,
  Trash2,
  Wallet,
  TrendingUp,
  LayoutDashboard,
  Film,
  UserCog,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Inbox,
  Search,
  ArrowLeft,
} from "lucide-react";

interface AdminStats {
  total_users: number;
  total_videos: number;
  total_watch_seconds: number;
  total_platform_fees: number;
  total_gross: number;
  total_creator_earnings: number;
  platform_wallet_balance: number;
}

interface VideoRow {
  id: string;
  title: string;
  creator_id: string;
  views: number;
  status: string;
  created_at: string;
  users: { email: string; display_name: string | null; channel_name: string | null } | null;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  channel_name: string | null;
  created_at: string;
  is_admin: boolean;
  is_whitelisted: boolean;
}

interface CreatorRequest {
  id: string;
  user_id: string;
  project_name: string;
  description: string;
  twitter: string | null;
  status: "pending" | "approved" | "rejected" | string;
  users: {
    email: string;
    display_name: string | null;
    channel_name: string | null;
  } | null;
}

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function initials(name: string | null | undefined, fallback: string | null | undefined): string {
  const src = (name || fallback || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Tab = "overview" | "videos" | "users" | "requests";

const TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "videos", label: "Videos", icon: Film },
  { id: "users", label: "Users", icon: UserCog },
  { id: "requests", label: "Requests", icon: Inbox },
];

export default function AdminPage({ userId }: { userId: string }) {
  const router = useRouter();
  console.log("AdminPage userId:", userId);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [deletingVideo, setDeletingVideo] = useState<string | null>(null);
  const [togglingWhitelist, setTogglingWhitelist] = useState<string | null>(null);
  const [requests, setRequests] = useState<CreatorRequest[]>([]);
  const [approvingRequest, setApprovingRequest] = useState<string | null>(null);
  const [walletCopied, setWalletCopied] = useState(false);
  const [videoQuery, setVideoQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const fetchStats = useCallback(async () => {
    console.log("Fetching stats with admin_id:", userId);
    const res = await fetch("/api/admin/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStats(null);
      return;
    }
    setStats(data);
  }, [userId]);

  const fetchVideos = useCallback(async () => {
    const res = await fetch("/api/admin/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setVideos([]);
      return;
    }
    setVideos(data.videos ?? []);
  }, [userId]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setUsers([]);
      return;
    }
    setUsers(data.users ?? []);
  }, [userId]);

  const fetchRequests = useCallback(async () => {
    const res = await fetch("/api/admin/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setRequests([]);
      return;
    }
    setRequests(data.requests ?? []);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchVideos(), fetchUsers(), fetchRequests()]).finally(() => setLoading(false));
  }, [fetchStats, fetchVideos, fetchUsers, fetchRequests]);

  const handleToggleWhitelist = async (targetUserId: string, current: boolean) => {
    setTogglingWhitelist(targetUserId);
    try {
      await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_id: userId,
          user_id: targetUserId,
          is_whitelisted: !current,
        }),
      });
      fetchUsers();
    } finally {
      setTogglingWhitelist(null);
    }
  };

  const handleApproveRequest = async (requestUserId: string, requestId: string) => {
    setApprovingRequest(requestId);
    try {
      await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_id: userId, user_id: requestUserId, is_whitelisted: true }),
      });
      await fetch("/api/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_id: userId, request_id: requestId, status: "approved" }),
      });
      void fetchRequests();
      void fetchUsers();
    } finally {
      setApprovingRequest(null);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm("Delete this video? This cannot be undone.")) return;
    setDeletingVideo(videoId);
    try {
      await fetch("/api/stream/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, admin_id: userId }),
      });
      fetchVideos();
    } finally {
      setDeletingVideo(null);
    }
  };

  const copyWallet = async () => {
    try {
      await navigator.clipboard.writeText("0xfa53779d7cb905489d84f1ab2da309624427cafa");
      setWalletCopied(true);
      setTimeout(() => setWalletCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests],
  );

  const filteredVideos = useMemo(() => {
    const q = videoQuery.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.users?.channel_name?.toLowerCase().includes(q) ||
        v.users?.display_name?.toLowerCase().includes(q) ||
        v.users?.email?.toLowerCase().includes(q),
    );
  }, [videos, videoQuery]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.channel_name?.toLowerCase().includes(q) ||
        u.display_name?.toLowerCase().includes(q),
    );
  }, [users, userQuery]);

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-6 pb-20 pt-2">
        <div className="h-36 w-full animate-pulse rounded-3xl bg-white/[0.03]" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
        <div className="h-64 w-full animate-pulse rounded-3xl bg-white/[0.03]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-4 pb-20 pt-2 sm:px-6">
      {/* HERO HEADER */}
      <div className="relative overflow-hidden rounded-3xl border border-sa-border bg-sa-surface p-6 sm:p-8">
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={goBack}
              aria-label="Go back"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sa-border bg-sa-surface-2/80 text-sa-text-2 backdrop-blur-sm transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: "var(--sa-blue)",
                boxShadow: "0 10px 24px hsla(188, 86%, 50%, 0.3)",
              }}
            >
              <Shield size={26} className="text-black" strokeWidth={2.5} />
            </motion.div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                  Admin Panel
                </h1>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-sa-blue/25 bg-sa-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sa-blue"
                >
                  <Sparkles size={10} />
                  Control Center
                </span>
              </div>
              <p className="text-sm text-sa-text-3">
                Operational metrics, content moderation, and creator access, all in one place.
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-3">
              <div className="hidden flex-col items-end gap-0.5 sm:flex">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-sa-text-3">
                  Platform gross
                </span>
                <span className="font-mono text-xl font-bold text-foreground">
                  ${stats.total_gross.toFixed(2)}
                </span>
              </div>
              <div className="h-10 w-px bg-sa-border hidden sm:block" />
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-sa-text-3">
                  Wallet balance
                </span>
                <span className="font-mono text-xl font-bold text-sa-green">
                  ${stats.platform_wallet_balance.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TAB BAR */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          const showBadge = t.id === "requests" && pendingCount > 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? "border-sa-blue/40 text-foreground shadow-[0_8px_24px_hsla(188,90%,60%,0.18)]"
                  : "border-sa-border text-sa-text-3 hover:border-sa-blue/25 hover:text-foreground"
              }`}
              style={
                isActive
                  ? { background: "hsla(188, 86%, 56%, 0.14)" }
                  : undefined
              }
            >
              {isActive && (
                <motion.span
                  layoutId="admin-tab-glow"
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl"
                  style={{ background: "hsla(188, 86%, 56%, 0.08)" }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                />
              )}
              <t.icon size={15} className={isActive ? "text-sa-blue" : "text-sa-text-3 group-hover:text-sa-blue"} />
              <span className="relative z-10">{t.label}</span>
              {showBadge && (
                <span className="relative z-10 ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sa-red/20 px-1.5 text-[10px] font-bold text-sa-red">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "overview" && stats && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-6"
          >
            {/* KPI GRID */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                label="Total Users"
                value={formatNumber(stats.total_users)}
                icon={Users}
                tone="blue"
                hint="Registered accounts"
              />
              <KpiCard
                label="Total Videos"
                value={formatNumber(stats.total_videos)}
                icon={PlayCircle}
                tone="cyan"
                hint="Published on platform"
              />
              <KpiCard
                label="Watch Time"
                value={formatSeconds(stats.total_watch_seconds)}
                icon={Clock}
                tone="teal"
                hint="All-time across viewers"
              />
              <KpiCard
                label="Total Gross"
                value={`$${stats.total_gross.toFixed(4)}`}
                icon={TrendingUp}
                tone="cyan"
                hint="Sum of all payments"
                mono
              />
              <KpiCard
                label="Creator Earnings"
                value={`$${stats.total_creator_earnings.toFixed(4)}`}
                icon={DollarSign}
                tone="green"
                hint="Net paid to creators"
                mono
              />
              <KpiCard
                label="Platform Fees"
                value={`$${stats.total_platform_fees.toFixed(4)}`}
                icon={Sparkles}
                tone="blue"
                hint="Retained by StreamArc"
                mono
              />
            </div>

            {/* PLATFORM WALLET CARD */}
            <div className="relative overflow-hidden rounded-2xl border border-sa-border bg-sa-surface p-6">
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: "hsl(158 70% 50%)",
                      boxShadow: "0 8px 20px hsla(158, 70%, 50%, 0.3)",
                    }}
                  >
                    <Wallet size={22} className="text-black" strokeWidth={2.5} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-sa-text-3">
                      Platform Wallet
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm text-foreground/90 break-all">
                        0xfa53779d7cb905489d84f1ab2da309624427cafa
                      </p>
                      <button
                        type="button"
                        onClick={copyWallet}
                        aria-label="Copy wallet address"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sa-border text-sa-text-3 transition-colors hover:border-sa-blue/40 hover:text-sa-blue"
                      >
                        {walletCopied ? <Check size={13} className="text-sa-green" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 lg:text-right">
                  <span className="text-xs font-semibold uppercase tracking-widest text-sa-text-3">Balance</span>
                  <span className="font-mono text-3xl font-bold text-sa-green">
                    ${stats.platform_wallet_balance.toFixed(4)}
                  </span>
                  <span className="text-xs font-semibold text-sa-text-3">USDC</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "videos" && (
          <motion.div
            key="videos"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4"
          >
            <SectionToolbar
              title="All Videos"
              count={videos.length}
              query={videoQuery}
              setQuery={setVideoQuery}
              placeholder="Search title or creator..."
            />

            <div className="overflow-hidden rounded-2xl border border-sa-border bg-[hsl(200_45%_6%/0.6)] backdrop-blur-sm">
              {filteredVideos.length === 0 ? (
                <EmptyState
                  icon={Film}
                  message={videos.length === 0 ? "No videos uploaded yet" : "No videos match your search"}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-sa-border bg-white/[0.015]">
                        <Th>Video</Th>
                        <Th>Creator</Th>
                        <Th className="text-right">Views</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVideos.map((v, idx) => {
                        const hue = hashHue(v.id);
                        return (
                          <tr
                            key={v.id}
                            className={`group border-b border-sa-border/40 transition-colors last:border-0 hover:bg-sa-blue/[0.04] ${
                              idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="relative flex h-10 w-[70px] shrink-0 items-center justify-center overflow-hidden rounded-lg"
                                  style={{
                                    background: `hsl(${hue} 60% 22%)`,
                                  }}
                                >
                                  <PlayCircle size={18} className="text-white/70" />
                                </div>
                                <div className="min-w-0 flex-col">
                                  <p className="line-clamp-1 text-sm font-semibold text-foreground">
                                    {v.title}
                                  </p>
                                  <p className="text-[11px] text-sa-text-3">
                                    {new Date(v.created_at).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-sa-text-2">
                                {v.users?.channel_name || v.users?.display_name || v.users?.email || "Unknown"}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-mono text-sm tabular-nums text-foreground">
                                {formatNumber(v.views ?? 0)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <StatusPill status={v.status} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteVideo(v.id)}
                                disabled={deletingVideo === v.id}
                                aria-label="Delete video"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-sa-text-3 opacity-60 transition-all hover:border-sa-red/30 hover:bg-sa-red/10 hover:text-sa-red hover:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                              >
                                {deletingVideo === v.id ? (
                                  <span className="block h-4 w-4 animate-spin rounded-full border-2 border-sa-red border-t-transparent" />
                                ) : (
                                  <Trash2 size={15} />
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "users" && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4"
          >
            <SectionToolbar
              title="All Users"
              count={users.length}
              query={userQuery}
              setQuery={setUserQuery}
              placeholder="Search email or name..."
            />

            <div className="overflow-hidden rounded-2xl border border-sa-border bg-[hsl(200_45%_6%/0.6)] backdrop-blur-sm">
              {filteredUsers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  message={users.length === 0 ? "No users yet" : "No users match your search"}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-sa-border bg-white/[0.015]">
                        <Th>User</Th>
                        <Th>Email</Th>
                        <Th>Joined</Th>
                        <Th>Role</Th>
                        <Th className="text-right">Access</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, idx) => {
                        const hue = hashHue(u.id);
                        const displayName = u.channel_name || u.display_name || "Unnamed";
                        return (
                          <tr
                            key={u.id}
                            className={`border-b border-sa-border/40 transition-colors last:border-0 hover:bg-sa-blue/[0.04] ${
                              idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                  style={{
                                    background: `hsl(${hue} 65% 45%)`,
                                  }}
                                  aria-hidden
                                >
                                  {initials(displayName, u.email)}
                                </div>
                                <span className="text-sm font-medium text-foreground">{displayName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-sa-text-2">{u.email}</td>
                            <td className="px-4 py-3 text-sm text-sa-text-3">
                              {new Date(u.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                  u.is_admin
                                    ? "border-sa-blue/30 bg-sa-blue/10 text-sa-blue"
                                    : "border-sa-border bg-white/[0.02] text-sa-text-3"
                                }`}
                              >
                                {u.is_admin && <Shield size={10} />}
                                {u.is_admin ? "Admin" : "User"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleWhitelist(u.id, u.is_whitelisted ?? false)}
                                disabled={togglingWhitelist === u.id}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 ${
                                  u.is_whitelisted
                                    ? "border-sa-green/30 bg-sa-green/10 text-sa-green hover:border-sa-red/30 hover:bg-sa-red/10 hover:text-sa-red"
                                    : "border-sa-border bg-white/[0.02] text-sa-text-3 hover:border-sa-green/30 hover:bg-sa-green/10 hover:text-sa-green"
                                }`}
                              >
                                {togglingWhitelist === u.id ? (
                                  <span className="block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : u.is_whitelisted ? (
                                  <CheckCircle2 size={12} />
                                ) : null}
                                {togglingWhitelist === u.id
                                  ? "Updating"
                                  : u.is_whitelisted
                                    ? "Whitelisted"
                                    : "Whitelist"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "requests" && (
          <motion.div
            key="requests"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="font-display text-lg font-bold text-foreground">Creator Requests</h2>
                <p className="text-xs text-sa-text-3">
                  {pendingCount} pending · {requests.length} total
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-sa-border bg-[hsl(200_45%_6%/0.6)] backdrop-blur-sm">
              {requests.length === 0 ? (
                <EmptyState icon={Inbox} message="No pending requests" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-sa-border bg-white/[0.015]">
                        <Th>Applicant</Th>
                        <Th>Project</Th>
                        <Th>Description</Th>
                        <Th>X Handle</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Action</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r, idx) => {
                        const hue = hashHue(r.id || r.user_id || "req");
                        const displayName = r.users?.channel_name || r.users?.display_name || "Unknown";
                        return (
                          <tr
                            key={r.id}
                            className={`border-b border-sa-border/40 transition-colors last:border-0 hover:bg-sa-blue/[0.04] ${
                              idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]"
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                  style={{
                                    background: `hsl(${hue} 65% 45%)`,
                                  }}
                                  aria-hidden
                                >
                                  {initials(displayName, r.users?.email)}
                                </div>
                                <div className="flex flex-col">
                                  <p className="text-sm font-medium text-foreground">{displayName}</p>
                                  <p className="text-[11px] text-sa-text-3">{r.users?.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-foreground">{r.project_name}</td>
                            <td className="px-4 py-3">
                              <p className="line-clamp-2 max-w-xs text-sm text-sa-text-2">{r.description}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-sa-text-3">{r.twitter || "—"}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
                                  r.status === "approved"
                                    ? "border-sa-green/30 bg-sa-green/10 text-sa-green"
                                    : r.status === "rejected"
                                      ? "border-sa-red/30 bg-sa-red/10 text-sa-red"
                                      : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {r.status === "pending" ? (
                                <button
                                  type="button"
                                  onClick={() => void handleApproveRequest(r.user_id, r.id)}
                                  disabled={approvingRequest === r.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-sa-green/30 bg-sa-green/10 px-3 py-1.5 text-xs font-semibold text-sa-green transition-all hover:bg-sa-green/20 disabled:opacity-50"
                                >
                                  {approvingRequest === r.id ? (
                                    <span className="block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  ) : (
                                    <CheckCircle2 size={12} />
                                  )}
                                  {approvingRequest === r.id ? "Approving" : "Approve"}
                                </button>
                              ) : (
                                <span className="text-xs text-sa-text-3">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------- Subcomponents ---------------------------- */

type Tone = "blue" | "cyan" | "teal" | "green";

const TONE_MAP: Record<Tone, { solid: string; glow: string; text: string; iconBg: string }> = {
  blue: {
    solid: "hsl(188 86% 56%)",
    glow: "0 8px 18px hsla(188, 86%, 56%, 0.25)",
    text: "text-sa-blue",
    iconBg: "hsl(188 86% 56%)",
  },
  cyan: {
    solid: "hsl(180 70% 65%)",
    glow: "0 8px 18px hsla(180, 70%, 65%, 0.22)",
    text: "text-sa-cyan",
    iconBg: "hsl(180 70% 65%)",
  },
  teal: {
    solid: "hsl(195 80% 50%)",
    glow: "0 8px 18px hsla(195, 80%, 45%, 0.22)",
    text: "text-[hsl(195_85%_65%)]",
    iconBg: "hsl(195 80% 50%)",
  },
  green: {
    solid: "hsl(158 70% 50%)",
    glow: "0 8px 18px hsla(158, 70%, 50%, 0.22)",
    text: "text-sa-green",
    iconBg: "hsl(158 70% 50%)",
  },
};

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  mono,
}: {
  label: string;
  value: string;
  icon: typeof LayoutDashboard;
  tone: Tone;
  hint?: string;
  mono?: boolean;
}) {
  const t = TONE_MAP[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-2xl border border-sa-border bg-[hsl(200_45%_6%/0.6)] p-5 backdrop-blur-sm transition-colors hover:border-sa-blue/30"
    >
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-sa-text-3">
            {label}
          </span>
          <span
            className={`text-2xl font-bold tabular-nums text-foreground ${
              mono ? "font-mono" : "font-display"
            }`}
          >
            {value}
          </span>
          {hint && (
            <span className="text-[11px] text-sa-text-3">{hint}</span>
          )}
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: t.iconBg, boxShadow: t.glow }}
        >
          <Icon size={18} className="text-black" strokeWidth={2.5} />
        </div>
      </div>
    </motion.div>
  );
}

function SectionToolbar({
  title,
  count,
  query,
  setQuery,
  placeholder,
}: {
  title: string;
  count: number;
  query: string;
  setQuery: (q: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        <span className="rounded-full border border-sa-border bg-white/[0.02] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sa-text-3">
          {count}
        </span>
      </div>
      <div className="relative flex w-full max-w-xs items-center">
        <Search size={14} className="pointer-events-none absolute left-3 text-sa-text-3" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-sa-border bg-white/[0.02] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-sa-text-3 outline-none transition-colors focus:border-sa-blue/40 focus:bg-sa-blue/[0.04]"
        />
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-sa-text-3 ${className}`}
    >
      {children}
    </th>
  );
}

function StatusPill({ status }: { status: string }) {
  const live = status === "live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
        live
          ? "border-sa-green/30 bg-sa-green/10 text-sa-green"
          : "border-sa-border bg-white/[0.02] text-sa-text-3"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "bg-sa-green animate-pulse" : "bg-sa-text-3"}`}
      />
      {status}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: typeof LayoutDashboard;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sa-border bg-white/[0.02]">
        <Icon size={22} className="text-sa-text-3" />
      </div>
      <p className="text-sm font-medium text-sa-text-2">{message}</p>
    </div>
  );
}
