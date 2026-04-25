"use client";

import { useState } from "react";
import { ExternalLink, X } from "lucide-react";

export default function AdBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="panel relative flex items-center gap-4 px-5 py-4 hover-lift overflow-hidden">
      <div
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
        style={{
          background: "#34D399",
          boxShadow: "0 6px 18px rgba(52, 211, 153, 0.3)",
        }}
      >
        <span className="text-base font-bold text-black">PR</span>
      </div>

      <div className="relative flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-sa-text-3 uppercase tracking-[0.2em]">
            Sponsored
          </span>
          <span className="font-display font-semibold text-foreground">PropChain</span>
        </div>
        <p className="text-sm text-sa-text-3 mt-0.5 truncate">
          Tokenise, trade and settle property assets on-chain without intermediaries.
        </p>
      </div>

      <a
        href="https://propchain.xyz"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-glass btn-sm btn-shine relative flex gap-1.5 shrink-0"
      >
        Learn more
        <ExternalLink className="w-3.5 h-3.5" />
      </a>

      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss ad"
        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg text-sa-text-3 transition-all duration-200 hover:text-foreground hover:bg-sa-blue/10"
      >
        <X size={14} />
      </button>
    </div>
  );
}
