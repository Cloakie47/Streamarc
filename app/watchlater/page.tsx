import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import WatchLaterPage from "@/app/components/watchlater/WatchLaterPage";

export const dynamic = "force-dynamic";

export default async function WatchLater() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return <WatchLaterPage userId={session.user.id} />;
}
