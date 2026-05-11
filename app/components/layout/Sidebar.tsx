"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, usePathname } from "next/navigation";
import {
  Home, Compass, PlayCircle, LayoutDashboard, Shield,
  History, Heart, Clock, Settings, LogOut, Copy, Check, Wallet,
} from "lucide-react";
import { useCurrentUser, signOut } from "@/app/lib/auth-client";
import { DEFAULT_WATCH_VIDEO_ID } from "@/app/lib/constants";
import ChainSelector from "@/app/components/wallet/ChainSelector";
import { SUPPORTED_CHAINS } from "@/app/lib/chains";
import { createPublicClient, http, erc20Abi, type Chain } from "viem";
import { baseSepolia, avalancheFuji, sepolia } from "viem/chains";

const VIEM_CHAINS: Record<string, Chain> = {
  Base_Sepolia: baseSepolia,
  Avalanche_Fuji: avalancheFuji,
  Ethereum_Sepolia: sepolia,
};
function WalletBalances({ userId, walletAddress, onDeposited, walletBalance, gatewayBalance }: {
  userId: string | null;
  walletAddress: string | null;
  onDeposited: () => void;
  walletBalance: number;
  gatewayBalance: number;
}) {
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [gasError, setGasError] = useState<
    | null
    | { nativeToken: string; walletAddress: string; faucetUrl: string; chainName: string }
  >(null);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [depositExplorerUrl, setDepositExplorerUrl] = useState("https://testnet.arcscan.app/tx");
  const [depositAmount, setDepositAmount] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [waitingForBalance, setWaitingForBalance] = useState(false);
  const [depositChain, setDepositChain] = useState("Arc_Testnet");
  const [selectedChainWalletBalance, setSelectedChainWalletBalance] = useState<number | null>(null);
  const [postDepositChain, setPostDepositChain] = useState<{ name: string; finalitySeconds: number } | null>(null);
  const selectedChain = SUPPORTED_CHAINS.find((c) => c.id === depositChain);
  const isNonArc = depositChain !== "Arc_Testnet";

  useEffect(() => {
    if (depositChain === "Arc_Testnet") {
      setSelectedChainWalletBalance(null);
      return;
    }
    const chain = SUPPORTED_CHAINS.find((c) => c.id === depositChain);
    const viemChain = VIEM_CHAINS[depositChain];
    if (!chain || !viemChain || !walletAddress) return;

    let cancelled = false;
    setSelectedChainWalletBalance(null);
    const publicClient = createPublicClient({ chain: viemChain, transport: http() });
    publicClient
      .readContract({
        address: chain.usdcAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      })
      .then((balance) => {
        if (!cancelled) setSelectedChainWalletBalance(Number(balance) / 1e6);
      })
      .catch(() => {
        if (!cancelled) setSelectedChainWalletBalance(0);
      });
    return () => {
      cancelled = true;
    };
  }, [depositChain, walletAddress]);

  const handleDeposit = async () => {
    if (!userId) return;
    setDepositing(true);
    setDepositError(null);
    setGasError(null);
    setDepositTxHash(null);
    setPostDepositChain(null);

    const previousBalance = gatewayBalance;

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
          setGasError({
            nativeToken: data.native_token,
            walletAddress: data.wallet_address,
            faucetUrl: data.faucet_url ?? "https://faucet.circle.com",
            chainName: data.chain_name ?? selectedChain?.name ?? depositChain,
          });
        } else {
          setDepositError(data?.error ?? "Deposit failed");
        }
        return;
      }

      setDepositTxHash(data.tx_hash ?? null);
      setDepositExplorerUrl(data.explorer_url ?? "https://testnet.arcscan.app/tx");
      if (selectedChain) {
        setPostDepositChain({ name: selectedChain.name, finalitySeconds: selectedChain.finalitySeconds });
      }
      setWaitingForBalance(true);

      const maxAttempts = 12;
      const intervalMs = 5000;
      let updated = false;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, intervalMs));
        try {
          const balRes = await fetch("/api/gateway/balance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId }),
          });
          const balData = await balRes.json();
          if (typeof balData.balance === "number" && balData.balance > previousBalance) {
            updated = true;
            break;
          }
        } catch {
          // swallow and keep polling
        }
      }

      setWaitingForBalance(false);
      setDepositTxHash(null);

      if (updated) {
        window.dispatchEvent(new CustomEvent("gateway-balance-updated"));
      }
      onDeposited();
    } catch {
      setDepositError("Deposit failed");
    } finally {
      setDepositing(false);
      setWaitingForBalance(false);
    }
  };

  const handleCopyAddress = async () => {
    if (!walletAddress) return;

    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      setDepositError("Could not copy wallet address");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="panel-muted p-3 space-y-1">
          <p className="text-[10px] text-sa-text-3 uppercase tracking-wider">
            {selectedChain ? `${selectedChain.name} Wallet` : "Wallet USDC"}
          </p>
          <p className="text-lg font-bold font-mono text-foreground inline-flex items-center gap-2">
            {selectedChainWalletBalance === null && isNonArc ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-sa-text-3 border-t-transparent" />
                <span className="text-sa-text-3">…</span>
              </>
            ) : (
              `$${(selectedChainWalletBalance ?? walletBalance).toFixed(4)}`
            )}
          </p>
        </div>
        <div className="panel-muted p-3 space-y-1">
          <p className="text-[10px] text-sa-green uppercase tracking-wider">Gateway balance</p>
          <p className="text-lg font-bold font-mono text-sa-green">
            ${gatewayBalance.toFixed(4)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-sa-text-3">
          Move USDC from your wallet into the Gateway contract to enable nanopayments.
        </p>
        <ChainSelector
          label="Deposit from"
          selected={depositChain}
          onSelect={(id) => {
            setDepositChain(id);
            setDepositError(null);
            setGasError(null);
            setPostDepositChain(null);
            setDepositTxHash(null);
          }}
        />
        {selectedChain && (
          <p className="text-[11px] text-sa-text-3">
            Available:{" "}
            <span className="font-mono text-foreground">
              {selectedChainWalletBalance === null && isNonArc
                ? "…"
                : `$${(selectedChainWalletBalance ?? walletBalance).toFixed(4)}`}
            </span>{" "}
            USDC on {selectedChain.name}
          </p>
        )}
        {isNonArc && selectedChain && (
          <p className="text-[11px] text-sa-text-3">
            Make sure you have {selectedChain.nativeToken} and USDC on {selectedChain.name}. Get testnet tokens at{" "}
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              faucet.circle.com
            </a>
            .
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount (leave blank for all)"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            className="field-surface flex-1 h-9 px-3 text-sm"
          />
          <button
            type="button"
            onClick={handleDeposit}
            disabled={depositing || waitingForBalance}
            className="btn btn-accent btn-sm disabled:opacity-50"
          >
            {depositing ? (
              <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Moving...</>
            ) : waitingForBalance ? (
              <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Confirming...</>
            ) : "Move to Gateway"}
          </button>
        </div>
        {depositError && <p className="text-xs text-sa-red">{depositError}</p>}
        {gasError && (
          <div className="rounded-xl border border-sa-red/40 bg-sa-red/[0.06] p-3 space-y-1">
            <p className="text-xs font-semibold text-sa-red">
              Insufficient {gasError.nativeToken} for gas on {gasError.chainName}
            </p>
            <p className="text-[11px] text-sa-text-3 break-all">
              Fund <span className="font-mono text-foreground">{gasError.walletAddress}</span> with{" "}
              {gasError.nativeToken} at{" "}
              <a
                href={gasError.faucetUrl}
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
        {depositTxHash && (
          <div className="space-y-1">
            <p className="text-xs text-sa-green">Deposit successful!</p>
            <a
              href={`${depositExplorerUrl}/${depositTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
            >
              {depositTxHash.slice(0, 16)}...{depositTxHash.slice(-8)}
            </a>
          </div>
        )}
        {waitingForBalance && postDepositChain && postDepositChain.name !== "ARC Testnet" ? (
          <p className="text-xs text-sa-text-3">
            Deposit confirmed on {postDepositChain.name}. Gateway balance updates after block finality
            (~15 min for Base/ETH Sepolia, ~8 sec for Avalanche).
          </p>
        ) : waitingForBalance ? (
          <p className="inline-flex items-center gap-2 text-xs text-sa-text-3">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-sa-text-3 border-t-transparent" />
            Waiting for balance to update...
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-sa-border" />
        <span className="text-xs text-sa-text-3">or send directly</span>
        <div className="h-px flex-1 bg-sa-border" />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-sa-text-3">Your Circle wallet address</p>
        <div className="flex items-center gap-2 p-3 rounded-xl font-mono text-xs break-all bg-sa-surface border border-sa-border">
          <span className="flex-1 text-foreground">{walletAddress || "Loading..."}</span>
          <button
            type="button"
            onClick={handleCopyAddress}
            disabled={!walletAddress}
            className="inline-flex items-center gap-1 rounded-lg border border-sa-border px-2 py-1 text-[11px] text-sa-text-3 transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Copy Circle wallet address"
          >
            {copiedAddress ? <Check size={12} /> : <Copy size={12} />}
            {copiedAddress ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  )
}

const SidebarItem = ({ icon: Icon, label, active = false, onClick }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`focus-ring w-full relative flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-300 group cursor-pointer ${
      active
        ? "text-foreground"
        : "text-sa-text-3 hover:bg-sa-blue/[0.06] hover:text-foreground bg-transparent"
    }`}
  >
    <AnimatePresence>
      {active && (
        <motion.span
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-xl sidebar-active-glow"
          transition={{ type: "spring", stiffness: 360, damping: 30 }}
        />
      )}
    </AnimatePresence>
    <Icon
      size={18}
      className={`relative z-10 transition-all duration-300 ${
        active
          ? "text-sa-cyan drop-shadow-[0_0_8px_rgba(168,240,240,0.55)]"
          : "group-hover:scale-110 group-hover:text-sa-cyan"
      }`}
    />
    <span className={`relative z-10 text-sm whitespace-nowrap transition-all duration-200 ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
    {active && (
      <span
        aria-hidden
        className="ml-auto h-1.5 w-1.5 rounded-full bg-sa-cyan shadow-[0_0_10px_2px_rgba(168,240,240,0.7)]"
      />
    )}
  </button>
);

export default function Sidebar({ balance: initialBalance, onBalanceChange, onPageChange, currentPage }: {
  balance: number;
  onBalanceChange?: (b: number) => void;
  onPageChange?: (page: string) => void;
  currentPage?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [balance, setBalance] = useState(initialBalance);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [liveBalanceActive, setLiveBalanceActive] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { userId } = useCurrentUser();

  useEffect(() => {
    if (!userId) return;
    fetch("/api/users/is-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
      .then((r) => r.json())
      .then((data) => setIsAdmin(data.is_admin ?? false));
  }, [userId]);

  useEffect(() => {
    setBalance(initialBalance);
  }, [initialBalance]);

  useEffect(() => {
    if (!userId) return;
    fetch("/api/gateway/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.balance !== undefined) {
          setBalance(data.balance);
          onBalanceChange?.(data.balance);
        }
        if (data.wallet_balance !== undefined) setWalletBalance(data.wallet_balance);
        if (data.wallet_address) setWalletAddress(data.wallet_address);
      })
      .catch(() => {});
  }, [userId, onBalanceChange]);

  useEffect(() => {
    const handleBalanceUpdate = () => {
      if (!userId) return;
      fetch("/api/gateway/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.balance !== undefined) {
            setBalance(data.balance);
            onBalanceChange?.(data.balance);
          }
          if (data.wallet_balance !== undefined) setWalletBalance(data.wallet_balance);
        })
        .catch(() => {});
    };

    window.addEventListener("gateway-balance-updated", handleBalanceUpdate);
    return () => window.removeEventListener("gateway-balance-updated", handleBalanceUpdate);
  }, [userId, onBalanceChange]);

  useEffect(() => {
    const handleOpenTopUp = () => setShowTopUp(true);
    window.addEventListener("open-top-up", handleOpenTopUp);
    return () => window.removeEventListener("open-top-up", handleOpenTopUp);
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;

    const handleLiveBalance = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance !== "number") return;

      setLiveBalance(detail.balance);
      setLiveBalanceActive(true);

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        setLiveBalanceActive(false);
      }, 1800);
    };

    window.addEventListener("gateway-balance-live", handleLiveBalance as EventListener);
    return () => {
      window.removeEventListener("gateway-balance-live", handleLiveBalance as EventListener);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const navigateTo = (page: string) => {
    if (page === "watch") {
      router.push(`/watch/${DEFAULT_WATCH_VIDEO_ID}`);
    } else if (page === "admin") {
      router.push("/admin");
    } else if (page === "studio") {
      router.push("/studio");
    } else if (page === "explore") {
      router.push("/explore");
    } else {
      onPageChange?.(page);
    }
  };

  const displayedBalance =
    liveBalanceActive && typeof liveBalance === "number"
      ? liveBalance.toFixed(4)
      : balance.toFixed(2);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-0 top-0 bottom-0 z-50 hidden lg:block"
        style={{ width: "var(--sidebar-width)" }}
      >
        <aside
          className="flex h-full flex-col px-4 py-6 gap-5 relative"
          style={{
            background: "hsla(213, 50%, 6%, 0.9)",
            borderRight: "1px solid hsla(198, 30%, 22%, 0.6)",
            backdropFilter: "blur(22px) saturate(140%)",
            WebkitBackdropFilter: "blur(22px) saturate(140%)",
          }}
        >

          {/* Wordmark lockup — pinned at top */}
          <div className="flex items-center px-1 py-1 relative z-10 shrink-0">
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-display font-bold tracking-tight text-foreground">
                Stream<span className="text-sa-blue">Arc</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sa-text-3">
                Per-second streaming
              </span>
            </div>
          </div>

          {/* Scrollable middle region — nav + balance widget. Settings/Sign Out stay outside this. */}
          <nav className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto no-scrollbar">
            {/* Balance widget */}
            <div className="panel shrink-0 mx-1 mb-4 p-4 space-y-3 relative overflow-hidden">
              <div className="relative">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sa-text-3 inline-flex items-center gap-2">
                  USDC Balance
                  {liveBalanceActive && (
                    <span className="record-dot h-1.5 w-1.5 rounded-full bg-sa-green" />
                  )}
                </p>
                <motion.p
                  key={`${liveBalanceActive}-${displayedBalance}`}
                  initial={{ opacity: 0.5, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22 }}
                  className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                    liveBalanceActive ? "text-sa-blue" : "text-foreground"
                  }`}
                >
                  ${displayedBalance}
                </motion.p>
              </div>
              <button
                type="button"
                onClick={() => setShowTopUp(true)}
                className="btn btn-primary btn-sm btn-shine w-full relative"
              >
                Top up
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <SidebarItem icon={Home} label="Browse" active={currentPage === "browse"} onClick={() => navigateTo("browse")} />
              <SidebarItem
                icon={Compass}
                label="Explore"
                active={currentPage === "explore" || pathname === "/explore"}
                onClick={() => navigateTo("explore")}
              />
              <SidebarItem icon={PlayCircle} label="Watch" active={currentPage === "watch"} onClick={() => navigateTo("watch")} />
            </div>

            <div aria-hidden className="my-4 mx-3 h-px bg-sa-border/50" />

            <div className="flex flex-col gap-1.5">
              <span className="px-4 text-[10px] font-semibold text-sa-text-3 uppercase tracking-[0.22em] mb-2">
                Your activity
              </span>
              <SidebarItem
                icon={History}
                label="History"
                active={currentPage === "history" || pathname === "/history"}
                onClick={() => router.push("/history")}
              />
              <SidebarItem
                icon={Heart}
                label="Favourites"
                active={currentPage === "favourites" || pathname === "/favourites"}
                onClick={() => router.push("/favourites")}
              />
              <SidebarItem
                icon={Clock}
                label="Watch later"
                active={currentPage === "watchlater" || pathname === "/watchlater"}
                onClick={() => router.push("/watchlater")}
              />
              <SidebarItem
                icon={Wallet}
                label="Wallet"
                active={currentPage === "wallet" || pathname === "/wallet"}
                onClick={() => router.push("/wallet")}
              />
            </div>

            <div aria-hidden className="my-4 mx-3 h-px bg-sa-border/50" />

            <div className="flex flex-col gap-1.5">
              <span className="px-4 text-[10px] font-semibold text-sa-text-3 uppercase tracking-[0.22em] mb-2">
                Creator
              </span>
              <SidebarItem
                icon={LayoutDashboard}
                label="Studio"
                active={currentPage === "studio" || pathname === "/studio"}
                onClick={() => navigateTo("studio")}
              />
              {isAdmin && (
                <SidebarItem icon={Shield} label="Admin" active={currentPage === "admin"} onClick={() => navigateTo("admin")} />
              )}
            </div>
          </nav>

          {/* Locked bottom block — always visible, regardless of nav scroll */}
          <div className="shrink-0 relative z-10 pt-3 border-t border-sa-border/50">
            <div className="flex flex-col gap-1.5">
              <SidebarItem icon={Settings} label="Settings" onClick={() => router.push("/settings")} />
              <SidebarItem icon={LogOut} label="Sign Out" onClick={() => signOut()} />
            </div>
          </div>
        </aside>
      </motion.div>

      {showTopUp && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setShowTopUp(false)}
        >
          <div
            className="panel p-6 w-[440px] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-foreground">Top up balance</h3>

            <WalletBalances
              userId={userId ?? null}
              walletAddress={walletAddress ?? null}
              walletBalance={walletBalance}
              gatewayBalance={balance}
              onDeposited={() => {
                window.dispatchEvent(new CustomEvent("gateway-balance-updated"))
                setShowTopUp(false)
              }}
            />

            <button
              type="button"
              onClick={() => setShowTopUp(false)}
              className="btn btn-glass w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
