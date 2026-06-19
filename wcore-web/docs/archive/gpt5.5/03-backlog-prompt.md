# WCORE v0.1.12 — Prompt pour GPT-5.5 (Backlog restant)

> Date : 2026-05-06
> Contexte : Les 18 recommandations initiales sont implémentées. Voici le backlog restant.
> Contrainte : **Pas d'action on-chain** — modifications code/config uniquement, pas de déploiement de contrats.

## STATUS D'IMPLÉMENTATION

| Lot | Tâches | Statut |
|-----|--------|--------|
| **Lot 1** | TOP_15 + GM multi-chaîne + circuit breakers UI | ✅ Fait (Codex) |
| **Lot 2** | My tickets + SSE notifications + rate limit buckets | ✅ Fait (GPT-5.5) |
| **Lot 3** | Creator dashboard enrichi + Docker production | ⬜ À faire |

---

## 1. GM Multi-Chaîne (P1 — S)

**Objectif** : Étendre le support GM on-chain au-delà de Base.

**Contexte** : Actuellement, seules les chaînes avec une factory (`FACTORIES` dans `gamification.ts` et `FACTORY_ADDRESSES` dans `useOnChainGm.ts`) supportent le déploiement de contrat et le GM on-chain. La factory `0xe7cfd4b041650ddc8861ffe066a2cd2cce0f6ecb` est déployée uniquement sur Base.

**Demande** :
- Ajouter les chaînes Arbitrum One, Optimism, Polygon à la liste des chaînes supportées pour le GM (config uniquement)
- Dans `useOnChainGm.ts` : étendre `FACTORY_ADDRESSES` et `CHAIN_CONFIG` avec `chainId` pour ces chaînes
- Dans `gamification.ts` : étendre `FACTORIES` avec les adresses de factory (même adresse pour l'instant, placeholder pour quand la factory sera déployée)
- Dans `wagmi.ts` : ajouter les chaînes à la config wagmi (`chains: [base, arbitrum, optimism, polygon]`)
- Le `ChainCard` doit montrer "Deploy GM Contract" sur ces nouvelles chaînes
- Le `GmButton` header doit pouvoir choisir parmi les chaînes disponibles
- **Pas de déploiement on-chain de la factory** — les adresses sont des placeholders

---

## 2. Fix TOP_10 → TOP_15 (P2 — XS)

**Objectif** : Corriger le nommage trompeur.

**Contexte** : `ChainSelector.tsx` définit `TOP_10` qui contient en réalité 15 chaînes.

**Demande** :
- Renommer `TOP_10` en `TOP_15` ou `DEFAULT_CHAINS`
- Mettre à jour les références (boutons "Select top 10" → "Select top 15", etc.)
- Mettre à jour les clés i18n correspondantes dans `lib/i18n.ts`

---

## 3. Notifications SSE (P2 — M)

**Objectif** : Remplacer le polling HTTP par des notifications temps réel.

**Contexte** : `NotificationsBell.tsx` poll l'API toutes les 60 secondes. Le `visibilityState` guard est déjà en place.

**Demande** :
- API : ajouter un endpoint SSE `GET /api/notifications/stream` qui push les nouvelles notifications en temps réel
- Frontend : remplacer `setInterval` par un `EventSource` vers ce endpoint
- Garder le fallback polling si SSE n'est pas supporté
- L'endpoint SSE doit filtrer par `userId` (utiliser un token dans les query params ou header)

---

## 4. Mode Dégradé Visible (P2 — S)

**Objectif** : Afficher clairement dans l'UI quand une chaîne est en mode dégradé.

**Contexte** : Le badge "DEGRADED" existe dans `ChainCard.tsx` pour les erreurs de scan. Mais le status global des circuit breakers (`/api/circuit`) n'est pas exploité visuellement.

**Demande** :
- Dans `WalletContent.tsx` ou une nouvelle section : afficher un bandeau "Circuit breakers actifs" quand des chaînes sont en mode OPEN
- Dans `ChainCard.tsx` : afficher le temps restant avant réessai (cool down du circuit breaker)
- Ajouter un petit indicateur dans la page `/stats` montrant l'état des circuit breakers en temps réel

---

## 5. Docker Production (P2 — M)

**Objectif** : Préparer la config Docker pour un déploiement production.

**Contexte** : `docker-compose.dev.yml` et `.staging.yml` existent mais pas de config production.

**Demande** :
- Créer `docker-compose.prod.yml` avec :
  - API sur port 4000
  - Web sur port 3000
  - Postgres 16
  - Redis 7
  - Variables d'environnement externalisées (`.env.production`)
- Créer un `Dockerfile` multi-stage pour l'API (build → production)
- Mettre à jour le `Dockerfile` existant pour le web si nécessaire
- Ajouter un script `scripts/deploy-prod.sh` (ou `.ps1`) pour lancer le déploiement

---

## 6. Filtre "Mes tickets" dans Support (P2 — S)

**Objectif** : Permettre aux utilisateurs de voir leurs propres tickets.

**Contexte** : Actuellement, seul le platform owner voit les tickets. Les utilisateurs ne savent pas si leur ticket a été traité.

**Demande** :
- Modifier `GET /api/tickets` pour que les utilisateurs non-admin voient UNIQUEMENT leurs propres tickets
- Dans `/support`, ajouter une section "My tickets" visible par tous les utilisateurs connectés
- Afficher le statut et la réponse du platform owner si présente

---

## 7. Dashboard Creator Enrichi (P2 — M)

**Objectif** : Rendre le dashboard créateur plus informatif.

**Contexte** : `/creator` affiche un graphique 30j et un log des GMs reçus. Mais "Revenue" est un compte de transactions, pas un montant.

**Demande** :
- Remplacer "Revenue" (nombre de TX) par le total ETH reçu (calculé depuis les tips)
- Ajouter un compteur "Total tips received" en ETH
- Ajouter un graphique camembert "Répartition par chaîne" des GMs reçus
- Afficher le top 5 des wallets qui ont le plus GM sur les contrats du créateur

---

## Contraintes globales

- **Pas d'action on-chain** : pas de `eth_sendTransaction`, pas de déploiement de contrat, pas de `forge script`
- TypeScript strict : `pnpm typecheck` doit passer à 0 erreur
- Tests : `pnpm --filter @wcore/api test` doit passer à 27/27
- Style : suivre les conventions existantes (composants Tailwind, hooks React, plugins Fastify)
- Pas de breaking change sur les APIs existantes

---

## Priorité recommandée

1. **Fix TOP_10** (XS) — rapide, visible
2. **Filtre "Mes tickets"** (S) — amélioration UX directe
3. **GM Multi-Chaîne** (S) — config only, pas de contrat
4. **Mode dégradé** (S) — info utilisateur
5. **Notifications SSE** (M) — infrastructure
6. **Creator enrichi** (M) — analytics
7. **Docker production** (M) — ops
