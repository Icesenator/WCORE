# SVM Market Metadata Fallback Design

## Problem

SVM tokens without usable RPC, Metaplex, or Jupiter metadata fall back to the
first eight characters of their mint for both symbol and name. Pricing sources
may already return verified market metadata, but the Web pricing cascade drops
those optional fields before the SVM engine builds its wallet token.

For example, mint `7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1` is identified
by DexScreener, GeckoTerminal, and CoinGecko as `CWIF` / `catwifhat`, while the
Sheet currently displays `7atgF8KQ` / `7atgF8KQ`.

## Goals

- Display market-backed symbol and name when canonical SVM metadata is missing.
- Never replace usable RPC, Metaplex, registry, or cached metadata.
- Reuse an accepted pricing response instead of adding a second Web HTTP call.
- Keep Web and direct Apps Script behavior aligned.
- Solve the class of missing-metadata tokens without a mint-specific alias.

## Non-Goals

- Do not treat market metadata as more authoritative than canonical metadata.
- Do not add CoinGecko IDs or token-specific allowlists.
- Do not change pricing-source priority or price validation.
- Do not infer metadata from pools that failed existing price/liquidity checks.

## Design

### Web Runtime

`SourcePrice` already carries optional `symbol` and `name`. Extend
`PricingResult` with the same optional fields and copy them only from the source
whose valid price is committed by the cascade. Cache-only and stablecoin results
do not invent metadata.

The SVM engine identifies placeholders as a missing symbol, a missing name, or a
symbol/name derived from the first eight mint characters. After pricing, it uses
the winning source metadata only for those placeholder fields. Existing usable
metadata remains unchanged.

When market metadata improves a token, store it in the existing SVM metadata
cache so later cache-price hits retain the correct identity without another
metadata lookup.

### Apps Script Runtime

Keep the existing metadata order in `SvmTokenMeta.resolve`: overrides/cache,
GeckoTerminal, then Jupiter. If those sources still leave a placeholder, use the
existing DexScreener bulk result for the mint and merge only non-placeholder
`symbol` and `name` through `_mg`.

DexScreener bulk pricing already selects the highest-liquidity candidate above
the project's minimum-liquidity threshold and stores its metadata. The fallback
therefore reuses the current source and cache conventions rather than creating a
new endpoint or persistence layer.

## Data Flow

1. Resolve canonical or cached SVM metadata.
2. Price the token through the unchanged cascade.
3. Preserve metadata from the source that supplied the accepted price.
4. Replace only unresolved placeholder fields.
5. Learn the improved metadata through the existing SVM metadata cache.
6. Emit the corrected token identity to API and GSheet output.

## Error Handling

- Missing or malformed source metadata is ignored; pricing remains successful.
- A metadata-cache write failure does not fail the wallet scan.
- A DexScreener metadata miss leaves the mint-prefix placeholder unchanged.
- Existing source exceptions continue to be represented by the pricing trail.

## Testing

- Web cascade test: accepted DexScreener metadata reaches `PricingResult`.
- Web SVM test: `7atgF8KQ` placeholder becomes `CWIF` / `catwifhat`.
- Web SVM test: canonical metadata is never overwritten by market metadata.
- Apps Script test: Jupiter metadata miss falls back to DexScreener metadata.
- Apps Script test: existing metadata wins over DexScreener metadata.
- Full Web and GSheet suites, typecheck, lint, and static validation.

## Deployment And Verification

Deploy the API and Apps Script after tests pass. Force one refresh of
`Layer3 - Solana`, synchronize the output timestamp if required, and verify that
the mint displays `CWIF` and `catwifhat` while retaining its current balance and
price.
