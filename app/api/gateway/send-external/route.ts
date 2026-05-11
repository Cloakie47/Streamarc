import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { randomUUID } from "crypto"
import { createPublicClient, http, erc20Abi, type Chain } from "viem"
import { arcTestnet, baseSepolia, avalancheFuji, sepolia } from "viem/chains"
import { SUPPORTED_CHAINS } from "@/app/lib/chains"
import { deriveChainWallet } from "@/app/lib/circle-wallets"

const VIEM_CHAINS: Record<string, Chain> = {
  Arc_Testnet: arcTestnet,
  Base_Sepolia: baseSepolia,
  Avalanche_Fuji: avalancheFuji,
  Ethereum_Sepolia: sepolia,
}

const EXPLORER_URLS: Record<string, string> = {
  Arc_Testnet: "https://testnet.arcscan.app/tx",
  Base_Sepolia: "https://sepolia.basescan.org/tx",
  Avalanche_Fuji: "https://testnet.snowtrace.io/tx",
  Ethereum_Sepolia: "https://sepolia.etherscan.io/tx",
}

function getCircleClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

type CircleSdkClient = ReturnType<typeof getCircleClient>

async function waitForTx(
  client: CircleSdkClient,
  txId: string,
  maxWait = 60000,
): Promise<{ ok: boolean; txHash?: string }> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await client.getTransaction({ id: txId })
    const state = res.data?.transaction?.state
    if (state === "COMPLETE" || state === "CONFIRMED") {
      return { ok: true, txHash: res.data?.transaction?.txHash ?? undefined }
    }
    if (state === "FAILED" || state === "DENIED" || state === "CANCELLED") {
      return { ok: false }
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return { ok: false }
}

export async function POST(req: NextRequest) {
  // Lifted to the outer scope so the catch block can persist a "failed" audit row
  // even when an error is thrown mid-flight.
  let user_id: string | undefined
  let chainId = "Arc_Testnet"
  let sendAmount = 0
  try {
    const body = await req.json()
    user_id = body.user_id
    const { destination_address, amount, source_chain } = body

    if (!user_id || !destination_address || !amount) {
      return NextResponse.json(
        { error: "user_id, destination_address and amount required" },
        { status: 400 },
      )
    }

    if (!destination_address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json({ error: "Invalid destination address" }, { status: 400 })
    }

    sendAmount = parseFloat(amount)
    if (isNaN(sendAmount) || sendAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    chainId = (source_chain as string | undefined) ?? "Arc_Testnet"
    const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId)
    if (!chain) {
      return NextResponse.json({ error: `Unsupported source_chain: ${chainId}` }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single()

    if (!user?.circle_wallet_id || !user.wallet_address) {
      return NextResponse.json({ error: "Circle wallet not found" }, { status: 400 })
    }

    if (destination_address.toLowerCase() === user.wallet_address.toLowerCase()) {
      return NextResponse.json({ error: "Cannot send to your own wallet" }, { status: 400 })
    }

    // Resolve the source-chain walletId. ARC uses the user's primary Circle wallet;
    // other chains use the per-chain wallet provisioned by deriveChainWallet (same address).
    let walletId: string
    if (chain.id === "Arc_Testnet") {
      walletId = user.circle_wallet_id
    } else {
      try {
        const derived = await deriveChainWallet(user_id, user.wallet_address, chain)
        walletId = derived.walletId
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("send-external deriveChainWallet failed:", message)
        return NextResponse.json(
          { error: `Could not provision ${chain.name} wallet: ${message}` },
          { status: 500 },
        )
      }
    }

    const client = getCircleClient()

    // Balance check — Circle's indexed ledger for ARC, on-chain viem balanceOf for others.
    let available: number
    if (chain.id === "Arc_Testnet") {
      const balances = await client.getWalletTokenBalance({ id: walletId })
      const usdc = balances.data?.tokenBalances?.find(
        (b: { token?: { symbol?: string } }) => b.token?.symbol === "USDC",
      )
      available = parseFloat(usdc?.amount || "0")
    } else {
      const viemChain = VIEM_CHAINS[chain.id]
      if (!viemChain) {
        return NextResponse.json({ error: `No RPC configured for ${chain.id}` }, { status: 500 })
      }
      const publicClient = createPublicClient({ chain: viemChain, transport: http() })
      try {
        const raw = (await publicClient.readContract({
          address: chain.usdcAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [user.wallet_address as `0x${string}`],
        })) as bigint
        available = Number(raw) / 1e6
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`send-external balanceOf failed on ${chain.id}:`, message)
        return NextResponse.json(
          { error: `Could not read USDC balance on ${chain.name}: ${message}` },
          { status: 500 },
        )
      }
    }

    if (available < sendAmount) {
      return NextResponse.json(
        {
          error: `Insufficient ${chain.name} wallet USDC balance. Available: $${available.toFixed(4)}`,
        },
        { status: 400 },
      )
    }

    console.log("send-external:", {
      chain: chain.id,
      blockchain: chain.circleBlockchain,
      walletAddress: user.wallet_address,
      walletId,
      tokenAddress: chain.usdcAddress,
      destination: destination_address,
      amount: sendAmount,
    })

    // The SDK's CreateTransferTransactionInput union narrows `blockchain` per-branch in a way
    // TypeScript can't infer from this literal assembly. Cast to satisfy the discriminated union;
    // the runtime contract (walletAddress + blockchain + tokenAddress) is the documented shape.
    const tx = await client.createTransaction({
      walletAddress: user.wallet_address,
      blockchain: chain.circleBlockchain,
      tokenAddress: chain.usdcAddress,
      destinationAddress: destination_address,
      amount: [sendAmount.toString()],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    } as Parameters<typeof client.createTransaction>[0])

    const txId = tx.data?.id
    if (!txId) {
      return NextResponse.json({ error: "Transaction failed to initiate" }, { status: 500 })
    }

    console.log("send-external tx initiated:", { txId, chain: chain.id })
    const result = await waitForTx(client, txId)
    if (!result.ok) {
      return NextResponse.json({ error: "Transaction failed" }, { status: 500 })
    }
    const txHash = result.txHash ?? txId

    console.log("send-external complete:", {
      chain: chain.id,
      amount: sendAmount,
      destination: destination_address,
      txHash,
    })

    await getSupabaseAdmin().from("transactions").insert({
      user_id,
      type: "send",
      source_chain: chain.id,
      destination_chain: chain.id,
      amount: sendAmount,
      fee: 0,
      recipient_address: destination_address,
      tx_hash: txHash,
      status: "completed",
    })

    return NextResponse.json({
      success: true,
      amount: sendAmount,
      destination: destination_address,
      chain: chain.id,
      transaction_id: txId,
      tx_hash: txHash,
      explorer_url: EXPLORER_URLS[chain.id] ?? EXPLORER_URLS.Arc_Testnet,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("External send failed:", message)
    if (user_id) {
      try {
        await getSupabaseAdmin().from("transactions").insert({
          user_id,
          type: "send",
          source_chain: chainId,
          destination_chain: chainId,
          amount: sendAmount,
          fee: 0,
          tx_hash: null,
          status: "failed",
        })
      } catch {
        // never throw from error handler
      }
    }
    return NextResponse.json({ error: "Send failed" }, { status: 500 })
  }
}
