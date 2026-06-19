import type { ChainConfig } from "../../types.js";
import { NEED_ONCHAIN, onchainMarkerKey } from "../markers.js";
import type { PricingCache, PricingToken, SourcePriceLike, TokenPriceSource } from "../types.js";
import { isPositiveFinite, normalizePriceKey } from "../types.js";

export interface OnchainV3RpcCall {
  to: string;
  data: string;
}

export interface OnchainV3Rpc {
  batch(calls: OnchainV3RpcCall[]): Promise<Array<string | null>>;
}

export interface OnchainV3Factory {
  name: string;
  address: string;
}

export interface OnchainV3Spec {
  chainKey: string;
  weth: string;
  usdc: string;
  fees: number[];
  factories: OnchainV3Factory[];
  selectors: {
    getPool: string;
    slot0: string;
    liquidity: string;
    token0: string;
    decimals: string;
  };
}

export interface OnchainV3SourceOptions {
  cache?: PricingCache;
  rpc?: OnchainV3Rpc;
  nativePriceUsd?: () => Promise<number | null> | number | null;
}

interface PoolCandidate {
  addr: string;
  fee: number;
  quote: string;
  quoteDecimals: number;
  quoteLabel: "USDC" | "WETH";
  factory: string;
  liquidity?: bigint;
  token0?: string;
  priceUsd?: number;
}

const SELECTORS = {
  getPool: "0x1698ee82",
  slot0: "0x3850c7bd",
  liquidity: "0x1a686502",
  token0: "0x0dfe1681",
  decimals: "0x313ce567",
} as const;

const ONCHAIN_V3_SPECS: Record<string, Omit<OnchainV3Spec, "fees" | "selectors">> = {
  "8453": {
    chainKey: "base",
    weth: "0x4200000000000000000000000000000000000006",
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    factories: [
      { name: "uniswap-v3", address: "0x33128a8fc17869897dce68ed026d694621f6fdfd" },
      { name: "aerodrome-slipstream", address: "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a" },
    ],
  },
  "1": {
    chainKey: "ethereum",
    weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    factories: [{ name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }],
  },
  "42161": {
    chainKey: "arbitrum",
    weth: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    factories: [{ name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }],
  },
  "10": {
    chainKey: "optimism",
    weth: "0x4200000000000000000000000000000000000006",
    usdc: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    factories: [{ name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }],
  },
  "137": {
    chainKey: "polygon",
    weth: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    usdc: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
    factories: [{ name: "uniswap-v3", address: "0x1f98431c8ad98523631ae4a59f267346ea31f984" }],
  },
  "56": {
    chainKey: "bsc",
    weth: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    factories: [{ name: "pancakeswap-v3", address: "0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865" }],
  },
  "43114": {
    chainKey: "avalanche",
    weth: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
    usdc: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
    factories: [{ name: "trader-joe-v2.1", address: "0x8e42f2f4101563bf679975178e880fd87a3a3f80" }],
  },
};

export const ONCHAIN_V3_CHAIN_IDS = new Set(Object.keys(ONCHAIN_V3_SPECS));

export function onchainV3SpecForChain(chain: ChainConfig): OnchainV3Spec | null {
  const id = String(chain.CHAIN?.CHAIN_ID ?? "").toLowerCase();
  const gtNetwork = String(chain.CHAIN?.GT_NETWORK ?? chain.CHAIN?.DEX_SLUG ?? "").toLowerCase();
  const spec = ONCHAIN_V3_SPECS[id] ?? (gtNetwork === "base" ? ONCHAIN_V3_SPECS["8453"] : undefined);
  if (!spec) return null;
  return {
    ...spec,
    fees: [500, 3000, 10000],
    selectors: SELECTORS,
  };
}

export function sqrtRatioX96ToPrice(
  sqrtPriceX96: bigint,
  tokenDecimals: number,
  quoteDecimals: number,
  tokenIsToken0: boolean,
): number | null {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const rawPrice = ratio * ratio * 10 ** (tokenDecimals - quoteDecimals);
  const price = tokenIsToken0 ? rawPrice : 1 / rawPrice;
  return isPositiveFinite(price) ? price : null;
}

export function encodeSqrtPriceX96ForPrice(
  price: number,
  tokenDecimals: number,
  quoteDecimals: number,
  tokenIsToken0: boolean,
): bigint {
  const rawPrice = tokenIsToken0 ? price : 1 / price;
  const sqrt = Math.sqrt(rawPrice / 10 ** (tokenDecimals - quoteDecimals));
  return BigInt(Math.round(sqrt * 2 ** 96));
}

export class OnchainV3PriceSource implements TokenPriceSource {
  private readonly cache?: PricingCache;
  private readonly rpc?: OnchainV3Rpc;
  private readonly nativePriceUsd?: OnchainV3SourceOptions["nativePriceUsd"];

  constructor(optionsOrCache?: OnchainV3SourceOptions | PricingCache) {
    if (optionsOrCache && "getPrice" in optionsOrCache) {
      this.cache = optionsOrCache;
    } else {
      this.cache = optionsOrCache?.cache;
      this.rpc = optionsOrCache?.rpc;
      this.nativePriceUsd = optionsOrCache?.nativePriceUsd;
    }
  }

  async getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike> {
    const contract = normalizeEvmAddress(token.contract ?? token.key);
    if (!contract) return null;
    const spec = onchainV3SpecForChain(token.chain);
    if (!spec) return null;

    await this.cache?.setMarker(onchainMarkerKey(token), NEED_ONCHAIN);
    if (!this.rpc) return null;

    const pools: PoolCandidate[] = [];
    for (const factory of spec.factories) {
      pools.push(...(await this.findPools(contract, spec, factory)));
    }
    if (!pools.length) return null;

    const priced = await this.pricePools(contract, spec, pools);
    const best = priced
      .filter((pool) => isPositiveFinite(pool.priceUsd))
      .sort((a, b) => Number(b.liquidity ?? 0n) - Number(a.liquidity ?? 0n))[0];

    if (!best || !isPositiveFinite(best.priceUsd)) return null;
    return {
      priceUsd: best.priceUsd,
      source: "onchain-v3",
      reason: `${best.factory}:${best.quoteLabel}:${best.fee}`,
    };
  }

  private async findPools(contract: string, spec: OnchainV3Spec, factory: OnchainV3Factory): Promise<PoolCandidate[]> {
    if (!this.rpc) return [];
    const quotes = [
      { quote: spec.usdc, quoteDecimals: 6, quoteLabel: "USDC" as const },
      { quote: spec.weth, quoteDecimals: 18, quoteLabel: "WETH" as const },
    ];
    const lookup: Array<Omit<PoolCandidate, "addr">> = [];
    const calls: OnchainV3RpcCall[] = [];
    for (const quote of quotes) {
      for (const fee of spec.fees) {
        calls.push({
          to: factory.address,
          data: `${spec.selectors.getPool}${padAddress(contract)}${padAddress(quote.quote)}${padUint(fee)}`,
        });
        lookup.push({ fee, quote: quote.quote, quoteDecimals: quote.quoteDecimals, quoteLabel: quote.quoteLabel, factory: factory.name });
      }
    }
    const rows = await this.rpc.batch(calls);
    const pools: PoolCandidate[] = [];
    for (let i = 0; i < rows.length; i++) {
      const pool = normalizeEvmAddress(wordToAddress(rows[i]));
      const meta = lookup[i];
      if (!pool || !meta || /^0x0{40}$/.test(pool)) continue;
      pools.push({ ...meta, addr: pool });
    }
    return pools;
  }

  private async pricePools(contract: string, spec: OnchainV3Spec, pools: PoolCandidate[]): Promise<PoolCandidate[]> {
    if (!this.rpc) return [];
    const detailCalls: OnchainV3RpcCall[] = [];
    for (const pool of pools) {
      detailCalls.push({ to: pool.addr, data: spec.selectors.slot0 });
      detailCalls.push({ to: pool.addr, data: spec.selectors.liquidity });
      detailCalls.push({ to: pool.addr, data: spec.selectors.token0 });
    }
    const detailRows = await this.rpc.batch(detailCalls);
    const decimals = await this.getTokenDecimals(contract, spec);
    if (decimals == null) return [];
    const nativeUsd = this.nativePriceUsd ? await this.nativePriceUsd() : null;

    return pools.map((pool, index) => {
      const slot0 = hexWordToBigInt(detailRows[index * 3]);
      const liquidity = hexWordToBigInt(detailRows[index * 3 + 1]);
      const token0 = normalizeEvmAddress(wordToAddress(detailRows[index * 3 + 2]));
      if (slot0 == null || liquidity == null || !token0) return pool;
      const priceQuote = sqrtRatioX96ToPrice(slot0, decimals, pool.quoteDecimals, token0 === contract);
      if (!isPositiveFinite(priceQuote)) return pool;
      const priceUsd = pool.quoteLabel === "WETH" ? (isPositiveFinite(nativeUsd) ? priceQuote * nativeUsd : null) : priceQuote;
      return { ...pool, liquidity, token0, priceUsd: isPositiveFinite(priceUsd) ? priceUsd : undefined };
    });
  }

  private async getTokenDecimals(contract: string, spec: OnchainV3Spec): Promise<number | null> {
    if (!this.rpc) return null;
    const rows = await this.rpc.batch([{ to: contract, data: spec.selectors.decimals }]);
    const value = hexWordToBigInt(rows[0]);
    if (value == null || value < 0n || value > 36n) return null;
    return Number(value);
  }
}

function normalizeEvmAddress(value: unknown): string | null {
  const s = normalizePriceKey(String(value ?? ""));
  return /^0x[0-9a-f]{40}$/.test(s) ? s : null;
}

function padAddress(address: string): string {
  return normalizePriceKey(address).replace(/^0x/, "").padStart(64, "0");
}

function padUint(value: number): string {
  return Math.trunc(value).toString(16).padStart(64, "0");
}

function wordToAddress(value: string | null | undefined): string | null {
  const word = hexWord(value);
  if (!word) return null;
  return `0x${word.slice(24)}`;
}

function hexWordToBigInt(value: string | null | undefined): bigint | null {
  const word = hexWord(value);
  if (!word) return null;
  return BigInt(`0x${word}`);
}

function hexWord(value: string | null | undefined): string | null {
  const clean = String(value ?? "").replace(/^0x/i, "").padStart(64, "0");
  if (!/^[0-9a-fA-F]{64,}$/.test(clean)) return null;
  return clean.slice(0, 64);
}
