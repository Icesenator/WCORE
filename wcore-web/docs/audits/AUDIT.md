---
type: audit
project: web
status: active
---
# WCORE Web - Audit courant

> Date de verification: 2026-07-10
> Perimetre: `apps/api`, `apps/web`, `packages/core`, `packages/shared`, `packages/db`, CI, Docker/Railway et documentation.
> Audit transversal complet: [`docs/audits/AUDIT.md`](../../../docs/audits/AUDIT.md).
>
> **Attention:** ce fichier precede le contre-audit du 2026-08-07. Une case non
> cochee ici n'est pas une preuve de travail ouvert — plusieurs l'etaient alors
> que le correctif existait deja. Croiser avec l'audit transversal et avec le
> code avant d'ouvrir un chantier.

Ce fichier remplace l'etat du 2026-06-11. Une case n'est cochee qu'avec une preuve dans le code ou un test frais.

## Synthese

| Axe | Etat | Commentaire |
|---|---|---|
| Exactitude | A renforcer | Conversion CEX corrigee; divergences batch/staking/TON restantes |
| Securite | A renforcer | SSRF IPv6/DNS et CEX secret fallback; endpoint pricing CEX supprime |
| Fiabilite | A renforcer | Jobs async en memoire et fan-outs GM; CEX UI stale-safe |
| Tests | Bon socle | Core 284/284 et Web 137/137 unitaires passes; tests API separes explicitement |
| Qualite | Verte | Typecheck et lint 0 erreur/0 warning |
| Livraison | A renforcer | CI racine restauree; migrations Prisma encore incompletes |
| Docs | Dette elevee | Roadmap/AGENTS/CHANGELOG volumineux et mojibakes |

## P1 - A traiter en premier

- [x] **W1 - RESOLVED 2026-07-10.** `convertUsdPriceToEur` multiplie les prix USD par le taux EUR/USD canonique pour les stables et DefiLlama. Preuve: `pricing.test.ts` + `normalizers.test.ts`, 29/29 passes; typecheck API et ESLint cible passes.
- [x] **W2 - RESOLVED 2026-07-10.** `/api/cex/prices`, requis par `_cexFetchWebPrices_` dans Google Sheets, exige maintenant `x-gsheet-token`, limite les lots a 50, envoie les actions au relais en un batch et borne le pricing crypto a 5 workers. Les anciens fan-outs multi-provider sont supprimes. Preuve: 33/33 tests API CEX/normalizers/stock-relay passes.
- [ ] **W3 - Migrations Prisma non reconstructibles.** Le schema contient des tables/champs sans migration de creation; `20260518103000_add_scam_override_contract` altere une table supposee existante. Ajouter une migration corrective et un test sur DB vide.
- [x] **W4 - RESOLVED 2026-07-17.** Workflow deplace vers `/.github/workflows/ci.yml`; working-directory, cache pnpm, E2E et artifacts adaptes au monorepo.
- [ ] **W5 - SSRF/DNS rebinding incomplet.** `apps/api/src/lib/safe-http.ts` ne garantit ni A/AAAA publics ni epinglage de l'adresse validee. Centraliser les fetches RPC.
- [ ] **W6 - Jobs async non bornes/persistants.** `apps/api/src/plugins/scan-job.ts:23` utilise un store memoire sans borne; les timeouts ne stoppent pas le moteur. Quotas actifs, Redis, queue et AbortSignal.
- [ ] **W7 - Echec GM interprete comme contrat absent.** `apps/web/hooks/useOnChainGm.ts:86-101` retourne `false` sur panne. Introduire l'etat `unknown`.
- [ ] **W8 - Fan-out GM.** `apps/web/app/gm/GmPageClient.tsx:33-51` precharge 89 prix; `WalletContent.tsx` ne normalise pas les cles GM. Charger a la demande/batch borne et normaliser.
- [x] **W9 - RESOLVED 2026-07-10.** Les echecs transitoires conservent holdings/totaux avec marqueur degrade; auth, deconnexion et empty autoritatif effacent l'etat. La cle de session et le `requestId` bloquent les reponses obsoletes. Preuve: `cex-holdings-state.test.ts` + `cex-display.test.ts`, 28/28 passes; typecheck Web et ESLint cible passes.

## P2 - Sprint suivant

### API et securite

- [x] **RESOLVED 2026-08-04, centralise 2026-08-09.** `resolveCexEncryptionSecret` dans `apps/api/src/config.ts` leve une erreur en production quand `CEX_SECRET` manque ou est blanc; le repli sur `JWT_SECRET` ne subsiste qu'hors production, pour ne pas rendre illisibles les identifiants deja stockes en dev. Preuve: `apps/api/src/plugins/cex-secret.test.ts`, garde blanche validee par mutation.
- [x] Mettre `ws` a jour en `>=8.21.0`: override et lockfile en `8.21.1`, audit sans HIGH/CRITICAL.
- [x] **RESOLVED 2026-08-07, verrouille 2026-08-09.** `/ready` sonde PostgreSQL et Redis et repond 503 des que l'un manque. La garde existait sans aucun test: un `grep "/ready"` sur les fichiers de test ne renvoyait rien. Les deux routes sont extraites dans `apps/api/src/plugins/health.ts` et couvertes par `health.test.ts`, qui verrouille aussi le fait que `/health` reste une sonde de liveness — elle ne sonde aucune dependance et n'expose pas l'etat des disjoncteurs (SEC-10). Gardes validees par mutation.
- [x] **RESOLVED avant le 2026-08-09, preuve recroisee.** Access token et cookie expirent apres 24 h, refresh apres 7 jours. Chaque token signe porte un `jti`; le hook refuse `revoked:<jti>`, le refresh revendique atomiquement l'ancien refresh puis revoque l'access courant, et logout revoque access + refresh. Le vol d'une copie du token courant partage le meme `jti` et est donc invalide apres revocation. Preuve ciblee: `auth-access-token.test.ts` refuse un access token revoque.
- [x] **RESOLVED 2026-08-09.** URL et token du relais, secret de chiffrement CEX, token GSheet et bornes de travail GSheet sont resolus dans `apps/api/src/config.ts`; aucune lecture `CEX_*`, `GSHEET_*`, `RELAY_TOKEN` ou `*_RELAY_URL` ne subsiste dans le code de production hors de ce fichier. Les 14 variables concernees figurent dans `.env.example` et `.env.production.template`. La centralisation a revele et ferme quatre divergences de repli URL, un appel relais avec token vide, un secret CEX blanc accepte comme cle AES et l'impossibilite de configurer `GSHEET_SCAN_PRICE_REPAIR_LIMIT=0`. Preuves: 203/203 tests cibles, gardes principales validees par mutation.
- [x] **RESOLVED 2026-08-09.** La garde compare desormais `URL.origin` complet (scheme, hostname, port effectif), refuse protocoles non HTTP(S), URLs malformees et credentials embarques. `Origin` est autoritaire quand present; `Referer` ne sert de fallback que lorsqu'il manque, donc un Referer autorise ne peut plus masquer un Origin hostile. Deux causes validees separement par mutation (retour a `hostname`, puis fallback Referer permissif). Suite pure `scan.test.ts`: 31/31; typecheck 5/5, lint 0.

### Core et cache

- [x] **RESOLVED avant le 2026-08-09, couverture ajoutee le 2026-08-09.** Le refactor moteur a deja fait converger single et batch: `evm-batch.ts` appelle `priceToken`, qui derive `isStable` et `peg` via `getStablecoinType`. Le helper canonique couvre EURC/EURS/EURE. Un test au point partage exige 1 EUR, valeur correcte et zero appel externe pour les trois symboles de registre; retirer EURE du helper fait echouer la garde. Core 354/355 (1 skip).
- [ ] Ne pas ecrire un zero Cosmos quand les branches staking ont echoue.
- [ ] Respecter `opts.sources` dans l'engine TON.
- [ ] Appliquer le registre de cles cache aux variantes `empty:v2:*` et constructions directes.
- [ ] Finir le partage `intraScanCache` cross-batch et le pipelining des autres writes.

### Frontend

- [x] **RESOLVED 2026-08-09.** Le hook public ne reference plus `/api/circuit`, qui repondait necessairement 401 sans token admin. Le bandeau utile derive deja `circuitOpenChains` des erreurs de scan; l'etat et le second bandeau alimentes uniquement par l'appel impossible sont supprimes. Garde architecturale validee par mutation; tests Web 184/184.
- [ ] Nettoyer les overrides scam locaux quand le serveur renvoie une liste vide.
- [ ] Ajouter labels aux formulaires CEX et semantique/focus au modal wallet.
- [ ] Ajouter roles tab, `aria-selected`, `aria-sort` et actions clavier dans les tables.
- [~] `useCexHoldings` est couvert pour pannes transitoires, non-2xx, comptes vides, concurrence, session obsolete et timeouts complets. Les comportements de panne de `useGmChain` et du warmup GM restent a tester.

### Infra et qualite

- [ ] Pruner l'image API avec un artefact de production.
- [ ] Ajouter un `.dockerignore` racine adapte au contexte Railway parent.
- [x] Corriger les 19 problemes lint et rendre le lint bloquant en CI: 0 erreur/0 warning.
- [x] Deplacer `apps/web/__tests__/ui.test.ts` en `ui.integration.ts` avec commande `test:integration`; le test unitaire est hermetique.
- [x] **RESOLVED 2026-08-09.** `RUNTIME_CHAIN_CONFIG_SCHEMA` valide le contrat reel publie par `@wcore/chains` (forme GAS historique) sans pretendre que les 182 configs ont deja migre vers le schema cible en minuscules. Le test parcourt les 182 configs, refuse cles dupliquees, chainId EVM absent, URL RPC invalide et metadonnees natives manquantes; exceptions explicites par VM et pour `DISABLE_NATIVE_BALANCE`. Gardes chainId/URL validees par mutation. Core 353/354 (1 skip), Shared 41/41.

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

## Verification 2026-07-17

```text
@wcore/core tests:     284/284 passes
@wcore/shared tests:    17/17 passes
@wcore/web tests:      129 passes, 6 ECONNREFUSED vers API locale absente
API CEX cible:         29/29 passes (`pricing.test.ts`, `normalizers.test.ts`)
Web CEX cible:         36/36 passes (`cex-holdings-state.test.ts`, `cex-display.test.ts`)
typecheck:             passe
lint:                  19 erreurs, 0 warning
ESLint CEX cible:      passe
pnpm audit --prod:     vulnerabilite haute `ws@8.20.1`
```

## Regles de maintenance

1. Ce fichier contient les findings Web ouverts et verifies, pas l'historique release.
2. Une case passe a `[x]` uniquement avec preuve code/test.
3. Toute nouvelle action cross-runtime doit aussi etre refletee dans [`docs/audits/AUDIT.md`](../../../docs/audits/AUDIT.md) et [`ROADMAP.md`](../../../ROADMAP.md).
4. Ne pas creer de nouvel audit date pour le Web: mettre celui-ci a jour.
