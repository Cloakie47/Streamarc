"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";
import {
  ArrowRight,
  Play,
  Wallet,
  ShieldCheck,
  Radio,
  Mail,
  Users,
  TrendingUp,
} from "lucide-react";
import { useCurrentUser } from "@/app/lib/auth-client";

interface LandingPageProps {
  onEnter: () => void;
  onSignIn: () => void;
}

export default function LandingPage({ onEnter, onSignIn }: LandingPageProps) {
  const { isSignedIn } = useCurrentUser();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#040910] text-sa-text">
      <BackgroundDecor />
      <LandingNav onEnter={onEnter} onSignIn={onSignIn} isSignedIn={isSignedIn} />
      <Hero onEnter={onEnter} onSignIn={onSignIn} isSignedIn={isSignedIn} />
      <SectionDivider />
      <HowItWorks />
      <SectionDivider />
      <ClosingCTA onEnter={onEnter} onSignIn={onSignIn} />
      <LandingFooter />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Decorative background — layered radial glows + cyan grid
   ────────────────────────────────────────────────────────── */
function BackgroundDecor() {
  return (
    <>
      {/* Layered radial glows — fixed across the viewport, cinematic depth */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Bottom-left primary cyan bloom — anchors the whole page */}
        <div className="absolute -bottom-40 -left-40 h-[800px] w-[800px] rounded-full bg-sa-blue/[0.15] blur-[140px]" />
        {/* Top-right icy aqua bloom — balances the composition */}
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-sa-cyan/[0.08] blur-[110px]" />
        {/* Far-back central nebula — adds depth behind everything */}
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sa-blue/[0.05] blur-[150px]" />
      </div>

      {/* Cyan-tinted grid — slightly stronger so the structure reads */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(48, 216, 240, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(48, 216, 240, 0.5) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </>
  );
}

function SectionDivider() {
  return (
    <div
      aria-hidden
      className="mx-auto h-px w-full max-w-6xl bg-gradient-to-r from-transparent via-sa-border to-transparent"
    />
  );
}

/* ──────────────────────────────────────────────────────────
   Section 1 — Navbar
   ────────────────────────────────────────────────────────── */
function LandingNav({
  onEnter,
  onSignIn,
  isSignedIn,
}: {
  onEnter: () => void;
  onSignIn: () => void;
  isSignedIn: boolean;
}) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full bg-sa-blue shadow-[0_0_12px_rgba(48,216,240,0.7)]"
        />
        <span className="text-base font-semibold tracking-tight">
          Stream<span className="text-sa-blue">Arc</span>
        </span>
      </div>
      <nav className="flex items-center gap-3">
        {isSignedIn ? (
          <button
            type="button"
            onClick={onEnter}
            className="btn btn-primary btn-sm focus-ring"
          >
            Continue watching
            <ArrowRight size={14} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onSignIn}
              className="focus-ring inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-sa-text-2 transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="btn btn-primary btn-sm focus-ring"
            >
              Get started
              <ArrowRight size={14} />
            </button>
          </>
        )}
      </nav>
    </header>
  );
}

/* ──────────────────────────────────────────────────────────
   Section 2 — Hero: copy + payment demo widget
   ────────────────────────────────────────────────────────── */
function Hero({
  onEnter,
  onSignIn,
  isSignedIn,
}: {
  onEnter: () => void;
  onSignIn: () => void;
  isSignedIn: boolean;
}) {
  return (
    <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-12 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
      {/* Focused cyan glow behind the payment widget — the nebula's bright core */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-sa-blue/[0.12] blur-[90px]"
      />
      {/* Left 60%: copy + CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex max-w-2xl flex-col lg:flex-1"
      >
        <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-sa-text-2 backdrop-blur">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-sa-blue opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sa-blue" />
          </span>
          Live creator economy · beta
        </div>

        <h1 className="text-balance font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          The streaming platform where{" "}
          <span className="text-sa-blue">every second counts.</span>
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-sa-text-2 sm:text-lg">
          Pay per second. Earn per second. No ads. No algorithms. Just creators
          and their audience.
        </p>

        <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
          {isSignedIn ? (
            <button
              type="button"
              onClick={onEnter}
              className="btn btn-primary btn-lg focus-ring"
            >
              <Play size={16} className="fill-current" />
              Continue to your feed
              <ArrowRight size={16} />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onEnter}
                className="btn btn-primary btn-lg focus-ring"
              >
                <Play size={16} className="fill-current" />
                Start watching
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={onSignIn}
                className="btn btn-glass btn-lg focus-ring"
              >
                For creators
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Right 40%: payment demo widget */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="w-full max-w-md lg:w-[420px]"
      >
        <PaymentDemoWidget />
      </motion.div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────
   Animated payment demo widget — earnings tick up live
   ────────────────────────────────────────────────────────── */
function PaymentDemoWidget() {
  const RATE = 0.00005;
  const [earnings, setEarnings] = useState(0.00023);
  const [seconds, setSeconds] = useState(127);
  const [viewers, setViewers] = useState(847);

  useEffect(() => {
    const earnId = setInterval(() => {
      setEarnings((e) => e + RATE);
      setSeconds((s) => s + 1);
    }, 1000);
    const viewerId = setInterval(() => {
      // Random walk ±2, never below 1
      setViewers((v) => Math.max(1, v + Math.floor(Math.random() * 5) - 2));
    }, 4500);
    return () => {
      clearInterval(earnId);
      clearInterval(viewerId);
    };
  }, []);

  // Cosmetic progress bar — loops every 240s for visual feedback
  const progress = ((seconds % 240) / 240) * 100;

  return (
    <div className="panel relative overflow-hidden p-5">
      {/* Header: live dot + viewer count */}
      <div className="flex items-center gap-2.5">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-sa-red opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sa-red" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-sa-red">
          Live
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-sa-text-3">
          <Users size={12} />
          <span className="font-mono tabular-nums">{viewers.toLocaleString()}</span>
        </span>
      </div>

      {/* Thumbnail — real image with playback progress overlay */}
      <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl border border-white/10">
        <Image
          src="/thumbnail.png"
          alt="StreamArc video preview"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-x-3 bottom-3 z-10">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/15 backdrop-blur-sm">
            <div
              className="h-full bg-sa-blue shadow-[0_0_8px_hsla(188,86%,56%,0.6)] transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Creator row */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-sa-border bg-sa-surface-2 text-xs font-bold text-sa-blue">
          DB
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold">DeFi Builder</span>
          <span className="text-[11px] text-sa-text-3">
            Building a Uniswap fork live
          </span>
        </div>
      </div>

      {/* Live earnings ticker */}
      <div className="mt-5 rounded-xl border border-sa-blue/20 bg-sa-blue/[0.04] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sa-text-3">
            Earnings, this stream
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sa-green">
            <TrendingUp size={10} />
            live
          </span>
        </div>
        <p className="payment-ticker mt-1.5 text-3xl font-bold">
          ${earnings.toFixed(5)}
        </p>
        <div className="mt-2 flex items-center justify-between text-[11px] text-sa-text-3">
          <span>
            <span className="font-mono tabular-nums text-sa-blue">
              ${RATE.toFixed(5)}
            </span>
            /sec · per viewer
          </span>
          <span className="font-mono tabular-nums">{seconds}s elapsed</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Section 3 — How it works (step cards with stagger)
   ────────────────────────────────────────────────────────── */
const STEPS = [
  {
    n: "01",
    icon: Radio,
    title: "Stream anything",
    body: "Live shows, recorded series, and creator channels, all in one clean, fast-loading app.",
  },
  {
    n: "02",
    icon: Wallet,
    title: "Earn per second",
    body: "Creators are paid in real time, by the second, straight to their wallet. No ads, no delays.",
  },
  {
    n: "03",
    icon: ShieldCheck,
    title: "You own your data",
    body: "Transparent, on-chain settlement. Your watch history stays yours: never sold, never tracked.",
  },
];

function HowItWorks() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24 sm:pb-28">
      <div className="mb-12 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sa-blue">
          How it works
        </p>
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Simple for viewers. Fair for creators.
        </h2>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="panel hover-lift relative overflow-hidden p-7"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-4 right-0 select-none font-display text-[8rem] font-bold leading-none text-sa-blue/[0.07]"
            >
              {step.n}
            </span>
            <div className="relative mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-sa-blue/30 bg-sa-blue/[0.06] text-sa-blue">
              <step.icon size={22} />
            </div>
            <h3 className="relative font-display text-xl font-bold tracking-tight text-foreground">
              {step.title}
            </h3>
            <p className="relative mt-2 text-sm leading-relaxed text-sa-text-2">
              {step.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────
   Section 4 — Closing CTA: For Viewers / For Creators split
   ────────────────────────────────────────────────────────── */
function ClosingCTA({
  onEnter,
  onSignIn,
}: {
  onEnter: () => void;
  onSignIn: () => void;
}) {
  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-6 py-24 sm:py-28">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Viewer card — neutral */}
        <div className="panel flex flex-col gap-5 p-10">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sa-text-3">
            For viewers
          </span>
          <h3 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            Pay only for what you watch. Pause and payments stop.
          </h3>
          <p className="text-sm text-sa-text-2">
            No subscriptions. No ads. Just micropayments that flow as you watch.
          </p>
          <button
            type="button"
            onClick={onEnter}
            className="btn btn-primary focus-ring self-start"
          >
            <Play size={15} className="fill-current" />
            Start watching
            <ArrowRight size={15} />
          </button>
        </div>

        {/* Creator card — cyan glow border */}
        <div
          className="panel flex flex-col gap-5 p-10"
          style={{
            borderColor: "hsla(188, 86%, 60%, 0.42)",
            boxShadow:
              "0 14px 40px rgba(2, 8, 20, 0.45), 0 0 32px hsla(188, 86%, 56%, 0.22), inset 0 1px 0 hsla(188, 70%, 80%, 0.08)",
          }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sa-blue">
            For creators
          </span>
          <h3 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            Earn from your first second. No followers required.
          </h3>
          <p className="text-sm text-sa-text-2">
            Upload your first stream and start earning the moment a single
            viewer hits play.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="btn btn-accent focus-ring self-start"
          >
            Apply for creator access
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────
   Section 5 — Footer with real routes
   ────────────────────────────────────────────────────────── */
function LandingFooter() {
  return (
    <footer className="relative z-10 mx-auto w-full max-w-6xl border-t border-white/5 px-6 py-10">
      <div className="flex flex-col items-center justify-between gap-6 text-xs text-sa-text-3 sm:flex-row">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sa-blue/70" />
          <span>© {new Date().getFullYear()} StreamArc Labs</span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/terms"
            className="focus-ring rounded-sm transition hover:text-foreground"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="focus-ring rounded-sm transition hover:text-foreground"
          >
            Privacy
          </Link>
          <a
            href="mailto:streampayarc@gmail.com"
            className="focus-ring inline-flex items-center gap-1.5 rounded-sm transition hover:text-foreground"
          >
            <Mail size={12} />
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
