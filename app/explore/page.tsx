import AppShell from "@/app/components/layout/AppShell";
import ExplorePage from "@/app/components/explore/ExplorePage";

export const dynamic = "force-dynamic";

export default function Explore() {
  return (
    <AppShell currentPage="explore">
      <ExplorePage />
    </AppShell>
  );
}
