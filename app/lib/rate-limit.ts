import type { NextRequest } from "next/server"

// Simple in-memory fixed-window rate limiter. Sufficient for our single-process
// Railway deployment (`next start`) — it stops spam, it is NOT distributed. If
// we ever scale to multiple instances, swap this for a Supabase/Redis counter.

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/**
 * Allow up to `limit` requests per `windowMs` for `key`. Returns whether the
 * request is allowed and, if not, how long until the window resets.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now()

  // Opportunistic cleanup so the map can't grow unbounded over a long uptime.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k)
  }

  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  }
  b.count++
  return { ok: true, retryAfterSec: 0 }
}

/** Best-effort client IP for per-IP throttling (Railway sets x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") || "unknown"
}
