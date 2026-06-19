// Detection rules live in @wcore/shared so the API and UI agree.
// This file only keeps the UI-side aggregator that zeroes flagged tokens
// and recomputes per-chain / wallet totals before rendering.
import { detectScam } from "@wcore/shared";

// Admin scam override sync from server
import { getApiUrl, apiFetch } from "@/lib/api";
import { useEffect } from "react";

export function useScamOverrideSync() {
  useEffect(() => {
    const API_URL = getApiUrl();
    apiFetch(`${API_URL}/api/admin/scam-overrides`)
      .then(res => res.ok ? res.json() as Promise<{ overrides: Array<{ symbol: string; contract: string | null; approved: boolean }> }> : null)
      .then(data => {
        if (!data?.overrides?.length) return;
        const blocked: Array<string | { symbol: string; contract: string }> = [];
        const approved: Array<string | { symbol: string; contract: string }> = [];
        for (const o of data.overrides) {
          const entry = o.contract ? { symbol: o.symbol, contract: o.contract } : o.symbol;
          if (o.approved) approved.push(entry as string);
          else blocked.push(entry as string);
        }
        if (typeof window !== "undefined") {
          localStorage.setItem("wcore_scam_blocked", JSON.stringify(blocked));
          localStorage.setItem("wcore_scam_approved", JSON.stringify(approved));
          window.dispatchEvent(new Event("wcore-scam-override"));
        }
      })
      .catch(() => { /* best-effort sync */ });
  }, []);
}

export { detectScam, SCAM_RULES_VERSION, type ScamCheck, type ScamLevel } from "@wcore/shared";

type OverrideMap = Map<string, Set<string | null>>;

function loadOverrideMap(storageKey: string): OverrideMap {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) || "[]" : "[]";
    const arr = JSON.parse(raw) as Array<string | { symbol: string; contract?: string | null }>;
    const m: OverrideMap = new Map();
    for (const item of arr) {
      const symbol = typeof item === "string" ? item : item.symbol;
      const contract = typeof item === "string" ? null : (item.contract?.toLowerCase() ?? null);
      const key = symbol.toUpperCase();
      const set = m.get(key) ?? new Set<string | null>();
      set.add(contract);
      m.set(key, set);
    }
    return m;
  } catch {
    return new Map();
  }
}

function getAdminBlocked(): OverrideMap {
  return loadOverrideMap("wcore_scam_blocked");
}

function getAdminApproved(): OverrideMap {
  return loadOverrideMap("wcore_scam_approved");
}

function matchOverride(map: OverrideMap, symbol: string, contract?: string): boolean {
  const set = map.get(symbol.toUpperCase());
  if (!set) return false;
  if (set.has(null)) return true; // wildcard: any contract with this symbol
  const target = contract?.toLowerCase();
  return target != null && set.has(target);
}

export function isAdminBlocked(symbol: string, contract?: string): boolean {
  return matchOverride(getAdminBlocked(), symbol, contract);
}

export function isAdminApproved(symbol: string, contract?: string): boolean {
  return matchOverride(getAdminApproved(), symbol, contract);
}

export function adjustForScams<T extends { native?: any; tokens?: any[]; totals?: { valueEur?: number } }>(chains: T[], __walletTotalEur: number): { chains: T[]; totalEur: number } {
  const adjustedChains = chains.map(c => {
    const nativeScam = c.native && detectScam(c.native.symbol, c.native.name, c.native.balance, c.native.priceEur, c.native.contract).isSuspicious;
    const nativeBlocked = isAdminBlocked(c.native?.symbol ?? "", c.native?.contract);
    const nativeIsScam = isAdminApproved(c.native?.symbol ?? "", c.native?.contract) ? false : (nativeBlocked || nativeScam);
    const adjustedNative = c.native && nativeIsScam
      ? { ...c.native, valueEur: 0, priceEur: 0 }
      : c.native;
    const adjustedTokens = (c.tokens ?? []).map(t => {
      const scam = detectScam(t.symbol, t.name, t.balance, t.priceEur, t.contract).isSuspicious;
      const blocked = isAdminBlocked(t.symbol, t.contract);
      const approved = isAdminApproved(t.symbol, t.contract);
      const isScam = blocked ? true : approved ? false : scam;
      return isScam ? { ...t, valueEur: 0, priceEur: 0 } : t;
    });
    const adjustedValue = (adjustedNative?.valueEur ?? 0) + adjustedTokens.reduce((s, t) => s + (t.valueEur ?? 0), 0);
    return { ...c, native: adjustedNative, tokens: adjustedTokens, totals: { ...c.totals, valueEur: adjustedValue } };
  }).sort((a, b) => b.totals.valueEur - a.totals.valueEur);
  const adjustedTotalEur = adjustedChains.reduce((s, c) => s + c.totals.valueEur, 0);
  return { chains: adjustedChains, totalEur: Math.round(adjustedTotalEur * 100) / 100 };
}
