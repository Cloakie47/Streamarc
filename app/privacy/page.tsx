import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-sa-text-3">Last updated · beta release</p>

        <div className="mt-10 flex flex-col gap-6 text-sm leading-relaxed text-sa-text-2">
          <p>
            Your watch history is yours. StreamArc settles payments on-chain,
            but the viewing data that powers your personal feed stays on our
            servers and is never sold, shared with advertisers, or used to
            train recommendation models you can&apos;t see.
          </p>

          <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-foreground">
            What we collect
          </h2>
          <ul className="flex list-disc flex-col gap-3 pl-5 marker:text-sa-blue">
            <li>
              <span className="font-semibold text-foreground">Account.</span>{" "}
              Email, display name, and (for creators) a payout wallet address.
            </li>
            <li>
              <span className="font-semibold text-foreground">
                Watch sessions.
              </span>{" "}
              Video ID, start and stop timestamps, seconds watched — used to
              compute per-second payments and power your history/favourites
              lists.
            </li>
            <li>
              <span className="font-semibold text-foreground">
                On-chain settlements.
              </span>{" "}
              Transaction hashes are publicly visible on the underlying
              blockchain. We do not publish off-chain links between your
              account and your settlements.
            </li>
          </ul>

          <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-foreground">
            What we don&apos;t do
          </h2>
          <ul className="flex list-disc flex-col gap-3 pl-5 marker:text-sa-blue">
            <li>No advertising trackers.</li>
            <li>No selling of viewing data to third parties.</li>
            <li>No algorithmic recommendation models trained on your history.</li>
          </ul>

          <p>
            For questions about your data, or to request deletion of your
            account, email{" "}
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
