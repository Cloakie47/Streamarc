export const PAYMENT_CONFIG = {
  intervalSeconds: 5,
  ratePerSecond: 0.00003,
  freePreviewSeconds: 0,
  platformFeePercent: 0.2,
  chain: "arcTestnet",
  chainId: 5042002,
} as const;

export const APP_CONFIG = {
  name: "StreamArc",
  tagline: "Pay only for what you watch",
  experimentDays: 60,
  maxCreators: 10,
} as const;

/** Fallback when opening Watch from nav/hero without a shelf video id (set NEXT_PUBLIC_DEFAULT_VIDEO_ID for your live demo). */
export const DEFAULT_WATCH_VIDEO_ID =
  process.env.NEXT_PUBLIC_DEFAULT_VIDEO_ID ?? "00000000-0000-0000-0000-000000000003";
