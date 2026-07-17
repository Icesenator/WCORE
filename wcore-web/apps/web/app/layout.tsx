import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Web3Provider } from "@/components/Web3Provider";
import { SidebarLayout } from "@/components/SidebarLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "WCORE — Multi-chain portfolio tracking",
  description: "Your crypto. Every chain. One view. 183 tracked chains across EVM, Solana, Cosmos and TON, selected DeFi positions, real-time pricing, on-chain GM and 7 CEX sources. Read only. Free.",
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
          <SidebarLayout>{children}</SidebarLayout>
        </Web3Provider>
      </body>
    </html>
  );
}
