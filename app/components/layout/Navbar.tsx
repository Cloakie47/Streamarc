"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Search, Bell, Plus, Upload } from "lucide-react";
import { useCurrentUser, signOut } from "@/app/lib/auth-client";

export default function Navbar({ onPageChange, balance, scrolled }: {
  onPageChange: (page: string) => void;
  balance?: number;
  scrolled?: boolean;
}) {
  const { user, isSignedIn } = useCurrentUser();

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
              <button
                type="button"
                onClick={() => signOut()}
                className="w-10 h-10 rounded-full glass overflow-hidden border-2 border-sa-border hover:border-sa-accent transition-colors cursor-pointer flex items-center justify-center text-sm font-bold text-foreground"
              >
                {user?.email?.[0]?.toUpperCase() || "U"}
              </button>
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
