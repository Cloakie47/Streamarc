import { NextRequest, NextResponse } from "next/server"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { createPublicClient, http, parseAbi, type Chain } from "viem"
import { baseSepolia, avalancheFuji, sepolia } from "viem/chains"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { getWalletBalance, deriveChainWallet } from "@/app/lib/circle-wallets"
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193"
import { SUPPORTED_CHAINS } from "@/app/lib/chains"
import { randomUUID } from "crypto"

const kit = new UnifiedBalanceKit()

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const
const MIN_GAS_WEI = BigInt("1000000000000000") // 0.001 ETH/AVAX equivalent
const FAUCET_URL = "https://faucet.circle.com"

const VIEM_CHAINS: Record<string, Chain> = {
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

const USDC_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
])

function getCircleClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

async function pollTransactionToComplete(transactionId: string): Promise<string> {
  const client = getCircleClient()
  const MAX_ATTEMPTS = 60
  const INTERVAL_MS = 2000
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const res = await client.getTransaction({ id: transactionId })
    const tx = res.data?.transaction
    const state = tx?.state
    if (state === "COMPLETE" || state === "CONFIRMED") {
      if (!tx?.txHash) throw new Error(`Transaction ${transactionId} reached ${state} but has no txHash`)
      return tx.txHash
    }
    if (state === "FAILED" || state === "DENIED" || state === "CANCELLED") {
      throw new Error(`Transaction ${transactionId} ${state}: ${tx?.errorReason ?? "unknown"} (${tx?.errorDetails ?? ""})`)
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
  throw new Error(`Transaction ${transactionId} did not complete within ${(MAX_ATTEMPTS * INTERVAL_MS) / 1000}s`)
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, amount, source_chain } = await req.json()

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 })
    }

    const chainId = (source_chain as string | undefined) ?? "Arc_Testnet"
    const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId)
    if (!chain) {
      return NextResponse.json({ error: `Unsupported source_chain: ${chainId}` }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single()

    if (!user?.circle_wallet_id || !user?.wallet_address) {
      return NextResponse.json({ error: "Circle wallet not found" }, { status: 400 })
    }

    if (chain.id === "Arc_Testnet") {
      return await depositArc(user_id, user.wallet_address as `0x${string}`, user.circle_wallet_id, amount)
    }

    return await depositCrossChain(user_id, user.wallet_address as `0x${string}`, chain, amount)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Gateway deposit failed:", message)
    return NextResponse.json({ error: "Deposit failed" }, { status: 500 })
  }
}

async function depositArc(
  user_id: string,
  walletAddress: `0x${string}`,
  circleWalletId: string,
  amount: unknown,
) {
  const available = await getWalletBalance(walletAddress)
  if (available <= 0) {
    return NextResponse.json({ error: "No USDC balance to deposit" }, { status: 400 })
  }

  const depositAmount = amount ? Math.min(parseFloat(amount as string), available) : available

  const provider = createCircleEip1193Provider({
    walletId: circleWalletId,
    address: walletAddress,
  })
  const adapter = await createViemAdapterFromProvider({
    provider,
    capabilities: { addressContext: "developer-controlled" },
  })

  console.log("UBK deposit (Arc):", { walletAddress, depositAmount })

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
    chain: "Arc_Testnet",
    explorer_url: EXPLORER_URLS["Arc_Testnet"],
  })
}

async function depositCrossChain(
  user_id: string,
  arcWalletAddress: `0x${string}`,
  chain: (typeof SUPPORTED_CHAINS)[number],
  amount: unknown,
) {
  const viemChain = VIEM_CHAINS[chain.id]
  if (!viemChain) {
    return NextResponse.json({ error: `No RPC configured for ${chain.id}` }, { status: 500 })
  }

  let derived: { walletId: string; walletAddress: string }
  try {
    derived = await deriveChainWallet(user_id, arcWalletAddress, chain)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("deriveChainWallet failed:", message)
    return NextResponse.json({ error: `Could not provision ${chain.name} wallet: ${message}` }, { status: 500 })
  }

  const walletAddress = derived.walletAddress as `0x${string}`
  const walletId = derived.walletId
  const publicClient = createPublicClient({ chain: viemChain, transport: http() })

  const [nativeBalance, usdcBalanceRaw] = await Promise.all([
    publicClient.getBalance({ address: walletAddress }),
    publicClient.readContract({
      address: chain.usdcAddress as `0x${string}`,
      abi: USDC_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    }) as Promise<bigint>,
  ])

  if (nativeBalance < MIN_GAS_WEI) {
    return NextResponse.json(
      {
        error: `Insufficient ${chain.nativeToken} on ${chain.name}. Fund your wallet with ${chain.nativeToken} at ${FAUCET_URL}`,
        chain: chain.id,
        chain_name: chain.name,
        wallet_address: walletAddress,
        native_token: chain.nativeToken,
        faucet_url: FAUCET_URL,
        native_balance_wei: nativeBalance.toString(),
        required_wei: MIN_GAS_WEI.toString(),
      },
      { status: 400 },
    )
  }

  const usdcAvailable = Number(usdcBalanceRaw) / 1_000_000
  if (usdcAvailable <= 0) {
    return NextResponse.json(
      { error: `No USDC on ${chain.name} at ${walletAddress}`, chain: chain.id, wallet_address: walletAddress },
      { status: 400 },
    )
  }

  const requestedAmount = amount ? parseFloat(amount as string) : usdcAvailable
  if (isNaN(requestedAmount) || requestedAmount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
  }
  const depositAmount = Math.min(requestedAmount, usdcAvailable)
  const depositRaw = BigInt(Math.round(depositAmount * 1_000_000))

  const client = getCircleClient()

  console.log("Cross-chain deposit start:", {
    user_id,
    chain: chain.id,
    walletId,
    walletAddress,
    depositAmount,
    depositRaw: depositRaw.toString(),
  })

  // 1) approve(GATEWAY_WALLET, depositRaw) on the USDC contract
  const approveRes = await client.createContractExecutionTransaction({
    idempotencyKey: randomUUID(),
    walletId,
    contractAddress: chain.usdcAddress,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [GATEWAY_WALLET_ADDRESS, depositRaw.toString()],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  })

  const approveTxId = approveRes.data?.id
  if (!approveTxId) {
    throw new Error("approve transaction returned no id")
  }
  console.log("approve submitted:", { approveTxId })
  const approveTxHash = await pollTransactionToComplete(approveTxId)
  console.log("approve complete:", { approveTxId, approveTxHash })

  // 2) deposit(USDC, depositRaw) on the Gateway Wallet contract
  const depositRes = await client.createContractExecutionTransaction({
    idempotencyKey: randomUUID(),
    walletId,
    contractAddress: GATEWAY_WALLET_ADDRESS,
    abiFunctionSignature: "deposit(address,uint256)",
    abiParameters: [chain.usdcAddress, depositRaw.toString()],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  })

  const depositTxId = depositRes.data?.id
  if (!depositTxId) {
    throw new Error("deposit transaction returned no id")
  }
  console.log("deposit submitted:", { depositTxId })
  const depositTxHash = await pollTransactionToComplete(depositTxId)
  console.log("deposit complete:", { depositTxId, depositTxHash, user_id })

  return NextResponse.json({
    success: true,
    amount: depositAmount,
    approve_tx: approveTxHash,
    deposit_tx: depositTxHash,
    tx_hash: depositTxHash,
    chain: chain.id,
    explorer_url: EXPLORER_URLS[chain.id] ?? EXPLORER_URLS["Arc_Testnet"],
  })
}
