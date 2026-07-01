import { auth } from "@/app/lib/auth"

export interface ActingUser {
  id: string
  role?: string
}

/**
 * Resolve the acting user from the NextAuth session — the ONLY trustworthy source
 * of identity. Money-movement and ownership routes must derive the payer/owner
 * from this, never from a request-body `user_id`/`viewer_id`/`buyer_id` (which an
 * attacker controls). Returns null when not authenticated.
 */
export async function getActingUser(): Promise<ActingUser | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return { id: session.user.id, role: (session.user as { role?: string }).role }
}
