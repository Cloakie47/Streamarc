// Settlement constants — copied from app/api/gateway/settle-session/route.ts so the
// agent path is independent of the viewer payment path. These are DEFAULTS;
// settlePerSecond accepts overrides for everything chain/fee related.

/** Circle Gateway batched-wallet contract on Arc (EIP-712 verifyingContract). */
export const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"

/** USDC token address on Arc testnet. */
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"

/** Arc testnet chain id. */
export const CHAIN_ID = 5042002

/** CAIP-2 network string used in x402 payload/requirements. */
export const NETWORK = "eip155:5042002"

/**
 * Platform fee recipient — the hardcoded value from settle-session/route.ts:75.
 * NOTE: .env.local also defines PLATFORM_WALLET_ADDRESS with a *different* value;
 * we deliberately default to the on-chain value the viewer path already uses so
 * the agent's split matches production. Override via the platformWallet param.
 */
export const PLATFORM_WALLET = "0xfa53779d7cb905489d84f1ab2da309624427cafa"

/** Creator / platform revenue split (settle-session/route.ts:77-78). */
export const DEFAULT_FEE_SPLIT = { creator: 0.8, platform: 0.2 } as const

/** EIP-712 domain identity for Circle Gateway batched payments. */
export const DOMAIN_NAME = "GatewayWalletBatched"
export const DOMAIN_VERSION = "1"

/** Authorization validity window (settle-session/route.ts:82-83, 136/149). */
export const VALID_AFTER_SKEW_SECONDS = 600 // backdate to absorb clock skew
export const VALID_BEFORE_WINDOW_SECONDS = 2592000 // 30 days

/** Resource descriptor echoed into the x402 envelope. */
export const RESOURCE_URL = "https://streamarc.app/watch"
