"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { WalletProvider } from "@/components/ConnectButton";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import { usePathname } from "next/navigation";
import { isBareBubblesRoute } from "@/lib/bare-routes";
import type { ReactNode } from "react";

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  // Pages Bubbles detachees ou integrables (cadrables par Apps Script) : ni portefeuille ni session, donc aucun
  // appel authentifie ni rafraichissement de session depuis un cadre tiers. Ces pages n'en utilisent aucun.
  const pathname = usePathname();
  if (isBareBubblesRoute(pathname)) return <>{children}</>;
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
