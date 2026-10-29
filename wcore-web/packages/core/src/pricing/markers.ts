import type { ChainConfig } from "../types.js";
import type { PricingMarker, PricingToken } from "./types.js";
import { normalizePriceKey } from "./types.js";

export const NEED_DEEP: PricingMarker = "NEED_DEEP";
export const NEED_TRY3: PricingMarker = "NEED_TRY3";
export const NEED_ONCHAIN: PricingMarker = "NEED_ONCHAIN";
// GT simple price recently confirmed against /tokens price_usd (see confirmGtBatchPrices).
export const GT_OK: PricingMarker = "GT_OK";

export const MARKER_TTL_MS = 6 * 60 * 60 * 1000;

export function gtMarkerKey(token: PricingToken): string {
  return `${gtNetwork(token.chain)}:${normalizePriceKey(token.contract ?? token.key)}`;
}

export function gtConfirmMarkerKey(network: string, contract: string): string {
  return `${GT_OK}:${String(network || "").toLowerCase()}:${normalizePriceKey(contract)}`;
}

export function onchainMarkerKey(token: PricingToken): string {
  return `${NEED_ONCHAIN}:${gtNetwork(token.chain)}:${normalizePriceKey(token.contract ?? token.key)}`;
}

export function gtNetwork(chain: ChainConfig): string {
  const value = chain.CHAIN?.GT_NETWORK ?? chain.CHAIN?.DEX_SLUG ?? chain.key;
  return String(value || "unknown").toLowerCase();
}
