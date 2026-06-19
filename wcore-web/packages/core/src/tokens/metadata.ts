import { EvmRpc, RpcDispatcher } from "../rpc/index.js";
import type { RpcCallOptions } from "../rpc/index.js";
import {
  decodeDecimalsResult,
  decodeStringResult,
  encodeErc20Decimals,
  encodeErc20Name,
  encodeErc20Symbol,
} from "./abi.js";
import type { DiscoveredToken } from "./types.js";
import type { CacheStore } from "../cache/index.js";
import { METADATA_CACHE_TTL_MS } from "../cache/index.js";
import { isUsableLogoUrl, resolveTokenLogoAsync } from "./token-logo-resolver.js";

export interface Erc20MetadataParams {
  contract: string;
  endpoints: string[];
  dispatcher: RpcDispatcher;
  rpc: EvmRpc;
  cache?: CacheStore;
  chainKey?: string;
  tokenDecimals?: Record<string, number>;
}

export interface Erc20MetadataResult {
  token: DiscoveredToken | null;
  errors: string[];
}

export async function getErc20Metadata(params: Erc20MetadataParams): Promise<Erc20MetadataResult> {
  const { cache, chainKey, contract } = params;
  const cacheKey = cache && chainKey ? `meta:${chainKey.toLowerCase()}:${contract.toLowerCase()}` : null;

  if (cacheKey) {
    try {
      const cached = await cache!.get<Erc20MetadataResult>(cacheKey);
      if (cached) {
        if (cached.token) {
          // Invalidate stale UNKNOWN entries from before the fix
          if (cached.token.symbol === "UNKNOWN" || cached.token.name === "Unknown Token") {
            // fall through to live fetch
          } else {
            const token = { ...cached.token };
            // Skip resolver entirely if cached token already has a usable logo URL.
            // The resolver does at least one Redis GET (and potentially HTTP) which is wasted work.
            if (!isUsableLogoUrl(token.logoUrl)) {
              const resolvedLogo = await resolveTokenLogoAsync({
                symbol: token.symbol,
                chainKey,
                contract: token.contract,
                cache,
                metadataLogoUrl: token.logoUrl,
              });
              if (resolvedLogo) token.logoUrl = resolvedLogo;
            }
            return { token, errors: [...cached.errors] };
          }
        } else {
          return { token: null, errors: [...cached.errors] };
        }
      }
    } catch {
      // cache failure → continue execution
    }
  }

  const errors: string[] = [];
  const [symbol, name, decimalsInitial] = await Promise.all([
    readString(params, encodeErc20Symbol(), "symbol", errors),
    readString(params, encodeErc20Name(), "name", errors),
    readDecimals(params, errors),
  ]);
  let decimals = decimalsInitial;

  if (decimals == null) {
    const fallbackDecimals = params.tokenDecimals?.[contract.toLowerCase()];
    if (fallbackDecimals != null) {
      decimals = fallbackDecimals;
    } else {
      errors.push("decimals unavailable");
      // Don't cache null results — let next scan retry
      return { token: null, errors };
    }
  }

  // Don't cache UNKNOWN tokens — if both symbol and name failed, the RPC
  // consensus was insufficient. Returning null lets the next scan retry
  // instead of serving stale "Unknown Token" for 24h.
  if (!symbol && !name) {
    errors.push("symbol and name unavailable");
    // Don't cache null results — let next scan retry
    return { token: null, errors };
  }

  const finalSymbol = symbol || contract.slice(0, 8);
  const logoUrl = chainKey ? await resolveTokenLogoAsync({ symbol: finalSymbol, chainKey, contract, cache }) : undefined;

  const token: DiscoveredToken = {
    contract: contract.toLowerCase(),
    symbol: finalSymbol,
    name: name || contract.slice(0, 10),
    decimals,
    source: "logs",
  };
  if (logoUrl) token.logoUrl = logoUrl;

  const result: Erc20MetadataResult = { token, errors };

  if (cacheKey) {
    try { await cache!.set(cacheKey, result, METADATA_CACHE_TTL_MS); } catch { /* noop */ }
  }

  return result;
}

async function readString(
  params: Erc20MetadataParams,
  selector: string,
  label: string,
  errors: string[],
): Promise<string | null> {
  const res = await runEthCall(params, selector, (value) => value.toLowerCase());
  if (!res.ok || !res.value) {
    errors.push(`${label} unavailable`);
    return null;
  }
  return decodeStringResult(res.value);
}

async function readDecimals(params: Erc20MetadataParams, errors: string[]): Promise<number | null> {
  const res = await runEthCall(params, encodeErc20Decimals(), (value) => value.toLowerCase());
  if (!res.ok || !res.value) return null;
  const decimals = decodeDecimalsResult(res.value);
  if (decimals == null) errors.push("decimals decode failed");
  return decimals;
}

async function runEthCall(
  params: Erc20MetadataParams,
  data: string,
  serialize: (value: string) => string,
): Promise<{ ok: boolean; value: string | null }> {
  const res = await params.dispatcher.run<string>(
    params.endpoints,
    (endpoint: string, opts: RpcCallOptions) =>
      params.rpc.ethCall(endpoint, params.contract, data, "latest", opts),
    serialize,
  );
  return { ok: res.consensus && !!res.value, value: res.value ?? null };
}
