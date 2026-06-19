"use client";
import { useEffect, useState } from "react";

export interface Eip6963ProviderInfo {
  rdns: string;
  name: string;
  icon: string;
  uuid: string;
}

export interface Eip6963ProviderEntry {
  info: Eip6963ProviderInfo;
  // The actual provider is a window.ethereum-like object with `request({method, params})`.
  // Typed loosely to avoid pulling in window.ethereum types.
  provider: Eip6963Provider;
}

export interface Eip6963Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface Eip6963Announce {
  info: Eip6963ProviderInfo;
  provider: Eip6963Provider;
}

// EIP-6963 Multi Injected Provider Discovery.
// Wallets that follow the standard announce themselves via this event.
// Listening to it lets us detect MetaMask / Rabby / Zerion / Phantom etc.
// without depending on the legacy (and conflict-prone) `window.ethereum`.
// We store the full entry (info + provider) so the picker can connect
// directly to the provider without going through wagmi.
export function useEip6963Providers(): Eip6963ProviderEntry[] {
  const [entries, setEntries] = useState<Eip6963ProviderEntry[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = new Set<string>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Announce>).detail;
      if (!detail?.info?.uuid || seen.has(detail.info.uuid)) return;
      seen.add(detail.info.uuid);
      setEntries((prev) => [...prev, { info: detail.info, provider: detail.provider }]);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    // Some wallets announce on load even without the request — give them a beat.
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    }, 250);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      window.clearTimeout(t);
    };
  }, []);
  return entries;
}
