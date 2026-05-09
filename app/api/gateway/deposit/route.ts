import { NextRequest, NextResponse } from "next/server"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { getWalletBalance } from "@/app/lib/circle-wallets"
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193"

const kit = new UnifiedBalanceKit()

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

    if (!user?.circle_wallet_id || !user?.wallet_address) {
      return NextResponse.json({ error: "Circle wallet not found" }, { status: 400 })
    }

    const walletAddress = user.wallet_address as `0x${string}`
    const available = await getWalletBalance(walletAddress)

    if (available <= 0) {
      return NextResponse.json({ error: "No USDC balance to deposit" }, { status: 400 })
    }

    const depositAmount = amount ? Math.min(parseFloat(amount), available) : available

    const provider = createCircleEip1193Provider({
      walletId: user.circle_wallet_id,
      address: walletAddress,
    })
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: "developer-controlled" },
    })

    console.log("UBK deposit:", { walletAddress, depositAmount })

    const result = await kit.deposit({
      from: { adapter, address: walletAddress, chain: "Arc_Testnet" },
      amount: depositAmount.toString(),
      token: "USDC",
    })

    console.log("UBK deposit complete:", { depositAmount, user_id, txHash: result.txHash })

    return NextResponse.json({
      success: true,
      amount: depositAmount,
      approve_tx: null,
      deposit_tx: result.txHash,
      tx_hash: result.txHash,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Gateway deposit failed:", message)
    return NextResponse.json({ error: "Deposit failed" }, { status: 500 })
  }
}
