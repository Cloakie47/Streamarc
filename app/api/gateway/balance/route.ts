import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, erc20Abi } from "viem";
import { arcTestnet } from "viem/chains";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

const GATEWAY_BALANCES_URL = "https://gateway-api-testnet.circle.com/v1/balances";
const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http() });

interface GatewayChainBalance {
  domain: number;
  depositor: string;
  balance: string;
  pendingBatch?: string;
}

async function fetchChainBalances(walletAddress: string): Promise<GatewayChainBalance[]> {
  const requestBody = {
    token: "USDC",
    sources: [
      { depositor: walletAddress, domain: 26 }, // ARC
      { depositor: walletAddress, domain: 6 },  // Base Sepolia
      { depositor: walletAddress, domain: 1 },  // Avalanche Fuji
      { depositor: walletAddress, domain: 0 },  // Ethereum Sepolia
    ],
  };
  try {
    const res = await fetch(GATEWAY_BALANCES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[chain balances] non-2xx:", res.status, res.statusText, "body:", errBody);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data?.balances) ? (data.balances as GatewayChainBalance[]) : [];
  } catch (err) {
    console.error("[chain balances] fetch threw:", err instanceof Error ? err.message : err);
    return [];
  }
}

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
        pending_balance: 0,
        wallet_balance: 0,
        wallet_address: user?.wallet_address ?? null,
        chain_balances: [],
      });
    }

    const walletAddress = user.wallet_address as `0x${string}`;

    const [walletBalance, chainBalances] = await Promise.all([
      readArcUsdcBalance(walletAddress),
      fetchChainBalances(walletAddress),
    ]);

    const totalGatewayBalance = chainBalances.reduce(
      (sum, b) => sum + parseFloat(b.balance || "0"),
      0,
    );
    const totalPendingBalance = chainBalances.reduce(
      (sum, b) => sum + parseFloat(b.pendingBatch || "0"),
      0,
    );

    console.log(
      "Gateway balance:",
      totalGatewayBalance,
      "chains:",
      chainBalances.map((b) => `d${b.domain}:${b.balance}`).join(" "),
    );

    return NextResponse.json({
      balance: totalGatewayBalance,
      pending_balance: totalPendingBalance,
      wallet_balance: walletBalance,
      wallet_address: walletAddress,
      chain_balances: chainBalances,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
