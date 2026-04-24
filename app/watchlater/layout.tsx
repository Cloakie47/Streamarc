"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/layout/Navbar";
import Sidebar from "@/app/components/layout/Sidebar";
import { useCurrentUser } from "@/app/lib/auth-client";

export default function WatchLaterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [balance, setBalance] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const router = useRouter();
  const { userId } = useCurrentUser();

  useEffect(() => {
    if (!userId) return;
    fetch("/api/gateway/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.balance) setBalance(data.balance);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    const handleLiveBalance = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === "number") {
        setBalance(detail.balance);
      }
    };

    window.addEventListener("gateway-balance-live", handleLiveBalance as EventListener);
    return () => window.removeEventListener("gateway-balance-live", handleLiveBalance as EventListener);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handlePageChange = (page: string) => {
    router.push(`/?page=${encodeURIComponent(page)}`);
  };

  return (
    <div className="min-h-screen bg-sa-bg text-sa-text">
      <Sidebar
        balance={balance}
        onBalanceChange={setBalance}
        onPageChange={handlePageChange}
        currentPage="watchlater"
      />
      <main className="lg:ml-[236px]">
        <Navbar
          onPageChange={handlePageChange}
          balance={balance}
          scrolled={scrolled}
        />
        <div className="min-h-[calc(100vh-76px)] px-4 pb-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
