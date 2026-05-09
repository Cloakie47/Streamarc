import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server"
import { getWalletIdByAddress, signTypedDataWithWallet } from "@/app/lib/circle-wallets"

const facilitator = new BatchFacilitatorClient()

const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
const CHAIN_ID = 5042002

function randomNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function getEarningsRecipientWallet(videoId: string, creatorId: string): Promise<{ wallet: string | null, recipientId: string }> {
  const { data: video } = await getSupabaseAdmin()
    .from("videos")
    .select("owner_id")
    .eq("id", videoId)
    .single()

  const recipientId = video?.owner_id ?? creatorId

  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("wallet_address")
    .eq("id", recipientId)
    .single()

  return { wallet: data?.wallet_address ?? null, recipientId }
}

export async function POST(req: NextRequest) {
  try {
    const { session_id, viewer_id, creator_id, video_id, seconds_watched } = await req.json()

    const { data: session } = await getSupabaseAdmin()
      .from("watch_sessions")
      .select("id, settled")
      .eq("id", session_id)
      .eq("viewer_id", viewer_id)
      .single()

    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 403 })
    }

    if (!seconds_watched || seconds_watched <= 0) {
      await getSupabaseAdmin().from("watch_sessions").update({ settled: true }).eq("id", session_id)
      return NextResponse.json({ success: true, amount: 0 })
    }

    const { data: viewer } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", viewer_id)
      .single()

    const supabase = getSupabaseAdmin()
    const { data: video } = await supabase
      .from("videos")
      .select("rate_per_sec")
      .eq("id", video_id)
      .single()

    const ratePerSecond = video?.rate_per_sec ?? 0.00005
    const actualAmount = seconds_watched * ratePerSecond

    if (!viewer?.wallet_address) {
      return NextResponse.json({ error: "Viewer wallet not found" }, { status: 400 })
    }

    const viewerWalletId =
      viewer.circle_wallet_id ?? (await getWalletIdByAddress(viewer.wallet_address))
    if (!viewerWalletId) {
      return NextResponse.json({ error: "Viewer Circle wallet not found" }, { status: 400 })
    }

    const { wallet: creatorWallet, recipientId: earningsRecipientId } = await getEarningsRecipientWallet(video_id, creator_id)
    if (!creatorWallet) {
      return NextResponse.json({ error: "Earnings recipient wallet not found" }, { status: 400 })
    }

    const platformWallet = "0xfa53779d7cb905489d84f1ab2da309624427cafa"

    const creatorAmountIn6Dec = Math.round(actualAmount * 0.80 * 1e6).toString()
    const platformAmountIn6Dec = Math.round(actualAmount * 0.20 * 1e6).toString()

    const creatorNonce = randomNonce()
    const platformNonce = randomNonce()
    const now = Math.floor(Date.now() / 1000)
    const validBefore = (now + 345600).toString()

    // Check nonce collision
    const { data: existingNonce } = await getSupabaseAdmin()
      .from("used_nonces")
      .select("nonce")
      .eq("nonce", creatorNonce)
      .maybeSingle()

    if (existingNonce) {
      return NextResponse.json({ error: "Nonce collision, retry" }, { status: 400 })
    }

    // Reserve both nonces
    await getSupabaseAdmin().from("used_nonces").insert([
      { nonce: creatorNonce, viewer_id },
      { nonce: platformNonce, viewer_id },
    ])

    const domain = {
      name: "GatewayWalletBatched",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: GATEWAY_WALLET,
    }

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    }

    console.log("Signing with:", {
      viewerWalletId,
      circleWalletId: viewer.circle_wallet_id,
      from: viewer.wallet_address, // EOA address â€” owns Gateway balance
    })

    // Sign for creator (80%)
    const creatorSignature = await signTypedDataWithWallet(
      viewerWalletId,
      domain,
      types,
      "TransferWithAuthorization",
      {
        from: viewer.wallet_address, // EOA address â€” owns Gateway balance
        to: creatorWallet,
        value: creatorAmountIn6Dec,
        validAfter: (now - 600).toString(),
        validBefore,
        nonce: creatorNonce,
      },
    )

    // Sign for platform (20%)
    const platformSignature = await signTypedDataWithWallet(
      viewerWalletId,
      domain,
      types,
      "TransferWithAuthorization",
      {
        from: viewer.wallet_address, // EOA address â€” owns Gateway balance
        to: platformWallet,
        value: platformAmountIn6Dec,
        validAfter: (now - 600).toString(),
        validBefore,
        nonce: platformNonce,
      },
    )

    if (!creatorSignature || !platformSignature) {
      return NextResponse.json({ error: "Failed to sign payment" }, { status: 500 })
    }

    console.log("Signatures generated:", { creatorAmountIn6Dec, platformAmountIn6Dec })

    const buildPayload = (to: string, amount: string, sig: string, nonce: string) => ({
      x402Version: 2,
      scheme: "exact",
      network: "eip155:5042002",
      resource: { url: "https://streamarc.app/watch", description: "StreamArc video", mimeType: "application/json" },
      accepted: {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:5042002",
        asset: USDC_ADDRESS,
        amount,
        payTo: to,
        maxTimeoutSeconds: 345600,
        extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
      },
      payload: {
        signature: sig,
        authorization: {
          from: viewer.wallet_address, // EOA address â€” owns Gateway balance
          to,
          value: amount,
          validAfter: (now - 600).toString(),
          validBefore,
          nonce,
        },
      },
    })

    const buildRequirements = (to: string, amount: string) => ({
      scheme: "exact",
      network: "eip155:5042002",
      amount,
      maxAmountRequired: amount,
      resource: "https://streamarc.app/watch",
      description: "StreamArc pay-per-second video",
      mimeType: "application/json",
      payTo: to,
      maxTimeoutSeconds: 345600,
      asset: USDC_ADDRESS,
      extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
    })

    // Settle creator payment (80%)
    const creatorResult = await facilitator.settle(
      buildPayload(creatorWallet, creatorAmountIn6Dec, creatorSignature, creatorNonce) as never,
      buildRequirements(creatorWallet, creatorAmountIn6Dec) as never,
    )

    if (!creatorResult.success) {
      console.error("Creator settlement failed:", JSON.stringify(creatorResult))
      return NextResponse.json({ error: creatorResult.errorReason ?? "Creator settlement failed" }, { status: 400 })
    }

    // Settle platform payment (20%)
    const platformResult = await facilitator.settle(
      buildPayload(platformWallet, platformAmountIn6Dec, platformSignature, platformNonce) as never,
      buildRequirements(platformWallet, platformAmountIn6Dec) as never,
    )

    if (!platformResult.success) {
      console.error("Platform settlement failed:", JSON.stringify(platformResult))
      console.warn("Platform fee settlement failed but creator was paid")
    }

    console.log("Session settled:", {
      seconds_watched,
      totalAmount: actualAmount,
      creatorAmount: actualAmount * 0.80,
      platformAmount: actualAmount * 0.20,
      creatorTx: creatorResult.transaction,
      platformTx: platformResult?.transaction,
    })

    const net_amount = actualAmount * 0.80
    const platform_fee = actualAmount * 0.20

    await getSupabaseAdmin()
      .from("watch_sessions")
      .update({
        actual_amount: actualAmount,
        authorized_amount: actualAmount,
        seconds_paid: seconds_watched,
        total_cost: actualAmount,
      })
      .eq("id", session_id)

    const { data: batch } = await getSupabaseAdmin()
      .from("payment_batches")
      .insert({
        session_id,
        viewer_id,
        creator_id: earningsRecipientId,
        video_id,
        amount: actualAmount,
        seconds_covered: seconds_watched,
        chain: "arcTestnet",
        circle_transaction_id: creatorResult.transaction,
        status: "settled",
        settled_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (batch) {
      await getSupabaseAdmin().from("earnings").insert({
        creator_id: earningsRecipientId,
        video_id,
        batch_id: batch.id,
        gross_amount: actualAmount,
        platform_fee,
        net_amount,
      })
    }

    return NextResponse.json({
      success: true,
      amount: actualAmount,
      net_to_creator: net_amount,
      platform_fee,
      creator_tx: creatorResult.transaction,
      platform_tx: platformResult?.transaction ?? null,
    })
  } catch (err: any) {
    console.error("Settle session failed:", err?.message)
    return NextResponse.json({ error: "Settlement failed" }, { status: 500 })
  }
}