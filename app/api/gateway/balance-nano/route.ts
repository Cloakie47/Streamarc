import { NextRequest, NextResponse } from "next/server"
import { GatewayClient } from "@circle-fin/x402-batching/client"

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey: "0x0000000000000000000000000000000000000000000000000000000000000001",
})

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 })

  try {
    const balances = await client.getBalances(address as `0x${string}`)
    return NextResponse.json({
      available: balances.gateway.formattedAvailable,
      total: balances.gateway.formattedTotal,
      wallet: balances.wallet.formatted,
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 })
  }
}
