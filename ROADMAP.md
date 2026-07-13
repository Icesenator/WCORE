# WCORE - Roadmap

> Index cross-runtime et priorites communes. Etat verifie le 2026-07-13. Les details d'implementation et l'historique vivent dans les documents propres a chaque runtime.

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
- [ ] Corriger la propagation des arguments Cosmos GSheet.

### Securite et disponibilite

- [x] Securiser `/api/cex/prices`, consomme par Google Sheets: `x-gsheet-token` obligatoire, lots limites a 50, relais actions en batch unique et concurrence crypto bornee. Verifie le 2026-07-10 par tests auth/limite/batch.
- [ ] Fermer SSRF/DNS rebinding sur tous les fetches RPC.
- [ ] Borner et persister les jobs async Web.
- [ ] Rendre `CEX_SECRET` obligatoire et retirer les tokens relay des URLs.
- [ ] Rendre atomiques quota, queue et leases CEX GSheet.

### Livraison reproductible

- [ ] Deplacer la CI GitHub dans `.github/workflows/` a la racine.
- [ ] Corriger la chaine de migrations Prisma pour une base vide.
- [ ] Mettre `ws` a jour au-dela de 8.21.0.
- [ ] Ajouter un `.dockerignore` racine et pruner l'image API.
- [ ] Revenir a un lint vert et bloquant.

## Fiabilite GSheet

- [x] Corriger la mise en forme `Portefeuille Action` quand des lignes sont masquees par filtre: reparation explicite avec filtre suspendu puis restaure, conditional formats etendus a la plage geree. Verifie le 2026-07-13.
- [ ] Reparer uniquement le trigger fautif, avec backoff, au lieu de recreer tous les triggers.
- [ ] Borner les recalculs A2/J1 par feuille et par jour.
- [ ] Aligner l'expiration du cache packed avec la preservation des wallets positifs.
- [ ] Exiger une vraie majorite pour le consensus SVM.
- [ ] Corriger `batchWithConsensus`, actuellement premier-succes.
- [ ] Centraliser tous les appels HTTP sous budget, breaker et compteur.

## Fiabilite Web

- [ ] Eviter qu'un echec GM soit interprete comme contrat absent.
- [ ] Supprimer les fan-outs GM frontend et normaliser les `chainKey`.
- [ ] Ne plus poller `/api/circuit` admin-only depuis l'UI publique.
- [ ] Finir la centralisation des variables d'environnement.
- [ ] Ajouter un test schema sur les 183 configurations.
- [ ] Ajouter des tests comportementaux pour les hooks CEX/GM.

## Chain Lifecycle

Deadlines passees a revalider immediatement:

- Swellchain: 2026-06-23.
- Corn: 2026-06-30; ledger live deja retire, code restant a trancher.
- Polygon zkEVM: 2026-07-01.
- Botanix: 2026-07-09.

Deadlines futures:

- ZERO Network: 2026-07-31.
- Mint withdrawal gateway: 2026-10-20.
- Cronos zkEVM: 2027-06-03.

Chaque retrait doit couvrir GSheet, package genere, core Web, API, filtres scan, GM/factories, wagmi, explorers, icones, symboles, docs et tests.

## Documentation

- [ ] Corriger le mojibake de `wcore-web/ROADMAP.md`, `AGENTS.md` et `CHANGELOG.md` par conversion ciblee.
- [ ] Reduire `wcore-web/ROADMAP.md` a l'etat et au futur; deplacer le passe vers CHANGELOG/archive.
- [ ] Reduire les `AGENTS.md` aux regles critiques sans secrets ni procedures locales.
- [ ] Mettre a jour les docs CEX GSheet pour Kraken et l'architecture reelle de queue/triggers.
- [ ] Marquer les plans Kraken, Robinhood, NFT/filter et CEX total comme termines.

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
