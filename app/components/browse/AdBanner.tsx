"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

export default function AdBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="glass rounded-sa-card p-5 flex items-center gap-5 mx-6 mt-4 relative">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
        <span className="text-lg font-bold text-white">PR</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-sa-text-3 uppercase tracking-wider">Sponsored</span>
          <span className="font-semibold text-foreground">PropChain</span>
        </div>
        <p className="text-sm text-sa-text-3 mt-0.5 truncate">
          Tokenise, trade and settle property assets on-chain — without intermediaries.
        </p>
      </div>

      <a
        href="https://propchain.xyz"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-glass btn-sm flex gap-1.5 shrink-0"
      >
        Learn more
        <ExternalLink className="w-3.5 h-3.5" />
      </a>

      <button
        type="button"
        onClick={() => setVisible(false)}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-sa-text-3 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer text-xs"
      >
        x
      </button>
    </div>
  );
}
