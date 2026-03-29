import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/app/lib/supabase-server"
import { getCreatorWallet } from "@/app/lib/cache"
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server"

const facilitator = new BatchFacilitatorClient()

export async function POST(req: NextRequest) {
  try {
    const {
      session_id,
      viewer_id,
      creator_id,
      video_id,
      seconds_covered,
      payload,
      requirements,
    } = await req.json()

    // If payload + requirements present → nanopayment settle
    if (payload && requirements) {
      // Verify session belongs to viewer
      const { data: session } = await supabaseAdmin
        .from("watch_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("viewer_id", viewer_id)
        .single()

      if (!session) {
        return NextResponse.json({ error: "Invalid session" }, { status: 403 })
      }

      const { data: viewer } = await supabaseAdmin
        .from("users")
        .select("wallet_address")
        .eq("id", viewer_id)
        .single()

      const creatorWalletAddress = await getCreatorWallet(creator_id, supabaseAdmin)

      if (!viewer?.wallet_address || !creatorWalletAddress) {
        return NextResponse.json({ error: "Missing wallet addresses" }, { status: 400 })
      }

      // Check nonce hasn't been used
      const nonce = (payload as { payload?: { authorization?: { nonce?: string } } })?.payload
        ?.authorization?.nonce
      if (nonce) {
        const { data: existingNonce } = await supabaseAdmin
          .from("used_nonces")
          .select("nonce")
          .eq("nonce", nonce)
          .maybeSingle()

        if (existingNonce) {
          return NextResponse.json({ error: "Nonce already used" }, { status: 400 })
        }

        // Reserve nonce before settling
        const { error: nonceInsertErr } = await supabaseAdmin
          .from("used_nonces")
          .insert({ nonce, viewer_id })

        if (nonceInsertErr) {
          console.error("used_nonces insert:", nonceInsertErr.message)
          return NextResponse.json({ error: "Nonce already used" }, { status: 400 })
        }
      }

      const result = await facilitator.settle(payload, requirements)

      if (!result.success) {
        console.error("Gateway settle failed:", JSON.stringify(result))
        return NextResponse.json(
          { error: result.errorReason ?? "settle failed", details: result },
          { status: 400 },
        )
      }

      console.log("Gateway settled:", { transaction: result.transaction, payer: result.payer })

      const amount = seconds_covered * 0.00003
      const platform_fee = amount * 0.20
      const net_amount = amount - platform_fee

      const { data: batch, error: batchError } = await supabaseAdmin
        .from("payment_batches")
        .insert({
          session_id,
          viewer_id,
          creator_id,
          video_id,
          amount,
          seconds_covered,
          chain: "arcTestnet",
          circle_transaction_id: result.transaction,
          status: "settled",
          settled_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (batchError) {
        return NextResponse.json({ error: batchError.message }, { status: 400 })
      }

      await supabaseAdmin.from("earnings").insert({
        creator_id,
        video_id,
        batch_id: batch.id,
        gross_amount: amount,
        platform_fee,
        net_amount,
      })

      return NextResponse.json({
        success: true,
        batch_id: batch.id,
        amount,
        net_to_creator: net_amount,
        transaction: result.transaction,
      })
    }

    return NextResponse.json({ error: "Missing payload or requirements" }, { status: 400 })
  } catch (err: any) {
    console.error("Transfer failed:", err?.message)
    return NextResponse.json({ error: "Transfer failed" }, { status: 500 })
  }
}