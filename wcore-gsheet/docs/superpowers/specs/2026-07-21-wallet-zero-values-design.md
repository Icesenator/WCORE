# Wallet Zero Values Correction

## Objective

Prevent valid wallet holdings from appearing as silent zero values in Recap Portfolio when a degraded scan, missing price, disabled chain, or unavailable RPC prevents a reliable valuation.

## Scope

- Binance Web3 Wallet - BNB Chain
- Layer3 - Fogo
- Ledger - Camp
- Ledger - Ancient8
- Ledger - Monad
- Ledger - Syndicate Commons
- Strat!AY1 error gate

## Design

### Degraded First Scan

The GSheet web adapter may preserve an incoming degraded result only when a useful previous wallet cache exists. If no cache exists, it must save the usable degraded payload and return `WEB_SCAN_DEGRADED`. This prevents the permanent `WEB_SCAN_PRESERVED` / `NO_CACHE_WAITING_REFRESH` loop.

### BNB Chain And Monad

The canonical generated-chain sources remain authoritative.

- BNB Chain will use the currently working public RPC ordering and a bounded log range.
- Monad will use `MAX_LOG_RANGE: 1000` so `eth_getLogs` requests do not receive HTTP 413 responses.

Partial RPC errors must not discard balances and token holdings already obtained from working endpoints.

### Fogo Stablecoin Pricing

The SVM known-token metadata path will preserve `isStable` and `peg`. Pricing will receive these fields, allowing the stablecoin fast path to value the configured Fogo USDC using the USD/EUR rate.

### Camp Price Precision

Native token unit prices will retain sufficient decimal precision for prices below EUR 0.01. Monetary totals may remain rounded to two decimals. A positive CAMP balance with a positive oracle price must no longer become a pricing gap because the unit price was rounded to zero.

### Unavailable Chains

Ancient8 remains disabled because its configured RPC requires authentication. The GSheet API path must honor `DISABLE_CHAIN` before invoking the engine and return an explicit disabled-chain status.

Syndicate Commons remains enabled and maintained. Invalid fallback RPCs will not be treated as successful sources. If every RPC is unavailable, the scan must expose an explicit RPC-unavailable error and preserve a prior valid cache when present. Without a prior cache, Recap Portfolio must show an error state rather than presenting zero as a verified balance.

### Strat Error Gate

`Strat!AY1` will return `V` whenever any cell in `Recap Portfolio!CA:CA` contains `Erreur`. Otherwise, its existing `Portefeuille Crypto!P1` rule remains unchanged.

## Tests

- A degraded payload with no previous cache is saved and reported as degraded.
- A degraded payload with a useful previous cache preserves or merges that cache.
- Fogo stablecoin metadata reaches pricing and produces a positive EUR price.
- A sub-cent native token price remains positive while its total value remains money-rounded.
- Monad exports and applies `MAX_LOG_RANGE: 1000`.
- Disabled Ancient8 does not invoke the scan engine and returns an explicit status.
- Total Syndicate RPC failure cannot be serialized as a verified zero.
- `Strat!AY1` returns `V` when Recap Portfolio contains an error.

## Success Criteria

- BNB Chain, Fogo, Camp, and Monad show their detected holdings after refresh.
- Ancient8 and an unavailable Syndicate RPC show explicit errors instead of trustworthy-looking zero values.
- No wallet remains in a no-cache preservation loop.
- `Strat!AY1` is `V` while Recap Portfolio contains any error.
