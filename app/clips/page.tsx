import AppShell from "@/app/components/layout/AppShell"
import ClipsGrid from "@/app/components/agent/ClipsGrid"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import type { ApiVideoRow } from "@/app/components/browse/VideoShelf"
import { Scissors } from "lucide-react"

// Public browse page for every live agent-generated clip platform-wide. The
// agent's clips are videos rows; we resolve them from the done agent_jobs clip
// mapping and keep only rows that are still status = 'live'.
export const dynamic = "force-dynamic"

export default async function ClipsPage() {
  const supabase = getSupabaseAdmin()

  const { data: jobs } = await supabase.from("agent_jobs").select("clips").eq("status", "done")
  const agentIds = ((jobs ?? []) as Array<{ clips: unknown }>)
    .flatMap((j) => (Array.isArray(j.clips) ? (j.clips as Array<{ video_row_id?: string; status?: string }>) : []))
    .filter((c) => c.status === "approved" && c.video_row_id)
    .map((c) => c.video_row_id!) as string[]

  // Manual clips have no agent_job — resolve them straight from the videos table.
  const { data: manualClipRows } = await supabase.from("videos").select("id").eq("clip_origin", "manual").eq("status", "live")
  const manualIds = ((manualClipRows ?? []) as Array<{ id: string }>).map((r) => r.id)

  const ids = Array.from(new Set([...agentIds, ...manualIds]))

  let rows: ApiVideoRow[] = []
  if (ids.length > 0) {
    const { data } = await supabase
      .from("videos")
      .select(
        "id, title, creator_id, duration_secs, views, rate_per_sec, thumbnail_url, cloudflare_uid, created_at, users!creator_id (id, display_name, channel_name, avatar_url)",
      )
      .in("id", ids)
      .eq("status", "live")
      .order("created_at", { ascending: false })
    rows = (data ?? []) as unknown as ApiVideoRow[]
  }

  return (
    <AppShell currentPage="clips">
      <div className="flex flex-col gap-6 px-4 py-6 sm:px-6">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Scissors size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Agent Clips</h1>
            <p className="text-sm text-sa-text-3">
              Short clips autonomously generated — and paid for per second — by the StreamArc Clip Agent.
            </p>
          </div>
        </header>

        <ClipsGrid rows={rows} />
      </div>
    </AppShell>
  )
}
