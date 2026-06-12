// scripts/test-settle.ts
// Phase 1 step 3: settle a real test payment from the agent wallet, then record
// it the way settle-session does (payment_batches + earnings, with
// owner_id ?? creator_id resolution and an idempotency key), and print both tx
// hashes.
//
//   node scripts/test-settle.ts <creatorAddress> [videoId]
//   CREATOR_ADDRESS=0x... VIDEO_ID=... node scripts/test-settle.ts
//
// - 10 seconds at rate 0.001 USDC/s  => 0.01 USDC total (0.008 creator / 0.002 platform).
// - <creatorAddress> is the wallet that receives the creator share.
// - [videoId] (recommended) lets the script attribute earnings to the video's
//   owner_id ?? creator_id so the creator studio reflects the payment. Without
//   it, the on-chain settlement still runs but the DB inserts are skipped
//   (no videos row to attach to / no FK-valid watch_session).

import "../lib/agent/env.ts"
import { randomUUID } from "node:crypto"
import { createGatewayWallet } from "../lib/agent/wallet.ts"
import { settlePerSecond } from "../lib/settle-core/index.ts"
import { getSupabaseAdmin } from "../app/lib/supabase-server.ts"

const AGENT_REF = "clip-agent-001"
const SECONDS = 10
const RATE_PER_SECOND = 0.001

async function main() {
  const creatorAddress = process.argv[2] ?? process.env.CREATOR_ADDRESS
  const videoId = process.argv[3] ?? process.env.VIDEO_ID

  if (!creatorAddress) {
    throw new Error(
      "Provide a creator address: node scripts/test-settle.ts <creatorAddress> [videoId]",
    )
  }

  const supabase = getSupabaseAdmin()

  // --- Agent payer identity ---
  const wallet = await createGatewayWallet(AGENT_REF)
  if (!wallet) throw new Error("Agent Circle wallet not found — run agent-setup first")

  const { data: agentUser, error: agentErr } = await supabase
    .from("users")
    .select("id")
    .eq("circle_wallet_id", wallet.id)
    .maybeSingle()
  if (agentErr) throw new Error(`agent users lookup failed: ${agentErr.message}`)
  if (!agentUser?.id) throw new Error("Agent users row not found — run agent-setup first")
  const viewerId: string = agentUser.id

  // --- Resolve earnings recipient (owner_id ?? creator_id) from the video ---
  let earningsRecipientId: string | null = null
  let resolvedVideoId: string | null = null
  if (videoId) {
    const { data: video, error: videoErr } = await supabase
      .from("videos")
      .select("id, creator_id, owner_id")
      .eq("id", videoId)
      .single()
    if (videoErr || !video) throw new Error(`video ${videoId} not found: ${videoErr?.message ?? "no row"}`)
    resolvedVideoId = video.id
    earningsRecipientId = video.owner_id ?? video.creator_id
  }

  const idempotencyKey = randomUUID()
  console.log("Settling test payment:")
  console.log(
    JSON.stringify(
      {
        payerWalletId: wallet.id,
        payerAddress: wallet.address,
        creatorAddress,
        seconds: SECONDS,
        ratePerSecond: RATE_PER_SECOND,
        videoId: resolvedVideoId,
        earningsRecipientId,
        idempotencyKey,
      },
      null,
      2,
    ),
  )

  // --- Settle on-chain (sign + facilitator.settle x2) ---
  const result = await settlePerSecond({
    payerWalletId: wallet.id,
    payerAddress: wallet.address,
    creatorAddress,
    seconds: SECONDS,
    ratePerSecond: RATE_PER_SECOND,
  })

  console.log("\nSettlement complete:")
  console.log(
    JSON.stringify(
      {
        creator_tx: result.creatorTx,
        platform_tx: result.platformTx,
        amount: result.amount,
        net_to_creator: result.netToCreator,
        platform_fee: result.platformFee,
      },
      null,
      2,
    ),
  )

  // --- Record it the way settle-session does (only when we have a videos row) ---
  if (!resolvedVideoId || !earningsRecipientId) {
    console.warn(
      "\nNo videoId provided — skipping payment_batches/earnings inserts. " +
        "Pass a videoId to attribute earnings so the creator studio reflects the payment.",
    )
    return
  }

  // Idempotency guard: don't double-record the same settled tx.
  const { data: existingBatch } = await supabase
    .from("payment_batches")
    .select("id")
    .eq("circle_transaction_id", result.creatorTx)
    .maybeSingle()
  if (existingBatch?.id) {
    console.log("\nThis settlement is already recorded (batch", existingBatch.id, ") — nothing to insert.")
    return
  }

  // watch_sessions row (FK target for payment_batches; mirrors the viewer flow).
  const { data: session, error: sessionErr } = await supabase
    .from("watch_sessions")
    .insert({ viewer_id: viewerId, video_id: resolvedVideoId, started_at: new Date().toISOString() })
    .select("id")
    .single()
  if (sessionErr || !session) throw new Error(`watch_sessions insert failed: ${sessionErr?.message ?? "no row"}`)

  await supabase
    .from("watch_sessions")
    .update({
      actual_amount: result.amount,
      authorized_amount: result.amount,
      seconds_paid: SECONDS,
      total_cost: result.amount,
    })
    .eq("id", session.id)

  const { data: batch, error: batchErr } = await supabase
    .from("payment_batches")
    .insert({
      session_id: session.id,
      viewer_id: viewerId,
      creator_id: earningsRecipientId,
      video_id: resolvedVideoId,
      amount: result.amount,
      seconds_covered: SECONDS,
      chain: "arcTestnet",
      circle_transaction_id: result.creatorTx,
      status: "settled",
      settled_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (batchErr || !batch) throw new Error(`payment_batches insert failed: ${batchErr?.message ?? "no row"}`)

  const { error: earningsErr } = await supabase.from("earnings").insert({
    creator_id: earningsRecipientId,
    video_id: resolvedVideoId,
    batch_id: batch.id,
    gross_amount: result.amount,
    platform_fee: result.platformFee,
    net_amount: result.netToCreator,
  })
  if (earningsErr) throw new Error(`earnings insert failed: ${earningsErr.message}`)

  console.log("\nRecorded:")
  console.log(
    JSON.stringify(
      { session_id: session.id, batch_id: batch.id, creator_id: earningsRecipientId, video_id: resolvedVideoId },
      null,
      2,
    ),
  )
  console.log("\nThe creator studio earnings for creator_id", earningsRecipientId, "now include this payment.")
}

main().catch((err) => {
  console.error("test-settle failed:", err?.message ?? err)
  process.exit(1)
})
