import { NextRequest, NextResponse } from "next/server"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193"
import { SUPPORTED_CHAINS } from "@/app/lib/chains"
import { getActingUser } from "@/app/lib/require-user"

const kit = new UnifiedBalanceKit()
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/
const CROSS_CHAIN_PLATFORM_FEE = 0.10
const GATEWAY_FEE_BPS = 0.00005 // 0.005% on cross-chain spend, matches the UI fee preview

export async function POST(req: NextRequest) {
  // Lifted to the outer scope so the catch block can persist a "failed" audit row
  // even when an error is thrown mid-flight.
  let user_id: string | undefined
  let destChainId = "Arc_Testnet"
  let withdrawAmount = 0
  try {
    // Source wallet = the AUTHENTICATED user, never a body-supplied user_id.
    const actor = await getActingUser()
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    user_id = actor.id

    const body = await req.json()
    const { amount, destination_chain, destination_address } = body

    if (!amount) {
      return NextResponse.json({ error: "amount required" }, { status: 400 })
    }

    destChainId = (destination_chain as string | undefined) ?? "Arc_Testnet"
    const destChain = SUPPORTED_CHAINS.find((c) => c.id === destChainId)
    if (!destChain) {
      return NextResponse.json({ error: `Unsupported destination_chain: ${destChainId}` }, { status: 400 })
    }

    const isCrossChain = destChainId !== "Arc_Testnet"

    withdrawAmount = parseFloat(amount)
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    const minimum = isCrossChain ? 0.50 : 0.10
    if (withdrawAmount < minimum) {
      return NextResponse.json(
        { error: `Minimum withdrawal is $${minimum.toFixed(2)} for ${destChain.name}` },
        { status: 400 },
      )
    }

    if (isCrossChain && (!destination_address || !EVM_ADDRESS_RE.test(destination_address))) {
      return NextResponse.json(
        { error: "destination_address (0x…) required for cross-chain withdrawal" },
        { status: 400 },
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
    const recipient = (isCrossChain
      ? (destination_address as string)
      : ((destination_address as string | undefined) ?? walletAddress)) as `0x${string}`

    const provider = createCircleEip1193Provider({
      walletId: user.circle_wallet_id,
      address: walletAddress,
    })
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: "developer-controlled" },
    })

    const spendArgs = isCrossChain
      ? {
          from: { adapter, address: walletAddress },
          to: { chain: destChainId, recipientAddress: recipient, useForwarder: true as const },
          amount: withdrawAmount.toString(),
          token: "USDC" as const,
        }
      : {
          from: { adapter, address: walletAddress },
          to: { adapter, address: walletAddress, chain: "Arc_Testnet" as const, recipientAddress: recipient },
          amount: withdrawAmount.toString(),
          token: "USDC" as const,
        }

    console.log("kit.spend args:", {
      mode: isCrossChain ? "cross-chain (forwarder)" : "arc same-chain",
      from_address: walletAddress,
      destination_chain: destChainId,
      recipient,
      amount: withdrawAmount,
      useForwarder: isCrossChain,
    })

    // Cast to bypass UBK's narrowly typed `to` union — the two branches above match the documented
    // SpendDestination / ForwarderSpendDestination shapes from index.d.ts.
    const result = await kit.spend(spendArgs as Parameters<typeof kit.spend>[0])
    const txHash = result.txHash

    console.log("Withdrawal complete:", {
      withdrawAmount,
      destChainId,
      recipient,
      txHash,
    })

    const platformFee = isCrossChain ? CROSS_CHAIN_PLATFORM_FEE : 0
    const gatewayFee = isCrossChain ? withdrawAmount * GATEWAY_FEE_BPS : 0
    const totalFee = platformFee + gatewayFee
    const netAmount = withdrawAmount - totalFee

    // New transactions table — drives the WalletPage history.
    // `source_chain` is intentionally hardcoded to Arc_Testnet: Gateway funds
    // are unified across all chains and conceptually anchored to the ARC ledger,
    // regardless of which chain originally deposited the USDC.
    await getSupabaseAdmin().from("transactions").insert({
      user_id,
      type: "withdraw",
      source_chain: "Arc_Testnet",
      destination_chain: destChainId,
      amount: withdrawAmount,
      fee: totalFee, // platform $0.10 + 0.005% gateway fee on cross-chain
      recipient_address: recipient,
      tx_hash: txHash,
      status: "completed",
    })

    // Legacy withdrawals table — kept for back-compat with anything still reading it.
    await getSupabaseAdmin().from("withdrawals").insert({
      creator_id: user_id,
      gross_amount: withdrawAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      wallet_address: recipient,
      status: "complete",
      tx_hash: txHash,
      completed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      amount: withdrawAmount,
      recipient,
      destination_chain: destChainId,
      fee: platformFee,
      net_amount: netAmount,
      transaction_id: txHash,
      tx_hash: txHash,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Withdrawal failed:", message)
    if (user_id) {
      try {
        await getSupabaseAdmin().from("transactions").insert({
          user_id,
          type: "withdraw",
          source_chain: "Arc_Testnet",
          destination_chain: destChainId,
          amount: withdrawAmount,
          fee: 0,
          tx_hash: null,
          status: "failed",
        })
      } catch {
        // never throw from error handler
      }
    }
    return NextResponse.json({ error: "Withdrawal failed" }, { status: 500 })
  }
}
