"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Plus, TrendingUp, Users, Camera, Twitter, MessageCircle, Save, Trash2, Sparkles, X, Film, MoreVertical, Wallet, ArrowRight } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { useCurrentUser } from "@/app/lib/auth-client"
import UploadModal from "@/app/components/studio/UploadModal"
import ChapterEditor from "@/app/components/studio/ChapterEditor"

interface ChartPoint {
  date: string
  amount: number
}

interface EarningsTooltipProps {
  active?: boolean
  payload?: Array<{ payload: ChartPoint }>
}

function EarningsTooltip({ active, payload }: EarningsTooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload
  if (!point) return null
  const date = new Date(point.date + "T00:00:00Z").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  return (
    <div className="panel-muted px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sa-text-3">{date}</p>
      <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-sa-blue">
        ${point.amount.toFixed(4)}
      </p>
    </div>
  )
}

function EarningsChart({ data, loading }: { data: ChartPoint[]; loading: boolean }) {
  const total = data.reduce((sum, d) => sum + d.amount, 0)
  const isEmpty = total === 0
  const fmtAxisDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z")
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  return (
    <div className="panel flex flex-col gap-5 border-t-2 border-t-sa-blue/40 p-6 shadow-[0_0_0_1px_hsla(188,86%,56%,0.04),0_18px_40px_-20px_hsla(188,86%,56%,0.18)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-sa-text-3">
            <TrendingUp size={12} className="text-sa-blue" />
            Total earned · last 30 days
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums text-sa-blue drop-shadow-[0_0_12px_hsla(188,86%,56%,0.35)]">
              ${total.toFixed(4)}
            </span>
            {!isEmpty && (
              <span className="inline-flex items-center gap-1 rounded-md bg-sa-green/10 px-2 py-0.5 text-xs font-bold text-sa-green">
                <TrendingUp size={12} />
                live
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="h-[200px] w-full">
        {loading ? (
          <div className="skeleton-shimmer h-full w-full rounded-lg" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <defs>
                <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(188, 86%, 56%)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="hsl(188, 86%, 56%)" stopOpacity={0} />
                </linearGradient>
                <filter id="earningsGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(value: string, index: number) => {
                  if (index === 0 || index === data.length - 1) return fmtAxisDate(value)
                  return ""
                }}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(198, 14%, 68%)", fontSize: 10 }}
                interval={0}
              />
              <Tooltip
                content={<EarningsTooltip />}
                cursor={{ stroke: "hsla(188, 86%, 56%, 0.25)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="hsl(188, 86%, 56%)"
                strokeWidth={2.25}
                fill="url(#earningsFill)"
                filter="url(#earningsGlow)"
                isAnimationActive={true}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {!loading && isEmpty && (
        <p className="text-center text-sm text-sa-text-3">
          Start earning: share your first video
        </p>
      )}
    </div>
  )
}

interface EarningsStats {
  gateway_balance: number
  total_earned: number
  total_views: number
  avg_watch_seconds: number
  today_earned: number
}

interface VideoRow {
  id: string
  title: string
  created_at: string
  views: number
  avg_watch_seconds: number
  earned: number
  status: string
  cloudflare_uid?: string | null
  chapters?: unknown
  duration_secs?: number | null
  thumbnail_url?: string | null
}

export default function StudioPage() {
  const router = useRouter()
  const [activeNav, setActiveNav] = useState("Dashboard")
  const [stats, setStats] = useState<EarningsStats | null>(null)
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [activeTab, setActiveTab] = useState<"dashboard" | "profile">("dashboard")
  const [displayName, setDisplayName] = useState("")
  const [channelName, setChannelName] = useState("")
  const [bio, setBio] = useState("")
  const [xHandle, setXHandle] = useState("")
  const [redditHandle, setRedditHandle] = useState("")
  const [telegramHandle, setTelegramHandle] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)
  const [chapterEditorVideo, setChapterEditorVideo] = useState<VideoRow | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  // Video pending delete confirmation (renders the centered modal).
  const [deleteTarget, setDeleteTarget] = useState<VideoRow | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const { userId, walletAddress, isLoading } = useCurrentUser()

  useEffect(() => {
    if (!userId) return
    fetchStats()
    fetchVideos()
    fetchProfile()
    fetchChartData()
  }, [userId])


  const fetchStats = async () => {
    if (!userId) return
    try {
      const [balanceRes, earningsRes] = await Promise.all([
        fetch("/api/gateway/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        }),
        fetch("/api/studio/earnings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creator_id: userId }),
        }),
      ])
      const balanceData = await balanceRes.json()
      const earningsData = await earningsRes.json()

      setStats({
        gateway_balance: balanceData.balance ?? 0,
        total_earned: earningsData.total_earned ?? 0,
        total_views: earningsData.total_views ?? 0,
        avg_watch_seconds: earningsData.avg_watch_seconds ?? 0,
        today_earned: earningsData.today_earned ?? 0,
      })
    } catch {
      console.error("Failed to fetch stats")
    } finally {
      setLoading(false)
    }
  }

  const fetchChartData = async () => {
    if (!userId) return
    setChartLoading(true)
    try {
      const res = await fetch("/api/studio/earnings-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_id: userId }),
      })
      const json = await res.json() as { data?: ChartPoint[] }
      setChartData(json.data ?? [])
    } catch {
      setChartData([])
    } finally {
      setChartLoading(false)
    }
  }

  const fetchVideos = async () => {
    if (!userId) return
    try {
      const res = await fetch("/api/studio/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creator_id: userId }),
      })
      const data = await res.json()
      setVideos(data.videos ?? [])
    } catch {
      console.error("Failed to fetch videos")
    }
  }

  useEffect(() => {
    if (!openMenuId) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setOpenMenuId(null)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [openMenuId])

  // Confirmation lives in a centered modal (deleteTarget), not window.confirm.
  const handleDeleteVideo = async (videoId: string) => {
    if (!userId) return
    setDeletingVideoId(videoId)
    try {
      const res = await fetch("/api/stream/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, user_id: userId }),
      })
      if (res.ok) {
        fetchVideos()
        fetchStats()
        window.dispatchEvent(new CustomEvent("streamarc-videos-updated"))
      }
    } catch {
      console.error("Delete failed")
    } finally {
      setDeletingVideoId(null)
      setDeleteTarget(null)
    }
  }

  const fetchProfile = async () => {
    if (!userId) return
    const res = await fetch(`/api/users/profile?user_id=${userId}`)
    if (!res.ok) return
    const data = await res.json()
    setDisplayName(data.display_name ?? "")
    setChannelName(data.channel_name ?? "")
    setBio(data.bio ?? "")
    setXHandle(data.x_handle ?? "")
    setRedditHandle(data.reddit_handle ?? "")
    setTelegramHandle(data.telegram_handle ?? "")
    setAvatarUrl(data.avatar_url ?? "")
  }

  const handleSaveProfile = async () => {
    if (!userId) return
    setSavingProfile(true)
    setProfileError(null)
    try {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          display_name: displayName,
          channel_name: channelName,
          bio,
          x_handle: xHandle,
          reddit_handle: redditHandle,
          telegram_handle: telegramHandle,
        }),
      })
      if (!res.ok) throw new Error("Failed to save")
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    } catch (err: any) {
      setProfileError(err.message)
    } finally {
      setSavingProfile(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("user_id", userId)
      const res = await fetch("/api/users/avatar", { method: "POST", body: formData })
      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()
      setAvatarUrl(data.url)
    } catch (err: any) {
      setProfileError(err.message)
    } finally {
      setUploadingAvatar(false)
    }
  }

  const formatWatchTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const formatAge = (dateStr: string) => {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    return `${days} days ago`
  }

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "No wallet"


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Creator Hub</h1>
          <p className="mt-2 text-sm text-sa-text-3">{shortAddress} · {new Date().toLocaleString("default", { month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-sa-border overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "dashboard" ? "bg-primary text-primary-foreground" : "text-sa-text-3 hover:text-foreground"}`}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "profile" ? "bg-primary text-primary-foreground" : "text-sa-text-3 hover:text-foreground"}`}
            >
              Profile
            </button>
          </div>
          {activeTab === "dashboard" && (
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="btn btn-primary flex gap-2"
            >
              <Plus size={20} />
              Upload Video
            </button>
          )}
        </div>
      </div>

      {activeTab === "dashboard" && (
        <>
          <EarningsChart data={chartData} loading={chartLoading} />

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 animate-pulse glass rounded-sa-card" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  label: "Gateway balance",
                  value: `$${(stats?.gateway_balance ?? 0).toFixed(4)}`,
                  change: stats?.today_earned ? `+$${stats.today_earned.toFixed(4)}` : undefined,
                  isPositive: true,
                },
                {
                  label: "Total earned (net)",
                  value: `$${(stats?.total_earned ?? 0).toFixed(4)}`,
                  change: "after 20% fee",
                  isPositive: true,
                },
                {
                  label: "Total views",
                  value: (stats?.total_views ?? 0).toLocaleString(),
                  change: `${videos.length} video${videos.length !== 1 ? "s" : ""}`,
                  isPositive: true,
                },
                {
                  label: "Avg watch time",
                  value: formatWatchTime(stats?.avg_watch_seconds ?? 0),
                  change: "per session",
                  isPositive: true,
                },
              ].map((m, index) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="glass p-6 rounded-sa-card flex flex-col gap-2 border-t border-white/[0.06] hover-lift"
                    style={{ boxShadow: "0 8px 32px -8px rgba(0,0,0,0.4)" }}
                  >
                    <span className="text-sm text-sa-text-3 font-medium">{m.label}</span>
                    <div className="flex items-end justify-between">
                      <span className={index === 0 ? "text-4xl font-bold text-white soft-stat-shimmer bg-clip-text" : "text-3xl font-bold tracking-tight"}>{m.value}</span>
                      {m.change && (
                        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${
                          m.isPositive ? "bg-sa-green/10 text-sa-green" : "bg-sa-red/10 text-sa-red"
                        }`}>
                          <TrendingUp size={14} className={m.isPositive ? "" : "rotate-180"} />
                          {m.change}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Videos */}
          <div className="glass rounded-sa-card overflow-hidden">
            <div className="flex flex-col gap-1 border-b border-sa-border p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-0.5">
                <h3 className="flex items-center gap-2 font-bold">
                  <Film size={16} className="text-sa-accent" />
                  Videos
                  <span className="text-sm font-normal text-sa-text-3">({videos.length})</span>
                </h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-sa-border/50 text-xs uppercase tracking-wider text-sa-text-3">
                    <th className="px-6 py-3 font-bold">Video</th>
                    <th className="px-6 py-3 font-bold">Views</th>
                    <th className="px-6 py-3 font-bold">Earnings</th>
                    <th className="px-6 py-3 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sa-border/40">
                  {videos.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-sa-surface-2 flex items-center justify-center">
                            <Plus size={28} className="text-sa-text-3" />
                          </div>
                          <p className="text-sm text-sa-text-3">No videos yet</p>
                          <p className="text-xs text-sa-text-3/70">Upload your first demo to start earning per second</p>
                        </div>
                      </td>
                    </tr>
                  ) : videos.map((v) => {
                    // Same thumbnail sources the rest of the app uses: the stored
                    // thumbnail_url, else Cloudflare Stream's generated poster.
                    const thumb =
                      v.thumbnail_url ??
                      (v.cloudflare_uid ? `https://videodelivery.net/${v.cloudflare_uid}/thumbnails/thumbnail.jpg?height=180` : null)
                    return (
                    <tr key={v.id} className="group transition-colors hover:bg-sa-surface">
                      <td className="px-6 py-4">
                        {/* Video area navigates to the watch page (the app's standard
                            /watch/[id] route). Chapters + the actions menu live in
                            their own cell and stop propagation, so they never navigate. */}
                        <div
                          role="link"
                          tabIndex={0}
                          onClick={() => router.push(`/watch/${v.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              router.push(`/watch/${v.id}`)
                            }
                          }}
                          className="-mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.04]"
                          title={`Watch "${v.title}"`}
                        >
                          <div className="aspect-video w-16 shrink-0 overflow-hidden rounded-lg bg-sa-surface-2">
                            {thumb && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt="" width={112} height={63} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="line-clamp-1 text-sm font-medium transition-colors group-hover:text-sa-blue">{v.title}</p>
                            <p className="mt-0.5 text-xs text-sa-text-3">{formatAge(v.created_at)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm tabular-nums">{v.views.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm font-bold tabular-nums text-emerald-400">${v.earned.toFixed(4)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setChapterEditorVideo(v)
                            }}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sa-border bg-sa-surface-2 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                          >
                            <Sparkles size={13} />
                            Chapters
                          </button>
                          <div className="relative" ref={openMenuId === v.id ? menuRef : undefined}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuId((id) => (id === v.id ? null : v.id))
                              }}
                              aria-label="More actions"
                              className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-sa-border bg-sa-surface-2 p-1.5 text-sa-text-3 transition-colors hover:border-sa-border-hover hover:text-foreground"
                            >
                              <MoreVertical size={14} />
                            </button>
                            {openMenuId === v.id && (
                              <div className="absolute right-0 top-9 z-30 min-w-[180px] overflow-hidden rounded-lg border border-sa-border bg-sa-surface py-1 shadow-xl">
                                <button
                                  type="button"
                                  disabled={deletingVideoId === v.id}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuId(null)
                                    setDeleteTarget(v)
                                  }}
                                  className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-60"
                                >
                                  {deletingVideoId === v.id ? (
                                    <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                  Delete video
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Wallet quick-link — withdrawals and external sends now live on the Wallet page */}
          <div className="panel flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sa-blue/30 bg-sa-blue/[0.06] text-sa-blue">
                <Wallet size={18} />
              </div>
              <div className="flex flex-col">
                <h3 className="text-sm font-semibold">Manage payouts</h3>
                <p className="text-xs text-sa-text-3">
                  Manage your wallet, withdraw funds, and send USDC from the Wallet page.
                </p>
              </div>
            </div>
            <Link href="/wallet" className="btn btn-glass btn-sm focus-ring shrink-0">
              Open Wallet
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Recent Activity: full width */}
          <div className="glass p-6 rounded-sa-card flex flex-col gap-4 hover-lift">
            <h3 className="font-bold">Recent Activity</h3>
            <div className="flex flex-col gap-4">
              {videos.length > 0 ? videos.slice(0, 3).map((v) => (
                <div key={v.id} className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-full bg-sa-blue/10 text-sa-blue flex items-center justify-center flex-shrink-0">
                    <Users size={16} />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-xs font-medium"><span className="text-foreground">{v.title}</span></p>
                    <span className="text-[10px] text-sa-text-3">{formatAge(v.created_at)} · {v.views} views</span>
                  </div>
                </div>
              )) : (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="w-12 h-12 rounded-2xl bg-sa-surface-2 flex items-center justify-center">
                    <Users size={24} className="text-sa-text-3" />
                  </div>
                  <p className="text-sm text-sa-text-3">No activity yet</p>
                  <p className="text-xs text-sa-text-3/70">Viewer watch sessions and earnings will appear here</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "profile" && (
        <div className="flex flex-col gap-6 max-w-2xl">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
              <div className="w-20 h-20 rounded-full border-2 border-border overflow-hidden bg-sa-surface flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-primary">
                    {(channelName || displayName || "U").slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Camera size={12} className="text-primary-foreground" />
              </div>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <span className="text-[10px] text-white">...</span>
                </div>
              )}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            <div>
              <p className="text-sm font-medium">{channelName || displayName || "Your channel"}</p>
              <p className="text-xs text-muted-foreground">Click to upload avatar (max 4MB)</p>
            </div>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Display Name</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channel Name</label>
              <input type="text" value={channelName} onChange={e => setChannelName(e.target.value)} placeholder="Your channel name" className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <p className="text-xs text-muted-foreground">Shown on your videos and profile page</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell viewers about yourself..." rows={4} className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
            </div>
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Social Links</label>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Twitter size={16} /></div>
                <input type="text" value={xHandle} onChange={e => setXHandle(e.target.value)} placeholder="X (Twitter) handle" className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><span className="text-xs font-bold">r/</span></div>
                <input type="text" value={redditHandle} onChange={e => setRedditHandle(e.target.value)} placeholder="Reddit username" className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><MessageCircle size={16} /></div>
                <input type="text" value={telegramHandle} onChange={e => setTelegramHandle(e.target.value)} placeholder="Telegram username" className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
          </div>

          {profileError && <p className="text-sm text-destructive">{profileError}</p>}
          {profileSaved && <p className="text-sm text-green-400">Profile saved!</p>}

          <button onClick={handleSaveProfile} disabled={savingProfile} className="btn btn-primary flex items-center gap-2 self-start">
            <Save size={16} />
            {savingProfile ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {showUploadModal && userId && (
        <UploadModal
          userId={userId}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false)
            fetchStats()
            fetchVideos()
          }}
        />
      )}

      {chapterEditorVideo && userId && (
        <ChapterEditor
          videoId={chapterEditorVideo.id}
          videoTitle={chapterEditorVideo.title}
          durationSecs={chapterEditorVideo.duration_secs ?? 0}
          userId={userId}
          existingChapters={
            chapterEditorVideo.chapters
              ? (typeof chapterEditorVideo.chapters === "string"
                  ? (JSON.parse(chapterEditorVideo.chapters) as { time: number; title: string }[])
                  : (chapterEditorVideo.chapters as { time: number; title: string }[]))
              : null
          }
          onClose={() => setChapterEditorVideo(null)}
          onSave={() => void fetchVideos()}
        />
      )}

      {/* Delete confirmation — centered modal overlay, same pattern as the
          Generate Clips modal (fixed inset backdrop + centered card). Backdrop
          click and Cancel dismiss without deleting; Delete is destructive red. */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            if (!deletingVideoId) setDeleteTarget(null)
          }}
        >
          <div
            className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <Trash2 size={18} className="text-red-400" />
              <h2 className="text-lg font-bold">Delete this video?</h2>
            </div>
            <p className="mb-1 line-clamp-2 text-sm font-medium text-foreground">{deleteTarget.title}</p>
            <p className="mb-5 text-xs text-muted-foreground">
              This permanently removes the video for all viewers. It cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingVideoId === deleteTarget.id}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteVideo(deleteTarget.id)}
                disabled={deletingVideoId === deleteTarget.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/90 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
              >
                {deletingVideoId === deleteTarget.id ? (
                  <>
                    <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={15} />
                    Delete video
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
