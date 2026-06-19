# Token Logo Resolution Design

**Status:** Shipped on 2026-05-19. API deployed to Railway and verified against Ethereum wallet `0x17d518736ee9341dcdc0a2498e013d33cfcdd080`.

## Goal

Resolve token logos automatically by contract address whenever possible, using every available reliable source, then persist the result in cache so future scans do not repeat the lookup.

The system must avoid symbol-only guesses for ERC-20 tokens because symbols are ambiguous across chains and contracts. Symbol fallbacks are only acceptable for native tokens or final degraded fallback.

## Requirements

- Use token contract address and chain as the primary identity.
- Cache successful logo resolutions under a stable Redis key: `logo:{chain}:{contract}`.
- Cache negative lookups for a short TTL to avoid hammering external APIs.
- Never return a known-broken logo URL if a better source is available.
- Preserve scan speed by limiting external logo calls and making cache writes fire-and-forget where possible.
- Prefer URLs that load directly in browsers.
- Avoid hardcoding token-by-token logo exceptions except for rare critical overrides.

## Resolution Order

1. Redis positive cache: `logo:{chain}:{contract}`.
2. Existing token metadata cache: `meta:{chain}:{contract}.token.logoUrl`, if present and not known-broken.
3. Blockscout token detail API when the chain has a Blockscout endpoint.
   - Endpoint shape: `/api/v2/tokens/{contract}`.
   - Use `icon_url` when present.
   - Validate basic URL shape and reject empty values.
4. DexScreener token API by contract.
   - Use `info.imageUrl` from the best matching pair/token response when present.
5. TrustWallet contract path.
   - URL shape: `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/{slug}/assets/{contract}/logo.png`.
   - Do not treat this as guaranteed. It is a candidate fallback and may 404.
6. Symbol-based fallback only for native tokens or major known assets.
7. Colored initials fallback in UI.

## Cache Policy

- Positive cache: no TTL or very long TTL, because token logos rarely change.
- Negative cache: short TTL, default 24h, key `logo-miss:{chain}:{contract}`.
- Existing stale cached URLs from blocked hosts should be ignored or replaced.
- Known blocked host: `coin-images.coingecko.com`.
- `assets.coingecko.com` is acceptable when returned by Blockscout because tested URLs load with HTTP 200.

## Runtime Behavior

- Scan should first use cached logo data synchronously.
- For uncached logos, resolver can do bounded async enrichment during scan with a small concurrency limit.
- If enrichment exceeds budget or fails, return a fallback and cache the miss briefly.
- Successful discovered logos should also update metadata cache token `logoUrl` when available.
- Cache writes remain fire-and-forget to avoid slowing scan completion.

## Components

- `token-logo-resolver.ts`: async resolver with cache, source orchestration, validation, and negative cache.
- `token-logos.ts`: pure fallback URL builder only; no network and no broad symbol guessing.
- `explorer-discovery.ts`: pass cache into logo resolver and persist discovered `icon_url` when Blockscout provides one.
- `metadata.ts`: keep valid cached logoUrl; refresh only if absent or known-broken.
- EVM engine token assembly: call resolver for registry/discovered tokens when cache is available.

## Error Handling

- External API failures are non-fatal.
- 402/403/429/5xx from Blockscout should respect existing cooldown behavior.
- Invalid JSON or missing icon fields should be negative-cached, not logged as scan errors unless debugging.
- Broken candidate URLs from TrustWallet should not poison the positive cache.

## Testing

- Unit test source priority: Redis > metadata > Blockscout > DexScreener > TrustWallet > fallback.
- Unit test known blocked host rejection: `coin-images.coingecko.com` is not reused from cache.
- Unit test that token symbols do not override contract-based logos.
- Integration-style test with mocked Blockscout `icon_url` for H/L3/ZKP/ERA.
- Verify `pnpm --filter "@wcore/core" build` before deploy.

## Success Criteria

- H, L3, ZKP, ERA no longer depend on manual symbol guesses or broken TrustWallet URLs.
- Previously discovered Blockscout tokens keep correct logos through Redis cache.
- New tokens get the best available logo automatically after first scan.
- Scan remains resilient when logo sources fail.

## Shipped Verification

- `pnpm --filter "@wcore/core" build`: passed.
- Focused tests: 24/24 passed (`token-logo-resolver`, `metadata`, `explorer-discovery`, `evm`).
- Production API result over 60 Ethereum tokens: 17 Blockscout/`assets.coingecko.com`, 38 TrustWallet, 3 CMC, 2 spothq, 0 `coin-images.coingecko.com`.
- **Post X** : `https://x.com/WCORExyz/status/2056711198687539418` — `WCORE × Blockscout` avec tag `@blockscoutcom`. Image `wcore-blockscout-post.png`.
