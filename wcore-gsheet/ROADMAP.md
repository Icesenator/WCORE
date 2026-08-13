# WCORE GSheet - Roadmap

> Etat recroise le 2026-08-11. Cette page est la source d'etat et de backlog du runtime Apps Script. Le passe appartient a `CHANGELOG.md`; l'ancien `AUDIT.md` est un snapshot historique.

## Etat courant

- 162 configurations generees: 149 EVM, 2 SVM, 10 Cosmos, 1 TON; 150 actives et 12 desactivees.
- `src/*.gs` est la source canonique; `dist/` est genere pour `@wcore/chains`.
- Sept CEX: Binance, Bitpanda, Bitfinex, Bybit, Coinbase, OKX et Kraken.
- Portefeuille crypto canonique: `Portefeuille Crypto` + `Portefeuille Crypto Details`.
- Delegation de scan vers WCORE Web disponible, avec mode required par allowlist.
- Cache wallet packed limite a 455 000 octets, TTL nominal 10 jours.
- Validation statique: 3 107 fonctions globales au dernier audit.
- **Compteur HTTP**: `HttpCounter` (buckets glissants 24h) compte les web scans et protege ses read-modify-write par verrou (`09e3d89e`), expose via `GET_HTTP_COUNT_LAST_24H()` / `GET_HTTP_BREAKDOWN_24H()`.
- **ACTIVITY_WATCHDOG**: desactive (v4.16.30, -5760 UrlFetch/jour).
- **Refresh CEX relay**: un trigger `UPDATE_CEX_RELAY_ROTATION` toutes les 15 minutes avance Binance, Bybit, Coinbase, OKX, soit environ une fois par heure chacun; `UPDATE_CEX_RELAY_ALL()` reste manuel/fallback uniquement.

## Invariants

- Ne jamais ecraser un cache valide sur erreur RPC/API.
- Ne jamais inventer un prix, un CoinGecko ID ou un taux FX.
- Toute nouvelle cle cache passe par le registre.
- Toute transition queue/lease doit etre atomique.
- Les triggers doivent etre repares de facon ciblee avec backoff.
- Le scan Web peut etre requis pour une allowlist, mais l'affichage doit conserver le dernier etat sain en cas de panne.

## P1 - Integrite et fiabilite

- [x] Preserver le dernier total natif Cosmos sain lorsqu'une composante staking Web est incomplete; exposer `INFO_STAKING` et conserver la completude dans `scanStats` (2026-08-10).
- [x] Consommer les actifs IBC resolus et prices par le moteur Web sans modifier le contrat de delegation GSheet; smoke Cosmos Hub production valide avec NTRN, STRD et USDC (API `4009d23c`, 2026-08-11).
- [x] Eviter la casse de mise en forme `Portefeuille Action` sous filtre actif.
- [x] **Audit G2** : compteur HTTP fiable et atomique (web scans comptes, attribution par trigger, read-modify-write verrouille par `09e3d89e`).
- [x] ACTIVITY_WATCHDOG desactive — economie ~5760 UrlFetch/jour.

- [x] Corriger `ChainFactory.createCosmosChain().getRefreshStatus` pour propager les cinq arguments standards (v4.16.30).
- [x] Rendre atomiques queue, pop, retry et leases CEX; aucune mutation sans `ScriptLock`, lease avec proprietaire et comportement fail-closed, aucun job evince silencieusement en cas de capacite pleine. Tests `cex-queue-integrity.test.js` et `cex-worker-revival.test.js` passants.
- [ ] Remplacer la reinstallation globale de triggers par une reparation ciblee avec backoff.
- [ ] Aligner `_packedGet_` avec la preservation annoncee des wallets positifs.
- [ ] Borner les retries A2/J1 par feuille et par fenetre temporelle.
- [x] Imposer une vraie majorite au consensus SVM: `votes * 2 > RPC interroges`, avec regression 1 reponse / 3 refusee dans `svm-balance-consensus.test.js`.

## P2 - Coherence technique

- [ ] Corriger ou renommer `batchWithConsensus`, qui s'arrete actuellement apres le premier succes.
- [x] Supprimer le fallback FX fixe de TON et clarifier le symbole natif: aucun `1 USD = 1 EUR` implicite; echec ferme si la cascade FX est indisponible; identite native `TON` / `Toncoin`, jamais `GRAM`.
- [ ] Centraliser les chemins `UrlFetchApp` sous budget, mode et compteur communs.
- [ ] Passer les tokens relay dans un header, jamais dans l'URL.
- [ ] Restreindre `executionApi.access` avant toute reactivation de l'Execution API.
- [ ] Mettre a jour les metadonnees de `dist/package.json` et clarifier le package genere.
- [x] Retirer ou restaurer les scripts npm referencant des fichiers absents (scripts `test:cache-keys` et `test:chain-config` retires le 2026-07-16).
- [ ] Rendre les tests Phase 3 non destructifs et les inclure dans une verification explicite.

## Phase Web-Backed Cache

Statut: conception validee, implementation differee.

- Deplacer les donnees reconstructibles hors de `ScriptProperties`: prix/FX, compteurs, cooldowns, snapshots, resultats scan et bookkeeping.
- Garder localement secrets, kill-switches, flags UI/triggers et dernier affichage sain.
- Ne pas rendre une panne Web capable de vider les feuilles visibles.
- Spec: `docs/superpowers/specs/2026-06-26-gsheet-web-backed-cache-design.md`.

## Chain Lifecycle

- [x] RARI Chain supprime (sunset annonce 4 juin 2026, deadline 14 juin passee, infra Caldera disparue).
- [x] Swellchain revalidee le 2026-07-17: vivante (blocs frais), conservee; RPCs morts (alt.technology, hypersync, tenderly) retires (v4.16.31).
- [x] Corn desactive (FLAGS.DISABLE_CHAIN, v4.16.31): RPC unique en 401, shutdown 2026-06-30 confirme. Retrait complet du code (Web/GM/wagmi/docs/tests) reste a faire.
- [x] Polygon zkEVM desactive (FLAGS.DISABLE_CHAIN, v4.16.31): chaine HALTED depuis le 2026-07-03 (dernier bloc 33391890), sunset sequencer confirme.
- [x] Botanix revalidee le 2026-07-17: vivante (blocs frais), conservee.
- [x] Ancient8 desactive (FLAGS.DISABLE_CHAIN) — maintenance depuis le 19/06, RPC Conduit payant, inaccessible. À reactiver si le reseau reprend un RPC public.
- [ ] Garder ZERO jusqu'au 2026-07-31, Mint withdrawal jusqu'au 2026-10-20 et Cronos zkEVM jusqu'au 2027-06-03.

Pour chaque retrait: source `.gs`, package genere, consommateurs Web/API, GM, wagmi, explorers, docs, compteurs et tests.

## Documentation

- [ ] Mettre `AGENTS.md` a jour puis le reduire aux contraintes et gotchas critiques.
- [ ] Mettre `docs/integrations/cex/cex-sync.md` a jour pour sept CEX et ajouter `docs/integrations/cex/kraken-sync.md`.
- [ ] Completer `CHANGELOG.md` pour Kraken, triggers par connecteur et `INFO_TOTAL` CEX.
- [x] Archiver les plans/specs termines (21 fichiers deplaces vers `docs/superpowers/archive/` le 2026-07-16).

## Baseline de verification

```powershell
npm test
npm run build:chains
npm run test:phase3-chains
node tests/cex-null-fetch-guard.test.js
node tests/bybit-signature.test.js
```

Attention: `test:phase3-chains` regenere actuellement des artefacts. Examiner le diff apres execution.

## References

- Audit transversal: `../docs/audits/AUDIT.md`
- Setup: `README.md`
- Regles runtime: `AGENTS.md`
- Historique: `CHANGELOG.md`
- Architecture CEX: `docs/integrations/cex/cex-sync.md`
