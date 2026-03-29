import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/app/lib/supabase-server"
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { randomUUID } from "crypto"

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

async function waitForTx(client: any, txId: string, maxWait = 30000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await client.getTransaction({ id: txId })
    const state = res.data?.transaction?.state
    if (state === "COMPLETE") return true
    if (state === "FAILED" || state === "CANCELLED") return false
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, destination_address, amount } = await req.json()

    if (!user_id || !destination_address || !amount) {
      return NextResponse.json({ error: "user_id, destination_address and amount required" }, { status: 400 })
    }

    // Validate destination address
    if (!destination_address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: "Invalid destination address" }, { status: 400 })
    }

    const sendAmount = parseFloat(amount)
    if (isNaN(sendAmount) || sendAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    // Get user's Circle wallet
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single()

    if (!user?.circle_wallet_id || !user.wallet_address) {
      return NextResponse.json({ error: "Circle wallet not found" }, { status: 400 })
    }

    // Prevent sending to own wallet
    if (destination_address.toLowerCase() === user.wallet_address.toLowerCase()) {
      return NextResponse.json({ error: "Cannot send to your own wallet" }, { status: 400 })
    }

    const client = getClient()

    // Check Circle wallet USDC balance first
    const balances = await client.getWalletTokenBalance({ id: user.circle_wallet_id })
    const usdc = balances.data?.tokenBalances?.find(
      (b: any) => b.token?.symbol === "USDC"
    )
    const available = parseFloat(usdc?.amount || "0")

    if (available < sendAmount) {
      return NextResponse.json({
        error: `Insufficient Circle wallet balance. Available: $${available.toFixed(4)}`,
      }, { status: 400 })
    }

    console.log("Sending USDC externally:", {
      walletId: user.circle_wallet_id,
      destination: destination_address,
      amount: sendAmount,
    })

    // Send USDC to external wallet
    const tx = await client.createTransaction({
      walletAddress: user.wallet_address,
      blockchain: "ARC-TESTNET",
      tokenAddress: USDC_ADDRESS,
      destinationAddress: destination_address,
      amount: [sendAmount.toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    })

    const txId = tx.data?.id
    if (!txId) {
      return NextResponse.json({ error: "Transaction failed to initiate" }, { status: 500 })
    }

    console.log("External send tx initiated:", txId)
    const success = await waitForTx(client, txId)

    if (!success) {
      return NextResponse.json({ error: "Transaction failed" }, { status: 500 })
    }

    const sendTxDetails = await client.getTransaction({ id: txId })
    const txHash = sendTxDetails.data?.transaction?.txHash ?? txId

    console.log("External send complete:", { amount: sendAmount, destination: destination_address, txHash })

    return NextResponse.json({
      success: true,
      amount: sendAmount,
      destination: destination_address,
      transaction_id: txId,
      tx_hash: txHash,
    })
  } catch (err: any) {
    console.error("External send failed:", err?.message)
    return NextResponse.json({ error: "Send failed" }, { status: 500 })
  }
}
