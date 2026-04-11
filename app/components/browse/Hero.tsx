"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { GlitchLogo } from "@/app/components/ui/GlitchLogo";

export default function Hero({ onWatch, onSignup }: { onWatch: () => void; onSignup: () => void }) {
  const [watchingNow, setWatchingNow] = useState(247);

  useEffect(() => {
    const values = [249, 245, 251, 248, 246, 250];
    let cursor = 0;
    const timer = window.setInterval(() => {
      setWatchingNow(values[cursor % values.length]);
      cursor += 1;
    }, 2800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-2xl px-8 py-14 md:px-12 md:py-16"
      style={{
        background: "linear-gradient(135deg, hsl(220 55% 12% / 0.85) 0%, hsl(240 50% 14% / 0.75) 50%, hsl(210 60% 12% / 0.80) 100%)",
        border: "1px solid hsl(220 40% 35% / 0.20)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 24px 64px rgba(4, 10, 24, 0.5), inset 0 1px 0 hsl(220 60% 70% / 0.08)",
      }}
    >
      {/* Decorative arc rings — right side, like Arc website */}
      <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3" aria-hidden>
        <svg width="480" height="480" viewBox="0 0 480 480" fill="none" className="opacity-[0.12]">
          <circle cx="240" cy="240" r="200" stroke="url(#arc-grad-1)" strokeWidth="1.5" />
          <circle cx="240" cy="240" r="155" stroke="url(#arc-grad-1)" strokeWidth="1" />
          <circle cx="240" cy="240" r="110" stroke="url(#arc-grad-2)" strokeWidth="0.75" />
          <defs>
            <linearGradient id="arc-grad-1" x1="0" y1="0" x2="480" y2="480" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(210, 80%, 70%)" />
              <stop offset="50%" stopColor="hsl(255, 70%, 65%)" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="arc-grad-2" x1="0" y1="480" x2="480" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(185, 80%, 60%)" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Inner glow overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl" aria-hidden
        style={{ background: "radial-gradient(ellipse 60% 70% at 70% 50%, hsl(255 60% 40% / 0.10) 0%, transparent 65%)" }}
      />

      <div className="relative z-10 flex items-center gap-8 md:gap-12">
        {/* Left — copy */}
        <div className="flex flex-1 flex-col gap-6 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="flex flex-col gap-6"
          >
            <span
              className="inline-block w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(210 80% 55% / 0.15)",
                border: "1px solid hsl(210 80% 60% / 0.25)",
                color: "hsl(210 80% 75%)",
              }}
            >
              Arc Streaming Network
            </span>

            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl xl:text-6xl" style={{ lineHeight: 1.1 }}>
              Watch demos.<br />
              <span style={{ background: "linear-gradient(90deg, hsl(210 80% 70%), hsl(255 70% 75%), hsl(185 80% 65%))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Pay per second.
              </span>
            </h1>

            <p className="max-w-lg text-base leading-relaxed" style={{ color: "hsl(214 20% 70%)" }}>
              Browse creator videos and only pay for the seconds you actually watch —
              settled in USDC every 5 seconds. No subscriptions, no waste.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onWatch}
                className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, hsl(210 80% 50%), hsl(255 70% 55%))",
                  boxShadow: "0 4px 20px hsl(210 80% 50% / 0.35)",
                }}
              >
                Start watching
              </button>
              <button
                type="button"
                onClick={onSignup}
                className="rounded-xl px-6 py-3 text-sm font-semibold transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5"
                style={{
                  background: "hsl(220 40% 18% / 0.7)",
                  border: "1px solid hsl(220 30% 40% / 0.35)",
                  color: "hsl(214 20% 82%)",
                  backdropFilter: "blur(8px)",
                }}
              >
                Create account
              </button>
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="flex flex-wrap items-center gap-6 pt-2"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "hsl(214 20% 55%)" }}>
                Watching now
              </span>
              <motion.span
                key={watchingNow}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-xl font-bold tabular-nums text-white"
              >
                {watchingNow}
              </motion.span>
            </div>
            <div className="h-8 w-px" style={{ background: "hsl(220 30% 35% / 0.4)" }} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "hsl(214 20% 55%)" }}>Per second</span>
              <span className="text-xl font-bold" style={{ color: "hsl(41 80% 70%)" }}>$0.00003</span>
            </div>
            <div className="h-8 w-px" style={{ background: "hsl(220 30% 35% / 0.4)" }} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "hsl(214 20% 55%)" }}>Settlement</span>
              <span className="text-xl font-bold text-white">5 s</span>
            </div>
          </motion.div>
        </div>

        {/* Right — glitch logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="hidden flex-shrink-0 lg:flex items-center justify-center"
        >
          <div className="relative">
            <div className="absolute -inset-6 rounded-full"
              style={{ background: "radial-gradient(circle, hsl(255 70% 50% / 0.22) 0%, transparent 70%)", filter: "blur(24px)" }}
            />
            <GlitchLogo className="h-36 w-36 xl:h-44 xl:w-44" period={6} circle />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
