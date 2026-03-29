import { auth } from "@/app/lib/auth"
import { redirect } from "next/navigation"
import AdminPage from "@/app/components/admin/AdminPage"

const ADMIN_USER_ID = "56917d75-3471-4d21-8bca-1010de7dbbc2"

export default async function Admin() {
  const session = await auth()
  if (!session?.user?.id || session.user.id !== ADMIN_USER_ID) {
    redirect("/")
  }
  return <AdminPage />
}
