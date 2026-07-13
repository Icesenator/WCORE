# WCORE — Audit Technique Complet

> **Historical snapshot.** This audit documents the Apps Script runtime as of 2026-05-04 (`v4.15.41` audited, `v4.15.42` corrected). It is preserved for traceability only. Do not execute its old quota-reset or recovery procedures. Current status lives in `ROADMAP.md`; current cross-runtime findings live in `../docs/AUDIT.md`.

**Date** : 2026-05-04
**Version auditée** : v4.15.41 (code source + triggers)
**Version corrigée** : v4.15.42
**Auteur** : Audit automatique via exploration du codebase
**Scope** : Architecture, cache, RPC, pricing, triggers, quota, diagnostics

---

## Table des matières

1. [Resume executif](#1-resume-executif)
2. [Metriques du projet](#2-metriques-du-projet)
3. [Architecture globale](#3-architecture-globale)
4. [Moteurs et chaines](#4-moteurs-et-chaines)
5. [Systeme de cache (3 couches)](#5-systeme-de-cache-3-couches)
6. [Systeme RPC et consensus](#6-systeme-rpc-et-consensus)
7. [Systeme de pricing](#7-systeme-de-pricing)
8. [Orchestration triggers et watchdog](#8-orchestration-triggers-et-watchdog)
9. [Protection quota et garde-fous](#9-protection-quota-et-garde-fous)
10. [Diagnostics et observabilite](#10-diagnostics-et-observabilite)
11. [Risques identifies](#11-risques-identifies)
12. [Recommandations](#12-recommandations)
13. [Annexes](#13-annexes)

---

## 1. Resume executif

WCORE est un systeme de suivi de portefeuilles crypto multi-chaines fonctionnant entierement dans **Google Apps Script (GAS)** + **Google Sheets**. Il supporte **117 blockchains** (111 EVM, 2 SVM, 4 Cosmos SDK) pour **120+ combinaisons wallet-chaine**, avec un pricing multi-source (8 sources), un cache en 3 couches, un consensus RPC redondant, et une orchestration automatique par triggers.

**Points forts majeurs :**
- Architecture modulaire avec Factory Pattern et Base Engine unifie
- Cache virtuel hash-based contournant la limite 500KB de ScriptProperties
- Consensus RPC strict avec vote majoritaire (votes * 2 > total)
- Cascade pricing sophistiquee avec 8 sources et fallbacks automatiques
- Circuit breaker quota avec auto-recuperation
- Observabilite extremement poussee (1600+ fonctions de diagnostic)

**Points de vigilance majeurs (AVANT corrections v4.15.42) :**
- Mismatch version WCORE_VERSION (v4.15.31) vs modules recents (v4.15.33)  -> CORRIGE v4.15.42
- Cap J1 sync non effectif (SYNC_J1_MAX_SYNCS_PER_RUN = 20 decoratif)  -> NON PROBLEME (confirme par l'utilisateur)
- SVM sans consensus RPC natif (risque d'ecrasement balance=0)  -> CORRIGE v4.15.42
- Packed cache proche de la saturation (495KB / 500KB)  -> CORRIGE v4.15.42
- BUILD_RPC_LOOKUP() requiert une execution manuelle post-deploiement  -> CORRIGE v4.15.42

---

## 2. Metriques du projet

| Metrique | Valeur |
|----------|--------|
| Fichiers .gs total | **169** |
| Lignes de code total | **~49 182** |
| Fichiers core (numerotes 00_ -> 33_) | **46** |
| Fichiers chaines individuelles | **117** |
| Chaines EVM supportees | **111** |
| Chaines SVM supportees | **2** (Solana, Fogo) |
| Chaines Cosmos supportees | **4** (Terra, Osmosis, Injective, Cosmos Hub) |
| Fonctions @customfunction exposees | **115** |
| Fonctions de diagnostic DIAG_* | **~1 602** |
| Sources de prix | **8** |
| Triggers permanents | **7** (5 time-based + 2 event-based) |
| Version declaree | **v4.15.31** (dans 01_INIT.gs) |
| Version reelle max | **v4.15.41** (auto-heal + triggers) |

### Top 10 fichiers par taille

| Rang | Fichier | Lignes | Role |
|------|---------|--------|------|
| 1 | 27_ACTIVITY_REFRESH.gs | 2 759 | Activity-Based Refresh |
| 2 | 07_PRICES.gs | 2 583 | Pricing multi-source |
| 3 | 13_DIAGNOSTIC.gs | 2 175 | Diagnostic principal |
| 4 | 11_EVM_ENGINE.gs | 1 979 | Moteur EVM |
| 5 | 13A_DIAG_CACHE.gs | 1 876 | Diagnostic cache |
| 6 | 10A_BASE_ENGINE.gs | 1 656 | Moteur commun |
| 7 | 28_PRICING_WORKER.gs | 1 309 | Worker pricing background |
| 8 | 03E_QUOTA_CIRCUIT_BREAKER.gs | 1 265 | Circuit breaker quota |
| 9 | 04C_CACHE_GLOBAL.gs | 1 242 | Cache global (prix, FX, meta) |
| 10 | 16_REFRESH.gs | 1 214 | Watchdog & triggers |

---

## 3. Architecture globale

### 3.1 Ordre de chargement GAS

Les fichiers sont charges par ordre alphabetique. La numerotation (00_, 01_, ...) garantit l'ordre d'execution :

- 00_VERSION_REGISTRY.gs      -> Registre de versions
- 00B_VERSION_SCANNER.gs      -> Scanner de versions (defere a 32_)
- 01_INIT.gs                  -> Config globale, WCORE_VERSION
- 02_UTILS.gs                 -> Utilitaires (Num, Addr, Format, Timer)
- 03_HTTP.gs                  -> HTTP de base + deadline
- 03B_HTTP_GUARD.gs           -> Protection cache contre ecrasement
- 03E_QUOTA_CIRCUIT_BREAKER.gs -> Circuit breaker + HttpCounter
- 04A_CACHE_CORE.gs           -> Cache de base (L1, safeGet/safeSet)
- 04B_CACHE_WALLET.gs         -> Packed Wallet Cache (virtualisation)
- 04C_CACHE_GLOBAL.gs         -> GlobalPriceCache, FX, MetaCache
- 04D_CACHE_SHEET.gs          -> SheetCache (L2 alternatif)
- 05_RPC.gs                   -> RPC multi-endpoint + health
- 06_TOKENS.gs                -> Detection tokens
- 07_PRICES.gs                -> Pricing cascade
- 08_ASSETS.gs                -> Gestion assets
- 09_BUDGET.gs                -> Budget dynamique quota-aware
- 09_SIMPLE_ROTATION.gs       -> Rotation EVM + consensus batch
- 10_OUTPUT.gs                -> Formatage sortie standardise
- 10A_BASE_ENGINE.gs          -> Moteur commun (cache, quota, FX, stats)
- 10B_STATS_BUILDER.gs        -> Construction statistiques
- 11_EVM_ENGINE.gs            -> Moteur EVM (110 chaines)
- 12_WALLET_NAMES.gs          -> Noms de wallets
- 13_DIAGNOSTIC.gs            -> Diagnostic principal
- 13A_DIAG_CACHE.gs           -> Diagnostic cache
- 13B_DIAG_RPC.gs             -> Diagnostic RPC
- 13C_DIAG_TOKEN.gs           -> Diagnostic tokens
- 14_SVM_ENGINE.gs            -> Moteur Solana
- 15_COSMOS_ENGINE.gs         -> Moteur Cosmos
- 16_REFRESH.gs               -> Watchdog + triggers
- 16B_AUTO_HEAL.gs            -> Auto-heal centralise
- 17_LISTING.gs               -> Listing onglets + Recap Chain
- 18_CLEANUP.gs               -> Nettoyage cache
- 19_CHAIN_FACTORY.gs         -> Factory Pattern
- 20_RPC_BENCHMARK.gs         -> Benchmark RPC
- 21_DASHBOARD.gs             -> Dashboard portfolio
- 23_CACHE_OPTIMIZER.gs       -> Optimiseur cache
- 24_DEGRADED_MODE.gs         -> Mode degrade
- 25_RPC_HEALTH_REPORT.gs     -> Rapport sante RPC
- 26_OPTIMIZATIONS.gs         -> Optimisations diverses
- 26B_HTTP_SAVINGS.gs         -> Economies HTTP + budget guard
- 27_ACTIVITY_REFRESH.gs      -> Activity-Based Refresh
- 28_PRICING_WORKER.gs        -> Worker pricing background
- 32_MODULE_AUTOREGISTER.gs   -> Auto-enregistrement modules
- 33_DYNAMIC_RPC.gs           -> RPC dynamique (chainlist + Cosmos)

### 3.2 Flux de donnees principal

Utilisateur (sheet Ledger)
    |
    v
A1 = CACHED_WALLET_ASSETS_*(addr; J1)   <- cache-only @customfunction
    |
    v
B1 = timestamp (pulse watchdog ou manuel)
    |
    v
I1 = CHAINNAME_REFRESH_STATUS(addr; ""; I2:I; C1; B1)  <- live scan
    |
    |-> Engine.scan()
    |       |-> RPC consensus (EVM) / fetchAll (SVM) / REST (Cosmos)
    |       |-> Pricing cascade (DexScreener -> GT -> Llama -> CG -> On-Chain V3)
    |       |-> WalletCache.save()
    |               |-> L1 CacheService
    |               |-> Packed Cache (ScriptProperties, 495KB max)
    |
    v
J1 = timestamp I1 valide (ecrit par SYNC_J1_ALL_SHEETS)
    |
    v
A1 se recalcule -> lecture cache frais

---

## 4. Moteurs et chaines

### 4.1 Architecture moteur

| Composant | Fichier | Role |
|-----------|---------|------|
| Base Engine | 10A_BASE_ENGINE.gs | Logique commune : cache, budget, quotas, pricing, stats, preservation |
| EVM Engine | 11_EVM_ENGINE.gs | 110 chaines, consensus RPC, rotation simplifiee |
| SVM Engine | 14_SVM_ENGINE.gs | Solana + Fogo, fetchAll parallele, single-call token scan |
| Cosmos Engine | 15_COSMOS_ENGINE.gs | 4 chaines, REST LCD unique, denoms natifs |
| Chain Factory | 19_CHAIN_FACTORY.gs | Cree config + API uniforme par chaine |

### 4.2 Pattern fichier chain

Chaque fichier chain suit un template strict (ex: ETHEREUM.gs, BASE.gs, SOLANA.gs).
Exemple EVM:

    var _CHAINNAME = ChainFactory.createEvmChain("CHAINNAME", {
      CACHE_VERSION: N,
      TIMEOUTS: { HTTP_MS, FAST_FAIL_MS, SAFE_MARGIN_MS, HARD_GUARD_MS },
      RPC: { ENDPOINTS: [...], CONSENSUS_MIN_RPCS: 2 },
      CHAIN: { NAME, CHAIN_ID, NATIVE_SYMBOL, NATIVE_NAME, NATIVE_DECIMALS,
               NATIVE_LLAMA_ID, NATIVE_GECKO_ID, DEX_SLUG, GT_NETWORK }
    });
    function GET_WALLET_ASSETS_CHAINNAME(a,r,t,f,g){ return _CHAINNAME.getWalletAssets(a,r,t,f,g); }
    function CACHED_WALLET_ASSETS_CHAINNAME(a){ return _CHAINNAME.getCachedWalletAssets(a); }
    function CHAINNAME_REFRESH_STATUS(a,r,t,f,g){ return _CHAINNAME.getRefreshStatus(a,r,t,f,g); }
    function CHAINNAME_STATS(a,t){ return _CHAINNAME.getStats(a,t); }

### 4.3 Differences EVM vs SVM vs Cosmos

| Critere | EVM | SVM | Cosmos |
|---------|-----|-----|--------|
| VM | Ethereum Virtual Machine | Solana Virtual Machine | Cosmos SDK |
| Protocole | JSON-RPC 2.0 batch | JSON-RPC 2.0 Solana | REST LCD |
| Consensus RPC | Oui - vote majoritaire strict | Non - fetchAll parallele | Non - fallback sequentiel |
| Rotation token | Oui (batch par batch) | Non (single call tous tokens) | Non (single call tous denoms) |
| Token ID | 0x... contract | Base58 mint address | String denom (uluna, ibc/...) |
| Native balance | eth_getBalance | getBalance (lamports) | /bank/balances natif |
| Chaines | 110 | 2 | 4 |
| Diagnostics | Complet natif | Stubs + specifiques | Stubs centralises |

### 4.4 Versions cache par VM

| VM | CACHE_VERSION | Fichier source |
|----|---------------|----------------|
| EVM | 63 / 64 | 01_INIT.gs WCORE_VM_CACHE_VERSIONS |
| SVM | 64 / 65 | 01_INIT.gs |
| Cosmos | 67 / 68 | 01_INIT.gs |

Bump d'une version = invalidation universelle du cache pour cette famille VM.

---

## 5. Systeme de cache (3 couches)

### 5.1 Architecture

Couche 1 - L1 CacheService (volatile, ~100KB/cle)
  TTL: 3h min, FX: 4h
  Cles: DEX:*, GT:*, LLAMA:*, FX:USD_EUR, INDEX
  Backend: CacheService.getScriptCache()

Couche 2 - ScriptProperties (persistant, HARD LIMIT 500KB)
  Cles non-virtualisees: GLOBAL_PRICE_CACHE_V2, GLOBAL_FX_CACHE_V1, GLOBAL_TOKEN_META_V1
  Cles virtualisees: WALLET_* -> Packed Cache

Couche 3 - Packed Wallet Cache (hash-based, 495KB max)
  Conteneur: GLOBAL_WALLET_CACHE_V1
  Format: {v:2, m:{hash36 -> entree(s)}}
  Hash: FNV-1a 32-bit -> base36
  TTL: 14 jours
  Lock: LockService.tryLock(5000ms)

### 5.2 Packed Wallet Cache (04B_CACHE_WALLET.gs)

Virtualisation : Toute cle correspondant a /_CACHE_WALLET_/i, /WALLET_CACHE_/i, ou /^GLOBAL_WALLET_CACHE_/i est redirigee vers le Packed Cache.

Format entree:
  { k: "WALLET_0x...", ts: epochSec, j: 1, v: { deflated } }

Deflation v5 : [contractShort, balance, symbol, name, decimals?] (decimales omises si = 18)

Protection 3-tier:
1. Tier 1 : entries avec balance > 0 -> JAMAIS evincees
2. Tier 2 : entries < 1h -> protegees
3. Tier 3 : reste -> evince par age (oldest first)

Merge packed : _mergePackedWalletCache_() merge le contenu actuel avec l'incoming avant sauvegarde. Collision-safe (tableau si meme hash, cle differente).

### 5.3 Global Price Cache (04C_CACHE_GLOBAL.gs)

| Attribut | Valeur |
|----------|--------|
| Cle | GLOBAL_PRICE_CACHE_V2 |
| Format | {v:3, entries:{"chainId:contract":{price,ts,src}}, priceMap, priceTsMap} |
| TTL stale | 5.4h (PRICE_STALE_MS = 5400000) |
| Max entries | 5000 (prune par anciennete) |
| Merge-on-save | Oui - re-read ScriptProperties avant merge |

### 5.4 Merge et preservation

Garde-fou global (_shouldPreserveWalletCacheWrite):
- Budget HTTP epuise -> preserve
- Nouveau cache vide (non confirme zero) -> preserve
- Moins d'assets qu'avant + scan incomplet -> preserve
- Erreurs HTTP + moins d'assets -> preserve

Merge token-level (_mergeAssetsPreservingCached, v4.15.33):
- Toujours execute, meme en forceFull
- Token absent du scan + balance>0 dans cache -> preserve avec _stale=true
- Token present dans balanceTsMap[contract]=0 -> ne pas ressusciter
- Token present dans newSet -> respecter la nouvelle valeur

### 5.5 Risques cache

| Risque | Severite | Statut |
|--------|----------|--------|
| Race condition packed cache (20 workers concurrents) | HAUTE | Mitige par LockService |
| L1 stale sur packed blob | MOYENNE | Fallback ScriptProperties |
| Last-writer-wins GPC (non atomique) | MOYENNE | Accepte (limitation GAS) |
| Saturation packed cache (495KB / 500KB) | HAUTE | Surveillance necessaire |
| JSON parse silencieux (corruption masquee) | MOYENNE | Limitation intrinseque |

---

## 6. Systeme RPC et consensus

### 6.1 Endpoints par famille VM

| Famille | Hardcodes | Dynamiques | Methode selection |
|---------|-----------|------------|-------------------|
| EVM | 2-4 / chaine | Chainlist (max 6) | pickBest() + pickForConsensus() |
| SVM | 2-3 / chaine | Aucun | fetchAll parallele, premier succes |
| Cosmos | 1 REST / chaine | Cosmos Registry | Fallback sequentiel |

### 6.2 Consensus EVM strict (v4.15.1)

Regle de majorite : bestCount * 2 > values.length
- 2/4 = match nul, PAS un consensus
- 3/4 ou 2/2 = consensus accepte

Consensus token-par-token (_scanBatch):
- Cache compte comme 1 vote si hasRecentActivity=false
- Early exit des que tous les tokens ont 2 votes concordants
- Fallbacks si consensus impossible :
  - 1 RPC seul -> accepte
  - 2 RPCs desaccord + cache -> prefere cache (conservateur)
  - RPC retourne 0 + cache positif -> fait confiance au RPC zero (v4.13.7)

### 6.3 Health tracking RPC

RpcHealth = { failures, lastFailure, blocked, staleHits, freshHits }
Score = max(0, 100 - failures * 20 - (blocked ? 50 : 0))

Blocage escalade:
- 2 echecs -> 30 min
- 4 echecs -> 2h
- 6+ echecs -> 6h
- Compteur persiste entre executions

Stale hits (v4.15.40) : 2 staleHits -> RPC marque stale, depriorise.

### 6.4 _RpcLookup et BUILD_RPC_LOOKUP()

- _RpcLookup stocke RPCs/REST/VM par chaine dans ScriptProperties
- BUILD_RPC_LOOKUP() utilise eval("_" + name) -> ne fonctionne PAS en contexte trigger
- Doit etre execute manuellement apres chaque deploiement
- Si vide -> Activity Watchdog echoue avec "Run BUILD_RPC_LOOKUP() manually"

### 6.5 Fiabilite globale RPC

| Famille | Fiabilite | Observation |
|---------|-----------|-------------|
| EVM | Tres bonne | Consensus + health tracking + fallback dynamique |
| SVM | Moyenne | Pas de consensus natif, risque balance=0 si RPC echoue |
| Cosmos | Moyenne | Mono-endpoint REST, pas de vote multi-RPC |

---

## 7. Systeme de pricing

### 7.1 Cascade de pricing (ordre d'appel)

1. STABLECOINS -> Fast-path (FX rate / 1.0) - 0 appel HTTP
2. L1 CacheService (< 2h) -> retour direct
3. NATIFS -> DefiLlama (prioritaire) -> CoinGecko fallback
4. TOKENS -> DexScreener (bulk, 30/token) -> LlamaCoins batch (80/token)
         -> GeckoTerminal batch (/token_price/, 30/token)
         -> GT per-token Try 2 (/tokens/{addr}) + Try 3 (/pools?page=1)
         -> Jupiter V2 (SVM uniquement)
         -> CoinGecko (dernier recours, IDs verifies)
         -> On-Chain V3 (EVM uniquement, Base/Eth/Arb/Opt/Polygon/BSC/Avalanche)
         -> CMC DEX (microcaps, worker-only)

### 7.2 Sources de prix et fiabilite

| Source | Fiabilite | Cout HTTP | Couverture |
|--------|-----------|-----------|------------|
| Stablecoin fast-path | EXCELLENTE | 0 | Tous stables |
| DefiLlama Coins | Tres bonne | 1/50 tokens | Natifs + bien connus |
| DexScreener bulk | Bonne | 1/30 tokens | Tokens avec liquidite DEX |
| LlamaCoins batch | Bonne | 1/80 tokens | Chain:contract mapping |
| On-Chain V3 | Tres bonne | ~10-15 RPC | EVM V3 pools |
| Jupiter V2 | Bonne | 1/N mints | Solana uniquement |
| GeckoTerminal | Moyenne | 1-3/token | Toutes chaines, 429 frequents |
| CoinGecko | Faible | 1/token | IDs verifies, 429 agressif |
| CMC DEX | Moyenne/Faible | 2/token | Microcaps DEX |

### 7.3 Mecanismes de resilience pricing

- Skip L1 on forceFull : bypass CacheService pour prix frais (v4.13.9)
- GT path hints : GTPATH:chain:contract = "TRY3" evite Try 1/2 inutiles
- NEED_DEEP priority : tokens GT-only traites en premier pour eviter starvation
- On-Chain V3 L1 cache : ONCHAINV3:contract stocke le prix calcule (6h TTL)
- No-market sentinel purge : src="no-market" avec price=0 purge de GPC
- Pricing Worker unresolved cooldown : PW_UNRESOLVED:chain:contract (6h) evite retries inutiles

### 7.4 Gotchas pricing critiques

1. GT path : /token_price/ vit sous /api/v2/simple/networks/, PAS /api/v2/networks/
2. GT slugs : underscores obligatoires (polygon_pos, arbitrum_nova)
3. Skip L1 sur forceFull indispensable pour paires non-USD (ex: TOKEN/CREATE)
4. GlobalPriceCache merge : v4.14.0+ fait un merge au lieu d'ecraser
5. Timer starvation NEED_DEEP : corrige en v4.14.5 (seuil 800ms + priorite NEED_DEEP)

---

## 8. Orchestration triggers et watchdog

### 8.1 Triggers installes

| Handler | Type | Frequence | Role |
|---------|------|-----------|------|
| ACTIVITY_WATCHDOG | Time-based | 10 min | Detection activite multi-VM + auto-discovery + sync J1 |
| WATCHDOG_FROM_RECAP | Time-based | 5 min | Watchdog principal : probe round-robin, pulse B1, sync J1 |
| QUOTA_RECOVERY_SWEEP | Time-based | 30 min | Recuperation quota : probe HTTP, pulse B1 batch blocked sheets |
| SYNC_J1_ALL_SHEETS | Time-based | 5 min | Sync I1->J1 sur toutes les Ledger sheets |
| _runPricingWorker | Time-based | 5 min | Worker pricing background (Phase C) |
| LEDGER_ON_CHANGE | Spreadsheet onChange | Ajout/suppression feuille | Refresh cache Ledger + Recap Chain |
| MASTER_ON_EDIT | Spreadsheet onEdit | Edition cellule | A1=TRUE -> pulse B1 + reset A1=FALSE |

### 8.2 Chaine de rafraichissement

B1 timestamp change
    |
    v
I1 = CHAINNAME_REFRESH_STATUS(...)  [@customfunction live scan]
    |
    |-> Engine.scan() -> WalletCache.save()
    |
    v
J1 = timestamp I1 valide (ecrit par SYNC_J1_ALL_SHEETS ou watchdog)
    |
    v
A1 = CACHED_WALLET_ASSETS_*(addr; J1)  [@customfunction cache-only]

### 8.3 WATCHDOG_FROM_RECAP

- Source de verite : Recap Chain (pas Ledger sheets individuelles)
- Probe round-robin : 5-20 sheets par run, curseur WD_CURSOR, cycle complet ~25-30 min
- Actions : pulse B1 si stale (>5h), empty, error, [NO_CACHE], [BLOCKED:*]
- Partial cycles : lit colonne Rotation.cycle, pulse si partial (cooldown 15 min)
- Securite : verifie WCORE_IS_SAFE("recovery") avant action

### 8.4 ACTIVITY_WATCHDOG (Phase C)

- Batch : 20 wallets les plus anciens (lastCheck asc)
- Multi-VM :
  - EVM : eth_getTransactionCount (nonce entier)
  - SVM : getSignaturesForAddress(limit:1) (signature string)
  - Cosmos : /cosmos/auth/v1beta1/accounts/ (sequence entier)
- Si changement detecte :
  - ActivityTracker.updateSignals(...) persiste le marqueur
  - ForceRefreshManager.set(chain, wallet, "TX detected") pose un flag
  - _activity_pulseB1ForChain_(chain) pulse B1 sur toutes les sheets de cette chaine
- Auto-discovery : toutes les 24h, scan Recap Chain pour enregistrer wallets manquants
- Error retry : scanne #ERROR! en A2/J2, incremente J1 de +1s pour forcer recalc

### 8.5 MASTER_ON_EDIT (A1 checkbox -> B1 pulse)

- Installable onEdit (pas simple onEdit - seul l'installable peut ecrire)
- Detecte A1=TRUE sur feuilles Ledger (" - " dans le nom)
- Ecrit timestamp dans B1 (format @) + reset A1=FALSE
- Time-based triggers ne declenchent JAMAIS onEdit -> bypass direct B1 pour les watchdogs
- v4.15.55: trigger retire de l'installation automatique (le code `WCORE_ON_EDIT` restait present mais inactif)
- v4.15.99: trigger re-active par `16B_AUTO_HEAL.gs`; `MASTER_ON_EDIT` est a nouveau dans `required` et cree dans `_wcoreAutoHealCreateManagedTriggers_`

### 8.6 Risques d'orchestration

| Risque | Impact | Mitigation |
|--------|--------|------------|
| J1 sync non-capped (SYNC_J1_MAX_SYNCS_PER_RUN=20 decoratif) | 120 ecritures J1 = 120 recalcs | Aucune - le cap est inoperant |
| Multiplication triggers Recovery | Double pulse meme sheet | Probe-gate reduit proba |
| Ecriture B1 concurrente (ACTIVITY + WATCHDOG) | Double scan, gaspillage quota | Cooldown 10 min activity |
| Boucle retry #ERROR! permanent | Churn J1 +1s toutes les 10 min | Aucune mitigation |
| Thundering herd Recap Chain | ~9500 recalcs INDIRECT | Executer en heures creuses |

---

## 9. Protection quota et garde-fous

### 9.1 Limites systeme fondamentales

| Limite | Valeur | Fichier cle |
|--------|--------|-------------|
| HTTP/jour | 20 000 (seuil interne 99% = 17 820) | 03E_QUOTA_CIRCUIT_BREAKER.gs |
| ScriptProperties | 500 KB max | 04B_CACHE_WALLET.gs |
| Execution @customfunction | 30 secondes | 10A_BASE_ENGINE.gs |
| Execution admin/trigger | 6 minutes | 33_DYNAMIC_RPC.gs |
| Executions concurrentes | 30 max | Limite GAS native |
| Reset quota Google | ~10h00-10h30 CET | 26B_HTTP_SAVINGS.gs |

### 9.2 Circuit Breaker Quota

Detection : 3 erreurs quota dans 120s -> trip
Action : stocke tripped dans CacheService (TTL 1h), tous les appels retournent null
Auto-recuperation : test HTTP vers httpbin.org toutes les 15 min
forceFull : bypass le circuit breaker (v4.14.5)

### 9.3 Budget dynamique

quotaPct < 5%   -> HIBERNATED (cache-only, 0 token HTTP)
quotaPct < 15%  -> MINIMAL (3 tokens, 1 price lookup)
quotaPct < 40%  -> CONSERVATIVE (5 tokens, 2 price lookups)
quotaPct >= 40% -> selection basee sur temps restant

### 9.4 Budget Guard forceFull

- Si bucket HTTP > 70% -> forceFull retrograde en scan incremental
- Log : [BUDGET_GUARD] forceFull demande mais bucket HTTP >70%
- Fail-open : si HttpCallCounter indisponible, forceFull accorde

### 9.5 Mode degrade

- DegradedMode.wrap() utilise par ChainFactory pour toutes les fonctions
- Si breaker actif -> retourne cache + indicateur [DEGRADED]
- Ne JAMAIS ecraser du cache valide lors d'erreurs API

### 9.6 Garde-fous temps

| Parametre | Valeur | Role |
|-----------|--------|------|
| HTTP_MS | 1500-5000 ms | Timeout par appel HTTP |
| FAST_FAIL_MS | 2000-7000 ms | Fast-fail native balance |
| SAFE_MARGIN_MS | 750-1000 ms | Marge securite avant arret |
| HARD_GUARD_MS | 16000-25000 ms | Garde-fou dur execution |
| MAX_EXECUTION_MS | 30000 ms | Limite @customfunction |

### 9.7 Deadline enforcement

- UrlFetchApp.fetch utilise deadline (secondes), pas timeout (non-fonctionnel dans GAS)
- fetchAllSafe utilise des fetch individuels sequentiels (v4.15.4) car fetchAll ignore deadline
- Consensus RPC early-abort apres succes ou 8-12s (v4.15.4)

---

## 10. Diagnostics et observabilite

### 10.1 Fonctions de sante systeme

| Fonction | Fichier | Description |
|----------|---------|-------------|
| WCORE_HEALTH() | 01_INIT.gs | Dashboard systeme (version, cache, quota, RPC) |
| WCORE_VERSION_CHECK() | 01_INIT.gs | Verification synchronisation versions |
| WCORE_IS_SAFE(priority) | 01_INIT.gs | Systeme sur pour appels HTTP ? |
| GET_SYSTEM_HEALTH() | 13_DIAGNOSTIC.gs | Wrapper Sheets de Diagnostic.systemHealth() |
| WCORE_AUTO_HEAL_STATUS() | 16B_AUTO_HEAL.gs | Etat triggers, spec, derniere execution |

### 10.2 Diagnostics par categorie

Cache (13A_DIAG_CACHE.gs) : DIAG_CACHE_INTEGRITY(), DIAG_LIST_ALL_CACHED_WALLETS(), DIAG_BLOCKED_SAVES(), DIAG_CACHE_QUICK()
RPC (13B_DIAG_RPC.gs) : DIAG_WATCHDOG(), DIAG_CHAIN_RPC_TEST(), DIAG_ANKR_TEST(), DIAG_BLOCKSCOUT_TEST()
Tokens (13C_DIAG_TOKEN.gs) : DIAG_MISSING_METADATA(), DIAG_TOKEN_META(), DIAG_ZOMBIE_TRACE(), DIAG_VERIFY_REAL_BALANCES()
Pricing (07_PRICES.gs + 28_PRICING_WORKER.gs) : PURGE_CHAIN_PRICES(), DIAG_CMC_DEX_TOKEN_BASE(), DIAG_PRICING_WORKER_QUEUE()
Admin (33_DYNAMIC_RPC.gs) : UPDATE_DYNAMIC_RPCS(), SHOW_DYNAMIC_RPCS(), DYNAMIC_RPC_STATUS(), CLEAR_DYNAMIC_RPCS()

### 10.3 Dashboard

| Fonction | Fichier | Description |
|----------|---------|-------------|
| WCORE_DASHBOARD() | 21_DASHBOARD.gs | Portfolio + sante + alertes |
| WCORE_PORTFOLIO() | 21_DASHBOARD.gs | Resume portfolio par chaine |
| WCORE_ALERTS() | 21_DASHBOARD.gs | Alertes actives (cache, HTTP, errors) |
| WCORE_CHAIN_HEALTH() | 21_DASHBOARD.gs | Sante detaillee par chaine |

### 10.4 Diagnostics par chaine

Chaque chaine expose ~13 fonctions DIAG_{CHAIN}_* :
- DIAG_{CHAIN}_TOKEN() - test token specifique
- DIAG_{CHAIN}_COMPARE_RPCS() - comparaison latence RPC
- DIAG_{CHAIN}_RPC_HEALTH() - sante RPC
- DIAG_{CHAIN}_NATIVE_PRICE() - test pricing natif
- DIAG_{CHAIN}_CACHE() - inspection cache wallet
- DIAG_{CHAIN}_WALLET() - diagnostic complet wallet

---

## 11. Risques identifies

### 11.1 Risques CRITIQUES

| # | Risque | Fichier | Impact |
|---|--------|---------|--------|
| R1 | ~~Mismatch version : WCORE_VERSION = v4.15.31~~ **CORRIGE v4.15.42** | 01_INIT.gs | PATCH passe a 41 |
| R2 | J1 sync non-capped : SYNC_J1_MAX_SYNCS_PER_RUN=20 inoperant | 16_REFRESH.gs | **NON PROBLEME** (confirme par l'utilisateur) |
| R3 | ~~Saturation packed cache : 495KB / 500KB~~ **CORRIGE v4.15.42** | 04B_CACHE_WALLET.gs | Limite reduite a 485KB + TTL 10 jours |
| R4 | ~~BUILD_RPC_LOOKUP() manuel : eval()~~ **CORRIGE v4.15.42** | 27_ACTIVITY_REFRESH.gs | Utilise ChainFactory.getRegistry() + auto-heal |
| R5 | ~~SVM native balance sans consensus~~ **CORRIGE v4.15.42** | 14_SVM_ENGINE.gs | getBalanceWithConsensus() ajoute (vote majoritaire multi-RPC) |

### 11.2 Risques HAUTES

| # | Risque | Fichier | Impact |
|---|--------|---------|--------|
| R6 | Race condition packed cache : 20 workers concurrents, lock 5s timeout | 04B_CACHE_WALLET.gs | Lost updates, ecrasement de MAJ |
| R7 | Consensus RPC fragile : votes*2 > total strict, avec peu de RPCs | 09_SIMPLE_ROTATION.gs | Pas de consensus sur chaines a 1-2 RPCs (ex: ZERO) |
| R8 | Dynamic RPC couteux : ~250 HTTP calls par cycle | 33_DYNAMIC_RPC.gs | Epuisement quota rapide |
| ~~R9~~ | ~~Boucle retry #ERROR!~~ **CORRIGE v4.15.42** | 27_ACTIVITY_REFRESH.gs | Limite a 3 retries / 24h par sheet |
| R10 | Thundering herd Recap Chain : ~9500 recalcs INDIRECT | 17_LISTING.gs | Saturation quota si execute en heure de pointe |

### 11.3 Risques MOYENNES

| # | Risque | Fichier | Impact |
|---|--------|---------|--------|
| R11 | Last-writer-wins GPC : merge non atomique | 04C_CACHE_GLOBAL.gs | Prix d'une chaine ecrases par une autre |
| R12 | L1 stale sur packed blob : CacheService garde blob ancien | 04B_CACHE_WALLET.gs | Wallets recents absents du cache |
| R13 | JSON parse silencieux : try/catch masque corruption | Multiple | "No cache available" sans diagnostic |
| R14 | forceFull + activityForced desactivent cache vote | 10A_BASE_ENGINE.gs | Tokens disparaissent si consensus RPC fail |
| ~~R15~~ | ~~GT throttle 40/run~~ **CORRIGE v4.15.42** | 26B_HTTP_SAVINGS.gs | Throttle augmente a 80/run |
| ~~R16~~ | ~~Multiplication triggers Recovery~~ **CORRIGE v4.15.42** | 16_REFRESH.gs | LockService + flags ScriptProperties pour eviter concurrence |
| R17 | Emergency purge arbitraire : suppression par pattern | 04A_CACHE_CORE.gs | Donnees recentes mal classees supprimees |

---

## 12. Recommandations

### 12.1 Priorite IMMEDIATE (P0)

| # | Recommandation | Cible | Justification |
|---|----------------|-------|---------------|
| ~~P0-1~~ | ~~Synchroniser WCORE_VERSION~~ **FAIT v4.15.42** | 01_INIT.gs | PATCH passe a 41 |
| ~~P0-2~~ | ~~Rendre effectif le cap J1 sync~~ **NON REQUIS** | 16_REFRESH.gs | Confirme non-probleme par l'utilisateur |
| ~~P0-3~~ | ~~Monitorer CACHE_HEALTH_CHECK()~~ **FAIT v4.15.42** | 04B_CACHE_WALLET.gs | Limite reduite a 485KB + TTL 10 jours |
| ~~P0-4~~ | ~~Automatiser BUILD_RPC_LOOKUP()~~ **FAIT v4.15.42** | 27_ACTIVITY_REFRESH.gs | ChainFactory.getRegistry() + auto-heal fallback |

### 12.2 Priorite HAUTE (P1)

| # | Recommandation | Cible | Justification |
|---|----------------|-------|---------------|
| ~~P1-1~~ | ~~Ajouter consensus SVM~~ **FAIT v4.15.42** | 14_SVM_ENGINE.gs | getBalanceWithConsensus() vote majoritaire multi-RPC |
| P1-2 | Checksum integrity sur packed cache | 04B_CACHE_WALLET.gs | Detecter corruption JSON avant parse |
| P1-3 | LockService sur GPC.save() | 04C_CACHE_GLOBAL.gs | Eliminer fenetre concurrence inter-chaines |
| ~~P1-4~~ | ~~Limiter retry #ERROR!~~ **FAIT v4.15.42** | 27_ACTIVITY_REFRESH.gs | 3 retries / 24h par sheet |
| P1-5 | Split packed cache par VM (shards EVM/SVM/Cosmos) | 04B_CACHE_WALLET.gs | Repartir charge et reduire contention |

### 12.3 Priorite MOYENNE (P2)

| # | Recommandation | Cible | Justification |
|---|----------------|-------|---------------|
| P2-1 | L2 SheetCache pour wallets (decharger ScriptProperties) | 04D_CACHE_SHEET.gs | Unlimited storage vs 500KB limit |
| P2-2 | Reduire Dynamic RPC a 1/6 chaines/cycle | 33_DYNAMIC_RPC.gs | Economiser ~150 HTTP calls/jour |
| P2-3 | Documenter comportement consensus sans cache vote | 09_SIMPLE_ROTATION.gs | hasRecentActivity=true = cache ne vote pas |
| P2-4 | Pre-allocation marge packed cache | 04B_CACHE_WALLET.gs | Alerte proactive avant saturation |
| P2-5 | Monitor PACKED_LOCK_MISS dans les logs | 04B_CACHE_WALLET.gs | Mesurer frequence race conditions |

### 12.4 Priorite FAIBLE (P3)

| # | Recommandation | Cible | Justification |
|---|----------------|-------|---------------|
| ~~P3-1~~ | ~~Refactor _RpcLookup sans eval()~~ **FAIT v4.15.42** | 27_ACTIVITY_REFRESH.gs | ChainFactory.getRegistry() + fallback eval() |
| P3-2 | Uniformiser les headers de version dans tous les fichiers core | Tous | Certains headers indiquent v4.15.27, d'autres v4.15.33 |
| P3-3 | Ajouter SYNC_J1_MAX_SYNCS_PER_RUN comme parametre Sheet | 16_REFRESH.gs | Configurable sans redeploiement |
| P3-4 | Cache L1 pour _RpcLookup | 27_ACTIVITY_REFRESH.gs | Reduire lectures ScriptProperties |

---

## 12.5 Corrections appliquees v4.15.42

| # | Risque | Fichier modifie | Correction | Statut |
|---|--------|----------------|------------|--------|
| R1 | Mismatch version WCORE_VERSION | 01_INIT.gs | PATCH: 31 -> 41 | FAIT |
| R2 | J1 sync non-capped | - | Confirme non-probleme par l'utilisateur | IGNORE |
| R3 | Saturation packed cache | 04B_CACHE_WALLET.gs | _PACKED_CACHE_MAX_BYTES: 495000 -> 485000 ; _WALLET_TTL_SEC: 14j -> 10j | FAIT |
| R4 | BUILD_RPC_LOOKUP() manuel | 27_ACTIVITY_REFRESH.gs + 16B_AUTO_HEAL.gs | Utilise ChainFactory.getRegistry() au lieu de eval() ; auto-heal appelle BUILD_RPC_LOOKUP si vide | FAIT |
| R5 | SVM native balance sans consensus | 14_SVM_ENGINE.gs | Nouvelle methode getBalanceWithConsensus() : vote majoritaire multi-RPC pour le native balance SVM | FAIT |
| R9 | Boucle retry #ERROR! infini | 27_ACTIVITY_REFRESH.gs | Limite a 3 retries / 24h par sheet (compteur ScriptProperties) | FAIT |
| R15 | GT throttle 40/run bloque tokens GT-only | 26B_HTTP_SAVINGS.gs | Throttle augmente de 40 a 80 par run | FAIT |
| R16 | Triggers Recovery dupliques | 16_REFRESH.gs | LockService + flags ScriptProperties pour eviter executions concurrentes et triggers dupliques | FAIT |

---

## 13. Annexes

### 13.1 Gotchas documentes dans AGENTS.md

- gid === 0 : getSheetId() retourne 0 pour le premier onglet -> utiliser gid != null
- forceFull + quota : bypass L1 -> plus d'appels HTTP, ne pas lancer en fin de journee
- */ dans commentaires /* ... */ : ferme le bloc prematurement
- @customfunction + HYPERLINK : Google cache agressivement, utiliser RichTextValue
- getSheetByName() est case-sensitive
- ACTIVITY_WATCHDOG normalisation : "Arbitrum One" -> "ARBITRUM_ONE"
- ChainFactory config : acceder via chain.getConfig(), PAS chain._config
- UrlFetchApp deadline et timeout NON-FONCTIONNELS - contourner avec early-abort
- GAS file load order : IIFEs s'executent immediatement, variables ulterieures non definies
- return invisible dans l'editeur GAS - utiliser console.log() pour visibilite
- Quota reset CET : 10h-10h30 CET, pas minuit UTC

### 13.2 Procedures de maintenance

Apres chaque deploiement (obligatoire) :
1. ~~Executer BUILD_RPC_LOOKUP() depuis l'editeur GAS~~ **OPTIONNEL v4.15.42** — l'auto-heal le fait automatiquement
2. Executer WCORE_AUTO_HEAL("force", true) pour reinstaller les triggers et rebouter le RPC lookup
3. Verifier WCORE_AUTO_HEAL_STATUS() : tous les triggers a 1

En cas de saturation quota :
1. Attendre le reset (~10h30 CET)
2. Executer EMERGENCY_RESET_QUOTA()
3. Verifier GET_QUOTA_BREAKER_STATUS()

En cas de cache corrompu :
1. DIAG_CACHE_INTEGRITY() pour identifier
2. REPAIR_DECIMALS(wallet, config, false) pour reparer
3. PURGE_CHAIN_PRICES(contracts, chainSlug, gtNetwork) pour purger prix

Diagnostic complet :
1. WCORE_HEALTH() - sante globale
2. WCORE_VERSION_CHECK() - coherence versions
3. DIAG_WATCHDOG() - etat watchdog
4. GET_QUOTA_BREAKER_STATUS() - quota HTTP réel côté breaker
5. DYNAMIC_RPC_STATUS() - RPCs dynamiques

### 13.3 Dependances externes

APIs prix :
- DefiLlama : coins.llama.fi/prices/current/
- CoinGecko : api.coingecko.com/api/v3/simple/price
- DexScreener : api.dexscreener.com/tokens/v1/
- GeckoTerminal : api.geckoterminal.com/api/v2/
- Jupiter : api.jup.ag/price/v2
- CMC DEX : dapi.coinmarketcap.com/dex/v1/
- FX : open.er-api.com/v6/latest/USD

APIs dynamiques :
- Chainlist : chainid.network/chains.json
- Cosmos Registry : raw.githubusercontent.com/cosmos/chain-registry/

Explorers :
- Blockscout (multi-chaines)
- RaceScan, Snowtrace, BlastScan, HyperEVMScan, MegaETH Blockscout

---

*Document genere automatiquement le 2026-05-04. Version du code audite : v4.15.41. Corrections appliquees : v4.15.42.*
