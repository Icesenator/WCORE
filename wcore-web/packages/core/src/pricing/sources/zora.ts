import type { PricingToken, SourcePriceLike, TokenPriceSource } from "../types.js";
import { isPositiveFinite, normalizePriceKey } from "../types.js";

interface ZoraCoinResponse {
  zora20Token?: {
    address?: string;
    name?: string;
    symbol?: string;
    tokenPrice?: {
      priceInUsdc?: string | number | null;
    } | null;
  } | null;
}

export class ZoraCoinPriceSource implements TokenPriceSource {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getTokenPriceUsd(token: PricingToken): Promise<SourcePriceLike> {
    if (token.chain.key !== "BASE" && token.chain.CHAIN?.CHAIN_ID !== 8453) return null;
    const contract = normalizePriceKey(token.contract ?? token.key);
    if (!contract || contract === "native") return null;

    const url = `https://api-sdk.zora.engineering/coin?address=${encodeURIComponent(contract)}&chain=8453`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;

    const json = (await res.json()) as ZoraCoinResponse;
    const coin = json.zora20Token;
    if (!coin) return null;

    const returnedAddress = normalizePriceKey(coin.address ?? "");
    if (returnedAddress && returnedAddress !== contract) return null;

    const priceUsd = Number(coin.tokenPrice?.priceInUsdc);
    if (!isPositiveFinite(priceUsd)) return null;

    return {
      priceUsd,
      source: "zora",
      symbol: coin.symbol,
      name: coin.name,
    };
  }
}
