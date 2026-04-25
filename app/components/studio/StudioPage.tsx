"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion } from "motion/react"
import { Plus, TrendingUp, Users, Camera, Twitter, MessageCircle, Save, Trash2, Sparkles, Tag, Check, X, Clock } from "lucide-react"
import { useCurrentUser } from "@/app/lib/auth-client"
import UploadModal from "@/app/components/studio/UploadModal"
import ChapterEditor from "@/app/components/studio/ChapterEditor"

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
  accepts_offers?: boolean
  is_sold?: boolean
  is_owned?: boolean
  owner_id?: string | null
}

export default function StudioPage() {
  const [activeNav, setActiveNav] = useState("Dashboard")
  const [stats, setStats] = useState<EarningsStats | null>(null)
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [ownedVideos, setOwnedVideos] = useState<VideoRow[]>([])
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [withdrawSuccess, setWithdrawSuccess] = useState(false)
  const [withdrawTxId, setWithdrawTxId] = useState<string | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [loading, setLoading] = useState(true)
  const [externalAddress, setExternalAddress] = useState("")
  const [externalAmount, setExternalAmount] = useState("")
  const [sendingExternal, setSendingExternal] = useState(false)
  const [externalError, setExternalError] = useState<string | null>(null)
  const [externalSuccess, setExternalSuccess] = useState(false)
  const [externalTxHash, setExternalTxHash] = useState<string | null>(null)
  const [circleWalletBalance, setCircleWalletBalance] = useState<number | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showWLModal, setShowWLModal] = useState(false)
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
  const [allOffers, setAllOffers] = useState<any[]>([])
  const [acceptingOffer, setAcceptingOffer] = useState<string | null>(null)
  const [togglingOffers, setTogglingOffers] = useState<string | null>(null)
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null)
  const [requestForm, setRequestForm] = useState({ project_name: "", description: "", twitter: "" })
  const [submittingRequest, setSubmittingRequest] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [existingRequest, setExistingRequest] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const { userId, walletAddress, isLoading } = useCurrentUser()

  useEffect(() => {
    if (!userId) return
    fetchStats()
    fetchVideos()
    fetchProfile()
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetch(`/api/users/profile?user_id=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => setIsWhitelisted(data.is_whitelisted ?? false))
      .catch(() => setIsWhitelisted(false))
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetch("/api/whitelist-request/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
      .then((r) => r.json())
      .then((data: { status?: string | null }) => {
        if (data.status === "pending" || data.status === "approved") {
          setExistingRequest(true)
        }
      })
      .catch(() => {})
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
      setCircleWalletBalance(balanceData.wallet_balance ?? 0)
    } catch {
      console.error("Failed to fetch stats")
    } finally {
      setLoading(false)
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
      setOwnedVideos(data.owned_videos ?? [])
    } catch {
      console.error("Failed to fetch videos")
    }
  }

  const fetchAllOffers = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_all", owner_id: userId }),
      })
      const data = await res.json()
      setAllOffers(data.offers ?? [])
    } catch {
      console.error("Failed to fetch offers")
    }
  }, [userId])

  const handleToggleOffers = async (videoId: string) => {
    if (!userId) return
    setTogglingOffers(videoId)
    try {
      await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", video_id: videoId, owner_id: userId }),
      })
      fetchVideos()
    } finally {
      setTogglingOffers(null)
    }
  }

  const handleAcceptOffer = async (offerId: string, videoId: string) => {
    if (!userId) return
    if (!confirm("Accept this offer? This will transfer ownership immediately and cannot be undone.")) return
    setAcceptingOffer(offerId)
    try {
      const res = await fetch("/api/offers/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId, owner_id: userId }),
      })
      const data = await res.json()
      if (res.ok) {
        fetchVideos()
        fetchAllOffers()
      } else {
        alert(data.error ?? "Failed to accept offer")
      }
    } finally {
      setAcceptingOffer(null)
    }
  }

  const handleDeclineOffer = async (offerId: string, _videoId: string) => {
    if (!userId) return
    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline", offer_id: offerId, owner_id: userId }),
    })
    if (res.ok) {
      void fetchAllOffers()
    }
  }

  useEffect(() => {
    void fetchAllOffers()
  }, [fetchAllOffers])

  const handleDeleteVideo = async (videoId: string) => {
    if (!userId) return
    if (!confirm("Are you sure you want to delete this video? This cannot be undone.")) return
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

  const handleWithdraw = async () => {
    if (!userId || !stats?.gateway_balance) return
    setWithdrawing(true)
    setWithdrawError(null)
    setWithdrawSuccess(false)
    setWithdrawTxId(null)
    try {
      const amount = withdrawAmount ? parseFloat(withdrawAmount) : stats.gateway_balance
      const res = await fetch("/api/gateway/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          amount: amount.toFixed(6),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWithdrawError(data.error)
      } else {
        setWithdrawSuccess(true)
        setWithdrawTxId(data.tx_hash ?? data.transaction_id ?? null)
        setWithdrawAmount("")
        await fetchStats()
        setTimeout(() => {
          setWithdrawSuccess(false)
          setWithdrawTxId(null)
        }, 10000)
      }
    } catch {
      setWithdrawError("Withdrawal failed")
    } finally {
      setWithdrawing(false)
    }
  }

  const handleSendExternal = async () => {
    if (!userId || !externalAddress || !externalAmount) return
    setSendingExternal(true)
    setExternalError(null)
    setExternalSuccess(false)
    setExternalTxHash(null)
    try {
      const res = await fetch("/api/gateway/send-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          destination_address: externalAddress,
          amount: externalAmount,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setExternalError(data.error)
      } else {
        setExternalSuccess(true)
        setExternalTxHash(data.tx_hash ?? null)
        setExternalAddress("")
        setExternalAmount("")
        await fetchStats()
        setTimeout(() => {
          setExternalSuccess(false)
          setExternalTxHash(null)
        }, 10000)
      }
    } catch {
      setExternalError("Send failed")
    } finally {
      setSendingExternal(false)
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

  const handleWhitelistRequest = async () => {
    if (!userId || !requestForm.project_name.trim()) return
    setSubmittingRequest(true)
    setRequestError(null)
    try {
      const res = await fetch("/api/whitelist-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, ...requestForm }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        const err = data.error ?? ""
        const e = err.toLowerCase()
        if (e.includes("pending") || e.includes("already have")) {
          setExistingRequest(true)
        } else {
          setRequestError(err || "Request failed")
        }
      } else {
        setRequestSent(true)
      }
    } finally {
      setSubmittingRequest(false)
    }
  }

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
              onClick={() => {
                if (!isWhitelisted) {
                  setShowWLModal(true)
                } else {
                  setShowUploadModal(true)
                }
              }}
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

          {/* Recent Videos: full width */}
          <div className="glass rounded-sa-card overflow-hidden">
            <div className="p-6 border-b border-sa-border flex items-center justify-between">
              <h3 className="font-bold">Recent Videos</h3>
              <button type="button" className="text-sm text-sa-accent font-medium hover:underline cursor-pointer bg-transparent border-none">View all</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-sa-text-3 uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Video</th>
                    <th className="px-6 py-4 font-bold">Status</th>
                    <th className="px-6 py-4 font-bold">Views</th>
                    <th className="px-6 py-4 font-bold">Revenue</th>
                    <th className="px-6 py-4 font-bold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sa-border">
                  {videos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-14 h-14 rounded-2xl bg-sa-surface-2 flex items-center justify-center">
                            <Plus size={28} className="text-sa-text-3" />
                          </div>
                          <p className="text-sm text-sa-text-3">No videos yet</p>
                          <p className="text-xs text-sa-text-3/70">Upload your first demo to start earning per second</p>
                        </div>
                      </td>
                    </tr>
                  ) : videos.map((v) => (
                    <tr key={v.id} className="hover:bg-sa-surface transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 aspect-video rounded-lg overflow-hidden glass bg-sa-surface-2" />
                          <div>
                            <span className="text-sm font-medium line-clamp-1">{v.title}</span>
                            <span className="block mt-0.5 text-xs text-sa-text-3">{formatAge(v.created_at)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs ${
                            v.is_sold
                              ? "border-muted/20 bg-muted/10 text-muted-foreground"
                              : "border-green-500/20 bg-green-500/10 text-green-400"
                          }`}
                        >
                          {v.is_sold ? "Sold" : v.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm tabular-nums">{v.views.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm font-bold tabular-nums text-emerald-400">${v.earned.toFixed(4)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setChapterEditorVideo(v)}
                            title="Edit chapters"
                            className="p-2 rounded-lg hover:bg-primary/10 text-sa-text-3 hover:text-primary opacity-0 group-hover:opacity-100 transition-all cursor-pointer bg-transparent border-none"
                          >
                            <Sparkles size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleToggleOffers(v.id)
                            }}
                            disabled={togglingOffers === v.id}
                            title={v.accepts_offers ? "Stop accepting offers" : "Accept offers"}
                            className={`p-2 rounded-lg transition-all cursor-pointer bg-transparent border-none opacity-0 group-hover:opacity-100 ${
                              v.accepts_offers
                                ? "text-sa-accent hover:bg-sa-accent/10"
                                : "text-sa-text-3 hover:bg-white/5"
                            }`}
                          >
                            <Tag size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVideo(v.id)}
                            disabled={deletingVideoId === v.id}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-sa-text-3 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer bg-transparent border-none disabled:opacity-50"
                          >
                            {deletingVideoId === v.id ? (
                              <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin block" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {ownedVideos.length > 0 && (
            <div className="mt-8 flex flex-col gap-4">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Tag size={18} className="text-sa-accent" />
                My Portfolio
                <span className="text-sm font-normal text-muted-foreground">({ownedVideos.length} owned)</span>
              </h2>
              <div className="panel overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-sa-border">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">Video</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">Views</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">Earnings</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {ownedVideos.map((v) => (
                      <tr key={v.id} className="group border-b border-sa-border/50 transition-colors last:border-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <p className="line-clamp-1 text-sm font-medium">{v.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Owned · {new Date(v.created_at).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm">{v.views ?? 0}</td>
                        <td className="px-4 py-3 font-mono text-sm text-sa-accent">${(v.earned ?? 0).toFixed(4)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full border border-sa-accent/20 bg-sa-accent/10 px-2 py-1 text-xs text-sa-accent">
                            Owned
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void handleToggleOffers(v.id)}
                              disabled={togglingOffers === v.id}
                              title={v.accepts_offers ? "Stop accepting offers" : "Accept offers"}
                              className={`cursor-pointer rounded-lg border-none bg-transparent p-2 transition-all opacity-0 group-hover:opacity-100 ${
                                v.accepts_offers
                                  ? "text-sa-accent hover:bg-sa-accent/10"
                                  : "text-sa-text-3 hover:bg-white/5"
                              }`}
                            >
                              <Tag size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setChapterEditorVideo(v)}
                              title="Edit chapters"
                              className="cursor-pointer rounded-lg border-none bg-transparent p-2 text-sa-text-3 opacity-0 transition-all hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                            >
                              <Sparkles size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVideo(v.id)}
                              disabled={deletingVideoId === v.id}
                              className="cursor-pointer rounded-lg border-none bg-transparent p-2 text-sa-text-3 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                            >
                              {deletingVideoId === v.id ? (
                                <span className="block h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {allOffers.length > 0 && (
            <div className="mt-8 flex flex-col gap-4">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Tag size={18} className="text-sa-accent" />
                Offers Inbox
                <span className="text-sm font-normal text-muted-foreground">({allOffers.length} pending)</span>
              </h2>
              <div className="panel overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-sa-border">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">Video</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">From</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-sa-text-3">Time</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {allOffers.map((offer: any) => {
                      const rawU = offer.users
                      const u = Array.isArray(rawU) ? rawU[0] : rawU
                      const name = u?.channel_name || u?.display_name || "Anonymous"
                      const rawV = offer.videos
                      const vrow = Array.isArray(rawV) ? rawV[0] : rawV
                      const videoTitle = vrow?.title || "Unknown video"
                      const ago = Math.floor((Date.now() - new Date(offer.created_at).getTime()) / 60000)
                      const timeAgo =
                        ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago / 60)}h ago` : `${Math.floor(ago / 1440)}d ago`
                      return (
                        <tr key={offer.id} className="border-b border-sa-border/50 transition-colors last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <p className="line-clamp-1 text-sm font-medium">{videoTitle}</p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {name.slice(0, 1).toUpperCase()}
                              </div>
                              <span className="text-sm">{name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-sa-accent">${parseFloat(offer.amount).toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleAcceptOffer(offer.id, offer.video_id)}
                                disabled={acceptingOffer === offer.id}
                                className="flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Check size={12} />
                                {acceptingOffer === offer.id ? "Accepting..." : "Accept"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeclineOffer(offer.id, offer.video_id)}
                                className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                              >
                                <X size={12} />
                                Decline
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Withdraw + Send External: side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass p-8 rounded-sa-card bg-sa-accent/[0.08] border-sa-accent/30 flex flex-col gap-6 hover-lift">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-sa-text-3">Available for withdrawal</span>
                <h2 className="text-4xl font-bold tracking-tight">${(stats?.gateway_balance ?? 0).toFixed(4)}</h2>
              </div>
              <div className="flex flex-col gap-3">
                <input
                  type="number"
                  min="0.000001"
                  step="0.0001"
                  placeholder={`Min $0.10 · Max $${(stats?.gateway_balance ?? 0).toFixed(4)}`}
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-sa-surface-2 px-4 py-3 text-sm text-foreground outline-none focus:border-sa-accent/50 transition-all placeholder:text-sa-text-3"
                />
                {withdrawError && <p className="text-xs text-sa-red">{withdrawError}</p>}
                {withdrawSuccess && (
                  <div className="space-y-1">
                    <p className="text-xs text-sa-green">Withdrawal successful!</p>
                    {withdrawTxId && (
                      <a
                        href={`https://testnet.arcscan.app/tx/${withdrawTxId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
                      >
                        {withdrawTxId.slice(0, 16)}...{withdrawTxId.slice(-8)}
                      </a>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={
                    withdrawing ||
                    !withdrawAmount ||
                    parseFloat(withdrawAmount) < 0.10 ||
                    (stats?.gateway_balance ?? 0) <= 0
                  }
                  className="btn btn-accent w-full disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {withdrawing ? (
                    <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Withdrawing...</>
                  ) : withdrawAmount ? (
                    `Withdraw $${parseFloat(withdrawAmount).toFixed(4)}`
                  ) : (
                    "Enter amount to withdraw"
                  )}
                </button>
                <p className="text-[10px] text-sa-text-3 text-center">
                  Withdrawals are processed instantly via Circle Payouts.
                </p>
              </div>
            </div>

            <div className="glass p-8 rounded-sa-card flex flex-col gap-4 hover-lift">
              <h3 className="font-bold">Send to external wallet</h3>
              <p className="text-xs text-sa-text-3">
                Send USDC from your Circle wallet to any external address
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-sa-text-3">Circle wallet balance</span>
                <span className="tabular-nums font-medium">${(circleWalletBalance ?? 0).toFixed(4)}</span>
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Destination address (0x...)"
                  value={externalAddress}
                  onChange={e => setExternalAddress(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-sa-surface-2 px-4 py-3 text-sm text-foreground outline-none focus:border-sa-accent/50 transition-all placeholder:text-sa-text-3"
                />
                <input
                  type="number"
                  min="0.000001"
                  step="0.0001"
                  placeholder="Amount USDC"
                  value={externalAmount}
                  onChange={e => setExternalAmount(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-sa-surface-2 px-4 py-3 text-sm text-foreground outline-none focus:border-sa-accent/50 transition-all placeholder:text-sa-text-3"
                />
              </div>
              {externalError && <p className="text-xs text-sa-red">{externalError}</p>}
              {externalSuccess && (
                <div className="space-y-1">
                  <p className="text-xs text-sa-green">Sent successfully!</p>
                  {externalTxHash && (
                    <a
                      href={`https://testnet.arcscan.app/tx/${externalTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
                    >
                      {externalTxHash.slice(0, 16)}...{externalTxHash.slice(-8)}
                    </a>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={handleSendExternal}
                disabled={sendingExternal || !externalAddress || !externalAmount || (circleWalletBalance ?? 0) <= 0}
                className="btn btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {sendingExternal ? (
                  <><span className="h-3 w-3 animate-spin rounded-full border-2 border-black/40 border-t-transparent" /> Sending...</>
                ) : "Send USDC"}
              </button>
            </div>
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

      {showWLModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowWLModal(false)}
        >
          <div
            className="relative mx-4 flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowWLModal(false)}
              className="absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 transition-colors hover:bg-white/10"
            >
              <X size={18} />
            </button>

            {!requestSent && !existingRequest ? (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-bold">Apply for creator access</h2>
                  <p className="text-sm text-muted-foreground">
                    StreamArc is in private beta. Tell us about your project to get early creator access.
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Project or channel name"
                  value={requestForm.project_name}
                  onChange={(e) => setRequestForm((p) => ({ ...p, project_name: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <textarea
                  placeholder="What will you post on StreamArc? (demos, tutorials, updates...)"
                  value={requestForm.description}
                  onChange={(e) => setRequestForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <input
                  type="text"
                  placeholder="X (Twitter) handle — optional"
                  value={requestForm.twitter}
                  onChange={(e) => setRequestForm((p) => ({ ...p, twitter: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {requestError && <p className="text-xs text-destructive">{requestError}</p>}
                <button
                  type="button"
                  onClick={handleWhitelistRequest}
                  disabled={submittingRequest || !requestForm.project_name.trim()}
                  className="btn btn-primary w-full disabled:opacity-50"
                >
                  {submittingRequest ? "Submitting..." : "Request creator access"}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                  <Clock size={24} className="text-amber-400" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Creator application pending</p>
                  <p className="text-sm text-muted-foreground">
                    We review applications personally and will notify you when approved. Thank you for your patience.
                  </p>
                </div>
                <button type="button" onClick={() => setShowWLModal(false)} className="btn btn-glass w-full">
                  Got it
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
