import { getAgentStats } from "@/app/lib/agent-stats"
import { Bot, Coins, Zap, Users, Scissors, Gauge, Repeat, Receipt } from "lucide-react"

// Public stats page for the autonomous Clip Agent. No auth — meant to be read
// (and screenshotted) by anyone, judges included.
export const dynamic = "force-dynamic"

const usd = (n: number) => `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

export default async function AgentStatsPage() {
  const s = await getAgentStats()

  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Bot size={18} />
          </span>
          <h1 className="text-xl font-bold">StreamArc Clip Agent</h1>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          An autonomous AI agent that pays creators per second to read their videos, finds the most valuable moments, and
          publishes clips — settling every payment on-chain via Circle Gateway.
        </p>
      </header>

      {/* Hero numbers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Total settled</span>
          <span className="text-3xl font-bold tabular-nums leading-none">{usd(s.total_settled_usdc)}</span>
          <span className="text-xs text-muted-foreground">USDC paid to creators</span>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Payments made</span>
          <span className="text-3xl font-bold tabular-nums leading-none">{s.payments_made}</span>
          <span className="text-xs text-muted-foreground">autonomous on-chain settlements</span>
        </div>
      </div>

      {/* Detailed grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Coins size={14} />}
          label="Avg payment"
          value={usd(s.average_transaction_usdc)}
          sub="per-second micropayment granularity"
        />
        <StatCard icon={<Gauge size={14} />} label="Budget used" value={`${s.budget_utilization_pct}%`} sub="of allocated budgets" />
        <StatCard icon={<Scissors size={14} />} label="Clips created" value={`${s.clips_created}`} sub="published to the platform" />
        <StatCard icon={<Zap size={14} />} label="Cost per clip" value={usd(s.cost_per_clip_usdc)} sub="settled USDC ÷ clips" />
        <StatCard icon={<Users size={14} />} label="Creators paid" value={`${s.distinct_creators_paid}`} sub="distinct recipients" />
        <StatCard icon={<Receipt size={14} />} label="Jobs run" value={`${s.jobs_total}`} sub={statusLine(s.jobs_by_status)} />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Repeat size={13} />
        <span>Live figures, aggregated across all agent jobs and the agent&apos;s settled payments.</span>
      </div>
    </main>
  )
}

function statusLine(byStatus: Record<string, number>): string {
  const parts = Object.entries(byStatus).map(([k, v]) => `${v} ${k}`)
  return parts.length ? parts.join(" · ") : "none yet"
}
