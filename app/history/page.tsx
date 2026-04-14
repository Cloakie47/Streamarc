import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import HistoryPage from "@/app/components/history/HistoryPage";

export const dynamic = "force-dynamic";

export default async function History() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return <HistoryPage userId={session.user.id} />;
}
