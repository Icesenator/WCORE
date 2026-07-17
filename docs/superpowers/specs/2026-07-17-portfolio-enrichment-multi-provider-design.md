# Portfolio Enrichment Multi-Provider Design

**Date:** 2026-07-17
**Status:** Approved

## Goal

Increase useful wallet and DeFi coverage by combining WCORE's on-chain scans with optional external providers, without weakening WCORE's balance authority, failure isolation, signed totals, or read-only security model.

The first delivery activates Zerion. The architecture also defines disabled provider slots for Helius, Etherscan V2, and LI.FI Earn. A separate future program will compare bridge and swap aggregators; it does not share execution state with portfolio enrichment.

## Product Decisions

- WCORE RPC and Multicall balances remain authoritative.
- Existing WCORE DeFi positions remain authoritative over provider positions.
- Zerion V1 adds missing DeFi positions, missing wallet tokens as a fallback, and a diagnostic external total.
- External totals never replace the displayed WCORE total automatically.
- Provider failure is fail-open: the normal WCORE scan remains usable and is not marked degraded.
- Provider calls are server-only and optional.
- Public wording remains `Selected DeFi positions`; provider coverage does not imply universal protocol coverage.

## Existing Blockscout Role

Blockscout remains an EVM discovery accelerator, not a portfolio authority:

1. `discoverTokensFromExplorer()` calls the universal Blockscout Pro `tokenlist` endpoint for supported chains.
2. The result supplies contracts and metadata such as symbol, name, and decimals.
3. WCORE reads balances independently through RPC and Multicall.
4. WCORE applies its own pricing cascade.
5. Blockscout can also provide token icons through the metadata resolver.
6. When Blockscout is unavailable, WCORE can continue with cached discovery and transfer-log discovery.

Zerion does not replace this flow. It adds normalized multi-chain portfolio and protocol context after the core scan.

## Approaches Considered

### Multi-provider framework with progressive activation

Selected. It introduces one provider contract, one orchestration path, and shared resilience primitives. Zerion is active in V1; later providers can be added without embedding vendor logic in scan engines.

### Zerion-only integration

Rejected because Helius, Etherscan, and LI.FI would require repeated cache, breaker, quota, and merge implementations.

### Activate all providers immediately

Rejected because simultaneous activation would make duplicate attribution, quota behavior, and production regressions difficult to isolate.

## Architecture

Create a server-only module under `wcore-web/apps/api/src/integrations/portfolio-enrichment/` with these boundaries:

- `types.ts`: normalized provider contracts and outcomes.
- `orchestrator.ts`: provider selection, single-flight, cache reads, and merge preparation.
- `merge.ts`: authority and deduplication rules.
- `chain-map.ts`: explicit provider chain IDs to canonical WCORE chain keys.
- `protocol-aliases.ts`: reviewed provider protocol IDs to canonical WCORE protocol IDs.
- `zerion.ts`: Zerion HTTP client and response adapter.
- `provider-state.ts`: Redis-backed atomic budgets, circuit breakers, leases, and telemetry.

The central provider contract is capability-aware because wallet-wide snapshots, chain-scoped indexers, and paginated history APIs have different request shapes:

```ts
interface PortfolioEnrichmentProvider {
  readonly id: "zerion" | "helius" | "etherscan" | "lifi-earn";
  readonly capabilities: ProviderCapabilities;
  supports(address: string): boolean;
  load(context: ProviderRequestContext): Promise<ProviderPortfolioSnapshot>;
}
```

`ProviderRequestContext` carries the normalized wallet, requested canonical chains, enabled purposes, and provider-specific page/request bounds. `ProviderPortfolioSnapshot` contains normalized positions, derived reconciliation values, freshness, source, and non-user-facing diagnostics. It does not contain credentials or raw HTTP errors. Each provider defines a reviewed request plan: Zerion is one wallet snapshot, while future chain-scoped or paginated providers may use a bounded number of calls.

The scan plugin receives an optional enrichment dependency. Absence of that dependency is a strict no-op, preserving tests and deployments where providers are disabled.

## Data Flow

```text
WCORE scan or scan cache
-> finalize native WCORE DeFi metadata and positions
-> enrichment cache lookup by wallet
-> provider single-flight or distributed lease when fresh cache is absent
-> normalize provider response in EUR
-> partition positions by WCORE chain key
-> verify wallet-token discovery hints through WCORE RPC/Multicall and pricing
-> merge accepted external positions with WCORE authority rules
-> apply provider liquidity labels and recompute the signed aggregate
-> buildChainScan serialization
-> clean-value aggregation and response
```

The Zerion V1 request is wallet-scoped, never chain-scoped. A scan spanning many chains must not multiply Zerion calls. Future chain-scoped providers use their explicit bounded request plans and group requested chains into the fewest supported calls.

Enrichment is applied to live and cached WCORE results immediately before serialization. WCORE finalization runs first so Compound, WCT, and registry-backed positions are present before deduplication. Provider positions use direct signed values and receive their liquidity labels in the adapter; the final merge only recomputes the aggregate and must not recreate native positions. The provider cache remains independent of `scan:result:*`, so provider freshness and feature activation do not require invalidating on-chain scan caches.

## Zerion V1

### API calls

Use Basic authentication with the API key as username and an empty password. The key exists only in the API service environment.

V1 request:

```text
GET https://api.zerion.io/v1/wallets/{address}/positions/
  ?filter[positions]=no_filter
  &currency=eur
  &filter[trash]=only_non_trash
```

The adapter partitions this single snapshot into wallet discovery hints and complex positions. It supplies deposits, loans, locked assets, staking, rewards, investments, grouped LP components, and the values needed for a derived reconciliation sum without a second provider request. A wallet hint is never inserted with Zerion's quantity or price: WCORE must verify its balance through RPC/Multicall and run normal pricing before inclusion. Activation requires confirming that the WCORE Zerion plan permits `no_filter`; otherwise enrichment remains disabled rather than silently falling back to a partial contract.

### Supported addresses

- EVM: complex positions, wallet fallback, and diagnostics.
- Solana: wallet fallback and diagnostics only because Zerion currently does not expose protocol positions for Solana.
- Cosmos and TON: no Zerion request.

### Mapping

- `deposit` maps to collateral, vault share, or unknown DeFi according to `protocol_module`.
- `loan` maps to lending debt and is normalized to negative balance and negative EUR value.
- `locked` maps to `staking_locked` with locked liquidity.
- `staked` maps to liquid or locked staking according to provider metadata; ambiguous cases use unknown liquidity.
- `reward` maps to claimable.
- `investment` maps to real-world asset or vault share when metadata supports it; otherwise unknown DeFi.
- LP entries retain individual assets and an internal shared `group_id`.
- `flags.displayable=false`, trash entries, invalid contracts, invalid quantities, and non-finite values are dropped.
- A provider position is eligible for display and `PROVIDER_VERIFIED` only when its fungible metadata is provider-verified. Every component of an LP group must be verified. Unverified positions are dropped from displayed enrichment and totals, with telemetry only.

Provider IDs are treated as opaque strings.

`chain-map.ts` contains the reviewed mapping from Zerion IDs to canonical WCORE keys, for example `arbitrum` to `ARBITRUM_ONE`. Unknown chains are dropped with telemetry. Contractless wallet/native entries are never added because WCORE already owns native balances. A contractless complex position may use an internal synthetic key derived from provider, canonical chain, and opaque position ID only when it has a valid chain, protocol, type, and finite value; it receives no explorer link. This synthetic key is not used as a cross-provider deduplication identity.

## Authority and Deduplication

Authority order:

1. WCORE on-chain wallet assets.
2. WCORE native DeFi positions such as Compound V3 and WCT.
3. External provider positions not represented above.

Wallet token fallback uses normalized chain plus contract. It is a discovery hint only: inclusion requires a successful WCORE-owned on-chain balance read, and value uses WCORE pricing. Zerion never overwrites a WCORE balance, price, logo, or metadata for an existing token.

Cross-provider DeFi deduplication uses a semantic key: normalized chain, normalized protocol, position type, asset or underlying contract, and pool/group identity when applicable. Provider position IDs are retained only as provenance and never participate in the cross-provider collision key. A provider position also loses when it matches a known WCORE protocol/contract/type tuple.

`protocol-aliases.ts` is the canonical registry for equivalent protocol IDs, such as provider-specific Aave or Compound variants. Unknown Zerion protocols use a namespaced normalized DApp ID and remain eligible only under the verification rules, but they are not assumed equal to another provider's unknown ID. Before any second DeFi provider is activated, its aliases for overlapping protocols must be added with cross-provider fixture tests; otherwise overlapping unknown protocols from that provider are not admitted.

Receipt-bearing positions add another collision guard. If `receipt.fungible_info` resolves to a contract already present as a WCORE wallet token, the entire external position or LP group is skipped in V1 rather than counting both the receipt token and its decomposed provider assets. `pool_address` and receipt implementations participate in the collision fingerprint. Merely sharing an underlying contract with an independently held wallet token is not a collision, because deposited and freely held units are distinct.

Direct provider debt is negative before merging. Accepted provider DeFi positions contribute their signed values to the displayed total because they are the product feature being added. The separate derived Zerion position sum is diagnostic only: it never replaces or rescales the sum of WCORE assets plus individually accepted enrichment rows.

## Public Serialization and Scam Handling

- Provider DeFi rows carry inline DeFi metadata and serialize with `DEFI` and `PROVIDER_VERIFIED` flags.
- Normalized provider tokens set `token.priceSource` to the provider ID. `buildChainScan()` must preserve this explicit public field and use `pricing-cascade` only as a fallback when no source exists.
- Detailed protocol, provider position ID, and group ID remain internal in V1 unless required for correct UI grouping. Provider identity is intentionally visible through the existing `priceSource` field.
- Backend and frontend aggregation must check an exported explicit admin-block predicate before trusting either flag. The required order is: explicit admin block excludes the row; otherwise verified DeFi bypasses only heuristic scam rules. Existing code paths that skip all checks for `DEFI` must be changed and tested.
- Wallet fallback tokens do not receive automatic DeFi trust and continue through normal scam filtering.

## Cache and Freshness

Use versioned provider keys in the shared cache registry:

```text
zerion:portfolio:v1:{address}:fresh
zerion:portfolio:v1:{address}:last-good
zerion:portfolio:v1:{address}:failure
zerion:portfolio:v1:{address}:untracked
provider:zerion:half-open-lease
provider:zerion:daily:{utc-date}
```

- Fresh TTL: 10 minutes.
- Last-good TTL: 24 hours.
- A valid empty response may replace both caches.
- Timeout, network failure, malformed JSON, `401`, `403`, `429`, and `5xx` never overwrite last-good.
- Last-good data is marked stale in internal telemetry but does not make the chain degraded.
- Failure cache TTL: 2 minutes, extended up to 10 minutes by a bounded `Retry-After` on `429` or `503`.
- Zerion `400` for a valid but untracked address writes a one-hour untracked cache entry, does not overwrite last-good, and does not count against the breaker.
- Process-local single-flight deduplicates calls inside one API replica. A Redis `SET NX PX` lease deduplicates across replicas; losing replicas briefly wait for the shared fresh/failure outcome and then continue without enrichment rather than issuing a duplicate call.
- Request and half-open leases use a 10-second TTL, longer than the bounded request and parse path. Each lease stores a random owner token and is released only by compare-and-delete from that owner. Leases are not renewed. Losing replicas wait at most 3.5 seconds for a shared outcome, then continue without enrichment.
- If Redis atomic state is unavailable and the API has fallen back to `MemoryCacheStore`, enrichment disables itself fail-open and performs no provider request. Normal WCORE scans continue unchanged.

## Resilience and Budgets

- Zerion request timeout: 3 seconds across headers and body.
- No retry in the scan critical path.
- Dedicated provider breaker: open after 5 failures, 2-minute cooldown, controlled half-open probe.
- Provider failures never call chain circuit breakers.
- Breaker state, half-open probe lease, and daily request counter are atomic Redis state shared across replicas. A restart cannot reset the budget or create parallel probes.
- Configurable daily request budget; exhausted budget behaves like an open provider breaker until the next UTC budget key.
- Valid empty portfolios and unsupported address families do not count as failures.
- A `400` is treated as valid-untracked only when the wallet passed local address validation and parsed `errors[].title/detail` matches an allowlist fixture captured from Zerion's documented untracked response. Unknown or changed `400` payloads fail closed as malformed-request failures, use only the short failure cache, and never receive the one-hour untracked cache.
- A structurally incomplete or partially invalid snapshot is never used for displayed enrichment. It records parse metrics and serves last-good when available; without last-good, the scan continues with no provider enrichment. Only a structurally complete snapshot may replace provider caches or contribute new rows.

## Configuration and Secrets

Configuration belongs in the typed API config and environment templates:

```text
ZERION_ENRICHMENT_ENABLED=false
ZERION_API_KEY=
ZERION_TIMEOUT_MS=3000
ZERION_CACHE_TTL_MS=600000
ZERION_LAST_GOOD_TTL_MS=86400000
ZERION_DAILY_BUDGET=1000
ZERION_MAX_RESPONSE_BYTES=2000000
ZERION_MAX_POSITIONS=1000
```

When enrichment is disabled, no key is required and no provider code performs network work. When enabled, a missing key fails API startup with a clear configuration error.

No provider secret may use a `NEXT_PUBLIC_*` name, appear in URLs, enter logs, or be returned to clients. The Zerion host is a fixed HTTPS constant rather than a configurable arbitrary URL.

The client rejects `Content-Length` above 2,000,000 bytes and also enforces a streaming read cap when the header is absent or false. More than 1,000 raw or normalized positions rejects the snapshot. Oversize responses use the short failure cache, count as provider failures, and never overwrite last-good.

## Diagnostics

Provider telemetry is separate from scan errors:

- calls, cache hits, stale hits, timeouts, status classes, parse drops, breaker state, and budget remaining;
- count and EUR value of positions added;
- count of collisions won by WCORE;
- WCORE versus derived Zerion position-sum delta in EUR and percent.

The position-sum delta is computed locally from the single `/positions/` response and is not described as Zerion's official portfolio aggregate, which would require `/portfolio`. It is diagnostic only, is not user-facing in V1, and cannot mutate portfolio totals. Individually accepted complex positions do contribute their signed EUR values; verified wallet hints contribute only WCORE-read balances and WCORE-derived values.

## Future Providers

### Helius

Use for Solana token, DAS, and enhanced transaction coverage after Zerion V1. The current free plan documents 1 million monthly credits, 10 RPC requests per second, and 2 DAS requests per second. Helius does not replace normal Solana RPC authority until separately designed and validated.

### Etherscan V2

Use as an EVM discovery and history fallback where Blockscout coverage is absent. The free tier documents 3 calls per second and 100,000 calls per day on selected chains. It does not replace Multicall balances.

### LI.FI Earn

Use for vault and yield position coverage and APY context across supported protocols. It remains a portfolio data provider; transaction construction belongs to the separate routing program.

## Separate Mega-Aggregator Program

The bridge and swap objective is a separate subsystem called Route Intelligence.

Candidate route providers include LI.FI, Relay, Socket/Bungee, Rango, 0x/1inch, and Jupiter. Providers are activated only after their API terms, quotas, contracts, and chain coverage are verified.

The route engine will normalize:

- net destination amount;
- gas and integrator fees;
- price impact and slippage;
- estimated duration;
- step and signature count;
- bridge and execution risk;
- underlying route identity for deduplication.

The first route delivery is read-only quote comparison returning unsigned transaction data. Execution requires a separate approved design, wallet confirmation, transaction simulation where available, allowlisted contracts, and a security review. WCORE never holds funds and never signs automatically.

`All chains` means every chain dynamically supported by at least one active route provider. It does not promise routes for all 183 WCORE configurations.

Route caches, budgets, secrets, breakers, telemetry, and transaction state remain separate from portfolio enrichment.

## Testing

### Unit tests

- Zerion response parsing for every supported position type.
- Invalid, trash, hidden, partial, and non-finite entries.
- Incomplete snapshots select last-good or no enrichment deterministically and never expose partial rows.
- Provider verification flags, including mixed-verification LP groups.
- Negative loan normalization.
- Chain and contract normalization.
- Reviewed Zerion-to-WCORE chain mapping, unknown-chain drops, native entries, and contractless complex positions.
- WCORE authority and every deduplication collision class.
- Cross-provider semantic deduplication independent of provider IDs.
- Canonical protocol aliases and fail-closed activation of overlapping unknown protocols.
- Receipt-token and LP-group collisions against WCORE wallet assets.
- LP grouping metadata.
- Provider price-source preservation.

### Resilience tests

- Fresh cache and last-good cache.
- Valid empty replacement.
- Timeout before headers and stalled body.
- Oversize `Content-Length`, chunked body cap, and position-count cap.
- Network errors, `401`, `403`, `429`, `5xx`, and malformed JSON.
- Valid untracked `400`, malformed-request `400`, failure cache, bounded `Retry-After`, and distributed lease contention.
- Redis-unavailable behavior disables enrichment without a provider call.
- Breaker closed, open, and half-open transitions.
- Lease TTL, owner-only release, losing-replica wait bound, and expired-owner behavior.
- Atomic shared budget exhaustion across simulated replicas.
- Concurrent scans and replicas produce one provider request per wallet.

### Scan integration tests

- Sync, batch, async, and cached scan paths return consistent enrichment.
- Provider absence and failure without last-good preserve the original WCORE response. Failure with last-good preserves the previously enriched rows and marks only internal provider telemetry stale.
- Provider failure does not change `degraded`, chain errors, or chain breaker state.
- Existing Compound and WCT positions are not duplicated.
- Wallet hints are excluded until RPC verification succeeds and never use Zerion quantities or prices.
- Provider debt remains negative through serialization and aggregation.
- Explicit admin blocks are evaluated before `DEFI` and `PROVIDER_VERIFIED` trust in backend and frontend aggregation.

Live provider tests are opt-in and excluded from hermetic CI.

## Rollout

1. Add the provider framework with all providers disabled.
2. Deploy and verify strict no-op parity.
3. Generate a Zerion key in the WCORE dashboard organization and store it only in Railway API variables.
4. Enable Zerion with conservative timeout, TTL, and daily budget.
5. Validate selected known wallets against raw Zerion responses and WCORE totals.
6. Monitor provider telemetry, cache behavior, collisions, and quota consumption.
7. Keep a one-variable kill switch for immediate rollback.
8. Design and activate Helius, Etherscan, and LI.FI Earn in separate reviewed increments.
9. Write a separate Route Intelligence design before bridge or swap implementation.

## Success Criteria

- Useful positions increase without double counting.
- WCORE output is unchanged when enrichment is disabled, or unavailable without a last-good snapshot; a provider failure with last-good preserves the prior enrichment.
- Zerion performs at most one external request per wallet during a fresh, failure, untracked, or distributed-lease window. Every later provider stays within its documented bounded request plan.
- No secret reaches the browser or logs.
- Provider failures cannot degrade or block normal scans.
- WCORE balances remain authoritative; displayed totals add only accepted complex enrichment and RPC-verified wallet hints, while provider-derived reconciliation sums remain diagnostic. Signed debt remains correct.
- Activation and rollback require only controlled environment changes.

## Non-Goals

- Replacing WCORE RPC balances or pricing wholesale.
- Claiming complete DeFi or all-chain provider coverage.
- Adding provider data to Google Sheets in V1.
- Displaying provider reconciliation diagnostics publicly in V1.
- Activating Helius, Etherscan, or LI.FI in the Zerion delivery.
- Building, signing, or executing bridge and swap transactions in this project.
