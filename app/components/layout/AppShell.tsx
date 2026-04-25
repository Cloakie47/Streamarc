"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/app/components/layout/Sidebar";
import Navbar from "@/app/components/layout/Navbar";
import { useScrolled } from "@/app/lib/useScrolled";

/**
 * Main app chrome (sidebar + navbar) for routes that are not the home `page` shell,
 * e.g. `/studio`, so layout matches in-app navigation from `/`.
 */
export default function AppShell({
  children,
  currentPage,
}: {
  children: ReactNode;
  currentPage: string;
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const scrolled = useScrolled();

  const onPageChange = (page: string) => {
    router.push(`/?page=${encodeURIComponent(page)}`);
  };

  return (
    <div className="min-h-screen bg-sa-bg text-sa-text">
      <Sidebar
        balance={balance}
        onBalanceChange={setBalance}
        onPageChange={onPageChange}
        currentPage={currentPage}
      />

      <main className="transition-all duration-300 lg:ml-[236px]">
        <Navbar onPageChange={onPageChange} balance={balance} scrolled={scrolled} />

        <div className="px-4 pb-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
