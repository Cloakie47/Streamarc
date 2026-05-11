import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { publicEncrypt, constants, randomUUID } from "node:crypto"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import type { ChainOption } from "@/app/lib/chains"

let cachedCirclePublicKey: string | null = null

async function getCirclePublicKey(): Promise<string> {
  if (cachedCirclePublicKey) return cachedCirclePublicKey
  const res = await fetch("https://api.circle.com/v1/w3s/config/entity/publicKey", {
    headers: { Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`getCirclePublicKey failed: ${res.status} ${body}`)
  }
  const data = await res.json()
  const publicKey = data?.data?.publicKey
  if (typeof publicKey !== "string" || !publicKey) {
    throw new Error("getCirclePublicKey: no publicKey in response")
  }
  cachedCirclePublicKey = publicKey
  return publicKey
}

async function generateEntitySecretCiphertext(): Promise<string> {
  const publicKeyPem = await getCirclePublicKey()
  const entitySecretHex = process.env.CIRCLE_ENTITY_SECRET
  if (!entitySecretHex) throw new Error("CIRCLE_ENTITY_SECRET is missing from env")
  return publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(entitySecretHex, "hex"),
  ).toString("base64")
}

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, v) => {
        if (typeof v === "bigint") return v.toString()
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack }
        return v
      },
      2,
    )
  } catch (e) {
    return `[unserializable: ${(e as Error).message}]`
  }
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

export async function deriveChainWallet(
  userId: string,
  arcWalletAddress: string,
  targetChain: ChainOption,
): Promise<{ walletId: string; walletAddress: string }> {
  const supabase = getSupabaseAdmin()
  const chainKey = targetChain.circleBlockchain

  const { data: existing, error: lookupError } = await supabase
    .from("user_chain_wallets")
    .select("circle_wallet_id, wallet_address")
    .eq("user_id", userId)
    .eq("chain", chainKey)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`user_chain_wallets lookup failed: ${lookupError.message}`)
  }

  if (existing?.circle_wallet_id && existing?.wallet_address) {
    if (existing.wallet_address.toLowerCase() !== arcWalletAddress.toLowerCase()) {
      throw new Error(
        `[deriveChainWallet] cached ${chainKey} address mismatch for user ${userId}: arc=${arcWalletAddress} stored=${existing.wallet_address}`,
      )
    }
    return { walletId: existing.circle_wallet_id, walletAddress: existing.wallet_address }
  }

  const entitySecretCiphertext = await generateEntitySecretCiphertext()
  const idempotencyKey = randomUUID()
  const shortUserId = userId.slice(0, 8)
  const chainShort = targetChain.circleBlockchain.toLowerCase().replace("-", "")
  const derivePayload = {
    sourceBlockchain: "ARC-TESTNET",
    walletAddress: arcWalletAddress,
    targetBlockchain: chainKey,
    entitySecretCiphertext,
    idempotencyKey,
    metadata: { name: `sa-${chainShort}-${shortUserId}`, refId: `${chainShort}-${shortUserId}` },
  }
  console.log("[deriveChainWallet] calling deriveWalletByAddress (direct fetch) with payload:", JSON.stringify({
    ...derivePayload,
    entitySecretCiphertext: `<${entitySecretCiphertext.length}-char base64>`,
  }))

  let res: Response
  try {
    res = await fetch("https://api.circle.com/v1/w3s/developer/wallets/derive", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
      body: JSON.stringify(derivePayload),
    })
  } catch (err: any) {
    const dump: Record<string, unknown> = {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      cause: err?.cause,
      causeJson: safeStringify(err?.cause),
      ownKeys: err && typeof err === "object" ? Object.keys(err) : [],
      errorString: String(err),
    }
    console.error("[deriveChainWallet] fetch threw before response. error dump:", JSON.stringify(dump, null, 2))
    throw err
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.error("[deriveChainWallet] deriveWalletByAddress non-2xx:", res.status, res.statusText, "body:", safeStringify(body))
    throw new Error(`deriveWalletByAddress failed: ${res.status} ${JSON.stringify(body)}`)
  }

  const data = await res.json()
  console.log("[deriveChainWallet] deriveWalletByAddress returned:", safeStringify(data?.data))

  const derived = data?.data?.wallet
  if (!derived?.id || !derived?.address) {
    throw new Error("deriveWalletByAddress: no wallet in response")
  }

  if (derived.address.toLowerCase() !== arcWalletAddress.toLowerCase()) {
    throw new Error(
      `[deriveChainWallet] ADDRESS MISMATCH on derive for user ${userId} chain ${chainKey}: arc=${arcWalletAddress} derived=${derived.address}`,
    )
  }

  const { error: insertError } = await supabase.from("user_chain_wallets").insert({
    user_id: userId,
    chain: chainKey,
    circle_wallet_id: derived.id,
    wallet_address: derived.address,
  })

  if (insertError) {
    // Treat as non-fatal if it's a uniqueness violation from a concurrent insert; re-read.
    if (insertError.code === "23505") {
      const { data: raced } = await supabase
        .from("user_chain_wallets")
        .select("circle_wallet_id, wallet_address")
        .eq("user_id", userId)
        .eq("chain", chainKey)
        .single()
      if (raced?.circle_wallet_id && raced?.wallet_address) {
        return { walletId: raced.circle_wallet_id, walletAddress: raced.wallet_address }
      }
    }
    throw new Error(`user_chain_wallets insert failed: ${insertError.message}`)
  }

  console.log("Derived chain wallet:", { userId, chain: chainKey, walletId: derived.id, walletAddress: derived.address })
  return { walletId: derived.id, walletAddress: derived.address }
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
