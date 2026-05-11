"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  ExternalLink,
  RefreshCw,
  Wallet,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createPublicClient, http, erc20Abi, type Chain } from "viem";
import { arcTestnet, baseSepolia, avalancheFuji, sepolia } from "viem/chains";
import { SUPPORTED_CHAINS, type ChainOption } from "@/app/lib/chains";

const ARC_TESTNET = "Arc_Testnet";
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const GATEWAY_FEE_BPS = 0.00005; // 0.005% on cross-chain spend
const CROSS_CHAIN_PLATFORM_FEE = 0.10;
const PAGE_SIZE = 10;

const VIEM_CHAINS: Record<string, Chain> = {
  Arc_Testnet: arcTestnet,
  Base_Sepolia: baseSepolia,
  Avalanche_Fuji: avalancheFuji,
  Ethereum_Sepolia: sepolia,
};

const EXPLORER_BASE: Record<string, string> = {
  Arc_Testnet: "https://testnet.arcscan.app/tx",
  Base_Sepolia: "https://sepolia.basescan.org/tx",
  Avalanche_Fuji: "https://testnet.snowtrace.io/tx",
  Ethereum_Sepolia: "https://sepolia.etherscan.io/tx",
};

function publicClientFor(chainId: string) {
  const chain = VIEM_CHAINS[chainId];
  if (!chain) return null;
  return createPublicClient({ chain, transport: http() });
}

function explorerUrl(chainId: string, txHash: string) {
  const base = EXPLORER_BASE[chainId] ?? EXPLORER_BASE.Arc_Testnet;
  return `${base}/${txHash}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface Transaction {
  id: string;
  type: string;
  source_chain: string | null;
  destination_chain: string | null;
  amount: number;
  fee: number | null;
  recipient_address: string | null;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

interface ChainRow {
  chainId: string;
  gasBalance: bigint | null;
  usdcBalance: bigint | null;
  loading: boolean;
}

export default function WalletPage({ userId, walletAddress }: { userId: string; walletAddress: string }) {
  const [gatewayBalance, setGatewayBalance] = useState(0);
  const [refreshingTopBar, setRefreshingTopBar] = useState(false);
  const [copied, setCopied] = useState(false);

  const [chainRows, setChainRows] = useState<ChainRow[]>(() =>
    SUPPORTED_CHAINS.map((c) => ({ chainId: c.id, gasBalance: null, usdcBalance: null, loading: true })),
  );

  // Deposit state
  const [depositChain, setDepositChain] = useState(ARC_TESTNET);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositGasError, setDepositGasError] = useState<
    | null
    | { nativeToken: string; walletAddress: string; faucetUrl: string; chainName: string }
  >(null);
  const [depositResult, setDepositResult] = useState<{ hash: string; chain: string; explorer: string } | null>(null);

  // Withdraw state
  const [wdChain, setWdChain] = useState(ARC_TESTNET);
  const [wdAmount, setWdAmount] = useState("");
  const [wdDestination, setWdDestination] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawResult, setWithdrawResult] = useState<{ hash: string; chain: string } | null>(null);

  // Send state
  const [sendChain, setSendChain] = useState(ARC_TESTNET);
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ hash: string; explorer: string } | null>(null);

  // Transactions state
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txsLoading, setTxsLoading] = useState(true);
  const [historyChainFilter, setHistoryChainFilter] = useState("all");
  const [historyTypeFilter, setHistoryTypeFilter] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);

  const refreshGatewayBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (typeof data.balance === "number") setGatewayBalance(data.balance);
    } catch {
      // keep stale
    }
  }, [userId]);

  const refreshChainRow = useCallback(
    async (chain: ChainOption): Promise<ChainRow> => {
      const client = publicClientFor(chain.id);
      if (!client || !walletAddress || !EVM_ADDRESS_RE.test(walletAddress)) {
        return { chainId: chain.id, gasBalance: null, usdcBalance: null, loading: false };
      }
      try {
        const [gas, usdc] = await Promise.all([
          client.getBalance({ address: walletAddress as `0x${string}` }),
          client.readContract({
            address: chain.usdcAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [walletAddress as `0x${string}`],
          }) as Promise<bigint>,
        ]);
        return { chainId: chain.id, gasBalance: gas, usdcBalance: usdc, loading: false };
      } catch {
        return { chainId: chain.id, gasBalance: null, usdcBalance: null, loading: false };
      }
    },
    [walletAddress],
  );

  const refreshAllChainRows = useCallback(async () => {
    setChainRows((rows) => rows.map((r) => ({ ...r, loading: true })));
    const next = await Promise.all(SUPPORTED_CHAINS.map(refreshChainRow));
    setChainRows(next);
  }, [refreshChainRow]);

  const filtersActive = historyChainFilter !== "all" || historyTypeFilter !== "all";

  const refreshTransactions = useCallback(async () => {
    setTxsLoading(true);
    try {
      // When filters are active, fetch up to 50 rows and paginate/filter client-side.
      // When the view is unfiltered, page server-side a single PAGE_SIZE window at a time.
      const body = filtersActive
        ? { user_id: userId, limit: 50 }
        : { user_id: userId, limit: PAGE_SIZE, offset: (historyPage - 1) * PAGE_SIZE };
      const res = await fetch("/api/wallet/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setTxs([]);
        return;
      }
      const data = await res.json();
      setTxs(Array.isArray(data.transactions) ? data.transactions : []);
    } catch {
      setTxs([]);
    } finally {
      setTxsLoading(false);
    }
  }, [userId, filtersActive, historyPage]);

  const refreshAll = useCallback(async () => {
    setRefreshingTopBar(true);
    await Promise.all([refreshGatewayBalance(), refreshAllChainRows(), refreshTransactions()]);
    setRefreshingTopBar(false);
  }, [refreshGatewayBalance, refreshAllChainRows, refreshTransactions]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const handler = () => {
      refreshGatewayBalance();
      refreshAllChainRows();
      refreshTransactions();
    };
    window.addEventListener("gateway-balance-updated", handler);
    return () => window.removeEventListener("gateway-balance-updated", handler);
  }, [refreshGatewayBalance, refreshAllChainRows, refreshTransactions]);

  // Map chainId → last tx status (for chain table column)
  const lastTxStatusByChain = useMemo(() => {
    const map = new Map<string, string>();
    for (const tx of txs) {
      const ids = [tx.destination_chain, tx.source_chain].filter(Boolean) as string[];
      for (const id of ids) {
        if (!map.has(id)) map.set(id, tx.status);
      }
    }
    return map;
  }, [txs]);

  const usdcBalanceFor = (chainId: string): number => {
    const row = chainRows.find((r) => r.chainId === chainId);
    if (!row || row.usdcBalance === null) return 0;
    return Number(row.usdcBalance) / 1e6;
  };

  const handleDeposit = async () => {
    if (!userId) return;
    setDepositing(true);
    setDepositError(null);
    setDepositGasError(null);
    setDepositResult(null);

    const previousGateway = gatewayBalance;

    try {
      const res = await fetch("/api/gateway/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          amount: depositAmount || undefined,
          source_chain: depositChain,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.native_token && data?.wallet_address) {
          setDepositGasError({
            nativeToken: data.native_token,
            walletAddress: data.wallet_address,
            faucetUrl: data.faucet_url ?? "https://faucet.circle.com",
            chainName: data.chain_name ?? SUPPORTED_CHAINS.find((c) => c.id === depositChain)?.name ?? depositChain,
          });
        } else {
          setDepositError(data?.error ?? "Deposit failed");
        }
        return;
      }
      const hash = data.tx_hash ?? data.deposit_tx ?? null;
      if (hash) {
        setDepositResult({
          hash,
          chain: data.chain ?? depositChain,
          explorer: data.explorer_url ?? EXPLORER_BASE[depositChain] ?? EXPLORER_BASE.Arc_Testnet,
        });
      }
      setDepositAmount("");
      window.dispatchEvent(new CustomEvent("gateway-balance-updated"));
      // Poll Gateway balance briefly so the headline number updates if indexing is quick
      void pollUntil(async () => {
        await refreshGatewayBalance();
        return gatewayBalance > previousGateway;
      }, 6, 5000);
      refreshAllChainRows();
      refreshTransactions();
    } catch {
      setDepositError("Deposit failed");
    } finally {
      setDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (!userId) return;
    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawResult(null);
    try {
      const body: Record<string, string> = {
        user_id: userId,
        amount: wdAmount,
        destination_chain: wdChain,
      };
      if (wdDestination) body.destination_address = wdDestination;
      const res = await fetch("/api/gateway/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setWithdrawError(data?.error ?? "Withdrawal failed");
        return;
      }
      const hash = data.tx_hash ?? null;
      if (hash) setWithdrawResult({ hash, chain: wdChain });
      setWdAmount("");
      setWdDestination("");
      window.dispatchEvent(new CustomEvent("gateway-balance-updated"));
      refreshGatewayBalance();
      refreshAllChainRows();
      refreshTransactions();
    } catch {
      setWithdrawError("Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleSend = async () => {
    if (!userId) return;
    setSendError(null);
    setSendResult(null);

    if (!EVM_ADDRESS_RE.test(sendAddress)) {
      setSendError("Recipient address must be a valid 0x… address");
      return;
    }
    const sendAmountNum = parseFloat(sendAmount);
    if (isNaN(sendAmountNum) || sendAmountNum <= 0) {
      setSendError("Amount must be greater than 0");
      return;
    }
    // Only enforce the on-chain balance ceiling when we have a confirmed reading
    // from the chain table for the SELECTED chain — if Section 2's balanceOf hasn't
    // resolved (or failed), let the server reject rather than blocking the user.
    const selectedRow = chainRows.find((r) => r.chainId === sendChain);
    const selectedChainName = SUPPORTED_CHAINS.find((c) => c.id === sendChain)?.name ?? sendChain;
    if (selectedRow && selectedRow.usdcBalance !== null) {
      const onChainBalance = Number(selectedRow.usdcBalance) / 1e6;
      if (sendAmountNum > onChainBalance) {
        setSendError(`Amount exceeds ${selectedChainName} wallet USDC balance ($${onChainBalance.toFixed(4)})`);
        return;
      }
    }

    setSending(true);
    try {
      const res = await fetch("/api/gateway/send-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          destination_address: sendAddress,
          amount: sendAmount,
          source_chain: sendChain,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data?.error ?? "Send failed");
        return;
      }
      if (data.tx_hash) {
        setSendResult({
          hash: data.tx_hash,
          explorer: data.explorer_url ?? EXPLORER_BASE[sendChain] ?? EXPLORER_BASE.Arc_Testnet,
        });
      }
      setSendAddress("");
      setSendAmount("");
      refreshAllChainRows();
      refreshTransactions();
    } catch {
      setSendError("Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const filteredTxs = useMemo(() => {
    if (!filtersActive) return txs;
    // Per-type chain matching: deposits anchor to source (where USDC came FROM),
    // withdrawals anchor to destination (where it went TO), sends use source.
    // The loose `source OR destination` fallback only applies to unknown types.
    const matchesChain = (tx: Transaction) => {
      if (historyChainFilter === "all") return true;
      if (tx.type === "deposit") return tx.source_chain === historyChainFilter;
      if (tx.type === "withdraw") return tx.destination_chain === historyChainFilter;
      if (tx.type === "send") return tx.source_chain === historyChainFilter;
      return tx.source_chain === historyChainFilter || tx.destination_chain === historyChainFilter;
    };
    return txs.filter((tx) => {
      if (historyTypeFilter !== "all" && tx.type !== historyTypeFilter) return false;
      if (!matchesChain(tx)) return false;
      return true;
    });
  }, [txs, historyChainFilter, historyTypeFilter, filtersActive]);

  // Filtered view: classic client-side slice over up to 50 fetched rows.
  // Unfiltered view: server already returned exactly one page; total count is unknown,
  // so estimate totalPages from whether a full page came back.
  const totalPages = filtersActive
    ? Math.max(1, Math.ceil(filteredTxs.length / PAGE_SIZE))
    : txs.length === PAGE_SIZE
      ? historyPage + 1
      : historyPage;
  const safePage = filtersActive ? Math.min(historyPage, totalPages) : historyPage;
  const pagedTxs = filtersActive
    ? filteredTxs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    : txs;

  useEffect(() => {
    setHistoryPage(1);
  }, [historyChainFilter, historyTypeFilter]);

  // Deposit form helpers
  const depositChainCfg = SUPPORTED_CHAINS.find((c) => c.id === depositChain);
  const depositAvailable = usdcBalanceFor(depositChain);
  const depositIsNonArc = depositChain !== ARC_TESTNET;

  // Withdraw form helpers
  const wdChainCfg = SUPPORTED_CHAINS.find((c) => c.id === wdChain);
  const wdIsCrossChain = wdChain !== ARC_TESTNET;
  const wdAmountNum = parseFloat(wdAmount) || 0;
  const wdPlatformFee = wdIsCrossChain ? CROSS_CHAIN_PLATFORM_FEE : 0;
  const wdGatewayFee = wdIsCrossChain ? wdAmountNum * GATEWAY_FEE_BPS : 0;
  const wdYouReceive = Math.max(0, wdAmountNum - wdPlatformFee - wdGatewayFee);
  const wdMinimum = wdIsCrossChain ? 0.5 : 0.1;
  const wdAmountValid = wdAmountNum >= wdMinimum && wdAmountNum <= gatewayBalance;
  const wdDestValid = wdIsCrossChain
    ? EVM_ADDRESS_RE.test(wdDestination)
    : !wdDestination || EVM_ADDRESS_RE.test(wdDestination);

  return (
    <div className="flex flex-col gap-8 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
        <p className="mt-2 text-sm text-sa-text-3">
          Manage your Gateway balance, multi-chain wallet, deposits, withdrawals, and history.
        </p>
      </div>

      {/* Section 1 — Gateway Balance */}
      <section className="glass rounded-sa-card p-6 hover-lift">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Gateway balance
            </span>
            <span className="font-mono text-4xl font-bold tracking-tight text-sa-green tabular-nums">
              ${gatewayBalance.toFixed(4)}
            </span>
            <span className="text-xs text-sa-text-3">Unified balance across all chains</span>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshingTopBar}
            className="inline-flex items-center gap-2 rounded-xl border border-sa-border bg-sa-surface px-3 py-2 text-xs hover:border-sa-border-hover disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshingTopBar ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </section>

      {/* Wallet address ribbon */}
      <section className="glass rounded-sa-card p-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider text-sa-text-3 shrink-0">
          Circle wallet
        </span>
        <span className="font-mono tabular-nums text-xs text-foreground break-all">
          {walletAddress || "—"}
        </span>
        {walletAddress && (
          <button
            type="button"
            onClick={handleCopyAddress}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-sa-border px-2 py-1 text-[11px] text-sa-text-3 hover:text-foreground"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </section>

      {/* Section 2 — Chain Table */}
      <section className="glass rounded-sa-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-sa-border px-6 py-4">
          <h3 className="font-bold inline-flex items-center gap-2">
            <Wallet size={16} className="text-sa-accent" />
            Wallet balances by chain
          </h3>
          <button
            type="button"
            onClick={refreshAllChainRows}
            className="inline-flex items-center gap-1 text-xs text-sa-text-3 hover:text-foreground"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-sa-border/50 text-xs uppercase tracking-wider text-sa-text-3">
                <th className="px-6 py-3 font-bold">Chain</th>
                <th className="px-6 py-3 font-bold">Gas token</th>
                <th className="px-6 py-3 font-bold text-right">Gas balance</th>
                <th className="px-6 py-3 font-bold text-right">USDC balance</th>
                <th className="px-6 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sa-border/40">
              {SUPPORTED_CHAINS.map((chain) => {
                const row = chainRows.find((r) => r.chainId === chain.id);
                const loading = row?.loading ?? true;
                const gas = row?.gasBalance ?? null;
                const usdc = row?.usdcBalance ?? null;
                const lastStatus = lastTxStatusByChain.get(chain.id) ?? null;
                return (
                  <tr key={chain.id} className="hover:bg-sa-surface transition-colors">
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="text-base leading-none" aria-hidden>{chain.icon}</span>
                        <span className="text-foreground">{chain.name}</span>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sa-text-3">{chain.nativeToken}</td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums">
                      {loading ? (
                        <span className="inline-block h-3 w-16 rounded bg-sa-surface-2 animate-pulse" />
                      ) : gas === null ? (
                        <span className="text-sa-text-3">—</span>
                      ) : (
                        `${(Number(gas) / 1e18).toFixed(6)} ${chain.nativeToken}`
                      )}
                    </td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums">
                      {loading ? (
                        <span className="inline-block h-3 w-20 rounded bg-sa-surface-2 animate-pulse" />
                      ) : usdc === null ? (
                        <span className="text-sa-text-3">—</span>
                      ) : (
                        `$${(Number(usdc) / 1e6).toFixed(4)}`
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <StatusCell status={lastStatus} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3 — Deposit */}
      <section className="glass rounded-sa-card p-6 flex flex-col gap-5 hover-lift">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold inline-flex items-center gap-2">
            <ArrowDownToLine size={16} className="text-sa-green" />
            Deposit to Gateway
          </h3>
          <p className="text-xs text-sa-text-3">
            Move USDC from a source chain into your unified Gateway balance.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Source chain
            </label>
            <select
              value={depositChain}
              onChange={(e) => {
                setDepositChain(e.target.value);
                setDepositError(null);
                setDepositGasError(null);
                setDepositResult(null);
              }}
              className="field-surface h-11 px-3 text-sm"
            >
              {SUPPORTED_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Amount (USDC)
            </label>
            <input
              type="number"
              min="0.01"
              step="0.0001"
              placeholder={`Max $${depositAvailable.toFixed(4)}`}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="field-surface h-11 px-3 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 text-[11px] text-sa-text-3">
          <span>
            Available:{" "}
            <span className="font-mono text-foreground">${depositAvailable.toFixed(4)}</span>{" "}
            USDC on {depositChainCfg?.name ?? depositChain}
          </span>
          {depositIsNonArc && depositChainCfg && depositChainCfg.finalitySeconds >= 60 && (
            <span className="text-amber-400">
              ~{Math.round(depositChainCfg.finalitySeconds / 60)} min finality — Gateway balance
              updates after block finality on {depositChainCfg.name}.
            </span>
          )}
          {depositIsNonArc && depositChainCfg && (
            <span>
              Need {depositChainCfg.nativeToken} or testnet USDC?{" "}
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                faucet.circle.com
              </a>
            </span>
          )}
        </div>

        {depositError && <p className="text-xs text-sa-red">{depositError}</p>}
        {depositGasError && (
          <div className="rounded-xl border border-sa-red/40 bg-sa-red/[0.06] p-3 space-y-1">
            <p className="text-xs font-semibold text-sa-red">
              Insufficient {depositGasError.nativeToken} for gas on {depositGasError.chainName}
            </p>
            <p className="text-[11px] text-sa-text-3 break-all">
              Fund <span className="font-mono text-foreground">{depositGasError.walletAddress}</span>{" "}
              with {depositGasError.nativeToken} at{" "}
              <a
                href={depositGasError.faucetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                faucet.circle.com
              </a>
              .
            </p>
          </div>
        )}
        {depositResult && (
          <div className="space-y-1">
            <p className="text-xs text-sa-green">Deposit submitted on {depositResult.chain}.</p>
            <a
              href={`${depositResult.explorer}/${depositResult.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
            >
              <ExternalLink size={12} />
              {depositResult.hash.slice(0, 16)}…{depositResult.hash.slice(-8)}
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={handleDeposit}
          disabled={depositing || !(parseFloat(depositAmount) > 0)}
          className="btn btn-primary self-start disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {depositing ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Depositing…
            </>
          ) : (
            "Deposit"
          )}
        </button>
      </section>

      {/* Section 4 — Withdraw */}
      <section className="glass rounded-sa-card p-6 flex flex-col gap-5 hover-lift">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold inline-flex items-center gap-2">
            <ArrowUpFromLine size={16} className="text-sa-accent" />
            Withdraw from Gateway
          </h3>
          <p className="text-xs text-sa-text-3">
            Pull USDC from your Gateway balance. Same-chain Arc is free; cross-chain uses Circle&apos;s
            Forwarding Service.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Destination chain
            </label>
            <select
              value={wdChain}
              onChange={(e) => setWdChain(e.target.value)}
              className="field-surface h-11 px-3 text-sm"
            >
              {SUPPORTED_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Amount (USDC)
            </label>
            <input
              type="number"
              min={wdMinimum.toFixed(2)}
              step="0.0001"
              placeholder={`Min $${wdMinimum.toFixed(2)} · Max $${gatewayBalance.toFixed(4)}`}
              value={wdAmount}
              onChange={(e) => setWdAmount(e.target.value)}
              className="field-surface h-11 px-3 text-sm"
            />
          </div>
        </div>

        {wdIsCrossChain && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Destination address (required)
            </label>
            <input
              type="text"
              placeholder="0x…"
              value={wdDestination}
              onChange={(e) => setWdDestination(e.target.value)}
              className="field-surface h-11 px-3 text-sm font-mono"
            />
          </div>
        )}

        {wdAmountNum > 0 && (
          <div className="panel-muted p-4 space-y-1.5 text-sm font-mono">
            <FeeRow label="Amount" value={`$${wdAmountNum.toFixed(4)}`} />
            <FeeRow
              label={`Platform fee${wdIsCrossChain ? "" : " (Arc)"}`}
              value={`$${wdPlatformFee.toFixed(4)}`}
            />
            {wdIsCrossChain && (
              <FeeRow
                label="Gateway fee (0.005% cross-chain)"
                value={`$${wdGatewayFee.toFixed(6)}`}
              />
            )}
            <div className="my-1 h-px bg-sa-border" />
            <FeeRow label="You receive" value={`$${wdYouReceive.toFixed(4)}`} emphasis />
            {wdYouReceive <= 0 && wdAmountNum > 0 && (
              <p className="mt-2 text-xs text-sa-red font-sans">
                Amount is too small to cover fees. Increase the amount.
              </p>
            )}
          </div>
        )}

        {withdrawError && <p className="text-xs text-sa-red">{withdrawError}</p>}
        {withdrawResult && (
          <div className="space-y-1">
            <p className="text-xs text-sa-green">Withdrawal submitted on {wdChainCfg?.name ?? withdrawResult.chain}.</p>
            <a
              href={explorerUrl(withdrawResult.chain, withdrawResult.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
            >
              <ExternalLink size={12} />
              {withdrawResult.hash.slice(0, 16)}…{withdrawResult.hash.slice(-8)}
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={handleWithdraw}
          disabled={
            withdrawing || !wdAmountValid || !wdDestValid || wdYouReceive <= 0
          }
          className="btn btn-accent self-start disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {withdrawing ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Confirming…
            </>
          ) : (
            "Withdraw"
          )}
        </button>
      </section>

      {/* Section 5 — Send (Circle Wallet → External) */}
      <section className="glass rounded-sa-card p-6 flex flex-col gap-5 hover-lift">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold inline-flex items-center gap-2">
            <Send size={16} className="text-sa-blue" />
            Send USDC
          </h3>
          <p className="text-xs text-sa-text-3">
            Sends USDC from your Circle wallet to an external address on the selected chain.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Chain
            </label>
            <select
              value={sendChain}
              onChange={(e) => setSendChain(e.target.value)}
              className="field-surface h-11 px-3 text-sm"
            >
              {SUPPORTED_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              Amount (USDC)
            </label>
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              placeholder={`Max $${usdcBalanceFor(sendChain).toFixed(4)}`}
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              className="field-surface h-11 px-3 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
            Recipient address
          </label>
          <input
            type="text"
            placeholder="0x…"
            value={sendAddress}
            onChange={(e) => setSendAddress(e.target.value)}
            className="field-surface h-11 px-3 text-sm font-mono"
          />
        </div>

        {sendError && <p className="text-xs text-sa-red">{sendError}</p>}
        {sendResult && (
          <div className="space-y-1">
            <p className="text-xs text-sa-green">Send submitted.</p>
            <a
              href={`${sendResult.explorer}/${sendResult.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
            >
              <ExternalLink size={12} />
              {sendResult.hash.slice(0, 16)}…{sendResult.hash.slice(-8)}
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={
            sending ||
            !EVM_ADDRESS_RE.test(sendAddress) ||
            !(parseFloat(sendAmount) > 0)
          }
          className="btn btn-primary self-start disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Sending…
            </>
          ) : (
            "Send"
          )}
        </button>
      </section>

      {/* Section 6 — Transaction History */}
      <section className="glass rounded-sa-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-sa-border px-6 py-4 flex-wrap gap-3">
          <h3 className="font-bold inline-flex items-center gap-2">
            <Wallet size={16} className="text-sa-accent" />
            Transaction history
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={historyChainFilter}
              onChange={(e) => setHistoryChainFilter(e.target.value)}
              className="field-surface h-9 px-2 text-xs"
            >
              <option value="all">All chains</option>
              {SUPPORTED_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            <select
              value={historyTypeFilter}
              onChange={(e) => setHistoryTypeFilter(e.target.value)}
              className="field-surface h-9 px-2 text-xs"
            >
              <option value="all">All types</option>
              <option value="deposit">Deposit</option>
              <option value="withdraw">Withdraw</option>
              <option value="send">Send</option>
            </select>
            <button
              type="button"
              onClick={refreshTransactions}
              className="inline-flex items-center gap-1 text-xs text-sa-text-3 hover:text-foreground"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
        </div>
        {txsLoading ? (
          <div className="p-8 text-center text-sm text-sa-text-3">Loading…</div>
        ) : filteredTxs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-12 h-12 rounded-2xl bg-sa-surface-2 flex items-center justify-center">
              <Wallet size={20} className="text-sa-text-3" />
            </div>
            <p className="text-sm text-sa-text-3">No transactions yet</p>
            <p className="text-xs text-sa-text-3/70">
              Deposit, withdraw, or send to see activity here
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-sa-border/50 text-xs uppercase tracking-wider text-sa-text-3">
                    <th className="px-6 py-3 font-bold">Type</th>
                    <th className="px-6 py-3 font-bold">Chain</th>
                    <th className="px-6 py-3 font-bold">Amount</th>
                    <th className="px-6 py-3 font-bold">Fee</th>
                    <th className="px-6 py-3 font-bold">Status</th>
                    <th className="px-6 py-3 font-bold text-right">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sa-border/40">
                  {pagedTxs.map((t) => (
                    <TxRow key={t.id} tx={t} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-sa-border px-6 py-3 text-xs">
              <span className="text-sa-text-3">
                Page {safePage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-sa-border px-2 py-1 hover:border-sa-border-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={12} />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-sa-border px-2 py-1 hover:border-sa-border-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

async function pollUntil(check: () => Promise<boolean>, attempts: number, intervalMs: number) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      if (await check()) return;
    } catch {
      // keep polling
    }
  }
}

function StatusCell({ status }: { status: string | null }) {
  if (!status) return <span className="text-sa-text-3">—</span>;
  const norm = status.toLowerCase();
  if (norm === "completed" || norm === "complete") {
    return <span className="text-sa-green">✅ Complete</span>;
  }
  if (norm === "pending" || norm === "processing") {
    return <span className="text-amber-400">⏳ Pending</span>;
  }
  if (norm === "failed" || norm === "denied" || norm === "cancelled") {
    return <span className="text-sa-red">❌ Failed</span>;
  }
  return <span className="text-sa-text-3 capitalize">{status}</span>;
}

function FeeRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${emphasis ? "font-bold text-foreground" : "text-sa-text-3"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const Icon = tx.type === "deposit" ? ArrowDownToLine : tx.type === "withdraw" ? ArrowUpFromLine : Send;
  const iconColor =
    tx.type === "deposit"
      ? "text-sa-green"
      : tx.type === "withdraw"
      ? "text-sa-accent"
      : "text-sa-blue";
  const chainId = tx.destination_chain ?? tx.source_chain ?? ARC_TESTNET;
  const chainCfg = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  return (
    <tr className="hover:bg-sa-surface transition-colors">
      <td className="px-6 py-3">
        <span className="inline-flex items-center gap-2">
          <Icon size={14} className={iconColor} />
          <span className="capitalize text-foreground">{tx.type}</span>
        </span>
      </td>
      <td className="px-6 py-3 text-sa-text-3">
        <div className="flex flex-col gap-0.5">
          <span>{chainCfg ? `${chainCfg.icon} ${chainCfg.name}` : chainId}</span>
          {(tx.type === "send" || tx.type === "withdraw") && tx.recipient_address && (
            <span className="font-mono text-[10px] text-muted-foreground">
              → {tx.recipient_address.slice(0, 6)}...{tx.recipient_address.slice(-4)}
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-3 font-mono tabular-nums">${(tx.amount ?? 0).toFixed(4)}</td>
      <td className="px-6 py-3 font-mono tabular-nums text-sa-text-3">
        ${(tx.fee ?? 0).toFixed(4)}
      </td>
      <td className="px-6 py-3">
        <StatusCell status={tx.status} />
      </td>
      <td className="px-6 py-3 text-right text-sa-text-3 text-xs">
        {tx.tx_hash ? (
          <a
            href={explorerUrl(chainId, tx.tx_hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            {timeAgo(tx.created_at)}
            <ExternalLink size={11} />
          </a>
        ) : (
          timeAgo(tx.created_at)
        )}
      </td>
    </tr>
  );
}
