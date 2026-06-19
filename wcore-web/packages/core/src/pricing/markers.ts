import type { ChainConfig } from "../types.js";
import type { PricingMarker, PricingToken } from "./types.js";
import { normalizePriceKey } from "./types.js";

export const NEED_DEEP: PricingMarker = "NEED_DEEP";
export const NEED_TRY3: PricingMarker = "NEED_TRY3";
export const NEED_ONCHAIN: PricingMarker = "NEED_ONCHAIN";

export const MARKER_TTL_MS = 6 * 60 * 60 * 1000;

export function gtMarkerKey(token: PricingToken): string {
  return `${gtNetwork(token.chain)}:${normalizePriceKey(token.contract ?? token.key)}`;
}

export function onchainMarkerKey(token: PricingToken): string {
  return `${NEED_ONCHAIN}:${gtNetwork(token.chain)}:${normalizePriceKey(token.contract ?? token.key)}`;
}

export function gtNetwork(chain: ChainConfig): string {
  const value = chain.CHAIN?.GT_NETWORK ?? chain.CHAIN?.DEX_SLUG ?? chain.key;
  return String(value || "unknown").toLowerCase();
}
