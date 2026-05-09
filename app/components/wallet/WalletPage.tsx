"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Wallet,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import ChainSelector from "./ChainSelector";
import { SUPPORTED_CHAINS } from "@/app/lib/chains";

const ARC_TESTNET = "Arc_Testnet";
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const EXPLORER_BASE: Record<string, string> = {
  Arc_Testnet: "https://testnet.arcscan.app/tx",
  Base_Sepolia: "https://sepolia.basescan.org/tx",
  Arbitrum_Sepolia: "https://sepolia.arbiscan.io/tx",
  Avalanche_Fuji: "https://testnet.snowtrace.io/tx",
  Ethereum_Sepolia: "https://sepolia.etherscan.io/tx",
  Optimism_Sepolia: "https://sepolia-optimism.etherscan.io/tx",
  Polygon_Amoy_Testnet: "https://amoy.polygonscan.com/tx",
};

function explorerUrl(chainId: string, txHash: string) {
  const base = EXPLORER_BASE[chainId] ?? EXPLORER_BASE.Arc_Testnet;
  return `${base}/${txHash}`;
}

function chainName(chainId: string) {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ?? chainId;
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

// Inline fee math (mirrors the fallback values from /api/wallet/estimate).
// kept as a module constant so the breakdown updates instantly as inputs change.
const GATEWAY_FEE_BPS = 0.00005; // 0.005% on cross-chain spend
const FORWARDING_FEE_USDC = 0;
const GAS_ESTIMATE_USDC = 0;

interface FeeBreakdown {
  spend_amount: number;
  platform_fee: number;
  gateway_fee: number;
  forwarding_fee: number;
  gas_estimate: number;
  you_receive: number;
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

interface ChainBalance {
  chain: string;
  confirmed: number;
  pending: number;
}

function chainIcon(chainId: string) {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.icon ?? "•";
}

const SEND_DISABLED_CHAINS = SUPPORTED_CHAINS
  .filter((c) => c.id !== ARC_TESTNET)
  .map((c) => c.id);

export default function WalletPage({ userId, walletAddress }: { userId: string; walletAddress: string }) {
  const [gatewayBalance, setGatewayBalance] = useState(0);
  const [walletUsdc, setWalletUsdc] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [copied, setCopied] = useState(false);

  // Withdraw state
  const [wdAmount, setWdAmount] = useState("");
  const [wdChain, setWdChain] = useState(ARC_TESTNET);
  const [wdDestination, setWdDestination] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawTx, setWithdrawTx] = useState<{ hash: string; chain: string } | null>(null);

  // Send state
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendChain, setSendChain] = useState(ARC_TESTNET);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendTx, setSendTx] = useState<string | null>(null);

  // Transactions
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loadingTxs, setLoadingTxs] = useState(true);

  // Per-chain Gateway balance breakdown
  const [chainBalances, setChainBalances] = useState<ChainBalance[]>([]);
  const [showByChain, setShowByChain] = useState(false);

  const wdIsCrossChain = wdChain !== ARC_TESTNET;
  const wdMinimum = wdIsCrossChain ? 0.5 : 0.1;
  const wdAmountNum = parseFloat(wdAmount);
  const wdAmountValid = !isNaN(wdAmountNum) && wdAmountNum >= wdMinimum && wdAmountNum <= gatewayBalance;
  const wdDestValid = wdIsCrossChain
    ? EVM_ADDRESS_RE.test(wdDestination)
    : !wdDestination || EVM_ADDRESS_RE.test(wdDestination);

  const wdChainConfig = useMemo(
    () => SUPPORTED_CHAINS.find((c) => c.id === wdChain),
    [wdChain],
  );

  const fees: FeeBreakdown = useMemo(() => {
    const amt = isNaN(wdAmountNum) ? 0 : Math.max(0, wdAmountNum);
    const platform = wdChainConfig?.feeUsdc ?? 0;
    const gateway = wdIsCrossChain ? amt * GATEWAY_FEE_BPS : 0;
    const forwarding = wdIsCrossChain ? FORWARDING_FEE_USDC : 0;
    const gas = GAS_ESTIMATE_USDC;
    return {
      spend_amount: amt,
      platform_fee: platform,
      gateway_fee: gateway,
      forwarding_fee: forwarding,
      gas_estimate: gas,
      you_receive: amt - platform - gateway - forwarding - gas,
    };
  }, [wdAmountNum, wdIsCrossChain, wdChainConfig]);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (typeof data.balance === "number") setGatewayBalance(data.balance);
      if (typeof data.wallet_balance === "number") setWalletUsdc(data.wallet_balance);
      if (typeof data.pending_balance === "number") setPendingBalance(data.pending_balance);
    } catch {
      // keep stale values
    }
  }, [userId]);

  const refreshChainBalances = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        setChainBalances([]);
        return;
      }
      const data = await res.json();
      setChainBalances(Array.isArray(data.per_chain) ? data.per_chain : []);
    } catch {
      setChainBalances([]);
    }
  }, [userId]);

  const refreshTxs = useCallback(async () => {
    setLoadingTxs(true);
    try {
      const res = await fetch("/api/wallet/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, limit: 10 }),
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
      setLoadingTxs(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshBalance();
    refreshTxs();
    refreshChainBalances();
  }, [refreshBalance, refreshTxs, refreshChainBalances]);

  useEffect(() => {
    const handler = () => {
      refreshBalance();
      refreshChainBalances();
    };
    window.addEventListener("gateway-balance-updated", handler);
    return () => window.removeEventListener("gateway-balance-updated", handler);
  }, [refreshBalance, refreshChainBalances]);

  const handleWithdraw = async () => {
    setWithdrawing(true);
    setWithdrawError(null);
    setWithdrawTx(null);
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
        setWithdrawError(data.error ?? "Withdrawal failed");
        return;
      }
      setWithdrawTx({ hash: data.tx_hash, chain: wdChain });
      setWdAmount("");
      setWdDestination("");
      window.dispatchEvent(new CustomEvent("gateway-balance-updated"));
      refreshBalance();
      refreshTxs();
    } catch {
      setWithdrawError("Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setSendError(null);
    setSendTx(null);
    try {
      const res = await fetch("/api/gateway/send-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          destination_address: sendAddress,
          amount: sendAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error ?? "Send failed");
        return;
      }
      setSendTx(data.tx_hash);
      setSendAddress("");
      setSendAmount("");
      refreshBalance();
      refreshTxs();
    } catch {
      setSendError("Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-20">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
        <p className="mt-2 text-sm text-sa-text-3">
          Manage your Gateway balance, withdraw to any supported chain, and send USDC.
        </p>
      </div>

      {/* Section 1: Gateway Balance + Withdraw */}
      <section className="flex flex-col gap-6">
        <div className="glass p-6 rounded-sa-card flex flex-col gap-4 hover-lift">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
                Gateway balance
              </span>
              <span className="font-mono text-4xl font-bold tracking-tight text-sa-green tabular-nums">
                ${gatewayBalance.toFixed(4)}
              </span>
              {pendingBalance > 0 && (
                <span className="text-xs text-sa-text-3 font-mono">
                  + ${pendingBalance.toFixed(4)} pending
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("open-top-up"))}
              className="btn btn-primary"
            >
              Top up
            </button>
          </div>
        </div>

        {/* Per-chain breakdown */}
        {chainBalances.some((c) => c.confirmed > 0) && (
          <div className="glass rounded-sa-card overflow-hidden">
            <button
              type="button"
              onClick={() => setShowByChain((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-sa-surface transition-colors"
              aria-expanded={showByChain}
            >
              <span className="inline-flex items-center gap-2">
                {showByChain ? (
                  <ChevronDown size={14} className="text-sa-text-3" />
                ) : (
                  <ChevronRight size={14} className="text-sa-text-3" />
                )}
                <span className="text-sm font-semibold">Deposited from</span>
                <span className="text-xs text-sa-text-3">
                  {chainBalances.filter((c) => c.confirmed > 0).length} chain
                  {chainBalances.filter((c) => c.confirmed > 0).length !== 1 ? "s" : ""}
                </span>
              </span>
            </button>
            {showByChain && (
              <div className="border-t border-sa-border divide-y divide-sa-border/40">
                {chainBalances
                  .filter((c) => c.confirmed > 0)
                  .map((c) => (
                    <div
                      key={c.chain}
                      className="flex items-center justify-between gap-3 px-6 py-3"
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span className="text-base leading-none" aria-hidden>
                          {chainIcon(c.chain)}
                        </span>
                        <span className="text-sm text-foreground truncate">
                          {chainName(c.chain)}
                        </span>
                      </span>
                      <span className="font-mono text-sm tabular-nums text-foreground">
                        ${c.confirmed.toFixed(4)}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Withdraw card */}
        <div className="glass p-6 rounded-sa-card flex flex-col gap-5 hover-lift">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold inline-flex items-center gap-2">
              <ArrowUpFromLine size={16} className="text-sa-accent" />
              Withdraw from Gateway
            </h3>
            <p className="text-xs text-sa-text-3">
              Pulls USDC from your Gateway balance. Same-chain Arc is free; cross-chain uses Circle&apos;s
              Forwarding Service.
            </p>
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

          {wdAmountNum > 0 && (
            <div className="panel-muted p-4 space-y-1.5 text-sm font-mono">
              <FeeRow label="Amount" value={`$${fees.spend_amount.toFixed(4)}`} />
              {fees.platform_fee > 0 && (
                <FeeRow label="Platform fee" value={`$${fees.platform_fee.toFixed(4)}`} />
              )}
              {fees.gateway_fee > 0 && (
                <FeeRow label="Gateway fee" value={`$${fees.gateway_fee.toFixed(6)}`} />
              )}
              {fees.forwarding_fee > 0 && (
                <FeeRow label="Forwarding fee" value={`$${fees.forwarding_fee.toFixed(4)}`} />
              )}
              {fees.gas_estimate > 0 && (
                <FeeRow label="Gas estimate" value={`~$${fees.gas_estimate.toFixed(4)}`} />
              )}
              <div className="my-1 h-px bg-sa-border" />
              <FeeRow
                label="You receive"
                value={`$${Math.max(0, fees.you_receive).toFixed(4)}`}
                emphasis
              />
              {fees.you_receive <= 0 && (
                <p className="mt-2 text-xs text-sa-red font-sans">
                  Amount is too small to cover fees. Increase the amount.
                </p>
              )}
            </div>
          )}

          <ChainSelector
            label="Destination chain"
            selected={wdChain}
            onSelect={setWdChain}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
              {wdIsCrossChain
                ? "Destination address (required)"
                : "Destination address (optional — defaults to your wallet)"}
            </label>
            <input
              type="text"
              placeholder={wdIsCrossChain ? "0x…" : walletAddress}
              value={wdDestination}
              onChange={(e) => setWdDestination(e.target.value)}
              className="field-surface h-11 px-3 text-sm font-mono"
            />
          </div>

          {withdrawError && <p className="text-xs text-sa-red">{withdrawError}</p>}
          {withdrawTx && (
            <div className="space-y-1">
              <p className="text-xs text-sa-green">Withdrawal successful!</p>
              <a
                href={explorerUrl(withdrawTx.chain, withdrawTx.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
              >
                <ExternalLink size={12} />
                {withdrawTx.hash.slice(0, 16)}…{withdrawTx.hash.slice(-8)}
              </a>
            </div>
          )}

          <button
            type="button"
            onClick={handleWithdraw}
            disabled={
              withdrawing ||
              !wdAmountValid ||
              !wdDestValid ||
              fees.you_receive <= 0
            }
            className="btn btn-accent self-start disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {withdrawing ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Confirming…
              </>
            ) : (
              "Confirm withdrawal"
            )}
          </button>
        </div>
      </section>

      {/* Section 2: Circle Wallet + Send */}
      <section className="flex flex-col gap-6">
        <div className="glass p-6 rounded-sa-card flex flex-col gap-4 hover-lift">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
                Circle wallet balance · Arc Testnet
              </span>
              <span className="font-mono text-4xl font-bold tracking-tight text-foreground tabular-nums">
                ${walletUsdc.toFixed(4)}
              </span>
            </div>
            <div className="panel-muted p-3 flex items-center gap-2">
              <span className="font-mono text-xs break-all text-foreground">
                {walletAddress.slice(0, 10)}…{walletAddress.slice(-6)}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy wallet address"
                className="inline-flex items-center gap-1 rounded-lg border border-sa-border px-2 py-1 text-[11px] text-sa-text-3 hover:text-foreground"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-sa-card flex flex-col gap-5 hover-lift">
          <div className="flex flex-col gap-1">
            <h3 className="font-bold inline-flex items-center gap-2">
              <Send size={16} className="text-sa-accent" />
              Send USDC
            </h3>
            <p className="text-xs text-sa-text-3">
              Sends from your Circle wallet (not Gateway). Same-chain Arc only — for cross-chain transfers
              use Withdraw.
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
              placeholder={`Max $${walletUsdc.toFixed(4)}`}
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              className="field-surface h-11 px-3 text-sm"
            />
          </div>

          <ChainSelector
            label="Destination chain"
            selected={sendChain}
            onSelect={setSendChain}
            disabledChains={SEND_DISABLED_CHAINS}
            disabledLabel="Coming soon"
          />

          {sendError && <p className="text-xs text-sa-red">{sendError}</p>}
          {sendTx && (
            <div className="space-y-1">
              <p className="text-xs text-sa-green">Send successful!</p>
              <a
                href={explorerUrl(ARC_TESTNET, sendTx)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
              >
                <ExternalLink size={12} />
                {sendTx.slice(0, 16)}…{sendTx.slice(-8)}
              </a>
            </div>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={
              sending ||
              !EVM_ADDRESS_RE.test(sendAddress) ||
              !(parseFloat(sendAmount) > 0) ||
              walletUsdc <= 0
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
        </div>
      </section>

      {/* Section 3: Transaction history */}
      <section className="glass rounded-sa-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-sa-border p-6">
          <h3 className="font-bold inline-flex items-center gap-2">
            <Wallet size={16} className="text-sa-accent" />
            Transaction history
          </h3>
          <button
            type="button"
            onClick={refreshTxs}
            className="inline-flex items-center gap-1 text-xs text-sa-text-3 hover:text-foreground"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
        {loadingTxs ? (
          <div className="p-8 text-center text-sm text-sa-text-3">Loading…</div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-12 h-12 rounded-2xl bg-sa-surface-2 flex items-center justify-center">
              <Wallet size={20} className="text-sa-text-3" />
            </div>
            <p className="text-sm text-sa-text-3">No transactions yet</p>
            <p className="text-xs text-sa-text-3/70">
              Top up, withdraw, or send to see activity here
            </p>
          </div>
        ) : (
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
                {txs.map((t) => (
                  <TxRow key={t.id} tx={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function FeeRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between ${
        emphasis ? "font-bold text-foreground" : "text-sa-text-3"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const Icon =
    tx.type === "deposit" ? ArrowDownToLine : tx.type === "withdraw" ? ArrowUpFromLine : Send;
  const iconColor =
    tx.type === "deposit"
      ? "text-sa-green"
      : tx.type === "withdraw"
      ? "text-sa-accent"
      : "text-sa-blue";
  const statusColor =
    tx.status === "completed"
      ? "bg-sa-green/10 text-sa-green"
      : tx.status === "pending"
      ? "bg-amber-500/10 text-amber-400"
      : "bg-sa-red/10 text-sa-red";
  const chainLabel = chainName(tx.destination_chain ?? tx.source_chain ?? "");
  const explorerChain = tx.destination_chain ?? tx.source_chain ?? ARC_TESTNET;

  return (
    <tr className="hover:bg-sa-surface transition-colors">
      <td className="px-6 py-3">
        <span className="inline-flex items-center gap-2">
          <Icon size={14} className={iconColor} />
          <span className="capitalize text-foreground">{tx.type}</span>
        </span>
      </td>
      <td className="px-6 py-3 text-sa-text-3">{chainLabel}</td>
      <td className="px-6 py-3 font-mono tabular-nums">${(tx.amount ?? 0).toFixed(4)}</td>
      <td className="px-6 py-3 font-mono tabular-nums text-sa-text-3">
        ${(tx.fee ?? 0).toFixed(4)}
      </td>
      <td className="px-6 py-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${statusColor}`}
        >
          {tx.status}
        </span>
      </td>
      <td className="px-6 py-3 text-right text-sa-text-3 text-xs">
        {tx.tx_hash ? (
          <a
            href={explorerUrl(explorerChain, tx.tx_hash)}
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
