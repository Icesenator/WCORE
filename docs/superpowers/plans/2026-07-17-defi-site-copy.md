# DeFi Site Copy Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Home, About, footer, metadata and sharing copy with the deployed DeFi Position Engine V1 without overstating protocol coverage.

**Architecture:** Keep all copy in its existing owning components and add one static contract test that reads those files. No shared copy abstraction is introduced because each surface has distinct sentence length and context.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node test runner, Railway.

---

### Task 1: Define The Public Copy Contract

**Files:**
- Create: `wcore-web/apps/web/__tests__/site-copy.test.ts`

- [ ] **Step 1: Write the failing static copy test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = resolve(import.meta.dirname, "..");

function source(path: string): string {
  return readFileSync(resolve(WEB, path), "utf8");
}

test("public site copy advertises selected DeFi coverage without stale claims", () => {
  const home = source("app/page.tsx");
  const homeClient = source("app/HomePageClient.tsx");
  const about = source("app/about/page.tsx");
  const layout = source("app/layout.tsx");
  const footer = source("components/SidebarLayout.tsx");
  const welcome = source("components/WelcomeModal.tsx");
  const all = [home, homeClient, about, layout, footer, welcome].join("\n");

  assert.match(home, /Selected DeFi positions/);
  assert.match(homeClient, /Compound V3 collateral and debt/);
  assert.match(about, /Selected DeFi positions/);
  assert.match(layout, /183 tracked chains/);
  assert.match(footer, /183 tracked chains.*Selected DeFi.*7 CEX.*80\+ GM chains/s);
  assert.match(welcome, /Selected DeFi positions/);
  assert.doesNotMatch(all, /170\+ chains|Complex DeFi positions .* are not yet tracked|TON \(new\)|CEX \(new\)|Smart cache/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `wcore-web`:

```powershell
rtk proxy pnpm --filter @wcore/web exec tsx --test __tests__/site-copy.test.ts
```

Expected: FAIL because Home, metadata, footer and WelcomeModal do not yet contain the canonical DeFi wording.

- [ ] **Step 3: Commit the failing contract test**

```powershell
rtk git add wcore-web/apps/web/__tests__/site-copy.test.ts
rtk git commit -m "test: define DeFi site copy contract"
```

### Task 2: Align Home, About, Footer And Sharing

**Files:**
- Modify: `wcore-web/apps/web/app/page.tsx`
- Modify: `wcore-web/apps/web/app/HomePageClient.tsx`
- Modify: `wcore-web/apps/web/app/about/page.tsx`
- Modify: `wcore-web/apps/web/app/layout.tsx`
- Modify: `wcore-web/apps/web/components/SidebarLayout.tsx`
- Modify: `wcore-web/apps/web/components/WelcomeModal.tsx`
- Test: `wcore-web/apps/web/__tests__/site-copy.test.ts`

- [ ] **Step 1: Update the Home hero and mini-card**

Use this supporting line in `app/page.tsx`:

```tsx
<p className="text-sm text-muted mt-0.5">183 chains. 4 VMs. Selected DeFi positions. Real-time pricing, on-chain GM, 7 CEX.</p>
```

Replace the `Smart cache` mini-card with:

```tsx
<MiniCard icon="🌐" label="DeFi positions" />
```

- [ ] **Step 2: Add the fourth Home feature card**

Change the grid to:

```tsx
<div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
```

Add this card after the chain card:

```tsx
<div className="rounded-xl border border-border bg-card p-5">
  <div className="mb-2 text-2xl">🌐</div>
  <h3 className="text-sm font-semibold mb-1">Selected DeFi positions</h3>
  <p className="text-xs text-muted leading-relaxed">
    Track Compound V3 collateral and debt, WCT, Chainbase and selected staked assets. Net values stay signed, while [Flex] and [Lock] show current liquidity.
  </p>
</div>
```

- [ ] **Step 3: Align About copy**

Use this summary:

```tsx
<p className="mb-8 text-sm text-muted">Your crypto. Every chain. One view. 183 chains, selected DeFi positions, 80+ GM contracts and 7 CEX sources. Read only. Free.</p>
```

Rename `TON (new)` to `TON`, `CEX (new)` to `CEX`, replace the dead-chain paragraph with:

```tsx
<p className="mt-3 text-muted text-xs">
  Chains without live RPC endpoints are auto-skipped by the scan engine. Their configurations remain available for reactivation when reliable infrastructure returns.
</p>
```

Add this feature card and include Kraken in the CEX card:

```tsx
<div className="flex gap-2"><span className="text-accent">🌐</span><span className="text-muted text-xs"><strong className="text-fg">Selected DeFi positions</strong>. Compound V3, WCT, Chainbase and selected staked assets with signed debt and liquidity status.</span></div>
```

- [ ] **Step 4: Compact the footer**

Replace the current footer paragraph with:

```tsx
<p className="text-center text-xs text-muted">183 tracked chains · 4 VMs · Selected DeFi · 7 CEX · 80+ GM chains</p>
<p className="text-center text-xs text-muted">
  Read only{coreVersion ? ` · v${coreVersion}` : ""} · <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@WCORExyz</a>
</p>
```

- [ ] **Step 5: Update metadata and Welcome sharing**

Use this metadata description in `app/layout.tsx`:

```ts
description: "Your crypto. Every chain. One view. 183 tracked chains across EVM, Solana, Cosmos and TON, selected DeFi positions, real-time pricing, on-chain GM and 7 CEX sources. Read only. Free.",
```

Use this share text in `WelcomeModal.tsx`:

```ts
const shareText = encodeURIComponent(
  "Tracking my portfolio across 183 chains and 7 CEX with WCORE\n\n" +
  "EVM · Solana · Cosmos · TON · Selected DeFi positions · Read only\n\n" +
  (refLink ? `Join with my referral: ${refLink}` : "Join now: https://wcore.xyz")
);
```

- [ ] **Step 6: Run the copy test and verify GREEN**

```powershell
rtk proxy pnpm --filter @wcore/web exec tsx --test __tests__/site-copy.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the aligned public copy**

```powershell
rtk git add wcore-web/apps/web/app/page.tsx wcore-web/apps/web/app/HomePageClient.tsx wcore-web/apps/web/app/about/page.tsx wcore-web/apps/web/app/layout.tsx wcore-web/apps/web/components/SidebarLayout.tsx wcore-web/apps/web/components/WelcomeModal.tsx
rtk git commit -m "feat: align site copy with DeFi V1"
```

### Task 3: Verify And Deploy

**Files:**
- Verify: `wcore-web/apps/web/__tests__/site-copy.test.ts`

- [ ] **Step 1: Run Web unit tests**

```powershell
rtk proxy pnpm --filter @wcore/web test
```

Expected: all Web unit tests pass.

- [ ] **Step 2: Run Web typecheck**

```powershell
rtk proxy pnpm --filter @wcore/web typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run the production build**

```powershell
rtk proxy pnpm --filter @wcore/web build
```

Expected: Next.js build completes and lists `/` and `/about` successfully.

- [ ] **Step 4: Verify the final diff**

```powershell
rtk git diff --check
rtk git status --short --branch
```

Expected: no whitespace errors and only intended committed changes.

- [ ] **Step 5: Deploy Web sequentially**

Run from `wcore-web`:

```powershell
rtk powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy.ps1 -Service web
```

Expected: Railway reports `Deploy complete`.

- [ ] **Step 6: Verify production copy**

```powershell
rtk node -e "Promise.all([fetch('https://wcore.xyz').then(r=>r.text()),fetch('https://wcore.xyz/about').then(r=>r.text())]).then(([h,a])=>{if(!h.includes('Selected DeFi positions')||!a.includes('Broader DeFi coverage')||h.includes('Smart cache'))process.exit(1);console.log('site copy live')})"
```

Expected: `site copy live`.

- [ ] **Step 7: Push committed changes**

```powershell
rtk git push origin master
```

Expected: `master` pushed without force and GitHub CI starts.
