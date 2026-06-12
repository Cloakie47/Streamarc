// lib/settle-core — standalone Circle Gateway settlement (sign + facilitator.settle).
//
// This is the agent's payment core. It does NO database work: it signs two
// EIP-3009 authorizations (creator + platform) and settles each via Circle's
// BatchFacilitatorClient, returning the tx hashes. Callers (the worker / scripts)
// decide what to persist. See AGENT-BUILD-REPORT.md §1.4 / §7.2.
//
// Faithful to app/api/gateway/settle-session/route.ts, but decoupled from any
// users/watch_sessions/videos rows: the payer is identified solely by
// (payerWalletId, payerAddress).

import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server"
import { getClient, getWalletIdByAddress, randomNonce, signTypedDataWithWallet } from "./circle.ts"
import {
  buildDomain,
  buildPayload,
  buildRequirements,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  type Authorization,
  type ChainContext,
} from "./eip3009.ts"
import {
  CHAIN_ID,
  DEFAULT_FEE_SPLIT,
  GATEWAY_WALLET,
  NETWORK,
  PLATFORM_WALLET,
  USDC_ADDRESS,
  VALID_AFTER_SKEW_SECONDS,
  VALID_BEFORE_WINDOW_SECONDS,
} from "./constants.ts"

// One facilitator instance for the process (route line 6). Default base URL is
// Circle Gateway testnet (gateway-api-testnet.circle.com).
const facilitator = new BatchFacilitatorClient()

export { getClient, getWalletIdByAddress }

export interface FeeSplit {
  creator: number
  platform: number
}

export interface SettlePerSecondParams {
  /** Circle developer-controlled wallet id that signs the authorizations. */
  payerWalletId: string
  /** EOA address that owns the Gateway balance (the EIP-3009 `from`). */
  payerAddress: string
  /** Wallet address that receives the creator share. */
  creatorAddress: string
  /** Seconds of content being paid for. */
  seconds: number
  /** USDC per second (read from videos.rate_per_sec by the caller). */
  ratePerSecond: number
  /** Defaults to PLATFORM_WALLET. */
  platformWallet?: string
  /** Defaults to 80/20. */
  feeSplit?: FeeSplit
  /** Chain overrides (default Arc testnet). */
  gatewayWallet?: string
  usdcAddress?: string
  chainId?: number
  network?: string
}

export interface SettleResult {
  /** On-chain tx hash for the creator settlement (always present on success). */
  creatorTx: string
  /** Platform-fee tx hash, or null if the platform settlement failed. */
  platformTx: string | null
  /** Total amount paid (USDC, human units). */
  amount: number
  /** Creator share (USDC). */
  netToCreator: number
  /** Platform share (USDC). */
  platformFee: number
}

/**
 * Sign and settle a per-second payment as two EIP-3009 authorizations.
 *
 * Mirrors settle-session: the creator settlement is required (throws on
 * failure); the platform settlement is best-effort (logged, platformTx=null on
 * failure) so a creator is never left unpaid because of the fee leg.
 *
 * Each settle() call is one Circle Gateway settlement = one on-chain tx — the
 * SDK has no batch overload (SPIKE-RESULTS.md §4), so callers should accumulate
 * seconds and settle in chunks rather than per-second.
 */
export async function settlePerSecond(params: SettlePerSecondParams): Promise<SettleResult> {
  const {
    payerWalletId,
    payerAddress,
    creatorAddress,
    seconds,
    ratePerSecond,
    platformWallet = PLATFORM_WALLET,
    feeSplit = DEFAULT_FEE_SPLIT,
    gatewayWallet = GATEWAY_WALLET,
    usdcAddress = USDC_ADDRESS,
    chainId = CHAIN_ID,
    network = NETWORK,
  } = params

  if (!payerWalletId || !payerAddress) throw new Error("settlePerSecond: payerWalletId and payerAddress are required")
  if (!creatorAddress) throw new Error("settlePerSecond: creatorAddress is required")
  if (!(seconds > 0)) throw new Error(`settlePerSecond: seconds must be > 0 (got ${seconds})`)
  if (!(ratePerSecond > 0)) throw new Error(`settlePerSecond: ratePerSecond must be > 0 (got ${ratePerSecond})`)

  const amount = seconds * ratePerSecond
  const creatorAmount6 = Math.round(amount * feeSplit.creator * 1e6).toString()
  const platformAmount6 = Math.round(amount * feeSplit.platform * 1e6).toString()

  const now = Math.floor(Date.now() / 1000)
  const validAfter = (now - VALID_AFTER_SKEW_SECONDS).toString()
  const validBefore = (now + VALID_BEFORE_WINDOW_SECONDS).toString()

  const chain: ChainContext = { chainId, gatewayWallet, usdcAddress, network }
  const domain = buildDomain({ chainId, gatewayWallet })

  const creatorAuth: Authorization = {
    from: payerAddress,
    to: creatorAddress,
    value: creatorAmount6,
    validAfter,
    validBefore,
    nonce: randomNonce(),
  }
  const platformAuth: Authorization = {
    from: payerAddress,
    to: platformWallet,
    value: platformAmount6,
    validAfter,
    validBefore,
    nonce: randomNonce(),
  }

  const [creatorSignature, platformSignature] = await Promise.all([
    signTypedDataWithWallet(payerWalletId, domain, TRANSFER_WITH_AUTHORIZATION_TYPES as never, "TransferWithAuthorization", creatorAuth as never),
    signTypedDataWithWallet(payerWalletId, domain, TRANSFER_WITH_AUTHORIZATION_TYPES as never, "TransferWithAuthorization", platformAuth as never),
  ])

  if (!creatorSignature || !platformSignature) {
    throw new Error("settlePerSecond: failed to sign payment authorization")
  }

  // Creator settlement (80%) — required.
  const creatorResult = await facilitator.settle(
    buildPayload(creatorAuth, creatorSignature, chain) as never,
    buildRequirements(creatorAddress, creatorAmount6, chain) as never,
  )
  if (!creatorResult.success) {
    throw new Error(`settlePerSecond: creator settlement failed: ${creatorResult.errorReason ?? "unknown"}`)
  }

  // Platform settlement (20%) — best-effort.
  let platformTx: string | null = null
  const platformResult = await facilitator.settle(
    buildPayload(platformAuth, platformSignature, chain) as never,
    buildRequirements(platformWallet, platformAmount6, chain) as never,
  )
  if (platformResult.success) {
    platformTx = platformResult.transaction
  } else {
    console.warn("settlePerSecond: platform fee settlement failed but creator was paid:", platformResult.errorReason)
  }

  return {
    creatorTx: creatorResult.transaction,
    platformTx,
    amount,
    netToCreator: amount * feeSplit.creator,
    platformFee: amount * feeSplit.platform,
  }
}
