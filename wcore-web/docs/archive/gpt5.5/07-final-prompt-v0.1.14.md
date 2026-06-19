# WCORE v0.1.14 — Prompt final pour GPT-5.5

> Date : 2026-05-06
> Audit complet demandé. **Pas d'action on-chain**.

---

## RÉSUMÉ DE CE QUI A ÉTÉ FAIT DEPUIS LE DERNIER AUDIT

### Phase 1 — Auth critique + Rate-limiting (7 P0)
- Bug `nonce:` dans `auth.ts` corrigé (la clé cache `nonce:0x...` était utilisée comme adresse user → login EVM impossible)
- Docker `NODE_ENV=production` (plus de secret JWT dev en staging)
- Rate-limit GM 3 tiers (writes 30/min, reads 90/min, publics no limit)
- `/api/scan/async` rate-limité + circuit breaker
- `X-Forwarded-For` trusted proxy (localhost only)
- CORS restrictif par défaut en prod
- SQL leaderboard : `"OnchainGm"`/`"GmContract"` → `"onchain_gms"`/`"gm_contracts"`

### Phase 2 — Backend GM (6 P1)
- `POST /api/gm/onchain` → `prisma.$transaction` (anti-replay + score + streak atomiques)
- Nonce supprimé APRÈS vérification signature (anti-DoS)
- Platform-owner checks re-fetch user depuis la DB
- Rate-limit `/api/wallets/nonce` + `/api/leaderboard`
- `GmContract.creatorAddress` ajouté (matching par adresse wallet, pas CUID)
- Background sync cooldown 5 min

### Phase 3 — Frontend GM (8 fixes)
- Off-chain / On-chain flags séparés (`alreadyOffChain` / `alreadyOnChain`)
- Header On-chain bloqué après 1er GM (ChainCard pour bonus per-chain)
- ChainCard utilise `wc_gm_onchain_date` (pas `wc_gm_date`) → évite faux positifs
- Deploy : adresse extraite depuis `topics[1]` du `ContractDeployed` event (pas `receipt.contractAddress`, null pour factory)
- Frontend deploy : adresse lue depuis receipt log (pas `contractCount()`)
- `OnchainGm.tipWei` persisté en DB (décodage corrigé : dernier word du blob ABI)
- Overwrite protection dans `syncOnChainContracts` + `has-deployed`
- Off-chain double-click guard

### Phase 4 — Code audit + 3 bugs corrigés
- Wallet linking : nonce supprimé après vérif (même bug que login EVM)
- `/api/gm/contracts/:id/balance` rate-limité (était exclu par erreur)
- `doOnChainGm` guard `if (sending) return` (anti double-clic)

### DB Schema v0.1.14
```diff
GmContract  +creatorAddress String?   // adresse wallet déployeur
OnchainGm   +tipWei String?           // montant tip en wei
OnchainGm   @@unique([chainKey, txHash]) // was @unique txHash seul
```

### Docs
- 8 fichiers obsolètes supprimés
- 9 fichiers consolidés dans `docs/gpt5.5/`, `docs/gm/`, `docs/audit/`

---

## AUDIT DEMANDÉ

### 1. VÉRIFICATION GLOBALE — Aucune régression ?

Parcourt les fichiers clés et vérifie :
- `apps/api/src/auth.ts` (line 56-89, 190-237) : SIWE login + wallet linking — ordre nonce/verify/delete correct ?
- `apps/api/src/gamification.ts` (line 99-323) : onchain GM — transaction, tipWei décodage, anti-replay
- `apps/api/src/gamification.ts` (line 525-574) : deploy — adresse depuis event, pas receipt.contractAddress
- `apps/api/src/gamification.ts` (line 654-681, 686-705) : has-deployed + syncOnChainContracts — overwrite protection
- `apps/api/src/gamification.ts` (line 707-751) : my-contracts — matching par creatorAddress OR owner.address
- `apps/api/src/server.ts` (line 77-115) : rate-limit — tous les endpoints couverts ?
- `apps/api/src/server.ts` (line 41-50) : getClientIp — trusted proxy

### 2. SÉCURITÉ

- `POST /api/gm/contracts/deploy` : bypass possible ?
- `POST /api/gm/onchain` : anti-replay effectif ? `[chainKey, txHash]` unique ?
- Rate-limit : `isGmPublicRead` exclut bien seulement les endpoints publics ?
- CORS + JWT_SECRET : hard-fail en prod ?
- Wallet linking : nonce anti-DoS confirmé ?

### 3. GM FLOW COMPLET

Vérifie la cohérence entre frontend et backend :
- Header "Say GM" → Off-chain : streak, badges, PAS de blocage on-chain
- Header "Say GM" → On-chain : tx, score, streak, bloque Header pour la journée
- ChainCard "⛽ GM" : bonus per-chain, grise la chaîne spécifique
- localStorage : `wc_gm_date` / `wc_gm_onchain_date` / `wc_gm_onchain_chain` utilisés correctement

### 4. PERFORMANCE

- `fetchOnChainContracts` : 10 chunks × 10K blocs par chaîne. Timeout implicite ? Impact ?
- `has-deployed` : bloque sur le sync on-chain (pas de background ici) — problème ?
- `my-contracts` : cooldown 5 min respecté ?

### 5. TESTS MANQUANTS

- Login EVM complet (signature valide → token → user)
- `POST /api/gm/onchain` (mock RPC receipt)
- `POST /api/gm/contracts/deploy` (mock receipt + event)
- Rate-limit buckets (scan, auth, gm_write, gm_read, leaderboard)
- Overwrite protection (sync/has-deployed)
- Wallet linking anti-DoS

### 6. RESTE À FAIRE (Lot 3)

- [ ] Creator dashboard enrichi (total ETH reçu via `OnchainGm.tipWei`)
- [ ] Docker production
- [ ] Mode dégradé visible dans l'UI
- [ ] Tests unitaires SVM + Cosmos
- [ ] Cache Redis réel

---

## TESTS & TYPE CHECK ACTUELS

| Indicateur | Valeur |
|-----------|--------|
| Tests core | 74/74 |
| Tests API | 30/30 |
| Typecheck | 5/5 packages |
| API | http://127.0.0.1:4000 |
| Web | http://localhost:3000 |
