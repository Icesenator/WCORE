import type { ChainConfig } from "../types.js";
import { getStablecoinType } from "../pricing/stablecoins.js";
import {
  CoinGeckoPriceSource,
  DefiLlamaPriceSource,
  DexScreenerPriceSource,
  GeckoTerminalPriceSource,
  JupiterPriceSource,
  MemoryPricingCache,
  OnchainV3PriceSource,
  RealTPriceSource,
  priceTokenCascade,
  type IntraScanCache,
  type PricingCache,
  type PricingSourceSet,
  type PricingToken,
} from "../pricing/index.js";
import type { OnchainV3Rpc } from "../pricing/sources/onchain-v3.js";
import type { CacheStore } from "../cache/index.js";
import { formatUnits, prefetchTokenLogo, resolveTokenLogoCachedOrFallback } from "../tokens/index.js";
import type { DiscoveredToken } from "../tokens/index.js";
import { type WalletAssetPrice, type EvmWalletToken, roundMoney, getNativeLogo } from "./evm-types.js";

export const sharedPriceCache = new MemoryPricingCache();
export const defaultSources: PricingSourceSet = {
  defillama: new DefiLlamaPriceSource(),
  dexscreener: new DexScreenerPriceSource(),
  geckoterminal: new GeckoTerminalPriceSource(sharedPriceCache),
  coingecko: new CoinGeckoPriceSource(),
  jupiter: new JupiterPriceSource(),
  onchainV3: new OnchainV3PriceSource(sharedPriceCache),
  realt: new RealTPriceSource(),
};

export function buildSources(priceCache: PricingCache, _chain: ChainConfig, cache?: CacheStore): PricingSourceSet {
  return {
    ...defaultSources,
    geckoterminal: new GeckoTerminalPriceSource(priceCache),
    onchainV3: new OnchainV3PriceSource({ cache: priceCache, rpc: {} as OnchainV3Rpc }),
    realt: new RealTPriceSource(cache),
  };
}

export async function priceNative(
  chain: ChainConfig,
  balance: bigint,
  fxRate: number,
  sources: PricingSourceSet,
  cache: PricingCache,
  errors: string[],
  intraScanCache?: IntraScanCache,
  skipCache?: boolean,
): Promise<WalletAssetPrice> {
  const numericBalance = formatUnits(balance, Number(chain.CHAIN?.NATIVE_DECIMALS ?? 18));
  const token: PricingToken = {
    key: `native@${chain.key.toLowerCase()}`,
    contract: "native",
    symbol: String(chain.CHAIN?.NATIVE_SYMBOL ?? "NATIVE"),
    name: String(chain.CHAIN?.NATIVE_NAME ?? chain.CHAIN?.NATIVE_SYMBOL ?? "Native"),
    chain,
    isNative: true,
  };
  const priced = await priceTokenCascade({ token, fxRate, cache, sources, intraScanCache, skipCache, allowStaleCacheOnMiss: skipCache });
  if (priced.reason) errors.push(`native price: ${priced.reason}`);
  const valueEur = priced.priceEur == null ? null : roundMoney(numericBalance * priced.priceEur);
  return {
    symbol: token.symbol ?? "NATIVE",
    balance: numericBalance,
    priceEur: priced.priceEur == null ? null : roundMoney(priced.priceEur),
    valueEur,
    logoUrl: getNativeLogo(chain),
  };
}

export async function priceToken(
  chain: ChainConfig,
  known: DiscoveredToken,
  balance: number,
  fxRate: number,
  sources: PricingSourceSet,
  cache: PricingCache,
  logoCache: CacheStore | undefined,
  errors: string[],
  intraScanCache?: IntraScanCache,
  skipCache?: boolean,
): Promise<EvmWalletToken> {
  const token: PricingToken = {
    key: priceCacheKey(chain, known.contract),
    contract: known.contract,
    symbol: known.symbol,
    name: known.name,
    chain,
    isStable: known.source === "registry" && getStablecoinType(known.symbol) !== null,
    peg: getStablecoinType(known.symbol) ?? "USD",
  };
  const priced = await priceTokenCascade({
    token,
    fxRate,
    cache,
    sources,
    allowCoinGeckoTokenFallback: true,
    skipCache: skipCache || chain.key === "GNOSIS",
    intraScanCache,
  });
  if (priced.reason) errors.push(`${known.symbol} price: ${priced.reason}`);
  return {
    contract: known.contract,
    symbol: known.symbol,
    name: known.name,
    decimals: known.decimals,
    // v0.3.x: preserve custom-selector + DeFi metadata so the API adapter can remap
    // Compound V3 collateral to display the cToken contract and apply the [Flex]/[Lock] suffix.
    balanceSelector: known.balanceSelector,
    balanceSelectorExtraArgs: known.balanceSelectorExtraArgs,
    defi: known.defi,
    logoUrl: known.logoUrl || await (async () => {
      const params = { symbol: known.symbol, chainKey: chain.key, contract: known.contract, cache: logoCache };
      const fast = await resolveTokenLogoCachedOrFallback(params);
      // Single-flight background HTTP resolution so the next scan returns the high-quality logo
      // without ever blocking the pricing hot path.
      prefetchTokenLogo(params);
      return fast;
    })(),
    balance,
    priceEur: priced.priceEur == null ? null : roundPrice(priced.priceEur),
    valueEur: priced.priceEur == null ? null : roundMoney(balance * priced.priceEur),
  };
}

export function priceCacheKey(chain: ChainConfig, contract: string): string {
  return `${String(chain.key).toLowerCase()}:${contract.toLowerCase()}`;
}

function roundPrice(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}
