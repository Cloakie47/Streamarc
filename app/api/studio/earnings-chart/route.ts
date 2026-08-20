import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

// Supported chart windows. "1d" buckets by hour; the rest bucket by day.
// "all" spans from the creator's first earning (falls back to 30 days).
const RANGES = {
  "1d": { hours: 24 },
  "7d": { days: 7 },
  "1m": { days: 30 },
  "all": {},
} as const;

type RangeKey = keyof typeof RANGES;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FALLBACK_DAYS = 30;

function hourStart(ms: number): string {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function dayStart(ms: number): string {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const { creator_id, range } = await req.json();
    if (!creator_id) {
      return NextResponse.json({ error: "creator_id required" }, { status: 400 });
    }
    const rangeKey: RangeKey = range in RANGES ? range : "all";

    let query = getSupabaseAdmin()
      .from("earnings")
      .select("net_amount, created_at")
      .eq("creator_id", creator_id);

    const window = RANGES[rangeKey];
    const now = Date.now();
    if ("hours" in window) {
      query = query.gte("created_at", new Date(now - window.hours * HOUR_MS).toISOString());
    } else if ("days" in window) {
      query = query.gte("created_at", new Date(now - window.days * DAY_MS).toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error("earnings-chart query failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    type Row = { net_amount: number | null; created_at: string };
    const rows = (data ?? []) as Row[];

    // Pre-seed every bucket at $0 so the chart is always a continuous line,
    // even in periods with no earnings.
    const buckets: Record<string, number> = {};
    const bucketKey = rangeKey === "1d" ? hourStart : dayStart;

    if (rangeKey === "1d") {
      for (let i = RANGES["1d"].hours - 1; i >= 0; i--) {
        buckets[hourStart(now - i * HOUR_MS)] = 0;
      }
    } else {
      let days: number;
      if (rangeKey === "all") {
        const first = rows.length
          ? Math.min(...rows.map((r) => new Date(r.created_at).getTime()))
          : now;
        days = Math.max(
          Math.floor((now - first) / DAY_MS) + 1,
          rows.length ? 1 : FALLBACK_DAYS,
        );
      } else {
        days = (window as { days: number }).days;
      }
      for (let i = days - 1; i >= 0; i--) {
        buckets[dayStart(now - i * DAY_MS)] = 0;
      }
    }

    for (const row of rows) {
      const key = bucketKey(new Date(row.created_at).getTime());
      if (key in buckets) {
        buckets[key] += Number(row.net_amount ?? 0);
      }
    }

    const series = Object.entries(buckets)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, amount]) => ({ date, amount }));

    return NextResponse.json({ data: series, range: rangeKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("earnings-chart route failed:", message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
