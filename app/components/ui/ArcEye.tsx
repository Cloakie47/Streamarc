"use client";

import { motion } from "motion/react";

interface ArcEyeProps {
  size?: number;
  className?: string;
  animate?: "open" | "breathe" | "idle" | "none";
  glowColor?: string;
  rgbCycle?: boolean;
}

export default function ArcEye({
  size = 40,
  className = "",
  animate = "idle",
  glowColor = "hsl(188 90% 60%)",
  rgbCycle = false,
}: ArcEyeProps) {
  return (
    <motion.div
      className={`inline-flex items-center justify-center ${rgbCycle ? "" : ""} ${className}`}
      initial={animate === "open" ? { scaleY: 0, opacity: 0 } : undefined}
      animate={animate === "open" ? { scaleY: 1, opacity: 1 } : undefined}
      transition={animate === "open" ? { duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } : undefined}
      style={undefined}
    >
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={animate === "breathe" ? {
          scale: [1, 1.05, 1],
          filter: [
            `drop-shadow(0 0 4px ${glowColor})`,
            `drop-shadow(0 0 8px ${glowColor})`,
            `drop-shadow(0 0 4px ${glowColor})`,
          ],
        } : animate === "idle" ? {
          filter: `drop-shadow(0 0 4px ${glowColor})`,
        } : undefined}
        transition={animate === "breathe" ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" as const } : undefined}
      >
        <defs>
          <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur1" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="innerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M4 32C4 32 16 12 32 12C48 12 60 32 60 32C60 32 48 52 32 52C16 52 4 32 4 32Z"
          stroke={glowColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.7"
          filter="url(#bloom)"
        />

        <g filter="url(#bloom)">
          <motion.circle
            cx="32" cy="32" r="14"
            stroke={glowColor}
            strokeWidth="1.2"
            fill="none"
            opacity="0.5"
            strokeDasharray="6 4"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" as const }}
            style={{ transformOrigin: "32px 32px" }}
          />
        </g>

        <g filter="url(#bloom)">
          <motion.circle
            cx="32" cy="32" r="11"
            stroke="hsl(180 80% 80%)"
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
            strokeDasharray="8 3"
            animate={{ rotate: [360, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" as const }}
            style={{ transformOrigin: "32px 32px" }}
          />
        </g>

        <circle
          cx="32" cy="32" r="8"
          stroke={glowColor}
          strokeWidth="1"
          fill="none"
          opacity="0.6"
          filter="url(#bloom)"
        />

        <path
          d="M28 24L28 40L42 32Z"
          fill={glowColor}
          opacity="0.95"
          filter="url(#innerGlow)"
        />

        <circle
          cx="32" cy="32" r="2.5"
          fill="white"
          opacity="0.5"
        />
      </motion.svg>
    </motion.div>
  );
}

export function ArcEyeWatermark({ className = "", opacity = 0.15 }: { className?: string; opacity?: number }) {
  return (
    <motion.div
      className={`pointer-events-none select-none ${className}`}
      style={{ opacity }}
      animate={{ rotate: [0, 360] }}
      transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
    >
      <ArcEye size={300} animate="breathe" rgbCycle />
    </motion.div>
  );
}
