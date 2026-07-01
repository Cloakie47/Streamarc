import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { createNotification } from "@/app/lib/notify";
import { getWalletIdByAddress, signTypedDataWithWallet } from "@/app/lib/circle-wallets";
import { getActingUser } from "@/app/lib/require-user";
import { rateLimit } from "@/app/lib/rate-limit";
import { fetchUnifiedGatewayBalance } from "@/app/lib/gateway-balance";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

const facilitator = new BatchFacilitatorClient();

const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
// Platform address; tips still pay the creator. Same as settle-session / offers.
const PLATFORM_WALLET = "0xfa53779d7cb905489d84f1ab2da309624427cafa";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const CHAIN_ID = 5042002;

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  try {
    // Payer = the AUTHENTICATED user, never a body-supplied viewer_id.
    const actor = await getActingUser();
    if (!actor) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const viewer_id = actor.id;

    const rl = rateLimit(`tip:${viewer_id}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many tips, try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    }

    const { creator_id, video_id, amount } = await req.json();

    if (!creator_id || !amount) {
      return NextResponse.json(
        { error: "creator_id and amount required" },
        { status: 400 },
      );
    }

    const tipAmount = parseFloat(amount);
    if (!Number.isFinite(tipAmount) || tipAmount < 0.001) {
      return NextResponse.json({ error: "Minimum tip is $0.001" }, { status: 400 });
    }
    if (tipAmount > 10000) {
      return NextResponse.json({ error: "Tip amount is too large" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: viewer } = await supabase
      .from("users")
      .select("wallet_address, circle_wallet_id")
      .eq("id", viewer_id)
      .single();

    const { data: creator } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("id", creator_id)
      .single();

    if (!viewer?.wallet_address || !creator?.wallet_address) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 400 });
    }

    // Prevent same-wallet self-tip — the gateway rejects from===to as a self transfer.
    // This also covers the case where viewer_id and creator_id are different but happen
    // to share a wallet address (e.g. linked accounts).
    if (viewer.wallet_address.toLowerCase() === creator.wallet_address.toLowerCase()) {
      return NextResponse.json({ error: "You cannot tip yourself" }, { status: 400 });
    }

    // Cap the tip at the tipper's spendable balance (ARC domain 26) so a request
    // can't attempt to move more than they have. Settlement math is unchanged.
    const bal = await fetchUnifiedGatewayBalance(viewer.wallet_address as string);
    const arc = bal.chainBalances.find((b) => b.domain === 26);
    const spendable = arc ? parseFloat(arc.balance || "0") : 0;
    if (tipAmount > spendable + 1e-9) {
      return NextResponse.json({ error: "Insufficient balance for this tip" }, { status: 400 });
    }

    const viewerRow = viewer as { wallet_address: string; circle_wallet_id?: string | null };
    const viewerWalletId =
      viewerRow.circle_wallet_id ?? (await getWalletIdByAddress(viewerRow.wallet_address));
    if (!viewerWalletId) {
      return NextResponse.json({ error: "Viewer Circle wallet not found" }, { status: 400 });
    }

    const amountIn6Dec = Math.round(tipAmount * 1e6).toString();
    const nonce = randomNonce();
    // Match the working per-second / clip settlements (settle-core): a generous
    // 30-day window with a 600s clock-skew backdate. The old 4-day window equalled
    // maxTimeoutSeconds exactly, so any latency made the remaining validity < the
    // declared timeout → "authorization_validity too short".
    const now = Math.floor(Date.now() / 1000);
    const validAfter = (now - 600).toString();
    const validBefore = (now + 2592000).toString();
    const MAX_TIMEOUT_SECONDS = 2592000;

    const domain = {
      name: "GatewayWalletBatched",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: GATEWAY_WALLET,
    };

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    const signature = await signTypedDataWithWallet(
      viewerWalletId,
      domain,
      types,
      "TransferWithAuthorization",
      {
        from: viewer.wallet_address,
        to: creator.wallet_address,
        value: amountIn6Dec,
        validAfter,
        validBefore,
        nonce,
      },
    );

    if (!signature) {
      return NextResponse.json({ error: "Failed to sign tip" }, { status: 500 });
    }

    const payload = {
      x402Version: 2,
      scheme: "exact",
      network: "eip155:5042002",
      resource: {
        url: "https://streamarc.app/tip",
        description: "StreamArc tip",
        mimeType: "application/json",
      },
      accepted: {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:5042002",
        asset: USDC_ADDRESS,
        amount: amountIn6Dec,
        payTo: creator.wallet_address,
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
      },
      payload: {
        signature,
        authorization: {
          from: viewer.wallet_address,
          to: creator.wallet_address,
          value: amountIn6Dec,
          validAfter,
          validBefore,
          nonce,
        },
      },
    };

    const requirements = {
      scheme: "exact",
      network: "eip155:5042002",
      amount: amountIn6Dec,
      maxAmountRequired: amountIn6Dec,
      resource: "https://streamarc.app/tip",
      description: "StreamArc tip",
      mimeType: "application/json",
      payTo: creator.wallet_address,
      maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
      asset: USDC_ADDRESS,
      extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
    };

    const result = await facilitator.settle(payload as never, requirements as never);

    if (!result.success) {
      return NextResponse.json(
        { error: result.errorReason ?? "Tip failed" },
        { status: 400 },
      );
    }

    await supabase.from("earnings").insert({
      creator_id,
      video_id: video_id ?? null,
      gross_amount: tipAmount,
      platform_fee: 0,
      net_amount: tipAmount,
    });

    await createNotification(
      creator_id,
      "tip",
      "You received a tip!",
      `Someone tipped you $${tipAmount.toFixed(2)}`,
    );

    return NextResponse.json({ success: true, amount: tipAmount, tx: result.transaction });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Tip failed:", message);
    return NextResponse.json({ error: "Tip failed" }, { status: 500 });
  }
}
