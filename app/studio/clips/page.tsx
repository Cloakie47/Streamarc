import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import AppShell from "@/app/components/layout/AppShell"
import ClipJobsList from "@/app/components/studio/ClipJobsList"
import { Scissors } from "lucide-react"

export const dynamic = "force-dynamic"

// Studio: the creator's clip jobs (their own; admins see all). The review
// workflow lives at /studio/clips/[jobId]. Distinct from the public /clips
// browse page (viewers).
export default async function StudioClipsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  return (
    <AppShell currentPage="studio-clips">
      <div className="mx-auto w-full max-w-[680px] px-4 py-6 flex flex-col gap-5">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Scissors size={20} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Clip Jobs</h1>
            <p className="text-sm text-muted-foreground">Review and publish the clips the AI agent generated from your videos.</p>
          </div>
        </header>

        <ClipJobsList />
      </div>
    </AppShell>
  )
}
