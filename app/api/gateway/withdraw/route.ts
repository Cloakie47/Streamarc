import { NextRequest, NextResponse } from "next/server"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193"
import { SUPPORTED_CHAINS } from "@/app/components/wallet/ChainSelector"

const kit = new UnifiedBalanceKit()

const SOURCE_CHAIN = "Arc_Testnet"
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

export async function POST(req: NextRequest) {
  try {
    const { user_id, amount, destination_chain, destination_address } = await req.json()

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

    const withdrawAmount = parseFloat(amount)
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    const isCrossChain = chain.id !== SOURCE_CHAIN
    const minimum = isCrossChain ? 0.5 : 0.1
    if (withdrawAmount < minimum) {
      return NextResponse.json(
        { error: `Minimum withdrawal is $${minimum.toFixed(2)} for ${chain.name}` },
        { status: 400 },
      )
    }

    if (isCrossChain && !destination_address) {
      return NextResponse.json(
        { error: "destination_address required for cross-chain withdrawals" },
        { status: 400 },
      )
    }

    if (destination_address && !EVM_ADDRESS_RE.test(destination_address)) {
      return NextResponse.json({ error: "Invalid destination address" }, { status: 400 })
    }

    const platformWallet = process.env.PLATFORM_WALLET_ADDRESS ?? ""
    if (isCrossChain && !platformWallet) {
      console.error("Cross-chain withdrawal requested but PLATFORM_WALLET_ADDRESS unset")
      return NextResponse.json(
        { error: "Cross-chain fee recipient not configured" },
        { status: 500 },
      )
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
    const recipient = (destination_address ?? walletAddress) as string

    const provider = createCircleEip1193Provider({
      walletId: user.circle_wallet_id,
      address: walletAddress,
    })
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: "developer-controlled" },
    })

    console.log("UBK spend (withdraw):", {
      walletAddress,
      withdrawAmount,
      destination_chain: chain.id,
      recipient,
      isCrossChain,
      feeUsdc: chain.feeUsdc,
    })

    // Cross-chain: use Forwarding Service (no destination adapter) + custom fee.
    // Same-chain Arc → Arc: standard SpendDestination with the source adapter and no fee.
    const result = isCrossChain
      ? await kit.spend({
          from: { adapter, address: walletAddress },
          to: {
            chain: chain.id as never,
            recipientAddress: recipient,
            useForwarder: true,
          },
          amount: withdrawAmount.toString(),
          token: "USDC",
          config: {
            customFee: {
              recipientAddress: platformWallet,
              value: chain.feeUsdc.toFixed(2),
            },
          },
        })
      : await kit.spend({
          from: { adapter, address: walletAddress },
          to: {
            adapter,
            address: walletAddress,
            chain: chain.id as never,
            recipientAddress: recipient,
          },
          amount: withdrawAmount.toString(),
          token: "USDC",
        })

    const txHash = result.txHash

    console.log("Withdrawal complete:", {
      txHash,
      withdrawAmount,
      recipient,
      chain: chain.id,
      feeUsdc: chain.feeUsdc,
    })

    await getSupabaseAdmin().from("transactions").insert({
      user_id,
      type: "withdraw",
      source_chain: SOURCE_CHAIN,
      destination_chain: chain.id,
      amount: withdrawAmount,
      recipient_address: recipient,
      tx_hash: txHash,
      status: "completed",
      fee: chain.feeUsdc,
    })

    return NextResponse.json({
      success: true,
      amount: withdrawAmount,
      recipient,
      tx_hash: txHash,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Withdrawal failed:", message)
    return NextResponse.json({ error: "Withdrawal failed" }, { status: 500 })
  }
}
