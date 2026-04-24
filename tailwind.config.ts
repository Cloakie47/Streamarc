import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

/**
 * StreamArc v2 brand palette, derived from the animated logo
 * (electric cyan eyes #30D8F0 → #A8F0F0 on near-black, with deep teal #187890 depth).
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sa: {
          bg: "#040910",
          surface: "#091422",
          "surface-2": "#0d1c30",
          navy: "#03070d",
          blue: "#30D8F0",
          "blue-bright": "#A8F0F0",
          cyan: "#A8F0F0",
          "deep-teal": "#187890",
          green: "#3CD9A0",
          red: "#F45D5D",
          yellow: "#A8F0F0",
          purple: "#7BD8F0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "brand-grad": "linear-gradient(135deg, #30D8F0 0%, #A8F0F0 50%, #1AC0E5 100%)",
        "brand-grad-soft":
          "linear-gradient(135deg, rgba(48,216,240,0.18), rgba(168,240,240,0.08))",
      },
      boxShadow: {
        "brand-glow": "0 8px 32px rgba(48, 216, 240, 0.35)",
        "brand-glow-lg": "0 16px 48px rgba(48, 216, 240, 0.45)",
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      themes: {
        dark: {
          colors: {
            primary: {
              DEFAULT: "#30D8F0",
              foreground: "#03070d",
            },
            background: "#040910",
            foreground: "#EAF8FA",
          },
        },
        light: {
          colors: {
            primary: {
              DEFAULT: "#1AC0E5",
              foreground: "#03070d",
            },
            background: "#F2FBFC",
            foreground: "#03070d",
          },
        },
      },
    }),
  ],
};

export default config;
