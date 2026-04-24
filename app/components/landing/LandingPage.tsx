"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  Play,
  Wallet,
  ShieldCheck,
  Radio,
} from "lucide-react";
import { GlitchLogo } from "@/app/components/ui/GlitchLogo";

interface LandingPageProps {
  onEnter: () => void;
  onSignIn: () => void;
}

/* ──────────────────────────────────────────────────────────
   Minimal, clean, professional landing page.
   Hero · Features · Metrics · CTA · Footer
   ────────────────────────────────────────────────────────── */

export default function LandingPage({ onEnter, onSignIn }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#040910] text-sa-text">
      {/* Soft ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, hsla(188, 90%, 55%, 0.18), transparent 60%), radial-gradient(800px 500px at 90% 30%, hsla(180, 80%, 70%, 0.08), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at 50% 0%, black 40%, transparent 75%)",
        }}
      />

      {/* ─── Nav ─── */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-white/10">
            <GlitchLogo className="h-9 w-9" circle videoObjectFit="cover" />
          </div>
          <span className="text-base font-semibold tracking-tight">
            Stream<span className="text-sa-blue">Arc</span>
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <button
            onClick={onSignIn}
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-sa-text-2 transition hover:text-foreground sm:inline-flex"
          >
            Sign in
          </button>
          <button
            onClick={onEnter}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-medium text-foreground ring-1 ring-white/10 transition hover:bg-white/10"
          >
            Launch app
            <ArrowRight size={14} />
          </button>
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto flex max-w-3xl flex-col items-center text-center"
        >
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-sa-text-2 backdrop-blur">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-sa-blue opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sa-blue" />
            </span>
            Live creator economy · beta
          </div>

          <h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Streaming that pays
            <br />
            <span className="bg-gradient-to-r from-sa-blue via-sa-cyan to-sa-blue bg-clip-text text-transparent">
              creators fairly.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-sa-text-2 sm:text-lg">
            A next-generation streaming platform where every second watched
            turns into instant, on-chain earnings — no middlemen, no payout
            delays.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <button
              onClick={onEnter}
              className="group inline-flex items-center gap-2 rounded-full bg-sa-blue px-6 py-3 text-sm font-semibold text-sa-navy shadow-[0_8px_30px_-8px_rgba(48,216,240,0.5)] transition hover:bg-sa-cyan"
            >
              <Play size={15} className="fill-current" />
              Start watching
              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </button>
            <button
              onClick={onSignIn}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-6 py-3 text-sm font-medium text-foreground transition hover:bg-white/[0.06]"
            >
              Sign in
            </button>
          </div>

          {/* Subtle metric strip */}
          <div className="mt-14 grid w-full max-w-xl grid-cols-3 gap-8 border-t border-white/10 pt-8 text-left">
            <Metric value="100%" label="On-chain payouts" />
            <Metric value="0.03s" label="Per-second billing" />
            <Metric value="24/7" label="Live streaming" />
          </div>
        </motion.div>
      </section>

      {/* ─── Features ─── */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24 sm:pb-32">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-sa-blue">
              How it works
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Simple for viewers. Fair for creators.
            </h2>
          </div>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:grid-cols-3">
          <Feature
            icon={Radio}
            title="Stream anything"
            body="Live shows, recorded series, and creator channels — all in one clean, fast-loading app."
          />
          <Feature
            icon={Wallet}
            title="Earn per second"
            body="Creators are paid in real time, by the second, straight to their wallet. No ads, no delays."
          />
          <Feature
            icon={ShieldCheck}
            title="You own your data"
            body="Transparent, on-chain settlement. Your watch history stays yours — never sold, never tracked."
          />
        </div>
      </section>

      {/* ─── Closing CTA ─── */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
        <div
          className="overflow-hidden rounded-3xl border border-white/10 p-10 text-center sm:p-16"
          style={{
            background:
              "linear-gradient(135deg, hsla(188, 90%, 55%, 0.12), hsla(200, 60%, 10%, 0.4))",
          }}
        >
          <h3 className="mx-auto max-w-2xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Start earning the moment your first viewer hits play.
          </h3>
          <p className="mx-auto mt-4 max-w-lg text-sa-text-2">
            Join the closed beta and claim your channel today.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={onEnter}
              className="inline-flex items-center gap-2 rounded-full bg-sa-blue px-6 py-3 text-sm font-semibold text-sa-navy transition hover:bg-sa-cyan"
            >
              Explore StreamArc
              <ArrowRight size={15} />
            </button>
            <button
              onClick={onSignIn}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-6 py-3 text-sm font-medium text-foreground transition hover:bg-white/[0.06]"
            >
              Create an account
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 mx-auto w-full max-w-6xl border-t border-white/5 px-6 py-8">
        <div className="flex flex-col items-center justify-between gap-4 text-xs text-sa-text-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/10">
              <GlitchLogo className="h-5 w-5" circle videoObjectFit="cover" />
            </div>
            <span>© {new Date().getFullYear()} StreamArc Labs</span>
          </div>
          <div className="flex items-center gap-6">
            <a className="transition hover:text-foreground" href="#">
              Terms
            </a>
            <a className="transition hover:text-foreground" href="#">
              Privacy
            </a>
            <a className="transition hover:text-foreground" href="#">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Subcomponents
   ────────────────────────────────────────────────────────── */

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 text-xs text-sa-text-3">{label}</p>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Radio;
  title: string;
  body: string;
}) {
  return (
    <div className="group relative bg-[#040910] p-8 transition-colors hover:bg-[#060d16]">
      <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-sa-blue">
        <Icon size={18} />
      </div>
      <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-sa-text-2">{body}</p>
    </div>
  );
}
