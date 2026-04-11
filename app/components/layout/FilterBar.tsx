"use client";

import { useState } from "react";
import { motion } from "motion/react";

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
    <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar px-1 pt-2">
      {categories.map((c) => (
        <motion.button
          key={c}
          type="button"
          onClick={() => setActive(c)}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          className={`nav-tab whitespace-nowrap cursor-pointer border transition-all ${
            active === c
              ? "nav-tab-active"
              : "nav-tab-inactive border-sa-border bg-sa-surface-2 hover:bg-sa-surface"
          }`}
        >
          {c}
        </motion.button>
      ))}
    </div>
  );
}
