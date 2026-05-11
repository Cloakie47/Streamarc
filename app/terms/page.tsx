import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#040910] px-6 py-16 text-sa-text">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-2 rounded-md text-sm text-sa-text-3 transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back to StreamArc
        </Link>

        <h1 className="mt-8 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-sa-text-3">Last updated · beta release</p>

        <div className="mt-10 flex flex-col gap-6 text-sm leading-relaxed text-sa-text-2">
          <p>
            StreamArc is currently in closed beta. Full terms are being
            finalized ahead of the public launch. By using the platform during
            this period, you agree to the following baseline:
          </p>
          <ul className="flex list-disc flex-col gap-3 pl-5 marker:text-sa-blue">
            <li>
              <span className="font-semibold text-foreground">Fair use.</span>{" "}
              No harassment, illegal content, or attempts to game the per-second
              payment system.
            </li>
            <li>
              <span className="font-semibold text-foreground">
                Creator ownership.
              </span>{" "}
              Creators retain full ownership of their uploads. StreamArc only
              receives a 20% platform fee on earnings.
            </li>
            <li>
              <span className="font-semibold text-foreground">Settlement.</span>{" "}
              Payments are settled on-chain via Circle&apos;s payment
              infrastructure. Settlement disputes are handled case-by-case
              during beta.
            </li>
            <li>
              <span className="font-semibold text-foreground">
                No guarantees.
              </span>{" "}
              The platform is provided as-is during beta. Outages, bugs, and
              breaking changes should be expected and reported.
            </li>
          </ul>
          <p>
            For questions or to report an issue, email{" "}
            <a
              href="mailto:streampayarc@gmail.com"
              className="text-sa-blue underline underline-offset-2 hover:text-sa-cyan"
            >
              streampayarc@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
