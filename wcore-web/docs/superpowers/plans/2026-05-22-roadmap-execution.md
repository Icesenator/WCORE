# Roadmap Execution Plan — WCORE v0.2.25

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the consolidated TODO from `ROADMAP.md` (2026-05-22 reconsolidée) in 6 independent lots, each committable separately.

**Architecture:** Lots are ordered by priority (P0→P1→P2→P3→Growth). Each lot contains 2-5 independent tasks that can be committed as a batch. Lot 3 (Railway deploy) is gated on Railway availability.

**Tech Stack:** Node.js 24, pnpm, Fastify 5, Next.js 16, TypeScript, PowerShell, Playwright CDP, Git.

---

## Lot 1 — P0 Vérifs locales (sécurité / CI / migrations)

### Task 1.1: Vérifier l'état des migrations Railway localement

**Files:**
- Read: `apps/api/start-production.sh`
- Read: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Lire start-production.sh et vérifier le chemin migrate deploy**

Read `apps/api/start-production.sh` complet. Vérifier :
- `prisma migrate deploy` présent (pas `db push`)
- Gestion P3005 pour baseline
- Pas de `--accept-data-loss`

- [ ] **Step 2: Vérifier l'absence de colonnes Stripe dans le schéma Prisma**

```bash
rtk grep -r "stripeCustomerId\|stripeSubscriptionId\|subscriptionStatus" packages/db/prisma/schema.prisma
```
Expected: NO matches.

- [ ] **Step 3: Documenter dans ROADMAP.md**

Cocher `[x]` les items :
- "Vérifier l'état des migrations Railway"
- "Nettoyer les colonnes Stripe orphelines en base"

### Task 1.2: Vérifier la CI sécurité

**Files:**
- Read: `.github/workflows/ci.yml`

- [ ] **Step 1: Lire le workflow CI**

```bash
rtk grep -n "audit\|gitleaks\|security" .github/workflows/ci.yml
```
Vérifier que `pnpm audit --prod --audit-level=high` et `gitleaks-action` sont présents.

- [ ] **Step 2: Documenter résultat dans ROADMAP.md**

Cocher `[x]` l'item "Vérifier la CI sécurité active".

### Task 1.3: Revalider les findings sécurité locaux

**Files:**
- Check: `Get-NetTCPConnection -LocalPort 11434` (Ollama)
- Check: `.mcp/rpc-mcp.js` pour SSRF guards

- [ ] **Step 1: Vérifier Ollama bind**

```powershell
Get-NetTCPConnection -State Listen -LocalPort 11434
```
Doit montrer `127.0.0.1` ou `::1`, pas `::` ou `0.0.0.0`.

- [ ] **Step 2: Vérifier les guards SSRF dans rpc-mcp**

```bash
rtk grep -n "assertSafeEndpoint\|redirect\|blocked\|localhost" .mcp/rpc-mcp.js
```

- [ ] **Step 3: Documenter dans ROADMAP.md**

Cocher `[x]` l'item "Revalider les findings sécurité locaux".

---

## Lot 2 — P1 Cohérence docs / worktree

### Task 2.1: Fusionner les deux sections v0.2.25 de ROADMAP.md

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Identifier les deux sections**

Lire `ROADMAP.md` autour des lignes 19-62 (`État courant v0.2.25`) et 158-200 (`Complément v0.2.25`).

- [ ] **Step 2: Fusionner en une seule section**

Déplacer le contenu de "Complément v0.2.25" dans "État courant v0.2.25", supprimer le doublon de titre.

- [ ] **Step 3: Cocher l'item dans TODO consolidée**

### Task 2.2: Clarifier le diff HomePageClient.tsx

**Files:**
- Read: `apps/web/app/HomePageClient.tsx`

- [ ] **Step 1: Lire le fichier modifié et comprendre le diff**

```bash
git diff apps/web/app/HomePageClient.tsx
```

- [ ] **Step 2: Soit documenter soit revert**

Si le diff est intentionnel → ajouter une ligne dans ROADMAP.md. Si le diff est accidentel → `git checkout apps/web/app/HomePageClient.tsx`.

- [ ] **Step 3: Cocher l'item dans TODO consolidée**

### Task 2.3: Nettoyer les scripts X temporaires

**Files:**
- Delete/Dearchive: `scripts/x-dm-*`, `scripts/x-retry-*`, `scripts/x-verify-*`, `scripts/x-delete-*`, `scripts/x-inspect-*`, `scripts/x-check-*`, `scripts/x-aaladin-*`, `scripts/x-inkhub.js`, `scripts/x-morning.js`

- [ ] **Step 1: Lister les scripts temporaires**

```bash
rtk ls scripts/x-*.js
```

- [ ] **Step 2: Garder les réutilisables, déplacer les one-off**

Scripts à garder : `x-cycle-v2.js`, `x-search-morning.js`, `x-search-discovery-large.js`, `x-cycle-global-scan.js`, `x-search-cycle.js`, `x-engagement-cycle.js`, `x-cycle-*.js` (cycles documentés).

Scripts à archiver dans `scripts/archive-x/` : tous les `x-dm-*`, `x-retry-*`, `x-verify-*`, `x-delete-*`, `x-inspect-*`, `x-check-*`, `x-aaladin-*`, `x-inkhub.js`, `x-morning.js` (one-off utilisés puis obsolètes).

- [ ] **Step 3: Cocher l'item dans TODO consolidée**

### Task 2.4: Synchroniser versions et compteurs dans les docs racine

**Files:**
- Modify: `README.md`, `AGENTS.md`, `DEPLOY.md`

- [ ] **Step 1: Vérifier les versions actuelles**

```bash
rtk grep -n "v0\.2\.\|180.*chain\|Stripe\|batch scan" README.md AGENTS.md DEPLOY.md
```

- [ ] **Step 2: Corriger si nécessaire**

Vérifier et corriger :
- `AGENTS.md` : version `v0.2.25` (pas `v0.2.24`)
- `README.md` : mention 180+ chaînes
- `DEPLOY.md` : à jour
- Tous : pas de référence Stripe

- [ ] **Step 3: Cocher l'item dans TODO consolidée**

---

## Lot 3 — P0 Déploiement Railway + validation prod

### Task 3.1: Déployer API

- [ ] **Step 1: Vérifier railway status**

```bash
railway status
```

- [ ] **Step 2: Lancer le déploiement API**

```bash
powershell -File scripts/deploy.ps1 -Service api
```

- [ ] **Step 3: Vérifier Content-Type**

```bash
curl -sI https://api-production-b5bf.up.railway.app/api/chains | findstr content-type
```
Expected: `Content-Type: application/json`

### Task 3.2: Déployer Web

- [ ] **Step 1: Lancer le déploiement Web (après API terminé)**

```bash
powershell -File scripts/deploy.ps1 -Service web
```

- [ ] **Step 2: Vérifier que le site sert WCORE**

```bash
curl -s https://wcore.xyz | findstr WCORE
```
Expected: trouve "WCORE"

### Task 3.3: Vérifier CORS_ORIGIN en prod

- [ ] **Step 1: Appeler l'API depuis le Web public**

Ouvrir `https://wcore.xyz` dans Chrome, ouvrir DevTools Console, exécuter :

```js
fetch('https://api-production-b5bf.up.railway.app/api/chains').then(r => console.log(r.status, r.headers.get('access-control-allow-origin')))
```

- [ ] **Step 2: Confirmer que CORS n'est pas bloqué**

Expected: 200, `access-control-allow-origin` présent et non-vide.

### Task 3.4: Tester le scan multi-wallet

- [ ] **Step 1: Construire l'URL de test**

URL: `https://wcore.xyz/?addresses=0x17d518736ee9341dcdc0a2498e013d33cfcdd080,0xe39c0d6439a71d2bddfdeee94420601cdf8fd22d,0x6f6d5c6ecf999d330ef942b9288089b7746f0b60,0xd5b0dbd75056a30411be789775e40664ec858e51,AxU68jEGjXMj3YGRPSPVXg4qpYmUWhoBUfsbuhrFyDe4,9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5,GWLCYszJB8H5Pe3nYw6uoFTApoAqP9P7uzgTmbFm4Nqk,cosmos1nvfsmt48nemfullrkkxa6gze05c4xeypfslj7t,terra1nvfsmt48nemfullrkkxa6gze05c4xeyp059jut`

- [ ] **Step 2: Ouvrir dans Chrome CDP et observer**

Vérifier : ≤30 jobs cumulés, SVM/Cosmos pas bloqués derrière EVM, logos visibles dans activeScanChains, pas de rescan EVM ×4.

---

## Lot 4 — P2 Sécurité / robustesse

### Task 4.1: Corriger `ScanRequestBodySchema.passthrough()` → `strict()`

**Files:**
- Modify: `apps/api/src/schemas.ts`

- [ ] **Step 1: Lire le schéma actuel**

```bash
rtk grep -n "passthrough\|ScanRequestBodySchema" apps/api/src/schemas.ts
```

- [ ] **Step 2: Remplacer `.passthrough()` par `.strict()`**

```typescript
// Avant
export const ScanRequestBodySchema = z.object({...}).passthrough();
// Après
export const ScanRequestBodySchema = z.object({...}).strict();
```

- [ ] **Step 3: Vérifier le typecheck**

```bash
pnpm --filter @wcore/api typecheck
```

Expected: OK.

### Task 4.2: Ajouter une Error Boundary frontend

**Files:**
- Create: `apps/web/components/ErrorBoundary.tsx`
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Créer ErrorBoundary.tsx**

```tsx
"use client";

import { Component, ReactNode } from "react";

interface Props { fallback?: ReactNode; children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export function ErrorFallback({ error }: { error?: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100 p-4">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-gray-400 text-sm">The application encountered an unexpected error. Please try refreshing the page.</p>
        {error && <p className="text-gray-500 text-xs font-mono break-all">{error.message}</p>}
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-green-600 rounded-lg text-sm hover:bg-green-500 transition-colors">Refresh</button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrapper dans layout.tsx**

Dans `apps/web/app/layout.tsx`, wrapper le `children` :

```tsx
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Dans le JSX :
<ErrorBoundary>{children}</ErrorBoundary>
```

- [ ] **Step 3: Vérifier le build web**

```bash
pnpm --filter @wcore/web build 2>&1 | tail -5
```

Expected: build OK.

### Task 4.3: Vérifier TRUST_PROXY en prod

**Files:**
- Read: `apps/api/src/server.ts`

- [ ] **Step 1: Trouver la config TRUST_PROXY**

```bash
rtk grep -n "trustProxy\|TRUST_PROXY" apps/api/src/server.ts
```

- [ ] **Step 2: Vérifier la valeur par défaut**

Si `trustProxy: true` → ajouter garde avec CIDR/check Railway. Si `trustProxy: "loopback"` ou conditionnel → OK.

- [ ] **Step 3: Documenter dans ROADMAP.md**

---

## Lot 5 — P2 Qualité / maintenabilité

### Task 5.1: Extraire `useScanScheduler` de WalletContent

**Files:**
- Create: `apps/web/hooks/useScanScheduler.ts`
- Modify: `apps/web/components/WalletContent.tsx`

- [ ] **Step 1: Identifier la logique scheduler à extraire**

Fonctions cibles : `runScan`, `mergeChainResults`, `setActiveScanChains`.

- [ ] **Step 2: Créer le hook**

```typescript
// apps/web/hooks/useScanScheduler.ts
"use client";

import { useCallback, useRef, useState } from "react";
import { GLOBAL_CHAIN_CONCURRENCY } from "@/components/WalletContent";

export interface ScanJob {
  vm: "EVM" | "SVM" | "COSMOS";
  chain: string;
  addresses: string[];
}

export function useScanScheduler(onChainResult: (chain: string, data: unknown) => void) {
  const activeJobs = useRef(0);
  const [activeScanChains, setActiveScanChains] = useState<string[]>([]);

  const runWithConcurrency = useCallback(async (jobs: ScanJob[], concurrency: number) => {
    activeJobs.current = 0;
    const results: unknown[] = [];
    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= jobs.length) return;
      const i = index++;
      const job = jobs[i];
      activeJobs.current++;
      setActiveScanChains((prev) => [...prev, job.chain]);

      try {
        const result = await scanOneJob(job);
        results[i] = result;
        onChainResult(job.chain, result);
      } catch (error) {
        console.error("Job failed:", job.chain, error);
      } finally {
        setActiveScanChains((prev) => prev.filter((c) => c !== job.chain));
        activeJobs.current--;
        return next();
      }
    };

    const workers = Array(Math.min(concurrency, jobs.length)).fill(null).map(() => next());
    await Promise.all(workers);
    return results;
  }, [onChainResult]);

  return { runWithConcurrency, activeScanChains, setActiveScanChains };
}
```

- [ ] **Step 3: Intégrer dans WalletContent.tsx**

Remplacer la logique scheduler inline par l'appel au hook.

- [ ] **Step 4: Vérifier le build web**

```bash
pnpm --filter @wcore/web build 2>&1 | tail -5
```

### Task 5.2: Persister `PreferencesProvider`

**Files:**
- Read: `apps/web/contexts/PreferencesContext.tsx` (ou fichier équivalent)

- [ ] **Step 1: Trouver le PreferencesProvider**

```bash
rtk grep -rn "PreferencesProvider\|usePreferences" apps/web --include="*.tsx"
```

- [ ] **Step 2: Ajouter la persistance localStorage**

Au mount : lire `wcore_prefs` depuis localStorage. Au change : écrire `wcore_prefs` dans localStorage.

- [ ] **Step 3: Vérifier le build web**

---

## Lot 6 — CM Cycle matinal

### Task 6.1: Vérifier les notifications X

- [ ] **Step 1: Ouvrir X avec_replies**

```bash
node scripts/x-verify-discovery-replies.js
```

- [ ] **Step 2: Répondre aux mentions si présentes**

### Task 6.2: Rechercher de nouvelles cibles

- [ ] **Step 1: Lancer la recherche discovery**

```bash
node scripts/x-search-discovery-large.js
```

- [ ] **Step 2: Si cibles pertinentes, proposer 2-3 drafts**

### Task 6.3: Mettre à jour CM-STRATEGY.md

**Files:**
- Modify: `docs/superpowers/specs/CM-STRATEGY.md`

- [ ] **Step 1: Ajouter les cycles 7-10**

- [ ] **Step 2: Mettre à jour la liste des comptes monitored**
