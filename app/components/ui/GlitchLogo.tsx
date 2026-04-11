"use client";

import { motion } from "motion/react";

interface GlitchLogoProps {
  /** Tailwind size/shape classes, e.g. "h-10 w-auto" or "h-32 w-32 rounded-full" */
  className?: string;
  /** How often the glitch fires, in seconds (default 5) */
  period?: number;
  /**
   * When true the logo renders in a fixed-size circle using object-cover
   * (good for the hero anchor). The className should supply h-* w-* only.
   */
  circle?: boolean;
}

/**
 * Renders /branding/logo.png with a proper RGB-split glitch animation.
 * Three img layers are stacked; the top two are channel-shifted overlays.
 * CSS ::before/::after don't work on replaced <img> elements, hence the
 * explicit layer approach.
 */
export function GlitchLogo({ className = "h-10 w-auto", period = 5, circle = false }: GlitchLogoProps) {
  const g = period;

  const t = {
    quiet: 0,
    g0:    0.92,
    g1:    0.93,
    g2:    0.94,
    g3:    0.95,
    g4:    0.96,
    g5:    0.97,
    end:   1,
  };

  const imgStyle: React.CSSProperties = circle
    ? { objectFit: "cover", objectPosition: "center" }
    : { objectFit: "contain", objectPosition: "center" };

  const wrapClass = circle
    ? `relative inline-block select-none overflow-hidden rounded-full ${className}`
    : "relative inline-flex items-center justify-center select-none";

  const baseClass = circle ? "block h-full w-full" : `block ${className}`;
  const overlayClass = circle
    ? "absolute inset-0 block h-full w-full"
    : `absolute inset-0 block ${className}`;

  return (
    <div className={wrapClass}>
      {/* ── Base image ── */}
      <motion.img
        src="/branding/logo.png"
        alt="StreamArc"
        draggable={false}
        className={baseClass}
        style={imgStyle}
        animate={{
          x:      [0, 0, -2, 1, -1, 2, 0, 0],
          skewX:  [0, 0, -1, 2, -1, 0, 0, 0],
          filter: [
            "none",
            "none",
            "hue-rotate(90deg) saturate(1.6)",
            "hue-rotate(-60deg) brightness(1.15)",
            "hue-rotate(180deg) saturate(2)",
            "hue-rotate(-120deg) brightness(1.2)",
            "none",
            "none",
          ],
        }}
        transition={{
          duration: g,
          repeat: Infinity,
          times: [t.quiet, t.g0, t.g1, t.g2, t.g3, t.g4, t.g5, t.end],
          ease: "easeInOut",
        }}
      />

      {/* ── Red-channel overlay ── */}
      <motion.img
        src="/branding/logo.png"
        alt=""
        aria-hidden
        draggable={false}
        className={overlayClass}
        style={{ ...imgStyle, mixBlendMode: "screen", pointerEvents: "none" }}
        animate={{
          x:       [0, 0,   3,  -2,  0, 0, 0],
          opacity: [0, 0, 0.7, 0.5,  0, 0, 0],
          filter:  [
            "hue-rotate(90deg)",
            "hue-rotate(90deg)",
            "hue-rotate(90deg)",
            "hue-rotate(120deg)",
            "none",
            "none",
            "none",
          ],
        }}
        transition={{
          duration: g,
          repeat: Infinity,
          times: [t.quiet, t.g0, t.g1, t.g3, t.g4, t.g5, t.end],
          ease: "easeInOut",
        }}
      />

      {/* ── Blue-channel overlay ── */}
      <motion.img
        src="/branding/logo.png"
        alt=""
        aria-hidden
        draggable={false}
        className={overlayClass}
        style={{ ...imgStyle, mixBlendMode: "screen", pointerEvents: "none" }}
        animate={{
          x:       [0,  0,  -3,   2,  0,  0,  0],
          opacity: [0,  0, 0.6, 0.4,  0,  0,  0],
          filter:  [
            "hue-rotate(-90deg)",
            "hue-rotate(-90deg)",
            "hue-rotate(-90deg)",
            "hue-rotate(-60deg)",
            "none",
            "none",
            "none",
          ],
        }}
        transition={{
          duration: g,
          repeat: Infinity,
          times: [t.quiet, t.g0, t.g1 + 0.005, t.g3 + 0.005, t.g4, t.g5, t.end],
          ease: "easeInOut",
        }}
      />
    </div>
  );
}
