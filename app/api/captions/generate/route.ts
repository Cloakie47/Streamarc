import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { auth } from "@/app/lib/auth"
import { fetchUnifiedGatewayBalance } from "@/app/lib/gateway-balance"
import { ensureCaptions, fetchVtt } from "@/lib/agent/transcript"
import { deleteCaptionTrack, uploadCaptionVtt, waitForCaptionReady } from "@/lib/captions/cloudflare"
import { translateVtt } from "@/lib/captions/translate"
import { isSubtitleLanguage, SUBTITLE_FEE_USDC } from "@/lib/captions/languages"
import { settleServiceFee } from "@/lib/settle-core"
import { PLATFORM_WALLET } from "@/lib/settle-core/constants"

// POST /api/captions/generate  Body: { video_id, language }
// Generate a full-video subtitle track in `language` for everyone to use.
// English is free (it's the spoken language — just ensure the Cloudflare track).
// Other languages cost the requester $0.05, settled requester -> platform via
// settle-core (single leg, no split), recorded in caption_payments. Idempotent:
// if the track already exists we make it available without charging again.
// settle-core, the viewer payment flow, and clip payments are NOT touched.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const { video_id, language } = await req.json()
    if (!video_id || typeof language !== "string" || !isSubtitleLanguage(language)) {
      return NextResponse.json({ error: "video_id and a supported language are required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data: video } = await supabase
      .from("videos")
      .select("id, cloudflare_uid, captions_languages")
      .eq("id", video_id)
      .maybeSingle()
    if (!video?.cloudflare_uid) return NextResponse.json({ error: "video not found" }, { status: 404 })

    const uid = video.cloudflare_uid as string
    const current = Array.isArray(video.captions_languages) ? (video.captions_languages as string[]) : []

    // Union helper — persist a language into the videos row, returns the new set.
    const persist = async (lang: string): Promise<string[]> => {
      const next = Array.from(new Set([...current, lang]))
      if (next.length !== current.length) {
        await supabase.from("videos").update({ captions_languages: next }).eq("id", video_id)
      }
      return next
    }

    // Idempotency / source of truth: ONLY videos.captions_languages. A language
    // is "done" only if it's recorded here — which now happens solely after a
    // full successful run (translate -> replace track -> ready -> charge). We do
    // NOT cross-check Cloudflare: a stale/English track left on the uid must not
    // count as done, otherwise clearing the column can never force a real regen.
    if (current.includes(language)) {
      return NextResponse.json({ available: current, alreadyExists: true })
    }

    // English: ensure/generate the spoken-language track. No translation, no fee.
    if (language === "en") {
      await ensureCaptions(uid)
      const available = await persist("en")
      return NextResponse.json({ available, charged: 0 })
    }

    // ---- Paid translation path ----
    const { data: user } = await supabase
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", session.user.id)
      .single()
    const payerAddress = user?.wallet_address as string | undefined
    const payerWalletId = user?.circle_wallet_id as string | undefined
    if (!payerAddress || !payerWalletId) {
      return NextResponse.json({ error: "Connect a wallet to generate paid subtitles." }, { status: 400 })
    }

    // Balance gate — settlement pulls from the ARC domain (26), same as watching.
    const bal = await fetchUnifiedGatewayBalance(payerAddress)
    const arc = bal.chainBalances.find((b) => b.domain === 26)
    const spendable = arc ? parseFloat(arc.balance || "0") : 0
    if (spendable < SUBTITLE_FEE_USDC) {
      return NextResponse.json(
        { error: "Insufficient balance", insufficient: true, needed: SUBTITLE_FEE_USDC, balance: spendable },
        { status: 402 },
      )
    }

    // English is the translation source — make sure it exists, then fetch it.
    await ensureCaptions(uid)
    const englishVtt = await fetchVtt(uid)
    const translatedVtt = await translateVtt(englishVtt, language)

    // Replace any existing track for this language (delete-then-upload) so
    // regeneration always ships the fresh translation, never a stale one.
    await deleteCaptionTrack(uid, language)
    await uploadCaptionVtt(uid, language, translatedVtt)
    // Confirm Cloudflare has a playable track BEFORE we charge — anything above
    // that throws (translate/delete/upload/ready) means no charge and the
    // language is never recorded, so the user can simply retry.
    await waitForCaptionReady(uid, language)

    // Re-check just before charging to avoid a double-charge race.
    const { data: fresh } = await supabase.from("videos").select("captions_languages").eq("id", video_id).maybeSingle()
    const freshLangs = Array.isArray(fresh?.captions_languages) ? (fresh!.captions_languages as string[]) : current
    if (freshLangs.includes(language)) {
      return NextResponse.json({ available: freshLangs, alreadyExists: true })
    }

    // Charge the requester: single-leg settlement requester -> platform.
    const { tx } = await settleServiceFee({
      payerWalletId,
      payerAddress,
      toAddress: PLATFORM_WALLET,
      amountUsdc: SUBTITLE_FEE_USDC,
    })

    // Persist the language FIRST so a retry can't double-charge, then write the
    // audit ledger. The column is the source of truth and only gets the language
    // here — after a confirmed-ready track AND a successful charge.
    let available: string[]
    try {
      available = await persist(language)
    } catch (e) {
      // Charged but couldn't record it — never fail silently: surface the tx so
      // it's recoverable, and don't pretend the language is available.
      console.error(`[captions] CHARGED tx=${tx} for ${language} on video ${video_id} but FAILED to persist captions_languages:`, e)
      return NextResponse.json(
        { error: `Subtitles were paid for (tx ${tx}) but could not be saved. Please contact support — do not retry.`, tx },
        { status: 500 },
      )
    }

    // Audit ledger (best-effort — the track + column are already correct).
    const { error: ledgerErr } = await supabase.from("caption_payments").insert({
      video_id,
      requester_id: session.user.id,
      language,
      amount: SUBTITLE_FEE_USDC,
      circle_tx: tx,
    })
    if (ledgerErr) console.error(`[captions] charged tx=${tx} for ${language} but ledger insert failed:`, ledgerErr.message)

    return NextResponse.json({ available, charged: SUBTITLE_FEE_USDC, tx })
  } catch (err: any) {
    console.error("caption generate failed:", err?.message)
    return NextResponse.json({ error: err?.message ?? "Failed to generate subtitles" }, { status: 500 })
  }
}
