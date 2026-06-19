import { getChain } from "../chains/index.js";
import type { IntraScanCache, PricingCache } from "../pricing/index.js";
import type { EvmWalletAssets } from "./evm.js";
import type { SvmWalletAssets } from "./svm.js";
import type { CosmosWalletAssets } from "./cosmos.js";
import type { TonWalletAssets } from "./ton.js";

export type WalletAssets = EvmWalletAssets | SvmWalletAssets | CosmosWalletAssets | TonWalletAssets;

export interface WalletAssetsError {
  chain: string;
  chainName: string;
  native: { symbol: string; balance: number; priceEur: null; valueEur: null };
  tokens: never[];
  errors: string[];
  totalValueEur: number;
  scanMs: number;
}

export interface DispatchOptions {
  cache?: import("../cache/index.js").CacheStore;
  sharedPriceCache?: PricingCache;
  logBlockRange?: number;
  customTokens?: string[];
  strictTokens?: boolean;
  deepScan?: boolean;
  intraScanCache?: IntraScanCache;
  forceRefresh?: boolean;
  fxRate?: number;
  signal?: AbortSignal;
}

export async function getWalletAssets(
  address: string,
  chainKey: string,
  opts: DispatchOptions = {},
): Promise<WalletAssets> {
  const key = normalizeDispatchKey(chainKey);
  const chain = getChain(key);
  if (!chain) throw new Error(`unknown chain: ${chainKey}`);

  switch (chain.vm) {
    case "EVM": {
      const { getEvmWalletAssets } = await import("./evm.js");
      return getEvmWalletAssets(address, key, { ...opts, intraScanCache: opts.intraScanCache });
    }
    case "SVM": {
      const { getSvmWalletAssets } = await import("./svm.js");
      return getSvmWalletAssets(address, key, { ...opts, intraScanCache: opts.intraScanCache });
    }
    case "COSMOS": {
      const { getCosmosWalletAssets } = await import("./cosmos.js");
      return getCosmosWalletAssets(address, key, { ...opts, intraScanCache: opts.intraScanCache });
    }
    case "TON": {
      const { getTonWalletAssets } = await import("./ton.js");
      return getTonWalletAssets(address, key, { ...opts, intraScanCache: opts.intraScanCache });
    }
    default:
      throw new Error(`unsupported VM: ${chain.vm} for chain ${chainKey}`);
  }
}

function normalizeDispatchKey(key: string): string {
  const k = String(key || "").trim().toUpperCase();
  if (k === "ETH" || k === "ETHEREUM") return "ETHEREUM";
  if (k === "BASE") return "BASE";
  if (k === "SOL" || k === "SOLANA") return "SOLANA";
  if (k === "COSMOS" || k === "COSMOS_HUB" || k === "COSMOHUB") return "COSMOS_HUB";
  return k;
}
