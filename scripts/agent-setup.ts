// scripts/agent-setup.ts
// Phase 1 step 1: create the Clip Agent's Circle wallet, its Supabase auth user,
// and its public.users profile row.
//
//   node scripts/agent-setup.ts
//
// public.users.id is a FK to auth.users(id), so the agent needs a real auth
// account before the profile row can be inserted — this mirrors the two-step
// every signup does (auth user -> profile), done server-side with the
// service-role client. Idempotent: re-running reuses the existing Circle wallet
// (by refId), the existing auth user (by email), and the existing profile row
// (by id). Prints { userId, walletId, address } and faucet instructions.

import "../lib/agent/env.ts"
import { createGatewayWallet } from "../lib/agent/wallet.ts"
import { getSupabaseAdmin } from "../app/lib/supabase-server.ts"

const AGENT_REF = "clip-agent-001"
const AGENT_EMAIL = "agent@streamarc.app"
const AGENT_DISPLAY_NAME = "StreamArc Clip Agent"

async function main() {
  const wallet = await createGatewayWallet(AGENT_REF)
  if (!wallet) {
    throw new Error("Failed to create/find the agent Circle wallet (check CIRCLE_* env)")
  }
  console.log("\nAgent Circle wallet:")
  console.log(JSON.stringify({ walletId: wallet.id, address: wallet.address }, null, 2))

  const supabase = getSupabaseAdmin()

  // --- Step 1: create or reuse the Supabase auth user (service-role admin API) ---
  // public.users.id FKs auth.users(id); without an auth account the profile insert
  // is rejected with users_id_fkey.
  let userId: string | null = null
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: AGENT_EMAIL,
    email_confirm: true,
    user_metadata: { display_name: AGENT_DISPLAY_NAME, role: "agent" },
  })
  if (!createErr && created?.user?.id) {
    userId = created.user.id
    console.log("\nCreated Supabase auth user:", userId)
  } else {
    // createUser errors on duplicate email — look the existing user up and reuse it.
    console.log("\nAuth user not created (", createErr?.message ?? "no id returned", ") — looking up existing by email")
    const perPage = 200
    for (let page = 1; page <= 50 && !userId; page++) {
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage })
      if (listErr) throw new Error(`listUsers failed: ${listErr.message}`)
      const users = list?.users ?? []
      const match = users.find((u) => (u.email ?? "").toLowerCase() === AGENT_EMAIL.toLowerCase())
      if (match) userId = match.id
      if (users.length < perPage) break // reached the last page
    }
    if (!userId) {
      throw new Error(`Could not create or find auth user for ${AGENT_EMAIL}: ${createErr?.message ?? "unknown"}`)
    }
    console.log("Reusing existing Supabase auth user:", userId)
  }

  // --- Step 2: insert the profile row using the SAME id (FK requires they match) ---
  const { data: existingProfile, error: lookupErr } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle()
  if (lookupErr) throw new Error(`users lookup failed: ${lookupErr.message}`)

  if (existingProfile?.id) {
    console.log("\nAgent profile row already exists:", userId)
  } else {
    const { error: insertErr } = await supabase.from("users").insert({
      id: userId, // = auth.users.id — do NOT let the DB default generate a new uuid
      email: AGENT_EMAIL,
      // users.role has a CHECK constraint (users_role_check) allowing only
      // viewer/creator/admin; the agent is modeled as a viewer that pays, and
      // display_name marks it as the agent. (Auth metadata above keeps role:'agent'.)
      role: "viewer",
      display_name: AGENT_DISPLAY_NAME,
      wallet_address: wallet.address,
      circle_wallet_id: wallet.id,
      gateway_balance: 0,
      total_spent: 0,
    })
    if (insertErr) throw new Error(`users insert failed: ${insertErr.message}`)
    console.log("\nInserted agent profile row:", userId)
  }

  // --- Step 3: identity ---
  console.log("\nAgent identity (use this id as viewer_id / payer):")
  console.log(JSON.stringify({ userId, walletId: wallet.id, address: wallet.address }, null, 2))

  console.log("\nNext: fund the agent with Arc testnet USDC, then run agent-deposit.")
  console.log("  1. Open the Circle faucet:  https://faucet.circle.com")
  console.log("  2. Select chain: Arc Testnet")
  console.log(`  3. Paste the agent address:  ${wallet.address}`)
  console.log("  4. Request USDC, wait for it to land on-chain.")
  console.log("  5. Also fund the SAME address with native Arc gas (ETH) — the deposit's")
  console.log("     approve + deposit are on-chain EOA transactions and need gas (settlement itself is gasless).")
  console.log("  6. Run:  node scripts/agent-deposit.ts   (moves on-chain USDC into the Gateway balance)")
}

main().catch((err) => {
  console.error("agent-setup failed:", err?.message ?? err)
  process.exit(1)
})
