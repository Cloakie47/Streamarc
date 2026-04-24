"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Search, Bell, Plus } from "lucide-react";
import { useCurrentUser, signOut } from "@/app/lib/auth-client";

export default function Navbar({
  onPageChange,
  balance,
  scrolled,
}: {
  onPageChange: (page: string) => void;
  balance?: number;
  scrolled?: boolean;
}) {
  const router = useRouter();
  const { user, isSignedIn } = useCurrentUser();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [liveBalanceActive, setLiveBalanceActive] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const liveBalanceTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; rate_per_sec: number }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/videos?status=live&search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.videos?.slice(0, 6) ?? []);
      setShowDropdown(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const el = userMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [userMenuOpen]);

  const openTopUp = () => {
    window.dispatchEvent(new CustomEvent("open-top-up"));
  };

  useEffect(() => {
    const handleLiveBalance = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance !== "number") return;
      setLiveBalance(detail.balance);
      setLiveBalanceActive(true);

      if (liveBalanceTimerRef.current) {
        window.clearTimeout(liveBalanceTimerRef.current);
      }

      liveBalanceTimerRef.current = window.setTimeout(() => {
        setLiveBalanceActive(false);
      }, 1800);
    };

    window.addEventListener("gateway-balance-live", handleLiveBalance as EventListener);
    return () => {
      window.removeEventListener("gateway-balance-live", handleLiveBalance as EventListener);
      if (liveBalanceTimerRef.current) {
        window.clearTimeout(liveBalanceTimerRef.current);
      }
    };
  }, []);

  const displayedBalance = liveBalanceActive && typeof liveBalance === "number"
    ? liveBalance.toFixed(4)
    : `${
        typeof balance === "number" ? balance.toFixed(2) : "0.00"
      }`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <header
        className="sticky top-0 z-40 mb-6 transition-all duration-500"
        style={{
          background: scrolled
            ? "linear-gradient(180deg, hsla(213, 50%, 6%, 0.88), hsla(213, 50%, 6%, 0.72))"
            : "linear-gradient(180deg, hsla(213, 50%, 6%, 0.55), hsla(213, 50%, 6%, 0.30))",
          borderBottom: scrolled
            ? "1px solid hsla(188, 50%, 50%, 0.18)"
            : "1px solid transparent",
          backdropFilter: "blur(22px) saturate(140%)",
          WebkitBackdropFilter: "blur(22px) saturate(140%)",
          boxShadow: scrolled
            ? "0 10px 30px rgba(2, 8, 20, 0.35)"
            : "none",
        }}
      >
        <div className="flex items-center gap-4 px-6 py-3.5 lg:px-8">
          <div ref={searchRef} className="relative flex-1 max-w-xl group">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-sa-text-3 group-focus-within:text-sa-cyan transition-colors duration-200"
              size={18}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              placeholder="Search demos, creators, topics..."
              className="input-surface w-full pl-12 pr-4 py-2.5 text-sm font-medium"
            />
            {showDropdown && results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="panel absolute top-full mt-3 w-full overflow-hidden z-50"
              >
                {results.map((video) => (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() => {
                      router.push(`/watch/${video.id}`);
                      setQuery("");
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between gap-4 border-none bg-transparent cursor-pointer hover:bg-sa-blue/8 group/item"
                    style={{ background: "transparent" }}
                  >
                    <span className="line-clamp-1 font-medium group-hover/item:text-sa-cyan transition-colors">{video.title}</span>
                    <span className="font-mono text-xs text-sa-text-3 flex-shrink-0">${video.rate_per_sec}/s</span>
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={openTopUp}
              className="btn btn-primary btn-sm btn-shine"
            >
              <Plus size={14} />
              Top up
            </button>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-sa-border bg-sa-surface/60 backdrop-blur-md transition-all duration-200 hover:border-sa-blue/45 hover:bg-sa-surface hover:scale-105 active:scale-95"
              aria-label="Notifications"
            >
              <Bell size={18} className="text-foreground" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-sa-red shadow-[0_0_8px_2px_rgba(244,93,93,0.6)] pulse-live" />
            </button>
            {isSignedIn ? (
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-black transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    background: "var(--sa-grad)",
                    boxShadow: "0 4px 16px hsla(188, 86%, 50%, 0.35), inset 0 1px 0 hsla(0,0%,100%,0.25)",
                  }}
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    user?.email?.[0]?.toUpperCase() || "U"
                  )}
                </button>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="panel absolute right-0 top-12 z-50 w-56 py-2"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/settings");
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-sa-blue/10 hover:text-sa-cyan"
                    >
                      Settings
                    </button>
                    <div className="h-px bg-sa-border/60 mx-3 my-1" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-sa-red transition-colors hover:bg-sa-red/10"
                    >
                      Sign out
                    </button>
                  </motion.div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onPageChange("signin")}
                className="btn btn-primary btn-sm btn-shine"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
        {/* hairline scan line */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px opacity-50"
          style={{
            background:
              "linear-gradient(90deg, transparent, hsla(188, 86%, 60%, 0.6), transparent)",
          }}
        />
      </header>
    </motion.div>
  );
}
