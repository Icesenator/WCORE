# WCORE â€” Wallet CORE

SystÃ¨me de suivi de portefeuilles crypto multi-chaÃ®nes sur **Google Sheets + Apps Script**.
- **182 chaÃ®nes** (EVM, SVM/Solana, Cosmos SDK, TON) â€” **120 combinaisons wallet-chaÃ®ne**
- **Stack** : Apps Script (.gs), clasp (dÃ©ploiement), Google Sheets (frontend)
- **Langue** : franÃ§ais
- **Spreadsheet ID** : `1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4`
- **GitHub** : `https://github.com/Icesenator/WCORE`
- **wcore-web** : package `@wcore/chains` consommÃ© par l'API Railway

## Commandes essentielles

```bash
npm test                    # Tous les tests (+ validate:static en premier)
npm run validate:static     # Validation statique GAS (3107+ fonctions globales)
npx @google/clasp push      # DÃ©ploiement vers Apps Script (rootDir="src" dans .clasp.json)
powershell -File safe-push.ps1  # DÃ©ploiement sÃ©curisÃ© (gÃ¨re rootDir auto)
npm run build:chains        # Extraction src/*.gs â†’ dist/chains/*.ts
npm run test:phase3-chains  # VÃ©rification ports Phase 3
npm run port:web-chains     # GÃ©nÃ©ration .gs manquants depuis configs web
```

## Structure

```
wcore-gsheet/
â”œâ”€â”€ src/               â† Fichiers .gs (source canonique, 182 chaÃ®nes)
â”œâ”€â”€ dist/              â† Package @wcore/chains (gÃ©nÃ©rÃ©)
â”œâ”€â”€ tests/             â† Tests Node.js (*.test.js)
â”œâ”€â”€ tools/             â† Scripts de build/validation
â”‚   â”œâ”€â”€ validate-static.js            â† Validation statique GAS
â”‚   â”œâ”€â”€ extract-chains.mjs            â† Extraction src/*.gs â†’ dist/
â”‚   â”œâ”€â”€ test-phase3-chain-port.cjs    â† VÃ©rification ports
â”‚   â””â”€â”€ port-web-chains-to-gsheet.cjs â† Webâ†’Gsheet
â”œâ”€â”€ scripts/           â† Chrome CDP, login Google, OAuth
â”œâ”€â”€ docs/              â† Documentation dÃ©taillÃ©e
â”œâ”€â”€ .clasp.json        â† Config clasp
â”œâ”€â”€ safe-push.ps1      â† DÃ©ploiement sÃ©curisÃ© PowerShell
â””â”€â”€ pull-all.ps1       â† RÃ©cupÃ©ration depuis Apps Script
```

## Contraintes Apps Script (CRITIQUES)

| Limite | Valeur |
|--------|--------|
| ScriptProperties | **500 KB** max (packed cache limitÃ© Ã  455 KB) |
| ExÃ©cution @customfunction | **30 sec** max |
| ExÃ©cution admin/trigger | **6 min** max |
| HTTP/jour | **20 000** (fenÃªtre glissante 24h, PAS de reset Ã  heure fixe) |
| ExÃ©cutions concurrentes | **30** max |

## Architecture

### 3 couches de cache

```
L1 â€” CacheService (volatile, 2h TTL, skipL1 sur forceFull)
L2 â€” GlobalPriceCache (ScriptProperties, 6h staleness, prix EUR partagÃ©s)
L3 â€” WalletCache (ScriptProperties packed, 10j TTL, 455KB max, format compact v5)
```

**forceFull (C1=TRUE)** : clear WalletCache + bypass L1 + bypass cache vote consensus. Ne clear PAS GlobalPriceCache.

### Cascade pricing

```
1. STABLECOINS â†’ Fast-path (FX rate / 1.0)
2. CACHE (< 6h) â†’ retour direct
3. NATIFS â†’ DefiLlama (prioritÃ©) â†’ CoinGecko fallback
4. TOKENS â†’ DexScreener bulk â†’ GeckoTerminal (batch + per-token) â†’ Jupiter (SVM) â†’ CoinGecko (dernier recours)
```

**JAMAIS deviner un CoinGecko ID.** Toujours vÃ©rifier.

### Fichiers core (ordre de chargement GAS)

| Fichier | RÃ´le |
|---------|------|
| `01_INIT.gs` | Config globale, `WCORE_VERSION`, `WCORE_HEALTH()` |
| `03E_QUOTA_CIRCUIT_BREAKER.gs` | Circuit breaker quota (HttpCounter) |
| `04A_CACHE_CORE.gs` | CacheManager, ScriptProperties |
| `04B_CACHE_WALLET.gs` | Cache wallet packed |
| `04C_CACHE_GLOBAL.gs` | GlobalPriceCache, WalletCache API, merge |
| `05_RPC.gs` | RPC multi-endpoint + consensus + Multicall3 |
| `06_TOKENS.gs` | DÃ©tection tokens, ContractListBuilder |
| `07_PRICES.gs` | Pricing multi-source + FX cascade |
| `09_SIMPLE_ROTATION.gs` | Rotation simplifiÃ©e (_scanBatch) |
| `10_OUTPUT.gs` | Formatage sortie + OutputSnapshotCache |
| `10A_BASE_ENGINE.gs` | Moteur commun (isBusy, cexBusyStatus) |
| `11_EVM_ENGINE.gs` | Moteur EVM (168 chaÃ®nes) |
| `14_SVM_ENGINE.gs` | Moteur Solana |
| `15_COSMOS_ENGINE.gs` | Moteur Cosmos |
| `16_REFRESH.gs` | Watchdog, triggers, onEdit |
| `16B_AUTO_HEAL.gs` | Auto-heal triggers + J1 staleness |
| `19_CHAIN_FACTORY.gs` | Factory createEvmChain/SvmChain/CosmosChain/TonChain |
| `27_ACTIVITY_REFRESH.gs` | Activity-based refresh, _RpcLookup |
| `33_DYNAMIC_RPC.gs` | RPC dynamiques (chainlist + Cosmos registry) |
| `41_GSHEET_WEB_SCAN.gs` | Web scan via API Railway |

Fichiers par chaÃ®ne : `src/ETHEREUM.gs`, `src/BASE.gs`, `src/SOLANA.gs`, etc. Pattern via `ChainFactory.create*Chain()`.

### Principes fondamentaux

1. **Ne JAMAIS Ã©craser du cache valide** sur erreur API
2. **Mode dÃ©gradÃ©** : retourner donnÃ©es cached avec `[DEGRADED]`
3. **Consensus RPC** : majoritÃ© stricte `votes * 2 > total` (2/4 = match nul)
4. **Cache = 1 vote** (dÃ©sactivÃ© par forceFull ou activityForced)
5. **PrÃ©server l'existant** plutÃ´t qu'Ã©craser avec des zÃ©ros

## RÃ¨gles de contribution

**DO** : Code `.gs` complet prÃªt Ã  dÃ©ployer, versionnÃ© (`// v4.x.y`), incrÃ©mental (1 fix = 1 problÃ¨me), noms/clÃ©s cache exacts, utiliser `CK_get()` pour toute nouvelle clÃ© cache, universel (pas de hack chain-specific).

**DON'T** : Renommage arbitraire, refactor global non demandÃ©, pseudo-code, augmentation empreinte mÃ©moire, supposer un CoinGecko ID, logique spÃ©cifique Ã  une chaÃ®ne dans les engines.

## Gotchas rÃ©cents (v4.15+)

### 1. Triggers "prÃ©sents mais mal autorisÃ©s" (v4.15.61, 2026-06-01)
AprÃ¨s plusieurs `clasp push` rapprochÃ©s, les triggers tournent sous autorisation OAuth pÃ©rimÃ©e â†’ `SpreadsheetApp.openById()` Ã©choue â†’ B1/I1/J1 gelÃ©s. SymptÃ´me : tous les affichages figÃ©s Ã  une date passÃ©e, mais page ExÃ©cutions GAS montre triggers "TerminÃ©e" 0% erreur. **Fix** : `WCORE_AUTO_HEAL_FORCE()` depuis l'Ã©diteur Apps Script (rÃ©autorise les triggers). Diagnostiquer via `=WCORE_WD_LAST_DIAG_READ()`.

### 2. Emergency purge supprime GLOBAL_WALLET_CACHE_V1 (v4.15.56)
`CacheManager._emergencyPurge_` matchait `GLOBAL_WALLET_CACHE_V1` via le pattern `WALLET_` â†’ tout le cache wallet supprimÃ© â†’ vague de `NO_CACHE_WAITING_REFRESH`. **Fix** : `isProtectedKey_()` exclut explicitement la clÃ© globale. Ne jamais ajouter de purge qui matche `GLOBAL_WALLET_CACHE_V1`.

### 3. Web scan preservation + DISABLE_NATIVE_BALANCE (v4.16.29, 2026-07-14)
`_webScanShouldPreserveExistingCache_` traitait `native_balance=0` comme corruption. Sur chaÃ®nes `DISABLE_NATIVE_BALANCE=true` (Tempo), native toujours 0 â†’ boucle de prÃ©servation â†’ `NO_CACHE_WAITING_REFRESH` perpÃ©tuel. **Fix** : skip le check quand `DISABLE_NATIVE_BALANCE` activÃ©.

## DÃ©ploiement

```powershell
# rootDir .clasp.json doit Ãªtre "src" pour push, "." aprÃ¨s
powershell -File safe-push.ps1      # GÃ¨re rootDir automatiquement
# OU manuel :
# 1. Modifier .clasp.json: rootDir "." â†’ "src"
# 2. npx @google/clasp push
# 3. Modifier .clasp.json: rootDir "src" â†’ "."
```

AprÃ¨s dÃ©ploiement : `WCORE_AUTO_HEAL_FORCE()` depuis l'Ã©diteur Apps Script pour rÃ©autoriser les triggers.

## Diagnostics rapides

| Fonction GAS | RÃ´le |
|-------------|------|
| `WCORE_HEALTH()` | Dashboard systÃ¨me (version, cache, modules, quota) |
| `GET_QUOTA_BREAKER_STATUS()` | Ã‰tat circuit breaker |
| `GET_HTTP_COUNT_LAST_24H()` | Appels HTTP fenÃªtre glissante 24h |
| `GET_STORAGE_STATS()` | Usage ScriptProperties (500KB) |
| `DIAG_CACHE_INTEGRITY()` | IntÃ©gritÃ© cache wallet |
| `WCORE_AUTO_HEAL_STATUS()` | Ã‰tat des triggers |

## RÃ©fÃ©rences

- **AGENTS-ARCHIVE.md** â€” Historique complet (gotchas historiques, procÃ©dures dÃ©taillÃ©es, configs CEX, MCP wrappers)
- **ROADMAP.md** â€” Ã‰tat courant, invariants, backlog
- **CHANGELOG.md** â€” Historique des versions
- **docs/** â€” Documentation dÃ©taillÃ©e (CEX sync, RPC batch limits, pricing, FX cascade)
- **AUDIT.md** â€” Snapshot d'audit historique

## Déblocage clasp run (2026-07-22)

`clasp run` nécessitait une ré-autorisation OAuth avec les scopes projet (`script.scriptapp`, `spreadsheets`, `script.storage`). Le client OAuth officiel de clasp (`1072944905499...`) était bloqué par Google ("Cette application est bloquée").

**Solution** : Utiliser le client OAuth du projet GCP `wcore-mcp` (projet n° 652188583224) :
- Client ID : `652188583224-i1qqdjip5f598p7ft67rvib751en3d9l.apps.googleusercontent.com`
- Redirect URI : `http://localhost:8888`
- Scopes : `script.scriptapp`, `script.external_request`, `script.storage`, `spreadsheets`, `userinfo.email`

L'app OAuth "Invest 2.0" étant en Production, l'autorisation passe sans blocage. Les scripts existants dans `scripts/oauth-get-run-token.cjs` et `scripts/oauth-run-token.cjs` utilisent ce client avec Playwright. La méthode sans navigateur : serveur HTTP local sur :8888 qui capture le redirect OAuth.

`clasp run VERSION` ne fonctionne pas (VERSION est une variable, pas une fonction). Utiliser `clasp run WCORE_HEALTH` ou `clasp run WCORE_AUTO_HEAL_FORCE` à la place.

`clasp run --nondev` échoue encore ("Script function not found") — problème de résolution de déploiement versionné par clasp, non bloquant.

## Cross-project rules

See ProjetIA/AGENTS.md:
1. **Data property** — collect proprietary data first, store locally
2. **Terminal + Obsidian** — CLI scripts connected to Obsidian MCPs
3. **Wiki & Raw (Karpathy)** — write Raw first, distill to Wiki after
4. **Monthly audit** — 1st of every month, full system audit
5. **No learning loops** — every output verifiable against ground truth
6. **Principle** — never build SEO projects with LLMs without rules 1-5
