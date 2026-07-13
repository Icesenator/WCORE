# WCORE Web - Audit courant

> Date de verification: 2026-07-10
> Perimetre: `apps/api`, `apps/web`, `packages/core`, `packages/shared`, `packages/db`, CI, Docker/Railway et documentation.
> Audit transversal complet: `../../docs/AUDIT.md`.

Ce fichier remplace l'etat du 2026-06-11. Une case n'est cochee qu'avec une preuve dans le code ou un test frais.

## Synthese

| Axe | Etat | Commentaire |
|---|---|---|
| Exactitude | A renforcer | Conversion CEX corrigee; divergences batch/staking/TON restantes |
| Securite | A renforcer | SSRF IPv6/DNS et CEX secret fallback; endpoint pricing CEX supprime |
| Fiabilite | A renforcer | Jobs async en memoire et fan-outs GM; CEX UI stale-safe |
| Tests | Bon socle | 301 tests core/shared passes; Web 129 passes et 6 tests non hermetiques |
| Qualite | En regression | Typecheck vert, lint rouge a 19 erreurs |
| Livraison | Risque eleve | Workflow CI place sous `wcore-web/.github`, migrations incompletes |
| Docs | Dette elevee | Roadmap/AGENTS/CHANGELOG volumineux et mojibakes |

## P1 - A traiter en premier

- [x] **W1 - RESOLVED 2026-07-10.** `convertUsdPriceToEur` multiplie les prix USD par le taux EUR/USD canonique pour les stables et DefiLlama. Preuve: `pricing.test.ts` + `normalizers.test.ts`, 29/29 passes; typecheck API et ESLint cible passes.
- [x] **W2 - RESOLVED 2026-07-10.** `/api/cex/prices`, requis par `_cexFetchWebPrices_` dans Google Sheets, exige maintenant `x-gsheet-token`, limite les lots a 50, envoie les actions au relais en un batch et borne le pricing crypto a 5 workers. Les anciens fan-outs multi-provider sont supprimes. Preuve: 33/33 tests API CEX/normalizers/stock-relay passes.
- [ ] **W3 - Migrations Prisma non reconstructibles.** Le schema contient des tables/champs sans migration de creation; `20260518103000_add_scam_override_contract` altere une table supposee existante. Ajouter une migration corrective et un test sur DB vide.
- [ ] **W4 - CI inactive.** Le seul workflow est `wcore-web/.github/workflows/ci.yml`, mais le depot Git commence un niveau au-dessus. Le deplacer vers `/.github/workflows/`.
- [ ] **W5 - SSRF/DNS rebinding incomplet.** `apps/api/src/lib/safe-http.ts` ne garantit ni A/AAAA publics ni epinglage de l'adresse validee. Centraliser les fetches RPC.
- [ ] **W6 - Jobs async non bornes/persistants.** `apps/api/src/plugins/scan-job.ts:23` utilise un store memoire sans borne; les timeouts ne stoppent pas le moteur. Quotas actifs, Redis, queue et AbortSignal.
- [ ] **W7 - Echec GM interprete comme contrat absent.** `apps/web/hooks/useOnChainGm.ts:86-101` retourne `false` sur panne. Introduire l'etat `unknown`.
- [ ] **W8 - Fan-out GM.** `apps/web/app/gm/GmPageClient.tsx:33-51` precharge 89 prix; `WalletContent.tsx` ne normalise pas les cles GM. Charger a la demande/batch borne et normaliser.
- [x] **W9 - RESOLVED 2026-07-10.** Les echecs transitoires conservent holdings/totaux avec marqueur degrade; auth, deconnexion et empty autoritatif effacent l'etat. La cle de session et le `requestId` bloquent les reponses obsoletes. Preuve: `cex-holdings-state.test.ts` + `cex-display.test.ts`, 28/28 passes; typecheck Web et ESLint cible passes.

## P2 - Sprint suivant

### API et securite

- [ ] Rendre `CEX_SECRET` obligatoire en production au lieu du fallback `JWT_SECRET` (`apps/api/src/plugins/cex.ts:103-105`).
- [ ] Mettre `ws` a jour en `>=8.21.0`; l'override 8.20.1 reste vulnerable.
- [ ] Refuser/degrader readiness si Redis configure est indisponible en production.
- [ ] Reduire le TTL access token ou ajouter une revocation user/session-level.
- [ ] Integrer toutes les variables CEX/GSheet dans `config.ts` et les templates env.
- [ ] Comparer l'origine CSRF complete, pas seulement le hostname.

### Core et cache

- [ ] Reutiliser `getStablecoinType` dans `evm-batch.ts`; couvrir EURC/EURS/EURE.
- [ ] Ne pas ecrire un zero Cosmos quand les branches staking ont echoue.
- [ ] Respecter `opts.sources` dans l'engine TON.
- [ ] Appliquer le registre de cles cache aux variantes `empty:v2:*` et constructions directes.
- [ ] Finir le partage `intraScanCache` cross-batch et le pipelining des autres writes.

### Frontend

- [ ] Supprimer le polling public de `/api/circuit`, devenu admin-only.
- [ ] Nettoyer les overrides scam locaux quand le serveur renvoie une liste vide.
- [ ] Ajouter labels aux formulaires CEX et semantique/focus au modal wallet.
- [ ] Ajouter roles tab, `aria-selected`, `aria-sort` et actions clavier dans les tables.
- [ ] Tester les comportements de panne de `useCexHoldings`, `useGmChain` et du warmup GM.

### Infra et qualite

- [ ] Pruner l'image API avec un artefact de production.
- [ ] Ajouter un `.dockerignore` racine adapte au contexte Railway parent.
- [ ] Corriger les 19 erreurs lint et rendre le lint bloquant en CI.
- [ ] Rendre `apps/web/__tests__/ui.test.ts` hermetique ou le deplacer en integration explicite.
- [ ] Ajouter un test schema exhaustif sur les 183 chaines.

## P3 - Structure

- [ ] Store jobs Redis/BullMQ et annulation bout en bout.
- [ ] Virtualisation/memo additionnelle des grandes listes si les profils reels la justifient.
- [ ] Error boundaries pour les routes restantes.
- [ ] Split `AGENTS.md` entre guide Web vivant et archives GSheet.
- [ ] Reduire la roadmap Web a environ 200 lignes; le passe va dans CHANGELOG/archive.
- [ ] Reparer le mojibake de ROADMAP/AGENTS/CHANGELOG avec une conversion controlee.

## Findings anciens fermes

- [x] N+1 GM upserts: `gm-helpers.ts` utilise `findMany`, `updateMany`, `createMany`.
- [x] ChainCard scam symbol-only: detection contract-aware active.
- [x] Metrics et scam-overrides publics: routes admin protegees.
- [x] Jobs anonymes lisibles par tout authentifie: ownership user/IP ajoute; le store memoire reste un risque distinct.
- [x] `RpcHealth` sans decay/instance par scan: singleton avec expiration.
- [x] AllTokensTable non bornee: affichage incremental limite.
- [x] Duplications `calcCleanChainValue`, `detectChainType`, `AuthUser`: largement resorbees.
- [x] Deux blocs `devDependencies`: un seul bloc reste.
- [x] Validation statique GSheet deplacee vers le runtime canonique.
- [~] Configuration API centralisee: socle `config.ts` present, integrations CEX/GSheet restantes.
- [~] Writes Redis: pipeline present sur le batch EVM, pas universel.
- [~] Cosmos: denoms inconnus durcis, panne staking/cache restante.

## Dette documentaire Web

- Le chainId Robinhood correct est 4663.
- Le compte est 183 configurations suivies; ne pas confondre avec le nombre actif.
- `ROADMAP.md`, `AGENTS.md` et `CHANGELOG.md` contiennent un mojibake massif.
- `ROADMAP.md` melange etat courant et plus de 2 000 lignes d'historique.
- Coinbase/OKX sont encore annonces comme futurs dans des sections historiques non clairement archivees.
- Les deadlines Swell, Corn, Polygon zkEVM et Botanix sont passees; leur statut code doit etre revalide.

## Verification 2026-07-10

```text
@wcore/core tests:     284/284 passes
@wcore/shared tests:    17/17 passes
@wcore/web tests:      129 passes, 6 ECONNREFUSED vers API locale absente
API CEX cible:         29/29 passes (`pricing.test.ts`, `normalizers.test.ts`)
Web CEX cible:         28/28 passes (`cex-holdings-state.test.ts`, `cex-display.test.ts`)
typecheck:             passe
lint:                  19 erreurs, 0 warning
ESLint CEX cible:      passe
pnpm audit --prod:     vulnerabilite haute `ws@8.20.1`
```

## Regles de maintenance

1. Ce fichier contient les findings Web ouverts et verifies, pas l'historique release.
2. Une case passe a `[x]` uniquement avec preuve code/test.
3. Toute nouvelle action cross-runtime doit aussi etre refletee dans `../../docs/AUDIT.md` et `../../ROADMAP.md`.
4. Ne pas creer de nouvel audit date pour le Web: mettre celui-ci a jour.
