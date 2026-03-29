import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";

const arc = CHAIN_CONFIGS["arcTestnet"];

export const GATEWAY_WALLET = arc.gatewayWallet as `0x${string}`;
export const USDC_ADDRESS = arc.usdc as `0x${string}`;
export const CHAIN_ID = 5042002;
