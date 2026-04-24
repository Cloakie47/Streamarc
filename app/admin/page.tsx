import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import AdminPage from "@/app/components/admin/AdminPage";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", session.user.id)
    .single();

  if (!user?.is_admin) redirect("/");

  console.log("Admin session user:", session.user);

  return <AdminPage userId={session.user.id} />;
}
