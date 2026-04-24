"use client";

export default function CircuitTexture({
  className = "",
  opacity = 0.025,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <svg
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ opacity }}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <pattern id="circuit-grid" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
          {/* Horizontal traces */}
          <line x1="0" y1="30" x2="50" y2="30" stroke="hsl(180 80% 80%)" strokeWidth="1" strokeDasharray="80 40" />
          <line x1="70" y1="30" x2="120" y2="30" stroke="hsl(188 90% 60%)" strokeWidth="0.8" strokeDasharray="60 60" />

          {/* Vertical traces */}
          <line x1="30" y1="0" x2="30" y2="50" stroke="hsl(188 90% 60%)" strokeWidth="0.8" strokeDasharray="40 80" />
          <line x1="90" y1="40" x2="90" y2="120" stroke="hsl(180 80% 80%)" strokeWidth="1" strokeDasharray="60 60" />

          {/* Right-angle connector paths */}
          <path d="M50 30 L70 30 L70 60" fill="none" stroke="hsl(188 90% 60%)" strokeWidth="0.8" strokeDasharray="100 100" />
          <path d="M30 50 L30 80 L60 80" fill="none" stroke="hsl(180 80% 80%)" strokeWidth="0.8" strokeDasharray="80 80" />

          {/* Junction dots */}
          <circle cx="30" cy="30" r="2" fill="hsl(180 80% 80%)" opacity="0.6" />
          <circle cx="70" cy="30" r="1.5" fill="hsl(188 90% 60%)" opacity="0.45" />
          <circle cx="90" cy="80" r="2" fill="hsl(188 90% 60%)" opacity="0.5" />
          <circle cx="30" cy="80" r="1.5" fill="hsl(180 80% 80%)" opacity="0.4" />

          {/* Chip-like rectangles */}
          <rect x="52" y="72" width="16" height="8" rx="1" fill="none" stroke="hsl(188 90% 60%)" strokeWidth="0.6" opacity="0.35" />
          <rect x="8" y="95" width="12" height="6" rx="1" fill="none" stroke="hsl(180 80% 80%)" strokeWidth="0.6" opacity="0.3" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit-grid)" />
    </svg>
  );
}
