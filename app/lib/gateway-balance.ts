// Shared Gateway-balance fetch: sums USDC across all four supported chains
// (ARC 26, Base Sepolia 6, Avalanche Fuji 1, Ethereum Sepolia 0) for a single
// depositor address. Used by /api/gateway/balance and /api/watch/init so the
// sidebar and watch page always agree on the unified total.

const GATEWAY_BALANCES_URL = "https://gateway-api-testnet.circle.com/v1/balances";

export interface GatewayChainBalance {
  domain: number;
  depositor: string;
  balance: string;
  pendingBatch?: string;
}

export interface UnifiedGatewayBalance {
  total: number;
  pending: number;
  chainBalances: GatewayChainBalance[];
}

export async function fetchUnifiedGatewayBalance(
  walletAddress: string,
): Promise<UnifiedGatewayBalance> {
  try {
    const res = await fetch(GATEWAY_BALANCES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "USDC",
        sources: [
          { depositor: walletAddress, domain: 26 }, // ARC
          { depositor: walletAddress, domain: 6 },  // Base Sepolia
          { depositor: walletAddress, domain: 1 },  // Avalanche Fuji
          { depositor: walletAddress, domain: 0 },  // Ethereum Sepolia
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(
        "[gateway-balance] non-2xx:",
        res.status,
        res.statusText,
        "body:",
        errBody,
      );
      return { total: 0, pending: 0, chainBalances: [] };
    }

    const data = await res.json();
    const balances = (Array.isArray(data?.balances) ? data.balances : []) as GatewayChainBalance[];
    const total = balances.reduce((sum, b) => sum + parseFloat(b.balance || "0"), 0);
    const pending = balances.reduce((sum, b) => sum + parseFloat(b.pendingBatch || "0"), 0);
    return { total, pending, chainBalances: balances };
  } catch (err) {
    console.error(
      "[gateway-balance] fetch threw:",
      err instanceof Error ? err.message : err,
    );
    return { total: 0, pending: 0, chainBalances: [] };
  }
}
