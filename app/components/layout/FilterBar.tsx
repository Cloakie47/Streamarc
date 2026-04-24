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
    <div className="flex items-center gap-2.5 overflow-x-auto pb-3 no-scrollbar px-1 pt-1">
      {categories.map((c) => (
        <motion.button
          key={c}
          type="button"
          onClick={() => setActive(c)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
          className={`nav-tab whitespace-nowrap cursor-pointer ${
            active === c
              ? "nav-tab-active"
              : "nav-tab-inactive border border-sa-border bg-sa-surface/50 backdrop-blur hover:border-sa-blue/35 hover:bg-sa-surface/70"
          }`}
        >
          {c}
        </motion.button>
      ))}
    </div>
  );
}
