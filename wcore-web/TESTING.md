# Testing

## Fast Checks

```powershell
pnpm typecheck
pnpm --filter @wcore/core test
pnpm --filter @wcore/web test
```

For an exact web test file, prefer the Node runner directly because the web package script may run all files under `__tests__`:

```powershell
node --import tsx --test __tests__/use-scan-orchestrator.test.ts
```

## API Tests

API tests may require `TEST_DATABASE_URL`, `TEST_REDIS_URL`, and `JWT_SECRET`. Never point test variables at production.

```powershell
pnpm --filter @wcore/api test
```

For targeted Node test files from `wcore-web`:

```powershell
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test --test-force-exit src/gamification.test.ts
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test --test-force-exit test/admin-plugins.test.ts
```

## Chain Extraction Checks

Run these from the repository root when touching Apps Script chain config or generated chain output:

```powershell
npm --prefix wcore-gsheet run validate:static
npm --prefix wcore-gsheet run build:chains
npm --prefix wcore-gsheet run test:phase3-chains
```

## Before Deploy

```powershell
pnpm typecheck
pnpm build
npm --prefix ../wcore-gsheet run validate:static
npm --prefix ../wcore-gsheet run build:chains
```

Deploy API and web sequentially, not in parallel:

```powershell
powershell -File scripts/deploy.ps1 -Service api
powershell -File scripts/deploy.ps1 -Service web
```
