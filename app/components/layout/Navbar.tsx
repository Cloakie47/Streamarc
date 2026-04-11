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
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <header
        className="sticky top-0 z-40 mb-5 border-b transition-all duration-300"
        style={{
          background: scrolled
            ? "hsl(220 45% 10% / 0.90)"
            : "hsl(220 45% 10% / 0.65)",
          borderColor: scrolled
            ? "hsl(220 35% 30% / 0.28)"
            : "transparent",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center gap-4 px-6 py-3 lg:px-8">
          <div ref={searchRef} className="relative flex-1 max-w-xl group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-sa-text-3 group-focus-within:text-white transition-colors z-10" size={18} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowDropdown(true)}
              placeholder="Search demos, projects..."
              className="w-full bg-sa-surface-2 border-none rounded-2xl pl-12 pr-4 py-2.5 text-sm text-foreground placeholder:text-sa-text-3 focus:outline-none focus:ring-2 focus:ring-sa-accent/50 transition-all"
            />
            {showDropdown && results.length > 0 && (
              <div className="absolute top-full mt-2 w-full glass rounded-2xl border border-sa-border shadow-2xl overflow-hidden z-50">
                {results.map((video) => (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() => {
                      router.push(`/watch/${video.id}`);
                      setQuery("");
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors flex items-center justify-between gap-4 border-none bg-transparent cursor-pointer"
                  >
                    <span className="line-clamp-1 font-medium">{video.title}</span>
                    <span className="text-xs text-sa-text-3 flex-shrink-0">${video.rate_per_sec}/s</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={openTopUp}
              className="btn btn-primary btn-sm"
            >
              <Plus size={16} />
              Top up
            </button>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-sa-border bg-sa-surface-2 transition-colors hover:bg-sa-surface"
              aria-label="Notifications"
            >
              <Bell size={20} className="text-foreground" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-sa-red" />
            </button>
            {isSignedIn ? (
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-sa-border bg-sa-surface-2 text-sm font-bold text-foreground transition-colors hover:border-sa-border-hover"
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    user?.email?.[0]?.toUpperCase() || "U"
                  )}
                </button>
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-sa-border bg-[hsl(216_28%_16%/0.98)] py-2 shadow-[0_18px_40px_rgba(9,18,32,0.28)]"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/settings");
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                    >
                      Settings
                    </button>
                    <div className="h-px bg-sa-border mx-3 my-1" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-sa-accent transition-colors hover:bg-white/5"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onPageChange("signin")}
                className="btn btn-primary btn-sm"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>
    </motion.div>
  );
}
