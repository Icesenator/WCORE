# WCORE - Audit transversal

> Date de verification: 2026-07-16  
> Perimetre: depot racine, `wcore-web`, `wcore-gsheet`, package genere `@wcore/chains`, CI, documentation et roadmaps.  
> Methode: inspection statique du worktree courant, reconciliation des audits existants, recherches ciblees et tests non destructifs. Aucun appel live aux wallets, RPC, CEX, Google Sheets ou environnements Railway n'a ete effectue.  
> Precedent audit: 2026-07-10 (10 P1 identifies, 4 resolus). Cet audit re-evalue le statut de chaque finding et ajoute les decouvertes de l'audit complet du 2026-07-16.

## Resume executif

WCORE dispose d'une architecture mature: quatre VM, 183 configurations de chaines, une cascade de pricing multi-source, des caches defensifs, des scans Web et Apps Script, sept connecteurs CEX et une couverture de tests importante. Les principaux risques ne viennent plus d'un manque de fonctionnalites, mais d'invariants divergents entre chemins d'execution, de mecanismes concurrents non atomiques et d'une documentation devenue difficile a maintenir.

Aucun P0 n'a ete confirme statiquement. Les actions les plus urgentes sont classees P1:

1. RESOLU le 2026-07-10: conversion USD vers EUR des avoirs CEX Web.
2. RESOLU le 2026-07-10: suppression de l'endpoint public de pricing CEX inutilise.
3. Rendre la chaine de migrations Prisma reconstructible sur une base vide.
4. Remettre la CI GitHub a l'emplacement racine reconnu.
5. Fermer les contournements SSRF/DNS rebinding et borner les jobs async.
6. Corriger la signature Cosmos GSheet et rendre atomiques quota, queue et leases CEX.
7. Arreter les boucles de reinstallation de triggers et de recalcul J1.
8. Aligner les politiques de cache et de consensus sur leurs garanties documentees.

## Etat mesure

| Axe | Etat verifie |
|---|---|
| Chaines generees | 183: 169 EVM, 2 SVM, 11 Cosmos, 1 TON |
| Web | Next.js 16, Fastify, Prisma/PostgreSQL, Redis, Railway |
| GSheet | 250 fichiers `.gs` (60 342 lignes), 3 033 fonctions, v4.16.30 |
| CEX | 7 providers: Binance, Bitpanda, Bitfinex, Bybit, Coinbase, OKX, Kraken |
| Tests core/shared | 301/301 passes |
| Tests web | 137/137 unitaires passes; 6 tests API isoles en integration explicite |
| Tests GSheet principaux | passes (`npm test`), 28 guard tests structurels |
| Tests relay | 9/9 passes |
| TypeScript | typecheck Web et monorepo sans erreur |
| Lint | vert: 0 erreur, 0 warning; bloquant dans la CI racine |
| Dependances | `ws@8.21.1`; aucune vulnerabilite HIGH/CRITICAL (`pnpm audit --prod`) |
| Documentation | audits Web/GSheet perimes, trois gros fichiers Web en mojibake |
| Fichiers > 1000 lignes | 16 fichiers `.gs` (max: 2 846 lignes `27_ACTIVITY_REFRESH.gs`) |
| CI GitHub | workflow deplace a `.github/workflows/ci.yml`, chemins monorepo adaptes |
| Specs/plans | 20 termines (non archives), 7 en cours, 3 non commences |
| Dead code | 9 fonctions `LEGACY_DISABLED`, module `28_PRICING_WORKER` (1 312 lignes), `ACTIVITY_WATCHDOG` desactive |

## Findings P1

### W1 - Conversion USD/EUR CEX inversee - RESOLVED 2026-07-10

- Correction: `convertUsdPriceToEur` applique la convention canonique `priceEur = priceUsd * fxRate` aux stables USD et aux prix USD DefiLlama, avec rejet des entrees invalides.
- Preuves: `wcore-web/apps/api/src/cex/pricing.test.ts` et `normalizers.test.ts`, 29/29 tests passes le 2026-07-10; typecheck API et ESLint cible passes.

### W2 - Amplification HTTP sur le pricing CEX public - RESOLVED 2026-07-10

- Correction: la recherche initiale avait manque `_cexFetchWebPrices_` dans `wcore-gsheet/src/35_BITPANDA_SYNC.gs`. La route requise est restauree avec `x-gsheet-token` obligatoire, limite de 50 symboles alignee sur les chunks GSheet, batch relais unique pour les actions et concurrence crypto bornee a 5. Les anciens helpers multi-provider non bornes restent supprimes.
- Preuves: tests auth, limite et batch dans `wcore-web/apps/api/src/cex/pricing.test.ts`; 33/33 tests API CEX/normalizers/stock-relay passes le 2026-07-10.

### W3 - Historique de migrations Prisma non reconstructible

- Preuves: `wcore-web/packages/db/prisma/schema.prisma` contient `ScamOverride`, `Ticket` et des champs absents des migrations de creation; `20260518103000_add_scam_override_contract/migration.sql` altere directement `scam_overrides`.
- Impact: `prisma migrate deploy` peut echouer sur une base vide, compromettant staging et restauration apres sinistre.
- Action minimale: migration corrective complete, puis test CI sur PostgreSQL vierge.

### W4 - CI GitHub inactive - RESOLVED 2026-07-17

- Correction: workflow deplace vers `.github/workflows/ci.yml`; `defaults.run.working-directory`, cache pnpm, rapport Playwright et commandes E2E adaptes a `wcore-web/`.
- Preuves: YAML parse/formate, `pnpm install --frozen-lockfile`, lint, typecheck, tests core/web et build complet passes localement le 2026-07-17.

### W5 - Protection SSRF et DNS rebinding incomplete

- Preuves: `wcore-web/apps/api/src/lib/safe-http.ts:35-50` definit `assertNoDnsRebind`, mais les fetches GM n'appliquent pas une resolution epinglee. Les formes IPv6 mappees et ULA restent contournables.
- Impact: un RPC controle peut viser loopback, metadata cloud ou reseau prive.
- Action minimale: client HTTP unique validant toutes les adresses A/AAAA et epinglant l'adresse validee; tests IPv4, IPv6 et TOCTOU.

### W6 - Jobs async non bornes et non persistants

- Preuves: `wcore-web/apps/api/src/plugins/scan-job.ts:23` conserve les jobs en memoire sans borne globale; les timeouts de `scan.ts` n'annulent pas le moteur sous-jacent.
- Impact: croissance RAM, amplification RPC, perte au restart et incoherence multi-replique.
- Action minimale: limite par IP/user et globale, store Redis avec TTL, queue partagee et vraie propagation `AbortSignal`.

### W7 - Echec GM Web transforme en invitation a redeployer

- Preuves: `wcore-web/apps/web/hooks/useOnChainGm.ts:86-101` retourne `false` sur echec de `/api/gm/has-deployed`; `useGmChain.ts:97-104` rend alors le chemin Deploy.
- Impact: transaction inutile ou revert avec frais gas pendant une panne API.
- Action minimale: etat `unknown`, bouton desactive et retry explicite.

### W8 - Fan-out GM frontend

- Preuves: `wcore-web/apps/web/app/gm/GmPageClient.tsx:33-51` precharge 89 prix en `Promise.all`; `WalletContent.tsx:80-83,471` indexe une map GM sans normaliser la casse.
- Impact: rafales de requetes, rate-limit et refetch par carte.
- Action minimale: chargement a la demande ou batch borne; normaliser toutes les cles GM en lowercase cote UI.

### W9 - Une panne CEX efface les avoirs affiches - RESOLVED 2026-07-10

- Correction: les echecs transitoires conservent les derniers avoirs et totaux sains avec marqueur degrade sans duplication; 401/403, deconnexion et reponse vide autoritative restent fail-closed. L'etat est indexe par session et les reponses obsoletes sont ignorees par `requestId`.
- Preuves: `wcore-web/apps/web/__tests__/cex-holdings-state.test.ts` et `cex-display.test.ts`, 28/28 tests passes le 2026-07-10; typecheck Web et ESLint cible passes.

### G1 - Signature Cosmos GSheet incomplete

- Preuves: `wcore-gsheet/src/19_CHAIN_FACTORY.gs:393-397` n'accepte que `(address, forceFull)`, alors que les wrappers et l'engine utilisent la convention a cinq arguments.
- Impact: `tokensRange`, `forceFull` et `triggerRefresh` sont decales ou perdus; les gardes recentes et la whitelist Web deviennent inaccessibles.
- Action minimale: propager les cinq arguments de facon identique aux autres VM et ajouter un test de contrat factory.

### G2 - Compteur quota non atomique et delegation Web non comptee

- Preuves: `wcore-gsheet/src/03E_QUOTA_CIRCUIT_BREAKER.gs:561-617` fait un read-modify-write sans verrou; `41_GSHEET_WEB_SCAN.gs:568-580` utilise `_originalUrlFetch`.
- Impact: sous-comptage sous concurrence et mode NORMAL maintenu trop longtemps.
- Action minimale: section critique atomique ou compteur append/merge, et comptabilisation explicite des tentatives Web.

### G3 - Queue et leases CEX non atomiques

- Preuves: enqueue, pop, retry et leases dans `wcore-gsheet/src/35_BITPANDA_SYNC.gs:127-142,273-289,344-357,391-458` reposent sur `ScriptProperties` sans verrou.
- Impact: jobs perdus, double execution, lease concurrent et JSON tronque par la limite de 8 000 caracteres.
- Action minimale: `LockService` autour des transitions et refus/compaction structuree avant toute troncature.

### G4 - Auto-heal global trop agressif

- Preuves: `wcore-gsheet/src/16B_AUTO_HEAL.gs:254-278` peut supprimer/recreer tous les triggers si un seul CEX est stale; le timer tourne toutes les dix minutes.
- Impact: churn permanent, decalage des triggers sains et panne metier masquee.
- Action minimale: backoff persistant, seuil d'echecs et reparation ciblee du handler fautif.

### G5 - Cache positif expire malgre la politique de preservation

- Preuves: `wcore-gsheet/src/04B_CACHE_WALLET.gs:763-788` retourne `null` apres le TTL sans examiner les balances, alors que le prune protege les wallets positifs.
- Impact: `NO_CACHE_WAITING_REFRESH` pendant une panne quota pour un wallet positif peu actif.
- Action minimale: aligner `_packedGet_` sur la politique de retention ou documenter clairement l'expiration absolue.

### G6 - Recalcul A2/J1 potentiellement infini

- Preuves: `wcore-gsheet/src/16_REFRESH.gs:751-770,801-818` reecrit J1 a `I1 + 1s` sans compteur, cooldown ni verification de valeur deja tentee.
- Impact: recalculs repetes, thundering herd et consommation quota.
- Action minimale: budget de retry par feuille/24 h, backoff et idempotence.

### G7 - Consensus SVM non majoritaire

- Preuves: `wcore-gsheet/src/14_SVM_ENGINE.gs:206-230` accepte toute meilleure valeur des qu'une seule reponse existe.
- Impact: une voix sur trois ou une egalite dependante de l'ordre RPC est presentee comme consensus.
- Action minimale: imposer `bestCount * 2 > successfulVotes`; sinon fallback cache/degrade explicite.

## Findings P2

### Web/API

- `wcore-web/apps/api/src/plugins/cex.ts:103-105`: `CEX_SECRET` fallback sur `JWT_SECRET`; rendre une cle CEX dediee obligatoire en production.
- `wcore-web/package.json:39`: override `ws@8.20.1` vulnerable; passer a `>=8.21.0` et regenerer le lockfile.
- `wcore-web/apps/api/src/server.ts:42-51`: fallback Redis memoire en production; rendre le service non-ready ou refuser le boot si Redis configure est indisponible.
- `wcore-web/apps/api/src/auth.ts`: access token 24 h; reduire le TTL ou ajouter une version de session utilisateur.
- `wcore-web/apps/api/src/plugins/cex.ts`: variables d'environnement CEX encore lues hors config typee; completer `config.ts` et les templates.
- `wcore-web/apps/api/Dockerfile.railway`: image non prunee; produire un artefact runtime `pnpm deploy --prod`.
- Le contexte Railway part de la racine sans `.dockerignore` racine; exclure `.env*`, backups, logs, caches et artefacts.
- `evm-batch.ts` n'utilise pas le helper stablecoin du scan simple; EURC/EURS/EURE peuvent perdre le fast-path.
- `cosmos.ts` peut ecrire un zero natif apres une panne staking partielle.
- `ton.ts` expose `opts.sources` mais utilise toujours les sources par defaut.
- Le frontend continue de poller `/api/circuit` devenu admin-only.
- Une synchronisation scam vide ne nettoie pas les overrides locaux obsoletes.
- Le registre de cles cache n'est pas applique uniformement (`empty:v2:*` construit en direct dans plusieurs engines).
- Accessibilite: formulaires CEX sans labels persistants, modal wallet sans semantique/focus, tabs et tris incomplets.

### GSheet

- `05_RPC.gs:871-965`: `batchWithConsensus` s'arrete apres le premier RPC reussi; renommer ou obtenir une vraie majorite.
- `TON.gs:114-119`: fallback FX a `1` contraire a la politique sans taux fixe.
- Les tokens relay sont encore presents dans des query strings; utiliser un header d'autorisation.
- `src/appsscript.json` expose `executionApi.access = ANYONE`; restreindre avant toute reactivation de l'Execution API.
- Plusieurs chemins `UrlFetchApp` contournent budget/mode HTTP central.
- Les metadonnees de `dist/package.json` ne representent plus l'etat du package genere.
- Deux scripts npm GSheet referencent des fichiers absents (`test-cache-keys.js`, `test-chain-config.js`).

## Dette documentaire

- `wcore-web/ROADMAP.md`, `wcore-web/AGENTS.md` et `wcore-web/CHANGELOG.md` contiennent des milliers de sequences mojibake. Une migration d'encodage ciblee est necessaire; ne pas faire un remplacement aveugle des arbres ASCII legitimes.
- Les chiffres 180+/182/183 coexistent. Convention retenue: **183 configurations suivies**; le nombre actif est dynamique et doit venir de `/api/chains`.
- Le chainId Robinhood correct est **4663**, pas 9496.
- `wcore-gsheet/AUDIT.md` reste un snapshot historique de mai et ne doit plus piloter le backlog.
- Les plans Kraken, Robinhood, filtre NFT et CEX INFO_TOTAL sont realises mais encore presentes comme ouverts.
- `wcore-web/AGENTS.md` duplique massivement l'ancien guide GSheet et contient des instructions obsoletes ou contradictoires.
- La roadmap Web melange etat courant, release notes, marketing et archeologie sur plus de 2 500 lignes.
- Plusieurs deadlines de sunset sont passees alors que les configs restent presentes: Swell, Corn, Polygon zkEVM et Botanix doivent etre revalidees puis desactivees/retirees selon la politique produit.

## Roadmap priorisee

### Sprint 0 - integrite immediate

- Corriger W1 et ajouter les tests de conversion CEX.
- Corriger G1, G2 et G3 avec tests de concurrence/contrat.
- Deplacer la CI a la racine et mettre a jour `ws`.
- Rendre les migrations reproductibles sur base vide.

### Sprint 1 - securite et resilience

- Fermer W2, W5 et W6.
- Corriger W7, W8 et W9 pour eviter actions et totaux trompeurs.
- Corriger G4, G5, G6 et G7.
- Rendre `CEX_SECRET` obligatoire et retirer les secrets des query strings.

### Sprint 2 - coherence runtime

- Aligner stablecoins batch, Cosmos staking, TON sources/FX et cles cache.
- Finir la centralisation de configuration et le prune Docker.
- Ajouter tests des 183 configs et des comportements hooks CEX/GM.
- Revalider les chaines sunset et single-RPC.

### Dette structurelle

- Store jobs Redis/queue partagee avec annulation bout en bout.
- Cache GSheet Web-backed, tout en conservant une degradation autonome.
- Split des documents vivants et conversion d'encodage.
- Roadmaps courtes; historique uniquement dans CHANGELOG/archives.

## Nouveaux findings (audit 2026-07-16)

### A1 - 19 specs/plans termines non archives

- **Preuves**: 20 fichiers dans `docs/superpowers/specs/` et `docs/superpowers/plans/` (tous niveaux), dont 19 sont termines mais non archives. Aucune structure d'archive sous `docs/superpowers/`.
- **Impact**: confusion entre docs actifs et historiques, navigation difficile.
- **Action**: creer `docs/superpowers/archive/`, deplacer les fichiers termines, mettre a jour les references croisees.

### A2 - AGENTS.md wcore-web = 2 documents fusionnes (979+ lignes)

- **Preuves**: `wcore-web/AGENTS.md` contient l'architecture Apps Script (~60% du contenu) en plus du guide web. L'audit 2026-06-07 recommandait deja le split.
- **Impact**: les developpeurs web naviguent dans de la documentation GSheet non pertinente. Contenu contradictoire (version GSheet vs Web).
- **Action**: splitter en `docs/apps-script-legacy.md` (archive) + garder uniquement le guide web dans AGENTS.md.

### A3 - 16 fichiers .gs > 1000 lignes, plan de split abandonne

- **Preuves**: `HOTSPOT_SPLIT_PLAN.md` (cree post-audit v4.15.13) identifie 3 hotspots a splitter. Aucun split effectue. Les fichiers ont continue de grossir (+826 lignes pour `27_ACTIVITY_REFRESH.gs`).
- **Impact**: maintenabilite reduite, risque de depasser la limite GAS de 50 000 caracteres par fichier.
- **Action**: executer le plan de split ou le marquer comme obsolete avec justification.

### A4 - package.json GSheet: 2 scripts npm references cassées

- **Preuves**: `test:cache-keys` et `test:chain-config` referencent `scripts/test-cache-keys.js` et `scripts/test-chain-config.js` qui n'existent pas. Le dossier `scripts/` est gitignore.
- **Impact**: erreur si quelqu'un tente d'executer ces scripts. Confusion pour les nouveaux contributeurs.
- **Action**: retirer les scripts ou restaurer les fichiers.

### A5 - `dist/package.json` version desynchronisee

- **Preuves**: `dist/package.json` indique `4.15.50`, le runtime GSheet est en `4.16.30`. Decalage de 80+ versions.
- **Impact**: la version du package genere ne reflete pas la realite du runtime.
- **Action**: bumper `dist/package.json` a chaque `build:chains`.

### A6 - DeFi Position Engine v1: spec complete mais zero implementation

- **Preuves**: spec (317 lignes) + plan (872 lignes) dans `wcore-gsheet/docs/superpowers/`. Toutes les checkboxes du plan sont decochees. Les positions DeFi (Compound V3, WCT Staking) sont gerees par des patches one-off.
- **Impact**: dette architecturale. Le code de production utilise des workarounds la ou un registre structurel est prevu.
- **Action**: prioriser ou abandonner formellement le design.

### A7 - CI GitHub non operationnelle - RESOLVED 2026-07-17

- **Correction**: workflow deplace a `WCORE/.github/workflows/ci.yml`, avec chemins monorepo explicites.
- **Validation**: installation frozen, lint, typecheck, tests et build passent localement; execution GitHub effective au prochain push.

### A8 - Lint rouge non bloquant + vulnerability `ws` non patchee - RESOLVED 2026-07-17

- **Correction**: 18 erreurs et 1 warning corriges; `ws` force en `8.21.1`; lint execute sans tolerance dans la CI racine.
- **Validation**: ESLint 0 erreur/0 warning; audit production sans HIGH/CRITICAL; lockfile frozen valide.

## Verifications executees

```text
wcore-web core tests:          284/284 passes
wcore-web shared tests:         17/17 passes
wcore-web tests:               137/137 unitaires passes; integration API separee
wcore-web typecheck:           passe
wcore-web lint:                0 erreur, 0 warning
wcore-gsheet npm test:         passe, 3 033 fonctions validees, 28 guard tests
wcore-gsheet relay tests:        9/9 passes
git diff --check:              passe sur les perimetres audites
pnpm audit --prod:             1 vulnerabilite haute `ws`
```

Limites: l'etat live des triggers GAS, quotas, caches, bases, RPC, CEX et services Railway n'a pas ete sonde. Les constats de concurrence GSheet sont issus de l'analyse des transitions read-modify-write et demandent une validation runtime apres correction.
