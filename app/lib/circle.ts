import { Circle, CircleEnvironments } from "@circle-fin/circle-sdk";

export const circle = new Circle(
  process.env.CIRCLE_API_KEY!,
  CircleEnvironments.sandbox
);

export const ARC_TESTNET_DOMAIN = 26;
export const GATEWAY_WALLET_TESTNET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
export const GATEWAY_MINTER_TESTNET = "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B";
/** ARC Testnet USDC uses 18 decimals (native-style token on this chain). */
export const USDC_DECIMALS = 18;
