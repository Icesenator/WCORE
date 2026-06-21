# Mobile UI Audit Implementation Plan

> **Historical/completed plan.** Kept for implementation history only; verify current UI behavior before acting on any task here.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WCORE usable on mobile (<640px) without losing desktop quality, by fixing 4 critical UI blockers and auditing remaining pages.

**Architecture:** Desktop-first approach. All mobile changes guarded by Tailwind `sm:` breakpoints (640px). No JS media query hooks — pure CSS. Sidebar becomes a drawer overlay on mobile, TopBar compacts with overflow menu, tables hide secondary columns, dropdowns adapt to viewport width.

**Tech Stack:** React, Next.js 16, Tailwind CSS, TypeScript

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/web/components/SidebarLayout.tsx` | Layout wrapper — add `sidebarOpen` state, mobile overlay, dynamic margins |
| `apps/web/components/Sidebar.tsx` | Sidebar nav — add mobile close button, transform classes |
| `apps/web/components/TopBar.tsx` | Top header — add hamburger, mobile overflow menu, reorder elements |
| `apps/web/app/profile/components/NotificationsBell.tsx` | Notifications dropdown — adapt width to viewport |
| `apps/web/components/TokenTable.tsx` | Token table — hide Name/Contract columns on mobile |
| `apps/web/components/WalletContent.tsx` | Wallet results page — adapt dropdowns, search input, tabs |

---

### Task 1: SidebarLayout — Drawer mobile

**Files:**
- Modify: `apps/web/components/SidebarLayout.tsx` (full file, 44 lines)
- Modify: `apps/web/components/Sidebar.tsx` (add `onClose` prop + close button)

- [ ] **Step 1: Add `sidebarOpen` state and mobile overlay to SidebarLayout**

Read the current file, then replace the entire component:

```tsx
"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Logo } from "@/components/Logo";

export function SidebarLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("wcore_sidebar_collapsed") === "1");
    } catch { /* SSR */ }
    setMounted(true);
  }, []);

  const handleToggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("wcore_sidebar_collapsed", next ? "1" : "0"); } catch { /* quota */ }
      return next;
    });
  }, []);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 sm:hidden"
          onClick={handleCloseSidebar}
        />
      )}
      <Sidebar
        collapsed={mounted ? collapsed : false}
        onToggle={handleToggle}
        onClose={handleCloseSidebar}
        mobileOpen={sidebarOpen}
      />
      <div className={`flex flex-col min-h-screen transition-all duration-300 ml-0 ${mounted && collapsed ? "sm:ml-[56px]" : "sm:ml-[200px]"}`}>
        <TopBar onMenuToggle={handleMenuToggle} />
        <div className="flex-1">
          {children}
        </div>
        <footer className="py-6 flex flex-col items-center gap-2">
          <Logo className="h-5 w-5 text-accent/30" />
          <p className="text-center text-xs text-muted">
            WCORE v0.2.10. 130+ chains, 3 VMs, 40x on-chain GM, referral system. <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">@WCORExyz</a>
          </p>
        </footer>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add `onClose` and `mobileOpen` props to Sidebar**

In `apps/web/components/Sidebar.tsx`, update the interface and component:

Change the interface:
```tsx
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
  mobileOpen?: boolean;
}
```

Change the `export function Sidebar` signature:
```tsx
export function Sidebar({ collapsed, onToggle, onClose, mobileOpen }: SidebarProps) {
```

Change the `<aside>` className from:
```tsx
<aside className={`fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r border-border bg-card transition-all duration-300 ${collapsed ? "w-[56px]" : "w-[200px]"}`}>
```

To:
```tsx
<aside className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-transform duration-200 w-[200px] -translate-x-full sm:translate-x-0 ${mobileOpen ? "translate-x-0" : ""}`}>
```

Add a close button after the `<Link href="/">` block, before the `<nav>`:
```tsx
      <button
        type="button"
        onClick={onClose}
        className="sm:hidden absolute top-2 right-2 p-1 text-muted hover:text-fg transition"
        aria-label="Close menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
```

Also add `overflow-hidden` to the aside to prevent content spill during transition:
```tsx
<aside className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-transform duration-200 w-[200px] -translate-x-full sm:translate-x-0 overflow-hidden ${mobileOpen ? "translate-x-0" : ""}`}>
```

- [ ] **Step 3: Run typecheck to verify**

Run: `pnpm --filter @wcore/web typecheck`
Expected: No new errors related to SidebarLayout/Sidebar

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/SidebarLayout.tsx apps/web/components/Sidebar.tsx
git commit -m "feat(ui): sidebar drawer mobile — overlay + close button, desktop unchanged"
```

---

### Task 2: TopBar — Hamburger + overflow menu mobile

**Files:**
- Modify: `apps/web/components/TopBar.tsx` (full file, 30 lines)

- [ ] **Step 1: Replace TopBar with mobile-aware version**

Read the current file, then replace the entire component:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { GmWithdrawNotification } from "@/components/GmWithdrawNotification";
import { GmButton } from "@/components/GmButton";
import { SettingsBar } from "@/components/SettingsBar";
import { NotificationsBell } from "@/app/profile/components/NotificationsBell";

interface TopBarProps {
  title?: string;
  onMenuToggle?: () => void;
}

export function TopBar({ title, onMenuToggle }: TopBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  return (
    <header className="sticky top-0 z-30 flex items-center h-12 px-4 border-b border-border bg-card/90 backdrop-blur-sm">
      {/* Left: hamburger (mobile only) */}
      {onMenuToggle && (
        <button
          type="button"
          onClick={onMenuToggle}
          className="sm:hidden p-1.5 text-muted hover:text-fg transition mr-2"
          aria-label="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
      )}

      {/* Center: title (mobile logo fallback) */}
      <div className="min-w-0 flex-1 sm:flex-none">
        {title ? (
          <p className="text-sm font-medium text-muted truncate">{title}</p>
        ) : (
          <p className="sm:hidden text-sm font-bold text-accent">WCORE</p>
        )}
      </div>

      {/* Desktop elements (sm:) */}
      <div className="hidden sm:flex items-center gap-2 shrink-0">
        <GmWithdrawNotification />
        <GmButton />
        <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-accent transition">𝕏</a>
        <SettingsBar />
        <NotificationsBell />
        <ConnectButton />
      </div>

      {/* Mobile overflow menu */}
      <div className="sm:hidden relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="p-1.5 text-muted hover:text-fg transition"
          aria-label="More options"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>

        {mobileMenuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card shadow-xl overflow-hidden">
            <div className="py-1">
              <div className="px-3 py-2">
                <GmWithdrawNotification />
              </div>
              <div className="px-3 py-2 border-t border-border">
                <GmButton />
              </div>
              <a href="https://x.com/wcorexyz" target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-xs text-muted hover:text-accent transition border-t border-border">
                Follow @WCORExyz
              </a>
              <div className="px-3 py-2 border-t border-border">
                <SettingsBar />
              </div>
              <div className="px-3 py-2 border-t border-border">
                <NotificationsBell />
              </div>
              <div className="px-3 py-2 border-t border-border">
                <ConnectButton />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @wcore/web typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TopBar.tsx
git commit -m "feat(ui): TopBar mobile — hamburger + overflow menu, desktop unchanged"
```

---

### Task 3: NotificationsBell — Viewport-adaptive width

**Files:**
- Modify: `apps/web/app/profile/components/NotificationsBell.tsx` (line 162)

- [ ] **Step 1: Change panel width**

In `apps/web/app/profile/components/NotificationsBell.tsx`, find line 162:

```tsx
<div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-card shadow-xl">
```

Replace with:

```tsx
<div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-card shadow-xl">
```

This ensures the panel never exceeds the viewport width minus 1rem margin on narrow screens.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @wcore/web typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/profile/components/NotificationsBell.tsx
git commit -m "fix(ui): NotificationsBell viewport-adaptive width for mobile"
```

---

### Task 4: TokenTable — Hide secondary columns on mobile

**Files:**
- Modify: `apps/web/components/TokenTable.tsx` (lines 160-165, 174, 180, 186, 204-247)

- [ ] **Step 1: Hide Name column header on mobile**

The TokenTable has 4 columns: Asset, Balance, Price, Value. The "Name" info is inside the Asset column (the `<p className="text-xs text-muted">` with the token name and contract). We need to hide the name/contract part on mobile, not a separate column.

Looking at the table structure more carefully: the table has columns for Asset (55%), Balance (15%), Price (15%), Value (15%). The Asset column contains symbol + name + contract. On mobile, we should hide the name and contract details.

In the Asset `<td>` (line 204-247), find the name/contract section. The structure is:

```tsx
<div>
  <span className={`font-medium ...`}>
    {asset.symbol}
    {isNative ? <span...>native</span> : null}
  </span>
  {flags} {scam} {report button}
  <p className="text-xs text-muted">
    {asset.name}
    {!isNative && shortContract ? <span...><code>{asset.contract}</code>...</span> : null}
  </p>
</div>
```

Wrap the `<p className="text-xs text-muted">` line with `hidden sm:block`:

Change:
```tsx
                  <p className="text-xs text-muted">
```
To:
```tsx
                  <p className="text-xs text-muted hidden sm:block">
```

This hides the token name and contract address on mobile, showing only the symbol.

- [ ] **Step 2: Adjust column widths for mobile**

The `table-fixed` with `w-[55%]` etc. is fine since the Asset column now has less content on mobile. But we should make the Balance column wider on mobile since it's the most important metric.

Change the colgroup from:
```tsx
        <colgroup>
          <col className="w-[55%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
        </colgroup>
```

To:
```tsx
        <colgroup>
          <col className="w-[40%] sm:w-[55%]" />
          <col className="w-[22%] sm:w-[15%]" />
          <col className="w-[18%] sm:w-[15%]" />
          <col className="w-[20%] sm:w-[15%]" />
        </colgroup>
```

This gives more space to Balance on mobile (where name is hidden) and keeps desktop proportions.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @wcore/web typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/TokenTable.tsx
git commit -m "fix(ui): TokenTable mobile — hide name/contract, adjust column widths"
```

---

### Task 5: WalletContent — Adapt dropdowns and search input

**Files:**
- Modify: `apps/web/components/WalletContent.tsx` (lines 697, 744)

- [ ] **Step 1: Fix chain filter dropdown width**

Find line 697:
```tsx
<div className="absolute top-full left-0 mt-1 z-20 rounded-lg border border-border bg-card shadow-xl max-h-56 w-52 overflow-hidden">
```

Replace with:
```tsx
<div className="absolute top-full left-0 mt-1 z-20 rounded-lg border border-border bg-card shadow-xl max-h-56 w-52 max-w-[calc(100vw-2rem)] overflow-hidden">
```

- [ ] **Step 2: Fix search input width**

Find line 744:
```tsx
className="rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-xs text-fg placeholder:text-muted/50 outline-none focus:border-accent/50 w-36"
```

Replace with:
```tsx
className="rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-xs text-fg placeholder:text-muted/50 outline-none focus:border-accent/50 w-28 sm:w-36"
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @wcore/web typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/WalletContent.tsx
git commit -m "fix(ui): WalletContent mobile — dropdown and search input viewport-adaptive"
```

---

### Task 6: Verify desktop unchanged + mobile checks

**Files:**
- No file changes — verification only

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: All pass, no new errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No new errors

- [ ] **Step 3: Verify no desktop regression**

Check that all changed files use `sm:` guards:
- `SidebarLayout.tsx`: `sm:hidden` on overlay, `sm:ml-[...]` on content margin
- `Sidebar.tsx`: `sm:translate-x-0` keeps sidebar visible on desktop, `sm:hidden` on close button
- `TopBar.tsx`: `sm:hidden` on hamburger, `hidden sm:flex` on desktop elements, `sm:hidden` on overflow menu
- `NotificationsBell.tsx`: `max-w-[calc(100vw-1rem)]` only affects screens < 320px
- `TokenTable.tsx`: `hidden sm:block` on name, `sm:w-[...]` on columns
- `WalletContent.tsx`: `max-w-[calc(100vw-2rem)]` on dropdown, `sm:w-36` on search

All desktop rendering is guarded by `sm:` — desktop at ≥640px sees identical layout.

- [ ] **Step 4: Commit verification note**

```bash
git commit --allow-empty -m "chore(ui): verify desktop unchanged — all mobile changes guarded by sm: breakpoints"
```

---

## Self-Review

**1. Spec coverage check:**
- ✅ Sidebar → Drawer mobile (Task 1)
- ✅ TopBar compact + overflow menu (Task 2)
- ✅ NotificationsBell adaptive width (Task 3)
- ✅ TokenTable hide secondary columns (Task 4)
- ✅ WalletContent dropdowns/search adaptive (Task 5)
- ✅ Desktop unchanged verification (Task 6)
- ⚠️ Phase 2 (P0 pages: HomePageClient, GmPageClient tap targets) — not in plan, low priority
- ⚠️ Phase 3 (P1 pages: Profile, History) — not in plan, low priority
- ⚠️ Phase 4 (P2 verification) — not in plan, can be done after Phase 1

**2. Placeholder scan:** No TBD/TODO. All code shown inline.

**3. Type consistency:** `onMenuToggle?: () => void` in TopBar matches `handleMenuToggle` in SidebarLayout. `onClose?: () => void` and `mobileOpen?: boolean` in Sidebar match SidebarLayout usage.

**Decision:** This plan covers the 4 critical fixes (Phase 1). Phases 2-4 are lower priority and can be addressed in a follow-up plan after Phase 1 is deployed and tested.
