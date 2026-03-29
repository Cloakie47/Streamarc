"use client";

import { useState } from "react";

const categories = [
  "All",
  "DeFi",
  "Bridges",
  "NFT",
  "Infrastructure",
  "Governance",
  "New this week",
] as const;

type Category = (typeof categories)[number];

export default function FilterBar() {
  const [active, setActive] = useState<Category>("All");

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar px-6 pt-4">
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setActive(c)}
          className={`nav-tab whitespace-nowrap cursor-pointer border-none ${
            active === c ? "nav-tab-active" : "nav-tab-inactive glass"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
