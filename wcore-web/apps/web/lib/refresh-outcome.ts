import type { ChainScan } from "@wcore/shared";
import { isFailedChain } from "./share-card";

/**
 * P2-DATA-SCAN-REFRESH-PRESERVATION.
 *
 * A failed refresh never produces a current value: the current chain is the failure itself
 * (unknown value, excluded by the Share/CSV guards). A previous successful result for the same
 * wallet+chain is kept apart as a "last known" value, for display only. It never feeds totals,
 * share cards or exports, and its only provenance is an earlier receipt in this browser session
 * (the API returns cachedAt:null, so no blockchain scan date is ever fabricated).
 */

export interface ChainRefreshOutcome {
  chains: ChainScan[];
  totalEur: number;
  /** Previous successful result of the same chain, set only when this refresh failed. */
  lastKnown?: ChainScan;
  /** Failure message of this refresh, set only when it failed. */
  failure?: string;
}

export interface LastKnownEntry {
  status: "stale_refresh_failed";
  provenance: "browser_session_previous_result";
  chain: ChainScan;
  /** Browser receipt time of the kept result, or null when it is not known. Never the failure time. */
  observedAt: string | null;
  failure: string;
}

export interface LastKnownState {
  entries: Record<string, LastKnownEntry>;
  /** Browser receipt time of the latest successful result per wallet+chain. */
  observedAt: Record<string, string>;
}

export function lastKnownKey(address: string, chainKey: string): string {
  return `${address.toLowerCase()}|${chainKey.toUpperCase()}`;
}

/** Current value of a chain, or null when the latest refresh failed (unknown, never a zero). */
export function chainCurrentValue(chain: ChainScan): number | null {
  return isFailedChain(chain) ? null : chain.totals.valueEur;
}

/** Drop entries of wallets that are no longer part of the scan, so no orphan last-known value lingers. */
export function pruneLastKnown(state: LastKnownState, addresses: ReadonlyArray<string>): LastKnownState {
  const keep = new Set(addresses.map((address) => address.toLowerCase()));
  const inScope = (key: string) => keep.has(key.slice(0, key.indexOf("|")));
  const entries = Object.fromEntries(Object.entries(state.entries).filter(([key]) => inScope(key)));
  const observedAt = Object.fromEntries(Object.entries(state.observedAt).filter(([key]) => inScope(key)));
  return { entries, observedAt };
}

export function applyRefreshToLastKnown(
  state: LastKnownState,
  address: string,
  chainKey: string,
  outcome: ChainRefreshOutcome,
  receivedAt: string,
): LastKnownState {
  const key = lastKnownKey(address, chainKey);
  const current = outcome.chains.find((chain) => chain.chainKey.toUpperCase() === chainKey.toUpperCase());
  if (outcome.failure === undefined && current && !isFailedChain(current)) {
    // Success (including a confirmed zero): the stale value is obsolete.
    const entries = { ...state.entries };
    delete entries[key];
    return { entries, observedAt: { ...state.observedAt, [key]: receivedAt } };
  }
  if (outcome.lastKnown && outcome.failure !== undefined) {
    const entry: LastKnownEntry = {
      status: "stale_refresh_failed",
      provenance: "browser_session_previous_result",
      chain: outcome.lastKnown,
      observedAt: state.observedAt[key] ?? null,
      failure: outcome.failure,
    };
    return { ...state, entries: { ...state.entries, [key]: entry } };
  }
  // Failure without a reliable previous result: keep any existing stale entry as is.
  return state;
}
