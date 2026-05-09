import { NextRequest, NextResponse } from "next/server"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193"
import { SUPPORTED_CHAINS } from "@/app/components/wallet/ChainSelector"

const kit = new UnifiedBalanceKit()

const SOURCE_CHAIN = "Arc_Testnet"

// Fallback constants used when kit.estimateSpend() is unavailable or errors.
const FALLBACK_GATEWAY_FEE_BPS = 0.00005 // 0.005% on cross-chain spend
const FALLBACK_FORWARDING_FEE_USDC = 0.2
const FALLBACK_GAS_USDC = 0.05

function sumFeeAmounts(
  fees: { type: string; amount: string }[] | undefined,
  type: string,
): number {
  if (!fees) return 0
  return fees
    .filter((f) => f.type === type)
    .reduce((acc, f) => acc + (parseFloat(f.amount) || 0), 0)
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, amount, destination_chain } = await req.json()

    if (!user_id || !amount || !destination_chain) {
      return NextResponse.json(
        { error: "user_id, amount and destination_chain required" },
        { status: 400 },
      )
    }

    const chain = SUPPORTED_CHAINS.find((c) => c.id === destination_chain)
    if (!chain) {
      return NextResponse.json({ error: "Unsupported destination_chain" }, { status: 400 })
    }

    const spendAmount = parseFloat(amount)
    if (isNaN(spendAmount) || spendAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
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
    const isCrossChain = chain.id !== SOURCE_CHAIN
    const platformFee = chain.feeUsdc

    const provider = createCircleEip1193Provider({
      walletId: user.circle_wallet_id,
      address: walletAddress,
    })
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: "developer-controlled" },
    })

    let gatewayFee = 0
    let forwardingFee = 0
    let gasEstimate = 0

    try {
      const platformWallet = process.env.PLATFORM_WALLET_ADDRESS ?? walletAddress
      const estimate = isCrossChain
        ? await kit.estimateSpend({
            from: { adapter, address: walletAddress },
            to: {
              chain: chain.id as never,
              recipientAddress: walletAddress,
              useForwarder: true,
            },
            amount: spendAmount.toString(),
            token: "USDC",
            config: {
              customFee: {
                recipientAddress: platformWallet,
                value: platformFee.toFixed(2),
              },
            },
          })
        : await kit.estimateSpend({
            from: { adapter, address: walletAddress },
            to: {
              adapter,
              address: walletAddress,
              chain: chain.id as never,
              recipientAddress: walletAddress,
            },
            amount: spendAmount.toString(),
            token: "USDC",
          })

      gatewayFee = sumFeeAmounts(estimate.fees, "provider")
      gasEstimate = sumFeeAmounts(estimate.fees, "gasFee")
      forwardingFee = sumFeeAmounts(estimate.fees, "forwarder")
    } catch (err: unknown) {
      console.error(
        "kit.estimateSpend failed, using fallback:",
        err instanceof Error ? err.message : err,
      )
      gatewayFee = isCrossChain ? spendAmount * FALLBACK_GATEWAY_FEE_BPS : 0
      forwardingFee = isCrossChain ? FALLBACK_FORWARDING_FEE_USDC : 0
      gasEstimate = FALLBACK_GAS_USDC
    }

    const youReceive = spendAmount - platformFee - gatewayFee - forwardingFee - gasEstimate

    return NextResponse.json({
      spend_amount: spendAmount,
      platform_fee: platformFee,
      gateway_fee: gatewayFee,
      forwarding_fee: forwardingFee,
      gas_estimate: gasEstimate,
      you_receive: youReceive,
      destination_chain: chain.id,
      is_cross_chain: isCrossChain,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Estimate failed:", message)
    return NextResponse.json({ error: "Estimate failed" }, { status: 500 })
  }
}
