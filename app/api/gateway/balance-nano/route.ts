import { NextRequest, NextResponse } from "next/server"
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit"
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2"
import { getWalletBalance } from "@/app/lib/circle-wallets"
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

const kit = new UnifiedBalanceKit()

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 })

  try {
    const walletAddress = address as `0x${string}`

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("circle_wallet_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (!user?.circle_wallet_id) {
      return NextResponse.json({ error: "Wallet not registered" }, { status: 404 })
    }

    const provider = createCircleEip1193Provider({
      walletId: user.circle_wallet_id,
      address: walletAddress,
    })
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: "developer-controlled" },
    })

    const [walletBalance, gatewayResult] = await Promise.all([
      getWalletBalance(walletAddress),
      kit
        .getBalances({
          sources: [{ adapter, address: walletAddress, chains: "Arc_Testnet" }],
          networkType: "testnet",
          includePending: true,
        })
        .catch((err: unknown) => {
          console.error("UBK getBalances failed:", err instanceof Error ? err.message : err)
          return null
        }),
    ])

    const confirmed = parseFloat(gatewayResult?.totalConfirmedBalance ?? "0")
    const pending = parseFloat(gatewayResult?.totalPendingBalance ?? "0")

    return NextResponse.json({
      available: confirmed.toString(),
      total: (confirmed + pending).toString(),
      wallet: walletBalance.toString(),
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 })
  }
}
