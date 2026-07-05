// lib/captions/pipeline.ts
// The heavy caption-generation pipeline, run by the WORKER (not in the request
// path) so a long English-generate + translate + Cloudflare-process run can't be
// killed by a serverless timeout. Reuses the existing helpers verbatim — the
// translation logic, the $0.05 charge, and settle-core are unchanged.
//
//   English  : ensure the Cloudflare track (free).
//   Other    : ensure English source -> translate -> replace track -> wait ready
//              -> re-check balance -> charge (creator->platform) -> persist +
//              ledger. The CHARGE happens only AFTER a confirmed-ready track.

import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureCaptions, fetchVtt } from "../agent/transcript.ts"
import { deleteCaptionTrack, uploadCaptionVtt, waitForCaptionReady } from "./cloudflare.ts"
import { translateVtt } from "./translate.ts"
import { SUBTITLE_FEE_USDC } from "./languages.ts"
import { settleServiceFee } from "../settle-core/index.ts"
import { PLATFORM_WALLET } from "../settle-core/constants.ts"
import { fetchUnifiedGatewayBalance } from "../../app/lib/gateway-balance.ts"

const ARC_DOMAIN = 26

export interface CaptionJobInput {
  videoId: string
  language: string
  requesterId: string | null
}

export interface CaptionJobResult {
  status: "ready" | "failed"
  charged: number
  circleTx: string | null
  error: string | null
  available: string[]
}

/**
 * Run one caption job to completion. Pipeline errors (translate/upload/network)
 * THROW — the worker catches them and marks the job failed (no charge). The
 * "decided" outcomes (idempotent-ready, english-ready, wallet/balance failures,
 * charged-but-persist-failed, success) are returned as a structured result.
 */
export async function runCaptionJob(supabase: SupabaseClient, input: CaptionJobInput): Promise<CaptionJobResult> {
  const { videoId, language, requesterId } = input

  const { data: video } = await supabase
    .from("videos")
    .select("id, cloudflare_uid, captions_languages")
    .eq("id", videoId)
    .maybeSingle()
  if (!video?.cloudflare_uid) return { status: "failed", charged: 0, circleTx: null, error: "video not found", available: [] }

  const uid = video.cloudflare_uid as string
  const current = Array.isArray(video.captions_languages) ? (video.captions_languages as string[]) : []

  const persist = async (lang: string): Promise<string[]> => {
    const next = Array.from(new Set([...current, lang]))
    if (next.length !== current.length) {
      await supabase.from("videos").update({ captions_languages: next }).eq("id", videoId)
    }
    return next
  }

  // Idempotent: already recorded — nothing to do, no charge.
  if (current.includes(language)) {
    return { status: "ready", charged: 0, circleTx: null, error: null, available: current }
  }

  // English is free: ensure the spoken-language track exists.
  if (language === "en") {
    await ensureCaptions(uid)
    const available = await persist("en")
    return { status: "ready", charged: 0, circleTx: null, error: null, available }
  }

  // ---- Paid translation path ----
  const { data: user } = await supabase
    .from("users")
    .select("wallet_address, circle_wallet_id")
    .eq("id", requesterId)
    .single()
  const payerAddress = user?.wallet_address as string | undefined
  const payerWalletId = user?.circle_wallet_id as string | undefined
  if (!payerAddress || !payerWalletId) {
    return { status: "failed", charged: 0, circleTx: null, error: "Requester wallet not found. Connect a wallet first.", available: current }
  }

  // Produce the track (these throw on failure -> worker marks failed, no charge).
  await ensureCaptions(uid)
  const englishVtt = await fetchVtt(uid)
  const translatedVtt = await translateVtt(englishVtt, language)
  await deleteCaptionTrack(uid, language)
  await uploadCaptionVtt(uid, language, translatedVtt)
  await waitForCaptionReady(uid, language)

  // Re-check balance right before charging (it may have drifted since enqueue).
  const bal = await fetchUnifiedGatewayBalance(payerAddress)
  const arc = bal.chainBalances.find((b) => b.domain === ARC_DOMAIN)
  const spendable = arc ? parseFloat(arc.balance || "0") : 0
  if (spendable < SUBTITLE_FEE_USDC) {
    return { status: "failed", charged: 0, circleTx: null, error: "Insufficient balance at charge time. Top up and retry.", available: current }
  }

  // Idempotency re-check just before charging (concurrent run may have finished).
  const { data: fresh } = await supabase.from("videos").select("captions_languages").eq("id", videoId).maybeSingle()
  const freshLangs = Array.isArray(fresh?.captions_languages) ? (fresh!.captions_languages as string[]) : current
  if (freshLangs.includes(language)) {
    return { status: "ready", charged: 0, circleTx: null, error: null, available: freshLangs }
  }

  // Charge only now — track is confirmed ready.
  const { tx } = await settleServiceFee({ payerWalletId, payerAddress, toAddress: PLATFORM_WALLET, amountUsdc: SUBTITLE_FEE_USDC })

  let available: string[]
  try {
    available = await persist(language)
  } catch (e) {
    return {
      status: "failed",
      charged: SUBTITLE_FEE_USDC,
      circleTx: tx,
      error: `Subtitles were paid for (tx ${tx}) but could not be saved. Contact support and do not retry.`,
      available: current,
    }
  }

  const { error: ledgerErr } = await supabase.from("caption_payments").insert({
    video_id: videoId,
    requester_id: requesterId,
    language,
    amount: SUBTITLE_FEE_USDC,
    circle_tx: tx,
  })
  if (ledgerErr) console.error(`[captions] charged tx=${tx} for ${language} but ledger insert failed:`, ledgerErr.message)

  return { status: "ready", charged: SUBTITLE_FEE_USDC, circleTx: tx, error: null, available }
}
