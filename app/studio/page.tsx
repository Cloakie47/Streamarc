import { auth } from "@/app/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/layout/AppShell";
import StudioPage from "@/app/components/studio/StudioPage";

export const dynamic = "force-dynamic";

export default async function Studio() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  return (
    <AppShell currentPage="studio">
      <StudioPage />
    </AppShell>
  );
}
