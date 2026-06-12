// Circle signing primitives — copied verbatim (behavior-preserving) from
// app/lib/circle-wallets.ts (getClient, getWalletIdByAddress, signTypedDataWithWallet)
// and app/api/gateway/settle-session/route.ts (randomNonce).
//
// Copied, not imported, on purpose: circle-wallets.ts pulls in Supabase/chain
// helpers via "@/..." path aliases that don't resolve under plain Node, and the
// build report (§7.2) calls for these to be copied so the agent path can never
// regress the viewer path.

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"

export function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

/** Random 32-byte hex nonce for EIP-3009 TransferWithAuthorization. */
export function randomNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function getWalletIdByAddress(address: string): Promise<string | null> {
  try {
    const client = getClient()
    const res = await client.listWallets({ address })
    return res.data?.wallets?.[0]?.id || null
  } catch {
    return null
  }
}

export async function signTypedDataWithWallet(
  walletId: string,
  domain: {
    name: string
    version: string
    chainId?: number
    verifyingContract?: string
  },
  types: Record<string, Array<{ name: string; type: string }>>,
  primaryType: string,
  message: Record<string, unknown>,
): Promise<string | null> {
  try {
    const client = getClient()
    const EIP712Domain = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      ...(domain.chainId !== undefined ? [{ name: "chainId", type: "uint256" }] : []),
      ...(domain.verifyingContract !== undefined ? [{ name: "verifyingContract", type: "address" }] : []),
    ]
    const data = JSON.stringify({
      types: {
        EIP712Domain,
        ...types,
      },
      primaryType,
      domain,
      message,
    })

    const res = await client.signTypedData({ walletId, data })
    return res.data?.signature || null
  } catch (err: any) {
    console.error("Failed to sign typed data:", err?.message, err?.response?.data)
    return null
  }
}
