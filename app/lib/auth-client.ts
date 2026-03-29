"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export { useSession, signIn, signOut };

export function useCurrentUser() {
  const { data: session, status } = useSession();
  return {
    user: session?.user,
    userId: session?.user?.id,
    role: (session?.user as { role?: string } | undefined)?.role,
    balance: (session?.user as { gateway_balance?: number } | undefined)?.gateway_balance,
    walletAddress: (session?.user as { wallet_address?: string | null } | undefined)?.wallet_address ?? null,
    isLoading: status === "loading",
    isSignedIn: status === "authenticated",
  };
}