import {
  getChain,
  getEvmWalletAssets,
  getWalletAssets,
  type WalletAssets,
} from "@wcore/core";
import { SvmAddress } from "@wcore/shared";

import type { ProviderWalletHint } from "./types.js";

const EVM_CONTRACT = /^0x[0-9a-f]{40}$/;
const MAX_WALLET_HINTS = 1_000;

type WalletToken = WalletAssets["tokens"][number] & Record<string, unknown>;

export interface WalletHintVerifierDeps {
  scanEvmHints(chain: string, address: string, contracts: readonly string[]): Promise<WalletAssets>;
  scanSolana(chain: string, address: string): Promise<WalletAssets>;
}

export interface VerifyWalletHintsInput {
  readonly hints: readonly ProviderWalletHint[];
  readonly assetsByChain: ReadonlyMap<string, WalletAssets>;
  readonly address: string;
}

interface WalletHintEngine {
  getEvmWalletAssets(address: string, chain: string, options: {
    customTokens?: string[];
    strictTokens?: boolean;
  }): Promise<WalletAssets>;
  getWalletAssets(address: string, chain: string): Promise<WalletAssets>;
}

export function createWalletHintVerifierDeps(
  engine: WalletHintEngine = { getEvmWalletAssets, getWalletAssets },
): WalletHintVerifierDeps {
  return {
    scanEvmHints: (chain, address, contracts) => engine.getEvmWalletAssets(address, chain, {
      customTokens: [...contracts].slice(0, MAX_WALLET_HINTS),
      strictTokens: true,
    }),
    scanSolana: (chain, address) => engine.getWalletAssets(address, chain),
  };
}

export async function verifyWalletHints(
  input: VerifyWalletHintsInput,
  verifier: WalletHintVerifierDeps,
): Promise<Map<string, WalletAssets>> {
  const result = new Map(input.assetsByChain);
  const originalByChain = new Map<string, { key: string; assets: WalletAssets }>();
  for (const [key, chainAssets] of input.assetsByChain) {
    originalByChain.set(key.trim().toUpperCase(), { key, assets: chainAssets });
  }

  const groups = normalizeHints(input.hints);
  for (const [chain, group] of groups) {
    const original = originalByChain.get(chain);
    if (!original) continue;
    const existing = new Set(
      tokenRecords(original.assets)
        .map((token) => tokenIdentity(group.vm, token))
        .filter((value): value is string => value !== undefined),
    );
    const requested = [...group.contracts].filter(([identity]) => !existing.has(identity));
    if (requested.length === 0) continue;

    let scanned: WalletAssets;
    try {
      scanned = group.vm === "EVM"
        ? await verifier.scanEvmHints(chain, input.address, requested.map(([, contract]) => contract))
        : await verifier.scanSolana(chain, input.address);
    } catch {
      continue;
    }
    if (scanned.chain.trim().toUpperCase() !== chain) continue;

    const requestedIds = new Set(requested.map(([identity]) => identity));
    const additions: WalletToken[] = [];
    for (const token of tokenRecords(scanned)) {
      const identity = tokenIdentity(group.vm, token);
      if (!identity || !requestedIds.has(identity) || existing.has(identity)) continue;
      const balance = token.balance;
      const priceEur = token.priceEur;
      if (typeof balance !== "number" || !Number.isFinite(balance) || balance <= 0) continue;
      if (typeof priceEur !== "number" || !Number.isFinite(priceEur) || priceEur <= 0) continue;
      const valueEur = balance * priceEur;
      if (!Number.isFinite(valueEur)) continue;

      const trusted: WalletToken = {
        ...token,
        valueEur,
        priceSource: token.priceSource ?? "pricing-cascade",
      };
      delete trusted.providerVerified;
      delete trusted.providerId;
      delete trusted.providerPositionId;
      delete trusted.providerGroupId;
      delete trusted.DEFI;
      additions.push(trusted);
      existing.add(identity);
    }
    if (additions.length === 0) continue;

    const addedValue = additions.reduce((sum, token) => sum + (token.valueEur as number), 0);
    result.set(original.key, {
      ...original.assets,
      tokens: [...tokenRecords(original.assets), ...additions],
      totalValueEur: original.assets.totalValueEur + addedValue,
    } as WalletAssets);
  }
  return result;
}

type HintVm = "EVM" | "SVM";
interface HintGroup {
  vm: HintVm;
  contracts: Map<string, string>;
}

function normalizeHints(hints: readonly ProviderWalletHint[]): Map<string, HintGroup> {
  const groups = new Map<string, HintGroup>();
  let count = 0;
  for (const hint of hints) {
    if (count >= MAX_WALLET_HINTS) break;
    const chain = hint.chain.trim().toUpperCase();
    const chainConfig = getChain(chain);
    const vm: HintVm | undefined = chain === "SOLANA" && chainConfig?.vm === "SVM"
      ? "SVM"
      : chainConfig?.vm === "EVM" ? "EVM" : undefined;
    if (!vm) continue;

    const contract = normalizeContract(vm, hint.contract);
    if (!contract) continue;
    const identity = vm === "EVM" ? contract.toLowerCase() : contract;
    let group = groups.get(chain);
    if (!group) {
      group = { vm, contracts: new Map() };
      groups.set(chain, group);
    }
    if (group.contracts.has(identity)) continue;
    group.contracts.set(identity, contract);
    count += 1;
  }
  return groups;
}

function normalizeContract(vm: HintVm, contract: string): string | undefined {
  const value = contract.trim();
  if (vm === "EVM") {
    const normalized = value.toLowerCase();
    return EVM_CONTRACT.test(normalized) ? normalized : undefined;
  }
  return SvmAddress.safeParse(value).success ? value : undefined;
}

function tokenIdentity(vm: HintVm, token: WalletToken): string | undefined {
  const value = vm === "EVM" ? token.contract : token.mint;
  return typeof value === "string" ? normalizeContract(vm, value) : undefined;
}

function tokenRecords(assets: WalletAssets): WalletToken[] {
  return assets.tokens as WalletToken[];
}
