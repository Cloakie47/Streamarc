import { injected } from "@wagmi/core";
import { createConfig, http } from "wagmi";
import { mainnet } from "viem/chains";

/** Minimal wagmi config (injected wallet) for future on-chain deposit flows. */
export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
  },
});
