// scripts/agent-deposit.ts
// Phase 1 step 2: move the agent wallet's on-chain USDC into the Circle Gateway
// balance on Arc, so EIP-3009 authorizations can draw on it.
//
//   node scripts/agent-deposit.ts            # deposit full on-chain balance
//   node scripts/agent-deposit.ts 5          # deposit up to 5 USDC
//
// Reuses depositArc logic from app/api/gateway/deposit/route.ts via
// lib/agent/wallet.ts (the route itself is untouched).

import "../lib/agent/env.ts"
import { createGatewayWallet, depositArcUsdc } from "../lib/agent/wallet.ts"

const AGENT_REF = "clip-agent-001"

async function main() {
  const amountArg = process.argv[2] ? parseFloat(process.argv[2]) : undefined
  if (amountArg !== undefined && (!Number.isFinite(amountArg) || amountArg <= 0)) {
    throw new Error(`Invalid amount: ${process.argv[2]}`)
  }

  const wallet = await createGatewayWallet(AGENT_REF)
  if (!wallet) throw new Error("Agent Circle wallet not found — run agent-setup first")
  console.log("Agent wallet:", { walletId: wallet.id, address: wallet.address })

  const result = await depositArcUsdc({
    walletId: wallet.id,
    address: wallet.address as `0x${string}`,
    amount: amountArg,
  })

  console.log("\nDeposited into Gateway:")
  console.log(JSON.stringify({ amount_usdc: result.amount, tx_hash: result.txHash }, null, 2))
  console.log("\nThe agent's Gateway balance is now funded. Run scripts/test-settle.ts to settle a test payment.")
}

main().catch((err) => {
  console.error("agent-deposit failed:", err?.message ?? err)
  process.exit(1)
})
