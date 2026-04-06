import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import SettingsPage from "@/app/components/settings/SettingsPage";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from("users")
    .select(
      "id, email, display_name, channel_name, bio, avatar_url, banner_url, x_handle, reddit_handle, telegram_handle",
    )
    .eq("id", session.user.id)
    .single();

  if (error || !user) redirect("/");

  return <SettingsPage user={user} />;
}
