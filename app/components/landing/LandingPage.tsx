"use client";

import { motion } from "motion/react";
import { Zap, Shield, Globe, ChevronRight } from "lucide-react";

export default function LandingPage({ onEnter, onSignIn }: {
  onEnter: () => void;
  onSignIn: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-12 pb-16 pt-6">
      <section className="panel relative overflow-hidden px-6 py-10 md:px-10 md:py-14">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-sa-blue/10 via-transparent to-transparent lg:block" />
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex flex-col gap-5"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sa-blue">
              StreamArc
            </span>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              A cleaner way to stream demos and pay creators per second.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-sa-text-3">
              Watch what you need, stop anytime, and only pay for the seconds you actually use.
              StreamArc combines familiar video browsing with instant creator settlement.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onEnter} className="btn btn-primary">
                Enter app
              </button>
              <button type="button" onClick={onSignIn} className="btn btn-glass">
                Create account
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="grid gap-4"
          >
            <div className="panel-muted p-5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sa-text-3">Sample flow</span>
              <div className="mt-4 space-y-3">
                {[
                  "Browse creator demos",
                  "Open any video instantly",
                  "Pay only while watching",
                ].map((step, index) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sa-blue/20 text-xs font-semibold text-sa-blue">
                      {index + 1}
                    </div>
                    <span className="text-sm text-foreground">{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="panel-muted p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sa-text-3">Rate</div>
                <div className="mt-2 text-xl font-semibold text-sa-accent">$0.00003</div>
              </div>
              <div className="panel-muted p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sa-text-3">Preview</div>
                <div className="mt-2 text-xl font-semibold">10s</div>
              </div>
              <div className="panel-muted p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sa-text-3">Batch</div>
                <div className="mt-2 text-xl font-semibold">5s</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[
          { icon: Zap, title: "Per-second pricing", desc: "Keep the pricing model simple and visible without subscriptions or bundles." },
          { icon: Shield, title: "Clear creator trust", desc: "Present creator identity, playback, and payment status in one familiar layout." },
          { icon: Globe, title: "Built for demos", desc: "Make technical video content easier to browse, sample, and revisit quickly." },
        ].map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="panel p-6"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sa-blue/15 text-sa-blue">
              <feature.icon size={24} />
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-tight">{feature.title}</h3>
            <p className="mt-2 text-sm leading-7 text-sa-text-3">{feature.desc}</p>
          </motion.div>
        ))}
      </section>

      <section className="panel flex flex-col items-start gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Ready to start watching?</h2>
          <p className="mt-2 text-sm leading-7 text-sa-text-3">
            Open the app to browse live demos, or create an account to save your profile and publish content.
          </p>
        </div>
        <button type="button" onClick={onEnter} className="btn btn-primary">
          Open StreamArc
          <ChevronRight size={16} />
        </button>
      </section>
    </div>
  );
}
