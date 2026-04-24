"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

interface GlitchLogoProps {
  /** Tailwind size on the wrapper: use explicit `h-* w-*` (square works best) */
  className?: string;
  /** Unused; kept for backward compatibility with existing call sites */
  period?: number;
  /**
   * Circular mask. Default video fit: cover in circle, contain in rect.
   * Ultrawide sources in a circle should set `videoObjectFit="contain"` to avoid side-cropping.
   */
  circle?: boolean;
  /** Soft ring/shadow around the mark (ring sits outside the size box). */
  frame?: "none" | "soft";
  /**
   * Ring weight: `default` (hero), `compact` (sidebar), `minimal` (thinnest ring + no offset, smallest outer chrome).
   */
  frameDensity?: "default" | "compact" | "minimal";
  /** Overrides CSS object-fit; omit to use cover in circle and contain in rectangular box. */
  videoObjectFit?: "cover" | "contain";
}

const LOOP_EPS = 0.12;

/**
 * StreamArc animated mark: `/branding/logo.mp4` (muted, inline, looped).
 * Re-encode with faststart if loop stalls on a specific browser.
 * Ultrawide assets in a circular mask: pass `videoObjectFit="contain"` so the full frame is visible (letterboxed).
 */
export function GlitchLogo({
  className = "h-10 w-10",
  circle = false,
  frame = "none",
  frameDensity = "default",
  videoObjectFit,
}: GlitchLogoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;

    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    v.loop = true;

    const play = () => {
      void v.play().catch(() => {});
    };

    const onEnded = () => {
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      play();
    };

    const onTimeUpdate = () => {
      if (v.paused) return;
      const d = v.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      if (v.currentTime >= d - LOOP_EPS) {
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    };

    const onLoadedMetadata = () => {
      play();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") play();
    };

    v.addEventListener("ended", onEnded);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("loadeddata", play);
    document.addEventListener("visibilitychange", onVisibility);

    play();

    return () => {
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("loadeddata", play);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const resolvedObjectFit: "cover" | "contain" =
    videoObjectFit ?? (circle ? "cover" : "contain");

  const fit: CSSProperties = {
    objectFit: resolvedObjectFit,
    objectPosition: "center",
  };

  const softFrame =
    frame === "soft"
      ? frameDensity === "minimal"
        ? "ring-1 ring-primary/50 ring-offset-0 shadow-sm shadow-primary/5 "
        : frameDensity === "compact"
          ? "ring-2 ring-primary/45 ring-offset-2 ring-offset-background shadow-md shadow-primary/5 "
          : "ring-4 ring-primary/50 ring-offset-4 ring-offset-background shadow-lg shadow-primary/10 "
      : "";

  const outerBase = [
    "relative inline-flex shrink-0 items-center justify-center",
    frame === "none" && (circle ? "overflow-hidden rounded-full" : "overflow-hidden"),
    frame === "none" && circle && resolvedObjectFit === "contain" && "bg-black",
    frame === "soft" && (circle ? "rounded-full" : "rounded-2xl"),
    frame === "soft" && softFrame,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const innerClip =
    frame === "soft" && circle
      ? [
          "h-full min-h-0 w-full min-w-0 overflow-hidden rounded-full",
          resolvedObjectFit === "contain" && "bg-black",
        ]
          .filter(Boolean)
          .join(" ")
      : frame === "soft"
        ? "h-full w-full overflow-hidden rounded-2xl"
        : "";

  const video = (
    <video
      ref={ref}
      className={`block h-full w-full min-h-0 min-w-0 ${frame === "soft" && circle ? "rounded-full" : ""}`}
      style={fit}
      muted
      playsInline
      loop
      preload="auto"
      aria-label="StreamArc"
    >
      <source src="/branding/logo.mp4" type="video/mp4" />
    </video>
  );

  if (frame === "soft") {
    return (
      <div className={outerBase.trim()}>
        <div className={innerClip}>{video}</div>
      </div>
    );
  }

  return <div className={outerBase.trim()}>{video}</div>;
}
