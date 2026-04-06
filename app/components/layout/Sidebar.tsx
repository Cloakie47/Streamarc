"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
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
        <div className="rounded-xl p-3 space-y-1 bg-sa-surface">
          <p className="text-[10px] text-sa-text-3 uppercase tracking-wider">Wallet USDC</p>
          <p className="text-lg font-bold font-mono text-foreground">
            ${walletBalance ?? "..."}
          </p>
        </div>
        <div className="rounded-xl p-3 space-y-1 bg-sa-surface">
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
            className="flex-1 h-9 rounded-xl px-3 text-sm bg-sa-surface border border-sa-border text-foreground"
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
            className="inline-flex items-center gap-1 rounded-lg border border-sa-border px-2 py-1 text-[11px] text-sa-text-2 transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${
      active
        ? "bg-white/[0.05] text-white border-l-2 border-sa-accent border-t-0 border-r-0 border-b-0"
        : "text-sa-text-3 hover:bg-white/[0.03] hover:text-white bg-transparent border-l-2 border-transparent border-t-0 border-r-0 border-b-0"
    }`}
  >
    <Icon size={20} className={active ? "" : "group-hover:scale-110 transition-transform"} />
    <span className="font-medium text-sm whitespace-nowrap">{label}</span>
  </button>
);

export default function Sidebar({ balance: initialBalance, onBalanceChange, onPageChange, currentPage }: {
  balance: number;
  onBalanceChange?: (b: number) => void;
  onPageChange?: (page: string) => void;
  currentPage?: string;
}) {
  const router = useRouter();
  const [activeItem, setActiveItem] = useState("history");
  const [balance, setBalance] = useState(initialBalance);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [showTopUp, setShowTopUp] = useState(false);
  const { userId } = useCurrentUser();

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

  const navigateTo = (page: string) => {
    setActiveItem("");
    if (page === "watch") {
      router.push(`/watch/${DEFAULT_WATCH_VIDEO_ID}`);
    } else {
      onPageChange?.(page);
    }
  };

  const isOnPageRoute = ["studio", "admin", "watch", "explore"].includes(currentPage ?? "");

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed left-0 top-0 bottom-0 z-50 m-4"
        style={{ width: "calc(var(--sidebar-width) - 2rem)" }}
      >
        <aside className="glass border-r-0 rounded-[2.5rem] flex h-full flex-col p-4 gap-6 overflow-y-auto no-scrollbar">

          <div className="flex items-center gap-3 px-4 py-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
              style={{ background: "var(--sa-accent)", boxShadow: "0 8px 24px -4px var(--sa-accent)" }}
            >
              <PlayCircle size={24} className="text-white fill-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">StreamArc</span>
          </div>

          <nav className="flex-1 flex flex-col gap-2 overflow-y-auto no-scrollbar">
            <div className="flex flex-col gap-1">
              <SidebarItem icon={Home} label="Browse" active={currentPage === "browse"} onClick={() => navigateTo("browse")} />
              <SidebarItem icon={Compass} label="Explore" active={currentPage === "explore"} onClick={() => navigateTo("explore")} />
              <SidebarItem icon={PlayCircle} label="Watch" active={currentPage === "watch"} onClick={() => navigateTo("watch")} />
            </div>

            <div className="h-px bg-sa-border my-2 mx-4" />

            <div className="flex flex-col gap-1">
              <span className="px-4 text-[10px] font-bold text-sa-text-3 uppercase tracking-widest mb-2">Your Activity</span>
              <SidebarItem icon={History} label="History" active={activeItem === "history" && !isOnPageRoute} onClick={() => setActiveItem("history")} />
              <SidebarItem icon={Heart} label="Favourites" active={activeItem === "favourites" && !isOnPageRoute} onClick={() => setActiveItem("favourites")} />
              <SidebarItem icon={Clock} label="Watch later" active={activeItem === "watchlater" && !isOnPageRoute} onClick={() => setActiveItem("watchlater")} />
            </div>

            <div className="h-px bg-sa-border my-2 mx-4" />

            <div className="flex flex-col gap-1">
              <span className="px-4 text-[10px] font-bold text-sa-text-3 uppercase tracking-widest mb-2">Creator</span>
              <SidebarItem icon={LayoutDashboard} label="Studio" active={currentPage === "studio"} onClick={() => navigateTo("studio")} />
              <SidebarItem icon={Shield} label="Admin" active={currentPage === "admin"} onClick={() => navigateTo("admin")} />
            </div>
          </nav>

          <div className="flex flex-col gap-1">
            <SidebarItem icon={Settings} label="Settings" onClick={() => {}} />
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
            className="glass rounded-[2rem] p-6 w-[440px] space-y-4 max-h-[90vh] overflow-y-auto"
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
