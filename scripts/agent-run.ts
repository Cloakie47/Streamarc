// scripts/agent-run.ts
// Phase 3: thin CLI wrapper over the shared Clip Agent pipeline (lib/agent/
// pipeline.ts) — the same pipeline the worker runs. Streams the decision log
// live, then prints the created clips and the receipt. This DOES create real
// Cloudflare clips + videos rows (Phase 3 productization).
//
//   node scripts/agent-run.ts <videoId> <budgetUsdc>

import "../lib/agent/env.ts"
import { runClipAgent, type DecisionEntry } from "../lib/agent/pipeline.ts"

async function main() {
  const videoId = process.argv[2]
  const budget = Number(process.argv[3])

  if (!videoId || !Number.isFinite(budget) || budget <= 0) {
    throw new Error("Usage: node scripts/agent-run.ts <videoId> <budgetUsdc>  (budget must be a positive number)")
  }

  const onLog = (e: DecisionEntry) =>
    console.log(`  [${e.action}] ${e.reason}${e.cost ? ` (cost ${e.cost.toFixed(6)}, left ${e.budget_remaining.toFixed(6)})` : ""}`)

  const result = await runClipAgent({ videoId, budgetUsdc: budget, onLog })

  console.log("\n=== PROPOSED CLIPS (pending review — nothing created on Cloudflare) ===")
  if (result.clips.length === 0) {
    console.log("(none)")
  } else {
    result.clips.forEach((c, i) => {
      console.log(`\n  Clip ${i + 1}: ${c.suggested_title}  [${c.status}]`)
      console.log(`    Range:      ${c.start}s–${c.end}s (analyzed ${c.analyzed_start}s–${c.analyzed_end}s)`)
      console.log(`    Confidence: ${c.confidence.toFixed(2)}`)
      console.log(`    Hook:       ${c.hook}`)
    })
    console.log("\n  (Approve/edit each in the job view UI to publish.)")
  }

  console.log("\n=== RECEIPT ===")
  console.log(JSON.stringify(result.receipt, null, 2))
}

main().catch((err) => {
  console.error("agent-run failed:", err?.message ?? err)
  process.exit(1)
})
