"use client";
import { apiFetch } from "@/lib/api";

import { useState, useCallback, useEffect, useRef, type FormEvent } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { ChainSelector } from "@/components/ChainSelector";
import { useWallet } from "@/components/ConnectButton";
import { WalletManager, type WalletManagerProps } from "@/components/WalletManager";
import { usePreferences } from "@/components/PreferencesProvider";
import { DEFAULT_CHAINS } from "@/lib/defaults";
import { buildCexWalletListItem, parseCexWalletAddress, type CexProvider, type CexWalletListItem } from "@/lib/cex-display";

function detectVmType(addr: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return "EVM";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return "SVM";
  if (/^[a-z]{1,32}1[a-z0-9]{38,58}$/.test(addr)) return "COSMOS";
  if (/^(EQ|UQ|Ef|Uf)[A-Za-z0-9_-]{40,60}$/.test(addr)) return "TON";
  if (/^-?[0-9]+:[a-fA-F0-9]{64}$/.test(addr)) return "TON";
  return "EVM";
}

import dynamic from "next/dynamic";

const WelcomeModal = dynamic(() => import("@/components/WelcomeModal").then(m => ({ default: m.WelcomeModal })), { ssr: false });

interface CexAccountApi {
  id: string;
  provider: CexProvider;
  label: string | null;
  holdings: Array<{ valueEur: number | null }>;
}

function cexAccountTotal(account: CexAccountApi): number {
  return Math.round(account.holdings.reduce((sum, h) => sum + (h.valueEur ?? 0), 0) * 100) / 100;
}

export function HomePageClient() {
  const router = useRouter();
  const { address: connectedAddress, authStep } = useWallet();
  const { isConnected } = useAccount();
  const { formatValue } = usePreferences();
  const [address, setAddress] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [chains, setChains] = useState<string[]>([...DEFAULT_CHAINS]);
  const [deepScan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedWallets, setLinkedWallets] = useState<WalletManagerProps["wallets"]>([]);
  const [cexWallets, setCexWallets] = useState<CexWalletListItem[]>([]);
  const [recentScans, setRecentScans] = useState<Array<{ totalEur: number; chains: string[]; tokenCount: number; createdAt: string }>>([]);
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [syncingCex, setSyncingCex] = useState(false);
  const welcomeCheckedRef = useRef(false);
  const [, setWelcomeLoading] = useState(true);

  // Show welcome modal on first wallet connection (DB-backed, cross-device)
  useEffect(() => {
    if (welcomeCheckedRef.current || !isConnected || authStep !== "authenticated") return;
    welcomeCheckedRef.current = true;
    apiFetch("/api/auth/me")
      .then(r => r.json())
      .then((d: { referralCode?: string; welcomeCompleted?: boolean }) => {
        if (d.referralCode) setReferralCode(d.referralCode);
        if (d.welcomeCompleted === false) setShowWelcome(true);
      })
      .catch(() => {})
      .finally(() => setWelcomeLoading(false));
  }, [isConnected, authStep]);

  useEffect(() => {
    if (connectedAddress) {
      const vm = detectVmType(connectedAddress);
      const key = vm === "EVM" || vm === "TON" ? connectedAddress : connectedAddress;
      setAddress(connectedAddress);
      setLinkedWallets((prev) => {
        const existing = prev.find((w) => w.address.toLowerCase() === key.toLowerCase());
        if (existing) {
          if (existing.label === "🔗 Connected" || existing.label === "Connected") {
            const cleaned = prev.map((w) => w.address.toLowerCase() === key.toLowerCase() ? { ...w, label: key.slice(0, 10) } : w);
            localStorage.setItem("wcore_linked", JSON.stringify(cleaned.map(w => ({ address: w.address as string, label: w.label }))));
            return cleaned;
          }
          return prev;
        }
        let savedLabel = key.slice(0, 10);
        try {
          const raw = localStorage.getItem("wcore_linked");
          if (raw) {
            const parsed = JSON.parse(raw) as Array<{ address: string; label: string }>;
            const saved = parsed.find((w) => w.address.toLowerCase() === key.toLowerCase());
            if (saved?.label && saved.label !== "🔗 Connected" && saved.label !== "Connected") {
              savedLabel = saved.label;
            }
          }
        } catch { /* ignore */ }
        return [...prev, { address: key, label: savedLabel, chainType: vm }];
      });
    }
  }, [connectedAddress]);

  const loadCexWallets = useCallback(async () => {
    if (!connectedAddress) { setCexWallets([]); return; }
    try {
      const res = await apiFetch("/api/cex/accounts");
      if (!res.ok) { setCexWallets([]); return; }
      const data = await res.json() as { accounts?: CexAccountApi[] };
      setCexWallets((data.accounts ?? []).map((account) => buildCexWalletListItem({
        id: account.id,
        provider: account.provider,
        label: account.label,
        totalEur: cexAccountTotal(account),
      })));
    } catch (_e) {
      console.error("Failed to load CEX wallets:", _e);
      setCexWallets([]);
    }
  }, [connectedAddress]);

  useEffect(() => { void loadCexWallets(); }, [loadCexWallets]);

  useEffect(() => {
    const handler = () => { void loadCexWallets(); };
    window.addEventListener("wcore-cex-updated", handler);
    return () => window.removeEventListener("wcore-cex-updated", handler);
  }, [loadCexWallets]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wcore_linked");
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ address: string; label: string }>;
        if (parsed.length) {
          setLinkedWallets((prev) => {
            const merged = [...prev];
            for (const w of parsed) {
              const vm = detectVmType(w.address);
              const key = vm === "EVM" || vm === "TON" ? w.address : w.address;
              if (!merged.some(m => m.address === key)) merged.push({ address: key, label: w.label, chainType: vm });
            }
            return merged;
          });
        }
      }
    } catch { /* ignore */ }

    if (!connectedAddress) return;
    Promise.all([
      apiFetch(`/api/profile/${connectedAddress}`),
      apiFetch("/api/wallets"),
      apiFetch("/api/me/plan"),
    ]).then(async ([profRes, walletsRes, planRes]) => {
      const profData = await profRes.json() as { recentScans?: Array<{ totalEur: number; chains: string[]; tokenCount: number; createdAt: string }> };
      const walletsData = await walletsRes.json() as { wallets?: Array<{ id: string; address: string; label: string | null }> };
      if (profData.recentScans) setRecentScans(profData.recentScans.slice(0, 5));
      const planData = await planRes.json() as { scansRemainingToday?: number };
      if (typeof planData.scansRemainingToday === "number") setScansLeft(planData.scansRemainingToday);
      if (walletsData.wallets?.length) {
        const fromApi = walletsData.wallets.map((w) => {
          const vm = detectVmType(w.address);
          return { address: vm === "EVM" || vm === "TON" ? w.address : w.address, label: w.label ?? w.address.slice(0, 10), chainType: vm as "EVM" | "SVM" | "COSMOS" | "TON" };
        });
        setLinkedWallets((prev) => {
          const apiAddrs = new Set(fromApi.map((w) => w.address.toLowerCase()));
          const localOnly = prev.filter((w) => !apiAddrs.has(w.address.toLowerCase()));
          const merged = [...fromApi, ...localOnly];
          localStorage.setItem("wcore_linked", JSON.stringify(merged.map(w => ({ address: w.address, label: w.label }))));
          return merged;
        });
      }
    }).catch((_e) => { console.error("Failed to load profile/wallets/plan:", _e); });
  }, [connectedAddress]);

  const handleChainsChange = useCallback((newChains: string[]) => setChains(newChains), []);

  function addWallet(addr: string, label: string) {
    const vm = detectVmType(addr);
    const key = vm === "EVM" ? addr.toLowerCase() : addr;
    if (linkedWallets.some((w) => w.address === key)) return;
    const updated = [...linkedWallets, { address: key, label, chainType: vm }];
    setLinkedWallets(updated);
    localStorage.setItem("wcore_linked", JSON.stringify(updated.map(w => ({ address: w.address, label: w.label }))));
      apiFetch("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ address: addr, label: label || null, mode: "view_only" }),
      }).catch(() => {});
  }

  function removeWallet(addr: string) {
    const cex = parseCexWalletAddress(addr);
    if (cex) {
      apiFetch(`/api/cex/accounts/${cex.id}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error("Delete failed");
          setCexWallets((prev) => prev.filter((w) => w.cexId !== cex.id));
          window.dispatchEvent(new Event("wcore-cex-updated"));
        })
        .catch((_e) => { console.error("Failed to delete CEX wallet:", _e); });
      return;
    }
    const updated = linkedWallets.filter((w) => w.address !== addr);
    setLinkedWallets(updated);
    localStorage.setItem("wcore_linked", JSON.stringify(updated.map(w => ({ address: w.address, label: w.label }))));
  }

  async function syncCexBeforeScan() {
    if (cexWallets.length === 0) return;
    setSyncingCex(true);
    try {
      await Promise.allSettled(cexWallets.map((wallet) => apiFetch(`/api/cex/accounts/${wallet.cexId}/sync`, { method: "POST" })));
      window.dispatchEvent(new Event("wcore-cex-updated"));
    } finally {
      setSyncingCex(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const targets: string[] = [];
    const seen = new Set<string>();
    if (connectedAddress) { const k = connectedAddress.toLowerCase(); targets.push(k); seen.add(k); }
    for (const w of linkedWallets.filter((wallet) => !wallet.isCex)) {
      const key = w.address;
      if (!seen.has(key.toLowerCase())) { targets.push(key); seen.add(key.toLowerCase()); }
    }
    const manualAddr = address.trim();
    if (manualAddr) {
      const vm = detectVmType(manualAddr);
      const key = vm === "EVM" ? manualAddr.toLowerCase() : manualAddr;
      if (!seen.has(key.toLowerCase())) { targets.push(key); seen.add(key.toLowerCase()); }
    }
    if (targets.length === 0) {
      setError("Enter an address or connect a wallet.");
      return;
    }
    if (!chains.length) {
      setError("Select at least one chain.");
      return;
    }
    setError(null);
    await syncCexBeforeScan();
    const encoded = encodeURIComponent(targets.join(","));
    const onChainLinkedWallets = linkedWallets.filter((wallet) => !wallet.isCex);
    const linkedParam = encodeURIComponent(onChainLinkedWallets.map((w) => w.address).join(","));
    const labelsParts = onChainLinkedWallets.map((w) => w.address.toLowerCase() + "=" + encodeURIComponent(w.label));
    const manualLabel = addressLabel.trim();
    if (manualAddr && manualLabel) {
      const vm = detectVmType(manualAddr);
      const key = vm === "EVM" ? manualAddr.toLowerCase() : manualAddr;
      if (!labelsParts.some(p => p.startsWith(key.toLowerCase() + "=")) && !linkedWallets.some(w => w.address.toLowerCase() === key.toLowerCase())) {
        labelsParts.push(key + "=" + encodeURIComponent(manualLabel));
      }
    }
    const labelsParam = labelsParts.length > 0 ? "&labels=" + labelsParts.join(",") : "";
    router.push(`/wallet/${encoded}?chains=${chains.join(",")}&deep=${deepScan ? "1" : "0"}${linkedParam ? `&linked=${linkedParam}` : ""}${labelsParam}`);
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="text-center text-sm text-muted mb-4">Paste a public address to get started</p>

        <form onSubmit={onSubmit} className="space-y-4">
          {connectedAddress ? (
            <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span className="text-xs text-accent font-medium">
                {(() => {
                  const vm = detectVmType(connectedAddress);
                  const key = vm === "EVM" ? connectedAddress.toLowerCase() : connectedAddress;
                  const found = linkedWallets.find((w) => w.address.toLowerCase() === key.toLowerCase());
                  return found?.label || connectedAddress.slice(0, 10);
                })()}
              </span>
              <span className="text-xs text-muted font-mono truncate">{connectedAddress}</span>
            </div>
          ) : null}

          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x... / cosmos1... / Solana base58 / TON (EQ...)"
              className="flex-1 min-w-0 rounded-xl border border-border bg-bg px-5 py-4 text-fg text-base outline-none focus:border-accent placeholder:text-muted/50"
              autoComplete="off"
              spellCheck={false}
            />
            <input
              type="text"
              value={addressLabel}
              onChange={(e) => setAddressLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-36 shrink-0 rounded-xl border border-border bg-bg px-3 py-4 text-fg text-sm outline-none focus:border-accent placeholder:text-muted/50"
              autoComplete="off"
            />
            <button type="submit" disabled={syncingCex} className="rounded-xl bg-accent px-8 py-4 font-bold text-bg hover:opacity-90 transition shrink-0 text-base disabled:opacity-60">
              {syncingCex ? "Syncing CEX..." : "Scan"}
            </button>
          </div>

          {error ? <p className="text-sm text-red-400 text-center">{error}</p> : null}

          <div className="flex items-center justify-center gap-4 text-xs text-muted">
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="hover:text-fg transition">
              {showAdvanced ? "▲ " : "▼ "}chains, wallets &amp; options
            </button>
            {scansLeft != null ? (
              <span>{scansLeft} scans left today</span>
            ) : null}
          </div>

          {showAdvanced ? (
            <div className="space-y-4 pt-2 border-t border-border/50">
              <ChainSelector selected={chains} onChange={handleChainsChange} />
              <div className="space-y-1.5">
                <label className="text-xs text-muted">Add another wallet</label>
                <WalletManager wallets={[...linkedWallets, ...cexWallets]} onAdd={addWallet} onRemove={removeWallet} connectedAddress={connectedAddress} />
              </div>
            </div>
          ) : null}
        </form>
      </section>

      {recentScans.length > 0 ? (
        <div className="mt-10 rounded-lg border border-border bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Recent Scans</p>
          <div className="space-y-2">
            {recentScans.map((s, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-border/60 bg-bg/30 px-3 py-2 text-sm">
                <span className="text-muted text-xs">{new Date(s.createdAt).toLocaleDateString()}</span>
                <span className="text-xs">{s.chains.length} chains &middot; {s.tokenCount} tokens</span>
                <span className="font-mono text-sm font-semibold">{formatValue(s.totalEur)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-2 text-2xl">⛓️</div>
          <h3 className="text-sm font-semibold mb-1">Track 183 chains</h3>
          <p className="text-xs text-muted leading-relaxed">
            Paste any public EVM, Solana, Cosmos or TON address. Automatic VM detection, real-time pricing from 5 sources (DefiLlama, DexScreener, GeckoTerminal, Jupiter, CoinGecko), multi-wallet linking, custom tokens and CSV export. Unavailable chains are auto-skipped to keep scans fast and accurate.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-2 text-2xl">🌐</div>
          <h3 className="text-sm font-semibold mb-1">Selected DeFi positions</h3>
          <p className="text-xs text-muted leading-relaxed">
            Track Compound V3 collateral and debt, WCT, Chainbase and selected staked assets. Net values stay signed, while [Flex] and [Lock] show current liquidity.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-2 text-2xl">🏦</div>
          <h3 className="text-sm font-semibold mb-1">CEX holdings in one view</h3>
          <p className="text-xs text-muted leading-relaxed">
            Link your own read-only API keys for Binance, Bitpanda, Bitfinex, Bybit, Coinbase, Kraken and OKX in Profile. Balances and valuations land in the same scan summary as your on-chain wallets. Spot, Earn, staking, commodities and stocks are all priced without ever leaving your browser.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-2 text-2xl">⛽</div>
          <h3 className="text-sm font-semibold mb-1">On-chain GM</h3>
          <p className="text-xs text-muted leading-relaxed">
            Say GM across 80+ supported chains. Deploy your own GM contract, earn 50% creator revenue per GM, withdraw anytime. Per-chain streaks, leaderboard, referrals and 1-click daily GM.
          </p>
        </div>
      </div>

      {showWelcome ? (
        <WelcomeModal referralCode={referralCode} onClose={() => setShowWelcome(false)} />
      ) : null}
    </>
  );
}
