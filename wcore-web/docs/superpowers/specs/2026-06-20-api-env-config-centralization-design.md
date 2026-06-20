# API Environment Config Centralization Design

## Goal

Centralize the most important API environment reads in a typed config module without changing runtime behavior. This reduces drift between local, staging, Railway production, and tests, and makes future env changes safer.

## Context

The root roadmap lists `Centralize web API environment reads through a typed config module` as an open backlog item. The API currently reads `process.env.*` directly across `server.ts`, `auth.ts`, scan plugins, metrics, GM, CEX, and wallet code. This makes defaults and production rules harder to audit.

This first pass is deliberately incremental. It targets boot/runtime-critical API config and leaves CEX/GM-specific env migrations for a later pass unless a small local replacement is trivial.

## Scope

In scope:

- Add `apps/api/src/config.ts`.
- Add unit tests for env parsing and production safety rules.
- Replace direct env reads in these files first:
  - `apps/api/src/server.ts`
  - `apps/api/src/auth.ts`
  - `apps/api/src/plugins/scan.ts`
  - `apps/api/src/plugins/scan-job.ts`
  - `apps/api/src/plugins/metrics-plugin.ts`
- Keep existing defaults unless a default is already documented as wrong.
- Keep test helpers that intentionally mutate `process.env` working by allowing `getApiConfig(env)` to accept an explicit env object.

Out of scope for this first pass:

- Full CEX relay env migration.
- Full GM env migration.
- Secret rotation.
- Railway variable changes.
- Deployment.

## Proposed Module

Create `getApiConfig(env = process.env)` returning a plain object with parsed values.

Sections:

- `runtime`: `nodeEnv`, `isProduction`, `isTest`, `isDevelopmentLike`.
- `server`: `port`, `host`, `trustProxy`, `logLevel`.
- `auth`: `jwtSecret`, `authAllowBearer`, `cookieSecure`, `cookieSameSite`.
- `cors`: `origins`, `fastifyOrigin`.
- `redis`: config derived from `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`.
- `limits`: `maxChainsPerScan`, `anonymousMaxChainsPerScan`, all rate limits currently in `server.ts`.
- `scan`: `scanConcurrency`, `nonEvmScanConcurrency`, cache TTLs and timeout values currently in `scan.ts` and `scan-job.ts`.
- `integrations`: `gsheetApiToken`, `internalApiUrl`, `publicUrl`.

Parsing helpers should be private to `config.ts`:

- `readNumber(env, key, fallback, { min })`
- `readBooleanFlag(env, key, fallback)`
- `readCsv(env, key)`
- `readJwtSecret(env)`

## Behavior Rules

- Production requires a non-placeholder `JWT_SECRET`, preserving the current behavior from `auth.ts`.
- Non-production may use the existing development fallback secret, preserving current local behavior.
- `AUTH_ALLOW_BEARER` remains deny-by-default in production unless exactly `true`.
- Outside production, bearer auth remains enabled unless exactly `false`.
- CORS behavior remains unchanged:
  - explicit `CORS_ORIGIN` becomes an array of trimmed origins.
  - no `CORS_ORIGIN` in production disables browser origins.
  - no `CORS_ORIGIN` outside production allows dev origins.
- Numeric config values keep the current fallback defaults and clamp minimums where the current code already clamps them.
- Redis URL parsing stays compatible with the existing `getRedisConfig()` behavior.

## Testing

Add `apps/api/src/config.test.ts` using pure env objects. Tests should not rely on global `process.env` except where importing existing modules requires it.

Required cases:

- development/test defaults parse without throwing.
- production without `JWT_SECRET` throws.
- production with a weak placeholder `JWT_SECRET` throws.
- production with a strong `JWT_SECRET` returns cookie settings `secure=true`, `sameSite=none`.
- `AUTH_ALLOW_BEARER` production default is false and `true` opt-in works.
- non-production bearer default is true and `false` opt-out works.
- comma-separated `CORS_ORIGIN` trims empty values.
- scan concurrency defaults to 50 and clamps invalid values to at least 1.
- Redis config prefers `REDIS_URL` over `REDIS_HOST` fields.

## Migration Steps

1. Write failing tests for `config.ts`.
2. Implement `config.ts` minimally.
3. Replace reads in `auth.ts` while keeping exported constants and public API stable.
4. Replace reads in `server.ts` for boot config, Redis, CORS, rate limits, and gsheet token.
5. Replace reads in scan plugins and metrics plugin.
6. Run targeted tests and full API typecheck.

## Risks

- Module import timing can freeze config before tests mutate env. Mitigation: expose `getApiConfig(env)` for tests and only create module-level constants where behavior is already module-level today.
- Changing CORS or bearer defaults could break auth. Mitigation: tests explicitly pin current behavior.
- Over-migrating too many files can create broad regressions. Mitigation: first pass touches only boot/scan/metrics files.

## Success Criteria

- Direct `process.env.*` reads are removed from the targeted files except test-only or explicitly justified cases.
- Existing runtime behavior is preserved.
- New config tests pass.
- API typecheck passes.
- Root `npm run typecheck` still passes.
