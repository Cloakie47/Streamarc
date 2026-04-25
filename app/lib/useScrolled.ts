"use client";

import { useEffect, useState } from "react";

/**
 * Returns true once window.scrollY > threshold.
 * rAF-throttled + passive listener so it doesn't block scrolling on slower
 * machines. Cheap: one boolean state, toggles at most once per frame.
 */
export function useScrolled(threshold = 20): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > threshold);
        ticking = false;
      });
    };
    // fire once to sync initial state on refresh / deep link
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return scrolled;
}
