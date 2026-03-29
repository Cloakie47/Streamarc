import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase-server";
import { PAYMENT_CONFIG } from "@/app/lib/constants";

export async function POST(req: NextRequest) {
  try {
    const {
      session_id,
      viewer_id,
      creator_id,
      video_id,
      seconds_covered,
    } = await req.json();

    const amount = seconds_covered * PAYMENT_CONFIG.ratePerSecond;
    const platform_fee = amount * PAYMENT_CONFIG.platformFeePercent;
    const net_amount = amount - platform_fee;

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("payment_batches")
      .insert({
        session_id,
        viewer_id,
        creator_id,
        video_id,
        amount,
        seconds_covered,
        chain: PAYMENT_CONFIG.chain,
        status: "settled",
        settled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (batchError) {
      return NextResponse.json({ error: batchError.message }, { status: 400 });
    }

    const { error: earnError } = await supabaseAdmin.from("earnings").insert({
      creator_id,
      video_id,
      batch_id: batch.id,
      gross_amount: amount,
      platform_fee,
      net_amount,
    });
    if (earnError) {
      return NextResponse.json({ error: earnError.message }, { status: 400 });
    }

    // PostgREST .update() cannot embed rpc() — read current row then add deltas
    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("watch_sessions")
      .select("seconds_paid, total_cost")
      .eq("id", session_id)
      .single();

    if (wsErr) {
      return NextResponse.json({ error: wsErr.message }, { status: 400 });
    }

    const secDelta = Number(seconds_covered);
    const { error: updErr } = await supabaseAdmin
      .from("watch_sessions")
      .update({
        seconds_paid: (ws?.seconds_paid ?? 0) + secDelta,
        total_cost: (ws?.total_cost ?? 0) + amount,
      })
      .eq("id", session_id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    const { error: vidRpcErr } = await supabaseAdmin.rpc(
      "increment_video_earnings",
      { video_id, amount },
    );
    if (vidRpcErr) {
      return NextResponse.json({ error: vidRpcErr.message }, { status: 400 });
    }

    const { error: userRpcErr } = await supabaseAdmin.rpc(
      "increment_user_spent",
      { user_id: viewer_id, amount },
    );
    if (userRpcErr) {
      return NextResponse.json({ error: userRpcErr.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      amount,
      net_to_creator: net_amount,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
