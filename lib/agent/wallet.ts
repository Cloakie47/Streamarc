// Agent wallet helpers — create the agent's Circle EOA on Arc and deposit its
// on-chain USDC into the Gateway.
//
// createGatewayWallet + getWalletBalance are copied (behavior-preserving) from
// app/lib/circle-wallets.ts; depositArcUsdc is the depositArc logic from
// app/api/gateway/deposit/route.ts with the HTTP/DB shell stripped off. Copied
// rather than imported because those modules use "@/..." path aliases that
// don't resolve under plain Node, and per the build report we copy the payment
// path rather than refactor it. The shared lib circle-eip1193 is imported as-is
// (it has no alias imports).

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { createPublicClient, http, parseAbi } from "viem"
import { createCircleEip1193Provider, arcTestnet } from "../../app/lib/circle-eip1193.ts"
import { USDC_ADDRESS } from "../settle-core/constants.ts"

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

export interface CircleWallet {
  id: string
  address: string
}

/**
 * Create (or reuse) a Circle developer-controlled EOA on Arc testnet.
 * Idempotent on `refId`: returns the existing wallet if one already exists for it.
 * Copied from circle-wallets.ts:createGatewayWallet.
 */
export async function createGatewayWallet(refId: string): Promise<CircleWallet | null> {
  try {
    if (!process.env.CIRCLE_WALLET_SET_ID) {
      console.error("CIRCLE_WALLET_SET_ID is missing from env")
      return null
    }

    const client = getClient()

    const existing = await client.listWallets({ refId })
    const existingWallet = existing.data?.wallets?.[0]
    if (existingWallet?.id && existingWallet?.address) {
      console.log("Existing Circle wallet found:", { id: existingWallet.id, address: existingWallet.address, refId })
      return { id: existingWallet.id, address: existingWallet.address }
    }

    const response = await client.createWallets({
      walletSetId: process.env.CIRCLE_WALLET_SET_ID!,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "EOA",
      metadata: [{ name: `streamarc-${refId}`, refId }],
    })

    const wallet = response.data?.wallets?.[0]
    if (!wallet?.address || !wallet?.id) return null

    console.log("Circle EOA wallet created:", { id: wallet.id, address: wallet.address, refId })
    return { id: wallet.id, address: wallet.address }
  } catch (err: any) {
    console.error("Failed to create Circle wallet:", err?.message, err?.response?.data)
    return null
  }
}

/** On-chain USDC balance for an address. Copied from circle-wallets.ts:getWalletBalance. */
export async function getWalletBalance(walletAddress: string): Promise<number> {
  try {
    const client = getClient()
    const wallets = await client.listWallets({ address: walletAddress })
    const walletId = wallets.data?.wallets?.[0]?.id
    if (!walletId) return 0

    const balances = await client.getWalletTokenBalance({ id: walletId })
    const usdc = balances.data?.tokenBalances?.find(
      (b: { token?: { symbol?: string } }) => b.token?.symbol === "USDC",
    )
    return parseFloat(usdc?.amount || "0")
  } catch (err: any) {
    console.error("Failed to get wallet balance:", err?.message)
    return 0
  }
}

const kit = new UnifiedBalanceKit()

// Authoritative on-chain USDC balance reader. Circle's getWalletTokenBalance can
// report a stale/cached figure (the source of the "20 USDC" over-deposit that
// reverted); reading balanceOf directly on Arc is the ground truth, matching what
// the cross-chain path in deposit/route.ts does.
const USDC_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"])
const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http() })

export async function getOnChainUsdcBalance(address: `0x${string}`): Promise<number> {
  const raw = (await arcPublicClient.readContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address],
  })) as bigint
  return Number(raw) / 1_000_000
}

export interface DepositResult {
  txHash: string
  amount: number
}

/**
 * Move the wallet's on-chain USDC into the Circle Gateway balance on Arc.
 * Copied from app/api/gateway/deposit/route.ts:depositArc (HTTP/DB shell removed).
 *
 * Amount: deposits min(requested, actual on-chain balance); if `amount` is
 * omitted, deposits the full actual balance. We read the balance from the chain
 * (getOnChainUsdcBalance) rather than Circle's cached value so we never try to
 * deposit more than the wallet holds (which reverts).
 *
 * GAS: unlike the EIP-3009 settlement (gasless — the payer only signs, Circle
 * Gateway submits and pays), this deposit performs REAL on-chain transactions
 * FROM the agent EOA — an ERC-20 approve(Gateway, amount) and then a
 * Gateway.deposit(USDC, amount). Circle developer-controlled wallets pay their
 * own gas in the chain's native token, so the EOA MUST hold native Arc gas
 * (ETH) or these transactions revert. If a deposit reverts with a gas/fee/
 * native-balance reason, fund the agent address with native Arc gas (faucet)
 * and retry. (Insufficient native gas is the most likely cause of a revert that
 * isn't an amount problem.)
 */
export async function depositArcUsdc(opts: {
  walletId: string
  address: `0x${string}`
  amount?: number
}): Promise<DepositResult> {
  const { walletId, address, amount } = opts

  const available = await getOnChainUsdcBalance(address)
  if (available <= 0) {
    throw new Error("No USDC balance to deposit (on-chain). Fund the agent address via the Circle faucet first.")
  }

  const depositAmount = amount ? Math.min(amount, available) : available

  const provider = createCircleEip1193Provider({ walletId, address })
  const adapter = await createViemAdapterFromProvider({
    provider,
    capabilities: { addressContext: "developer-controlled" },
  })

  console.log("UBK deposit (Arc):", { address, onChainBalance: available, depositAmount })

  const result = await kit.deposit({
    from: { adapter, address, chain: "Arc_Testnet" },
    amount: depositAmount.toString(),
    token: "USDC",
  })

  console.log("UBK deposit complete:", { depositAmount, txHash: result.txHash })
  return { txHash: result.txHash, amount: depositAmount }
}
