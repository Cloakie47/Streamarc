// EIP-3009 / x402 envelope builders — extracted verbatim from
// app/api/gateway/settle-session/route.ts (domain, types, buildPayload,
// buildRequirements), parameterized by chain/contract instead of hardcoded.

import { DOMAIN_NAME, DOMAIN_VERSION, RESOURCE_URL } from "./constants.ts"

export interface ChainContext {
  chainId: number
  gatewayWallet: string
  usdcAddress: string
  network: string
}

/** EIP-712 domain for Circle Gateway batched payments (route lines 102-107). */
export function buildDomain({ chainId, gatewayWallet }: { chainId: number; gatewayWallet: string }) {
  return {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract: gatewayWallet,
  }
}

/** TransferWithAuthorization struct (route lines 109-118). */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

export interface Authorization {
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}

/** x402 PaymentPayload (route lines 164-190). */
export function buildPayload(authorization: Authorization, signature: string, chain: ChainContext) {
  return {
    x402Version: 2,
    scheme: "exact",
    network: chain.network,
    resource: { url: RESOURCE_URL, description: "StreamArc video", mimeType: "application/json" },
    accepted: {
      x402Version: 2,
      scheme: "exact",
      network: chain.network,
      asset: chain.usdcAddress,
      amount: authorization.value,
      payTo: authorization.to,
      maxTimeoutSeconds: 2592000,
      extra: { name: DOMAIN_NAME, version: DOMAIN_VERSION, verifyingContract: chain.gatewayWallet },
    },
    payload: {
      signature,
      authorization,
    },
  }
}

/** x402 PaymentRequirements (route lines 192-204). */
export function buildRequirements(to: string, amount: string, chain: ChainContext) {
  return {
    scheme: "exact",
    network: chain.network,
    amount,
    maxAmountRequired: amount,
    resource: RESOURCE_URL,
    description: "StreamArc pay-per-second video",
    mimeType: "application/json",
    payTo: to,
    maxTimeoutSeconds: 2592000,
    asset: chain.usdcAddress,
    extra: { name: DOMAIN_NAME, version: DOMAIN_VERSION, verifyingContract: chain.gatewayWallet },
  }
}
