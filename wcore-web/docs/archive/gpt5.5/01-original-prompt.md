# WCORE v0.1.11 — État des lieux pour GPT-5.5

> Date : 2026-05-06
> Version : v0.1.11
> Commit : `0adba35` (master branch, clean working tree)
> Auteur session : Codex + GPT-5.5 (co-audit API)

---

## 1. Contexte

**WCORE** est un dashboard d'analyse de portefeuilles crypto multi-chaînes (116+ blockchains, EVM/SVM/Cosmos) avec un système de gamification "GM" (say good morning) on-chain et off-chain.

**Stack** : Next.js 16 + React 19 (web), Fastify 5 + Prisma 6 + PostgreSQL 16 (API), TypeScript 5.6 strict, pnpm workspaces, Tailwind CSS 3.4.

**Ce qui a été fait aujourd'hui** :
- Phase 1 : Nettoyage de 60+ fichiers/dossiers morts
- Phase 2 : Suppression de code mort (siwe, autoCompleteQuests, etc.)
- Phase 3 : Correction de 7 bugs API critiques (co-audité par GPT-5.5)
- Phase 4 : UI/UX fixes (typo, tooltips, clés React, aria-labels)
- Phase 5 : Documentation (CHANGELOG, rapport d'analyse)
- Commit : `a14c6dd` + `0adba35`

**Vérifications** : TypeScript 0 erreur (5 packages) | Tests API 27/27 passés

---

## 2. Architecture actuelle (résumé)

### Monorepo
```
apps/
  api/      # Fastify REST — auth, scan multi-VM, gamification, leaderboard
  web/      # Next.js 16 App Router — dashboard, profile, creator, leaderboard
packages/
  core/     # Moteur scan 120+ chaînes, pricing cascade (6 sources), RPC consensus
  db/       # Prisma ORM — 11 modèles (User, WalletScan, GmContract, OnchainGm...)
  shared/   # Types Zod, validation adresses (EVM/SVM/Cosmos)
contracts/
  GmOnChain.sol   # Contrat GM cloné (EIP-1167) — tips, withdraw, streak
  GmFactory.sol   # Factory déploiement — frais 0.10$, split 50/50
```

### Flux GM (on-chain)
1. Utilisateur clique "⛽ GM" sur une chaîne supportée (actuellement Base uniquement)
2. `useOnChainGm.sendGm()` récupère le contrat de l'utilisateur via `/api/gm/my-contracts`
3. Switch chain vers Base, calcul tip (~$0.05 en ETH)
4. `eth_sendTransaction` vers le contrat avec data `0x5108cc12` + streak
5. TX vérifiée on-chain par l'API, points crédités, streak incrémenté
6. Tips split 50/50 entre `creatorBalance` et `platformBalance`

---

## 3. Points de vigilance identifiés (pas des bugs, des axes d'amélioration)

### 3.1 Architecture & Scalabilité

| # | Point | Fichier concerné | Détails |
|---|-------|-----------------|---------|
| 1 | **Rate limiting en mémoire** | `server.ts:34` | Map Node.js en RAM. Pas scalable en cluster/multi-instance. Pas de nettoyage des IPs inactives. |
| 2 | **Nonces en mémoire** | `auth.ts:17` | `Map<string, nonce>` perdu au restart. Pas de persistance Redis/DB. |
| 3 | **Metrics en mémoire** | `metrics.ts` | Singleton RAM, perdu au restart. Pas de persistance. |
| 4 | **Timeout fetchScan = 30 min** | `WalletContent.tsx` | `AbortController` à 1 800 000 ms. Masque les problèmes de latence. |
| 5 | **Cache stocke données brutes** | `WalletContent.tsx` | localStorage garde les tokens scam-flaggés. `adjustForScams` n'est appliqué qu'à l'affichage. |
| 6 | **Pas de pagination fetchOnChainContracts** | `gamification.ts:530` | Jusqu'à 10 appels RPC synchrones (10 000 blocs × 10 chunks). Peut timeout. |
| 7 | **No health check endpoint** | — | `GET /api/health` retourne 404. Pas de endpoint de santé standard. |

### 3.2 Sécurité

| # | Point | Fichier concerné | Détails |
|---|-------|-----------------|---------|
| 8 | **JWT_SECRET dev fallback** | `auth.ts` | `"wcore-dev-secret-change-in-prod"` en dur si `NODE_ENV !== "production"`. Si déployé par erreur sans secret, exposition totale. |
| 9 | **Pas de helmet/rate-limit fastify** | `server.ts` | Pas de protection en-têtes malicieux ni force brute au-delà du rate limit custom. |
| 10 | **Cosmos signature fragile** | `auth.ts:231` | `bs58.decode(body.publicKey ?? body.signature.slice(0, 44))` — slice arbitraire, format non standard. |
| 11 | **Custom tokens non validés** | `server.ts` | Pas de vérification que `contract` est une adresse valide avant insertion Prisma. |
| 12 | **CORS permissif en dev** | `server.ts` | `origin: true` en dev (tout le monde). Acceptable mais à documenter. |

### 3.3 Wallet & Blockchain

| # | Point | Fichier concerné | Détails |
|---|-------|-----------------|---------|
| 13 | **MetaMask uniquement** | `ConnectButton.tsx` | Pas de WalletConnect, Coinbase Wallet, Rainbow, Phantom (EVM). L'app est inutilisable sans MetaMask injecté. |
| 14 | **Pas de listeners Ethereum** | `ConnectButton.tsx` | Aucun `accountsChanged`, `chainChanged`, `disconnect`. Si l'utilisateur change de compte dans MetaMask, l'UI ne reflète pas le changement. |
| 15 | **Switch chain silencieux** | `useOnChainGm.ts` | `.catch(() => {})` sur `wallet_switchEthereumChain`. Si l'utilisateur refuse, la TX échoue sans explication. |
| 16 | **Data hex hardcodés** | `useOnChainGm.ts` | Sélecteurs `0x5108cc12`, `0xb5944145`, `0x9957ad05`, `0x92885ee8` sans vérification ABI. Si le contrat change, fonds perdus. |
| 17 | **SVM/Cosmos auth limitée** | `auth.ts` | Login principal uniquement EVM. SVM/Cosmos supportés uniquement pour le "wallet linking", pas l'authentification globale. |

### 3.4 UI/UX

| # | Point | Fichier concerné | Détails |
|---|-------|-----------------|---------|
| 18 | **Profile page surchargée** | `profile/page.tsx` | Trop d'informations empilées verticalement sans hiérarchie claire. Besoin de sections mieux structurées. |
| 19 | **Polling notifications** | `NotificationsBell.tsx` | Toutes les 60s sans `document.visibilityState`. Consommation inutile en arrière-plan. |
| 20 | **Faux positifs scam (résiduels)** | `scam-detector.ts` | Même après whitelist, `genericPatterns` (`AI|coin|token|protocol...`) peuvent flagger des tokens légitimes. |
| 21 | **i18n minimal** | `PreferencesProvider.tsx` | Seulement FR/EN, hardcodé. Pas de système de traduction extensible (react-i18next, etc.). |
| 22 | **Export CSV basique** | `WalletContent.tsx` | Export CSV présent mais sans formatage avancé, sans header internationalisé. |
| 23 | **Pas de skeleton loading** | — | Seul `ScanSkeleton.tsx` existe. Les autres pages n'ont pas de loading state structuré. |
| 24 | **TOP_10 contient 15 chaînes** | `ChainSelector.tsx` | Nommage trompeur. |

### 3.5 Contrats Solidity

| # | Point | Fichier concerné | Détails |
|---|-------|-----------------|---------|
| 25 | **Pas de pause/emergency** | `GmOnChain.sol` | Aucun `Ownable`, `Pausable`, ou `rescue` en cas de bug découvert post-déploiement. |
| 26 | **Fonds bloqués si creator non-recevable** | `GmOnChain.sol:47` | Si `creator` est un contrat sans `receive()`/`fallback() payable`, `withdrawCreator()` échoue définitivement. Pas de mécanisme de récupération. |
| 27 | **Streak non validé** | `GmOnChain.sol:31` | `_streak` dans `sayGm` est un paramètre utilisateur non contrôlé. Peut être n'importe quelle valeur (pollution event). |
| 28 | **Transferts sans limite de gas** | `GmOnChain.sol:47` | `.call{value: amount}("")` forward tout le gas restant. Un receveur malveillant peut gas-grief. |

### 3.6 DevOps & Tooling

| # | Point | Détails |
|---|-------|---------|
| 29 | **Pas de CI/CD visible** | Aucun workflow GitHub Actions, aucun pipeline de déploiement documenté. |
| 30 | **Docker présent mais peu documenté** | `docker-compose.dev.yml` et `.staging.yml` existent mais `DEPLOY.md` est obsolète. |
| 31 | **Tests E2E incomplets** | Playwright config présente mais peu de tests E2E couvrant le flow GM complet (connexion → scan → GM on-chain → profile). |
| 32 | **Pas de linting/formattage standardisé** | Pas de ESLint/Prettier config visible dans le monorepo. |

---

## 4. Questions pour GPT-5.5

### 4.1 Architecture & Performance

1. **Rate limiting** : Quelle stratégie recommandez-vous pour remplacer le rate limit en mémoire par quelque chose de scalable ? Redis ? Fastify rate-limit plugin ? Une combinaison ?

2. **Nonces** : Faut-il persister les nonces en DB/Redis ou est-ce acceptable en mémoire pour un MVP ? Quelle est la meilleure pratique pour les nonces SIWE ?

3. **Timeout fetchScan** : 30 min est clairement excessif. Quel timeout raisonnable recommandez-vous pour un scan multi-chaînes (jusqu'à 120 chaînes), avec quelle stratégie de retry/rollback ?

4. **Cache localStorage** : Le cache stocke les données brutes (avant `adjustForScams`). Faut-il appliquer `adjustForScams` AVANT de stocker, ou est-ce intentionnel de garder les données brutes ?

### 4.2 Sécurité

5. **JWT_SECRET fallback** : Comment sécuriser le fallback dev sans bloquer le développement local ? Variable d'environnement obligatoire même en dev ? Warning plus visible ?

6. **Cosmos signature** : La vérification actuelle utilise `bs58` + double SHA256. Est-ce compatible avec la majorité des wallets Cosmos (Keplr, Leap) ? Faut-il passer à ADR-36 ?

7. **Helmet / sécurité Fastify** : Quels plugins Fastify recommandez-vous pour la sécurité en production (helmet, rate-limit, csrf, etc.) ?

### 4.3 Wallet & Multi-VM

8. **Support multi-wallet** : Comment intégrer WalletConnect / Coinbase Wallet sans ajouter trop de dépendances ? wagmi + viem ? Ou une solution plus légère ?

9. **Listeners Ethereum** : Quels listeners minimum faut-il implémenter (`accountsChanged`, `chainChanged`, `disconnect`) et où les placer dans l'architecture React (context, hook, layout) ?

10. **Vérification ABI** : Comment sécuriser les appels `eth_sendTransaction` avec data hex hardcodé ? Faut-il embarquer l'ABI minimale du contrat dans le frontend ?

### 4.4 UI/UX

11. **Profile page redesign** : Comment structurer la page profile pour qu'elle soit moins surchargée ? Onglets ? Cards pliables ? Sidebar navigation ?

12. **Notifications** : Faut-il utiliser `document.visibilityState` pour suspendre le polling quand l'onglet est inactif ? Ou passer à WebSocket/SSE ?

13. **Scam detector** : Comment réduire les faux positifs sans perdre la détection réelle ? Machine learning ? Liste blanche communautaire ?

14. **i18n** : Faut-il migrer vers `react-i18next` ou rester sur le système minimal actuel ? Quel est le ROI pour un projet MVP ?

### 4.5 Solidity

15. **Pause/emergency** : Faut-il ajouter un mécanisme `Pausable` (OpenZeppelin) au contrat GmOnChain ? Ou est-ce overkill pour un contrat aussi simple ?

16. **Rescue funds** : Si `creator` est un contrat non-recevable, comment permettre la récupération des fonds sans compromettre la sécurité ? `rescue` par `platformOwner` ?

### 4.6 DevOps

17. **CI/CD** : Quel workflow GitHub Actions minimum recommandez-vous ? (typecheck + tests + build sur PR, déploiement auto sur merge ?)

18. **Tests E2E** : Quels scenarios E2E critiques faut-il couvrir avec Playwright ? (connexion wallet mockée, flow GM complet, scan multi-chaînes)

---

## 5. Livrables attendus de GPT-5.5

Pour chaque question, une réponse structurée avec :
- **Analyse** : Pourquoi c'est un problème (ou pas)
- **Recommandation** : Quelle solution privilégier (avec justification)
- **Priorité** : P0 (critique) / P1 (important) / P2 (nice to have)
- **Effort estimé** : XS (< 1h) / S (1-4h) / M (4-8h) / L (> 8h)
- **Code d'exemple** (optionnel) : Si applicable, un snippet illustrant la solution

---

**Contexte technique complet** : voir `WCORE-ANALYSE-COMPLETE.md` à la racine du projet pour l'analyse détaillée de tous les fichiers.
