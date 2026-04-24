import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"

export async function POST(req: NextRequest) {
  try {
    const { action, video_id, buyer_id, offer_id, owner_id, amount } = await req.json()

    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Make an offer
    if (action === "make") {
      if (!video_id || !buyer_id || !amount) {
        return NextResponse.json({ error: "video_id, buyer_id and amount required" }, { status: 400 })
      }

      if (parseFloat(amount) < 1.0) {
        return NextResponse.json({ error: "Minimum offer is $1.00" }, { status: 400 })
      }

      // Check video accepts offers
      const { data: video } = await supabase
        .from("videos")
        .select("id, owner_id, creator_id, accepts_offers, title")
        .eq("id", video_id)
        .single()

      if (!video) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 })
      }

      if (!video.accepts_offers) {
        return NextResponse.json({ error: "This video is not accepting offers" }, { status: 400 })
      }

      // Block owner from offering on their own video
      const currentOwner = video.owner_id ?? video.creator_id
      if (currentOwner === buyer_id) {
        return NextResponse.json({ error: "You cannot offer on your own video" }, { status: 400 })
      }

      // Check for existing pending offer from same buyer
      const { data: existingOffer } = await supabase
        .from("video_offers")
        .select("id")
        .eq("video_id", video_id)
        .eq("buyer_id", buyer_id)
        .eq("status", "pending")
        .maybeSingle()

      if (existingOffer) {
        return NextResponse.json({ error: "You already have a pending offer on this video" }, { status: 400 })
      }

      const { data: offer } = await supabase
        .from("video_offers")
        .insert({ video_id, buyer_id, amount: parseFloat(amount), status: "pending" })
        .select()
        .single()

      return NextResponse.json({ success: true, offer })
    }

    // List offers for a video (owner view)
    if (action === "list") {
      if (!video_id || !owner_id) {
        return NextResponse.json({ error: "video_id and owner_id required" }, { status: 400 })
      }

      // Verify ownership
      const { data: video } = await supabase
        .from("videos")
        .select("owner_id, creator_id")
        .eq("id", video_id)
        .single()

      const currentOwner = video?.owner_id ?? video?.creator_id
      if (currentOwner !== owner_id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      const { data: offers } = await supabase
        .from("video_offers")
        .select("id, amount, status, created_at, buyer_id, users(display_name, channel_name, avatar_url)")
        .eq("video_id", video_id)
        .eq("status", "pending")
        .order("amount", { ascending: false })

      return NextResponse.json({ offers: offers ?? [] })
    }

    // Decline offer
    if (action === "decline") {
      if (!offer_id || !owner_id) {
        return NextResponse.json({ error: "offer_id and owner_id required" }, { status: 400 })
      }

      const { data: offer } = await supabase
        .from("video_offers")
        .select("video_id, videos(owner_id, creator_id)")
        .eq("id", offer_id)
        .single()

      if (!offer) {
        return NextResponse.json({ error: "Offer not found" }, { status: 404 })
      }

      const video = offer.videos as any
      const currentOwner = video?.owner_id ?? video?.creator_id
      if (currentOwner !== owner_id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      await supabase
        .from("video_offers")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", offer_id)

      return NextResponse.json({ success: true })
    }

    // Withdraw offer (buyer cancels)
    if (action === "withdraw") {
      if (!offer_id || !buyer_id) {
        return NextResponse.json({ error: "offer_id and buyer_id required" }, { status: 400 })
      }

      await supabase
        .from("video_offers")
        .update({ status: "withdrawn", updated_at: new Date().toISOString() })
        .eq("id", offer_id)
        .eq("buyer_id", buyer_id)

      return NextResponse.json({ success: true })
    }

    // Toggle accepts offers (owner)
    if (action === "toggle") {
      if (!video_id || !owner_id) {
        return NextResponse.json({ error: "video_id and owner_id required" }, { status: 400 })
      }

      const { data: video } = await supabase
        .from("videos")
        .select("owner_id, creator_id, accepts_offers")
        .eq("id", video_id)
        .single()

      const currentOwner = video?.owner_id ?? video?.creator_id
      if (currentOwner !== owner_id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      await supabase
        .from("videos")
        .update({ accepts_offers: !video?.accepts_offers })
        .eq("id", video_id)

      return NextResponse.json({ success: true, accepts_offers: !video?.accepts_offers })
    }

    if (action === "check_offers") {
      if (!video_id) return NextResponse.json({ error: "video_id required" }, { status: 400 })
      const { data: video } = await supabase
        .from("videos")
        .select("accepts_offers")
        .eq("id", video_id)
        .single()
      return NextResponse.json({ accepts_offers: video?.accepts_offers ?? false })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err: any) {
    console.error("Offers error:", err?.message)
    return NextResponse.json({ error: "Offers operation failed" }, { status: 500 })
  }
}
