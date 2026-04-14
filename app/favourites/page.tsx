import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import FavouritesPage from "@/app/components/favourites/FavouritesPage";

export const dynamic = "force-dynamic";

export default async function Favourites() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return <FavouritesPage userId={session.user.id} />;
}
