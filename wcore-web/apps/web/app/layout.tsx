import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Web3Provider } from "@/components/Web3Provider";
import { SidebarLayout } from "@/components/SidebarLayout";
import { getCoverageStats } from "@/lib/coverage";
import "./globals.css";

const coverage = getCoverageStats();

export const metadata: Metadata = {
  title: "WCORE — Multi-chain portfolio tracking",
  description: `Your crypto. Every chain. One view. ${coverage.chainConfigCount} tracked chains across EVM, Solana, Cosmos and TON, selected DeFi positions, real-time pricing, on-chain GM and ${coverage.cexProviderCount} CEX sources. Read only. Free.`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="darkreader-lock" />
        <meta name="wcore-deploy" content="v0.2.36-deploy-switch-no-retry-2026-06-05" />
      </head>
      <body className="min-h-screen antialiased">
        <Web3Provider>
          <SidebarLayout coverage={coverage}>{children}</SidebarLayout>
        </Web3Provider>
      </body>
    </html>
  );
}
