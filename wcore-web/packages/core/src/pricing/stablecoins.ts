import type { PricingToken } from "./types.js";

export type StablecoinType = "USD" | "EUR";

const USD_STABLES = new Set([
  "USDC",
  "USDT",
  "DAI",
  "USDE",
  "USDS",
  "USDB",
  "USDBS",
  "USDBC",
  "USDC.E",
  "LUSD",
  "FRAX",
  "PYUSD",
  "GHO",
  "CRVUSD",
  "USD0",
  "USDA",
]);

const EUR_STABLES = new Set(["EURC", "EURS", "EUROC", "AGEUR", "EURE"]);

const STABLE_CONTRACTS = new Map<string, StablecoinType>([
  ["arbitrum_one:0xd1be1f98991cf69355e468ad15b6d0b6429bcfcb", "USD"], // aRUSDC, Ample Arbitrum USDC
]);

export function getStablecoinType(symbol?: string | null): StablecoinType | null {
  const s = String(symbol || "").trim().toUpperCase();
  if (!s) return null;
  if (USD_STABLES.has(s)) return "USD";
  if (EUR_STABLES.has(s)) return "EUR";
  return null;
}

export function getTokenStablecoinType(token: PricingToken): StablecoinType | null {
  const contractKey = token.contract ? `${String(token.chain.key).toLowerCase()}:${token.contract.toLowerCase()}` : null;
  if (contractKey) {
    const byContract = STABLE_CONTRACTS.get(contractKey);
    if (byContract) return byContract;
  }
  if (token.isStable === true) {
    const bySymbol = getStablecoinType(token.symbol);
    if (bySymbol) return bySymbol;
    const peg = String(token.peg ?? token.stablePeg ?? "USD").toUpperCase();
    return peg === "EUR" ? "EUR" : "USD";
  }
  return null;
}

export function sanitizeStableEur(
  priceEur: number | null,
  token: PricingToken,
  previousPriceEur?: number | null,
): number | null {
  if (priceEur == null || !Number.isFinite(priceEur) || priceEur <= 0) return priceEur;
  const stableType = getTokenStablecoinType(token);
  if (!stableType) return priceEur;
  const low = stableType === "USD" ? 0.75 : 0.9;
  const high = stableType === "USD" ? 1.35 : 1.1;
  if (priceEur >= low && priceEur <= high) return priceEur;
  if (previousPriceEur != null && Number.isFinite(previousPriceEur) && previousPriceEur > 0) {
    return previousPriceEur;
  }
  return null;
}
