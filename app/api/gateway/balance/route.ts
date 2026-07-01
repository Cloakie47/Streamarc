import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, erc20Abi } from "viem";
import { arcTestnet } from "viem/chains";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { fetchUnifiedGatewayBalance } from "@/app/lib/gateway-balance";
import { createGatewayWallet } from "@/app/lib/circle-wallets";
import { withTimeout } from "@/app/lib/with-timeout";

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

const arcPublicClient = createPublicClient({ chain: arcTestnet, transport: http() });

// Budget for the two external reads (Circle Gateway + ARC RPC). Past this we
// serve the last-known-good snapshot instead of blocking the page.
const BALANCE_READ_TIMEOUT_MS = 3500;

interface BalancePayload {
  balance: number;
  spendable: number;
  total: number;
  pending_balance: number;
  wallet_balance: number;
  wallet_address: string;
  chain_balances: unknown[];
}

// Last successful read per wallet. spendable gates playback, so a slow or
// failed Circle read must degrade to STALE data (or "unknown"), never to a
// hard zero that would block a funded viewer. Single-process deploy, so
// module-level state is fine (same pattern as rate-limit).
const lastKnownBalance = new Map<string, BalancePayload>();

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

    let { data: user } = await supabase
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single();

    // Lazy wallet provisioning: if signup couldn't create the Circle wallet in
    // time (see /api/auth/verify-email), create it now (idempotent) so the user
    // isn't left permanently wallet-less. Bounded so this never hangs the balance.
    if (user_id && (!user?.wallet_address || !user?.circle_wallet_id)) {
      const wallet = await withTimeout(createGatewayWallet(user_id), 15000, null);
      if (wallet) {
        await supabase
          .from("users")
          .update({ wallet_address: wallet.address, circle_wallet_id: wallet.id })
          .eq("id", user_id);
        user = { wallet_address: wallet.address, circle_wallet_id: wallet.id };
      }
    }

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
      withTimeout(readArcUsdcBalance(walletAddress), BALANCE_READ_TIMEOUT_MS, null),
      withTimeout(fetchUnifiedGatewayBalance(walletAddress), BALANCE_READ_TIMEOUT_MS, null),
    ]);

    // Empty chainBalances is the shape fetchUnifiedGatewayBalance returns when
    // Circle errored — indistinguishable from success only in the happy path,
    // so treat it like a timeout and fall back rather than report $0.
    const gatewayFailed = !gateway || gateway.chainBalances.length === 0;
    if (gatewayFailed) {
      const cached = lastKnownBalance.get(walletAddress);
      if (cached) {
        console.warn("[gateway balance] read timed out/failed — serving last-known for", walletAddress);
        return NextResponse.json({ ...cached, stale: true });
      }
      // No last-known snapshot: report "unknown" by OMITTING the numeric keys.
      // Every client guards with typeof/!== undefined checks and keeps its
      // current value — nothing may interpret a timeout as a zero balance.
      console.warn("[gateway balance] read timed out/failed — no cache, returning unknown for", walletAddress);
      return NextResponse.json({ unknown: true, wallet_address: walletAddress });
    }

    // Nanopayment settlement on x402 pulls from the ARC domain (26) only —
    // unified `total` is informational, but `spendable` is what gates playback.
    const arcChain = gateway.chainBalances.find((b) => b.domain === 26);
    const spendable = arcChain ? parseFloat(arcChain.balance || "0") : 0;

    console.log(
      "Gateway balance: spendable=", spendable, "total=", gateway.total,
      "chains:",
      gateway.chainBalances.map((b) => `d${b.domain}:${b.balance}`).join(" "),
    );

    const payload: BalancePayload = {
      balance: spendable,
      spendable,
      total: gateway.total,
      pending_balance: gateway.pending,
      wallet_balance: walletBalance ?? lastKnownBalance.get(walletAddress)?.wallet_balance ?? 0,
      wallet_address: walletAddress,
      chain_balances: gateway.chainBalances,
    };
    lastKnownBalance.set(walletAddress, payload);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
