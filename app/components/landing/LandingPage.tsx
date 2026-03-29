"use client";

import { motion } from "motion/react";
import { Zap, Shield, Globe, ChevronRight } from "lucide-react";

export default function LandingPage({ onEnter, onSignIn }: {
  onEnter: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="flex flex-col gap-24 pb-24">
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden rounded-[3rem] mt-4">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-sa-bg/50 to-sa-bg z-10" />
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/40 via-indigo-950/30 to-blue-950/20" />
        </div>

        <div className="relative z-20 container mx-auto px-8 flex flex-col items-center text-center gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col gap-4"
          >
            <span className="text-sa-accent font-bold tracking-[0.2em] uppercase text-sm">Welcome to the future</span>
            <h1 className="text-7xl md:text-8xl font-bold tracking-tight leading-[0.9]">
              Stream without<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">boundaries.</span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl text-sa-text-3 max-w-2xl leading-relaxed"
          >
            Experience lightning-fast, decentralized streaming with instant payouts.
            No subscriptions, no ads, just pure content.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex gap-6"
          >
            <button type="button" onClick={onEnter} className="btn btn-primary px-10 py-4 text-lg shadow-2xl shadow-white/20">
              Get Started
            </button>
            <button type="button" onClick={onEnter} className="btn btn-glass px-10 py-4 text-lg flex gap-2">
              Watch Demo <ChevronRight size={20} />
            </button>
          </motion.div>
        </div>
      </section>

      <section className="container mx-auto px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { icon: Zap, title: "Instant Payouts", desc: "Creators earn every second they are watched, powered by Circle x402." },
          { icon: Shield, title: "Decentralized", desc: "No central authority. Your content, your rules, your revenue." },
          { icon: Globe, title: "Global Reach", desc: "Stream to anyone, anywhere in the world with minimal latency." },
        ].map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.2 }}
            className="glass p-10 rounded-[2.5rem] flex flex-col gap-6 hover:bg-sa-surface-2 transition-colors group"
          >
            <div className="w-14 h-14 rounded-2xl bg-sa-accent/10 flex items-center justify-center text-sa-accent group-hover:scale-110 transition-transform">
              <feature.icon size={32} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-2xl font-bold tracking-tight">{feature.title}</h3>
              <p className="text-sa-text-3 leading-relaxed">{feature.desc}</p>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="container mx-auto px-8">
        <div className="glass rounded-[3rem] p-16 flex flex-col items-center text-center gap-8 bg-gradient-to-br from-sa-accent/10 to-transparent border-sa-accent/20">
          <h2 className="text-5xl font-bold tracking-tight">Ready to join the revolution?</h2>
          <p className="text-sa-text-3 text-lg max-w-xl">
            Join thousands of creators and viewers who are already shaping the future of streaming.
          </p>
          <button type="button" onClick={onSignIn} className="btn btn-accent px-12 py-4 text-lg">
            Create Your Account
          </button>
        </div>
      </section>
    </div>
  );
}
