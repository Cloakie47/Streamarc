"use client";

import { motion } from "motion/react";

export default function Hero({ onWatch, onSignup }: { onWatch: () => void; onSignup: () => void }) {
  return (
    <section className="relative mx-6 mt-4 overflow-hidden rounded-[2rem] group">
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#12131f] via-[#161822] to-[#0a0b10]" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sa-accent/15 blur-[100px]" />
      <div className="absolute -bottom-16 right-1/4 h-48 w-48 rounded-full bg-indigo-500/10 blur-[80px]" />

      <div className="relative z-20 p-8 md:p-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-6"
        >
          <h1 className="text-5xl font-bold tracking-tight leading-tight">
            Watch ARC demos.<br />
            <span className="text-sa-accent">Pay only for what you see.</span>
          </h1>
          <p className="text-sa-text-3 text-lg">
            $0.00003 per second. No subscriptions. No ads. Creators earn instantly via Circle x402 on ARC Testnet.
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onWatch}
              className="btn btn-primary shadow-xl shadow-white/10"
            >
              Start watching
            </button>
            <button
              type="button"
              onClick={onSignup}
              className="btn btn-glass"
            >
              Create account
            </button>
          </div>
          <div className="flex gap-8 mt-4">
            <div className="flex flex-col">
              <span className="text-2xl font-bold">247</span>
              <span className="text-[10px] text-sa-text-3 uppercase tracking-widest font-bold">Watching Now</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold">$0.00003</span>
              <span className="text-[10px] text-sa-text-3 uppercase tracking-widest font-bold">Per Second</span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold">5s</span>
              <span className="text-[10px] text-sa-text-3 uppercase tracking-widest font-bold">Batch Interval</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
