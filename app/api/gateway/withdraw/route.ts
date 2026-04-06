import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/app/lib/supabase-server"
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets"
import { signTypedDataWithWallet } from "@/app/lib/circle-wallets"
import { randomUUID } from "crypto"
import { pad } from "viem"

const GATEWAY_WALLET_ADDRESS = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"
const GATEWAY_MINTER_ADDRESS = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000"
const ARC_DOMAIN = 26
const GATEWAY_API = "https://gateway-api-testnet.circle.com"

function getClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  })
}

function addressToBytes32(address: string): string {
  return pad(address.toLowerCase() as `0x${string}`, { size: 32 })
}

function randomSalt(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function waitForTx(client: any, txId: string, maxWait = 60000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    const res = await client.getTransaction({ id: txId })
    const state = res.data?.transaction?.state
    if (state === "COMPLETE") return true
    if (state === "FAILED" || state === "CANCELLED") return false
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, amount } = await req.json()

    if (!user_id || !amount) {
      return NextResponse.json({ error: "user_id and amount required" }, { status: 400 })
    }

    const withdrawAmount = parseFloat(amount)
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
    }

    if (withdrawAmount < 0.10) {
      return NextResponse.json({ error: "Minimum withdrawal is $0.10" }, { status: 400 })
    }

    const { data: user } = await getSupabaseAdmin()
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", user_id)
      .single()

    if (!user?.circle_wallet_id || !user?.wallet_address) {
      return NextResponse.json({ error: "Circle wallet not found" }, { status: 400 })
    }

    const recipient = user.wallet_address
    const amountIn6Dec = Math.round(withdrawAmount * 1e6)

    console.log("Withdrawal via BurnIntent:", {
      walletId: user.circle_wallet_id,
      from: user.wallet_address,
      to: recipient,
      amount: withdrawAmount,
    })

    const EIP712Domain = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
    ]

    const TransferSpec = [
      { name: "version", type: "uint32" },
      { name: "sourceDomain", type: "uint32" },
      { name: "destinationDomain", type: "uint32" },
      { name: "sourceContract", type: "bytes32" },
      { name: "destinationContract", type: "bytes32" },
      { name: "sourceToken", type: "bytes32" },
      { name: "destinationToken", type: "bytes32" },
      { name: "sourceDepositor", type: "bytes32" },
      { name: "destinationRecipient", type: "bytes32" },
      { name: "sourceSigner", type: "bytes32" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "value", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "hookData", type: "bytes" },
    ]

    const BurnIntent = [
      { name: "maxBlockHeight", type: "uint256" },
      { name: "maxFee", type: "uint256" },
      { name: "spec", type: "TransferSpec" },
    ]

    const salt = randomSalt()
    const maxFee = Math.round(amountIn6Dec * 0.01 + 10000)

    const burnIntentMessage = {
      maxBlockHeight: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      maxFee: maxFee.toString(),
      spec: {
        version: 1,
        sourceDomain: ARC_DOMAIN,
        destinationDomain: ARC_DOMAIN,
        sourceContract: addressToBytes32(GATEWAY_WALLET_ADDRESS),
        destinationContract: addressToBytes32(GATEWAY_MINTER_ADDRESS),
        sourceToken: addressToBytes32(USDC_ADDRESS),
        destinationToken: addressToBytes32(USDC_ADDRESS),
        sourceDepositor: addressToBytes32(user.wallet_address),
        destinationRecipient: addressToBytes32(recipient),
        sourceSigner: addressToBytes32(user.wallet_address),
        destinationCaller: addressToBytes32("0x0000000000000000000000000000000000000000"),
        value: amountIn6Dec.toString(),
        salt,
        hookData: "0x",
      },
    }

    const signature = await signTypedDataWithWallet(
      user.circle_wallet_id,
      { name: "GatewayWallet", version: "1" },
      { EIP712Domain, TransferSpec, BurnIntent },
      "BurnIntent",
      burnIntentMessage,
    )

    if (!signature) {
      return NextResponse.json({ error: "Failed to sign burn intent" }, { status: 500 })
    }

    console.log("BurnIntent signed:", signature.slice(0, 20) + "...")

    const transferRes = await fetch(`${GATEWAY_API}/v1/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ burnIntent: burnIntentMessage, signature }]),
    })

    if (!transferRes.ok) {
      const err = await transferRes.text()
      console.error("Gateway transfer API error:", err)
      return NextResponse.json({ error: `Gateway API error: ${err}` }, { status: 500 })
    }

    const transferData = await transferRes.json()
    console.log("Gateway transfer response:", JSON.stringify(transferData))

    const attestation = transferData?.attestation
    const operatorSig = transferData?.signature

    if (!attestation || !operatorSig) {
      return NextResponse.json({ error: "Missing attestation from Gateway" }, { status: 500 })
    }

    const client = getClient()

    const mintTx = await client.createContractExecutionTransaction({
      walletId: user.circle_wallet_id,
      contractAddress: GATEWAY_MINTER_ADDRESS,
      abiFunctionSignature: "gatewayMint(bytes,bytes)",
      abiParameters: [attestation, operatorSig],
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      idempotencyKey: randomUUID(),
    })

    const mintTxId = mintTx.data?.id
    if (!mintTxId) {
      return NextResponse.json({ error: "gatewayMint transaction failed to initiate" }, { status: 500 })
    }

    console.log("gatewayMint tx initiated:", mintTxId)
    const success = await waitForTx(client, mintTxId)

    if (!success) {
      return NextResponse.json({ error: "gatewayMint transaction failed" }, { status: 500 })
    }

    // Get actual on-chain tx hash
    const txDetails = await client.getTransaction({ id: mintTxId })
    const txHash = txDetails.data?.transaction?.txHash ?? mintTxId

    console.log("Withdrawal complete:", { withdrawAmount, recipient, txId: mintTxId, txHash })

    await getSupabaseAdmin().from("withdrawals").insert({
      creator_id: user_id,
      gross_amount: withdrawAmount,
      platform_fee: 0,
      net_amount: withdrawAmount,
      wallet_address: recipient,
      status: "complete",
      tx_hash: txHash,
      completed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      amount: withdrawAmount,
      recipient,
      transaction_id: mintTxId,
      tx_hash: txHash,
    })
  } catch (err: any) {
    console.error("Withdrawal failed:", err?.message)
    return NextResponse.json({ error: "Withdrawal failed" }, { status: 500 })
  }
}