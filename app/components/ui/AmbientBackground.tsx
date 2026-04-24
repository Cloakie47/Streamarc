"use client";

import { motion } from "motion/react";

export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none" aria-hidden>
      {/* Top-right: electric cyan bloom */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 900,
          height: 900,
          top: "-20%",
          right: "-15%",
          background:
            "radial-gradient(circle, hsla(188, 90%, 55%, 0.32) 0%, hsla(195, 85%, 40%, 0.12) 45%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ x: [0, 30, -15, 0], y: [0, -25, 18, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Top-left: icy aqua glow */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 700,
          height: 700,
          top: "-10%",
          left: "-10%",
          background:
            "radial-gradient(circle, hsla(180, 80%, 70%, 0.22) 0%, hsla(188, 70%, 45%, 0.10) 50%, transparent 70%)",
          filter: "blur(70px)",
        }}
        animate={{ x: [0, -20, 14, 0], y: [0, 20, -12, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Center-right: deep teal accent */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 600,
          height: 600,
          top: "30%",
          right: "5%",
          background:
            "radial-gradient(circle, hsla(195, 85%, 45%, 0.18) 0%, hsla(200, 70%, 35%, 0.08) 50%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ x: [0, 18, -10, 0], y: [0, 30, -20, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Bottom-left: soft cyan */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 800,
          height: 800,
          bottom: "-20%",
          left: "-5%",
          background:
            "radial-gradient(circle, hsla(188, 86%, 50%, 0.20) 0%, hsla(195, 75%, 35%, 0.08) 50%, transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{ x: [0, -16, 12, 0], y: [0, -24, 14, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Center bottom: deep teal halo */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 500,
          height: 500,
          bottom: "5%",
          left: "40%",
          background:
            "radial-gradient(circle, hsla(195, 85%, 40%, 0.14) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, 20, -14, 0], y: [0, -16, 10, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
