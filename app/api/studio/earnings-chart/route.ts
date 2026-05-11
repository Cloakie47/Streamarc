import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

const WINDOW_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const { creator_id } = await req.json();
    if (!creator_id) {
      return NextResponse.json({ error: "creator_id required" }, { status: 400 });
    }

    const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoff.toISOString();

    const { data, error } = await getSupabaseAdmin()
      .from("earnings")
      .select("net_amount, created_at")
      .eq("creator_id", creator_id)
      .gte("created_at", cutoffIso);

    if (error) {
      console.error("earnings-chart query failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Bucket the last 30 days. We pre-seed every day at $0 so the chart is
    // always a continuous 30-point line, even on days with no earnings.
    const buckets: Record<string, number> = {};
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - (WINDOW_DAYS - 1 - i));
      buckets[d.toISOString().slice(0, 10)] = 0;
    }

    type Row = { net_amount: number | null; created_at: string };
    for (const row of (data ?? []) as Row[]) {
      const day = new Date(row.created_at).toISOString().slice(0, 10);
      if (day in buckets) {
        buckets[day] += Number(row.net_amount ?? 0);
      }
    }

    const series = Object.entries(buckets)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, amount]) => ({ date, amount }));

    return NextResponse.json({ data: series });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("earnings-chart route failed:", message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
