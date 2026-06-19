import type { FastifyInstance } from "fastify";
import type { Prisma, PrismaClient } from "@wcore/db";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { getEurUsdRate, type CacheStore } from "@wcore/core";
import { CexAccountBodySchema, CexAccountParamsSchema } from "../schemas.js";
import { normalizeBinanceBuckets, normalizeBitpandaBuckets, normalizeBitfinexBuckets, normalizeBybitBuckets, normalizeCoinbaseBuckets, normalizeOkxBuckets, type BitfinexBuckets, type BitpandaBuckets, type BybitBuckets, type CoinbaseBuckets, type OkxBuckets, type RawCexRow, type RelayBuckets } from "../cex/normalizers.js";
import { type StockPriceCache } from "../cex/stock-pricing.js";
import { fetchStockPricesViaRelay } from "../cex/stock-relay.js";

export interface CexPluginDeps {
  prisma: PrismaClient;
  sharedCache?: CacheStore;
}

// Adapt the generic CacheStore (get returns undefined) to the StockPriceCache
// contract (get returns null) so Yahoo stock prices survive across syncs and
// 429 storms. TTL handled by the pricing layer.
function toStockPriceCache(store: CacheStore | undefined): StockPriceCache | undefined {
  if (!store) return undefined;
  return {
    async get(key) { return (await store.get<{ priceEur: number; source: string }>(key)) ?? null; },
    async set(key, value, ttlMs) { await store.set(key, value, ttlMs); },
  };
}

type EncryptedPayload = { iv: string; tag: string; data: string };
type BinanceCredentials = { apiKey: string; apiSecret: string };
type BitpandaCredentials = { apiKey: string };
type BitfinexCredentials = { apiKey: string; apiSecret: string };
type BybitCredentials = { apiKey: string; apiSecret: string };
type CoinbaseCredentials = { apiKey: string; apiSecret: string };
type OkxCredentials = { apiKey: string; apiSecret: string; apiPassphrase: string };

// Server-side binance-relay (Railway IP not blocked by Binance HTTP 451).
// The relay signs the per-user request and never exposes RELAY_TOKEN to clients.
function getCexRelayUrl(provider: "binance" | "bybit" | "coinbase" | "okx"): string {
  const specific = provider === "bybit"
    ? process.env.BYBIT_RELAY_URL
    : provider === "coinbase"
    ? process.env.COINBASE_RELAY_URL
    : provider === "okx"
    ? process.env.OKX_RELAY_URL
    : process.env.BINANCE_RELAY_URL;
  const explicit = specific || process.env.CEX_RELAY_URL || process.env.BINANCE_RELAY_URL || process.env.BYBIT_RELAY_URL;
  const railway = process.env.RAILWAY_SERVICE_CEX_RELAY_URL || process.env.RAILWAY_SERVICE_BINANCE_RELAY_URL;
  const base = explicit || (railway ? `https://${railway.replace(/^https?:\/\//, "")}` : "");
  if (!base) throw new Error(`${provider.toUpperCase()}_RELAY_URL or CEX_RELAY_URL not configured`);
  return base.replace(/\/+$/, "");
}

// Stock prices use the same relay infra as Binance/Bybit (Yahoo blocks our
// datacenter IP). Returns "" when no relay is configured so callers can skip.
function getStockRelayUrl(): string {
  const explicit = process.env.CEX_RELAY_URL || process.env.BINANCE_RELAY_URL || process.env.BYBIT_RELAY_URL;
  const railway = process.env.RAILWAY_SERVICE_CEX_RELAY_URL || process.env.RAILWAY_SERVICE_BINANCE_RELAY_URL;
  const base = explicit || (railway ? `https://${railway.replace(/^https?:\/\//, "")}` : "");
  return base ? base.replace(/\/+$/, "") : "";
}

const CEX_PRICE_IDS: Record<string, string> = {
  BTC: "coingecko:bitcoin",
  ETH: "coingecko:ethereum",
  BNB: "coingecko:binancecoin",
  SOL: "coingecko:solana",
  XRP: "coingecko:ripple",
  ADA: "coingecko:cardano",
  DOGE: "coingecko:dogecoin",
  DOT: "coingecko:polkadot",
  LINK: "coingecko:chainlink",
  AVAX: "coingecko:avalanche-2",
  MATIC: "coingecko:matic-network",
  POL: "coingecko:polygon-ecosystem-token",
  TRX: "coingecko:tron",
  LTC: "coingecko:litecoin",
  BCH: "coingecko:bitcoin-cash",
  XLM: "coingecko:stellar",
  ATOM: "coingecko:cosmos",
  NEAR: "coingecko:near",
  TON: "coingecko:the-open-network",
  SUI: "coingecko:sui",
  APT: "coingecko:aptos",
  OP: "coingecko:optimism",
  ARB: "coingecko:arbitrum",
  CRO: "coingecko:crypto-com-chain",
  HBAR: "coingecko:hedera-hashgraph",
  LDO: "coingecko:lido-dao",
  OKB: "coingecko:okb",
  ZEC: "coingecko:zcash",
  ETC: "coingecko:ethereum-classic",
  SHIB: "coingecko:shiba-inu",
  UNI: "coingecko:uniswap",
  XMR: "coingecko:monero",
  LEO: "coingecko:leo-token",
  VET: "coingecko:vechain",
  RONIN: "coingecko:ronin",
  ALEO: "coingecko:aleo",
  ETHW: "coingecko:ethereum-pow-iou",
  SOLO: "coingecko:solo-coin",
  BGB: "coingecko:bitget-token",
};

function encryptionKey(): Buffer {
  const secret = process.env.CEX_SECRET || process.env.JWT_SECRET || "wcore-dev-cex-secret";
  return createHash("sha256").update(secret).digest();
}

function encryptJson(value: unknown): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function decryptJson<T>(payload: unknown): T {
  const p = payload as EncryptedPayload;
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(p.iv, "base64"));
  decipher.setAuthTag(Buffer.from(p.tag, "base64"));
  const text = Buffer.concat([decipher.update(Buffer.from(p.data, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(text) as T;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchBinanceRows(creds: BinanceCredentials): Promise<RawCexRow[]> {
  const relayToken = process.env.RELAY_TOKEN;
  if (!relayToken) throw new Error("RELAY_TOKEN not configured");
  const url = `${getCexRelayUrl("binance")}/binance/account`;
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: relayToken, apiKey: creds.apiKey, apiSecret: creds.apiSecret }),
  }) as RelayBuckets & { ok?: boolean; error?: string };
  if (!data?.ok) throw new Error(`Relay error: ${String(data?.error ?? "unknown").slice(0, 300)}`);
  return normalizeBinanceBuckets(data);
}

async function fetchBybitRows(creds: BybitCredentials): Promise<RawCexRow[]> {
  const relayToken = process.env.RELAY_TOKEN;
  if (!relayToken) throw new Error("RELAY_TOKEN not configured");
  const url = `${getCexRelayUrl("bybit")}/bybit/account`;
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: relayToken, apiKey: creds.apiKey, apiSecret: creds.apiSecret }),
  }) as BybitBuckets & { ok?: boolean; error?: string };
  if (!data?.ok) throw new Error(`Bybit relay error: ${String(data?.error ?? "unknown").slice(0, 300)}`);
  return normalizeBybitBuckets(data);
}

async function fetchCoinbaseRows(creds: CoinbaseCredentials): Promise<RawCexRow[]> {
  const relayToken = process.env.RELAY_TOKEN;
  if (!relayToken) throw new Error("RELAY_TOKEN not configured");
  const url = `${getCexRelayUrl("coinbase")}/coinbase/account`;
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: relayToken, apiKey: creds.apiKey, apiSecret: creds.apiSecret }),
  }) as CoinbaseBuckets & { ok?: boolean; error?: string };
  if (!data?.ok) throw new Error(`Coinbase relay error: ${String(data?.error ?? "unknown").slice(0, 300)}`);
  return normalizeCoinbaseBuckets(data);
}

async function fetchOkxRows(creds: OkxCredentials): Promise<RawCexRow[]> {
  const relayToken = process.env.RELAY_TOKEN;
  if (!relayToken) throw new Error("RELAY_TOKEN not configured");
  const url = `${getCexRelayUrl("okx")}/okx/account`;
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: relayToken, apiKey: creds.apiKey, apiSecret: creds.apiSecret, apiPassphrase: creds.apiPassphrase }),
  }) as OkxBuckets & { ok?: boolean; error?: string };
  if (!data?.ok) throw new Error(`OKX relay error: ${String(data?.error ?? "unknown").slice(0, 300)}`);
  return normalizeOkxBuckets(data);
}

function bitpandaWalletRow(wallet: unknown, symbolKey: string): [string, number] | null {
  const attrs = (wallet as { attributes?: Record<string, unknown> } | null)?.attributes ?? {};
  const symbol = String(attrs[symbolKey] ?? attrs.cryptocoin_symbol ?? attrs.fiat_symbol ?? attrs.symbol ?? "").trim().toUpperCase();
  const balance = Number(String(attrs.balance ?? "0").replace(",", "."));
  if (!symbol || !Number.isFinite(balance) || balance <= 0) return null;
  return [symbol, balance];
}

function walkBitpandaAssets(node: unknown, path: string[], buckets: BitpandaBuckets): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) walkBitpandaAssets(item, path, buckets);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.type === "wallet" && obj.attributes) {
    const row = bitpandaWalletRow(obj, "cryptocoin_symbol");
    if (!row) return;
    const p = path.join(".").toLowerCase();
    if (p.includes("commodity") || p.includes("metal")) (buckets.commodity ??= []).push(row);
    else if (p.includes("stock") || p.includes("equity") || p.includes("security") || p.includes("etf") || p.includes("index") || p.includes("action")) (buckets.stocks ??= []).push(row);
    else if (p.includes("crypto") || p.includes("coin")) return;
    return;
  }
  for (const [key, value] of Object.entries(obj)) walkBitpandaAssets(value, [...path, key], buckets);
}

async function fetchBitpandaRows(creds: BitpandaCredentials): Promise<RawCexRow[]> {
  const headers = { "X-Api-Key": creds.apiKey, Accept: "application/json" };
  const [wallets, fiat, assets, ticker] = await Promise.all([
    fetchJson("https://api.bitpanda.com/v1/wallets", { method: "GET", headers }),
    fetchJson("https://api.bitpanda.com/v1/fiatwallets", { method: "GET", headers }),
    fetchJson("https://api.bitpanda.com/v1/asset-wallets", { method: "GET", headers }),
    fetchJson("https://api.bitpanda.com/v1/ticker", { method: "GET", headers: { Accept: "application/json" } }).catch(() => null),
  ]);
  const buckets: BitpandaBuckets = { crypto: [], fiat: [], commodity: [], stocks: [] };
  const tickerObj = ticker && typeof ticker === "object" ? ticker as Record<string, { EUR?: string }> : {};
  buckets.prices = Object.fromEntries(Object.entries(tickerObj).flatMap(([symbol, quote]) => {
    const priceEur = Number(String(quote?.EUR ?? "").replace(",", "."));
    return Number.isFinite(priceEur) && priceEur > 0 ? [[symbol.toUpperCase(), { priceEur, source: "bitpanda:ticker" }]] : [];
  }));
  for (const wallet of ((wallets as { data?: unknown[] })?.data ?? [])) {
    const row = bitpandaWalletRow(wallet, "cryptocoin_symbol");
    if (row) buckets.crypto!.push(row);
  }
  for (const wallet of ((fiat as { data?: unknown[] })?.data ?? [])) {
    const row = bitpandaWalletRow(wallet, "fiat_symbol");
    if (row) buckets.fiat!.push(row);
  }
  walkBitpandaAssets((assets as { data?: unknown })?.data, [], buckets);
  return normalizeBitpandaBuckets(buckets);
}

// Bitfinex authenticated POST (API v2). Unlike Binance, Bitfinex does not block
// datacenter IPs, so we call api.bitfinex.com directly server-side. Signature is
// HMAC-SHA384 over `/api/<path><nonce><body>` with a strictly increasing nonce.
async function bitfinexAuthPost(path: string, creds: BitfinexCredentials): Promise<unknown> {
  const body = "{}";
  const nonce = String(Date.now() * 1000);
  const signaturePayload = `/api/${path}${nonce}${body}`;
  const signature = createHmac("sha384", creds.apiSecret).update(signaturePayload).digest("hex");
  const res = await fetch(`https://api.bitfinex.com/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "bfx-nonce": nonce,
      "bfx-apikey": creds.apiKey,
      "bfx-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (res.status === 451 || res.status === 403) throw new Error(`Bitfinex IP/geo blocked (HTTP ${res.status}): ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`Bitfinex ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function fetchBitfinexRows(creds: BitfinexCredentials): Promise<RawCexRow[]> {
  const data = await bitfinexAuthPost("v2/auth/r/wallets", creds);
  const wallets = Array.isArray(data) ? data : [];
  // Keep only the "exchange" (spot) wallet, mirroring 37_BITFINEX_SYNC.gs.
  // Wallet array: [WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE, ...]
  const spot: Array<[string, number]> = [];
  for (const w of wallets) {
    if (!Array.isArray(w) || w.length < 3) continue;
    if (String(w[0] ?? "").trim().toLowerCase() !== "exchange") continue;
    const total = Number(String(w[2] ?? "0").replace(",", "."));
    if (Number.isFinite(total) && total > 0) spot.push([String(w[1] ?? ""), total]);
  }
  const buckets: BitfinexBuckets = { spot };
  return normalizeBitfinexBuckets(buckets);
}

async function priceSymbolEur(symbol: string): Promise<{ priceEur: number | null; source: string | null }> {
  const s = symbol.toUpperCase();
  if (s === "EUR" || s === "EURI" || s === "EURC" || s === "BCPEUR") return { priceEur: 1, source: "fiat-eur" };
  const eurUsd = await getEurUsdRate();
  if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) return { priceEur: 1 / eurUsd, source: "stable-usd" };
  const llamaId = CEX_PRICE_IDS[s];
  if (!llamaId) return { priceEur: null, source: null };
  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${llamaId}?searchWidth=4h`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json() as { coins?: Record<string, { price?: number }> };
    const priceUsd = data.coins?.[llamaId]?.price;
    if (priceUsd && priceUsd > 0) return { priceEur: priceUsd / eurUsd, source: "defillama" };
  } catch (e) { console.error("cex price defillama error:", (e as Error).message); }
  return { priceEur: null, source: null };
}

const STOCK_PRICE_TTL_MS = 6 * 60 * 60 * 1000;

async function priceStockSymbolEur(symbol: string, cache?: StockPriceCache): Promise<{ priceEur: number | null; source: string | null }> {
  const key = `stockprice:${symbol.trim().toUpperCase()}`;
  if (cache) {
    try {
      const cached = await cache.get(key);
      if (cached && cached.priceEur > 0) return { priceEur: cached.priceEur, source: cached.source };
    } catch (e) { console.error("cex stock price cache read error:", (e as Error).message); }
  }
  const relayUrl = getStockRelayUrl();
  const relayToken = process.env.RELAY_TOKEN;
  if (!relayUrl || !relayToken) return { priceEur: null, source: null };
  const prices = await fetchStockPricesViaRelay([symbol], { relayUrl, relayToken });
  const hit = prices[symbol.trim().toUpperCase()];
  if (hit && hit.priceEur > 0) {
    if (cache) {
      try { await cache.set(key, { priceEur: hit.priceEur, source: hit.source }, STOCK_PRICE_TTL_MS); } catch (e) { console.error("cex stock price cache write error:", (e as Error).message); }
    }
    return { priceEur: hit.priceEur, source: hit.source };
  }
  return { priceEur: null, source: null };
}

type CexPriceResult = { priceEur: number | null; source: string | null };

interface PriceCexRowsDeps {
  priceStockSymbolEur: (symbol: string) => Promise<CexPriceResult>;
  priceSymbolEur: (symbol: string) => Promise<CexPriceResult>;
}

export async function priceCexRowsForTest(rows: RawCexRow[], deps: PriceCexRowsDeps): Promise<Array<RawCexRow & { priceEur: number | null; valueEur: number | null; priceSource: string | null }>> {
  const priceCache = new Map<string, Promise<{ priceEur: number | null; source: string | null }>>();
  const stockPriceCache = new Map<string, Promise<{ priceEur: number | null; source: string | null }>>();
  return Promise.all(rows.map(async (row) => {
    if (!priceCache.has(row.symbol)) priceCache.set(row.symbol, priceSymbolEur(row.symbol));
    const cexPrice = await priceCache.get(row.symbol)!;
    if (cexPrice.priceEur != null) {
      return { ...row, priceEur: cexPrice.priceEur, valueEur: row.balance * cexPrice.priceEur, priceSource: cexPrice.source };
    }
    if (row.source === "bitpanda-stocks" || row.bucket === "stocks") {
      if (!stockPriceCache.has(row.symbol)) stockPriceCache.set(row.symbol, deps.priceStockSymbolEur(row.symbol));
      const price = await stockPriceCache.get(row.symbol)!;
      if (price.priceEur != null) return { ...row, priceEur: price.priceEur, valueEur: row.balance * price.priceEur, priceSource: price.source };
    }
    if (row.quoteEur != null && row.quoteEur > 0) {
      return { ...row, priceEur: row.quoteEur, valueEur: row.balance * row.quoteEur, priceSource: row.quoteSource ?? `${row.source}:provider-price` };
    }
    return { ...row, priceEur: null, valueEur: null, priceSource: null };
  }));
}

async function pricedRows(rows: RawCexRow[], stockCache?: StockPriceCache): Promise<Array<RawCexRow & { priceEur: number | null; valueEur: number | null; priceSource: string | null }>> {
  return priceCexRowsForTest(rows, { priceStockSymbolEur: (s) => priceStockSymbolEur(s, stockCache), priceSymbolEur });
}

export async function cexPlugin(app: FastifyInstance, deps: CexPluginDeps) {
  const { prisma } = deps;
  const stockPriceCache = toStockPriceCache(deps.sharedCache);

  app.get("/api/cex/accounts", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const accounts = await prisma.cexAccount.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
      include: { holdings: { orderBy: [{ provider: "asc" }, { bucket: "asc" }, { symbol: "asc" }] } },
    });
    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        provider: account.provider,
        label: account.label,
        lastSyncAt: account.lastSyncAt,
        lastSyncStatus: account.lastSyncStatus,
        lastSyncError: account.lastSyncError,
        holdings: account.holdings.map((h) => ({ id: h.id, symbol: h.symbol, bucket: h.bucket, balance: h.balance, priceEur: h.priceEur, valueEur: h.valueEur, source: h.source, updatedAt: h.updatedAt })),
      })),
    };
  });

  app.post("/api/cex/accounts", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const parsed = CexAccountBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.issues[0]?.message ?? "invalid body" });
    const body = parsed.data;
    // Bitpanda needs apiKey only. OKX additionally requires a passphrase.
    const credentials = body.provider === "okx"
      ? (body.apiKey && body.apiSecret && body.apiPassphrase ? { apiKey: body.apiKey, apiSecret: body.apiSecret, apiPassphrase: body.apiPassphrase } satisfies OkxCredentials : null)
      : (body.provider === "binance" || body.provider === "bitfinex" || body.provider === "bybit" || body.provider === "coinbase")
      ? (body.apiKey && body.apiSecret ? { apiKey: body.apiKey, apiSecret: body.apiSecret } satisfies BinanceCredentials : null)
      : (body.apiKey ? { apiKey: body.apiKey } satisfies BitpandaCredentials : null);
    if (!credentials) return reply.code(400).send({ error: "missing_credentials" });
    const account = await prisma.cexAccount.upsert({
      where: { userId_provider: { userId: req.user.id, provider: body.provider } },
      create: { userId: req.user.id, provider: body.provider, label: body.label ?? null, encryptedCredentials: encryptJson(credentials), lastSyncStatus: "configured" },
      update: { label: body.label ?? null, encryptedCredentials: encryptJson(credentials), lastSyncStatus: "configured", lastSyncError: null },
      select: { id: true, provider: true, label: true, lastSyncStatus: true },
    });
    return { account };
  });

  app.delete("/api/cex/accounts/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = CexAccountParamsSchema.parse(req.params);
    const account = await prisma.cexAccount.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!account || account.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    await prisma.cexAccount.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/api/cex/accounts/:id/sync", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = CexAccountParamsSchema.parse(req.params);
    const account = await prisma.cexAccount.findUnique({ where: { id } });
    if (!account || account.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    try {
      const rows = account.provider === "binance"
        ? await fetchBinanceRows(decryptJson<BinanceCredentials>(account.encryptedCredentials))
        : account.provider === "bybit"
        ? await fetchBybitRows(decryptJson<BybitCredentials>(account.encryptedCredentials))
        : account.provider === "coinbase"
        ? await fetchCoinbaseRows(decryptJson<CoinbaseCredentials>(account.encryptedCredentials))
        : account.provider === "okx"
        ? await fetchOkxRows(decryptJson<OkxCredentials>(account.encryptedCredentials))
        : account.provider === "bitfinex"
        ? await fetchBitfinexRows(decryptJson<BitfinexCredentials>(account.encryptedCredentials))
        : await fetchBitpandaRows(decryptJson<BitpandaCredentials>(account.encryptedCredentials));
      const holdings = await pricedRows(rows, stockPriceCache);
      const writes: Prisma.PrismaPromise<unknown>[] = [
        prisma.cexHolding.deleteMany({ where: { accountId: account.id } }),
      ];
      if (holdings.length > 0) {
        writes.push(prisma.cexHolding.createMany({
          data: holdings.map((h) => ({ accountId: account.id, provider: account.provider, symbol: h.symbol, bucket: h.bucket, balance: h.balance, priceEur: h.priceEur, valueEur: h.valueEur, source: h.priceSource ? `${h.source}:${h.priceSource}` : h.source })),
        }));
      }
      writes.push(prisma.cexAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncError: null } }));
      await prisma.$transaction(writes);
      return { ok: true, rows: holdings.length, totalEur: holdings.reduce((sum, h) => sum + (h.valueEur ?? 0), 0) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.cexAccount.update({ where: { id: account.id }, data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message.slice(0, 500) } }).catch(() => {});
      return reply.code(502).send({ error: "sync_failed", message });
    }
  });
}
