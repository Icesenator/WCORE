# WCORE - Roadmap

> Index cross-runtime et priorites communes. Etat recroise avec le code et le contre-audit le 2026-08-09. Les details d'implementation et l'historique vivent dans les documents propres a chaque runtime.

## Sources de verite

- Audit transversal: `docs/audits/AUDIT.md`.
- Web/API: `wcore-web/ROADMAP.md` et `wcore-web/docs/audits/AUDIT.md`.
- GSheet: `wcore-gsheet/ROADMAP.md`.
- Releases Web: `wcore-web/CHANGELOG.md`.
- Releases GSheet: `wcore-gsheet/CHANGELOG.md`.
- Deploiement Web: `wcore-web/DEPLOY.md`.
- Operations GSheet: `wcore-gsheet/README.md` et `wcore-gsheet/AGENTS.md`.

## Runtime Ownership

- `wcore-gsheet/src/*.gs`: source canonique des configurations de chaines et runtime Apps Script.
- `wcore-gsheet/dist/`: package genere `@wcore/chains`.
- `wcore-web/`: frontend Next.js, API Fastify, moteurs Node, Prisma/PostgreSQL et Redis.
- Compte mesure depuis les configurations generees: 162 configurations, dont 149 EVM, 2 SVM, 10 Cosmos et 1 TON; 150 actives et 12 desactivees. Etat lifecycle aligne par `187309df`; nettoyage GM/wagmi finalise par `eb0ef921`. Le nombre actif/scannable reste dynamique et doit etre lu depuis `/api/chains`.

## Etat des phases

| Phase | Etat | Suite |
|---|---|---|
| FX et cache keys partages | Terminee | Garder la parite et supprimer les constructions de cles directes restantes |
| Package unifie `@wcore/chains` | Termine | Fiabiliser metadonnees et CI de generation |
| CEX runtime alignment | Termine pour 7 providers | Maintenir pricing FX, resilience UI et invariants atomiques de queue GSheet |
| Consolidation chain configs | Terminee, 162 configs | Maintenir la validation schema exhaustive et gerer les futurs sunsets |
| Delegation GSheet vers Web | Implementee, hardening actif | Compter les appels delegues et poursuivre le cache Web-backed |
| Cache GSheet Web-backed | Design valide, differe | Migrer les donnees reconstructibles sans casser le mode degrade |

## Priorite immediate

### Integrite des valeurs

- [x] Corriger la conversion USD vers EUR dans les deux chemins pricing CEX Web. Verifie le 2026-07-10 (29/29 tests API CEX/normalizers).
- [x] Conserver les derniers avoirs CEX sains lors d'une panne transitoire. Verifie le 2026-07-10 (28/28 tests Web CEX state/display).
- [x] Aligner stablecoins batch et Cosmos staking avec les chemins canoniques. Le batch reutilise le registre stablecoins partage; Cosmos expose les composantes staking, leur completude et preserve le dernier total GSheet sain sur erreur partielle. Verifie le 2026-08-10 (core, API et adaptateur GSheet). TON utilise la cascade FX commune sans taux fixe et l'identite `TON` / `Toncoin`.
- [x] Corriger la propagation des arguments Cosmos GSheet. Verifie le 2026-07-16 (v4.16.30).

### Securite et disponibilite

- [x] Securiser `/api/cex/prices`, consomme par Google Sheets: `x-gsheet-token` obligatoire, lots limites a 50, relais actions en batch unique et concurrence crypto bornee. Verifie le 2026-07-10 par tests auth/limite/batch.
- [x] Fermer SSRF/DNS rebinding sur tous les fetches GM. `safeFetch` valide chaque redirection et toutes les resolutions A/AAAA, echoue ferme et borne les redirections. Contre-audit du 2026-08-07.
- [x] Borner et persister les jobs async Web. File PostgreSQL, admission atomique, leases, heartbeat, fencing et reprise apres crash deployes et verifies le 2026-08-07.
- [x] Rendre `CEX_SECRET` obligatoire et retirer les tokens relay des URLs. Secret dedie obligatoire en production; relais privilegie par en-tete. Configuration CEX/GSheet centralisee et testee le 2026-08-09.
- [x] Rendre atomiques quota, queue et leases CEX GSheet. Compteur HTTP verrouille par `09e3d89e`; queue/pop/retry sous `ScriptLock`, lease proprietaire et fail-closed valides par les tests CEX ciblés.

### Livraison reproductible

- [x] Deplacer la CI GitHub dans `.github/workflows/` a la racine. Verifie localement le 2026-07-17 (working-directory/cache/artifacts adaptes au monorepo).
- [x] Corriger la chaine de migrations Prisma pour une base vide. Historique reconstructible et job CI PostgreSQL vierge verifies par le contre-audit du 2026-08-07.
- [x] Mettre `ws` a jour au-dela de 8.21.0. `ws@8.21.1`, audit sans HIGH/CRITICAL le 2026-07-17.
- [ ] Ajouter un `.dockerignore` racine et pruner l'image API.
- [x] Revenir a un lint vert et bloquant. 0 erreur/0 warning, step CI racine bloquant le 2026-07-17.
- [x] Bumper `dist/package.json` version a chaque `build:chains`. L'extracteur derive la version de `WCORE_VERSION` et un test refuse toute divergence depuis le 2026-08-05.

### Documentation (nouveau, audit 2026-07-16)

- [ ] Archiver les 19 specs/plans termines dans `docs/superpowers/archive/`.
- [x] Splitter `wcore-web/AGENTS.md` en guide actif + archive. Mesure 2026-08-09: 175 lignes actives, historique dans `wcore-web/AGENTS-ARCHIVE.md`.
- [ ] Reduire `wcore-web/ROADMAP.md` a l'etat et au futur (actuellement 2500+ lignes).
- [x] Reduire les `AGENTS.md` aux regles critiques sans secrets ni procedures locales. Mesure 2026-08-09: racine 27 lignes, Web 175, GSheet 182; archives separees.

## Fiabilite GSheet

- [x] Corriger la mise en forme `Portefeuille Action` quand des lignes sont masquees par filtre: reparation explicite avec filtre suspendu puis restaure, conditional formats etendus a la plage geree. Verifie le 2026-07-13.
- [x] HTTP counter rendu atomique (read-modify-write). Implemente par `09e3d89e`; tests `http-counter-atomicity.test.js` et `quota-recovery-state.test.js` passants.
- [x] Queue et leases CEX rendus atomiques: bulk relay, mutations sous `ScriptLock`, lease avec proprietaire, echec ferme sans perte silencieuse de jobs. Tests `cex-queue-integrity.test.js` et `cex-worker-revival.test.js` passants.
- [x] ACTIVITY_WATCHDOG desactive (v4.16.30).
- [ ] Reparer uniquement le trigger fautif, avec backoff, au lieu de recreer tous les triggers.
- [ ] Borner les recalculs A2/J1 par feuille et par jour.
- [ ] Aligner l'expiration du cache packed avec la preservation des wallets positifs.
- [x] Exiger une vraie majorite pour le consensus SVM: quorum calcule sur tous les RPC interroges, y compris les echecs; un seul survivant sur trois ne peut plus publier une balance.
- [ ] Corriger `batchWithConsensus`, actuellement premier-succes.
- [ ] Centraliser tous les appels HTTP sous budget, breaker et compteur.
- [ ] Splitter les 16 fichiers > 1000 lignes (plan HOTSPOT_SPLIT_PLAN.md non execute).
- [ ] Corriger `dist/package.json` version desynchronisee (4.15.50 vs runtime 4.16.30).
- [ ] Retirer ou restaurer les scripts npm references cassantes (`test:cache-keys`, `test:chain-config`).

## Fiabilite Web

- [x] Eviter qu'un echec GM soit interprete comme contrat absent. L'etat inconnu (`null`) remplace `false` sur panne depuis le 2026-08-04.
- [x] Supprimer les fan-outs GM frontend et normaliser les `chainKey`. Prix charge a l'action, statuts regroupes et cles canoniques verifies par les tests GM le 2026-08-05.
- [x] Ne plus poller `/api/circuit` admin-only depuis l'UI publique. Appel 401 et bandeau duplique supprimes le 2026-08-09; l'UI derive `circuitOpenChains` des erreurs de scan.
- [x] Centraliser les variables CEX/GSheet. URL et token relais, secret CEX, token et bornes GSheet vivent dans `apps/api/src/config.ts`; 14/14 variables documentees dans les deux templates le 2026-08-09.
- [x] Ajouter un test schema sur les 162 configurations generees. Le contrat runtime historique du package genere est valide exhaustivement dans Core; corruptions chainId/RPC/metadonnees refusees et gardes validees par mutation le 2026-08-09.
- [~] Tests comportementaux CEX ajoutes le 2026-07-17 (pannes, stale, concurrence, session, timeout complet); hooks GM encore a couvrir.
- [x] `Selected DeFi positions` V1 deploye et verifie le 2026-07-17 pour une couverture ciblee Compound V3, WCT, Chainbase et actifs stakes selectionnes. Le Web `/api/scan/batch` et GSheet partagent la finalisation `[Flex]`/`[Lock]`, pricing miroir, labels lisibles et dette signee; Compound est decouvert une fois par batch EVM, appelle `collateralBalanceOf(user, asset)` sur le Comet, utilise le contrat collatéral pour pricing/logo/sortie et derive les decimales de `AssetInfo.scale`. Commits `6accdda1`/`95b91591`; deploys Railway API `81f8df8f-b6a9-45ba-8aed-81070a70bc2f`, Web `58cbefc7-c45d-4804-9b53-2e4e815bc44b`. Smoke Optimism force: `degraded=false`, `errors=[]`, WCT `0,47 EUR` + `2,61 EUR`, Comp wrsETH `12,69 EUR`, dette WETH `-10,21 EUR`, net signe `10,43 EUR`.
- [x] Pages Market Cap livrees sur les routes stables `/cmc/crypto` et `/cmc/stocks`: 5 000 lignes par annuaire, logos, pays pour les actions, resumes responsive, recherche, pagination de 100 lignes et statut fresh/stale. CI et controle live attestes le 2026-07-17. Post X publie (`2078069673707348415`) et trois interactions verifiees.
- [x] Corriger les 19 erreurs lint et rendre le lint bloquant en CI. Verifie le 2026-07-17.

## Programmes data et execution

### Portfolio Intelligence multi-provider

- [ ] Construire un cadre serveur optionnel commun pour les enrichissements portfolio, avec cache provider separe, single-flight par wallet, budget, timeout et circuit breaker independant des chaines.
- [ ] Activer Zerion en V1 pour trois usages: positions DeFi absentes, indices de tokens wallet manquants verifies par RPC avant inclusion et diagnostic d'ecart de total. WCORE/RPC reste toujours autoritaire et les collisions sont gagnees par les positions WCORE.
- [ ] Ajouter ensuite Helius pour Solana, Etherscan V2 comme fallback de discovery/historique EVM et LI.FI Earn pour les vaults/yields non couverts. Ces providers sont prevus par le contrat V1 mais restent desactives jusqu'a leur propre validation.
- [ ] Conserver Blockscout dans son role actuel: accelerateur de discovery ERC-20 et de metadata/logo par chaine EVM; les balances restent relues par RPC/Multicall et le pricing reste gere par WCORE.
- [ ] Ne jamais transformer une panne d'enrichissement en scan `degraded`, erreur RPC ou ouverture d'un circuit breaker de chaine. Le dernier snapshot provider sain peut etre servi stale sans remplacer le resultat on-chain.
- Specification approuvee: `docs/superpowers/specs/2026-07-17-portfolio-enrichment-multi-provider-design.md`.

### Mega-agregateur bridge/swap multi-chaine

- [ ] Concevoir un moteur de comparaison de quotes distinct du portfolio avec un registre provider ouvert. LI.FI, Relay, Socket/Bungee, Rango, 0x/1inch et Jupiter sont des candidats initiaux non exhaustifs; tout nouvel agregateur peut etre evalue et active par configuration apres verification de ses contrats, quotas, couverture et garanties de securite.
- [ ] Normaliser chaque route par montant net recu, gas, frais, slippage, duree, nombre d'etapes et risque du bridge; dedupliquer les routes qui utilisent le meme chemin sous-jacent.
- [ ] Livrer d'abord un comparateur read-only de transactions non signees. Toute execution exige une specification separee, une validation explicite dans le wallet et un audit securite; WCORE ne detient jamais les fonds et ne signe jamais automatiquement.
- [ ] Definir `toutes chaines` comme toutes les chaines dynamiquement couvertes par au moins un routeur, sans promettre que les 162 configurations WCORE disposent toutes d'une route.
- [ ] Garder budgets, caches, secrets, breakers et telemetrie du routage entierement separes de ceux du scan portfolio.

## Chain Lifecycle

Deadlines passees, revalidees le 2026-07-17:

- Swellchain: vivante (blocs frais), conservee; 3 RPCs morts retires (v4.16.31).
- Corn: morte (RPC unique en 401); retrait des configurations finalise par `187309df`, puis nettoyage GM/wagmi deploye par `eb0ef921`.
- Polygon zkEVM: HALTED depuis le 2026-07-03 (sunset sequencer), `DISABLE_CHAIN` pose (v4.16.31); retrait complet a planifier.
- Botanix: vivante (blocs frais), conservee.

Deadlines futures:

- ZERO Network: 2026-07-31.
- Mint withdrawal gateway: 2026-10-20.
- Cronos zkEVM: 2027-06-03.

Chaque retrait doit couvrir GSheet, package genere, core Web, API, filtres scan, GM/factories, wagmi, explorers, icones, symboles, docs et tests.

## Documentation

- [ ] Corriger le mojibake de `wcore-web/ROADMAP.md`, `AGENTS.md` et `CHANGELOG.md` par conversion ciblee. L'audit 2026-07-16 confirme que le fix n'a pas encore ete applique.
- [ ] Reduire `wcore-web/ROADMAP.md` a l'etat et au futur; deplacer le passe vers CHANGELOG/archive.
- [x] Splitter `wcore-web/AGENTS.md` en guide Web actif (175 lignes mesurees) + `AGENTS-ARCHIVE.md`.
- [x] Mettre a jour les docs CEX GSheet pour les sept providers et l'architecture reelle de queue/triggers. Verification du contre-audit du 2026-08-05.
- [x] Marquer les plans Kraken, Robinhood, NFT/filter et CEX total comme termines.
- [ ] Archiver les 19 specs/plans termines dans `docs/superpowers/archive/`.
- [ ] Archiver `wcore-gsheet/AUDIT.md` (snapshot historique mai 2026, ne pilote plus le backlog).
- [x] Reduire `wcore-gsheet/AGENTS.md` aux contraintes critiques et gotchas. Mesure 2026-08-09: 182 lignes, historique dans `AGENTS-ARCHIVE.md`.

- [x] Decision d'architecture Graphify : un graphe local AST-only issu du staging unique prefixe Web + GSheet, sans cle fournisseur ni LLM, dans `K:\ProjetIA\WCORE\graphify-out\graph.json`.
- [ ] Finaliser le wrapper `graphify:sync`, le fallback horaire Windows et le watch OpenCode projet, sans utiliser le watch natif comme proprietaire de la synchronisation.
- [ ] Stabiliser les requetes deterministes et l'export Obsidian Markdown avec manifeste, sans conserver `graph.canvas`; verifier aussi le rapport et le manifeste produits.
- [ ] Valider une synchronisation reelle reussie, l'exactitude et la fraicheur des requetes, puis la passerelle memoire Obsidian avant de marquer l'integration terminee.
## Nouveaux risques (audit 2026-07-16)

- **A6 - DeFi Position Engine V1 - RESOLU 2026-07-17**: finalisation partagee GSheet et Web batch deployee; le flag `DEFI` fait autorite pour l'agregation API et le rendu TokenTable, tandis que l'allowlist de contrats proteges garde les lignes Optimism officielles propres dans l'agregation frontend wallet. Les totaux signes et le smoke Optimism `10,43 EUR` confirment le comportement cible sans revendiquer une couverture LP/vault/protocoles generale.
- **A7 - CI inactive - RESOLU 2026-07-17**: workflow deplace a la racine `WCORE/.github/workflows/` et CI verte.
- **A8 - Lint + dependances - RESOLU 2026-07-17**: lint bloquant vert; `ws@8.21.1`; aucune vulnerabilite HIGH/CRITICAL.
- **A3 - Hotspots GSheet**: 16 fichiers > 1000 lignes, plan de split (`HOTSPOT_SPLIT_PLAN.md`) abandonne.
- **A1 - Documentation non archivee**: 19 specs/plans termines cohabitent avec les documents actifs.

## Baseline de verification

```powershell
# Depuis la racine
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# GSheet
npm --prefix wcore-gsheet test
npm --prefix wcore-gsheet run build:chains
npm --prefix wcore-gsheet run test:phase3-chains
```

Les tests API avec DB/Redis doivent utiliser des instances de test dediees, jamais la production. `test:phase3-chains` regenere des artefacts: examiner le diff apres execution.
