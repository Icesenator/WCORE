import type { FastifyInstance } from "fastify";
import { getDeFiPositionMetadata, withLiquiditySuffix, type CacheStore } from "@wcore/core";

export interface GsheetFxTelemetry {
  rate: number;
  ts: number;
  sources: string[];
  runtime: "gsheet" | "web";
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
}

const GSHEET_SCAN_PRICE_REPAIR_LIMIT = Math.max(0, Math.floor(Number(process.env.GSHEET_SCAN_PRICE_REPAIR_LIMIT) || 24));
const GSHEET_PRICE_BATCH_CONCURRENCY = Math.max(1, Math.floor(Number(process.env.GSHEET_PRICE_BATCH_CONCURRENCY) || 3));

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

// Staked tokens that share price 1:1 with an underlying token in the same scan.
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
    if (!mirror && meta) {
      const originalName = String((t as Record<string, unknown>).name || "");
      return { ...(t as Record<string, unknown>), name: withLiquiditySuffix(originalName, meta) };
    }
    if (!mirror) return t;
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
      if (meta) {
        const originalName = String((t as Record<string, unknown>).name || "");
        return { ...(t as Record<string, unknown>), name: withLiquiditySuffix(originalName, meta) };
      }
      return t;
    }
    const rawBalance = tokenNumberField(t, "balance") ?? 0;
    const negate = !!mirror.negate;
    const displayBalance = negate ? -rawBalance : rawBalance;
    const newValue = rawBalance > 0 ? roundMoney(rawBalance * underlyingPriced.priceEur) : null;
    const displayValue = negate && newValue != null ? -newValue : newValue;
    const originalName = String((t as Record<string, unknown>).name || "");
    const name = meta ? withLiquiditySuffix(originalName, meta) : originalName;
    const sourceLabel = `staked-mirror:${mirror.symbol}` + (negate ? " (debt)" : "");
    return { ...(t as Record<string, unknown>), name, balance: displayBalance, priceEur: underlyingPriced.priceEur, valueEur: displayValue, source: sourceLabel };
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
    const injected = [
      {
        contract: cb.stakingContract,
        symbol: "C-Locked",
        name: "Chainbase Staking (locked)",
        decimals: 18,
        balance: cb.locked,
        priceEur,
        valueEur: lockedValue,
        source: "chainbase_staking",
        chainbaseRole: "locked",
      },
      {
        contract: cb.airdropContract,
        symbol: "C-Airdrop",
        name: "Chainbase Airdrop (claimable)",
        decimals: 18,
        balance: cb.claimable,
        priceEur,
        valueEur: claimableValue,
        source: "chainbase_airdrop",
        chainbaseRole: "claimable",
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
  if (chainKnownTokens && typeof chainKnownTokens === "object") {
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
  const tokens = (Array.isArray(result.tokens) ? result.tokens : []).filter((token) => {
    // Protected custom tokens (I2:I) bypass every filter: scam, no-market, NFT pattern.
    const id = gsheetTokenId(token).toLowerCase();
    if (id && protectedContracts.has(id)) return true;
    if (isNonPortfolioGsheetToken(token, protectedContracts)) {
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
  const nativeValue = tokenNumberField(result.native, "valueEur") ?? 0;
  const tokenValue = tokens.reduce<number>((sum, token) => sum + (tokenNumberField(token, "valueEur") ?? 0), 0);
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
    tokens,
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
      const mirrored = applyStakedPriceMirrors(repaired);
      const sanitized = await sanitizeGsheetScanResult(mirrored, parsed.input.chain, parsed.input.customTokens);
      return injectChainbaseStakingTokens(sanitized, parsed.input.address, opts.chainbaseStakingProvider);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === "chain_not_found") return reply.code(404).send({ error: "chain_not_found" });
      app.log.warn({ err: message, chain: parsed.input.chain }, "gsheet scan failed");
      return reply.code(503).send({ error: "scan_failed" });
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
