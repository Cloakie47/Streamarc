"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

export default function AdBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="panel relative flex items-center gap-4 px-5 py-4 hover-lift">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
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
        className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded text-xs text-sa-text-3 transition-colors hover:text-foreground"
      >
        x
      </button>
    </div>
  );
}
