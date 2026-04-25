"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Play, ArrowRight, Radio } from "lucide-react";

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
    <section className="relative overflow-hidden rounded-[1.5rem] border border-sa-border-light bg-sa-surface px-8 py-14 md:px-12 md:py-16">
      <div className="relative z-10 flex flex-col gap-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="flex flex-col gap-6"
        >
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-sa-blue/35 bg-sa-blue/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-sa-blue">
            <Radio size={12} /> Now streaming
          </span>

          <h1
            className="font-display text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl xl:text-6xl"
            style={{ lineHeight: 1.04 }}
          >
            Watch demos.
            <br />
            <span className="text-sa-blue">Pay per second.</span>
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
              className="btn btn-primary"
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
            <span className="font-mono text-xl font-bold text-sa-blue">
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
    </section>
  );
}
