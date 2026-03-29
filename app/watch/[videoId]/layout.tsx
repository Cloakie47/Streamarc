"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Navbar from "@/app/components/layout/Navbar"
import Sidebar from "@/app/components/layout/Sidebar"
import { useCurrentUser } from "@/app/lib/auth-client"

export default function WatchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [balance, setBalance] = useState(0)
  const [scrolled, setScrolled] = useState(false)
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
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handlePageChange = (page: string) => {
    if (page === "studio") router.push("/?page=studio")
    else router.push("/")
  }

  return (
    <div className="min-h-screen bg-sa-bg text-sa-text">
      <Sidebar
        balance={balance}
        onBalanceChange={setBalance}
        onPageChange={handlePageChange}
        currentPage="watch"
      />
      <main className="ml-[260px] px-8">
        <Navbar
          onPageChange={handlePageChange}
          balance={balance}
          scrolled={scrolled}
        />
        <div className="h-[calc(100vh-120px)]">
          {children}
        </div>
      </main>
    </div>
  )
}
