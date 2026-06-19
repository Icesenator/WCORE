/**
 * Demo / capture mode for screenshots and landing page assets.
 *
 * When `?demo=1` is present in the URL, the demoResults constant
 * is used instead of live scan data. This provides stable, predictable
 * output for X posts, documentation, and UI previews.
 *
 * Usage:
 *   https://wcore.xyz/wallet/0x...?chains=ETHEREUM,BASE&demo=1
 *
 * Backlog P3 item — extracted from ROADMAP.md consolidated TODO.
 */

import type { ChainScan } from "@wcore/shared";

export const DEMO_RESULTS: ChainScan[] = [
  {
    chainKey: "ETHEREUM",
    chainName: "Ethereum",
    vm: "EVM",
    native: {
      contract: "native",
      symbol: "ETH",
      name: "ETH",
      decimals: 18,
      balance: 0.482,
      priceEur: 1954.57,
      priceSource: "demo",
      valueEur: 941.91,
      flags: [],
      logoUrl: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg",
    },
    tokens: [
      { contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", name: "Tether USD", decimals: 6, balance: 2500, priceEur: 0.92, valueEur: 2300, priceSource: "demo", flags: [], logoUrl: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/usdt.svg" },
      { contract: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", symbol: "stETH", name: "Lido Staked ETH", decimals: 18, balance: 1.2, priceEur: 1954.70, valueEur: 2345.64, priceSource: "demo", flags: [], logoUrl: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg" },
      { contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", name: "USD Coin", decimals: 6, balance: 5000, priceEur: 0.92, valueEur: 4600, priceSource: "demo", flags: [], logoUrl: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/usdc.svg" },
    ],
    totals: { valueEur: 10187.55, tokenCount: 4, pricedCount: 4 },
    errors: [],
    degraded: false,
    fxRate: 0.92,
    scanMs: 2340,
    phases: { nativeMs: 200, discoveryMs: 800, balancesMs: 400, pricingMs: 940 },
    cachedAt: null,
    scriptVersion: "0.2.25-demo",
  },
  {
    chainKey: "BASE",
    chainName: "Base",
    vm: "EVM",
    native: {
      contract: "native",
      symbol: "ETH",
      name: "ETH",
      decimals: 18,
      balance: 0.0023,
      priceEur: 1954.57,
      priceSource: "demo",
      valueEur: 4.49,
      flags: [],
      logoUrl: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg",
    },
    tokens: [
      { contract: "0x3b86ad95859b6ab773f55f8d94b4b9d443ee931f", symbol: "SOLVBTC", name: "SolvBTC", decimals: 18, balance: 0.0032, priceEur: 71489, valueEur: 228.76, priceSource: "demo", flags: [], logoUrl: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/btc.svg" },
      { contract: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", symbol: "EURC", name: "EURC", decimals: 6, balance: 2.98, priceEur: 1.07, valueEur: 3.19, priceSource: "demo", flags: [], logoUrl: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eurc.svg" },
    ],
    totals: { valueEur: 236.44, tokenCount: 3, pricedCount: 3 },
    errors: [],
    degraded: false,
    fxRate: 0.92,
    scanMs: 7128,
    phases: { nativeMs: 192, discoveryMs: 3400, balancesMs: 2600, pricingMs: 936 },
    cachedAt: null,
    scriptVersion: "0.2.25-demo",
  },
];

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}
