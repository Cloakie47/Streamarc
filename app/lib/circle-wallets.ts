import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

export interface CircleWallet {
  id: string
  address: string
  eoaId?: string
  eoaAddress?: string
}

export async function createGatewayWallet(userId: string): Promise<CircleWallet | null> {
  try {
    if (!process.env.CIRCLE_WALLET_SET_ID) {
      console.error("CIRCLE_WALLET_SET_ID is missing from env")
      return null
    }

    const client = getClient()

    // Check if wallet already exists for this userId via refId
    const existing = await client.listWallets({ refId: userId })
    const existingWallet = existing.data?.wallets?.[0]
    if (existingWallet?.id && existingWallet?.address) {
      console.log("Existing Circle wallet found:", { id: existingWallet.id, address: existingWallet.address, userId })
      return {
        id: existingWallet.id,
        address: existingWallet.address,
        eoaId: undefined,
        eoaAddress: undefined,
      }
    }

    // Create EOA wallet
    const response = await client.createWallets({
      walletSetId: process.env.CIRCLE_WALLET_SET_ID!,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "EOA",
      metadata: [{ name: `streamarc-${userId}`, refId: userId }],
    })

    const wallet = response.data?.wallets?.[0]
    if (!wallet?.address || !wallet?.id) return null

    console.log("Circle EOA wallet created:", { id: wallet.id, address: wallet.address, userId })
    return {
      id: wallet.id,
      address: wallet.address,
      eoaId: undefined,
      eoaAddress: undefined,
    }
  } catch (err: any) {
    console.error("Failed to create Circle wallet:", err?.message, err?.response?.data)
    return null
  }
}

export async function getWalletBalance(walletAddress: string): Promise<number> {
  try {
    const client = getClient()
    const wallets = await client.listWallets({ address: walletAddress })
    const walletId = wallets.data?.wallets?.[0]?.id
    if (!walletId) return 0

    const balances = await client.getWalletTokenBalance({ id: walletId })
    const usdc = balances.data?.tokenBalances?.find(
      (b: { token?: { symbol?: string } }) => b.token?.symbol === "USDC"
    )
    return parseFloat(usdc?.amount || "0")
  } catch (err: any) {
    console.error("Failed to get wallet balance:", err?.message)
    return 0
  }
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
