import type { ChainConfig } from "../types.js";
import { NEED_TRY3, MARKER_TTL_MS, gtMarkerKey, onchainMarkerKey } from "./markers.js";
import { getTokenStablecoinType, sanitizeStableEur } from "./stablecoins.js";
import type {
  PriceSource,
  PriceTokenCascadeOptions,
  PricingResult,
  PricingToken,
  SourcePrice,
  SourcePriceLike,
} from "./types.js";
import { isPositiveFinite, normalizePriceKey } from "./types.js";

const DEFAULT_PRICE_STALE_MS = 60 * 60 * 1000;
let _setPriceLogged = false;

// Global contract -> DefiLlama alias map. Used when a chain's LLAMA_CONTRACT_MAP
// (auto-generated from chain configs) does not cover a known token variant
// (e.g. liquid-staking wrappers like rSTONE/lSTONE on Scroll that share the
// underlying STONE price 1:1). Keys are case-insensitive (normalized at lookup).
const TOKEN_LLAMA_ALIASES: Record<string, string> = {
  "scroll:0xad3d07d431b85b525d81372802504fa18dbd554c": "coingecko:stakestone-ether", // rSTONE (StakeStone Ether)
  "scroll:0xe5c40a3331d4fb9a26f5e48b494813d977ec0a8e": "coingecko:stakestone-ether", // lSTONE (LayerBank STONE)
  "worldchain:0xb1e80387ebe53ff75a89736097d34dc8d9e9045b": "coingecko:re7-usdc", // Re7USDC (Re7 USDC, yield-bearing)
};

export async function priceTokenCascade(options: PriceTokenCascadeOptions): Promise<PricingResult> {
  const key = normalizePriceKey(options.token.key);

  // Intra-scan cache: deduplicate price lookups across concurrent workers
  if (options.intraScanCache) {
    const cached = options.intraScanCache.get(key);
    if (cached) return cached;
    const promise = priceTokenCascadeInner(options);
    options.intraScanCache.set(key, promise);
    return promise;
  }

  return priceTokenCascadeInner(options);
}

async function priceTokenCascadeInner(options: PriceTokenCascadeOptions): Promise<PricingResult> {
  const nowMs = options.nowMs ?? Date.now();
  const key = normalizePriceKey(options.token.key);
  const trail: PricingResult["trail"] = [];

  if (!isPositiveFinite(options.fxRate)) {
    return result(key, null, null, null, "BAD_FX", trail);
  }

  const stableType = getTokenStablecoinType(options.token);
  if (stableType === "EUR") return result(key, 1, 1 / options.fxRate, "stablecoin-eur", null, trail);
  if (stableType === "USD") return result(key, options.fxRate, 1, "stablecoin-usd", null, trail);

  const token = options.token;

  // RealT short-circuit: known RealT tokens must be priced by the RealT registry only.
  // DEX/GT pools for these tokens are illiquid and yield wildly wrong prices, so we
  // also bypass the main price cache (which may have been poisoned by a previous DEX hit).
  if (options.sources.realt) {
    if (await options.sources.realt.isKnownRealTContract(token)) {
      const realT = await trySource("realt", trail, () => options.sources.realt!.getTokenPriceUsd(token));
      const realTResult = commitSourcePrice(options, key, realT, trail, nowMs, null);
      if (realTResult) return realTResult;
      return result(key, null, null, null, "REALT_PRICE_UNAVAILABLE", trail);
    }
  }

  const cached = options.skipCache ? null : await options.cache.getPrice(key);
  const staleMs = options.priceStaleMs ?? DEFAULT_PRICE_STALE_MS;
  if (cached && nowMs - cached.ts >= 0 && nowMs - cached.ts < staleMs) {
    trail.push({ source: "cache", status: "hit" });
    return result(key, cached.priceEur, cached.priceEur / options.fxRate, cached.source ?? "cache", null, trail);
  }
  const staleFallback = options.skipCache && options.allowStaleCacheOnMiss
    ? await options.cache.getPrice(key)
    : cached;
  // Capture once: the only consumer (commitSourcePrice → sanitizeStableEur) needs the previous EUR price
  // for stable sanity checks. Reading it on every cascade step would mean N Redis GETs per token.
  const previousPriceEur = staleFallback?.priceEur ?? null;

  if (token.isNative || key === "native" || key.startsWith("native@")) {
    return priceNative(options, key, trail, previousPriceEur);
  }

  const mappedLlamaId = getContractLlamaId(token);
  if (mappedLlamaId) {
    const mapped = await trySource("llama-map", trail, () => options.sources.defillama.getTokenPriceUsd(token, mappedLlamaId));
    const mappedResult = commitSourcePrice(options, key, mapped, trail, nowMs, previousPriceEur);
    if (mappedResult) return mappedResult;
  }

  const [dex, llamaCoins] = await Promise.all([
    trySource("dex", trail, () => options.sources.dexscreener.getTokenPriceUsd(token)),
    trySource("llama-coins", trail, () => options.sources.defillama.getTokenPriceUsd(token)),
  ]);
  const dexResult = commitSourcePrice(options, key, dex, trail, nowMs, previousPriceEur);
  if (dexResult) return dexResult;
  const llamaCoinsResult = commitSourcePrice(options, key, llamaCoins, trail, nowMs, previousPriceEur);
  if (llamaCoinsResult) return llamaCoinsResult;

  const gt = await trySource("gt", trail, () => options.sources.geckoterminal.getTokenPriceUsd(token));
  if (gt?.marker === NEED_TRY3) {
    await options.cache.setMarker(gtMarkerKey(token), NEED_TRY3, MARKER_TTL_MS);
  }
  const gtResult = commitSourcePrice(options, key, gt, trail, nowMs, previousPriceEur);
  if (gtResult) return gtResult;

  if (token.chain.vm === "SVM") {
    const jupiter = await trySource("jupiter", trail, () => options.sources.jupiter.getTokenPriceUsd(token));
    const jupiterResult = commitSourcePrice(options, key, jupiter, trail, nowMs, previousPriceEur);
    if (jupiterResult) return jupiterResult;
  }

  // On-chain V3 before CoinGecko — on-chain pool prices are more reliable
  // than CG fallback for long-tail tokens with stale/incorrect CG data.
  const onchain = await trySource("onchain-v3", trail, () => options.sources.onchainV3.getTokenPriceUsd(token));
  const onchainResult = commitSourcePrice(options, key, onchain, trail, nowMs, previousPriceEur);
  if (onchainResult) return onchainResult;

  // CoinGecko as last-resort fallback (only when explicitly allowed)
  if (options.allowCoinGeckoTokenFallback) {
    const geckoId = getSymbolLlamaId(token.symbol, token.chain)?.replace(/^coingecko:/, "");
    const coingecko = await trySource("coingecko", trail, () => options.sources.coingecko.getTokenPriceUsd(token, geckoId));
    const coingeckoResult = commitSourcePrice(options, key, coingecko, trail, nowMs, previousPriceEur);
    if (coingeckoResult) return coingeckoResult;
  }

  // Check NEED_ONCHAIN marker: if set, the token was previously flagged as
  // needing on-chain pricing but all prior sources failed. Retry on-chain
  // one more time in case pool liquidity has been added since last scan.
  const needOnchainMarker = onchainMarkerKey(token);
  let hasNeedOnchain = false;
  if (!options.skipCache) {
    try {
      const marker = await options.cache.getMarker(needOnchainMarker);
      hasNeedOnchain = marker === "NEED_ONCHAIN";
    } catch { /* cache read failed */ }
  }
  if (hasNeedOnchain) {
    const retryOnchain = await trySource("onchain-v3", trail, () => options.sources.onchainV3.getTokenPriceUsd(token));
    const retryResult = commitSourcePrice(options, key, retryOnchain, trail, nowMs, previousPriceEur);
    if (retryResult) return retryResult;
  }

  // Fallback to stale cache if all live sources failed (rate limiting during massive scans)
  if ((!options.skipCache || options.allowStaleCacheOnMiss) && previousPriceEur != null) {
    trail.push({ source: "cache-stale", status: "hit" });
    return result(key, previousPriceEur, previousPriceEur / options.fxRate, "cache-stale", null, trail);
  }

  return result(key, null, null, null, "NO_PRICE", trail, gt?.marker);
}

async function priceNative(
  options: PriceTokenCascadeOptions,
  key: string,
  trail: PricingResult["trail"],
  previousPriceEur: number | null,
): Promise<PricingResult> {
  const llamaId = stringField(options.token.chain.CHAIN?.NATIVE_LLAMA_ID) ?? getSymbolLlamaId(options.token.symbol ?? options.token.chain.CHAIN?.NATIVE_SYMBOL, options.token.chain);
  const llama = await trySource("llama-native", trail, () => options.sources.defillama.getNativePriceUsd(options.token, llamaId ?? undefined));
  const llamaResult = commitSourcePrice(options, key, llama, trail, options.nowMs ?? Date.now(), previousPriceEur);
  if (llamaResult) return llamaResult;

  const geckoId = stringField(options.token.chain.CHAIN?.NATIVE_GECKO_ID);
  const cg = await trySource("coingecko", trail, () => options.sources.coingecko.getNativePriceUsd(options.token, geckoId ?? undefined));
  const cgResult = commitSourcePrice(options, key, cg, trail, options.nowMs ?? Date.now(), previousPriceEur);
  if (cgResult) return cgResult;

  // Fallback to stale cache if all live sources failed (rate limiting during massive scans)
  if ((!options.skipCache || options.allowStaleCacheOnMiss) && previousPriceEur != null) {
    trail.push({ source: "cache-stale", status: "hit" });
    return result(key, previousPriceEur, previousPriceEur / options.fxRate, "cache-stale", null, trail);
  }

  return result(key, null, null, null, "NO_PRICE", trail);
}

async function trySource(
  source: PriceSource,
  trail: PricingResult["trail"],
  fn: () => Promise<SourcePriceLike>,
): Promise<SourcePrice | null> {
  try {
    const raw = await fn();
    const normalized = normalizeSourcePrice(raw, source);
    trail.push({
      source,
      status: normalized && isPositiveFinite(normalized.priceUsd) ? "hit" : "miss",
      reason: normalized?.reason,
      marker: normalized?.marker,
    });
    return normalized;
  } catch (error) {
    trail.push({ source, status: "error", reason: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function commitSourcePrice(
  options: PriceTokenCascadeOptions,
  key: string,
  source: SourcePrice | null,
  _trail: PricingResult["trail"],
  nowMs: number,
  previousPriceEur: number | null,
): PricingResult | null {
  if (!source || !isPositiveFinite(source.priceUsd)) return null;
  const rawPriceEur = source.priceUsd * options.fxRate;
  const priceEur = sanitizeStableEur(rawPriceEur, options.token, previousPriceEur);
  if (!isPositiveFinite(priceEur)) return result(key, null, source.priceUsd, source.source, "STABLE_SANITY_REJECTED", _trail);
  // Best-effort cache write: awaiting blocks the cascade return, but we log failures
  // so silent Redis outages don't go undetected.
  Promise.resolve(options.cache.setPrice(key, { priceEur, ts: nowMs, source: source.source })).catch((e) => {
    if (!_setPriceLogged) { _setPriceLogged = true; console.error("[cascade] cache.setPrice failed:", e?.message ?? e); }
  });
  return result(key, priceEur, source.priceUsd, source.source, null, _trail, source.marker);
}

function normalizeSourcePrice(raw: SourcePriceLike, fallbackSource: PriceSource): SourcePrice | null {
  if (typeof raw === "number") return isPositiveFinite(raw) ? { priceUsd: raw, source: fallbackSource } : null;
  if (!raw) return null;
  return {
    ...raw,
    source: raw.source || fallbackSource,
    priceUsd: isPositiveFinite(raw.priceUsd) ? raw.priceUsd : null,
  };
}

function result(
  key: string,
  priceEur: number | null,
  priceUsd: number | null,
  source: PriceSource | string | null,
  reason: string | null,
  trail: PricingResult["trail"],
  marker?: PricingResult["marker"],
): PricingResult {
  return { key, priceEur, priceUsd, source, reason, trail, ...(marker ? { marker } : {}) };
}

function getContractLlamaId(token: PricingToken): string | null {
  const map = token.chain.LLAMA_CONTRACT_MAP;
  if (map) {
    const contract = normalizePriceKey(token.contract ?? token.key);
    const direct = stringField(map[contract]) ?? stringField(map[token.contract ?? token.key]);
    if (direct) return direct;
  }
  const aliasKey = `${String(token.chain.key).toLowerCase()}:${normalizePriceKey(token.contract ?? token.key)}`;
  return stringField(TOKEN_LLAMA_ALIASES[aliasKey]);
}

function getSymbolLlamaId(symbol: unknown, chain: ChainConfig): string | null {
  const sym = String(symbol || "");
  if (!sym) return null;
  const chainMap = chain.LLAMA_ID_MAP;
  const upper = sym.toUpperCase();
  const mapped = chainMap?.[sym] ?? chainMap?.[upper];
  return mapped ?? null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
