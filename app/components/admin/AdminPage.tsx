"use client"

import { useState, useEffect } from "react"

interface AdminStats {
  total_users: number
  total_platform_fees: number
  total_gross_volume: number
  total_sessions: number
}

interface User {
  id: string
  email: string
  wallet_address: string | null
  gateway_balance: number
  created_at: string
}

interface Earning {
  id: string
  creator_id: string
  gross_amount: number
  platform_fee: number
  net_amount: number
  created_at: string
}

interface Session {
  id: string
  viewer_id: string
  creator_id: string
  seconds_watched: number
  total_cost: number
  settled: boolean
  created_at: string
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [earnings, setEarnings] = useState<Earning[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "earnings" | "sessions">("overview")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(data => {
        setStats(data.stats)
        setUsers(data.users)
        setEarnings(data.earnings)
        setSessions(data.sessions)
        console.log("Sessions:", data.sessions)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (d: string) => new Date(d).toLocaleString()
  const shortId = (id: string) => id.slice(0, 8) + "..."

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--sa-bg)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--sa-bg)] p-8 text-[var(--sa-text)]">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="mt-1 text-sm text-[var(--sa-text-3)]">StreamArc platform overview</p>
          </div>
          <a href="/" className="text-sm text-[var(--sa-text-3)] hover:text-[var(--sa-text)]">← Back to app</a>
        </div>

        {/* Stats cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total users", value: stats?.total_users ?? 0 },
            { label: "Gross volume", value: `$${(stats?.total_gross_volume ?? 0).toFixed(4)}` },
            { label: "Platform fees", value: `$${(stats?.total_platform_fees ?? 0).toFixed(4)}` },
            { label: "Total sessions", value: stats?.total_sessions ?? 0 },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-[var(--sa-border-light)] bg-[var(--sa-surface)] p-5">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[var(--sa-text-3)]">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          {(["overview", "users", "earnings", "sessions"] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="cursor-pointer rounded-lg border-none px-4 py-2 text-sm font-medium capitalize transition-colors"
              style={{
                background: activeTab === tab ? "hsl(var(--primary))" : "hsl(var(--secondary))",
                color: activeTab === tab ? "white" : "hsl(var(--muted-foreground))",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {activeTab === "users" && (
          <div className="overflow-hidden rounded-xl border border-[var(--sa-border-light)] bg-[var(--sa-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--sa-border-light)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--sa-text-3)]">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--sa-text-3)]">Wallet</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Gateway balance</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-white/[0.04] last:border-none hover:bg-white/[0.02]">
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--sa-text-3)]">
                      {u.wallet_address ? `${u.wallet_address.slice(0, 8)}...${u.wallet_address.slice(-4)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">${parseFloat(String(u.gateway_balance ?? "0")).toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--sa-text-3)]">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Earnings tab */}
        {activeTab === "earnings" && (
          <div className="overflow-hidden rounded-xl border border-[var(--sa-border-light)] bg-[var(--sa-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--sa-border-light)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--sa-text-3)]">Creator</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Gross</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Platform fee</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Net</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Time</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map(e => (
                  <tr key={e.id} className="border-b border-white/[0.04] last:border-none hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--sa-text-3)]">{shortId(e.creator_id)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">${parseFloat(String(e.gross_amount ?? "0")).toFixed(6)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-400">${parseFloat(String(e.platform_fee ?? "0")).toFixed(6)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-400">${parseFloat(String(e.net_amount ?? "0")).toFixed(6)}</td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--sa-text-3)]">{formatDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sessions tab */}
        {activeTab === "sessions" && (
          <div className="overflow-hidden rounded-xl border border-[var(--sa-border-light)] bg-[var(--sa-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--sa-border-light)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--sa-text-3)]">Viewer</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--sa-text-3)]">Creator</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Seconds</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Cost</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Settled</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--sa-text-3)]">Time</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b border-white/[0.04] last:border-none hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-mono text-xs text-[var(--sa-text-3)]">{shortId(s.viewer_id)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--sa-text-3)]">{shortId(s.creator_id)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.seconds_watched}s</td>
                    <td className="px-4 py-3 text-right tabular-nums">${parseFloat(String(s.total_cost ?? "0")).toFixed(6)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-medium ${s.settled ? "text-green-400" : "text-yellow-400"}`}>
                        {s.settled ? "✓" : "pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-[var(--sa-text-3)]">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Overview tab */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--sa-border-light)] bg-[var(--sa-surface)] p-6">
              <h3 className="mb-4 font-bold">Platform wallet</h3>
              <p className="font-mono text-sm text-[var(--sa-text-3)]">{process.env.NEXT_PUBLIC_PLATFORM_WALLET ?? "0x32b338509bc2c15420d54105304f4aacf4a85392"}</p>
              <p className="mt-2 text-xs text-[var(--sa-text-3)]">Withdrawal via Circle transfer endpoint — pending Circle team call</p>
            </div>
            <div className="rounded-xl border border-[var(--sa-border-light)] bg-[var(--sa-surface)] p-6">
              <h3 className="mb-2 font-bold">Recent activity</h3>
              <p className="text-sm text-[var(--sa-text-3)]">{stats?.total_sessions} sessions · ${(stats?.total_gross_volume ?? 0).toFixed(4)} total volume · ${(stats?.total_platform_fees ?? 0).toFixed(4)} platform fees collected</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
