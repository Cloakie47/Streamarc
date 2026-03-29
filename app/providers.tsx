"use client";

import { SessionProvider } from "next-auth/react";
import { HeroUIProvider } from "@heroui/react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/app/lib/wagmi";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <HeroUIProvider>{children}</HeroUIProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SessionProvider>
  );
}
