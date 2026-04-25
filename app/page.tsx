"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "./components/layout/Navbar";
import Sidebar from "./components/layout/Sidebar";
import BrowsePage from "./components/browse/BrowsePage";
import SignInPage from "./components/auth/SignInPage";
import StudioPage from "./components/studio/StudioPage";
import LandingPage from "./components/landing/LandingPage";
import { DEFAULT_WATCH_VIDEO_ID } from "./lib/constants";
import { useScrolled } from "./lib/useScrolled";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Derive currentPage directly from the URL — the URL is the single source
  // of truth. No local state / sync effect needed, so back/forward, refresh,
  // and deep links all resolve consistently.
  const currentPage = searchParams.get("page") ?? "landing";
  const [balance, setBalance] = useState(0);
  const scrolled = useScrolled();

  // Canonical navigator: always updates the URL so refresh / back / forward
  // all land on the correct page instead of falling back to "landing".
  const navigate = (page: string) => {
    if (page === currentPage) return;
    router.push(`/?page=${encodeURIComponent(page)}`);
  };

  const showSidebar = currentPage !== "landing" && currentPage !== "signin";

  return (
    <div className="min-h-screen bg-sa-bg text-sa-text">
      {showSidebar && (
        <Sidebar
          balance={balance}
          onBalanceChange={setBalance}
          onPageChange={navigate}
          currentPage={currentPage}
        />
      )}

      <main className={`transition-all duration-300 ${showSidebar ? "lg:ml-[236px]" : ""}`}>
        {showSidebar && (
          <Navbar
            onPageChange={navigate}
            balance={balance}
            scrolled={scrolled}
          />
        )}

        <div className={`${showSidebar ? "px-4 pb-8 lg:px-8" : ""}`}>
          {currentPage === "landing" && (
            <LandingPage
              onEnter={() => navigate("browse")}
              onSignIn={() => navigate("signin")}
            />
          )}
          {currentPage === "browse" && (
            <BrowsePage
              onWatch={(videoId) =>
                router.push(`/watch/${videoId ?? DEFAULT_WATCH_VIDEO_ID}`)
              }
              onSignup={() => navigate("signin")}
            />
          )}
          {currentPage === "signin" && (
            <SignInPage onSignIn={() => navigate("browse")} />
          )}
          {currentPage === "studio" && (
            <StudioPage />
          )}
        </div>
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
