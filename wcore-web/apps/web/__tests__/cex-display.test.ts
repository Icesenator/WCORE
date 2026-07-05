// Run: node --import tsx --test apps/web/__tests__/cex-display.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCexWalletListItem, getCexProviderMeta, isCexSyntheticContract, parseCexWalletAddress, sortWalletResultsByValueDesc } from "../lib/cex-display";
import { getCexStockLogoUrl } from "../lib/cex-stock-logos";
import manifest from "../lib/chain-icon-manifest.json";

test("sortWalletResultsByValueDesc sorts on-chain and CEX wallets by value descending", () => {
  const sorted = sortWalletResultsByValueDesc([
    { address: "0xsmall", label: "Small", totalEur: 10, chains: [] },
    { address: "cex:binance:1", label: "Binance", totalEur: 200, chains: [], isCex: true },
    { address: "0xbig", label: "Big", totalEur: 150, chains: [] },
  ]);

  assert.deepEqual(sorted.map((w) => w.address), ["cex:binance:1", "0xbig", "0xsmall"]);
});

test("buildCexWalletListItem exposes a removable CEX wallet row with provider logo", () => {
  const item = buildCexWalletListItem({ id: "acc_1", provider: "bitpanda", label: null, totalEur: 42.5 });

  assert.equal(item.address, "cex:bitpanda:acc_1");
  assert.equal(item.label, "Bitpanda");
  assert.equal(item.chainType, "CEX");
  assert.equal(item.isCex, true);
  assert.equal(item.cexId, "acc_1");
  assert.equal(item.cexProvider, "bitpanda");
  assert.equal(item.totalEur, 42.5);
  assert.match(item.icon, /bitpanda\.com/i);
});

test("getCexProviderMeta returns stable display metadata", () => {
  assert.deepEqual(getCexProviderMeta("binance"), {
    label: "Binance",
    icon: "https://cdn.simpleicons.org/binance/F0B90B",
  });
});

test("getCexProviderMeta exposes Bitfinex metadata", () => {
  const meta = getCexProviderMeta("bitfinex");
  assert.equal(meta.label, "Bitfinex");
  assert.match(meta.icon, /coinmarketcap\.com/i);
});

test("getCexProviderMeta exposes Bybit metadata", () => {
  const meta = getCexProviderMeta("bybit");
  assert.equal(meta.label, "Bybit");
  assert.match(meta.icon, /coinmarketcap\.com/i);
});

test("chain icon manifest exposes Bybit CEX logo", () => {
  assert.equal((manifest as Record<string, string>).CEX_BYBIT, getCexProviderMeta("bybit").icon);
});

test("getCexProviderMeta exposes Coinbase and OKX metadata", () => {
  const coinbase = getCexProviderMeta("coinbase");
  const okx = getCexProviderMeta("okx");

  assert.equal(coinbase.label, "Coinbase");
  assert.match(coinbase.icon, /coinmarketcap\.com|coinbase/i);
  assert.equal(okx.label, "OKX");
  assert.match(okx.icon, /coinmarketcap\.com|okx/i);
});

test("chain icon manifest exposes Coinbase and OKX CEX logos", () => {
  assert.equal((manifest as Record<string, string>).CEX_COINBASE, getCexProviderMeta("coinbase").icon);
  assert.equal((manifest as Record<string, string>).CEX_OKX, getCexProviderMeta("okx").icon);
});

test("buildCexWalletListItem builds a Bitfinex wallet row", () => {
  const item = buildCexWalletListItem({ id: "acc_bfx", provider: "bitfinex", label: null, totalEur: 88 });
  assert.equal(item.address, "cex:bitfinex:acc_bfx");
  assert.equal(item.label, "Bitfinex");
  assert.equal(item.cexProvider, "bitfinex");
});

test("parseCexWalletAddress recognizes Bitfinex synthetic addresses", () => {
  assert.deepEqual(parseCexWalletAddress("cex:bitfinex:acc_bfx"), { provider: "bitfinex", id: "acc_bfx" });
  assert.deepEqual(parseCexWalletAddress("cex:binance:1"), { provider: "binance", id: "1" });
  assert.equal(parseCexWalletAddress("0xabc"), null);
});

test("parseCexWalletAddress recognizes Bybit synthetic addresses", () => {
  assert.deepEqual(parseCexWalletAddress("cex:bybit:acc_byb"), { provider: "bybit", id: "acc_byb" });
});

test("parseCexWalletAddress recognizes Coinbase and OKX synthetic addresses", () => {
  assert.deepEqual(parseCexWalletAddress("cex:coinbase:acc_cb"), { provider: "coinbase", id: "acc_cb" });
  assert.deepEqual(parseCexWalletAddress("cex:okx:acc_okx"), { provider: "okx", id: "acc_okx" });
});

test("getCexProviderMeta exposes Kraken metadata", () => {
  const meta = getCexProviderMeta("kraken");
  assert.equal(meta.label, "Kraken");
  assert.match(meta.icon, /coinmarketcap\.com/i);
});

test("chain icon manifest exposes Kraken CEX logo", () => {
  assert.equal((manifest as Record<string, string>).CEX_KRAKEN, getCexProviderMeta("kraken").icon);
});

test("parseCexWalletAddress recognizes Kraken synthetic addresses", () => {
  assert.deepEqual(parseCexWalletAddress("cex:kraken:acc_krk"), { provider: "kraken", id: "acc_krk" });
});

test("buildCexWalletListItem builds a Kraken wallet row", () => {
  const item = buildCexWalletListItem({ id: "acc_krk", provider: "kraken", label: null, totalEur: 120 });
  assert.equal(item.address, "cex:kraken:acc_krk");
  assert.equal(item.label, "Kraken");
  assert.equal(item.cexProvider, "kraken");
});

test("isCexSyntheticContract detects non-on-chain CEX asset identifiers", () => {
  assert.equal(isCexSyntheticContract("AVGO:stocks"), true);
  assert.equal(isCexSyntheticContract("BTC:spot"), true);
  assert.equal(isCexSyntheticContract("0x1234567890123456789012345678901234567890"), false);
  assert.equal(isCexSyntheticContract("native"), false);
});

test("getCexStockLogoUrl maps common Bitpanda stock symbols to brand logos", () => {
  assert.match(getCexStockLogoUrl("AVGO") ?? "", /broadcom\.com/i);
  assert.match(getCexStockLogoUrl("ASML") ?? "", /asml\.com/i);
  assert.equal(getCexStockLogoUrl("BTC"), null);
});

test("getCexStockLogoUrl uses the DuckDuckGo icon service (Clearbit deprecated)", () => {
  assert.match(getCexStockLogoUrl("AAPL") ?? "", /^https:\/\/icons\.duckduckgo\.com\/ip3\/apple\.com\.ico$/);
});

test("getCexStockLogoUrl covers Bitpanda alias tickers and receipts", () => {
  // Alias/suffix Bitpanda tickers must resolve to the same brand as the base.
  assert.match(getCexStockLogoUrl("FB") ?? "", /meta\.com/i);
  assert.match(getCexStockLogoUrl("AMD-US") ?? "", /amd\.com/i);
  assert.match(getCexStockLogoUrl("WMT-US") ?? "", /walmart/i);
  assert.match(getCexStockLogoUrl("JPM-US") ?? "", /jpmorgan/i);
  assert.match(getCexStockLogoUrl("BRKB") ?? "", /berkshire/i);
  assert.match(getCexStockLogoUrl("TSFA") ?? "", /tsmc|taiwan/i);
  assert.match(getCexStockLogoUrl("BROA") ?? "", /broadcom/i);
  assert.match(getCexStockLogoUrl("MRKUS") ?? "", /merck/i);
  assert.match(getCexStockLogoUrl("TCTZF") ?? "", /tencent/i);
  assert.match(getCexStockLogoUrl("RDSA") ?? "", /shell/i);
  assert.match(getCexStockLogoUrl("HYXS") ?? "", /skhynix/i);
  assert.match(getCexStockLogoUrl("SSU") ?? "", /samsung/i);
  assert.match(getCexStockLogoUrl("SMSN") ?? "", /samsung/i);
  // A handful of major US holdings.
  assert.match(getCexStockLogoUrl("NVDA") ?? "", /nvidia/i);
  assert.match(getCexStockLogoUrl("TSM") ?? "", /tsmc|taiwan/i);
  assert.match(getCexStockLogoUrl("TM") ?? "", /toyota/i);
});
