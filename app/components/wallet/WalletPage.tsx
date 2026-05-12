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
import { SUPPORTED_CHAINS } from "@/app/lib/chains";

const ARC_TESTNET = "Arc_Testnet";
const ARC_EXPLORER_BASE = "https://testnet.arcscan.app/tx";
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const PAGE_SIZE = 10;

function arcExplorerUrl(txHash: string) {
  return `${ARC_EXPLORER_BASE}/${txHash}`;
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

export default function WalletPage({ userId, walletAddress }: { userId: string; walletAddress: string }) {
  const [gatewayBalance, setGatewayBalance] = useState(0);
  const [gatewayTotal, setGatewayTotal] = useState(0);
  const [refreshingTopBar, setRefreshingTopBar] = useState(false);
  const [copied, setCopied] = useState(false);

  // Withdraw state — Arc only
  const [wdAmount, setWdAmount] = useState("");
  const [wdDestination, setWdDestination] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawResult, setWithdrawResult] = useState<{ hash: string } | null>(null);

  // Send state — Arc only
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ hash: string } | null>(null);

  // Transactions state
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txsLoading, setTxsLoading] = useState(true);
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
      if (typeof data.total === "number") setGatewayTotal(data.total);
    } catch {
      // keep stale
    }
  }, [userId]);

  const filtersActive = historyTypeFilter !== "all";

  const refreshTransactions = useCallback(async () => {
    setTxsLoading(true);
    try {
      // When the type filter is active, fetch a larger window and slice client-side.
      // When unfiltered, page server-side a single PAGE_SIZE window at a time.
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
    await Promise.all([refreshGatewayBalance(), refreshTransactions()]);
    setRefreshingTopBar(false);
  }, [refreshGatewayBalance, refreshTransactions]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const handler = () => {
      refreshGatewayBalance();
      refreshTransactions();
    };
    window.addEventListener("gateway-balance-updated", handler);
    return () => window.removeEventListener("gateway-balance-updated", handler);
  }, [refreshGatewayBalance, refreshTransactions]);

  const handleWithdraw = async () => {
    if (!userId) return;
    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawResult(null);
    try {
      const body: Record<string, string> = {
        user_id: userId,
        amount: wdAmount,
        destination_chain: ARC_TESTNET,
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
      if (hash) setWithdrawResult({ hash });
      setWdAmount("");
      setWdDestination("");
      window.dispatchEvent(new CustomEvent("gateway-balance-updated"));
      refreshGatewayBalance();
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

    setSending(true);
    try {
      const res = await fetch("/api/gateway/send-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          destination_address: sendAddress,
          amount: sendAmount,
          source_chain: ARC_TESTNET,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data?.error ?? "Send failed");
        return;
      }
      if (data.tx_hash) {
        setSendResult({ hash: data.tx_hash });
      }
      setSendAddress("");
      setSendAmount("");
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
    return txs.filter((tx) => tx.type === historyTypeFilter);
  }, [txs, historyTypeFilter, filtersActive]);

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
  }, [historyTypeFilter]);

  const openTopUp = () => {
    window.dispatchEvent(new CustomEvent("open-top-up"));
  };

  const wdAmountNum = parseFloat(wdAmount) || 0;
  const wdAmountValid = wdAmountNum >= 0.1 && wdAmountNum <= gatewayBalance;
  const wdDestValid = !wdDestination || EVM_ADDRESS_RE.test(wdDestination);

  return (
    <div className="flex flex-col gap-8 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
        <p className="mt-2 text-sm text-sa-text-3">
          Manage your Gateway balance, deposits, withdrawals, and history.
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
            {gatewayTotal > gatewayBalance + 0.0001 && (
              <span className="text-xs text-sa-text-3 tabular-nums">
                Total across all chains: ${gatewayTotal.toFixed(4)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openTopUp}
              className="btn btn-primary btn-sm btn-shine"
            >
              Top up
            </button>
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

      {/* Section 2 — Withdraw (Gateway → Arc wallet) */}
      <section className="glass rounded-sa-card p-6 flex flex-col gap-5 hover-lift">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold inline-flex items-center gap-2">
            <ArrowUpFromLine size={16} className="text-sa-accent" />
            Withdraw from Gateway
          </h3>
          <p className="text-xs text-sa-text-3">
            Pull USDC from your Gateway balance back to your Arc wallet.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
            Amount (USDC)
          </label>
          <input
            type="number"
            min="0.10"
            step="0.0001"
            placeholder={`Min $0.10 · Max $${gatewayBalance.toFixed(4)}`}
            value={wdAmount}
            onChange={(e) => setWdAmount(e.target.value)}
            className="field-surface h-11 px-3 text-sm"
          />
        </div>

        {withdrawError && <p className="text-xs text-sa-red">{withdrawError}</p>}
        {withdrawResult && (
          <div className="space-y-1">
            <p className="text-xs text-sa-green">Withdrawal submitted on Arc Testnet.</p>
            <a
              href={arcExplorerUrl(withdrawResult.hash)}
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
          disabled={withdrawing || !wdAmountValid || !wdDestValid}
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

      {/* Section 3 — Send (Circle Wallet → External) */}
      <section className="glass rounded-sa-card p-6 flex flex-col gap-5 hover-lift">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold inline-flex items-center gap-2">
            <Send size={16} className="text-sa-blue" />
            Send USDC
          </h3>
          <p className="text-xs text-sa-text-3">
            Send USDC from your Arc Circle wallet to an external address.
          </p>
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

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
            Amount (USDC)
          </label>
          <input
            type="number"
            min="0.0001"
            step="0.0001"
            placeholder="0.0000"
            value={sendAmount}
            onChange={(e) => setSendAmount(e.target.value)}
            className="field-surface h-11 px-3 text-sm"
          />
        </div>

        {sendError && <p className="text-xs text-sa-red">{sendError}</p>}
        {sendResult && (
          <div className="space-y-1">
            <p className="text-xs text-sa-green">Send submitted.</p>
            <a
              href={arcExplorerUrl(sendResult.hash)}
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

      {/* Section 4 — Transaction History */}
      <section className="glass rounded-sa-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-sa-border px-6 py-4 flex-wrap gap-3">
          <h3 className="font-bold inline-flex items-center gap-2">
            <Wallet size={16} className="text-sa-accent" />
            Transaction history
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
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
            href={arcExplorerUrl(tx.tx_hash)}
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
