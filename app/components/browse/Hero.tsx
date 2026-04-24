"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Play, ArrowRight, Radio } from "lucide-react";
import { GlitchLogo } from "@/app/components/ui/GlitchLogo";

export default function Hero({
  onWatch,
  onSignup,
}: {
  onWatch: () => void;
  onSignup: () => void;
}) {
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
    <section
      className="relative overflow-hidden rounded-[1.5rem] px-8 py-14 md:px-12 md:py-16 lg:pr-4 xl:pr-6"
      style={{
        background:
          "linear-gradient(135deg, hsla(213, 50%, 8%, 0.85) 0%, hsla(195, 60%, 10%, 0.78) 50%, hsla(213, 50%, 7%, 0.85) 100%)",
        border: "1px solid hsla(188, 50%, 55%, 0.18)",
        backdropFilter: "blur(22px) saturate(140%)",
        WebkitBackdropFilter: "blur(22px) saturate(140%)",
        boxShadow:
          "0 30px 80px rgba(2, 8, 20, 0.55), inset 0 1px 0 hsla(188, 70%, 80%, 0.08)",
      }}
    >
      {/* Aurora orbs */}
      <div
        className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full opacity-50"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle, hsla(188, 90%, 55%, 0.35), transparent 60%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="pointer-events-none absolute -left-32 -bottom-32 h-96 w-96 rounded-full opacity-40"
        aria-hidden
        style={{
          background:
            "radial-gradient(circle, hsla(180, 80%, 65%, 0.28), transparent 60%)",
          filter: "blur(60px)",
        }}
      />

      {/* Decorative arc rings */}
      <div
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3"
        aria-hidden
      >
        <svg width="520" height="520" viewBox="0 0 520 520" fill="none" className="opacity-[0.16]">
          <circle cx="260" cy="260" r="220" stroke="url(#arc-grad-1)" strokeWidth="1.5" />
          <circle cx="260" cy="260" r="170" stroke="url(#arc-grad-1)" strokeWidth="1" strokeDasharray="2 6" />
          <circle cx="260" cy="260" r="120" stroke="url(#arc-grad-2)" strokeWidth="0.75" />
          <defs>
            <linearGradient id="arc-grad-1" x1="0" y1="0" x2="520" y2="520" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(188, 90%, 65%)" />
              <stop offset="50%" stopColor="hsl(180, 80%, 80%)" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="arc-grad-2" x1="0" y1="520" x2="520" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(195, 90%, 55%)" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* subtle grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" aria-hidden />

      <div className="relative z-10 flex items-center gap-8 md:gap-12">
        {/* LEFT: copy */}
        <div className="flex flex-1 flex-col gap-6 min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="flex flex-col gap-6"
          >
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-sa-blue/35 bg-sa-blue/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-sa-cyan backdrop-blur">
              <Radio size={12} /> Now streaming
            </span>

            <h1
              className="font-display text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl xl:text-6xl"
              style={{ lineHeight: 1.04 }}
            >
              Watch demos.
              <br />
              <span className="text-grad-brand">Pay per second.</span>
            </h1>

            <p className="max-w-lg text-base leading-7 text-sa-text-3 sm:text-lg">
              Browse creator videos and only pay for the seconds you actually
              watch, settled in USDC every five seconds. No subscriptions, no
              waste.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onWatch}
                className="btn btn-primary btn-shine"
              >
                <Play size={14} fill="currentColor" />
                Start watching
              </button>
              <button
                type="button"
                onClick={onSignup}
                className="btn btn-glass"
              >
                Create account
                <ArrowRight size={14} />
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
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sa-text-3">
                Watching now
              </span>
              <motion.span
                key={watchingNow}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="font-mono text-xl font-bold tabular-nums text-white"
              >
                {watchingNow}
              </motion.span>
            </div>
            <div className="h-8 w-px bg-sa-border/60" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sa-text-3">
                Per second
              </span>
              <span className="font-mono text-xl font-bold text-grad-brand-strong">
                $0.00003
              </span>
            </div>
            <div className="h-8 w-px bg-sa-border/60" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sa-text-3">
                Settles every
              </span>
              <span className="font-mono text-xl font-bold text-white">5s</span>
            </div>
          </motion.div>
        </div>

        {/* RIGHT: animated logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="hidden flex-shrink-0 items-center justify-center lg:ml-4 lg:flex xl:ml-8 lg:translate-x-2 xl:translate-x-3"
        >
          <div className="relative">
            <div
              className="absolute -inset-6 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, hsla(188, 90%, 60%, 0.4) 0%, transparent 65%)",
                filter: "blur(28px)",
              }}
            />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 50, ease: "linear", repeat: Infinity }}
              className="absolute -inset-3"
              aria-hidden
            >
              <svg viewBox="0 0 200 200" className="h-full w-full opacity-50">
                <circle
                  cx="100"
                  cy="100"
                  r="98"
                  stroke="hsl(188 90% 65%)"
                  strokeWidth="0.6"
                  fill="none"
                  strokeDasharray="1 5"
                />
              </svg>
            </motion.div>
            <div
              className="relative rounded-full p-1"
              style={{
                background:
                  "conic-gradient(from 90deg at 50% 50%, hsl(188 90% 65%), hsl(180 80% 80%), hsl(195 90% 55%), hsl(188 90% 65%))",
                boxShadow:
                  "0 0 60px hsla(188, 90%, 60%, 0.45), 0 0 140px hsla(180, 80%, 70%, 0.25)",
              }}
            >
              <div className="rounded-full bg-black p-1.5">
                <GlitchLogo
                  className="h-32 w-32 sm:h-36 sm:w-36 xl:h-44 xl:w-44"
                  period={6}
                  circle
                  videoObjectFit="cover"
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
