// WC-11 — authoritative merge of provider enrichment into WCORE scan assets.
//
// The whole point of this module is a single invariant: WCORE/RPC stays authoritative.
// Provider snapshots are UNTRUSTED *suggestions*. A suggestion only ever becomes a
// candidate if it does NOT collide with an asset WCORE already has AND an independent
// on-chain read (RPC) confirms it. This module NEVER mutates `assetsByChain`, never
// invents a balance, and never fabricates a value from provider-reported numbers.

import type { WalletAssets } from "@wcore/core";

import type { EnrichmentOutcome } from "./service.js";
import type { ProviderId } from "./types.js";

export interface VerifiedCandidate {
  readonly contract: string;
  /** Balance read from RPC, never the provider-reported number. */
  readonly balance: number;
}

export interface EnrichmentMergeDeps {
  /** Independent on-chain verification. Returning null means "cannot verify" (drop it). */
  verifyContract(args: { chain: string; address: string; contract: string }): Promise<VerifiedCandidate | null>;
}

export interface MergedCandidate {
  readonly provider: ProviderId;
  readonly chain: string;
  readonly contract: string;
  readonly balance: number;
  readonly reason: "wallet-hint" | "provider-position";
}

export interface EnrichmentMergeInput {
  readonly address: string;
  readonly assetsByChain: ReadonlyMap<string, WalletAssets>;
  readonly outcomes: readonly EnrichmentOutcome[];
}

export interface EnrichmentMergeResult {
  readonly assetsByChain: Map<string, WalletAssets>;
  readonly candidates: readonly MergedCandidate[];
  readonly diagnostics: Readonly<Record<string, number | string | boolean>>;
}

function existingContracts(assetsByChain: ReadonlyMap<string, WalletAssets>): Map<string, Set<string>> {
  const byChain = new Map<string, Set<string>>();
  for (const [chain, assets] of assetsByChain) {
    const set = new Set<string>();
    for (const token of assets.tokens ?? []) {
      const contract = (token as { contract?: unknown }).contract;
      if (typeof contract === "string" && contract.length > 0) set.add(contract.toLowerCase());
    }
    byChain.set(chain, set);
  }
  return byChain;
}

function contributionStatus(outcome: EnrichmentOutcome): "contribute" | "skip" {
  return (outcome.status === "SUCCESS" || outcome.status === "STALE") && outcome.snapshot !== null ? "contribute" : "skip";
}

export async function mergeEnrichmentIntoAssets(
  input: EnrichmentMergeInput,
  deps: EnrichmentMergeDeps,
): Promise<EnrichmentMergeResult> {
  const known = existingContracts(input.assetsByChain);
  const candidates: MergedCandidate[] = [];
  let collisions = 0;
  let verified = 0;
  let unverified = 0;
  let metadataOnly = 0;

  const seen = new Set<string>();
  const consider = async (provider: ProviderId, chain: string, contract: string, reason: MergedCandidate["reason"]): Promise<void> => {
    const normalized = contract.toLowerCase();
    if (known.get(chain)?.has(normalized)) {
      collisions += 1;
      return;
    }
    const key = `${chain}|${normalized}`;
    if (seen.has(key)) return; // dedupe across providers
    seen.add(key);
    let result: VerifiedCandidate | null;
    try {
      result = await deps.verifyContract({ chain, address: input.address, contract: normalized });
    } catch {
      result = null; // verification failure = drop, never throw
    }
    if (!result || !(result.balance > 0)) {
      unverified += 1;
      return;
    }
    verified += 1;
    candidates.push({ provider, chain, contract: normalized, balance: result.balance, reason });
  };

  for (const outcome of input.outcomes) {
    if (contributionStatus(outcome) === "skip") continue;
    const snapshot = outcome.snapshot!;
    for (const hint of snapshot.walletHints) {
      await consider(outcome.provider, hint.chain, hint.contract, "wallet-hint");
    }
    for (const position of snapshot.positions) {
      const contract = position.contract ?? position.underlyingContract;
      if (!contract) {
        metadataOnly += 1;
        continue;
      }
      await consider(outcome.provider, position.chain, contract, "provider-position");
    }
  }

  return {
    // WCORE authority: same entries, fresh Map handle. Enrichment never mutates scan assets.
    assetsByChain: new Map(input.assetsByChain),
    candidates,
    diagnostics: {
      collisions,
      verified,
      unverified,
      metadataOnly,
      candidates: candidates.length,
      mutatedAssets: false,
    },
  };
}
