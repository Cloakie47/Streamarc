import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
})

async function getWalletId(address: string): Promise<string | null> {
  try {
    const res = await client.listWallets({ address })
    return res.data?.wallets?.[0]?.id || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      session_id,
      viewer_id,
      creator_id,
      video_id,
      seconds_covered,
    } = body

    // Create watch session (client: createWatchSession — only viewer_id + video_id)
    if (body.session_id === undefined && body.seconds_covered === undefined) {
      if (!viewer_id || !video_id) {
        return NextResponse.json(
          { error: "viewer_id and video_id are required" },
          { status: 400 },
        )
      }

      const { data: inserted, error } = await getSupabaseAdmin()
        .from("watch_sessions")
        .insert({
          viewer_id,
          video_id,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (error) {
        console.error(
          "watch_sessions insert error:",
          error.message,
          error.code,
          error.details,
          { viewer_id, video_id },
        )
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            details: error.details,
          },
          { status: 400 },
        )
      }

      const { error: rpcErr } = await getSupabaseAdmin().rpc("increment_video_views", {
        video_id,
      })
      if (rpcErr) {
        console.error(
          "increment_video_views error:",
          rpcErr.message,
          rpcErr.code,
        )
        return NextResponse.json({ error: rpcErr.message }, { status: 400 })
      }

      return NextResponse.json({ session_id: inserted?.id })
    }

    if (
      session_id == null ||
      !viewer_id ||
      !creator_id ||
      !video_id ||
      typeof seconds_covered !== "number"
    ) {
      return NextResponse.json(
        {
          error:
            "session_id, viewer_id, creator_id, video_id, and seconds_covered are required for payment",
        },
        { status: 400 },
      )
    }

    const amount = seconds_covered * 0.00003
    const platform_fee = amount * 0.20
    const net_amount = amount - platform_fee

    // Get both wallet addresses from DB
    const { data: viewer } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address")
      .eq("id", viewer_id)
      .single()

    const { data: creator } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address")
      .eq("id", creator_id)
      .single()

    if (!viewer?.wallet_address || !creator?.wallet_address) {
      return NextResponse.json({ error: "Missing wallet addresses" }, { status: 400 })
    }

    // Get Circle wallet IDs
    const viewerWalletId = await getWalletId(viewer.wallet_address)
    if (!viewerWalletId) {
      return NextResponse.json({ error: "Viewer wallet not found in Circle" }, { status: 400 })
    }

    // Execute Circle transfer via USDC contract (6 decimals for ERC-20 interface)
    const amountIn6Dec = Math.round(amount * 1e6).toString()

    const transfer = await client.createContractExecutionTransaction({
      walletId: viewerWalletId,
      contractAddress: "0x3600000000000000000000000000000000000000",
      abiFunctionSignature: "transfer(address,uint256)",
      abiParameters: [creator.wallet_address, amountIn6Dec],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: `${session_id}-${seconds_covered}-${Date.now()}`,
    })

    const txId = transfer.data?.id ?? null
    let txHash: string | null = null
    if (txId) {
      try {
        const details = await client.getTransaction({ id: txId })
        txHash = details.data?.transaction?.txHash ?? null
      } catch {
        // Hash available after confirmation
      }
    }

    console.log("Circle transfer initiated:", {
      txId,
      amount,
      amountIn6Dec,
      from: viewer.wallet_address,
      to: creator.wallet_address,
    })

    // Log to Supabase
    const { data: batch, error: batchError } = await getSupabaseAdmin()
      .from("payment_batches")
      .insert({
        session_id,
        viewer_id,
        creator_id,
        video_id,
        amount,
        seconds_covered,
        chain: "arcTestnet",
        tx_hash: txHash,
        status: "settled",
        settled_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (batchError) {
      return NextResponse.json({ error: batchError.message }, { status: 400 })
    }

    // Log earnings
    await getSupabaseAdmin().from("earnings").insert({
      creator_id,
      video_id,
      batch_id: batch.id,
      gross_amount: amount,
      platform_fee,
      net_amount,
    })

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      amount,
      net_to_creator: net_amount,
      tx_hash: txHash,
      circle_tx_id: txId,
    })
  } catch (err: any) {
    console.error("Transfer failed:", err?.message, err?.response?.data)
    return NextResponse.json({ error: "Transfer failed" }, { status: 500 })
  }
}