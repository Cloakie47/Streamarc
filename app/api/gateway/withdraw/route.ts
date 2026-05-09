import { NextRequest, NextResponse } from "next/server"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193"

const kit = new UnifiedBalanceKit()

export async function POST(req: NextRequest) {
  try {
    const { user_id, amount } = await req.json()

    if (!user_id || !amount) {
      return NextResponse.json({ error: "user_id and amount required" }, { status: 400 })
    }

    const withdrawAmount = parseFloat(amount)
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    if (withdrawAmount < 0.10) {
      return NextResponse.json({ error: "Minimum withdrawal is $0.10" }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single()

    if (!user?.circle_wallet_id || !user?.wallet_address) {
      return NextResponse.json({ error: "Circle wallet not found" }, { status: 400 })
    }

    const walletAddress = user.wallet_address as `0x${string}`
    const recipient = walletAddress

    const provider = createCircleEip1193Provider({
      walletId: user.circle_wallet_id,
      address: walletAddress,
    })
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: "developer-controlled" },
    })

    console.log("UBK spend (self-withdraw):", { walletAddress, withdrawAmount })

    const result = await kit.spend({
      from: { adapter, address: walletAddress },
      to: { adapter, address: walletAddress, chain: "Arc_Testnet", recipientAddress: recipient },
      amount: withdrawAmount.toString(),
      token: "USDC",
    })

    const txHash = result.txHash

    console.log("Withdrawal complete:", { withdrawAmount, recipient, txHash })

    await getSupabaseAdmin().from("withdrawals").insert({
      creator_id: user_id,
      gross_amount: withdrawAmount,
      platform_fee: 0,
      net_amount: withdrawAmount,
      wallet_address: recipient,
      status: "complete",
      tx_hash: txHash,
      completed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      amount: withdrawAmount,
      recipient,
      transaction_id: txHash,
      tx_hash: txHash,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Withdrawal failed:", message)
    return NextResponse.json({ error: "Withdrawal failed" }, { status: 500 })
  }
}
