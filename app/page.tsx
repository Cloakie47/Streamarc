"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "./components/layout/Navbar";
import Sidebar from "./components/layout/Sidebar";
import BrowsePage from "./components/browse/BrowsePage";
import SignInPage from "./components/auth/SignInPage";
import StudioPage from "./components/studio/StudioPage";
import LandingPage from "./components/landing/LandingPage";
import { DEFAULT_WATCH_VIDEO_ID } from "./lib/constants";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentPage, setCurrentPage] = useState(
    searchParams.get("page") ?? "browse"
  );
  const [balance, setBalance] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const page = searchParams.get("page");
    if (page) setCurrentPage(page);
  }, [searchParams]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const showSidebar = currentPage !== "landing" && currentPage !== "signin";

  return (
    <div className="min-h-screen bg-sa-bg text-sa-text">
      {showSidebar && (
        <Sidebar
          balance={balance}
          onBalanceChange={setBalance}
          onPageChange={setCurrentPage}
          currentPage={currentPage}
        />
      )}

      <main className={`transition-all duration-500 ${showSidebar ? "ml-[260px]" : ""} px-8`}>
        {showSidebar && (
          <Navbar
            onPageChange={setCurrentPage}
            balance={balance}
            scrolled={scrolled}
          />
        )}

        <div className="pt-4">
          {currentPage === "landing" && (
            <LandingPage
              onEnter={() => setCurrentPage("browse")}
              onSignIn={() => setCurrentPage("signin")}
            />
          )}
          {currentPage === "browse" && (
            <BrowsePage
              onWatch={(videoId) =>
                router.push(`/watch/${videoId ?? DEFAULT_WATCH_VIDEO_ID}`)
              }
              onSignup={() => setCurrentPage("signin")}
            />
          )}
          {currentPage === "signin" && (
            <SignInPage onSignIn={() => setCurrentPage("browse")} />
          )}
          {currentPage === "studio" && (
            <StudioPage />
          )}
        </div>

        {currentPage === "landing" && (
          <div className="fixed top-8 right-8 z-50 flex gap-4">
            <button
              type="button"
              onClick={() => setCurrentPage("browse")}
              className="btn btn-glass btn-sm"
            >
              Enter App
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage("signin")}
              className="btn btn-primary btn-sm"
            >
              Sign In
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-sa-bg text-sa-text flex items-center justify-center">
          <span className="text-sm text-sa-text-3">Loading...</span>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
