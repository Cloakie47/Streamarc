"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Navbar from "@/app/components/layout/Navbar"
import Sidebar from "@/app/components/layout/Sidebar"
import { useCurrentUser } from "@/app/lib/auth-client"
import { useScrolled } from "@/app/lib/useScrolled"

export default function WatchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [balance, setBalance] = useState(0)
  const scrolled = useScrolled()
  const router = useRouter()
  const { userId } = useCurrentUser()

  useEffect(() => {
    if (!userId) return
    fetch("/api/gateway/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.balance) setBalance(data.balance)
      })
      .catch(() => {})
  }, [userId])

  useEffect(() => {
    const handleLiveBalance = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail
      if (typeof detail?.balance === "number") {
        setBalance(detail.balance)
      }
    }

    window.addEventListener("gateway-balance-live", handleLiveBalance as EventListener)
    return () => window.removeEventListener("gateway-balance-live", handleLiveBalance as EventListener)
  }, [])

  const handlePageChange = (page: string) => {
    router.push(`/?page=${encodeURIComponent(page)}`)
  }

  return (
    <div className="min-h-screen bg-sa-bg text-sa-text">
      <Sidebar
        balance={balance}
        onBalanceChange={setBalance}
        onPageChange={handlePageChange}
        currentPage="watch"
      />
      <main className="lg:ml-[236px]">
        <Navbar
          onPageChange={handlePageChange}
          balance={balance}
          scrolled={scrolled}
        />
        <div className="px-4 pb-8 lg:px-8 min-h-[calc(100vh-76px)]">
          {children}
        </div>
      </main>
    </div>
  )
}
