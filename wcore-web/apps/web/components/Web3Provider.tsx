"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { WalletProvider } from "@/components/ConnectButton";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import type { ReactNode } from "react";

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>
          <PreferencesProvider>{children}</PreferencesProvider>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
