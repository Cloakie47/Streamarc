import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { randomUUID } from "crypto"

const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
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
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, amount } = await req.json()

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single()

    if (!user?.circle_wallet_id) {
      return NextResponse.json({ error: "Circle wallet not found" }, { status: 400 })
    }

    const client = getClient()

    // Check USDC balance on SCA wallet (user sends USDC here)
    const balances = await client.getWalletTokenBalance({ id: user.circle_wallet_id })
    const usdc = balances.data?.tokenBalances?.find(
      (b: any) => b.token?.symbol === "USDC"
    )
    const available = parseFloat(usdc?.amount || "0")

    if (available <= 0) {
      return NextResponse.json({ error: "No USDC balance to deposit" }, { status: 400 })
    }

    const depositAmount = amount ? Math.min(parseFloat(amount), available) : available
    const amountIn6Dec = Math.round(depositAmount * 1e6).toString()

    console.log("Depositing to Gateway:", {
      walletId: user.circle_wallet_id,
      depositAmount,
      amountIn6Dec,
    })

    // Step 1: SCA approves Gateway to spend USDC
    const approveTx = await client.createContractExecutionTransaction({
      walletId: user.circle_wallet_id,
      contractAddress: USDC_ADDRESS,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [GATEWAY_WALLET, amountIn6Dec],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    })

    const approveTxId = approveTx.data?.id
    if (!approveTxId) {
      return NextResponse.json({ error: "Approve transaction failed" }, { status: 500 })
    }

    console.log("Approve tx initiated:", approveTxId)
    const approveSuccess = await waitForTx(client, approveTxId)
    if (!approveSuccess) {
      return NextResponse.json({ error: "Approve transaction failed" }, { status: 500 })
    }

    // Step 2: Deposit into Gateway from the SCA wallet
    const depositTx = await client.createContractExecutionTransaction({
      walletId: user.circle_wallet_id,
      contractAddress: GATEWAY_WALLET,
      abiFunctionSignature: "deposit(address,uint256)",
      abiParameters: [USDC_ADDRESS, amountIn6Dec],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    })

    const depositTxId = depositTx.data?.id
    if (!depositTxId) {
      return NextResponse.json({ error: "Deposit transaction failed" }, { status: 500 })
    }

    console.log("Deposit tx initiated:", depositTxId)
    const depositSuccess = await waitForTx(client, depositTxId)
    if (!depositSuccess) {
      return NextResponse.json({ error: "Deposit transaction failed" }, { status: 500 })
    }

    const depositTxDetails = await client.getTransaction({ id: depositTxId })
    const txHash = depositTxDetails.data?.transaction?.txHash ?? depositTxId

    console.log("Gateway deposit complete:", { depositAmount, user_id, txHash })

    return NextResponse.json({
      success: true,
      amount: depositAmount,
      approve_tx: approveTxId,
      deposit_tx: depositTxId,
      tx_hash: txHash,
    })
  } catch (err: any) {
    console.error("Gateway deposit failed:", err?.message)
    return NextResponse.json({ error: "Deposit failed" }, { status: 500 })
  }
}