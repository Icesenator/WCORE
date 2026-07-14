import type { FastifyInstance } from "fastify";
import { getDeFiPositionMetadata, withLiquiditySuffix, type CacheStore } from "@wcore/core";

export interface GsheetFxTelemetry {
  rate: number;
  ts: number;
  sources: string[];
  runtime: "gsheet" | "web";
}

export interface GsheetCryptoPortfolioRow {
  canonicalSymbol: string;
  rank: number | null;
  name: string;
  priceEur: number | null;
  marketCapEur: number | null;
}

export interface GsheetCryptoPortfolioSnapshot {
  ok: true;
  generatedAt: string;
  rows: GsheetCryptoPortfolioRow[];
  stats: { ranked: number; unpriced: number };
}

export interface GsheetPluginOptions {
  token: string;
  cacheStore: { get: (key: string) => Promise<string | null> };
  cache?: CacheStore;
  priceBatcher?: (input: GsheetPriceBatchInput) => Promise<GsheetPriceBatchResult>;
  scanRunner?: (input: GsheetScanInput) => Promise<GsheetScanResult>;
  cacheWriter?: {
    set: (key: string, value: unknown, ttlMs: number) => Promise<unknown>;
    get: (key: string) => Promise<unknown>;
  };
  chainbaseStakingProvider?: (address: string) => Promise<unknown>;
  stockPortfolioProvider?: (opts: { fresh: boolean }) => Promise<GsheetStockPortfolioSnapshot>;
  cryptoPortfolioProvider?: (opts: { fresh: boolean }) => Promise<GsheetCryptoPortfolioSnapshot>;
}

export interface GsheetPriceBatchInput {
  chain: string;
  tokens: string[];
}

export interface GsheetPriceRecord {
  priceEur: number | null;
  priceUsd: number | null;
  source: string | null;
}

export interface GsheetPriceBatchResult {
  fxRate: number;
  prices: Record<string, GsheetPriceRecord>;
}

export interface GsheetScanInput {
  address: string;
  chain: string;
  forceRefresh: boolean;
  strictTokens: boolean;
  customTokens: string[];
}

export interface GsheetScanResult {
  ok: true;
  chain: string;
  chainName: string;
  vm: string;
  timestamp: string;
  native: unknown;
  tokens: unknown[];
  totalValueEur: number;
  errors: string[];
  degraded: boolean;
  fxRate: number;
  scanMs: number;
  cacheStats?: unknown;
  chainbaseStaking?: unknown;
  wallet?: string;
}

export interface GsheetStockPortfolioRow {
  canonicalTicker: string;
  sourceTicker: string | null;
  yahooTicker: string | null;
  bitpandaSymbol: string | null;
  bitpandaAliases: string[];
  rank: number | null;
  company: string;
  country: string | null;
  priceNative: number | null;
  currency: string | null;
  priceEur: number | null;
  marketCapUsd: number | null;
  marketCapEur: number | null;
  supply: number | null;
  heldQuantity: number;
  heldValueEur: number | null;
  unitsPerReceipt: number;
  priceSource: string | null;
  fallbackSource: string | null;
  priceStale: boolean;
  holdingStale: boolean;
  updatedAt: string;
  errors: Array<{ code: string; message: string }>;
}

export interface GsheetStockPortfolioSnapshot {
  ok: true;
  generatedAt: string;
  ownerAddress: string;
  dynamicLimit: number;
  holdingsStale: boolean;
  rows: GsheetStockPortfolioRow[];
  stats: {
    ranked: number;
    held: number;
    heldOutsideRankedUniverse: number;
    pricedFresh: number;
    pricedStale: number;
    unpriced: number;
  };
}

const GSHEET_SCAN_PRICE_REPAIR_LIMIT = Math.max(0, Math.floor(Number(process.env.GSHEET_SCAN_PRICE_REPAIR_LIMIT) || 24));
const GSHEET_PRICE_BATCH_CONCURRENCY = Math.max(1, Math.floor(Number(process.env.GSHEET_PRICE_BATCH_CONCURRENCY) || 3));

const GSHEET_WALLET_LABELS: Record<string, string> = {
  "0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7": "Layer3 Wallet",
  "0x17d518736ee9341dcdc0a2498e013d33cfcdd080": "Ledger",
  "0xd5b0dbd75056a30411be789775e40664ec858e51": "Binance Web3 Wallet",
  "0x09875c42713f9525384afb83f95c2858d1cbccc4": "Smart Wallet",
  "0xe39c0d6439a71d2bddfdeee94420601cdf8fd22d": "Ethos",
  "0x6f6d5c6ecf999d330ef942b9288089b7746f0b60": "SafePal",
  "0xe9c01999dee7562c07a048ffe5c866dc1f337569": "Startale",
  "0x9eb34b670f79491329f71080717edf071ff5353f": "UniSwap",
  "0x18bbec24e4ff9c43d538121528c08a88cacd4e4c": "Warpcast",
  "9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5": "Layer3",
  "AxU68jEGjXMj3YGRPSPVXg4qpYmUWhoBUfsbuhrFyDe4": "Ledger",
  "GWLCYszJB8H5Pe3nYw6uoFTApoAqP9P7uzgTmbFm4Nqk": "Seeker",
};

export async function mapWithConcurrencyLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit | 0), items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function tokenNumberField(obj: unknown, key: string): number | null {
  const value = (obj as Record<string, unknown> | undefined)?.[key];
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// v0.3.x: WCT Stake dynamic liquidity status — setWCTStakeLockStatusFetcher allows
// tests to inject a fake fetcher. The production fetcher is set by the API server
// startup via injectWCTStakeLockStatusFetcher() and uses the dynamic lockUntil query.
type LiquidityStatus = "flex" | "lock" | "unknown";
type RpcLike = { ethCall: (endpoint: string, contract: string, data: string) => Promise<string> };
type WCTStakeFetcher = (userAddress: string, rpc: RpcLike, endpoint: string) => Promise<LiquidityStatus> | LiquidityStatus;

let wctStakeFetcher: WCTStakeFetcher | null = null;
const wctStakeStatusCache = new Map<string, LiquidityStatus>();

export function injectWCTStakeLockStatusFetcher(fetcher: WCTStakeFetcher): void {
  wctStakeFetcher = fetcher;
}

// Test-only override: lets unit tests provide a fake RPC stub + fetcher without
// requiring the @wcore/core helpers to be loaded.
export function setWCTStakeLockStatusFetcher(fetcher: WCTStakeFetcher | null, _rpc?: RpcLike | null): void {
  wctStakeFetcher = fetcher;
  wctStakeStatusCache.clear();
}

// Production: query the WCT Stake contract for the user's lockUntil timestamp and
// return flex when the lock has expired. Caches the result per (chain, address) to
// avoid duplicate RPC calls within a scan.
export async function precomputeWCTStakeLockStatus(
  chain: string,
  userAddress: string | undefined,
): Promise<void> {
  if (chain !== "OPTIMISM") return;
  if (!userAddress) return;
  if (!wctStakeFetcher) return;
  const cacheKey = `${chain}:${userAddress.toLowerCase()}`;
  if (wctStakeStatusCache.has(cacheKey)) return;
  try {
    const endpoints = await getOptimismRpcEndpoints();
    if (endpoints.length === 0) {
      wctStakeStatusCache.set(cacheKey, "flex");
      return;
    }
    const rpc: RpcLike = {
      ethCall: async (endpoint, to, data) => {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
        });
        if (!r.ok) throw new Error(`HTTP_${r.status}`);
        const j = (await r.json()) as { error?: { message: string }; result?: string };
        if (j.error) throw new Error(j.error.message);
        return j.result || "0x";
      },
    };
    const result = await wctStakeFetcher(userAddress, rpc, endpoints[0]!);
    wctStakeStatusCache.set(cacheKey, result || "flex");
  } catch {
    wctStakeStatusCache.set(cacheKey, "flex");
  }
}

let cachedOptimismEndpoints: string[] | null = null;
async function getOptimismRpcEndpoints(): Promise<string[]> {
  if (cachedOptimismEndpoints) return cachedOptimismEndpoints;
  try {
    const core = await import("@wcore/core");
    cachedOptimismEndpoints = core.getRpcEndpoints("OPTIMISM");
  } catch {
    cachedOptimismEndpoints = [];
  }
  return cachedOptimismEndpoints;
}

function unwrapAddressLike(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "address" in value) {
    const inner = (value as Record<string, unknown>).address;
    if (typeof inner === "string") return inner;
  }
  return undefined;
}
// The underlying tokens (DAYS, SWEET, WCT) have no DefiLlama coverage, so their
// price comes from DexScreener/GT during the same scan. This post-scan step
// mirrors the underlying's priced value onto the staked variant so both rows
// display consistent totals without inventing a new price feed.
const STAKED_PRICE_MIRRORS: Record<string, Record<string, { underlying: string; symbol: string; negate?: boolean }>> = {
  BASE: {
    "0x8a337e3f2b63e869b085354ce28dd5902a5db038": { underlying: "0xb58372a5bb18e10229e680d8bcc4201ca3c98301", symbol: "DAYS" }, // SDAYS
    "0x9ebe195d685f90b9be3449fe0628af20e15f729b": { underlying: "0x8da2a47f76d928a97a8f44498db25aa787198087", symbol: "SWEET" }, // SSWEET
  },
  OPTIMISM: {
    "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf": { underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945", symbol: "WCT" }, // WCT Claimable
    "0x521b4c065bbdbe3e20b3727340730936912dfa46": { underlying: "0xef4461891dfb3ac8572ccf7c794664a8dd927945", symbol: "WCT" }, // WCT Stake
    "0xe36a30d249f7761327fd973001a32010b521b6fd": { underlying: "native", symbol: "ETH", negate: true },
    "0xe36a30d249f7761327fd973001a32010b521b6fd|comp wrseth": { underlying: "native", symbol: "wrsETH" },
  },
};

export function applyStakedPriceMirrors(result: GsheetScanResult): GsheetScanResult {
  const chain = String(result.chain || "").toUpperCase();
  const mirrors = STAKED_PRICE_MIRRORS[chain];
  const tokens = Array.isArray(result.tokens) ? result.tokens : [];
  if (!mirrors && tokens.every((token) => !getDeFiPositionMetadata(chain, String((token as Record<string, unknown>).contract || ""), String((token as Record<string, unknown>).symbol || "")))) return result;
  const chainMirrors = mirrors ?? {};

  // v0.3.x: For Compound V3 collateral positions, the engine returns the Comet contract
  // (call target) but the cToken address as balanceSelectorExtraArgs[0]. The Sheet must
  // display the cToken contract for the user; the Comet stays in defi for the call.
  const userAddress = unwrapAddressLike((result as unknown as Record<string, unknown>).wallet) ?? unwrapAddressLike((result as unknown as Record<string, unknown>).address);
  const priceByContract = new Map<string, { priceEur: number; valueEur: number | null; source: string | null }>();
  for (const t of tokens) {
    const contract = String((t as Record<string, unknown>).contract || "").toLowerCase();
    if (!contract) continue;
    const priceEur = tokenNumberField(t, "priceEur");
    if (priceEur == null || priceEur <= 0) continue;
    const valueEur = tokenNumberField(t, "valueEur");
    const source = (t as Record<string, unknown>).source != null ? String((t as Record<string, unknown>).source) : null;
    priceByContract.set(contract, { priceEur, valueEur, source });
  }
  const nativePrice = tokenNumberField(result.native, "priceEur");
  function metadataForToken(token: unknown) {
    const rec = token as Record<string, unknown>;
    return getDeFiPositionMetadata(chain, String(rec.contract || ""), String(rec.symbol || ""));
  }
  const updated = tokens.map((t) => {
    const contract = String((t as Record<string, unknown>).contract || "").toLowerCase();
    const sym = String((t as Record<string, unknown>).symbol || "").toLowerCase();
    const meta = metadataForToken(t);
    // v0.3.x: on-chain discovered positions (e.g. Compound V3 cTokens) carry their
    // own liquidityStatus / type / underlying on the token.defi object. Build a synthetic
    // meta so the suffix + pricing logic works without a registry entry.
    const tokenDefi = (t as Record<string, unknown>).defi as
      | { type?: "lending_collateral" | "lending_debt" | "staking_locked" | "claimable" | "liquid_staking" | "vault_share" | "real_world_asset" | "wallet_token" | "unknown_defi"; liquidityStatus?: "flex" | "lock" | "unknown"; underlying?: string }
      | undefined;
    let tokenLiqStatus = (t as Record<string, unknown>).liquidityStatus as string | undefined ?? tokenDefi?.liquidityStatus;
    // v0.3.x: WCT Stake lockUntil query for dynamic [Lock] → [Flex] transition.
    if (sym === "wct stake" && contract === "0x521b4c065bbdbe3e20b3727340730936912dfa46" && userAddress) {
      const dynamic = wctStakeStatusCache.get(`OPTIMISM:${userAddress.toLowerCase()}`);
      if (dynamic) tokenLiqStatus = dynamic;
    }
    const effectiveMeta = meta ?? (tokenLiqStatus ? { type: (tokenDefi?.type ?? "lending_collateral") as "lending_collateral", liquidityStatus: tokenLiqStatus as "flex" | "lock" | "unknown" } : undefined);
    // Symbol-specific variants must win when one contract exposes multiple positions.
    let mirror = chainMirrors[`${contract}|${sym}`];
    if (!mirror) mirror = chainMirrors[contract];
    const registryPricing = meta?.pricing;
    const registryUnderlying = meta?.underlying;
    if (!mirror && registryPricing && registryUnderlying) {
      mirror = {
        underlying: registryUnderlying,
        symbol: registryUnderlying === "native" ? String((result.native as Record<string, unknown> | undefined)?.symbol || "native") : registryUnderlying,
        negate: registryPricing.sign === "debt",
      };
    }
    // v0.3.x: For Compound V3 collateral positions, the displayed contract must
    // be the cToken (in balanceSelectorExtraArgs[0]), not the Comet call target.
    const extraArgs = (t as Record<string, unknown>).balanceSelectorExtraArgs as string[] | undefined;
    let displayToken: Record<string, unknown> = t as Record<string, unknown>;
    if (
      chain === "OPTIMISM" &&
      sym.startsWith("comp ") &&
      !sym.includes("borrow") &&
      Array.isArray(extraArgs) &&
      extraArgs.length >= 1 &&
      typeof extraArgs[0] === "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(extraArgs[0])
    ) {
      const cTokenAddress = "0x" + extraArgs[0]!.slice(-40);
      displayToken = { ...displayToken, contract: cTokenAddress.toLowerCase() };
    }
    if (!mirror && effectiveMeta) {
      const originalName = String((t as Record<string, unknown>).name || "");
      return { ...displayToken, name: withLiquiditySuffix(originalName, { ...effectiveMeta, liquidityStatus: (tokenLiqStatus as LiquidityStatus) ?? effectiveMeta.liquidityStatus }) };
    }
    if (!mirror) return displayToken;
    let underlyingPriced: { priceEur: number; valueEur: number | null; source: string | null } | undefined;
    if (mirror.underlying === "native") {
      const nativePrice = tokenNumberField(result.native, "priceEur");
      if (nativePrice != null && nativePrice > 0) {
        underlyingPriced = { priceEur: nativePrice, valueEur: null, source: "native" };
      }
    } else {
      underlyingPriced = priceByContract.get(mirror.underlying.toLowerCase());
    }
    if (!underlyingPriced) {
      if (effectiveMeta) {
        const originalName = String((t as Record<string, unknown>).name || "");
        return { ...displayToken, name: withLiquiditySuffix(originalName, { ...effectiveMeta, liquidityStatus: (tokenLiqStatus as LiquidityStatus) ?? effectiveMeta.liquidityStatus }) };
      }
      return displayToken;
    }
    const rawBalance = tokenNumberField(t, "balance") ?? 0;
    const negate = !!mirror.negate;
    const displayBalance = negate ? -rawBalance : rawBalance;
    const newValue = rawBalance > 0 ? roundMoney(rawBalance * underlyingPriced.priceEur) : null;
    const displayValue = negate && newValue != null ? -newValue : newValue;
    const originalName = String((t as Record<string, unknown>).name || "");
    const name = effectiveMeta ? withLiquiditySuffix(originalName, { ...effectiveMeta, liquidityStatus: (tokenLiqStatus as LiquidityStatus) ?? effectiveMeta.liquidityStatus }) : originalName;
    const sourceLabel = `staked-mirror:${mirror.symbol}` + (negate ? " (debt)" : "");
    return { ...displayToken, name, balance: displayBalance, priceEur: underlyingPriced.priceEur, valueEur: displayValue, source: sourceLabel };
  });
  const tokenValue = updated.reduce<number>((sum, t) => sum + (tokenNumberField(t, "valueEur") ?? 0), 0);
  const nativeValue = tokenNumberField(result.native, "valueEur") ?? 0;
  return { ...result, tokens: updated, totalValueEur: roundMoney(nativeValue + tokenValue) };
}

function tokenStringField(obj: unknown, key: string): string {
  const value = (obj as Record<string, unknown> | undefined)?.[key];
  return value == null ? "" : String(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function labelGsheetWalletScan(result: GsheetScanResult, address: string): GsheetScanResult {
  const rawAddress = String(address || "").trim();
  const wallet = GSHEET_WALLET_LABELS[rawAddress] || GSHEET_WALLET_LABELS[rawAddress.toLowerCase()];
  if (!wallet) return result;
  const chainName = String(result.chainName || result.chain || "").trim();
  if (!chainName || chainName.toLowerCase().startsWith(`${wallet.toLowerCase()} - `)) return result;
  return { ...result, chainName: `${wallet} - ${chainName}` };
}

function isNonPortfolioGsheetToken(token: unknown, protectedContracts?: Set<string>): boolean {
  const id = gsheetTokenId(token).toLowerCase();
  if (id && protectedContracts?.has(id)) return false;

  const standard = ["type", "tokenType", "standard", "interface", "assetType"]
    .map((key) => tokenStringField(token, key).toLowerCase())
    .join(" ");
  if (/erc\s*-?\s*(721|1155)|\bnft\b|non[-_\s]?fungible|\bsbt\b|soulbound/.test(standard)) return true;

  const balance = tokenNumberField(token, "balance") ?? 0;
  const decimals = tokenNumberField(token, "decimals");
  const priceEur = tokenNumberField(token, "priceEur") ?? 0;
  const valueEur = tokenNumberField(token, "valueEur") ?? 0;
  if (decimals === 0 && balance > 0 && Number.isInteger(balance) && priceEur <= 0 && valueEur <= 0) return true;

  const symbol = tokenStringField(token, "symbol");
  const name = tokenStringField(token, "name");
  const text = `${symbol} ${name}`.toLowerCase();
  if (!text.trim()) return false;

  return /\bnft\b|\bonft\b|\bsbt\b|badge|score|reputation|\bpin\b|\bcard\b|name service|\.scroll\b|scroll hunter|scroll pro hunter|originscroll|hypatlas|layer3\s*cube|nomis|score\b|galxe|rhino\.fi|alpha key|early bird|scrollien|monochrome wings|fantastical tiefling|glitch girl|myster|anubis|chimp|homocryptus|deesscroll|pinksale|stellaire|n2m|atlas|atari|gmcards|cosmic surprise|cosmic\b|volcra|lair cards|celestial spire|intergalactic|zodiac|space mission|stellaire|nomiss|gate\b|gatequest|homo cryptus|c28|cwn\b|cwn scroll|layer zero expedition|scroll name service|zns|stellaire|tiefling|hunter\b|dragonpark|defusion|soul drops|soul\b|test token|test\b|testnft|testtoken|lz\bnft|\blznft/.test(text);
}

// "No market" = token has zero on-chain price AND no DEX/CoinGecko/DefiLlama coverage.
// These tokens typically have $0 24h volume, no GeckoTerminal pools, and no CoinGecko listing,
// so any "price" would be a fabrication. Filtered (not priced) to avoid phantom totals.
// Always skipped for explicitly protected contracts (custom tokens, I2:I, admin approved)
// and for whitelisted known tokens (xGRAIL, aRUSDC, etc.) that the pricing cascade treats as such.
function isNoMarketToken(token: unknown, protectedContracts?: Set<string>, knownTokens?: Set<string>): boolean {
  const id = gsheetTokenId(token).toLowerCase();
  if (id && protectedContracts?.has(id)) return false;
  if (id && knownTokens?.has(id)) return false;
  const priceEur = tokenNumberField(token, "priceEur");
  if (priceEur == null) return true;
  if (!Number.isFinite(priceEur) || priceEur <= 0) return true;
  return false;
}

function isAbsurdGsheetPrice(token: unknown): boolean {
  const priceEur = tokenNumberField(token, "priceEur");
  const valueEur = tokenNumberField(token, "valueEur");
  const symbol = tokenStringField(token, "symbol").toUpperCase();
  const trustedLargeValueSymbols = new Set(["ETH", "WETH", "USDC", "USDT", "DAI", "WBTC", "BTC", "SOL", "BNB", "LINK", "AAVE", "UNI", "OP", "ARB", "SOLVBTC", "CBBTC", "BTCB"]);
  if (priceEur != null && (!Number.isFinite(priceEur) || priceEur > 1_000_000_000)) return true;
  if (valueEur != null && (!Number.isFinite(valueEur) || valueEur > 1_000_000_000)) return true;
  if (valueEur != null && priceEur != null && valueEur > 100_000 && priceEur > 1 && !trustedLargeValueSymbols.has(symbol)) return true;
  return false;
}

function gsheetTokenId(token: unknown): string {
  return tokenStringField(token, "contract") || tokenStringField(token, "address") || tokenStringField(token, "mint") || tokenStringField(token, "denom");
}

async function repairMissingGsheetScanPrices(
  result: GsheetScanResult,
  input: GsheetScanInput,
  batcher: (input: GsheetPriceBatchInput) => Promise<GsheetPriceBatchResult>,
): Promise<GsheetScanResult> {
  const tokens = Array.isArray(result.tokens) ? result.tokens : [];
  const missing = tokens
    .map((token) => ({ token, id: gsheetTokenId(token).toLowerCase() }))
    .filter(({ token, id }) => id && (tokenNumberField(token, "balance") ?? 0) > 0 && (tokenNumberField(token, "priceEur") ?? 0) <= 0);
  if (missing.length === 0) return result;

  const repairIds = [...new Set(missing.map((m) => m.id))].slice(0, GSHEET_SCAN_PRICE_REPAIR_LIMIT);
  if (repairIds.length === 0) return result;

  const priceResult = await batcher({ chain: input.chain, tokens: repairIds });
  const repairedSymbols = new Set<string>();
  const repairedTokens = tokens.map((token) => {
    const id = gsheetTokenId(token).toLowerCase();
    const rec = id ? priceResult.prices[id] : undefined;
    if (!rec || typeof rec.priceEur !== "number" || !Number.isFinite(rec.priceEur) || rec.priceEur <= 0) return token;
    const balance = tokenNumberField(token, "balance") ?? 0;
    repairedSymbols.add(tokenStringField(token, "symbol"));
    return {
      ...(token as Record<string, unknown>),
      priceEur: rec.priceEur,
      valueEur: roundMoney(balance * rec.priceEur),
    };
  });
  if (repairedSymbols.size === 0) return result;

  const errors = (Array.isArray(result.errors) ? result.errors : []).filter((err) => {
    const s = String(err || "");
    for (const symbol of repairedSymbols) {
      if (symbol && s === `${symbol} price: NO_PRICE`) return false;
    }
    return true;
  });
  const nativeValue = tokenNumberField(result.native, "valueEur") ?? 0;
  const tokenValue = repairedTokens.reduce<number>((sum, token) => sum + (tokenNumberField(token, "valueEur") ?? 0), 0);
  return { ...result, tokens: repairedTokens, totalValueEur: roundMoney(nativeValue + tokenValue), errors, degraded: errors.length > 0 };
}

async function injectChainbaseStakingTokens(result: GsheetScanResult, address: string, provider?: (address: string) => Promise<unknown>): Promise<GsheetScanResult> {
  if (String(result.chain || "").toUpperCase() !== "BASE") return result;
  try {
    const cb = provider
      ? ((await provider(address)) as Awaited<ReturnType<typeof defaultChainbaseProvider>>)
      : (await defaultChainbaseProvider(address));
    if (cb.locked <= 0 && cb.claimable <= 0) return result;
    const core = await import("@wcore/core");
    const chain = core.getChain(String(result.chain || "BASE"));
    let priceEur: number | null = null;
    if (chain) {
      try {
        const fxRate = await core.getEurUsdRate();
        const priceCache = new core.MemoryPricingCache();
        const sources = core.buildSources(priceCache, chain);
        const priced = await core.priceTokenCascade({
          token: {
            key: `${String(chain.key).toLowerCase()}:${cb.tokenAddress}`,
            contract: cb.tokenAddress,
            symbol: "C",
            chain,
          },
          fxRate,
          cache: priceCache,
          sources,
          allowCoinGeckoTokenFallback: true,
        });
        if (priced.priceEur && priced.priceEur > 0) {
          priceEur = priced.priceEur;
        }
      } catch {
        // C price unavailable, leave priceEur null
      }
    }
    const lockedValue = priceEur ? roundMoney(cb.locked * priceEur) : null;
    const claimableValue = priceEur ? roundMoney(cb.claimable * priceEur) : null;
    const stakingLiquidityStatus = cb.liquidityStatus === "flex" ? "flex" : "lock";
    // Chainbase delegations only become flexible after undelegate() creates a
    // mature undelegateRequests(tokenId). Otherwise they remain locked.
    const lockedName = withLiquiditySuffix("Chainbase Staking", { type: "staking_locked", liquidityStatus: stakingLiquidityStatus });
    const claimableName = withLiquiditySuffix("Chainbase Airdrop", { type: "claimable", liquidityStatus: "flex" });
    const injected = [
      {
        contract: cb.stakingContract,
        symbol: "C-Locked",
        name: lockedName,
        decimals: 18,
        balance: cb.locked,
        priceEur,
        valueEur: lockedValue,
        source: "chainbase_staking",
        chainbaseRole: "locked",
        defi: { protocol: "chainbase-staking", type: "staking_locked", liquidityStatus: stakingLiquidityStatus, confidence: "high" },
      },
      {
        contract: cb.airdropContract,
        symbol: "C-Airdrop",
        name: claimableName,
        decimals: 18,
        balance: cb.claimable,
        priceEur,
        valueEur: claimableValue,
        source: "chainbase_airdrop",
        chainbaseRole: "claimable",
        defi: { protocol: "chainbase-airdrop", type: "claimable", liquidityStatus: "flex", confidence: "high" },
        ...(cb.claimableTxHash ? { claimableTxHash: cb.claimableTxHash } : {}),
        ...(cb.claimableProjectId != null ? { claimableProjectId: cb.claimableProjectId } : {}),
      },
    ];
    const tokens = Array.isArray(result.tokens) ? [...result.tokens, ...injected] : injected;
    return { ...result, tokens, chainbaseStaking: cb };
  } catch (e) {
    return result;
  }
}

type DefaultChainbaseData = {
  stakingContract: string;
  airdropContract: string;
  locked: number;
  claimable: number;
  tokenSymbol?: string;
  tokenAddress?: string;
  claimableTxHash?: string;
  claimableProjectId?: number;
  liquidityStatus?: "lock" | "flex";
  fetchedAt?: string;
};

async function defaultChainbaseProvider(address: string): Promise<DefaultChainbaseData> {
  const { getChainbaseStaking } = await import("./chainbase-staking.js");
  return await getChainbaseStaking(address);
}

async function sanitizeGsheetScanResult(result: GsheetScanResult, fallbackChain: string, customTokens: string[] = []): Promise<GsheetScanResult> {
  const core = await import("@wcore/core");
  let nonFungibleFiltered = 0;
  let noMarketFiltered = 0;
  const filteredSymbols = new Set<string>();
  const noMarketSymbols: string[] = [];
  const protectedContracts = new Set(customTokens.map((token) => token.trim().toLowerCase()).filter(Boolean));
  // Whitelisted symbols (xGRAIL, aRUSDC, etc.) — pass the no-market filter when the scan
  // couldn't resolve a price. We mirror @wcore/shared _KNOWN_TOKENS here so the GSheet adapter
  // doesn't need to call detectScam just to know if a token is whitelisted.
  const knownTokenSymbols = new Set([
    "ETH", "WETH", "USDC", "USDT", "DAI", "WBTC", "SOL", "BNB", "WBNB",
    "AVAX", "WAVAX", "MATIC", "WMATIC", "POL", "ARB", "OP", "LINK",
    "UNI", "AAVE", "CRV", "SNX", "COMP", "MKR", "LDO", "STETH", "RETH",
    "ATOM", "OSMO", "INJ", "SEI", "TIA", "DOT", "NEAR", "FLOW", "SUI", "APT",
    "PEPE", "SHIB", "FLOKI", "DOGE", "BONK", "WIF",
    "SOLVBTC", "CBBTC", "BTCB", "XGRAIL", "ARUSDC", "RSTONE", "LSTONE",
    "WCT", "WCT CLAIMABLE", "WCT STAKE", "COMP WETH BORROW", "COMP WRSETH", "WRSETH",
  ]);
  const knownTokens = new Set<string>();
  const chain = core.getChain(String(result.chain || fallbackChain));
  const chainKnownTokens = chain?.KNOWN_TOKENS;
  const vm = String(result.vm || "").toUpperCase();
  if (vm !== "EVM" && chainKnownTokens && typeof chainKnownTokens === "object") {
    for (const id of Object.keys(chainKnownTokens as Record<string, unknown>)) {
      const normalized = id.trim().toLowerCase();
      if (normalized) knownTokens.add(normalized);
    }
  }
  for (const token of Array.isArray(result.tokens) ? result.tokens : []) {
    const symbol = String(tokenStringField(token, "symbol") || "").toUpperCase();
    if (knownTokenSymbols.has(symbol)) {
      const id = gsheetTokenId(token).toLowerCase();
      if (id) knownTokens.add(id);
    }
  }
  const extraErrors: string[] = [];
  const tokens = (Array.isArray(result.tokens) ? result.tokens : []).filter((token) => {
    const id = gsheetTokenId(token).toLowerCase();
    if (isNonPortfolioGsheetToken(token)) {
      nonFungibleFiltered++;
      const symbol = tokenStringField(token, "symbol");
      if (symbol) filteredSymbols.add(symbol);
      return false;
    }
    if (isNoMarketToken(token, protectedContracts, knownTokens)) {
      noMarketFiltered++;
      const symbol = tokenStringField(token, "symbol");
      if (symbol) noMarketSymbols.push(symbol);
      return false;
    }
    const rec = token as Record<string, unknown> | undefined;
    if (rec?.scam === true || rec?.isScam === true || rec?.isSuspicious === true) {
      const symbol = tokenStringField(token, "symbol");
      if (symbol) filteredSymbols.add(symbol);
      return false;
    }
    if (id && protectedContracts.has(id)) return true;
    try {
      const scam = core.detectScam(
        tokenStringField(token, "symbol"),
        tokenStringField(token, "name"),
        tokenNumberField(token, "balance") ?? 0,
        tokenNumberField(token, "priceEur"),
        tokenStringField(token, "contract") || tokenStringField(token, "address") || tokenStringField(token, "mint") || tokenStringField(token, "denom"),
      );
      if (scam.isSuspicious) {
        const symbol = tokenStringField(token, "symbol");
        if (symbol) filteredSymbols.add(symbol);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  });
  const sanitizedTokens = tokens.map((token) => {
    if (!isAbsurdGsheetPrice(token)) return token;
    const symbol = tokenStringField(token, "symbol") || "TOKEN";
    extraErrors.push(`${symbol} price: ABSURD_PRICE`);
    return { ...(token as Record<string, unknown>), priceEur: null, valueEur: null };
  });
  const nativeValue = tokenNumberField(result.native, "valueEur") ?? 0;
  const tokenValue = sanitizedTokens.reduce<number>((sum, token) => sum + (tokenNumberField(token, "valueEur") ?? 0), 0);
  const errors = (Array.isArray(result.errors) ? result.errors : []).filter((err) => {
    const s = String(err || "");
    for (const symbol of filteredSymbols) {
      if (symbol && s === `${symbol} price: NO_PRICE`) return false;
    }
    for (const symbol of noMarketSymbols) {
      if (symbol && s === `${symbol} price: NO_PRICE`) return false;
    }
    return true;
  });
  for (const err of extraErrors) {
    if (!errors.includes(err)) errors.push(err);
  }
  const cacheStats = typeof result.cacheStats === "object" && result.cacheStats !== null
    ? { ...(result.cacheStats as Record<string, unknown>) }
    : {};
  if (nonFungibleFiltered > 0) cacheStats.nonFungibleFiltered = nonFungibleFiltered;
  if (noMarketFiltered > 0) {
    cacheStats.noMarketFiltered = noMarketFiltered;
    cacheStats.noMarketSymbols = noMarketSymbols;
  }
  return {
    ...result,
    chain: String(result.chain || fallbackChain).toUpperCase(),
    tokens: sanitizedTokens,
    errors,
    degraded: errors.length > 0,
    cacheStats: Object.keys(cacheStats).length > 0 ? cacheStats : result.cacheStats,
    totalValueEur: roundMoney(nativeValue + tokenValue),
  };
}

const FX_TELEMETRY_KEY_WEB = "fx_telemetry:web";
const FX_TELEMETRY_KEY_GSHEET = "fx_telemetry:gsheet";
const FX_TELEMETRY_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const FX_DRIFT_TOLERANCE = 0.02; // 2% between web and gsheet
const FX_DRIFT_ALERT = 0.05; // 5% = hard alert
const EVM_CONTRACT_RE = /^0x[0-9a-f]{40}$/;

function normalizeGsheetPriceRequest(body: unknown): { ok: true; chain: string; tokens: string[] } | { ok: false; error: string } {
  const b = body as { chain?: unknown; tokens?: unknown } | undefined;
  const chain = String(b?.chain || "").trim().toUpperCase();
  if (!chain) return { ok: false, error: "missing_chain" };
  if (!Array.isArray(b?.tokens)) return { ok: false, error: "missing_tokens" };
  const seen = new Set<string>();
  for (const raw of b.tokens) {
    const token = String(raw || "").trim().toLowerCase();
    if (!EVM_CONTRACT_RE.test(token)) return { ok: false, error: "invalid_tokens" };
    seen.add(token);
    if (seen.size > 100) return { ok: false, error: "too_many_tokens" };
  }
  return { ok: true, chain, tokens: [...seen] };
}

function normalizeGsheetScanRequest(body: unknown): { ok: true; input: GsheetScanInput } | { ok: false; error: string } {
  const b = body as { address?: unknown; chain?: unknown; forceRefresh?: unknown; strictTokens?: unknown; customTokens?: unknown } | undefined;
  const address = String(b?.address || "").trim();
  if (!address) return { ok: false, error: "missing_address" };
  const chain = String(b?.chain || "").trim().toUpperCase();
  if (!chain) return { ok: false, error: "missing_chain" };

  const customTokens: string[] = [];
  if (b?.customTokens !== undefined) {
    if (!Array.isArray(b.customTokens)) return { ok: false, error: "invalid_custom_tokens" };
    const seen = new Set<string>();
    for (const raw of b.customTokens) {
      const token = String(raw || "").trim();
      if (!token) continue;
      if (token.length > 256) return { ok: false, error: "invalid_custom_tokens" };
      const key = token.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        customTokens.push(token);
      }
      if (customTokens.length > 200) return { ok: false, error: "too_many_custom_tokens" };
    }
  }

  return {
    ok: true,
    input: {
      address,
      chain,
      forceRefresh: b?.forceRefresh === true,
      strictTokens: b?.strictTokens === true,
      customTokens,
    },
  };
}

async function defaultPriceBatcher(input: GsheetPriceBatchInput, cache?: CacheStore): Promise<GsheetPriceBatchResult> {
  const core = await import("@wcore/core");
  const chain = core.getChain(input.chain);
  if (!chain) throw new Error("chain_not_found");
  const fxRate = await core.getEurUsdRate();
  const priceCache = cache ? new core.RedisPricingCache(cache) : new core.MemoryPricingCache();
  const sources = core.buildSources(priceCache, chain, cache);
  const prices: Record<string, GsheetPriceRecord> = {};
  await mapWithConcurrencyLimit(input.tokens, GSHEET_PRICE_BATCH_CONCURRENCY, async (token) => {
    const priced = await core.priceTokenCascade({
      token: {
        key: `${String(chain.key).toLowerCase()}:${token}`,
        chain,
        contract: token,
      },
      fxRate,
      cache: priceCache,
      sources,
      allowCoinGeckoTokenFallback: true,
    });
    prices[token] = {
      priceEur: priced.priceEur,
      priceUsd: priced.priceUsd,
      source: priced.source,
    };
  });
  return { fxRate, prices };
}

async function defaultScanRunner(input: GsheetScanInput, cache?: CacheStore): Promise<GsheetScanResult> {
  const core = await import("@wcore/core");
  const chain = core.getChain(input.chain);
  if (!chain) throw new Error("chain_not_found");
  const fxRate = await core.getEurUsdRate();
  const pricingCache = cache ? new core.RedisPricingCache(cache) : undefined;
  const assets = await core.getWalletAssets(input.address, input.chain, {
    cache,
    sharedPriceCache: pricingCache,
    customTokens: input.customTokens,
    strictTokens: input.strictTokens,
    forceRefresh: input.forceRefresh,
    fxRate,
  });
  const errors = Array.isArray(assets.errors) ? assets.errors.map(String) : [];

  return {
    ok: true,
    chain: String(assets.chain || input.chain).toUpperCase(),
    chainName: String(assets.chainName || chain.name || input.chain),
    vm: String(chain.vm || ""),
    timestamp: new Date().toISOString(),
    native: assets.native,
    tokens: Array.isArray(assets.tokens) ? assets.tokens : [],
    totalValueEur: Number(assets.totalValueEur || 0),
    errors,
    degraded: errors.length > 0,
    fxRate,
    scanMs: Number(assets.scanMs || 0),
    cacheStats: assets.cacheStats,
  };
}

export async function gsheetPlugin(app: FastifyInstance, opts: GsheetPluginOptions) {
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url || !req.url.startsWith("/api/gsheet/")) return;
    const header = req.headers["x-gsheet-token"];
    if (header !== opts.token) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/api/gsheet/cache/get", async (req, reply) => {
    const { key } = req.query as { key?: string };
    if (!key) return reply.code(400).send({ error: "missing_key" });
    const value = await opts.cacheStore.get(key);
    return { found: value !== null, value };
  });

  app.get("/api/gsheet/stocks/portfolio", async (req, reply) => {
    const fresh = String(req.query?.fresh || "") === "true";
    if (!opts.stockPortfolioProvider) return reply.code(503).send({ error: "stock_portfolio_unavailable" });
    try {
      return await opts.stockPortfolioProvider({ fresh });
    } catch (e) {
      app.log.warn({ err: e instanceof Error ? e.message : String(e) }, "gsheet stock portfolio failed");
      return reply.code(503).send({ error: "stock_portfolio_unavailable" });
    }
  });

  app.get("/api/gsheet/crypto/portfolio", async (req, reply) => {
    const fresh = String(req.query?.fresh || "") === "true";
    if (!opts.cryptoPortfolioProvider) return reply.code(503).send({ error: "crypto_portfolio_unavailable" });
    try {
      return await opts.cryptoPortfolioProvider({ fresh });
    } catch (e) {
      app.log.warn({ err: e instanceof Error ? e.message : String(e) }, "gsheet crypto portfolio failed");
      return reply.code(503).send({ error: "crypto_portfolio_unavailable" });
    }
  });

  app.post("/api/gsheet/prices", async (req, reply) => {
    const parsed = normalizeGsheetPriceRequest(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    try {
      const batcher = opts.priceBatcher || ((input: GsheetPriceBatchInput) => defaultPriceBatcher(input, opts.cache));
      const result = await batcher({ chain: parsed.chain, tokens: parsed.tokens });
      const prices: Record<string, GsheetPriceRecord> = {};
      const missing: string[] = [];
      for (const token of parsed.tokens) {
        const rec = result.prices[token];
        if (rec && typeof rec.priceEur === "number" && Number.isFinite(rec.priceEur) && rec.priceEur > 0) {
          prices[token] = rec;
        } else {
          missing.push(token);
        }
      }
      return { ok: true, chain: parsed.chain, fxRate: result.fxRate, prices, missing };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "chain_not_found") return reply.code(404).send({ error: "chain_not_found" });
      app.log.warn({ err: message, chain: parsed.chain, count: parsed.tokens.length }, "gsheet price batch failed");
      return reply.code(503).send({ error: "price_batch_failed" });
    }
  });

  app.post("/api/gsheet/scan", async (req, reply) => {
    const parsed = normalizeGsheetScanRequest(req.body);
    if (!parsed.ok) return reply.code(400).send({ error: parsed.error });
    try {
      const runner = opts.scanRunner || ((input: GsheetScanInput) => defaultScanRunner(input, opts.cache));
      const priceBatcher = opts.priceBatcher || ((input: GsheetPriceBatchInput) => defaultPriceBatcher(input, opts.cache));
      const result = await runner(parsed.input);
      const repaired = await repairMissingGsheetScanPrices(result, parsed.input, priceBatcher);
      // v0.3.x: WCT Stake dynamic [Lock] → [Flex] determination via lockUntil query.
      await precomputeWCTStakeLockStatus(parsed.input.chain, parsed.input.address);
      const mirrored = applyStakedPriceMirrors(repaired);
      const sanitized = await sanitizeGsheetScanResult(mirrored, parsed.input.chain, parsed.input.customTokens);
      const labeled = labelGsheetWalletScan(sanitized, parsed.input.address);
      return injectChainbaseStakingTokens(labeled, parsed.input.address, opts.chainbaseStakingProvider);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "chain_not_found") return reply.code(404).send({ error: "chain_not_found" });
      // v0.3.x: instead of 503 (which causes GSheet to display the generic
      // [WEB_SCAN_ERROR] fallback), return a degraded 200 response with the
      // error captured. The GSheet side will log the error and the user can
      // still see the chain name + error message in the cells (the discoverer
      // errors are written to the errors[] array, which the GSheet surface
      // surfaces in the scan diagnostics).
      app.log.warn({ err: message, chain: parsed.input.chain }, "gsheet scan failed");
      return {
        ok: true,
        chain: String(parsed.input.chain || "").toUpperCase(),
        chainName: String(parsed.input.chain || ""),
        vm: "",
        timestamp: new Date().toISOString(),
        native: { symbol: "N/A", balance: 0, priceEur: null, valueEur: null },
        tokens: [],
        totalValueEur: 0,
        errors: [`[WEB_SCAN_ERROR] ${message} chain=${parsed.input.chain}`],
        degraded: true,
        fxRate: 0,
        scanMs: 0,
        cacheStats: { hits: 0, misses: 0, stale: 0, skipped: 0 },
      };
    }
  });

  // Gsheet (or any other runtime) posts its current FX rate here for drift
  // detection against the web runtime. Auth via x-gsheet-token.
  app.post("/api/gsheet/fx-telemetry", async (req, reply) => {
    const body = req.body as Partial<GsheetFxTelemetry> | undefined;
    const rate = Number(body?.rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      return reply.code(400).send({ error: "invalid_rate" });
    }
    const telemetry: GsheetFxTelemetry = {
      rate,
      ts: Number(body?.ts) || Date.now(),
      sources: Array.isArray(body?.sources) ? body.sources.map(String) : [],
      runtime: body?.runtime === "web" ? "web" : "gsheet",
    };
    if (!opts.cacheWriter) {
      return reply.code(503).send({ error: "telemetry_disabled" });
    }
    const key = telemetry.runtime === "web" ? FX_TELEMETRY_KEY_WEB : FX_TELEMETRY_KEY_GSHEET;
    await opts.cacheWriter.set(key, telemetry, FX_TELEMETRY_TTL_MS);
    return { ok: true, key };
  });

  // Public drift comparison endpoint — no auth, useful for CI smoke tests.
  // Returns 503 if either runtime hasn't reported yet (cold start).
  app.get("/api/diag/fx-parity", async (_req, reply) => {
    if (!opts.cacheWriter) return reply.code(503).send({ error: "telemetry_disabled" });
    const [web, gsheet] = await Promise.all([
      opts.cacheWriter.get(FX_TELEMETRY_KEY_WEB) as Promise<GsheetFxTelemetry | undefined>,
      opts.cacheWriter.get(FX_TELEMETRY_KEY_GSHEET) as Promise<GsheetFxTelemetry | undefined>,
    ]);
    const now = Date.now();
    const result: {
      ok: boolean;
      now: number;
      web: { rate: number; ts: number; ageMs: number; sources: string[] } | null;
      gsheet: { rate: number; ts: number; ageMs: number; sources: string[] } | null;
      drift: number | null;
      tolerance: number;
      alert: number;
    } = {
      ok: false,
      now,
      web: web ? { rate: web.rate, ts: web.ts, ageMs: now - web.ts, sources: web.sources } : null,
      gsheet: gsheet ? { rate: gsheet.rate, ts: gsheet.ts, ageMs: now - gsheet.ts, sources: gsheet.sources } : null,
      drift: null,
      tolerance: FX_DRIFT_TOLERANCE,
      alert: FX_DRIFT_ALERT,
    };
    if (web && gsheet) {
      const max = Math.max(web.rate, gsheet.rate);
      const min = Math.min(web.rate, gsheet.rate);
      result.drift = (max - min) / max;
      result.ok = result.drift <= FX_DRIFT_TOLERANCE;
    }
    return result;
  });
}
