# WCORE v0.1.14 — Prompt de mise à jour pour GPT-5.5

> Date : 2026-05-06
> Contexte : 3 rounds d'audit complétés, 24 findings traités. Demande de nouvel audit complet.
> Contrainte : **Pas d'action on-chain**. Audit lecture seule + recommandations.

---

## ÉTAT DU PROJET

### v0.1.14 — Ce qui a changé depuis le dernier audit

#### Auth & Rate-Limiting (Round 1 — 7 P0)
- Bug critique `nonce:` dans `auth.ts` corrigé (cache key utilisée comme adresse user)
- Rate-limit GM 3 tiers (writes 30/min, reads 90/min, publics no limit)
- `/api/scan/async` rate-limité + circuit breaker
- `X-Forwarded-For` trusted proxy (localhost only)
- Docker `NODE_ENV=production` (plus de secret JWT dev leak)
- CORS restrictif par défaut en prod
- SQL leaderboard corrigé (`gm_contracts` / `onchain_gms`)

#### GM Backend (Round 1 — 6 P1)
- `POST /api/gm/onchain` → transaction Prisma atomique
- Nonce anti-DoS (signature vérifiée avant delete)
- Platform owner re-fetch DB (pas JWT address)
- Rate-limit `/api/wallets/nonce` + `/api/leaderboard`
- `creatorAddress` sur `GmContract` (matching par wallet, pas CUID)
- Background sync cooldown 5 min

#### GM Frontend (Round 2 — 8 fixes)
- Off-chain / On-chain flags séparés (`alreadyOffChain` / `alreadyOnChain`)
- Header On-chain bloqué après 1er GM (ChainCard pour bonus per-chain)
- ChainCard utilise `wc_gm_onchain_date` (pas `wc_gm_date`)
- Deploy : adresse extraite depuis l'event `ContractDeployed` (pas `receipt.contractAddress`)
- Frontend deploy : adresse depuis receipt log (pas `contractCount()`)
- `OnchainGm.tipWei` persisté en DB (décodage corrigé : dernier word du blob ABI)
- `syncOnChainContracts` / `has-deployed` : jamais d'overwrite d'owner existant
- Off-chain double-click guard (`offchainSending`)

#### DB Schema (v0.1.14)
```diff
model GmContract {
+ creatorAddress  String?   // adresse wallet du déployeur
}
model OnchainGm {
+ tipWei          String?   // montant du tip en wei
- txHash          @unique
+ @@unique([chainKey, txHash])
}
```

#### Docs
- 8 fichiers obsolètes supprimés (gas-editor, astar, hotspot, vieille analyse)
- 9 fichiers consolidés dans `docs/gpt5.5/`, `docs/gm/`, `docs/audit/`

---

## TESTS & TYPE CHECK

| Indicateur | Valeur |
|-----------|--------|
| Tests core | 74/74 |
| Tests API | 30/30 |
| Typecheck | 5/5 packages |
| API | http://127.0.0.1:4000 |
| Web | http://localhost:3000 |

---

## AUDIT DEMANDÉ

### 1. VÉRIFICATION GLOBALE — Est-ce que tout tient debout ?

Parcourt **tout** le code modifié et vérifie :
- Aucune régression depuis les 24 fixes
- Aucun nouveau bug introduit
- Les protections ajoutées (overwrite guard, rate-limit, anti-replay) sont effectives
- La migration Prisma v0.1.14 (`20260506220000_v0_1_14_gm_enhancements`) est correcte

### 2. GM FLOW — Complet et cohérent ?

Vérifie le flow complet end-to-end :
1. Login → JWT → `req.user` correct
2. Off-chain GM → streak + badges → pas de blocage on-chain
3. On-chain GM Header → tx + receipt → anti-replay + score + tipWei persisté
4. On-chain GM ChainCard → bonus per-chain
5. Deploy contrat → vérification on-chain → `creatorAddress` persisté
6. My contracts → matching par `creatorAddress` + `owner.address`
7. Withdraw Creator / Platform → balance on-chain

### 3. SÉCURITÉ

- `POST /api/gm/contracts/deploy` : vérification on-chain complète ? Pas de bypass ?
- `POST /api/gm/onchain` : anti-replay `[chainKey, txHash]` suffisant ?
- Rate-limit : buckets corrects ? Pas de trous ?
- Authorisations platform owner : DB fetch fiable partout ?
- CORS : restrictif en prod ? JWT_SECRET : hard-fail en prod ?

### 4. PERFORMANCE

- `my-contracts` : 5 min cooldown respecté ? Pas de sync intempestif ?
- `fetchOnChainContracts` : 10 chunks × 10K blocs = lourd. Timeout implicite suffisant ?
- `has-deployed` bloque sur le sync on-chain (pas de background ici) — problème ?

### 5. TESTS MANQUANTS

Quels tests manquent encore ?
- Login EVM complet (signature valide → token → user)
- `POST /api/gm/onchain` (mock RPC receipt)
- `POST /api/gm/contracts/deploy` (mock receipt + event)
- Rate-limit buckets (scan, auth, gm_write, gm_read, leaderboard)
- Overwrite protection (sync/has-deployed)
- Circuit breaker (scan/async)

### 6. RESTE À FAIRE

- [ ] Creator dashboard enrichi (tips totaux via `OnchainGm.tipWei`, top wallets, répartition par chaîne)
- [ ] Docker production (docker-compose.prod.yml, multi-stage build)
- [ ] Mode dégradé visible dans l'UI
- [ ] Tests unitaires SVM + Cosmos engines
- [ ] Cache Redis réel (actuellement MemoryCacheStore)
- [ ] Onchain pricing V3 pour tokens sans pool DexScreener

---

## FICHIERS CLÉS À AUDITER

| Fichier | Rôle |
|---------|------|
| `apps/api/src/auth.ts` | SIWE login, JWT, nonce |
| `apps/api/src/gamification.ts` | GM, contrats, sync, deploy |
| `apps/api/src/server.ts` | Rate-limit, circuit breaker, scan |
| `apps/api/src/support.ts` | Tickets, autorisations |
| `apps/web/components/GmButton.tsx` | Header GM UI |
| `apps/web/components/ChainCard.tsx` | Per-chain GM UI |
| `apps/web/hooks/useOnChainGm.ts` | On-chain tx + deploy |
| `packages/db/prisma/schema.prisma` | Modèle de données |
| `packages/db/prisma/migrations/20260506220000_v0_1_14_gm_enhancements/migration.sql` | Migration v0.1.14 |
| `contracts/GmOnChain.sol` | Smart contract GM |
| `contracts/GmFactory.sol` | Factory |

---

## PRIORITÉ

1. Vérifier la migration Prisma + décodage tipWei (corrigés au round 3)
2. Vérifier le flow GM complet (end-to-end)
3. Identifier les tests manquants critiques
4. Prioriser le reste à faire (Lot 3 : Creator dashboard + Docker)
