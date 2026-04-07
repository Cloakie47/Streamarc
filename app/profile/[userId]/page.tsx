import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { notFound } from "next/navigation";
import CreatorProfile from "@/app/components/profile/CreatorProfile";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: creator } = await supabase
    .from("users")
    .select(
      "id, display_name, channel_name, bio, avatar_url, banner_url, is_verified, x_handle, reddit_handle, telegram_handle, created_at",
    )
    .eq("id", userId)
    .single();

  if (!creator) notFound();

  const { data: videos } = await supabase
    .from("videos")
    .select(
      "id, title, description, duration_secs, rate_per_sec, views, total_earned, thumbnail_url, cloudflare_uid, created_at, status",
    )
    .eq("creator_id", userId)
    .eq("status", "live")
    .order("created_at", { ascending: false });

  return <CreatorProfile creator={creator} videos={videos ?? []} />;
}
