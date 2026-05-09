import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/layout/AppShell";
import WalletPage from "@/app/components/wallet/WalletPage";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Wallet() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const { data: user } = await getSupabaseAdmin()
    .from("users")
    .select("wallet_address")
    .eq("id", session.user.id)
    .single();

  return (
    <AppShell currentPage="wallet">
      <WalletPage userId={session.user.id} walletAddress={user?.wallet_address ?? ""} />
    </AppShell>
  );
}
