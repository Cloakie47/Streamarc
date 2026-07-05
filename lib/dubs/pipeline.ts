// lib/dubs/pipeline.ts
// The AI-dubbing pipeline, run by the WORKER (not in the request path), and
// mirroring lib/captions/pipeline.ts stage-for-stage:
//
//   ensure MP4 source -> ElevenLabs dub -> download dubbed MP3 -> host it
//   (Supabase Storage, public bucket "dubs", so Cloudflare can fetch it) ->
//   POST /audio/copy -> wait track ready -> re-check balance -> CHARGE
//   ($0.15, settleServiceFee — reused as-is) -> persist dubs_languages +
//   dub_payments ledger.
//
// The CHARGE happens only AFTER a confirmed-ready audio track. Pipeline
// errors THROW — the worker catches them and marks the job failed (no
// charge). Pay-once: an already-dubbed language returns ready instantly.

import type { SupabaseClient } from "@supabase/supabase-js"
import { createDub, waitForDub, fetchDubbedAudio } from "./elevenlabs.ts"
import { ensureMp4Download, addAudioTrackFromUrl, waitForAudioReady } from "./cloudflare.ts"
import { DUB_PRICE_USDC, MAX_DUB_SECONDS, dubLabel } from "./languages.ts"
import { settleServiceFee } from "../settle-core/index.ts"
import { PLATFORM_WALLET } from "../settle-core/constants.ts"
import { fetchUnifiedGatewayBalance } from "../../app/lib/gateway-balance.ts"

const ARC_DOMAIN = 26
const DUBS_BUCKET = "dubs"

export interface DubJobInput {
  videoId: string
  language: string
  requesterId: string | null
}

export interface DubJobResult {
  status: "ready" | "failed"
  charged: number
  circleTx: string | null
  error: string | null
  available: string[]
}

export async function runDubJob(supabase: SupabaseClient, input: DubJobInput): Promise<DubJobResult> {
  const { videoId, language, requesterId } = input

  const { data: video } = await supabase
    .from("videos")
    .select("id, cloudflare_uid, duration_secs, dubs_languages")
    .eq("id", videoId)
    .maybeSingle()
  if (!video?.cloudflare_uid) {
    return { status: "failed", charged: 0, circleTx: null, error: "video not found", available: [] }
  }

  const uid = video.cloudflare_uid as string
  const current = Array.isArray(video.dubs_languages) ? (video.dubs_languages as string[]) : []

  // Test-feature gate, re-enforced in the worker (the route also gates).
  const duration = Number(video.duration_secs)
  if (!(duration > 0) || duration > MAX_DUB_SECONDS) {
    return {
      status: "failed",
      charged: 0,
      circleTx: null,
      error: `Audio translation is in testing. It's available for videos under ${Math.round(MAX_DUB_SECONDS / 60)} minutes.`,
      available: current,
    }
  }

  const persist = async (lang: string): Promise<string[]> => {
    const next = Array.from(new Set([...current, lang]))
    if (next.length !== current.length) {
      await supabase.from("videos").update({ dubs_languages: next }).eq("id", videoId)
    }
    return next
  }

  // Pay-once idempotency: already dubbed — nothing to do, no charge.
  if (current.includes(language)) {
    return { status: "ready", charged: 0, circleTx: null, error: null, available: current }
  }

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

  // ---- Produce the dubbed track (these throw on failure -> worker marks failed, no charge) ----
  const mp4Url = await ensureMp4Download(uid)
  const dubbingId = await createDub(mp4Url, language)
  await waitForDub(dubbingId)
  const mp3 = await fetchDubbedAudio(dubbingId, language)

  // Host the MP3 where Cloudflare can fetch it (public bucket, transient).
  const objectPath = `${videoId}/${language}-${Date.now()}.mp3`
  const { error: uploadErr } = await supabase.storage
    .from(DUBS_BUCKET)
    .upload(objectPath, mp3, { contentType: "audio/mpeg", upsert: true })
  if (uploadErr) throw new Error(`dubbed MP3 hosting failed: ${uploadErr.message}`)
  const { data: pub } = supabase.storage.from(DUBS_BUCKET).getPublicUrl(objectPath)
  if (!pub?.publicUrl) throw new Error("dubbed MP3 hosting returned no public URL")

  let trackUid: string
  try {
    trackUid = await addAudioTrackFromUrl(uid, dubLabel(language), pub.publicUrl)
    await waitForAudioReady(uid, trackUid)
  } finally {
    // The MP3 only needs to exist long enough for Cloudflare to ingest it.
    void supabase.storage.from(DUBS_BUCKET).remove([objectPath]).then(() => {}, () => {})
  }

  // Re-check balance right before charging (it may have drifted since enqueue).
  const bal = await fetchUnifiedGatewayBalance(payerAddress)
  const arc = bal.chainBalances.find((b) => b.domain === ARC_DOMAIN)
  const spendable = arc ? parseFloat(arc.balance || "0") : 0
  if (spendable < DUB_PRICE_USDC) {
    return { status: "failed", charged: 0, circleTx: null, error: "Insufficient balance at charge time. Top up and retry.", available: current }
  }

  // Idempotency re-check just before charging (a concurrent run may have finished).
  const { data: fresh } = await supabase.from("videos").select("dubs_languages").eq("id", videoId).maybeSingle()
  const freshLangs = Array.isArray(fresh?.dubs_languages) ? (fresh!.dubs_languages as string[]) : current
  if (freshLangs.includes(language)) {
    return { status: "ready", charged: 0, circleTx: null, error: null, available: freshLangs }
  }

  // Charge only now — the audio track is confirmed ready on Cloudflare.
  const { tx } = await settleServiceFee({ payerWalletId, payerAddress, toAddress: PLATFORM_WALLET, amountUsdc: DUB_PRICE_USDC })

  let available: string[]
  try {
    available = await persist(language)
  } catch {
    return {
      status: "failed",
      charged: DUB_PRICE_USDC,
      circleTx: tx,
      error: `Dub was paid for (tx ${tx}) but could not be saved. Contact support and do not retry.`,
      available: current,
    }
  }

  const { error: ledgerErr } = await supabase.from("dub_payments").insert({
    video_id: videoId,
    requester_id: requesterId,
    language,
    amount: DUB_PRICE_USDC,
    circle_tx: tx,
  })
  if (ledgerErr) console.error(`[dubs] charged tx=${tx} for ${language} but ledger insert failed:`, ledgerErr.message)

  return { status: "ready", charged: DUB_PRICE_USDC, circleTx: tx, error: null, available }
}
