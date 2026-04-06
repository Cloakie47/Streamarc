"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Search, Bell, Plus, Upload } from "lucide-react";
import { useCurrentUser, signOut } from "@/app/lib/auth-client";

export default function Navbar({ onPageChange, balance, scrolled }: {
  onPageChange: (page: string) => void;
  balance?: number;
  scrolled?: boolean;
}) {
  const router = useRouter();
  const { user, isSignedIn } = useCurrentUser();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <header className={`sticky top-4 z-40 transition-all duration-300 rounded-[2rem] mb-8 ${
        scrolled ? "glass shadow-2xl shadow-black/50" : "bg-transparent"
      }`}>
        <div className="px-8 py-4 flex items-center justify-between">
          <div className="flex-1 max-w-xl">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-sa-text-3 group-focus-within:text-white transition-colors" size={18} />
              <input
                type="text"
                placeholder="Search demos, projects..."
                className="w-full bg-sa-surface-2 border-none rounded-2xl pl-12 pr-4 py-2.5 text-sm text-foreground placeholder:text-sa-text-3 focus:outline-none focus:ring-2 focus:ring-sa-accent/50 transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-[10px] font-bold text-sa-text-3 uppercase tracking-widest">USDC Balance</span>
              <span className="text-sm font-bold text-foreground">${typeof balance === "number" ? balance.toFixed(2) : "0.00"}</span>
            </div>
            <button
              type="button"
              onClick={openTopUp}
              className="btn btn-glass btn-sm bg-sa-green/10 text-sa-green border border-sa-green/20 hover:bg-sa-green/20"
            >
              <Plus size={16} />
              Top up
            </button>
            <button
              type="button"
              className="p-2.5 rounded-full glass hover:bg-sa-surface-2 transition-colors cursor-pointer border-none relative"
            >
              <Bell size={20} className="text-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-sa-accent rounded-full border-2 border-sa-bg" />
            </button>
            {isSignedIn ? (
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  className="w-10 h-10 rounded-full glass overflow-hidden border-2 border-sa-border hover:border-sa-accent transition-colors cursor-pointer flex items-center justify-center text-sm font-bold text-foreground"
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    user?.email?.[0]?.toUpperCase() || "U"
                  )}
                </button>
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-12 w-48 glass rounded-2xl border border-sa-border shadow-2xl py-2 z-50"
                    role="menu"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        router.push("/settings");
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
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
                      className="w-full text-left px-4 py-2.5 text-sm text-sa-accent hover:bg-white/5 transition-colors"
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
