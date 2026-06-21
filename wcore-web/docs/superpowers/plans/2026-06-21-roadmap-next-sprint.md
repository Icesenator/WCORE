# Roadmap Next Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the next concrete WCORE roadmap sprint: close public observability exposure, add missing scan/GM tests, document contributor workflows, and prepare the first chain sunset.

**Architecture:** Keep changes small and reversible. Security guards are added at the Fastify route boundary, tests are added before behavior changes, docs are focused onboarding files, and chain sunset work is gated behind explicit validation so users keep visibility until the public deadline.

**Tech Stack:** Fastify, Node test runner, Next.js 16, React hooks, Prisma, pnpm, Apps Script chain extraction via `wcore-gsheet`.

---

## Scope From Roadmap

This plan targets only active roadmap items, not historical sections below the roadmap banner.

- Protect or reduce public metrics endpoints: `/api/stats`, `/api/circuit`.
- Add tests for `useScanOrchestrator`.
- Add stronger GM on-chain POST route coverage.
- Add onboarding docs: `CONTRIBUTING.md`, `TESTING.md`.
- Prepare the date-driven Swellchain sunset work without removing coverage before the deadline.

---

### Task 1: Protect Public Observability Endpoints

**Files:**
- Modify: `apps/api/src/plugins/chains.ts`
- Test: `apps/api/test/admin-plugins.test.ts`

- [ ] **Step 1: Add failing tests for `/api/stats` and `/api/circuit` admin guards**

Append these tests to `apps/api/test/admin-plugins.test.ts` inside the existing `describe("admin plugin - privilege guards", ...)` block:

```ts
  test("GET /api/stats returns 401 without admin token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/stats" });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });

  test("GET /api/circuit returns 401 without admin token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/circuit" });
    assert.equal(res.statusCode, 401);
    const data = JSON.parse(res.payload) as { error?: string };
    assert.equal(data.error, "unauthorized");
  });
```

- [ ] **Step 2: Run the targeted API test and confirm it fails**

Run from `wcore-web`:

```powershell
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test --test-force-exit test/admin-plugins.test.ts
```

Expected before implementation: the two new tests fail because both endpoints currently return `200`.

- [ ] **Step 3: Add an admin guard helper in `chains.ts`**

Modify `apps/api/src/plugins/chains.ts` imports:

```ts
import { isAdminAuthorized } from "../admin-auth.js";
```

Inside `chainsPlugin`, before the route declarations, add:

```ts
  const requireAdmin = (req: { headers: Record<string, string | string[] | undefined> }, reply: { code: (statusCode: number) => unknown }) => {
    if (isAdminAuthorized(req)) return true;
    reply.code(401);
    return false;
  };
```

- [ ] **Step 4: Guard `/api/stats` and `/api/circuit`**

Replace the two routes in `apps/api/src/plugins/chains.ts` with:

```ts
  app.get("/api/stats", async (req, reply) => {
    if (!requireAdmin(req, reply)) return { error: "unauthorized" };
    return {
      ...metrics.snapshot(),
      chainCount: chainList.length,
      circuits: Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()])),
    };
  });

  app.get("/api/circuit", async (req, reply) => {
    if (!requireAdmin(req, reply)) return { error: "unauthorized" };
    return {
      circuits: Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()])),
    };
  });
```

- [ ] **Step 5: Run targeted and broad API checks**

Run:

```powershell
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test --test-force-exit test/admin-plugins.test.ts
pnpm --filter @wcore/api typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/plugins/chains.ts apps/api/test/admin-plugins.test.ts
git commit -m "fix(api): protect observability endpoints"
```

---

### Task 2: Add `useScanOrchestrator` Regression Tests

**Files:**
- Create: `apps/web/__tests__/use-scan-orchestrator.test.tsx`
- Modify only if needed: `apps/web/hooks/useScanOrchestrator.ts`

- [ ] **Step 1: Create a hook test harness**

Create `apps/web/__tests__/use-scan-orchestrator.test.tsx`:

```tsx
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useScanOrchestrator } from "../hooks/useScanOrchestrator";

const EVM = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

type HookState = ReturnType<typeof useScanOrchestrator>;

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

function Harness({ onState }: { onState: (state: HookState) => void }) {
  const state = useScanOrchestrator({
    addresses: [EVM],
    enabledAddresses: [EVM],
    chains: ["BASE", "SOLANA"],
    deepScan: false,
    customTokenList: [],
    labels: { [EVM.toLowerCase()]: "Main" },
  });
  useEffect(() => onState(state), [state, onState]);
  return null;
}

async function renderHook(onState: (state: HookState) => void) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness onState={onState} />);
  });
}

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  delete (globalThis as { fetch?: unknown }).fetch;
});

test("scan orchestrator filters chains by VM and records successful batch results", async () => {
  const states: HookState[] = [];
  (globalThis as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/chains")) {
      return new Response(JSON.stringify({ chains: [
        { key: "BASE", vm: "EVM", disabled: false },
        { key: "SOLANA", vm: "SVM", disabled: false },
      ] }), { status: 200 });
    }
    assert.equal(url.endsWith("/api/scan/batch"), true);
    const body = JSON.parse(String(init?.body)) as { chains: string[]; addresses: string[] };
    assert.deepEqual(body.chains, ["BASE"]);
    assert.deepEqual(body.addresses.map((a) => a.toLowerCase()), [EVM]);
    return new Response(JSON.stringify({ results: [{ address: EVM, chains: [{ chain: "BASE", vm: "EVM", assets: [], totalEur: 12, errors: [] }] }] }), { status: 200 });
  };

  await renderHook((state) => states.push(state));
  await act(async () => {
    states.at(-1)!.startScan(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  const finalState = states.at(-1)!;
  assert.equal(finalState.results?.[0]?.label, "Main");
  assert.equal(finalState.results?.[0]?.totalEur, 12);
  assert.equal(finalState.progress.done, 1);
});
```

- [ ] **Step 2: Run the new test and confirm the actual gap**

Run from `wcore-web`:

```powershell
pnpm --filter @wcore/web test -- use-scan-orchestrator.test.tsx
```

Expected before any fix: either pass if the hook is already correct, or fail with the exact regression to fix.

- [ ] **Step 3: If the test fails because browser globals are missing, use the repo's existing web test setup**

If `document is not defined` or JSX transform errors appear, align the test file with the existing `apps/web/__tests__/*.test.ts` style instead of adding a new test framework. Do not add a new dependency unless all existing web tests already use it.

- [ ] **Step 4: Fix only the failing behavior**

If the test reveals a real bug, apply the smallest change inside `apps/web/hooks/useScanOrchestrator.ts`. Preserve these invariants:

```ts
// EVM address must not trigger SVM/Cosmos/TON batches.
const matchingChains = matchChains(addrVm, chains);

// Later scan runs must not be overwritten by older in-flight runs.
if (c || myRunId !== scanRunIdRef.current) return;
```

- [ ] **Step 5: Run web tests and typecheck**

```powershell
pnpm --filter @wcore/web test -- use-scan-orchestrator.test.tsx
pnpm --filter @wcore/web typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/__tests__/use-scan-orchestrator.test.tsx apps/web/hooks/useScanOrchestrator.ts
git commit -m "test(web): cover scan orchestrator batching"
```

---

### Task 3: Strengthen GM On-Chain POST Route Tests

**Files:**
- Modify: `apps/api/src/gamification.test.ts`
- Modify only if needed: `apps/api/src/gamification/gm-onchain.ts`

- [ ] **Step 1: Add anti-replay same-chain test**

Append this test near the existing `/api/gm/onchain` tests in `apps/api/src/gamification.test.ts`:

```ts
  test("POST /api/gm/onchain rejects replay of the same txHash on the same chain", async () => {
    await prisma.gmContract.upsert({
      where: { chainKey_contractAddress: { chainKey: "base", contractAddress: CONTRACT_A } },
      update: { ownerId: userA.id, creatorAddress: ADDR_A },
      create: { chainKey: "base", contractAddress: CONTRACT_A, ownerId: userA.id, creatorAddress: ADDR_A },
    });
    globalThis.fetch = async () => jsonResponse({
      result: {
        from: ADDR_A,
        to: CONTRACT_A,
        status: "0x1",
        logs: [{ address: CONTRACT_A, topics: [GM_EVENT_SIG, topicAddress(ADDR_A)], data: gmEventData(333n, 3n, 777n) }],
      },
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.31" },
      payload: { chainKey: "base", contractAddress: CONTRACT_A, txHash: "0xabc123" },
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/gm/onchain",
      headers: { authorization: `Bearer ${token(userA.id, ADDR_A)}`, "x-forwarded-for": "198.51.100.31" },
      payload: { chainKey: "BASE", contractAddress: CONTRACT_A, txHash: "0xabc123" },
    });

    assert.equal(first.statusCode, 200);
    assert.equal(replay.statusCode, 409);
    const count = await prisma.onchainGm.count({ where: { txHash: "0xabc123" } });
    assert.equal(count, 1);
  });
```

- [ ] **Step 2: Run the targeted GM test file**

Run from `wcore-web`:

```powershell
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test --test-force-exit src/gamification.test.ts
```

Expected: pass if anti-replay is already correct; fail if same-chain mixed-case replay still double-inserts.

- [ ] **Step 3: Fix only if the new test fails**

If it fails, update the replay pre-check in `apps/api/src/gamification/gm-onchain.ts` to query case-insensitively before insert:

```ts
const existing = await prisma.onchainGm.findFirst({
  where: {
    chainKey: { equals: canonicalChainKey(chainKey), mode: "insensitive" },
    txHash: txHash.toLowerCase(),
  },
});
if (existing) {
  reply.code(409);
  return { error: "gm_already_recorded" };
}
```

- [ ] **Step 4: Run full related tests**

```powershell
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test --test-force-exit src/gamification.test.ts src/gamification/gm-chainkey.test.ts src/gamification/gm-streak-rebuild.test.ts
pnpm --filter @wcore/api typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/gamification.test.ts apps/api/src/gamification/gm-onchain.ts
git commit -m "test(api): cover gm onchain replay guard"
```

---

### Task 4: Add Contributor And Testing Docs

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `TESTING.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Create `CONTRIBUTING.md`**

Create `wcore-web/CONTRIBUTING.md`:

```md
# Contributing

## Ground Rules

- Keep changes small and focused.
- Do not commit secrets, `.env*`, database URLs, API keys, Railway tokens, or provider credentials.
- Do not edit generated chain configs by hand. Change `../wcore-gsheet/src/*.gs`, then run `npm --prefix ../wcore-gsheet run build:chains`.
- Use `scripts/deploy.ps1 -Service api|web` for Railway deploys. Do not run bare `railway up` from the repo root.

## Local Workflow

```powershell
pnpm install
pnpm typecheck
pnpm test
```

## Commit Style

- `fix(api): ...` for backend fixes.
- `fix(web): ...` for frontend fixes.
- `test(...): ...` for test-only changes.
- `docs: ...` for documentation-only changes.
```

- [ ] **Step 2: Create `TESTING.md`**

Create `wcore-web/TESTING.md`:

```md
# Testing

## Fast Checks

```powershell
pnpm typecheck
pnpm --filter @wcore/core test
pnpm --filter @wcore/web test
```

## API Tests

API tests may require `TEST_DATABASE_URL`, `TEST_REDIS_URL`, and `JWT_SECRET`. Never point test variables at production.

```powershell
pnpm --filter @wcore/api test
```

For targeted Node test files:

```powershell
pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test --test-force-exit src/gamification.test.ts
```

## Chain Extraction Checks

Run from the monorepo root:

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
```

- [ ] **Step 3: Link docs from `README.md`**

Add to `wcore-web/README.md` under quick links or setup:

```md
## Contributor Docs

- [CONTRIBUTING.md](./CONTRIBUTING.md) - contribution rules and workflow.
- [TESTING.md](./TESTING.md) - test commands and environment requirements.
```

- [ ] **Step 4: Update roadmap backlog**

In `wcore-web/ROADMAP.md`, mark the onboarding docs item as done in the active backlog section:

```md
- Add or finish onboarding docs (`CONTRIBUTING.md`, `TESTING.md`) - done 2026-06-21.
```

- [ ] **Step 5: Verify docs only**

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6: Commit**

```powershell
git add CONTRIBUTING.md TESTING.md README.md ROADMAP.md
git commit -m "docs: add contributor testing guides"
```

---

### Task 5: Prepare Swellchain Sunset Execution

**Files:**
- Modify after deadline only: `../wcore-gsheet/src/SWELLCHAIN.gs` or equivalent key file if present
- Modify after deadline only: `../wcore-gsheet/dist/**` via extractor
- Modify after deadline only: `packages/shared/src/factories.ts`
- Modify after deadline only: `apps/web/lib/wagmi.ts`
- Modify after deadline only: `apps/web/app/dev/deploy/chain-data.ts`
- Modify after deadline only: `apps/web/lib/explorers.ts`
- Modify after deadline only: icon/native-symbol manifests if Swellchain appears there
- Test: existing GM/wagmi/chain tests

- [ ] **Step 1: Verify the public deadline has passed**

Do not disable or remove Swellchain before **2026-06-23**. If running this task before that date, stop after this step.

- [ ] **Step 2: Locate all Swellchain references**

Run from the monorepo root:

```powershell
rg -n "SWELL|swell|Swell" wcore-gsheet wcore-web
```

Expected: list all source, generated, GM, wagmi, explorer, icon, and docs references.

- [ ] **Step 3: Decide disable vs delete**

Prefer disable first unless the chain is fully dead and no claim tooling remains useful.

For a disable-first path, set the chain config flag in the canonical gsheet source:

```js
FLAGS: {
  DISABLE_CHAIN: true,
}
```

If the chain has GM factory support, remove or disable its active factory exposure so `/gm` does not invite new check-ins on a sunset chain.

- [ ] **Step 4: Regenerate chain package**

Run from the monorepo root:

```powershell
npm --prefix wcore-gsheet run build:chains
npm --prefix wcore-gsheet run test:phase3-chains
```

Expected: extraction still succeeds and chain counts update only if deletion was chosen.

- [ ] **Step 5: Update web consumers**

If Swellchain appears in `packages/shared/src/factories.ts`, remove its active factory entry or mark it unavailable according to current factory patterns.

If Swellchain appears in `apps/web/lib/wagmi.ts`, `apps/web/app/dev/deploy/chain-data.ts`, `apps/web/lib/explorers.ts`, icon manifests, or native symbols, remove only the surfaces that would still present it as active.

- [ ] **Step 6: Add a regression test**

If Swellchain had GM support, update or add a test in `apps/web/__tests__/gm-chains.test.ts` so sunset chains are not returned by active GM chain helpers.

Expected assertion shape:

```ts
assert.equal(activeChains.some((chain) => chain.key.toLowerCase().includes("swell")), false);
```

- [ ] **Step 7: Run verification**

```powershell
npm --prefix wcore-gsheet run validate:static
npm --prefix wcore-gsheet run build:chains
npm --prefix wcore-gsheet run test:phase3-chains
pnpm --dir wcore-web --filter @wcore/core test
pnpm --dir wcore-web --filter @wcore/web test -- gm-chains.test.ts wagmi-gm-chains.test.ts
pnpm --dir wcore-web typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add wcore-gsheet wcore-web
git commit -m "chore(chains): sunset Swellchain coverage"
```

---

### Task 6: Final Verification And Roadmap Update

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/AUDIT.md`
- Modify: `CHANGELOG.md` if behavior changed, not for tests/docs-only tasks

- [ ] **Step 1: Update active roadmap items**

For each completed task, update only the active top section of `wcore-web/ROADMAP.md`. Do not edit historical sections below the historical banner unless correcting a misleading cross-reference.

- [ ] **Step 2: Update audit checkboxes**

In `wcore-web/docs/AUDIT.md`, mark completed items with proof paths. Example:

```md
- [x] **P2-1 · Endpoints observabilité publics** — corrigé: `/api/stats` et `/api/circuit` exigent admin auth; tests `apps/api/test/admin-plugins.test.ts`.
```

- [ ] **Step 3: Run full verification subset**

Run from the monorepo root:

```powershell
npm --prefix wcore-gsheet run validate:static
npm --prefix wcore-gsheet run build:chains
npm --prefix wcore-gsheet run test:phase3-chains
pnpm --dir wcore-web typecheck
pnpm --dir wcore-web --filter @wcore/core test
pnpm --dir wcore-web --filter @wcore/web test
git diff --check
```

Expected: all pass.

- [ ] **Step 4: Commit final docs if needed**

```powershell
git add wcore-web/ROADMAP.md wcore-web/docs/AUDIT.md wcore-web/CHANGELOG.md
git commit -m "docs: update roadmap sprint status"
```

- [ ] **Step 5: Push**

```powershell
git push
```

---

## Self-Review

- Spec coverage: covers the active roadmap items visible at the top of `wcore-web/ROADMAP.md` and root `ROADMAP.md`: observability protection, missing scan/GM tests, onboarding docs, and Swellchain sunset.
- Placeholder scan: no task uses TBD/TODO/fill-in placeholders. The Swellchain task is intentionally date-gated and requires discovery because exact references must be verified after the deadline.
- Type consistency: route guard uses the existing `isAdminAuthorized(req)` helper; tests follow existing Node test runner patterns; chain extraction commands use the current `wcore-gsheet` scripts.
