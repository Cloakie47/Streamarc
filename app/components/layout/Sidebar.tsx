"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, usePathname } from "next/navigation";
import {
  Home, Compass, PlayCircle, LayoutDashboard, Shield,
  History, Heart, Clock, Settings, LogOut, Copy, Check,
} from "lucide-react";
import { useCurrentUser, signOut } from "@/app/lib/auth-client";
import { DEFAULT_WATCH_VIDEO_ID } from "@/app/lib/constants";
function WalletBalances({ userId, walletAddress, onDeposited, open }: {
  userId: string | null;
  walletAddress: string | null;
  onDeposited: () => void;
  open: boolean;
}) {
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [gatewayBalance, setGatewayBalance] = useState<string | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    if (!userId || !open) return;
    fetch("/api/gateway/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.balance !== undefined) setGatewayBalance(data.balance.toFixed(4))
        if (data.wallet_balance !== undefined) setWalletBalance(data.wallet_balance.toFixed(4))
      })
      .catch(() => {});
  }, [userId, open]);

  const handleDeposit = async () => {
    if (!userId) return;
    setDepositing(true);
    setDepositError(null);
    setDepositTxHash(null);
    try {
      const res = await fetch("/api/gateway/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          amount: depositAmount || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDepositError(data.error);
      } else {
        setDepositTxHash(data.tx_hash ?? null);
        setTimeout(() => {
          setDepositTxHash(null);
          onDeposited();
        }, 10000);
      }
    } catch {
      setDepositError("Deposit failed");
    } finally {
      setDepositing(false);
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
          <p className="text-[10px] text-sa-text-3 uppercase tracking-wider">Wallet USDC</p>
          <p className="text-lg font-bold font-mono text-foreground">
            ${walletBalance ?? "..."}
          </p>
        </div>
        <div className="panel-muted p-3 space-y-1">
          <p className="text-[10px] text-sa-green uppercase tracking-wider">Gateway balance</p>
          <p className="text-lg font-bold font-mono text-sa-green">
            ${gatewayBalance ?? "..."}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-sa-text-3">
          Move USDC from your wallet into the Gateway contract to enable nanopayments.
        </p>
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
            disabled={depositing}
            className="btn btn-accent btn-sm disabled:opacity-50"
          >
            {depositing ? (
              <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Moving...</>
            ) : "Move to Gateway"}
          </button>
        </div>
        {depositError && <p className="text-xs text-sa-red">{depositError}</p>}
        {depositTxHash && (
          <div className="space-y-1">
            <p className="text-xs text-sa-green">Deposit successful!</p>
            <a
              href={`https://testnet.arcscan.app/tx/${depositTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-mono break-all underline underline-offset-2"
            >
              {depositTxHash.slice(0, 16)}...{depositTxHash.slice(-8)}
            </a>
          </div>
        )}
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
    className={`w-full relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-300 group cursor-pointer ${
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
          className="flex h-full flex-col px-4 py-6 gap-5 overflow-y-auto no-scrollbar relative"
          style={{
            background: "hsla(213, 50%, 6%, 0.9)",
            borderRight: "1px solid hsla(198, 30%, 22%, 0.6)",
            backdropFilter: "blur(22px) saturate(140%)",
            WebkitBackdropFilter: "blur(22px) saturate(140%)",
          }}
        >

          {/* Wordmark lockup */}
          <div className="flex items-center px-1 py-1 relative z-10">
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-display font-bold tracking-tight text-foreground">
                Stream<span className="text-sa-blue">Arc</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sa-text-3">
                Per-second streaming
              </span>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            {/* Balance widget */}
            <div className="panel shrink-0 mx-1 mb-3 p-4 space-y-3 relative overflow-hidden">
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

            <div className="flex flex-col gap-1">
              <SidebarItem icon={Home} label="Browse" active={currentPage === "browse"} onClick={() => navigateTo("browse")} />
              <SidebarItem
                icon={Compass}
                label="Explore"
                active={currentPage === "explore" || pathname === "/explore"}
                onClick={() => navigateTo("explore")}
              />
              <SidebarItem icon={PlayCircle} label="Watch" active={currentPage === "watch"} onClick={() => navigateTo("watch")} />
            </div>

            <div aria-hidden className="my-3 mx-3 h-px bg-sa-border/50" />

            <div className="flex flex-col gap-1">
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
            </div>

            <div aria-hidden className="my-3 mx-3 h-px bg-sa-border/50" />

            <div className="flex flex-col gap-1">
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

          <div className="flex flex-col gap-1 relative z-10">
            <SidebarItem icon={Settings} label="Settings" onClick={() => router.push("/settings")} />
            <SidebarItem icon={LogOut} label="Sign Out" onClick={() => signOut()} />
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
              open={showTopUp}
              onDeposited={() => {
                if (userId) {
                  fetch("/api/gateway/balance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: userId }),
                  })
                    .then(r => r.json())
                    .then(data => {
                      if (data.balance !== undefined) {
                        setBalance(data.balance)
                        onBalanceChange?.(data.balance)
                      }
                    })
                }
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
