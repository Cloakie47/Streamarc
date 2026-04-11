import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

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
          bg: "#131c2c",
          surface: "#1c2639",
          "surface-2": "#243047",
          blue: "#9ab7dc",
          "blue-bright": "#c8d9ef",
          green: "#76b896",
          red: "#ea7676",
          navy: "#0f1827",
          yellow: "#e5d3ad",
          purple: "#9fabc8",
        },
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
              DEFAULT: "#9ab7dc",
              foreground: "#1a2434",
            },
            background: "#131c2c",
            foreground: "#f2f5fa",
          },
        },
        light: {
          colors: {
            primary: {
              DEFAULT: "#9ab7dc",
              foreground: "#1a2434",
            },
            background: "#f5f2ea",
            foreground: "#1c2433",
          },
        },
      },
    }),
  ],
};

export default config;
