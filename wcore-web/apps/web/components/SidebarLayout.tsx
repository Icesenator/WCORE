"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Logo } from "@/components/Logo";
import { getApiUrl } from "@/lib/api";

export function SidebarLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coreVersion, setCoreVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) return;
    const API_URL = getApiUrl();
    fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.json())
      .then((d) => { if (typeof d.coreVersion === "string") setCoreVersion(d.coreVersion); })
      .catch(() => {});
  }, [mounted]);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("wcore_sidebar_collapsed") === "1");
    } catch { /* SSR */ }
    setMounted(true);
  }, []);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("wcore_sidebar_collapsed", next ? "1" : "0"); } catch { /* quota */ }
      return next;
    });
  }, []);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <>
      <Sidebar
        collapsed={mounted ? collapsed : false}
        onToggle={handleToggle}
        onClose={handleCloseSidebar}
        mobileOpen={sidebarOpen}
      />
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${mounted && collapsed ? "ml-0 sm:ml-[56px]" : "ml-0 sm:ml-[200px]"}`}>
        <TopBar onMenuToggle={handleMenuToggle} />
        <div className="flex-1">
          {children}
        </div>
        <footer className="py-6 flex flex-col items-center gap-2">
          <Logo className="h-5 w-5 text-accent/30" />
          <p className="text-center text-xs text-muted">
            174 chains, 4 VMs (EVM, SVM, Cosmos, TON), 80+ on-chain GM chains, 7 CEX (Binance, Bitpanda, Bitfinex, Bybit, Coinbase, Kraken, OKX).{coreVersion ? ` v${coreVersion}.` : ""} <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@WCORExyz</a>
          </p>
        </footer>
      </div>
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="fixed inset-0 bg-black/50 z-30 sm:hidden"
          onClick={handleCloseSidebar}
        />
      ) : null}
    </>
  );
}
