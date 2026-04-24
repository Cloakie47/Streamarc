import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message?: string,
) {
  try {
    await getSupabaseAdmin().from("notifications").insert({
      user_id: userId,
      type,
      title,
      message: message ?? null,
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}
