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
          bg: "#080809",
          surface: "#0f0f11",
          "surface-2": "#16161a",
          blue: "#0a84ff",
          "blue-bright": "#60b0ff",
          green: "#30d158",
          red: "#ff453a",
          navy: "#050d1a",
          yellow: "#ffd60a",
          purple: "#bf5af2",
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
              DEFAULT: "#0a84ff",
              foreground: "#ffffff",
            },
            background: "#080809",
            foreground: "#f0f0f5",
          },
        },
        light: {
          colors: {
            primary: {
              DEFAULT: "#0a84ff",
              foreground: "#ffffff",
            },
            background: "#f2f2f7",
            foreground: "#1c1c1e",
          },
        },
      },
    }),
  ],
};

export default config;
