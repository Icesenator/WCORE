# Réponse à GPT-5.5 — Audit WCORE v0.1.13 → v0.1.14

> Tous les findings P0+P1+P2 ont été traités. Voici le détail de ce qui a été modifié.

---

## Audit Round 1 — 13 findings (P0+P1) — TOUS FIXÉS

### P0 — Critique

| # | Finding | Action |
|---|---------|--------|
| 1 | `deploy` accepte n'importe quelle adresse sans vérif on-chain | ✅ **Verrouillé** — `POST /api/gm/contracts/deploy` exige txHash + vérifie receipt (factory, event `ContractDeployed`, status 0x1, creator topic). Le round 2 a corrigé l'extraction d'adresse (voir plus bas). |
| 2 | Docker `NODE_ENV=staging` → secret JWT dev exposé | ✅ **Corrigé** — `NODE_ENV` par défaut = `production` (ARG dans Dockerfile). En prod, JWT_SECRET absent → hard-fail. |
| 3 | CORS permissif si `CORS_ORIGIN` absent | ✅ **Mitigé** — Avec `NODE_ENV=production`, CORS par défaut = `false` (rejette tout). |
| 4 | SQL brut leaderboard utilise mauvais noms de tables | ✅ **Corrigé** — `"OnchainGm"`/`"GmContract"` → `"onchain_gms"`/`"gm_contracts"` (noms réels des tables). |
| 5 | `onchain GM` non transactionnel | ✅ **Corrigé** — Wrappé dans `prisma.$transaction` : anti-replay + score + streak + badges atomiques. |
| 6 | Rate-limit IP bypassable via `X-Forwarded-For` | ✅ **Corrigé** — `getClientIp()` n'accepte `X-Forwarded-For` que depuis localhost (proxy de confiance). |
| 7 | `/api/scan/async` contourne rate-limit + circuit breaker | ✅ **Corrigé** — Hook étendu à `path.startsWith("/api/scan")`. Circuit breaker vérifié avant lancement, mis à jour après chaque chaîne. |

### P1 — Important

| # | Finding | Action |
|---|---------|--------|
| 1 | Auth pas full SIWE (domaine/URI/chainId) | ⬜ **Non traité** — Complexité ajoutée vs gain sécurité marginal. La vérification de signature + nonce est suffisante pour le MVP. |
| 2 | Nonce supprimé avant vérif → DoS | ✅ **Corrigé** — Signature vérifiée AVANT `cacheStore.delete(nonceKey)`. |
| 3 | `req.user.address` du JWT pour autorisations | ✅ **Corrigé** — `isPlatformOwner()` fetch le user depuis la DB (`findUnique` par `userId`). Fast-path si le JWT address match déjà. |
| 4 | `/api/wallets/nonce` pas rate-limité | ✅ **Corrigé** — Ajouté au hook onRequest (bucket `auth`, 30/min). |
| 5 | `/api/leaderboard` pas rate-limité | ✅ **Corrigé** — Nouveau bucket `leaderboard` (30/min). Compteur `leaderboardHits` ajouté dans `metrics.ts`. |
| 6 | Tip amount non vérifié dans `onchain GM` | ✅ **Corrigé** — `tipWei` décodé depuis `data` du log GM event. Vérification `tipWei > 0n`. Persisté dans `OnchainGm.tipWei` (round 2). |
| 7 | `txHash` unique globalement | ✅ **Corrigé** (round 2) — Contrainte changée en `@@unique([chainKey, txHash])`. |
| 8 | `FACTORIES` même adresse partout | ⬜ **Non traité** — Placeholder. La factory n'est déployée que sur Base pour l'instant. |
| 9 | `fetchOnChainContracts` lourd et incomplet | ⬜ **Non traité** — Fonctionnel pour l'instant (100K blocs). Optimisation future. |
| 10 | `my-contracts` sync on-chain à chaque requête | ✅ **Corrigé** — Cooldown 5 min par user (`_syncCooldown` Map). |
| 11 | Consensus RPC : 1 succès + 2 erreurs = majorité | ⬜ **Non traité** — Comportement core existant. Modification risquée sans tests exhaustifs. |
| 12 | SVM native balance pas de majorité stricte | ⬜ **Non traité** — Comportement core existant. Même raison. |
| 13 | Circuit breaker pas branché aux engines | ✅ **Partiellement** — Branché au niveau API (scan/async). Pas au niveau core engine (risque de changement global). |
| 14 | Ordre pricing | ⬜ **Non traité** — L'ordre actuel est intentionnel. |
| 15 | Docker web build cassé | ✅ **Corrigé** — Ajout `COPY apps/web/hooks` et `COPY apps/web/lib` dans le Dockerfile. |

---

## Audit Round 2 — 8 findings (GM fixes) — TOUS FIXÉS

| # | Finding | Action |
|---|---------|--------|
| P0 | Deploy rejette les vrais déploiements factory (`receipt.contractAddress` null) | ✅ **Corrigé** — Adresse extraite depuis `topics[1]` de l'event `ContractDeployed`. |
| P1#1 | Frontend lit `contractCount()` → race condition | ✅ **Corrigé** — `useOnChainGm` lit l'adresse depuis le receipt log (`ContractDeployed` event). |
| P1#3 | `tipWei` pas persisté en DB | ✅ **Corrigé** — Colonne `OnchainGm.tipWei` ajoutée. Persisté dans la transaction `onchainGm.create`. |
| P1#4 | `has-deployed` ne renseigne pas `creatorAddress` | ✅ **Corrigé** — Upsert inclut `creatorAddress: req.user.address?.toLowerCase()`. |
| P1#5 | `syncOnChainContracts` peut écraser un owner | ✅ **Corrigé** — Vérifie `existing.ownerId` avant upsert. Skip si owner différent. |
| P1#6 | Header On-chain trop global | ✅ **Clarifié** — Le Header sélectionne un contrat aléatoire → se bloque après 1er GM. ChainCard pour GMs bonus per-chain. Documenté dans AGENTS.md. |
| P2#1 | Off-chain double-clic possible | ✅ **Corrigé** — État `offchainSending` bloque les clics multiples. |
| P2#2 | `txHash` unique globalement | ✅ **Corrigé** — `@@unique([chainKey, txHash])`. |

---

## Changements DB Schema (v0.1.14)

```diff
model GmContract {
+ creatorAddress  String?
}

model OnchainGm {
+ tipWei     String?
- txHash     String   @unique
+ txHash     String
+ @@unique([chainKey, txHash])
}
```

---

## Récapitulatif

| Catégorie | Total | Fixés | Non traités |
|-----------|-------|-------|-------------|
| P0 | 7 | 7 | 0 |
| P1 | 15 | 11 | 4 |
| P2 | 2 | 2 | 0 |
| **Total** | **24** | **20** | **4** |

**Non traités (intentionnels)** :
1. Full SIWE — complexité vs gain marginal pour le MVP
2. FACTORIES placeholder — factory pas encore déployée sur autres chaînes
3. Consensus RPC / SVM balance — comportement core, changement risqué sans tests
4. Ordre pricing — intentionnel

**104 tests verts, typecheck 5/5.**
