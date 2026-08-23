export const CEX_PROVIDERS = ["binance", "bitpanda", "bitfinex", "bybit", "coinbase", "okx", "kraken"] as const;

export type CexProvider = typeof CEX_PROVIDERS[number];
