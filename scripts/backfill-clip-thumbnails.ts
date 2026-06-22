// scripts/backfill-clip-thumbnails.ts
// One-off: give EXISTING clips a representative poster. For every clip video
// (agent-created — referenced by agent_jobs.clips — or manual, clip_origin =
// 'manual'), set Cloudflare thumbnailTimestampPct=0.5 (a frame from the clip's
// midpoint) and point videos.thumbnail_url at the resulting still. Idempotent —
// safe to re-run.
//
//   node scripts/backfill-clip-thumbnails.ts

import "../lib/agent/env.ts"
import { getSupabaseAdmin } from "../app/lib/supabase-server.ts"
import { setClipThumbnail } from "../lib/agent/clip.ts"

async function main() {
  const supabase = getSupabaseAdmin()
  const ids = new Set<string>()

  // Agent clips: approved video_row_ids inside done jobs' clips jsonb.
  const { data: jobs } = await supabase.from("agent_jobs").select("clips").eq("status", "done")
  for (const j of (jobs ?? []) as Array<{ clips: unknown }>) {
    if (!Array.isArray(j.clips)) continue
    for (const c of j.clips as Array<{ video_row_id?: string; status?: string }>) {
      if (c.status === "approved" && c.video_row_id) ids.add(c.video_row_id)
    }
  }

  // Manual clips.
  const { data: manual } = await supabase.from("videos").select("id").eq("clip_origin", "manual")
  for (const m of (manual ?? []) as Array<{ id: string }>) ids.add(m.id)

  if (ids.size === 0) {
    console.log("No clip videos found.")
    return
  }

  const { data: rows } = await supabase
    .from("videos")
    .select("id, cloudflare_uid")
    .in("id", Array.from(ids))
    .eq("status", "live")

  let ok = 0
  let failed = 0
  for (const r of (rows ?? []) as Array<{ id: string; cloudflare_uid: string | null }>) {
    if (!r.cloudflare_uid) continue
    try {
      await setClipThumbnail(r.cloudflare_uid, 0.5)
      await supabase
        .from("videos")
        .update({ thumbnail_url: `https://videodelivery.net/${r.cloudflare_uid}/thumbnails/thumbnail.jpg` })
        .eq("id", r.id)
      ok++
      console.log(`✓ ${r.id} (${r.cloudflare_uid})`)
    } catch (e) {
      failed++
      console.warn(`✗ ${r.id} (${r.cloudflare_uid}):`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`\nDone. ${ok} updated, ${failed} failed, ${ids.size} clip id(s) considered.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
