import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, erc20Abi } from "viem";
import { arcTestnet } from "viem/chains";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { fetchUnifiedGatewayBalance } from "@/app/lib/gateway-balance";

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http() });

async function readArcUsdcBalance(walletAddress: `0x${string}`): Promise<number> {
  try {
    const raw = (await arcPublicClient.readContract({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    })) as bigint;
    return Number(raw) / 1e6;
  } catch (err) {
    console.error("[arc wallet balance] read failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

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
        spendable: 0,
        total: 0,
        pending_balance: 0,
        wallet_balance: 0,
        wallet_address: user?.wallet_address ?? null,
        chain_balances: [],
      });
    }

    const walletAddress = user.wallet_address as `0x${string}`;

    const [walletBalance, gateway] = await Promise.all([
      readArcUsdcBalance(walletAddress),
      fetchUnifiedGatewayBalance(walletAddress),
    ]);

    // Nanopayment settlement on x402 pulls from the ARC domain (26) only —
    // unified `total` is informational, but `spendable` is what gates playback.
    const arcChain = gateway.chainBalances.find((b) => b.domain === 26);
    const spendable = arcChain ? parseFloat(arcChain.balance || "0") : 0;

    console.log(
      "Gateway balance: spendable=", spendable, "total=", gateway.total,
      "chains:",
      gateway.chainBalances.map((b) => `d${b.domain}:${b.balance}`).join(" "),
    );

    return NextResponse.json({
      balance: spendable,
      spendable,
      total: gateway.total,
      pending_balance: gateway.pending,
      wallet_balance: walletBalance,
      wallet_address: walletAddress,
      chain_balances: gateway.chainBalances,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
