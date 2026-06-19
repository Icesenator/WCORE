# GPT-5.5 — Synthèse Priorisée des Améliorations WCORE

> Date : 2026-05-06
> Version projet : WCORE v0.1.11
> Basé sur : `PROMPT-GPT5.5.md` + `WCORE-ANALYSE-COMPLETE.md`

---

## STATUS D'IMPLÉMENTATION — 18/18 FAIT ✅

| # | Recommandation | Priorité | Statut |
|---|---------------|----------|--------|
| 1 | Rate Limiting Redis | P0 | ✅ Fait — `sharedCache` remplace Map RAM |
| 2 | Nonces Redis | P0 | ✅ Fait — `cacheStore.set/get/delete` TTL 300s |
| 3 | Timeout fetchScan 60-120s | P0 | ✅ Fait — 30min → 2min |
| 4 | Cache localStorage versionné | P1 | ✅ Fait — `rawChains` + `scamRulesVersion` |
| 5 | JWT_SECRET Fallback | P0 | ✅ Fait — warning masqué en prod |
| 6 | Cosmos ADR-36 | P1 | ✅ Fait — base64 + amino prefix, plus de bs58 |
| 7 | Helmet Fastify | P1 | ✅ Fait — `@fastify/helmet` enregistré |
| 8 | Multi-Wallet wagmi | P1 | ✅ Fait — wagmi + injected, WalletConnect prêt |
| 9 | Ethereum Listeners | P1 | ✅ Fait — `accountsChanged`/`chainChanged`/`disconnect` |
| 10 | ABI via viem | P0 | ✅ Fait — `encodeFunctionData` + `gm-abi.ts` |
| 11 | Redesign Profile | P1 | ✅ Fait — onglets Overview/Wallets/GM Contracts/Scans |
| 12 | Notifications visibilityState | P1 | ✅ Fait — Skip polling si onglet inactif |
| 13 | Scam Detector score pondéré | P1 | ✅ Fait — weighted scoring (warning/suspicious/scam) |
| 14 | i18n dictionnaires typés | P2 | ✅ Fait — `lib/i18n.ts` + `TranslationKey` type |
| 15 | Pause Solidity v2 | P1 | ✅ Fait — `paused` + `whenNotPaused` sur sayGm |
| 16 | Rescue Funds | P1 | ✅ Fait — `withdrawCreatorTo(address)` |
| 17 | CI/CD GitHub Actions | P1 | ✅ Fait — `.github/workflows/ci.yml` |
| 18 | Tests E2E Playwright | P1 | ✅ Fait — `e2e/critical-flows.spec.ts` 6 scénarios mockés |

### Bonus (non listés par GPT-5.5 mais faits)
| Amélioration | Statut |
|-------------|--------|
| CSV avancé (headers i18n, date filename) | ✅ Fait |
| PageSkeleton générique | ✅ Fait |
| Labels leak (localStorage sans token) | ✅ Fait |
| Hydration mismatch wagmi | ✅ Fait |
| Disconnect on user rejection | ✅ Fait |
| `@cosmjs/*` packages installés | ✅ Fait |
| `@fastify/rate-limit` installé | ✅ Fait |

### Features post-GPT-5.5 (nouvelles fonctionnalités)
| Amélioration | Statut |
|-------------|--------|
| Système de tickets support (création + admin panel) | ✅ Fait — `feat(support)` |
| Lien Support dans le header (homepage + profile) | ✅ Fait |

---

## Ordre recommandé

### P0 — Critique (risques reels, a faire en priorite)
1. JWT_SECRET fallback en production
2. Rate limiting Redis (multi-instance)
3. Nonces Redis/DB (pas de perte au restart)
4. Timeout scan raisonnable (60-120s max)
5. ABI hardcodee → encode via viem

### P1 — Important (UX, securite, fiabilite)
6. Listeners wallet (accountsChanged, chainChanged, disconnect)
7. Helmet + rate-limit Fastify
8. Cosmos ADR-36 (signature standard)
9. Notifications visibilityState
10. CI/CD GitHub Actions
11. Tests E2E Playwright
12. Cache versionne (raw + adjusted + scamRulesVersion)
13. Pause Solidity v2 (sayGm uniquement)
14. Rescue funds (setCreatorPayoutAddress)
15. Profile redesign (onglets)

### P2 — Nice to have (amelioration produit)
16. i18n complet (react-i18next)
17. CSV avance
18. Scam detector communautaire (score pondere)
19. Skeletons generalises

---

## 1. Rate Limiting

**Analyse** : Le `Map` RAM ne marche pas en multi-instance, disparait au restart et peut grossir indefiniment.

**Recommandation** : `@fastify/rate-limit` avec Redis en prod, fallback memoire en dev. Buckets separes : auth, scan, GM, public.

**Priorite** : P0  
**Effort** : M

```ts
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
  redis: process.env.REDIS_URL ? redisClient : undefined,
  keyGenerator: (req) => req.user?.id ?? req.ip,
});
```

---

## 2. Nonces

**Analyse** : Les nonces en memoire cassent le login apres restart et ne protegent pas en cluster.

**Recommandation** : Redis avec TTL 5 min. Suppression atomique apres succes. DB acceptable si Redis absent.

**Priorite** : P0  
**Effort** : S

```ts
await redis.set(`nonce:${address}:${nonce}`, message, { EX: 300 });
const ok = await redis.del(`nonce:${address}:${nonce}`);
if (!ok) throw new Error("nonce_used_or_expired");
```

---

## 3. Timeout fetchScan

**Analyse** : 30 min masque les blocages et donne une UX imprevisible. Un scan 120 chaines ne devrait pas etre une seule requete HTTP longue.

**Recommandation** :
- Frontend : timeout 60-120s max
- API : mode synchrone pour scans courts, job async pour deep scan avec polling `/api/scans/:jobId/status`
- Retry par chaine, pas retry global
- Ne rollback pas les chaines reussies

**Priorite** : P0  
**Effort** : L

**Strategie** :
- Scan rapide : 20-30 chaines, timeout API 45-60s
- Deep scan : queue/job, resultats partiels persistes

---

## 4. Cache localStorage

**Analyse** : Garder les donnees brutes permet de reappliquer une logique anti-scam amelioree sans perdre les donnees. Mais stocker uniquement du brut peut reafficher des scams si le pipeline change.

**Recommandation** : stocker raw + projection derivee versionnee.

**Priorite** : P1  
**Effort** : S

```ts
{
  rawResult,
  adjustedResult: adjustForScams(rawResult),
  scamRulesVersion: SCAM_RULES_VERSION,
  cachedAt: Date.now()
}
```

---

## 5. JWT_SECRET Fallback

**Analyse** : Le fallback dev est dangereux si une config prod est mal posee.

**Recommandation** : obligatoire en prod, fallback uniquement si `NODE_ENV !== "production"`.

**Priorite** : P0  
**Effort** : XS

```ts
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}
```

---

## 6. Cosmos Signature

**Analyse** : Le slicing arbitraire + bs58 n'est pas standard Cosmos. Keplr/Leap utilisent ADR-36.

**Recommandation** : implementer ADR-36 via `@cosmjs/amino` / `@cosmjs/proto-signing`. Exiger `pubKey`, `signature`, `signed`, `signDoc`.

**Priorite** : P1  
**Effort** : M

---

## 7. Helmet / Securite Fastify

**Analyse** : Headers securite manquants. Rate limit custom insuffisant.

**Recommandation** :
- `@fastify/helmet`
- `@fastify/rate-limit`
- `@fastify/cors` strict en prod
- Validation Zod systematique des payloads
- CSRF : priorite basse si auth Bearer JWT (pas de cookies/session)

**Priorite** : P1  
**Effort** : S

---

## 8. Multi-Wallet

**Analyse** : MetaMask-only limite fortement l'adoption.

**Recommandation** : **wagmi + viem** recommande car le projet utilise deja viem cote stack. Standardise connectors, chain switching, account state.

**Alternative** : si MVP ultra-leger, garder provider EIP-1193 maison + ajouter Coinbase injected plus tard.

**Priorite** : P1  
**Effort** : L

---

## 9. Ethereum Listeners

**Analyse** : Sans listeners, UI et JWT peuvent diverger du wallet reel.

**Recommandation** : centraliser dans un `WalletProvider` ou hook global `useWalletSession`, monte dans le layout client.

**Priorite** : P1  
**Effort** : S

```ts
provider.on("accountsChanged", (accounts) => {
  if (!accounts.length) logout();
  else setAddress(accounts[0]);
});
provider.on("chainChanged", () => window.location.reload());
provider.on("disconnect", logout);
```

---

## 10. Verification ABI

**Analyse** : Les data hex hardcodees sont fragiles. Si l'ABI change, le frontend peut envoyer une TX valide au mauvais selector.

**Recommandation** : embarquer ABI minimale versionnee et encoder avec `viem encodeFunctionData`. Verifier aussi `chainId`, contrat attendu.

**Priorite** : P0  
**Effort** : S

```ts
const data = encodeFunctionData({
  abi: gmAbi,
  functionName: "sayGm",
  args: [BigInt(streak)],
});
```

---

## 11. Redesign Profile

**Analyse** : La page profile melange identite, wallets, contrats, revenus, parametres.

**Recommandation** : onglets simples :
- Overview
- Wallets
- GM Contracts
- Earnings
- Settings

Sur mobile : tabs horizontaux scrollables. Sur desktop : sidebar legere.

**Priorite** : P1  
**Effort** : M

---

## 12. Notifications

**Analyse** : Polling toutes les 60s en arriere-plan gaspille API et batterie.

**Recommandation** :
- Court terme : suspendre avec `document.visibilityState`
- Moyen terme : SSE pour notifications simples
- WebSocket seulement si besoin bidirectionnel

**Priorite** : P1  
**Effort** : XS pour visibility, M pour SSE

```ts
if (document.visibilityState !== "visible") return;
```

---

## 13. Scam Detector

**Analyse** : Les patterns generiques (AI, coin, token) produiront toujours des faux positifs.

**Recommandation** : passer d'un modele binaire a un **score pondere**.
- Signal faible seul : warning
- Plusieurs signaux faibles : suspicious
- Signal fort : scam

Ajouter whitelist locale/versionnee et sources reputation.

**Priorite** : P1  
**Effort** : M

---

## 14. i18n

**Analyse** : Pour MVP, FR/EN minimal est acceptable. Migration complete trop tot peut ralentir.

**Recommandation** : **ne pas migrer tout de suite** vers react-i18next. Centraliser d'abord les strings dans dictionnaires types. Migrer plus tard si 3+ langues ou contenu marketing lourd.

**Priorite** : P2  
**Effort** : S maintenant, M plus tard

---

## 15. Pause / Emergency Solidity

**Analyse** : Meme un contrat simple peut avoir besoin d'un arret d'urgence, mais Ownable/Pausable augmente la surface de confiance.

**Recommandation** : pour v2, ajouter pause **uniquement sur `sayGm`**, pas sur `withdraw`. Les utilisateurs doivent toujours pouvoir retirer leurs fonds.

**Priorite** : P1  
**Effort** : M

---

## 16. Rescue Funds

**Analyse** : Si le createur est un contrat non payable, `withdrawCreator()` bloque ses fonds definitivement.

**Recommandation** : eviter un rescue unilateral par platformOwner. Preferer :
- `setCreatorPayoutAddress(address)` callable par creator
- `withdrawCreatorTo(address)` callable par creator
- En dernier recours : rescue timelock/multisig avec event public

**Priorite** : P1  
**Effort** : M

---

## 17. CI/CD

**Analyse** : Sans CI, les regressions TypeScript/tests/build peuvent entrer facilement.

**Recommandation** : workflow minimum sur PR :
```yaml
name: CI
on: [pull_request, push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm --filter @wcore/api test
      - run: pnpm build
```

**Priorite** : P1  
**Effort** : S

---

## 18. Tests E2E

**Analyse** : Les risques principaux sont les flows cross-stack.

**Recommandation** : commencer avec Playwright + wallet mock EIP-1193, pas un vrai MetaMask. Scenarios critiques :
- Connexion wallet moquee
- Scan wallet multi-chaines avec API moquee
- GM on-chain : choix contrat, switch chain, eth_sendTransaction, confirmation API
- Profile : contrats visibles, balances visibles selon role creator/platform
- Notifications : unread count, mark read
- Erreur user refuse switch chain

**Priorite** : P1  
**Effort** : L

---

## Conclusion GPT-5.5

Le meilleur prochain lot technique est :
1. **JWT_SECRET prod hard-fail**
2. **Redis rate limit + nonces**
3. **ABI via viem**
4. **Timeout scan raisonnable**
5. **Listeners wallet**

Ce lot reduit les risques reels sans lancer de refonte produit trop large.

---

## PROCHAINES ÉTAPES (backlog restant)

### Court terme (polish)
| # | Tâche | Priorité | Effort |
|---|-------|----------|--------|
| 1 | Ajouter plus de chaînes pour GM on-chain (Arbitrum, Optimism...) | P1 | S |
| 2 | Corriger `TOP_10` → `TOP_15` dans ChainSelector | P2 | XS |
| 3 | Nettoyer les TODOs/commentaires restants | P2 | XS |

### Moyen terme (features)
| # | Tâche | Priorité | Effort |
|---|-------|----------|--------|
| 4 | Dashboard creator plus riche (analytics tips reçus) | P2 | M |
| 5 | Notifications SSE (remplace polling) | P2 | M |
| 6 | Mode dégradé visible dans l'UI | P2 | S |

### Déploiement & Ops
| # | Tâche | Priorité | Effort |
|---|-------|----------|--------|
| 7 | Remplir `NEXT_PUBLIC_WC_PROJECT_ID` pour WalletConnect | P1 | XS |
| 8 | Configurer Docker pour production | P2 | M |
| 9 | Déploiement staging/production | P2 | L |
