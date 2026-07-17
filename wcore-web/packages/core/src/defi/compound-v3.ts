// v0.3.x: Compound V3 cToken on-chain discoverer — returns DiscoveredToken[] for
// an EVM chain so the engine can scan each cToken position (collateral) + the
// market's borrow position without static registry entries.
// Pure on-chain discovery: numAssets() → getAssetInfo(i).asset per collateral →
// cToken.symbol() for naming. No hardcoded cToken addresses.
import { decodeUint256, decodeAddressFromWord, decodeStringResult } from "../tokens/abi.js";
import type { EvmRpc } from "../rpc/index.js";
import type { DiscoveredToken } from "../tokens/types.js";
import type { CacheStore } from "../cache/index.js";
import { cacheKey } from "@wcore/shared";

const COMPOUND_V3_MARKETS: Record<string, string[]> = {
  // WETH borrow market on Optimism — accepts wstETH, rETH, WBTC, USDT, USDC, ezETH, weETH, wrsETH as collateral
  OPTIMISM: ["0xe36a30d249f7761327fd973001a32010b521b6fd"],
  // Extend per chain as we add support
};

// v0.3.x: Pure on-chain discoverer — reads numAssets() + getAssetInfo(i).asset
// from the Comet proxy to enumerate cToken addresses. No hardcoded cToken map.
export async function discoverCompoundV3CTokens(
  rpc: EvmRpc,
  endpoint: string,
  cometAddress: string,
  opts?: { maxAssets?: number },
): Promise<{ cTokenAddresses: string[]; errors: string[] }> {
  const max = Math.max(0, Math.floor(opts?.maxAssets ?? 32));
  const out: string[] = [];
  const errors: string[] = [];
  let numAssets: number;
  try {
    const hex = await rpc.ethCall(endpoint, cometAddress, NUM_ASSETS_SELECTOR);
    numAssets = Number(decodeUint256(hex));
  } catch (e) {
    errors.push(`numAssets() failed: ${(e as Error).message}`);
    return { cTokenAddresses: out, errors };
  }
  if (!Number.isFinite(numAssets) || numAssets < 0) return { cTokenAddresses: out, errors };
  const limit = Math.min(numAssets, max);
  for (let i = 0; i < limit; i++) {
    const data = GET_ASSET_INFO_SELECTOR + i.toString(16).padStart(64, "0");
    try {
      const hex = await rpc.ethCall(endpoint, cometAddress, data);
      const cToken = decodeAddressFromWord("0x" + hex.slice(2 + 64, 2 + 64 + 64));
      if (!cToken || cToken === "0x" + "0".repeat(40)) continue;
      out.push(cToken);
    } catch (e) {
      errors.push(`getAssetInfo(${i}) failed: ${(e as Error).message}`);
    }
  }
  return { cTokenAddresses: out, errors };
}

const NUM_ASSETS_SELECTOR = "0xa46fe83b";
const GET_ASSET_INFO_SELECTOR = "0xc8c7fe6b";
const BORROW_BALANCE_OF_SELECTOR = "0x374c49b4";
const COLLATERAL_BALANCE_OF_SELECTOR = "0x5c2549ee";
const SYMBOL_SELECTOR = "0x95d89b41";
const MAX_ASSETS = 32;

function padAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || ""));
}

function decodeString(hex: string): string {
  return decodeStringResult(hex) ?? "";
}

export interface CompoundV3DiscoveryResult {
  tokens: DiscoveredToken[];
  errors: string[];
}

export async function getCompoundV3Tokens(
  chain: string,
  _userAddress: string,
  rpc: EvmRpc,
  endpoint: string,
  opts?: { marketAddresses?: string[]; maxAssets?: number; signal?: AbortSignal; cache?: CacheStore },
): Promise<CompoundV3DiscoveryResult> {
  const chainKey = String(chain || "").trim().toUpperCase();
  const markets = opts?.marketAddresses ?? COMPOUND_V3_MARKETS[chainKey] ?? [];
  const max = Math.max(0, Math.floor(opts?.maxAssets ?? MAX_ASSETS));
  const cache = opts?.cache;
  const tokens: DiscoveredToken[] = [];
  const errors: string[] = [];

  for (const market of markets) {
    // 0. Try cache for cToken addresses (constant per market, 7-day TTL)
    const cTokenKey = cacheKey("compoundV3CTokens", { chain: chainKey, market: market.toLowerCase() });
    let cTokenSymbols: Array<{ cToken: string; symbol: string }> | null = null;
    if (cache) {
      try {
        cTokenSymbols = (await cache.get<Array<{ cToken: string; symbol: string }>>(cTokenKey)) ?? null;
        if (cTokenSymbols) {
          const filtered = cTokenSymbols.filter((entry) => {
            if (isEvmAddress(entry.cToken)) return true;
            errors.push(`[${market}] invalid cached cToken skipped: ${String(entry.cToken || "")}`);
            return false;
          });
          cTokenSymbols = filtered;
        }
      } catch {
        // cache miss
      }
    }

    // 1. If no cache, run on-chain discovery (numAssets + getAssetInfo per asset + symbol)
    if (!cTokenSymbols) {
      let numAssets: number;
      try {
        const hex = await rpc.ethCall(endpoint, market, NUM_ASSETS_SELECTOR);
        numAssets = Number(decodeUint256(hex));
      } catch (e) {
        errors.push(`[${market}] numAssets() failed: ${(e as Error).message}`);
        continue;
      }
      if (!Number.isFinite(numAssets) || numAssets < 0) {
        errors.push(`[${market}] numAssets() invalid: ${numAssets}`);
        continue;
      }
      const limit = Math.min(numAssets, max);
      cTokenSymbols = [];

      for (let i = 0; i < limit; i++) {
        const infoData = GET_ASSET_INFO_SELECTOR + i.toString(16).padStart(64, "0");
        let cToken: string | null;
        let symbol = `asset${i}`;
        try {
          const hex = await rpc.ethCall(endpoint, market, infoData);
          cToken = decodeAddressFromWord("0x" + hex.slice(2 + 64, 2 + 64 + 64));
          if (cToken && cToken !== "0x" + "0".repeat(40)) {
            try {
              const symHex = await rpc.ethCall(endpoint, cToken, SYMBOL_SELECTOR);
              const sym = decodeString(symHex);
              if (sym) symbol = sym;
            } catch {
              // keep default
            }
          }
        } catch (e) {
          errors.push(`[${market}] getAssetInfo(${i}) failed: ${(e as Error).message}`);
          continue;
        }
        if (!cToken || cToken === "0x" + "0".repeat(40)) continue;
        cTokenSymbols.push({ cToken, symbol });
      }
      // Cache the discovered cToken addresses (7 days)
      if (cache && cTokenSymbols.length > 0) {
        try {
          await cache.set(cTokenKey, cTokenSymbols, 7 * 24 * 60 * 60 * 1000);
        } catch {
          // cache write failure → continue without cache
        }
      }
    }

    // 2. Build tokens from cTokenSymbols (from cache or fresh discovery)
    for (const { cToken, symbol } of cTokenSymbols) {
      tokens.push({
        contract: cToken,
        symbol: `Comp ${symbol}`,
        name: `Compound V3 ${symbol} Collateral`,
        decimals: 18,
        balanceSelector: COLLATERAL_BALANCE_OF_SELECTOR,
        balanceSelectorExtraArgs: [`0x${padAddress(cToken)}`],
        chain: chainKey,
        protocol: "compound-v3",
        source: "registry",
        defi: {
          protocol: "compound-v3",
          type: "lending_collateral",
          underlying: "native",
          liquidityStatus: "flex",
          confidence: "high",
        },
      } as DiscoveredToken);
    }

    // 3. borrow position — Comet-level, no cToken args
    const marketShort = market.slice(0, 6) + "…" + market.slice(-4);
    tokens.push({
      contract: market,
      symbol: `Comp ${marketShort} Borrow`,
      name: `Compound V3 ${marketShort} Borrowed`,
      decimals: 18,
      balanceSelector: BORROW_BALANCE_OF_SELECTOR,
      chain: chainKey,
      protocol: "compound-v3",
      source: "registry",
      defi: {
        protocol: "compound-v3",
        type: "lending_debt",
        underlying: "native",
        liquidityStatus: "flex",
        confidence: "high",
        pricing: { mode: "mirror_native", sign: "debt" },
      },
    } as DiscoveredToken);
  }
  return { tokens, errors };
}
