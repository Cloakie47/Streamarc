import { NextRequest, NextResponse } from "next/server";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { getWalletBalance } from "@/app/lib/circle-wallets";
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

const gatewayClient = new GatewayClient({
  chain: "arcTestnet",
  privateKey:
    "0x0000000000000000000000000000000000000000000000000000000000000001",
});

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address, gateway_balance")
      .eq("id", user_id)
      .single();

    if (!user?.wallet_address) {
      return NextResponse.json({
        balance: 0,
        wallet_balance: 0,
        wallet_address: null,
      });
    }

    const [walletBalance, gatewayBalances] = await Promise.all([
      getWalletBalance(user.wallet_address),
      gatewayClient
        .getBalances(user.wallet_address as `0x${string}`)
        .catch(() => null),
    ]);

    const gatewayBalance = parseFloat(
      gatewayBalances?.gateway?.formattedAvailable ?? "0",
    );

    await getSupabaseAdmin()
      .from("users")
      .update({ gateway_balance: gatewayBalance })
      .eq("id", user_id);

    return NextResponse.json({
      balance: gatewayBalance,
      wallet_balance: walletBalance,
      wallet_address: user.wallet_address,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
