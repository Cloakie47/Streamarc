import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { createNotification } from "@/app/lib/notify"
import { getWalletIdByAddress, signTypedDataWithWallet } from "@/app/lib/circle-wallets"
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server"

const facilitator = new BatchFacilitatorClient()

const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
const PLATFORM_WALLET = "0xfa53779d7cb905489d84f1ab2da309624427cafa"
const CHAIN_ID = 5042002

function randomNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function settlePayment(
  buyerWalletId: string,
  buyerAddress: string,
  recipientAddress: string,
  amount: number,
) {
  const amountIn6Dec = Math.round(amount * 1e6).toString()
  const validBefore = (Math.floor(Date.now() / 1000) + 345600).toString()
  const nonce = randomNonce()

  const domain = {
    name: "GatewayWalletBatched",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: GATEWAY_WALLET,
  }

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  }

  const signature = await signTypedDataWithWallet(
    buyerWalletId,
    domain,
    types,
    "TransferWithAuthorization",
    {
      from: buyerAddress,
      to: recipientAddress,
      value: amountIn6Dec,
      validAfter: "0",
      validBefore,
      nonce,
    }
  )

  if (!signature) throw new Error(`Failed to sign payment to ${recipientAddress}`)

  const payload = {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:5042002",
    resource: { url: "https://streamarc.app/ownership", description: "StreamArc ownership transfer", mimeType: "application/json" },
    accepted: {
      x402Version: 2,
      scheme: "exact",
      network: "eip155:5042002",
      asset: USDC_ADDRESS,
      amount: amountIn6Dec,
      payTo: recipientAddress,
      maxTimeoutSeconds: 345600,
      extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
    },
    payload: {
      signature,
      authorization: {
        from: buyerAddress,
        to: recipientAddress,
        value: amountIn6Dec,
        validAfter: "0",
        validBefore,
        nonce,
      },
    },
  }

  const requirements = {
    scheme: "exact",
    network: "eip155:5042002",
    amount: amountIn6Dec,
    maxAmountRequired: amountIn6Dec,
    resource: "https://streamarc.app/ownership",
    description: "StreamArc ownership transfer",
    mimeType: "application/json",
    payTo: recipientAddress,
    maxTimeoutSeconds: 345600,
    asset: USDC_ADDRESS,
    extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
  }

  const result = await facilitator.settle(payload as never, requirements as never)
  if (!result.success) throw new Error(result.errorReason ?? "Settlement failed")
  return result
}

export async function POST(req: NextRequest) {
  try {
    const { offer_id, owner_id } = await req.json()

    if (!offer_id || !owner_id) {
      return NextResponse.json({ error: "offer_id and owner_id required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Fetch offer
    const { data: offer } = await supabase
      .from("video_offers")
      .select("id, video_id, buyer_id, amount, status")
      .eq("id", offer_id)
      .single()

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 })
    }

    if (offer.status !== "pending") {
      return NextResponse.json({ error: "Offer is no longer pending" }, { status: 400 })
    }

    // Fetch video
    const { data: video } = await supabase
      .from("videos")
      .select("id, creator_id, owner_id, original_creator_id, title")
      .eq("id", offer.video_id)
      .single()

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    // Verify ownership
    const currentOwner = video.owner_id ?? video.creator_id
    if (currentOwner !== owner_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const isFirstSale = video.owner_id === null
    const saleAmount = parseFloat(offer.amount)

    // Fetch buyer wallet
    const { data: buyer } = await supabase
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", offer.buyer_id)
      .single()

    if (!buyer?.wallet_address) {
      return NextResponse.json({ error: "Buyer wallet not found" }, { status: 400 })
    }

    // Fetch seller wallet
    const { data: seller } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("id", owner_id)
      .single()

    if (!seller?.wallet_address) {
      return NextResponse.json({ error: "Seller wallet not found" }, { status: 400 })
    }

    const buyerWalletId = buyer.circle_wallet_id ?? await getWalletIdByAddress(buyer.wallet_address)
    if (!buyerWalletId) {
      return NextResponse.json({ error: "Buyer Circle wallet not found" }, { status: 400 })
    }

    // Calculate splits
    const platformFee = saleAmount * 0.025
    let creatorRoyalty = 0
    let sellerReceives = 0

    if (isFirstSale) {
      // First sale: creator is seller, no royalty split
      sellerReceives = saleAmount * 0.975
    } else {
      // Resale: three way split
      creatorRoyalty = saleAmount * 0.025
      sellerReceives = saleAmount * 0.95
    }

    // Execute payments
    await settlePayment(buyerWalletId, buyer.wallet_address, PLATFORM_WALLET, platformFee)
    await settlePayment(buyerWalletId, buyer.wallet_address, seller.wallet_address, sellerReceives)

    // Pay original creator royalty on resales
    if (!isFirstSale && creatorRoyalty > 0) {
      const originalCreatorId = video.original_creator_id ?? video.creator_id
      const { data: originalCreator } = await supabase
        .from("users")
        .select("wallet_address")
        .eq("id", originalCreatorId)
        .single()

      if (originalCreator?.wallet_address) {
        await settlePayment(buyerWalletId, buyer.wallet_address, originalCreator.wallet_address, creatorRoyalty)
      }
    }

    // Transfer ownership
    await supabase
      .from("videos")
      .update({
        owner_id: offer.buyer_id,
        original_creator_id: video.original_creator_id ?? video.creator_id,
        accepts_offers: false,
      })
      .eq("id", offer.video_id)

    // Record ownership history
    await supabase.from("ownership_history").insert({
      video_id: offer.video_id,
      from_user_id: owner_id,
      to_user_id: offer.buyer_id,
      sale_amount: saleAmount,
      seller_received: sellerReceives,
      platform_fee: platformFee,
      creator_royalty: creatorRoyalty,
    })

    // Mark offer as accepted
    await supabase
      .from("video_offers")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", offer_id)

    // Auto-decline all other pending offers on this video
    await supabase
      .from("video_offers")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("video_id", offer.video_id)
      .eq("status", "pending")
      .neq("id", offer_id)

    await createNotification(
      offer.buyer_id,
      "purchase",
      "Ownership transferred",
      "You now own the video and will earn all future watch revenue",
    )

    return NextResponse.json({
      success: true,
      sale_amount: saleAmount,
      seller_received: sellerReceives,
      platform_fee: platformFee,
      creator_royalty: creatorRoyalty,
      new_owner_id: offer.buyer_id,
    })
  } catch (err: any) {
    console.error("Accept offer failed:", err?.message)
    return NextResponse.json({ error: err.message ?? "Accept offer failed" }, { status: 500 })
  }
}
