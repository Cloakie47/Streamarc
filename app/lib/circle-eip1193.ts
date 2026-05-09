import { randomUUID } from "crypto"
import { createPublicClient, defineChain, formatEther, http, type EIP1193Provider, type EIP1193RequestFn } from "viem"
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"

const ARC_TESTNET_CHAIN_ID = 5042002
const ARC_TESTNET_RPC_URL = process.env.ARC_TESTNET_RPC_URL ?? "https://rpc-testnet.arcscan.app"

export const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC_URL] } },
})

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET_RPC_URL) })

function getCircleClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

type CircleClient = ReturnType<typeof getCircleClient>

async function waitForTx(client: CircleClient, txId: string, maxWait = 60000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await client.getTransaction({ id: txId })
    const tx = res.data?.transaction
    if (tx?.state === "COMPLETE") {
      const hash = tx.txHash
      if (!hash) throw new Error("Circle transaction COMPLETE but txHash missing")
      return hash
    }
    if (tx?.state === "FAILED" || tx?.state === "CANCELLED") {
      throw new Error(`Circle transaction ${tx.state}: ${txId}`)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error(`Circle transaction timeout: ${txId}`)
}

export interface CircleEip1193ProviderOptions {
  walletId: string
  address: `0x${string}`
}

export function createCircleEip1193Provider({ walletId, address }: CircleEip1193ProviderOptions): EIP1193Provider {
  const lowerAddress = address.toLowerCase() as `0x${string}`

  const request: EIP1193RequestFn = (async ({ method, params }: { method: string; params?: unknown }) => {
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return [lowerAddress]

      case "eth_chainId":
        return `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`

      case "wallet_switchEthereumChain":
        return null

      case "eth_signTypedData_v4":
      case "eth_signTypedData": {
        const [from, data] = params as [string, string]
        if (from.toLowerCase() !== lowerAddress) {
          throw new Error(`Sign request for ${from} but provider holds ${lowerAddress}`)
        }
        const client = getCircleClient()
        const res = await client.signTypedData({ walletId, data })
        const signature = res.data?.signature
        if (!signature) throw new Error("Circle signTypedData returned no signature")
        return signature
      }

      case "personal_sign":
      case "eth_sign": {
        const [a, b] = params as [string, string]
        const signer = method === "personal_sign" ? b : a
        const message = method === "personal_sign" ? a : b
        if (signer.toLowerCase() !== lowerAddress) {
          throw new Error(`Sign request for ${signer} but provider holds ${lowerAddress}`)
        }
        const client = getCircleClient()
        const res = await client.signMessage({ walletId, message, encodedByHex: message.startsWith("0x") })
        const signature = res.data?.signature
        if (!signature) throw new Error("Circle signMessage returned no signature")
        return signature
      }

      case "eth_sendTransaction": {
        const [tx] = params as [{ from?: string; to: string; data?: string; value?: string }]
        if (tx.from && tx.from.toLowerCase() !== lowerAddress) {
          throw new Error(`Tx from ${tx.from} but provider holds ${lowerAddress}`)
        }
        if (!tx.to) throw new Error("eth_sendTransaction requires `to` (contract creation not supported)")

        const valueWei = tx.value ? BigInt(tx.value) : BigInt(0)
        const client = getCircleClient()
        const res = await client.createContractExecutionTransaction({
          walletId,
          contractAddress: tx.to,
          callData: (tx.data ?? "0x") as `0x${string}`,
          ...(valueWei > BigInt(0) ? { amount: formatEther(valueWei) } : {}),
          fee: { type: "level", config: { feeLevel: "MEDIUM" } },
          idempotencyKey: randomUUID(),
        })
        const txId = res.data?.id
        if (!txId) throw new Error("Circle createContractExecutionTransaction returned no id")
        return await waitForTx(client, txId)
      }

      default:
        return await publicClient.request({ method, params } as Parameters<typeof publicClient.request>[0])
    }
  }) as EIP1193RequestFn

  return {
    request,
    on: () => {},
    removeListener: () => {},
  } as EIP1193Provider
}
