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
  const { user, isSignedIn, userId } = useCurrentUser();
  const [notifications, setNotifications] = useState<
    { id: string; type: string; title: string; message: string | null; read: boolean; created_at: string }[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!userId) return;
    const fetchUnreadCount = async () => {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action: "unread_count" }),
      });
      const data = (await res.json()) as { count?: number };
      setUnreadCount(data.count ?? 0);
    };
    void fetchUnreadCount();
    const interval = window.setInterval(() => {
      void fetchUnreadCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openTopUp = () => {
    window.dispatchEvent(new CustomEvent("open-top-up"));
  };

  const fetchNotifications = async () => {
    if (!userId) return;
    setLoadingNotifications(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action: "list" }),
      });
      const data = (await res.json()) as {
        notifications?: {
          id: string;
          type: string;
          title: string;
          message: string | null;
          read: boolean;
          created_at: string;
        }[];
      };
      setNotifications(data.notifications ?? []);
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, action: "mark_read" }),
      });
      setUnreadCount(0);
    } finally {
      setLoadingNotifications(false);
    }
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
            ? "hsla(213, 50%, 6%, 0.85)"
            : "hsla(213, 50%, 6%, 0.45)",
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
                    <span className="font-mono tabular-nums text-sa-blue text-xs flex-shrink-0">${video.rate_per_sec}/s</span>
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
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowNotifications((prev) => {
                    const next = !prev;
                    if (!prev) {
                      void fetchNotifications();
                    }
                    return next;
                  });
                }}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-sa-border bg-sa-surface-2 text-sa-text-3 transition-all hover:border-sa-border-hover hover:text-foreground"
                aria-label="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-sa-border bg-card shadow-2xl">
                  <div className="flex items-center justify-between border-b border-sa-border px-4 py-3">
                    <h3 className="text-sm font-bold">Notifications</h3>
                    {notifications.length > 0 && (
                      <span className="text-xs text-muted-foreground">{notifications.length} total</span>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {loadingNotifications ? (
                      <div className="flex items-center justify-center py-8">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <Bell size={24} className="text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const ago = Math.floor((Date.now() - new Date(n.created_at).getTime()) / 60000);
                        const timeAgo =
                          ago < 1
                            ? "just now"
                            : ago < 60
                              ? `${ago}m ago`
                              : ago < 1440
                                ? `${Math.floor(ago / 60)}h ago`
                                : `${Math.floor(ago / 1440)}d ago`;
                        const icons: Record<string, string> = {
                          follow: "\u{1F464}",
                          comment: "\u{1F4AC}",
                          tip: "\u{1F4B0}",
                          offer: "\u{1F3F7}\uFE0F",
                          whitelist: "\u2705",
                          purchase: "\u{1F389}",
                        };
                        return (
                          <div
                            key={n.id}
                            className={`flex items-start gap-3 border-b border-sa-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-white/[0.02] ${
                              !n.read ? "bg-primary/[0.03]" : ""
                            }`}
                          >
                            <span className="mt-0.5 flex-shrink-0 text-lg">{icons[n.type] ?? "\u{1F514}"}</span>
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <p className="text-sm font-medium">{n.title}</p>
                              {n.message && <p className="text-xs text-muted-foreground">{n.message}</p>}
                              <p className="text-[10px] text-muted-foreground/60">{timeAgo}</p>
                            </div>
                            {!n.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
            {isSignedIn ? (
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-black transition-all duration-200 hover:scale-105 active:scale-95"
                  style={{
                    background: "var(--sa-blue)",
                    boxShadow: "0 4px 14px hsla(188, 86%, 50%, 0.3)",
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
        {/* hairline bottom edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-sa-border/60"
        />
      </header>
    </motion.div>
  );
}
