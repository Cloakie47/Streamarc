import type { SupabaseClient } from "@supabase/supabase-js"

// Simple in-memory cache for creator wallet addresses
const creatorWalletCache = new Map<string, { address: string; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getCreatorWallet(
  creatorId: string,
  supabaseAdmin: SupabaseClient,
): Promise<string | null> {
  const cached = creatorWalletCache.get(creatorId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.address;
  }

  const { data } = await supabaseAdmin
    .from("users")
    .select("wallet_address")
    .eq("id", creatorId)
    .single();

  if (data?.wallet_address) {
    creatorWalletCache.set(creatorId, {
      address: data.wallet_address,
      cachedAt: Date.now(),
    });
    return data.wallet_address;
  }

  return null;
}
