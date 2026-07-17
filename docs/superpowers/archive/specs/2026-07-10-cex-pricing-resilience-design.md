# CEX Pricing Accuracy and Resilience Design

> Date: 2026-07-10  
> Status: implemented and verified  
> Scope: WCORE Web API and wallet UI only

## Objective

Correct CEX EUR valuations, remove an unused high-amplification public endpoint, and preserve the last healthy CEX portfolio during transient API failures.

The change must not alter provider credential storage, provider synchronization, on-chain scans, GSheet CEX behavior, or provider-specific symbol normalization.

## Problems Addressed

### Incorrect USD to EUR conversion

`getEurUsdRate()` returns EUR for one USD. The canonical convention is:

```text
priceEur = priceUsd * fxRate
```

Before this change, `apps/api/src/plugins/cex.ts` divided stablecoin and DefiLlama USD prices by this rate. This overvalued USD-denominated CEX assets.

### Google Sheets pricing endpoint

`GET /api/cex/prices` is consumed by `_cexFetchWebPrices_` in `wcore-gsheet/src/35_BITPANDA_SYNC.gs`. The initial Web-only search missed this cross-project caller. The old route accepted up to 200 symbols without authentication and could query several providers per symbol, creating an amplification surface.

### Destructive transient error handling

`useCexHoldings` previously replaced all CEX results with an empty array after any failed request. A temporary network or API failure therefore removed valid cached holdings from the displayed portfolio and lowered the visible total.

## Design Decisions

### 1. Keep the canonical FX convention

All CEX paths that convert a USD-denominated price use multiplication:

```text
stable USD:     1 * fxRate
DefiLlama USD:  priceUsd * fxRate
```

EUR and EUR-pegged assets remain valued at 1 EUR. Provider tickers that already return EUR remain unchanged.

The implementation will avoid introducing another FX convention or reciprocal helper.

### 2. Secure and bound `GET /api/cex/prices`

The endpoint remains available for Google Sheets and requires the existing shared `x-gsheet-token`. Requests are limited to the caller's 50-symbol chunk size. Stock symbols use one relay batch per request, while crypto fallback pricing runs with at most five workers. The old unauthenticated multi-provider fan-out helpers are removed.

### 3. Preserve healthy CEX results on transient failures

`useCexHoldings(connectedAddress: string | null)` derives a normalized session key from the connected authenticated address and applies the following state transitions:

| Condition | Result |
|---|---|
| `enabled=false` | Clear CEX results immediately |
| HTTP 200 with accounts | Replace results with the returned accounts |
| HTTP 200 with no holdings | Clear results; this is an authoritative empty state |
| HTTP 401 or 403 | Clear results; authorization is no longer valid |
| HTTP 429 or 5xx | Preserve previous results and mark them degraded/stale |
| Network or parse failure | Preserve previous results and mark them degraded/stale |
| Later HTTP 200 | Replace stale results and clear the transient error marker |

The stale transformation keeps address, label, tokens, balances, prices and totals unchanged. It sets the contained synthetic chain to `degraded: true` and adds one sync-stage error explaining that the last known holdings are being shown.

Repeated failures must not append duplicate stale errors.

### 4. Prevent cross-session retention

Previous results are never preserved when `connectedAddress` is `null`, its normalized session key changes, or the request receives 401/403. This ensures that holdings from an expired or previous authenticated session do not remain visible.

State is stored as `{ sessionKey, results }`. Every request captures its session key and monotonic `requestId`; `resolveCexRequestTransition` applies an outcome only when both still match the active session and latest request. This prevents a late response from a previous session, or an older request in the same session, from overwriting current holdings.

## Components

### API pricing

Target: `wcore-web/apps/api/src/plugins/cex.ts`.

- Correct the stable USD and DefiLlama conversion in the internal pricing function.
- Keep `/api/cex/prices` for its Google Sheets consumer and require `x-gsheet-token`.
- Limit requests to 50 symbols, batch stock relay work, and bound crypto concurrency.
- Remove obsolete multi-provider fan-out helpers.
- Keep stock relay pricing and account synchronization behavior unchanged.

### CEX holdings state

Target: `wcore-web/apps/web/hooks/useCexHoldings.ts`.

- Add a pure transformation for stale results.
- Use functional state updates on transient failures so the latest successful state is preserved.
- Keep authoritative empty and authorization-clearing behavior explicit.
- Accept `connectedAddress: string | null` so holdings are scoped to the authenticated wallet session.
- Keep request outcomes session-keyed and guarded by a monotonic `requestId`.
- Return `cexResults` and `reloadCex`; the degraded marker in each synthetic chain carries the stale state.

### Wallet consumer

Target: `wcore-web/apps/web/components/WalletContent.tsx`.

- Derive `connectedAddress` only when `authStep === "authenticated"`.
- Call `useCexHoldings(connectedAddress)` so logout and wallet/session switches clear or isolate CEX state.
- Continue merging `cexResults` into the wallet display and use `reloadCex` after account synchronization.

### Tests

Targets should follow existing API and Web test locations.

- API regression test with `fxRate=0.8`: one USD stable must equal 0.8 EUR.
- API regression test with a USD provider price: 10 USD must equal 8 EUR.
- Route tests proving authentication, the 50-symbol limit, and one relay request per stock batch.
- Pure stale-state test proving totals and holdings are preserved.
- Test proving transient failures add one degraded marker without duplication.
- Test proving 401/403 and `enabled=false` clear results.
- Test proving a later successful response replaces the stale state.

Tests must not contact real CEX, FX, DefiLlama, Redis, PostgreSQL or Railway services.

## Error Handling

- Pricing source failures continue to return no price rather than inventing a value.
- Transient holdings failures are logged once through the existing error path and represented in the synthetic chain.
- Authentication failures fail closed by clearing CEX state.
- A successful empty response is authoritative and must not be mistaken for a transient failure.

## Compatibility

- Existing stored CEX accounts and holdings require no migration.
- Existing wallet rendering continues to consume `CexScanResult`.
- The existing GSheet request contract and relay endpoint remain compatible.
- Route authentication uses the same `GSHEET_API_TOKEN` already sent by the caller.

## Verification

Implementation is complete only when:

1. New regression tests fail against the old behavior and pass with the fix.
2. API CEX and normalizer tests pass.
3. Web hook/state tests pass without a running API.
4. API and Web typechecks pass.
5. Relevant lint checks pass.
6. A repository search confirms the only production caller is the authenticated Google Sheets adapter.
7. `git diff --check` passes.

Corrected on 2026-07-10 after finding the cross-project Google Sheets caller: 33/33 focused API CEX/normalizer/stock-relay tests passed, including route authentication, request limiting and stock batching. The prior removal/404 evidence is superseded.

## Out of Scope

- GSheet CEX queue and relay hardening.
- `CEX_SECRET` rotation or encryption redesign.
- Adding a new provider pricing abstraction.
- Redis job persistence, SSRF hardening, CI relocation or Prisma migration repair.
- Any deployment to Railway or Google Apps Script.
