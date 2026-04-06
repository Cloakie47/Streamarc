"use client";

import { motion } from "motion/react";

export default function Hero({ onWatch, onSignup }: { onWatch: () => void; onSignup: () => void }) {
  return (
    <section className="relative mx-6 mt-4 overflow-hidden rounded-[2rem] group border border-white/[0.06]"
      style={{ boxShadow: "0 8px 40px -12px rgba(0,0,0,0.6)" }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent z-10" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#12131f] via-[#161822] to-[#0a0b10]" />

      {/* Animated floating orbs */}
      <motion.div
        className="absolute -right-20 -top-20 h-80 w-80 rounded-full"
        style={{ background: "radial-gradient(circle, hsl(12 85% 58% / 0.2), transparent 70%)", filter: "blur(80px)" }}
        animate={{ x: [0, 15, -10, 0], y: [0, -20, 10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-1/4 top-1/3 h-64 w-64 rounded-full"
        style={{ background: "radial-gradient(circle, hsl(240 60% 50% / 0.15), transparent 70%)", filter: "blur(70px)" }}
        animate={{ x: [0, -12, 8, 0], y: [0, 15, -8, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[10%] bottom-0 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, hsl(340 60% 50% / 0.12), transparent 70%)", filter: "blur(60px)" }}
        animate={{ x: [0, 10, -6, 0], y: [0, -10, 12, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Grid mesh overlay on the right */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "linear-gradient(to left, white 40%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to left, white 40%, transparent 70%)",
        }}
      />

      <div className="relative z-20 p-8 md:p-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-6"
        >
          <h1 className="text-5xl font-bold tracking-tight leading-tight">
            Watch ARC demos.<br />
            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-300 bg-clip-text text-transparent">
              Pay only for what you see.
            </span>
          </h1>
          <p className="text-sa-text-3 text-lg max-w-lg">
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
