"use client";

import { SUPPORTED_CHAINS } from "@/app/lib/chains";

export interface ChainSelectorProps {
  selected: string;
  onSelect: (chainId: string) => void;
  label?: string;
  disabledChains?: string[];
  disabledLabel?: string;
}

export default function ChainSelector({
  selected,
  onSelect,
  label,
  disabledChains,
  disabledLabel = "Coming soon",
}: ChainSelectorProps) {
  return (
    <div className="space-y-2">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wider text-sa-text-3">
          {label}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SUPPORTED_CHAINS.map((chain) => {
          const isSelected = chain.id === selected;
          const isDisabled = disabledChains?.includes(chain.id) ?? false;
          return (
            <button
              key={chain.id}
              type="button"
              onClick={() => onSelect(chain.id)}
              disabled={isDisabled}
              aria-pressed={isSelected}
              aria-disabled={isDisabled}
              className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all ${
                isDisabled
                  ? "border-sa-border/60 bg-sa-surface/40 opacity-50 cursor-not-allowed"
                  : isSelected
                  ? "border-sa-accent/60 bg-sa-accent/[0.08] shadow-[0_0_0_1px_rgba(168,240,240,0.25)] cursor-pointer"
                  : "border-sa-border bg-sa-surface hover:border-sa-border-hover hover:bg-sa-surface-2 cursor-pointer"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-base leading-none" aria-hidden>{chain.icon}</span>
                  <span className={`truncate text-sm font-medium ${isSelected && !isDisabled ? "text-foreground" : "text-foreground/90"}`}>
                    {chain.name}
                  </span>
                </span>
                {isSelected && !isDisabled && (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-sa-accent shadow-[0_0_8px_rgba(168,240,240,0.7)]"
                  />
                )}
              </div>
              <span
                className={`text-[10px] font-mono tabular-nums ${
                  isDisabled
                    ? "text-sa-text-3/60"
                    : isSelected
                    ? "text-sa-accent"
                    : "text-sa-text-3"
                }`}
              >
                {isDisabled ? disabledLabel : `Fee ${chain.fee}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
