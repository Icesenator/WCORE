# WCORE - Roadmap

> Index cross-runtime et priorites communes. Etat verifie le 2026-07-17. Les details d'implementation et l'historique vivent dans les documents propres a chaque runtime.

## Sources de verite

- Audit transversal: `docs/AUDIT.md`.
- Web/API: `wcore-web/ROADMAP.md` et `wcore-web/docs/AUDIT.md`.
- GSheet: `wcore-gsheet/ROADMAP.md`.
- Releases Web: `wcore-web/CHANGELOG.md`.
- Releases GSheet: `wcore-gsheet/CHANGELOG.md`.
- Deploiement Web: `wcore-web/DEPLOY.md`.
- Operations GSheet: `wcore-gsheet/README.md` et `wcore-gsheet/AGENTS.md`.

## Runtime Ownership

- `wcore-gsheet/src/*.gs`: source canonique des configurations de chaines et runtime Apps Script.
- `wcore-gsheet/dist/`: package genere `@wcore/chains`.
- `wcore-web/`: frontend Next.js, API Fastify, moteurs Node, Prisma/PostgreSQL et Redis.
- Compte courant: 183 configurations suivies. Le nombre actif/scannable est dynamique et doit etre lu depuis `/api/chains`.

## Etat des phases

| Phase | Etat | Suite |
|---|---|---|
| FX et cache keys partages | Terminee | Garder la parite et supprimer les constructions de cles directes restantes |
| Package unifie `@wcore/chains` | Termine | Fiabiliser metadonnees et CI de generation |
| CEX runtime alignment | Termine pour 7 providers | Corriger pricing FX, resilience UI et concurrence queue GSheet |
| Consolidation chain configs | Terminee, 183 configs | Ajouter validation schema exhaustive et gerer les sunsets |
| Delegation GSheet vers Web | Implementee, hardening actif | Corriger le contrat Cosmos et compter les appels delegues |
| Cache GSheet Web-backed | Design valide, differe | Migrer les donnees reconstructibles sans casser le mode degrade |

## Priorite immediate

### Integrite des valeurs

- [x] Corriger la conversion USD vers EUR dans les deux chemins pricing CEX Web. Verifie le 2026-07-10 (29/29 tests API CEX/normalizers).
- [x] Conserver les derniers avoirs CEX sains lors d'une panne transitoire. Verifie le 2026-07-10 (28/28 tests Web CEX state/display).
- [ ] Aligner stablecoins batch, Cosmos staking et TON FX/sources avec les chemins canoniques.
- [x] Corriger la propagation des arguments Cosmos GSheet. Verifie le 2026-07-16 (v4.16.30).

### Securite et disponibilite

- [x] Securiser `/api/cex/prices`, consomme par Google Sheets: `x-gsheet-token` obligatoire, lots limites a 50, relais actions en batch unique et concurrence crypto bornee. Verifie le 2026-07-10 par tests auth/limite/batch.
- [ ] Fermer SSRF/DNS rebinding sur tous les fetches RPC.
- [ ] Borner et persister les jobs async Web.
- [ ] Rendre `CEX_SECRET` obligatoire et retirer les tokens relay des URLs.
- [x] Rendre atomiques quota, queue et leases CEX GSheet. Verifie le 2026-07-16 (v4.16.30, HttpCounter atomique + bulk relay).

### Livraison reproductible

- [x] Deplacer la CI GitHub dans `.github/workflows/` a la racine. Verifie localement le 2026-07-17 (working-directory/cache/artifacts adaptes au monorepo).
- [ ] Corriger la chaine de migrations Prisma pour une base vide.
- [x] Mettre `ws` a jour au-dela de 8.21.0. `ws@8.21.1`, audit sans HIGH/CRITICAL le 2026-07-17.
- [ ] Ajouter un `.dockerignore` racine et pruner l'image API.
- [x] Revenir a un lint vert et bloquant. 0 erreur/0 warning, step CI racine bloquant le 2026-07-17.
- [ ] Bumper `dist/package.json` version a chaque `build:chains`.

### Documentation (nouveau, audit 2026-07-16)

- [ ] Archiver les 19 specs/plans termines dans `docs/superpowers/archive/`.
- [ ] Splitter `wcore-web/AGENTS.md` (979+ lignes, 60% GSheet) en guide web + archive GSheet.
- [ ] Reduire `wcore-web/ROADMAP.md` a l'etat et au futur (actuellement 2500+ lignes).
- [ ] Reduire les `AGENTS.md` aux regles critiques sans secrets ni procedures locales.

## Fiabilite GSheet

- [x] Corriger la mise en forme `Portefeuille Action` quand des lignes sont masquees par filtre: reparation explicite avec filtre suspendu puis restaure, conditional formats etendus a la plage geree. Verifie le 2026-07-13.
- [x] HTTP counter rendu atomique (read-modify-write). Verifie le 2026-07-16 (v4.16.30).
- [x] Queue et leases CEX rendus atomiques via bulk relay (1 appel au lieu de 4). Verifie le 2026-07-16 (v4.16.30).
- [x] ACTIVITY_WATCHDOG desactive (v4.16.30).
- [ ] Reparer uniquement le trigger fautif, avec backoff, au lieu de recreer tous les triggers.
- [ ] Borner les recalculs A2/J1 par feuille et par jour.
- [ ] Aligner l'expiration du cache packed avec la preservation des wallets positifs.
- [ ] Exiger une vraie majorite pour le consensus SVM.
- [ ] Corriger `batchWithConsensus`, actuellement premier-succes.
- [ ] Centraliser tous les appels HTTP sous budget, breaker et compteur.
- [ ] Splitter les 16 fichiers > 1000 lignes (plan HOTSPOT_SPLIT_PLAN.md non execute).
- [ ] Corriger `dist/package.json` version desynchronisee (4.15.50 vs runtime 4.16.30).
- [ ] Retirer ou restaurer les scripts npm references cassantes (`test:cache-keys`, `test:chain-config`).

## Fiabilite Web

- [ ] Eviter qu'un echec GM soit interprete comme contrat absent.
- [ ] Supprimer les fan-outs GM frontend et normaliser les `chainKey`.
- [ ] Ne plus poller `/api/circuit` admin-only depuis l'UI publique.
- [ ] Finir la centralisation des variables d'environnement.
- [ ] Ajouter un test schema sur les 183 configurations.
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

- [ ] Concevoir un moteur de comparaison de quotes distinct du portfolio: LI.FI, Relay, Socket/Bungee, Rango, 0x/1inch et Jupiter sont des candidats, actives progressivement apres verification de leurs contrats, quotas et couvertures.
- [ ] Normaliser chaque route par montant net recu, gas, frais, slippage, duree, nombre d'etapes et risque du bridge; dedupliquer les routes qui utilisent le meme chemin sous-jacent.
- [ ] Livrer d'abord un comparateur read-only de transactions non signees. Toute execution exige une specification separee, une validation explicite dans le wallet et un audit securite; WCORE ne detient jamais les fonds et ne signe jamais automatiquement.
- [ ] Definir `toutes chaines` comme toutes les chaines dynamiquement couvertes par au moins un routeur, sans promettre que les 183 configurations WCORE disposent toutes d'une route.
- [ ] Garder budgets, caches, secrets, breakers et telemetrie du routage entierement separes de ceux du scan portfolio.

## Chain Lifecycle

Deadlines passees, revalidees le 2026-07-17:

- Swellchain: vivante (blocs frais), conservee; 3 RPCs morts retires (v4.16.31).
- Corn: morte (RPC unique en 401), `DISABLE_CHAIN` pose (v4.16.31); retrait complet du code (Web, GM, wagmi, docs, tests) reste a faire.
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
- [ ] Splitter `wcore-web/AGENTS.md` (979+ lignes, 60% GSheet) en guide web + archive GSheet.
- [ ] Mettre a jour les docs CEX GSheet pour Kraken et l'architecture reelle de queue/triggers.
- [x] Marquer les plans Kraken, Robinhood, NFT/filter et CEX total comme termines.
- [ ] Archiver les 19 specs/plans termines dans `docs/superpowers/archive/`.
- [ ] Archiver `wcore-gsheet/AUDIT.md` (snapshot historique mai 2026, ne pilote plus le backlog).
- [ ] Reduire `wcore-gsheet/AGENTS.md` (891 lignes) aux contraintes critiques et gotchas.

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
