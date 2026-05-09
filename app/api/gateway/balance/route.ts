import { NextRequest, NextResponse } from "next/server";
import { UnifiedBalanceKit } from "@circle-fin/unified-balance-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { getWalletBalance } from "@/app/lib/circle-wallets";
import { createCircleEip1193Provider } from "@/app/lib/circle-eip1193";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

const kit = new UnifiedBalanceKit();

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: user } = await supabase
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single();

    if (!user?.wallet_address || !user?.circle_wallet_id) {
      return NextResponse.json({
        balance: 0,
        wallet_balance: 0,
        wallet_address: user?.wallet_address ?? null,
      });
    }

    const walletAddress = user.wallet_address as `0x${string}`;
    const provider = createCircleEip1193Provider({
      walletId: user.circle_wallet_id,
      address: walletAddress,
    });
    const adapter = await createViemAdapterFromProvider({
      provider,
      capabilities: { addressContext: "developer-controlled" },
    });

    const [walletBalance, gatewayResult] = await Promise.all([
      getWalletBalance(walletAddress),
      kit
        .getBalances({
          sources: [{ adapter, address: walletAddress, chains: "Arc_Testnet" }],
          networkType: "testnet",
        })
        .catch((err: unknown) => {
          console.error("UBK getBalances failed:", err instanceof Error ? err.message : err);
          return null;
        }),
    ]);

    const gatewayBalance = parseFloat(gatewayResult?.totalConfirmedBalance ?? "0");

    return NextResponse.json({
      balance: gatewayBalance,
      wallet_balance: walletBalance,
      wallet_address: walletAddress,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
