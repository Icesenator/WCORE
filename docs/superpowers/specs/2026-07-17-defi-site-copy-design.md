# DeFi Site Copy Alignment Design

**Date:** 2026-07-17
**Status:** Approved

## Goal

Align every public marketing surface with the deployed DeFi Position Engine V1 without implying general DeFi coverage.

## Messaging Rule

Use `Selected DeFi positions` as the canonical public wording. WCORE currently supports selected staking and lending positions, including Compound V3, WCT, Chainbase and staked-asset mirrors. It does not claim broad LP, vault or protocol coverage.

## Surfaces

### Home Hero

- Keep `Your crypto. Every chain. One view.`
- Update the supporting line to include `183 chains`, `4 VMs`, `Selected DeFi positions`, real-time pricing, on-chain GM and `7 CEX`.
- Replace the low-value `Smart cache` mini-card with `DeFi positions` so the 12-card grid remains balanced.

### Home Feature Grid

- Expand the three-card feature grid to four cards on wide screens.
- Add a `Selected DeFi positions` card describing Compound V3 collateral/debt, WCT, Chainbase, staked assets, net values and `[Flex]`/`[Lock]` states.
- Keep the existing chain, CEX and GM cards.
- Avoid `all DeFi`, `full DeFi` and protocol-count claims.

### About

- Add `selected DeFi positions` to the summary and Features list.
- Keep the explicit limitation that broad LP, vault and protocol coverage remains incomplete.
- Keep `Broader DeFi coverage` in What's next.
- Add Kraken to the CEX feature list.
- Remove stale `(new)` labels from TON and CEX.
- Replace the hardcoded dead-chain count and names with a stable statement that unavailable chains are auto-skipped while their configurations remain available for reactivation.

### Footer

- Replace the long prose sentence with two compact lines.
- Capability line: `183 tracked chains · 4 VMs · Selected DeFi · 7 CEX · 80+ GM chains`.
- Trust/status line: `Read only`, dynamic core version when available and `@WCORExyz`.
- Preserve the WCORE logo and existing responsive layout.

### Metadata And Sharing

- Update global metadata from stale `170+` to `183 tracked chains`.
- Include selected DeFi positions and read-only positioning in the description.
- Update WelcomeModal sharing text to include TON, selected DeFi positions and 7 CEX while remaining short enough for X.

## Files

- `wcore-web/apps/web/app/page.tsx`
- `wcore-web/apps/web/app/HomePageClient.tsx`
- `wcore-web/apps/web/app/about/page.tsx`
- `wcore-web/apps/web/app/layout.tsx`
- `wcore-web/apps/web/components/SidebarLayout.tsx`
- `wcore-web/apps/web/components/WelcomeModal.tsx`
- `wcore-web/apps/web/__tests__/site-copy.test.ts`

## Verification

- A static test reads the six public-copy files and verifies canonical claims (`183`, `Selected DeFi`, `7 CEX`) while rejecting stale `170+` and the old blanket DeFi limitation.
- Run Web unit tests, typecheck and production build.
- Deploy Web through `wcore-web/scripts/deploy.ps1 -Service web`.
- Verify `/`, `/about` and rendered metadata in production.

## Non-Goals

- No new DeFi page.
- No layout redesign beyond adding the fourth Home feature card and compacting the footer.
- No protocol expansion or scan behavior changes.
- No claims that every chain supports every DeFi protocol.
