import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-server";
import { getWalletIdByAddress, signTypedDataWithWallet } from "@/app/lib/circle-wallets";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

const facilitator = new BatchFacilitatorClient();

const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const CHAIN_ID = 5042002;

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  try {
    const { viewer_id, creator_id, video_id, amount } = await req.json();

    if (!viewer_id || !creator_id || !amount) {
      return NextResponse.json(
        { error: "viewer_id, creator_id and amount required" },
        { status: 400 },
      );
    }

    const tipAmount = parseFloat(amount);
    if (Number.isNaN(tipAmount) || tipAmount < 0.001) {
      return NextResponse.json({ error: "Minimum tip is $0.001" }, { status: 400 });
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

    const viewerRow = viewer as { wallet_address: string; circle_wallet_id?: string | null };
    const viewerWalletId =
      viewerRow.circle_wallet_id ?? (await getWalletIdByAddress(viewerRow.wallet_address));
    if (!viewerWalletId) {
      return NextResponse.json({ error: "Viewer Circle wallet not found" }, { status: 400 });
    }

    const amountIn6Dec = Math.round(tipAmount * 1e6).toString();
    const nonce = randomNonce();
    const validBefore = (Math.floor(Date.now() / 1000) + 345600).toString();

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
        validAfter: "0",
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
        maxTimeoutSeconds: 345600,
        extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET },
      },
      payload: {
        signature,
        authorization: {
          from: viewer.wallet_address,
          to: creator.wallet_address,
          value: amountIn6Dec,
          validAfter: "0",
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
      maxTimeoutSeconds: 345600,
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

    return NextResponse.json({ success: true, amount: tipAmount, tx: result.transaction });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Tip failed:", message);
    return NextResponse.json({ error: "Tip failed" }, { status: 500 });
  }
}
