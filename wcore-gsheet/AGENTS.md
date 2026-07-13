# WCORE — Wallet CORE

## Outils actifs (auto-activation pour Codex)

Ces outils sont configurés globalement dans `~/.codex/config.toml` + `~/.codex/AGENTS.md` et sont **auto-utilisés** dans ce projet :

| Outil | Trigger auto | Quand |
|-------|--------------|-------|
| **RTK** | Préfixer commandes shell à gros output | `rtk git status`, `rtk grep`, `rtk ls`. Compression 60-90%. |
| **Context Mode** (`mcp__context-mode__*`) | Sandbox commandes >20 lignes | `ctx_execute` / `ctx_batch_execute`. Obligatoire pour logs, API calls, test runners. |
| **Token Savior** (`mcp__token-savior__*`) | Avant tout `Read` sur code | `find_symbol`, `get_function_source`, `get_changed_symbols`. |
| **Google Sheets MCP** (`mcp__gsheets__*`) | Lecture/écriture spreadsheet WCORE | ID `1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4`. |
| **Playwright MCP** (`mcp__playwright__*`) | Debug UI Sheets, captures, inspection réseau | Browser automation (quand connecté). |
| **n8n-MCP** (`mcp__n8n-mcp__*`) | Appel service externe non-natif | 400+ intégrations (webhooks, APIs, social). |
| **Superpowers** | Réflexion structurée avant code non-trivial | Brainstorming, writing-plans, TDD, systematic-debugging, verification. Trigger auto. |

**IMPORTANT** : les MCPs peuvent ne pas être connectés selon la session Codex. Des alternatives **bash autonomes** existent (voir section "Autonomie sans MCP" ci-dessous).

**Rôle Codex** : worker agent sous orchestration OMC (voir `~/.codex/config.toml` `[agents] role=worker`). Claude Code planifie, Codex exécute, Claude Code vérifie.

## Projet

Système de suivi de portefeuilles crypto multi-chaînes sur Google Sheets + Apps Script.
- **183 configurations de chaînes** (EVM, SVM/Solana, Cosmos SDK, TON) — toutes extractibles vers `@wcore/chains`
- **120 combinaisons wallet-chaîne**
- Version actuelle : consulter `ROADMAP.md` et les registres de version du code; ne pas déduire l'état d'un ancien numéro figé dans cette documentation.
- Langue du développeur : **français** — répondre en français
- Spreadsheet ID : `1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4`
- **GitHub** : `https://github.com/Icesenator/WCORE`
- **Email projet** : `wcorexyz@gmail.com`
- **Docker Hub** : `wcorexyz`
- **Domaine** : `wcore.xyz` (Railway)
- **Railway** : projet `WCORE` (`cbb16f4a-79c1-46ef-92b2-019c9c9940d7`)

## Démarrage rapide (checklist autonomie)

Ces 4 commandes fonctionnent SANS MCP, SANS navigateur, SANS interaction utilisateur :

### 1. Lire la spreadsheet (diagnostic)
```bash
node -e "const {JWT}=require('google-auth-library');const k=require('C:/Users/strau/.config/gsheets-mcp/service-account.json');const c=new JWT({email:k.client_email,key:k.private_key,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});(async()=>{await c.authorize();const r=await c.request({url:'https://sheets.googleapis.com/v4/spreadsheets/1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4/values/'+encodeURIComponent('Ledger - ZERO Network!A1:M10')});console.log(JSON.stringify(r.data.values,null,2));})();"
```

### 2. Exécuter une fonction Apps Script (diagnostic avancé)
```bash
npx @google/clasp run DIAG_ZERO_WALLET -p '["0x..."]'
```

### 3. Déployer le code
```bash
npx @google/clasp push
```

### 4. Piloter Chrome (playwright CDP, si besoin d'interaction web)

**IMPORTANT (Google login)** : Google bloque la connexion dans les navigateurs lancés par Playwright (`chromium.launch()`), même avec `channel:"chrome"`. La méthode fiable est : **démarrer Chrome normalement** avec `--remote-debugging-port` + un **profil dédié** (`chrome-debug-profile`), puis piloter via `chromium.connectOverCDP()`.

Scripts disponibles :

| Script | Rôle |
|--------|------|
| `scripts/chrome-cdp.js` | Helper Node.js (start/connect Chrome CDP) |
| `scripts/connect-google.js` | Remplit l'email Google et avance jusqu'à la validation passkey (action utilisateur requise) |
| `scripts/clasp-login-auto.js` | OAuth clasp via serveur redirect local (action utilisateur possible) |

Infos clés :

| Paramètre | Valeur |
|-----------|--------|
| Port CDP | **9222** (manifest = 9223) |
| Profil Chrome | `$env:USERPROFILE\chrome-debug-profile` |
| Playwright | `node_modules/playwright` (installé dans le projet) |
| Compte Google | `straub.florian88.fs@gmail.com` |

```bash
# Étape 1 - Démarrer Chrome avec debug (si pas déjà lancé)
node scripts/chrome-cdp.js start http://localhost:3001

# Étape 2 - Connecter Playwright et interagir
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const p=b.contexts()[0].pages()[0];await p.goto('https://google.com');console.log(await p.title());})()"

# Login Google (si session expirée)
node scripts/connect-google.js
# Puis l'utilisateur doit valider la passkey dans Chrome
```

**Si un outil échoue** → voir section "Autonomie sans MCP" pour les procédures de réparation complètes.

## Structure du projet

```
wcore-gsheet/
├── src/               ← Fichiers .gs (source de vérité, 183 chaînes)
├── dist/              ← Package @wcore/chains (généré par extract-chains.mjs)
├── pulls/             ← Tirages depuis Apps Script (clasp pull)
├── .backups/          ← Sauvegardes automatiques
├── .clasp.json        ← Config clasp (lien projet GAS)
├── tools/
│   ├── extract-chains.mjs            ← Extraction src/*.gs → dist/chains/*.ts
│   ├── validate-static.js            ← Validation statique GAS
│   ├── port-web-chains-to-gsheet.cjs ← Générateur web→gsheet (Phase 3)
│   └── test-phase3-chain-port.cjs    ← Vérification ports Phase 3
├── scripts/
│   ├── chrome-cdp.js                 ← Helper Chrome CDP (start/connect)
│   ├── connect-google.js             ← Login Google automatique
│   ├── clasp-login-auto.js           ← OAuth clasp
│   └── fx-cascade-spec.cjs+test.cjs  ← Tests cross-runtime FX
├── safe-push.ps1      ← Script PowerShell de déploiement sécurisé
├── pull-all.ps1       ← Script PowerShell de récupération
└── AGENTS.md          ← Ce fichier
```

Les fichiers `.gs` sont dans `src/`. C'est là qu'on travaille. Les configs sont extraites vers `dist/` pour le package `@wcore/chains` consommé par `wcore-web`.

## Architecture des fichiers core (ordre de chargement)

| Fichier | Rôle |
|---------|------|
| `00_VERSION_REGISTRY.gs` | Registre de versions des modules |
| `00B_VERSION_SCANNER.gs` | Scanner de versions |
| `01_INIT.gs` | Config globale, `WCORE_VERSION`, `WCORE_HEALTH()` |
| `02_UTILS.gs` | Utilitaires de base |
| `03_HTTP.gs` | HTTP de base |
| `03B_HTTP_GUARD.gs` | Protection cache contre écrasement |
| `03E_QUOTA_CIRCUIT_BREAKER.gs` | Circuit breaker quota |
| `04A_CACHE_CORE.gs` | Cache de base (CacheManager, ScriptProperties) |
| `04B_CACHE_WALLET.gs` | Cache wallet packed (virtualisation 500KB) |
| `04C_CACHE_GLOBAL.gs` | Cache global (GlobalPriceCache, FX, Meta, WalletCache API) |
| `04D_CACHE_SHEET.gs` | Cache sheet |
| `05_RPC.gs` | Gestion RPC multi-endpoint + santé |
| `06_TOKENS.gs` | Détection et gestion tokens |
| `07_PRICES.gs` | Pricing multi-source avec fallbacks + L1 CacheService |
| `08_ASSETS.gs` | Gestion assets |
| `09_BUDGET.gs` | Budget dynamique |
| `09_SIMPLE_ROTATION.gs` | Rotation simplifiée |
| `10_OUTPUT.gs` | Formatage sortie standardisé |
| `10A_BASE_ENGINE.gs` | Moteur commun à tous les engines |
| `10B_STATS_BUILDER.gs` | Construction des statistiques |
| `11_EVM_ENGINE.gs` | Moteur EVM (105+ chaînes) |
| `12_WALLET_NAMES.gs` | Noms de wallets |
| `13_DIAGNOSTIC.gs` | Fonctions de diagnostic |
| `14_SVM_ENGINE.gs` | Moteur Solana |
| `15_COSMOS_ENGINE.gs` | Moteur Cosmos |
| `TON.gs` | Moteur TON (standalone, enregistré via `ChainFactory.createTonChain`) |
| `16_REFRESH.gs` | Watchdog de refresh + triggers |
| `17_LISTING.gs` | Listing des onglets Ledger + SHEET_LINK() |
| `18_CLEANUP.gs` | Nettoyage de cache |
| `19_CHAIN_FACTORY.gs` | Factory pattern pour créer des chaînes |
| `20_RPC_BENCHMARK.gs` | Benchmark RPC |
| `21_DASHBOARD.gs` | Dashboard Recap Chain |
| `24_DEGRADED_MODE.gs` | Circuit breaker, mode dégradé |
| `26_OPTIMIZATIONS.gs` | Optimisations diverses |
| `26B_HTTP_SAVINGS.gs` | Économies HTTP (patches runtime) |
| `27_ACTIVITY_REFRESH.gs` | Activity-Based Refresh (nonce watchdog, _RpcLookup, wallet auto-discovery) |
| `30_SCAN_PRICING.gs` | Scan pricing |
| `32_MODULE_AUTOREGISTER.gs` | Auto-enregistrement modules |
| `33_DYNAMIC_RPC.gs` | Dynamic RPC (chainlist EVM + Cosmos Chain Registry + merge store) |

## Fichiers chain

Un fichier par chaîne : `BASE.gs`, `ETHEREUM.gs`, `SOLANA.gs`, `TERRA.gs`, etc.

Pattern standard (via ChainFactory) :
```javascript
var _CHAINNAME = ChainFactory.createEvmChain("CHAINNAME", {
  CACHE_VERSION: N,
  TIMEOUTS: { ... },
  RPC: { ENDPOINTS: [...], ... },
  CHAIN: { NAME, CHAIN_ID, NATIVE_SYMBOL, NATIVE_NAME, NATIVE_DECIMALS, NATIVE_LLAMA_ID, NATIVE_GECKO_ID, DEX_SLUG, GT_NETWORK },
  LLAMA_ID_MAP: { ... }
});

function GET_WALLET_ASSETS_CHAINNAME(a,r,t,f,g){return _CHAINNAME.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CHAINNAME(a){return _CHAINNAME.getCachedWalletAssets(a);}
function CHAINNAME_REFRESH_STATUS(a,r,t,f,g){return _CHAINNAME.getRefreshStatus(a,r,t,f,g);}
function CHAINNAME_STATS(a,t){return _CHAINNAME.getStats(a,t);}
// + fonctions DIAG_CHAINNAME_*
```

## Phase 3 — Portage & extraction chaînes

Les configs de chaînes suivent un cycle unifié :

1. **Source de vérité** : `wcore-gsheet/src/*.gs` (fichiers Apps Script avec `ChainFactory.create*Chain`)
2. **Extraction** : `npm run build:chains` → `tools/extract-chains.mjs` parse les `.gs` → `dist/chains/*.ts` → package `@wcore/chains`
3. **Vérification** : `npm run test:phase3-chains` → `tools/test-phase3-chain-port.cjs` vérifie présence `.gs`, extraction, factory, équivalence
4. **Portage web→gsheet** : `npm run port:web-chains` → `tools/port-web-chains-to-gsheet.cjs` génère les `.gs` manquants depuis les configs TS web
5. **Validation statique** : `npm run validate:static` → `tools/validate-static.js` vérifie les fonctions globales

### Commandes

```bash
npm run validate:static      # Vérifie les fonctions globales GAS (2904+)
npm run build:chains         # Extrait src/*.gs → dist/chains/*.ts (183 chaînes)
npm run test:phase3-chains   # Vérifie tous les ports Phase 3
npm run port:web-chains      # Génère les .gs manquants depuis les configs web
```

### Extraction supportée

| Factory method | VM | Nombre |
|---------------|-----|--------|
| `createEvmChain` | EVM | 168 |
| `createSvmChain` | SVM | 2 |
| `createCosmosChain` | Cosmos | 11 |
| `createTonChain` | TON | 1 |

## Contraintes Apps Script (CRITIQUES)

| Limite | Valeur |
|--------|--------|
| ScriptProperties | **500 KB** max |
| Exécution | **30 sec** max par appel |
| HTTP/jour | **20 000** (seuil interne à 99% = 17 820) |
| Exécutions concurrentes | **30** max |

## Architecture Cache (3 couches)

```
Couche 1 — L1 CacheService (volatile, 2h TTL)
  Clés: DEX:{chainSlug}:{contract}, GT:{network}:{contract}, LLAMA:{id}
  Prix en USD. Lecture rapide. Contourné par skipL1 sur forceFull (v4.13.9+)

Couche 2 — GlobalPriceCache (ScriptProperties, 6h staleness)
  Clés priceMap: {contract} → prix EUR
  Clés entries: {chainId}:{contract} → { price, ts, src }
  Partagé entre toutes les chaînes. Sauvé en fin de cycle.

Couche 3 — WalletCache (ScriptProperties packed, TTL nominal 10j)
  Format compact v5: [contract, balance, symbol, name, decimals]
  Virtualisé dans GLOBAL_WALLET_CACHE (hash-based, 455KB max)
  Contient: assets, priceMap (EUR), priceTsMap, balanceTsMap, scanStats
```

**forceFull (C1=TRUE)** : clear WalletCache + bypass L1 (skipL1) + bypass consensus cache voting (v4.14.5) + bypass quota pre-check. Ne clear PAS GlobalPriceCache.

## Cascade Pricing

```
1. STABLECOINS → Fast-path (FX rate / 1.0)
2. CACHE (< 6h) → retourner directement
3. NATIFS → DefiLlama (priorité) → CoinGecko fallback
4. TOKENS → DexScreener (bulk) → GeckoTerminal (batch + per-token) → Jupiter (SVM) → CoinGecko (dernier recours)
```

**JAMAIS deviner un CoinGecko ID.** Toujours vérifier.

## Format de sortie

```
chain_name | token_ticker | token_name | contract_address | balance | price_eur | value_eur
```

Lignes spéciales obligatoires : `INFO_FX`, `INFO_LAST_TX`, `INFO_ROT`, `INFO_NATIVE`, `INFO_TOTAL`, `META`

**Important** : `script_version` dans META vient de `BASE_ENGINE.gs` ou du fichier chain, PAS de `EVM_ENGINE.gs`.

## Profils de rotation

```
MINIMAL:      { maxTokensPerCall: 3,  maxRefreshPerRun: 3,  maxPriceLookups: 0  }
CONSERVATIVE: { maxTokensPerCall: 6,  maxRefreshPerRun: 8,  maxPriceLookups: 2  }
NORMAL:       { maxTokensPerCall: 10, maxRefreshPerRun: 10, maxPriceLookups: 4  }
AGGRESSIVE:   { maxTokensPerCall: 15, maxRefreshPerRun: 25, maxPriceLookups: 8  }
```

## Principes fondamentaux

1. **Ne JAMAIS écraser du cache valide** lors d'erreurs API
2. **Mode dégradé** : retourner données cached avec `[DEGRADED]`
3. **Circuit breaker** : 2 min de blocage après erreur quota
4. **Consensus RPC** : majorité stricte requise (`votes * 2 > total`) — 2/4 est un match nul, pas un consensus (v4.15.1)
5. **Cache = 1 vote** quand pas d'activité récente détectée (désactivé par forceFull ou activityForced v4.15.1)
6. **Préserver l'existant** : en cas de doute, garder les données cached plutôt qu'écraser avec des zéros

## Règles de contribution

### FAIRE
- Code `.gs` complet et prêt à déployer
- Version en tête de fichier : `// v4.x.y - Description`
- Incrémental : un fix = un problème
- Noms exacts, clés cache exactes
- Code harmonieux et universel (pas de hack chain-specific)
- **Cache key** : utiliser `CK_get("...", {...})` pour toute nouvelle clé cache. Ne pas hardcoder de string de clé (`DEX:`, `GT:`, `WALLET_CACHE_`, etc.). Si la clé n'existe pas dans `CACHE_KEYS.gs`, l'ajouter à `CK_REGISTRY`.

### NE PAS FAIRE
- Pas de renommage arbitraire
- Pas de refactor global non demandé
- Pas de pseudo-code ou code générique
- Pas d'augmentation empreinte mémoire
- Ne JAMAIS supposer un CoinGecko ID
- Ne JAMAIS ajouter de logique spécifique à une chaîne dans les engines

## Déploiement

```powershell
# Depuis wcore-gsheet/

# IMPORTANT: rootDir dans .clasp.json doit être "src" pour push (sinon erreur duplicate appsscript.json)
# Après push, remettre rootDir à "."

# Option 1: Script PowerShell sécurisé
powershell -File safe-push.ps1

# Option 2: Push direct
# 1. Modifier .clasp.json: rootDir "." → "src"
# 2. npx clasp push
# 3. Modifier .clasp.json: rootDir "src" → "."

# Pull depuis Apps Script
powershell -File pull-all.ps1
```

## Maintenance AGENTS.md

En fin de session, si des gotchas, patterns ou apprentissages importants ont été découverts, **exécuter automatiquement** le skill `Codex-md-management:revise-Codex-md` pour mettre à jour ce fichier avec les nouvelles connaissances.

## Gestion mémoire (deux systèmes)

Deux systèmes de mémoire persistante coexistent. **Toujours maintenir les deux en cohérence.**

### 1. Codex-mem (MCP — base sémantique)
- Observations indexées (#ID), recherchables par mots-clés via `mcp-search`
- Contient les détails : bugs, fixes, décisions, diagnostics, code exact
- Utiliser `save_memory` pour sauvegarder les découvertes importantes (bugs fixés, incidents, décisions d'architecture)
- Utiliser `search` / `get_observations` pour retrouver le contexte des sessions précédentes
- Projet : `wcore-gsheet`

### 2. Auto memory (dossier local)
- Fichiers dans `~/.Codex/projects/C--Users-strau-wcore-gsheet/memory/`
- `MEMORY.md` chargé automatiquement en contexte (max 200 lignes)
- Résumés structurés des patterns stables, pas les détails éphémères
- Mettre à jour quand un pattern est confirmé, supprimer quand invalidé

### Quand sauvegarder où ?
| Quoi | Codex-mem | Auto memory |
|------|-----------|-------------|
| Bug fixé (détails, cause, code) | Oui | Non (sauf si pattern récurrent) |
| Pattern stable confirmé | Oui | Oui (résumé dans MEMORY.md) |
| Décision d'architecture | Oui | Oui (résumé) |
| Incident / diagnostic ponctuel | Oui | Non |
| Préférence utilisateur | Oui | Oui |

## Autonomie sans MCP (fallbacks bash)

Si les MCPs ne sont pas connectés, ces alternatives bash fonctionnent :

### clasp (déploiement + exécution)

**Token** : `~/.clasprc.json` contient le token OAuth wcore-mcp (client `652188583224-i1qqdjip5f598p7ft67rvib751en3d9l.apps.googleusercontent.com`) avec TOUS les scopes requis (`script.scriptapp`, `script.external_request`, `script.storage`, `spreadsheets`, `userinfo.email`).

```bash
# Déploiement
npx @google/clasp push

# Exécution de fonctions
npx @google/clasp run DIAG_ZERO_WALLET -p '["0x..."]'
npx @google/clasp run WCORE_HEALTH
```

**Si le token expire** : le refresh token est stocké dans `.clasprc.json` et Google le renouvelle automatiquement. Si `clasp run` tombe en "Unable to run script function", refaire le login OAuth (une seule commande, ouvre Chrome, clique Autoriser) :

```powershell
$code = node -e "
const http=require('http');
const url='https://accounts.google.com/o/oauth2/v2/auth?client_id=652188583224-i1qqdjip5f598p7ft67rvib751en3d9l.apps.googleusercontent.com&redirect_uri=http://localhost:8888&response_type=code&scope=https://www.googleapis.com/auth/script.scriptapp%20https://www.googleapis.com/auth/script.external_request%20https://www.googleapis.com/auth/script.storage%20https://www.googleapis.com/auth/spreadsheets%20https://www.googleapis.com/auth/userinfo.email&access_type=offline&prompt=consent';
const s=http.createServer((r,res)=>{const c=new URL(r.url,'http://localhost:8888').searchParams.get('code');if(c){res.end('OK');s.close();console.log('CODE:'+c);process.exit(0)}res.end('...')});
s.listen(8888);
console.log('URL:'+url);
setTimeout(()=>process.exit(1),120000);
"
# Copier l'URL dans Chrome, cliquer Autoriser
# Le code est affiché, l'échanger contre des tokens :
node -e "
const CLIENT_ID='652188583224-i1qqdjip5f598p7ft67rvib751en3d9l.apps.googleusercontent.com';
const CLIENT_SECRET='<GOOGLE_OAUTH_CLIENT_SECRET>';
const CODE='<coller le code ici>';
(async()=>{
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:CODE,client_id:CLIENT_ID,client_secret:CLIENT_SECRET,redirect_uri:'http://localhost:8888',grant_type:'authorization_code'})});
  const t=await r.json();
  const fs=require('fs');
  fs.writeFileSync(require('os').homedir()+'/.clasprc.json',JSON.stringify({tokens:{default:{client_id:CLIENT_ID,client_secret:CLIENT_SECRET,type:'authorized_user',refresh_token:t.refresh_token,access_token:t.access_token,token_type:'Bearer',expiry_date:Date.now()+t.expires_in*1000,id_token:t.id_token||''}}},null,2));
  console.log('Saved!');
})();
"
```

### Google Sheets API (service account)

Le service account `gsheets-mcp@wcore-mcp.iam.gserviceaccount.com` a accès en lecture/écriture au spreadsheet. La clé est dans `C:\Users\strau\.config\gsheets-mcp\service-account.json`.

```bash
node -e "
const {JWT}=require('google-auth-library');
const key=require('C:/Users/strau/.config/gsheets-mcp/service-account.json');
const client=new JWT({email:key.client_email,key:key.private_key,scopes:['https://www.googleapis.com/auth/spreadsheets']});
(async()=>{
  await client.authorize();
  const r=await client.request({url:'https://sheets.googleapis.com/v4/spreadsheets/1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4/values/'+encodeURIComponent('Ledger - ZERO Network!A1:M20')});
  console.log(JSON.stringify(r.data.values,null,2));
})();
"
```

### Playwright via CDP (Chrome debug)

Chrome ne supporte le remote debugging qu'avec un répertoire de données **explicite et non-défaut**. Le profil `C:\Users\strau\chrome-debug-profile` est dédié au debug et **persiste les cookies Google** (login une fois, réutilisable).

```bash
# Démarrer Chrome avec debug (si pas déjà lancé)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:USERPROFILE\chrome-debug-profile"

# Connecter Playwright
node -e "
const {chromium}=require('playwright');
(async()=>{
  const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p=b.contexts()[0].pages()[0];
  await p.goto('https://google.com');
  console.log(await p.title());
  await b.close();
})();
"
```

**Note** : Google bloque le sign-in sur les navigateurs lancés par Playwright (`chromium.launch()`). La méthode CDP contourne cela car Chrome est démarré normalement. Ne PAS utiliser le répertoire de données Chrome par défaut (`%LOCALAPPDATA%\Google\Chrome\User Data`) — Chrome refuse le debug dessus.

## Gotchas

- **gid === 0** : `getSheetId()` retourne 0 pour le premier onglet → falsy en JS. Utiliser `gid != null` au lieu de `gid ?`
- **forceFull + quota** : forceFull bypass le L1 cache → plus d'appels HTTP que d'habitude. Ne pas lancer en fin de journée quand le quota est bas
- **Tokens LP non-stablecoin** : les tokens dont la seule liquidité est contre un quote non-USD (ex: TOKEN/CREATE) peuvent avoir des prix USD incorrects si le cache L1 est stale. Le skipL1 sur forceFull corrige ça (v4.13.9+)
- **GlobalPriceCache partagé** : toutes les chaînes partagent le même GlobalPriceCache. La dernière chaîne à sauver écrase le priceMap entier
- **`*/` dans commentaires GAS** : ne JAMAIS écrire `*/` dans un commentaire multi-ligne `/* ... */` (ferme le bloc prématurément)
- **@customfunction dans ARRAYFORMULA+HYPERLINK** : Google Sheets cache agressivement les résultats de @customfunction. HYPERLINK ignore silencieusement les URLs vides → liens absents sans erreur. Utiliser RichTextValue API pour les hyperlinks programmatiques (v4.5.5+)
- **Bridging watchdog-pulse gap (v4.15.104, 2026-06-29)** : `_setDetailsChainHyperlinks_` ne s'exécute qu'aux pulses watchdog (5-30 min) via `_ensureLedgerCache_()`. Toute ligne ajoutée par le pipeline CEX ou ledger entre deux pulses reste sans lien. Symptôme : `Ledger - Beam` ligne 341 dans `Portefeuille Crypto Details` ajoutait par le pipeline CEX mais pas de lien jusqu'au prochain pulse. Fix : `_bpDetailsAutoLink_(e)` dans `17_LISTING.gs` câblé dans `WCORE_ON_EDIT` (`16_REFRESH.gs`), appelé après les handlers CEX et avant le check A1. Sur chaque edit user de la colonne E, set le RichTextValue avec le `gid` du sheet correspondant via lookup direct `ss.getSheetByName(text)`. Pas de cache (latency acceptable, lookup sheet direct). Si le sheet n'existe pas, pose un RichTextValue sans lien (texte plain).
- **Recap Chain colonne A** : script-managed via `_setRecapHyperlinks_()` dans 17_LISTING.gs. Mise à jour par `REFRESH_LEDGER_CACHE()`, pas de formule
- **GT API paths** : `/token_price/` vit sous `/api/v2/simple/networks/`, PAS `/api/v2/networks/`. `_pxGetGtBaseUrl()` pour Try 2+3 (/tokens/, /pools/), `_pxGetGtSimpleBaseUrl()` pour Try 1 + batch (/token_price/). Mauvais path = 404 silencieux (v4.14.4)
- **GT_NETWORK slugs** : certains réseaux GT utilisent des underscores, pas des tirets. Toujours vérifier via `https://api.geckoterminal.com/api/v2/networks`. Ex: `polygon_pos` (pas `polygon-pos`), `arbitrum_nova` (pas `arbitrum-nova`). Mauvais slug = 404 silencieux → metadata (symbol/name) jamais résolue
- **attemptTsMap cooldown** : `PRICE_ATTEMPT_COOLDOWN_MS` (2h via 26B_HTTP_SAVINGS.gs) bloque les retries Llama/CG pour un token après une tentative échouée. Les 46+ clés dans `Cache.attemptTsMap` = tokens en cooldown. Nettoyage auto après cooldown*2 (4h)
- **GT throttle** : `_GT_THROTTLE.max` dans 26B_HTTP_SAVINGS.gs contrôle le nombre d'appels GeckoTerminal par exécution. ~~Actuellement 40/run (v4.14.2)~~ → **80/run depuis v4.15.42** (R15 fix : tokens GT-only bloqués). Base a 11+ tokens GT-only
- **Sheet formules A1/I1** : `A2=CACHED_WALLET_ASSETS_*(addr;J1)` (lecture cache seule, pas d'HTTP). `I1=*_REFRESH_STATUS(addr;"";I2:I;C1;B1)` (live scan, C1=forceFull, B1=trigger). WATCHDOG pulse B1 → I1 scanne → cache MAJ → WATCHDOG pulse J1 → A2 relit le cache. **Colonne I (I2:I) = liste des contrats tokens**, PAS l'adresse wallet
- **A1 checkbox = refresh manuel Ledger (v4.15.99)** : `A1=TRUE` sur un onglet `Ledger - *` déclenche `MASTER_ON_EDIT` (trigger `onEdit` installable) qui écrit un timestamp dans `B1` puis remet `A1=FALSE`. Ce trigger était désactivé automatiquement entre v4.15.55 et v4.15.99. Si cocher A1 ne réagit pas, vérifier `WCORE_AUTO_HEAL_STATUS()` : `MASTER_ON_EDIT` doit valoir `1`. Sinon exécuter `WCORE_AUTO_HEAL_FORCE()` depuis l'éditeur Apps Script pour réinstaller les triggers avec une autorisation fraîche.
- **_RpcLookup multi-RPC** : `_RpcLookup` dans 27_ACTIVITY_REFRESH.gs stocke RPCs/REST URLs par chaîne + VM type (v4.15.0). `getRpcs(chain)` retourne le tableau, `getVm(chain)` retourne "EVM"/"SVM"/"COSMOS". `BUILD_RPC_LOOKUP()` utilise `eval()` → ne fonctionne PAS en contexte trigger. Cosmos chains utilisent `cfg.API.REST_URL`, SVM/EVM utilisent `cfg.RPC.ENDPOINTS`. Exécuter `BUILD_RPC_LOOKUP()` depuis l'éditeur Apps Script après ajout de chaînes
- **WATCHDOG batch timing** : BATCH_SIZE=20, ~107 wallets EVM, trié par lastCheck ascending. Cycle complet ~25-30 min. Wallets récemment vérifiés sont en fin de queue
- **Cloudflare ETH RPC cassé** : `cloudflare-eth.com` retourne "Internal error" pour `eth_getTransactionCount`. `publicnode.com` fonctionne. `ankr.com/eth` requiert API key. Toujours tester avec fallback RPCs
- **Nonce tracking multi-VM (v4.15.0)** : EVM utilise `eth_getTransactionCount` (nonce entier), SVM utilise `getSignaturesForAddress(limit:1)` (signature tx string), Cosmos utilise `/cosmos/auth/v1beta1/accounts/` (sequence entier). WATCHDOG classe les wallets par VM et utilise la batch function dédiée
- **Consensus + force/activity** : `force=true` OU `state.activityForced=true` → `hasRecentActivity=true` → cache ne vote pas. WATCHDOG pulse B1 (pas C1), donc `force=false` — c'est `activityForced` qui désactive le cache vote (v4.15.1)
- **budget.force** : L'objet SimpleBudget dans EVM Engine doit inclure `force: !!force` pour que INFO_ROT affiche `forceFull=YES`. Sans ça, toujours NO (v4.14.5)
- **ModuleVersions** : `BaseEngine.VERSION` est affiché en priorité dans STATS (via `||`). S'il est stale, il masque la version correcte du ModuleRegistry. Toujours synchroniser les deux
- **Toujours des fixes permanents** : ne jamais proposer de workaround temporaire (ex: forcer `hasRecentActivity=true`). Toujours investiguer et corriger la cause racine
- **WATCHDOG et [NO_CACHE]** : `[NO_CACHE]` dans I1 = wallet jamais scanné avec succès. Traité comme "empty" (cooldown 10 min) depuis v4.5.14. Avant ça, ignoré → attente 5h
- **Thundering herd Recap Chain** : `REFRESH_LEDGER_CACHE()` réécrit 119 cells colonne A → déclenche ~9500 recalculs INDIRECT → saturation queue @customfunction → risque épuisement quota. Exécuter en heures creuses
- **Quota UrlFetch = fenêtre glissante 24h (PAS de reset à heure fixe)** : le quota UrlFetch Google n'est PAS un reset calendaire (ni minuit UTC, ni 10h30 CET). C'est une **fenêtre glissante ~24h** : chaque appel compte pendant 24h puis sort du décompte. La récupération après épuisement est **progressive** (~24h après le burst), pas instantanée à une heure fixe. Le breaker (`03E_QUOTA_CIRCUIT_BREAKER.gs` v4.13.7+) compare `nowMs - trippedMs < 24h`, PAS `parsed.date === today`. Note historique : avant v4.13.7 le code croyait à un reset à minuit UTC — c'était un bug corrigé. Ne JAMAIS planifier sur une "heure de reset" fixe
- **@customfunction queue** : Google Sheets limite les exécutions concurrentes. Quand des fonctions HTTP (REFRESH_STATUS) saturent la queue, les fonctions cache-only (CACHED_WALLET_ASSETS) sont aussi bloquées avec "Chargement en cours..."
- **CACHED_* sans cache ne doit jamais afficher `No cache available` (2026-05-07)** : `CACHED_WALLET_ASSETS_*` est la surface A1 cache-only visible par l'utilisateur. Si `WalletCache.load()` retourne null, les engines EVM/SVM/Cosmos doivent retourner `OutputBuilder.fromCacheFallback(..., "NO_CACHE_WAITING_REFRESH", ...)` avec un cache vide standardisé, pas `OutputBuilder.error(..., "No cache available")`. Le refresh live I1 reconstruit ensuite le vrai cache. Repro incident : plusieurs onglets Ledger (Tempo, ZERO Network, BOB, etc.) après push/auto-heal; fix dans `11_EVM_ENGINE.gs`, `14_SVM_ENGINE.gs`, `15_COSMOS_ENGINE.gs`.
- **ACTIVITY_WATCHDOG normalisation chain keys** : les chain keys sont normalisées en MAJUSCULES + underscores (`"Arbitrum One"` → `"ARBITRUM_ONE"`). `_activity_pulseB1ForChain_` et `ForceRefreshManager` doivent utiliser la MÊME normalisation partout. `getSheetByName()` est **case-sensitive** en GAS. Avant v4.14.8, B1 n'était jamais pulsé pour les chaînes multi-mots (Arbitrum One, ZERO Network, zkLink Nova, etc.)
- **ForceRefreshManager expiry** : le flag expire quand `last_full_scan_ms > requestedAt` (v4.15.2) — c'est-à-dire quand un full scan complet a eu lieu après la détection de TX. Safety TTL de 2h pour les flags orphelins. `BaseEngine.checkActivityForceRefresh` vérifie `state.lastFullScanMs` et clear le flag si le full scan est postérieur
- **SVM native balance sans consensus** : contrairement à l'EVM, le SVM Engine n'a PAS de consensus RPC pour le native balance. Si `getBalance` échoue mais les tokens réussissent, le nativeBalance=0 écrase le cache. Fallback ajouté en v4.14.10 : si RPC échoue et cache contient un balance>0, le cache est préservé
- **clasp run / Execution API** : OK depuis 2026-04-29. Token OAuth wcore-mcp (`652188583224-i1qqdjip5f598p7ft67rvib751en3d9l.apps.googleusercontent.com`) dans `.clasprc.json` avec TOUS les scopes (`script.scriptapp`, `script.external_request`, `script.storage`, `spreadsheets`, `userinfo.email`). Client secret dans `.playwright-mcp/`. Si le token expire, suivre la procédure dans "Autonomie sans MCP".
- **Trigger mensuel GAS** : pas de trigger "mensuel" natif dans Apps Script. Pattern : trigger hebdomadaire + staleness check interne (25j). `UPDATE_DYNAMIC_RPCS()` s'auto-skip si données < 25j → exécution effective ~28j
- **UrlFetchApp `deadline` et `timeout` NON-FONCTIONNELS** : ni `fetch` ni `fetchAll` ne respectent ces paramètres dans GAS. Aucune protection timeout native n'existe. Les erreurs quota ("Service invoked too many times") prennent ~10s par appel avant de throw. v4.15.4 contourne avec early-abort et budget temps dans batchWithConsensus (03_HTTP.gs + 05_RPC.gs)
- **ChainFactory config** : accéder via `chain.getConfig()`, PAS `chain._config` ni `chain.config` (undefined). Le global RPC est `RpcClient` (pas `Rpc`). `pickForConsensus` a `minRpcs=2` qui override le count demandé — truncate rpcList après si besoin de 1 RPC
- **UPDATE_DYNAMIC_RPCS consomme ~250 HTTP calls** : tester 241 RPCs + latency. À exécuter quand le quota est largement disponible (fenêtre glissante 24h, voir gotcha quota). Les appels de test/debug s'accumulent vite — le circuit breaker peut se tripper en milieu de session
- **GAS 6 min pour fonctions admin/trigger** : les fonctions non-@customfunction (UPDATE_DYNAMIC_RPCS, BUILD_RPC_LOOKUP, etc.) ont une limite de 6 min, pas 30s. `_testRpcLatency` (v4.15.5) utilise un budget de 4 min pour rester dans cette limite
- **`fetchAll` parallèle = latence trompeuse** : tous les RPCs partagent le même `t0` → tri par latence inefficace. v4.15.5 utilise des fetch individuels séquentiels pour une mesure réelle par RPC
- **return invisible dans l'éditeur GAS** : quand on exécute une fonction depuis l'éditeur Apps Script (bouton Run), les `return` ne sont PAS affichés dans les logs. Seuls `Logger.log()` et `console.log()` apparaissent. Pattern : ajouter `console.log()` dans les fonctions admin/diagnostic pour visibilité éditeur
- **safe-push brace warnings** : le compteur d'accolades de safe-push.ps1 est un simple compteur de `{`/`}` qui ne distingue pas strings/commentaires. Les warnings sur 04B_CACHE_WALLET.gs, 33_DYNAMIC_RPC.gs et 18_CLEANUP.gs sont des faux positifs (accolades dans des strings comme `"{"`, `"${"`)
- **GAS file load order** : les fichiers GAS sont chargés par ordre alphabétique (00_ avant 01_ avant 32_). Les IIFEs `(function(){...})()` s'exécutent immédiatement au chargement → les variables des fichiers ultérieurs ne sont pas encore définies. C'est pourquoi VERSION_SCANNER (00B) ne peut pas lire les `*_VERSION` variables et doit déférer à MODULE_AUTOREGISTER (32_)
- **WCORE_VERSION source unique** : `WCORE_VERSION` est défini UNIQUEMENT dans `01_INIT.gs` (objet avec MAJOR/MINOR/PATCH + toString()). Ne JAMAIS redéclarer dans 00_VERSION_REGISTRY.gs. L'enregistrement ModuleRegistry("WCORE") est fait dans 32_MODULE_AUTOREGISTER.gs (car 01_INIT n'est pas chargé quand 00_ s'exécute)
- **_mergeAssetsPreservingCached et activityForced (v4.15.33)** : le merge NE DOIT JAMAIS être skipé, même en forceFull. `activityForced` (WATCHDOG → `state.force=true` → `_forceFull=true` sur cacheObj) faisait skipper tout le merge → tokens absents du scan (consensus RPC fail) disparaissaient du cache. Fix : suppression du `if(force)return cacheObj` dans `_mergeAssetsPreservingCached` (04C_CACHE_GLOBAL.gs:982-984). Seuls les tokens **explicitement** rescannés avec balance=0 (présents dans newSet) sont supprimés. Repro : ZERO Network WBTC (3 RPC fragiles, 1 timeout, pas de majorité).
- **Balances microscopiques (E-12) sur chaînes à faible RPC count (v4.15.28→v4.15.43)** : Quand `decimals()` n'est pas dans le batch RPC réussi (ex: drpc.org free tier = max 3 requêtes), le code fallback à `DECIMALS_FALLBACK=18`. Pour des tokens à 6 décimales (pathUSD, USDC.e sur Tempo), la balance devient `2.83E-12` au lieu de `2.83`. Pire, le consensus RPC ajoute le cache comme vote — le cache erroné bloque alors la correction automatique. **Fix triple (v4.15.28)** : (1) `RPC.TOKEN_DECIMALS` explicites dans la config chain, (2) `FLAGS.DISABLE_NATIVE_BALANCE=true`. **Refined (v4.15.43)** : le garde-fou skipCacheVote se déclenchait seulement quand `!hasValidMetaDecimals` — si metaMap avait des decimals valides (6) mais le cache contenait encore E-12, le cache votait quand même et `PREFER_CACHE_ON_DISAGREE` le gardait. Fix: (1) skipCacheVote pour TOUTE balance < 1e-12, (2) decimalsSuspect requis pour truster metaMap, (3) fresh entries symbol/name marquées decimalsSuspect.
- **BUILD_RPC_LOOKUP sans eval() (v4.15.42)** : `BUILD_RPC_LOOKUP()` utilise désormais `ChainFactory.getRegistry()` au lieu de `eval("_" + name)`. Cela le rend **exécutable en contexte trigger**. L'auto-heal appelle automatiquement `BUILD_RPC_LOOKUP()` si le lookup est vide après `REPAIR_RPC_LOOKUP_FROM_REGISTRY()`. Plus besoin d'exécution manuelle post-déploiement.
- **SVM native balance consensus (v4.15.42)** : `SvmRpcClient.getBalanceWithConsensus()` remplace le simple `fetchAll` first-success. Vote majoritaire multi-RPC : si un RPC stale retourne 0 et les autres une balance positive, le consensus préserve la valeur correcte. Le fallback cache v4.14.10 reste actif en dernier recours.
- **Packed cache saturation (v4.15.42)** : `_PACKED_CACHE_MAX_BYTES` réduit de 495000 à **485000** (+10KB marge sous 500KB). `_WALLET_TTL_SEC` réduit de 14j à **10j** pour libérer plus vite les entrées obsolètes.
- **Emergency purge ne doit JAMAIS supprimer `GLOBAL_WALLET_CACHE_V1` (v4.15.56)** : `CacheManager._emergencyPurge_` libère de l'espace ScriptProperties quand le stockage dépasse ~85%. Bug v4.15.33-v4.15.55 : la boucle “Wallets” matchait `GLOBAL_WALLET_CACHE_V1` via `WALLET_`, supprimait tout le packed wallet cache, puis le prochain `_packedPut_` réécrivait seulement l'entrée courante → `DIAG_CACHE_INTEGRITY entries=1` et vague de `NO_CACHE_WAITING_REFRESH`. Fix : `isProtectedKey_(k)` exclut explicitement `GLOBAL_CACHE_KEYS.GLOBAL_WALLET` / `GLOBAL_WALLET_CACHE_V1` dans toutes les listes de candidats purge. Ne jamais ajouter de purge qui matche `GLOBAL_WALLET_CACHE_V1`.
- **Retry #ERROR! limité (v4.15.42 — R9)** : `_checkSheetErrors_()` limite à **3 retries / 24h par sheet**. Le compteur est stocké dans `ScriptProperties` (`WCORE_ERROR_RETRY_{sheetName}`). Évite le churn infini sur les erreurs permanentes.
- **Recovery sweep guards (v4.15.42 — R16)** : `QUOTA_RECOVERY_SWEEP` et `FOLLOWUP` utilisent `LockService` + flags `ScriptProperties` pour éviter les exécutions concurrentes et les triggers dupliqués. `_recoveryAcquireLock_` avec TTL 10 min, `_recoveryIsFollowupPending_` avec grace 1 min.
- **WCORE_VERSION synchronisé (v4.15.44)** : `WCORE_VERSION.PATCH` passe de 42 à **44**. RPC batch size limits (Optimism/Unichain MAX_BATCH_SIZE: 10) + RPC_POSITIVE_OVER_ZERO_CACHE consensus fix.

- **PREFER_CACHE_ON_DISAGREE trap (v4.15.43)** : Sur les chaînes à 1 seul RPC (Tempo, etc.), quand le cache vote une balance microscopique (E-12, artifact de decimals fallback 18→6) et le RPC vote la vraie balance, `getConsensusBalanceWithFallback` préfère le cache → la balance corrompue persiste indéfiniment. **Triple fix** dans `_scanBatch` (09_SIMPLE_ROTATION.gs): (1) skipCacheVote pour TOUTE balance < 1e-12 (pas seulement quand metaMap invalide), (2) decimals de metaMap ignorés si `decimalsSuspect=true` (TOKEN_DECIMALS config peut alors override), (3) fresh entries créées via symbol/name (sans decimals) marquées `decimalsSuspect:true`. Bumper CACHE_VERSION si stale cache en place. Repro: Tempo pathUSD/USDC.e (6 decimals) → cache E-12 → PREFER_CACHE_ON_DISAGREE → jamais corrigé.

- **RPC batch size limits (v4.15.44)** : Certaines chaînes EVM rejettent les batches JSON-RPC > N items. Symptôme : `fullScan=RAN(1b,0t)` — batch exécuté mais 0 tokens scannés (`scn:0`), alors que `cov:5/5` (tokens couverts). Le RPC retourne un objet erreur au lieu d'un array → `parsed` n'est pas un array → `rpcSuccess=false` → aucun vote. **Chaîne affectée** : OPTIMISM et UNICHAIN (limite 10 items, message "To send batches over 10 items, consider using a dedicated API provider"). **Fix** : ajouter `RPC.MAX_BATCH_SIZE: 10` dans la config chain → active `RpcClient.batchCallChunked()`. TEMPO a déjà `MAX_BATCH_SIZE: 3`. Tester avec `node -e "fetch(rpc,{method:'POST',body:JSON.stringify(Array.from({length:20},(_,i)=>({jsonrpc:'2.0',id:i,method:'eth_call',params:[{to:token,data:'0x70a08231'+addr.padStart(64,'0')},'latest']}))}))"` — si réponse = objet avec error au lieu d'array, la chaîne a une limite. Voir `docs/rpc-batch-limits.md` pour la liste complète.

- **RPC_POSITIVE_OVER_ZERO_CACHE (v4.15.44)** : Symétrique du fix v4.13.7 (RPC zero over stale cache). Quand le cache a `balance=0` (stale/vidé) et que le RPC retourne un balance positif, `getConsensusBalanceWithFallback` faisait `PREFER_CACHE_ON_DISAGREE` → gardait le zéro → token purgé. **Fix** : nouveau cas `RPC_POSITIVE_OVER_ZERO_CACHE` — si cache=0 et RPC>0, faire confiance au RPC. Un `balanceOf` réussi retournant une valeur positive est autoritaire.

## Top Market Cap / Google Finance

- **Top 300 actions (2026-06-13)** : `src/34_TOP_MARKETCAP.gs` alimente `Google Finance` depuis `companiesmarketcap.com` (`?download=csv`) et reconstruit `Action Rebalancing`. Documentation détaillée : `docs/top-marketcap-google-finance.md`.
- **Structure Google Finance** : données actions en `A12:L311`, `M=Ignore` checkbox, `N=timestamp`. `D=Price EUR` et `G=Market Cap EUR` ont des fallbacks CSV quand `GOOGLEFINANCE` ne couvre pas le marché (ex: Tadawul, Abu Dhabi, certaines A-shares).
- **Ignore** : cocher `Google Finance!M` garde la ligne visible dans `Google Finance`, mais l'exclut de `Action Rebalancing`. Le script préserve l'ignore par ticker ou nom. `Saudi Aramco` (`2222.SR`) est ignoré par défaut car pas accessible Bitpanda / brokers retail classiques.
- **Rang actif Action Rebalancing** : `Action Rebalancing!B` est recalculé en rang continu après exclusions. Ne pas remettre le rang brut `Google Finance!H`, sinon les formules de bornes (`XLOOKUP(H1;B3:B;I3:I)`) cassent dès qu'une ligne est ignorée.
- **Bitpanda actions uniquement** : le spot actions lit seulement `Bitpanda Spot Stocks`. L'ancien onglet `Bitpanda Spot Action` est supprime; le bucket API `action` est fusionne dans Stocks. Ne pas chercher dans Crypto/Commodity/Fiat pour les actions : collisions connues (`CAT`, `STX`).
- **Aliases Bitpanda** : maintenir les symboles historiques (`GOOGL->GOOG`, `FB->META`, `TSFA->TSM`, `BROA->AVGO`, `BRKB->NYSE:BRK.B`, `SSU/SMSN->KRX:005930`, `HYXS->KRX:000660`, `RDSA->SHEL`, `MC->EPA:MC`, `OR->EPA:OR`, `RMS->EPA:RMS`, `TM->TYO:7203`).
- **Ratios spéciaux** : Toyota `TM` est un ADR chez CompaniesMarketCap mais Bitpanda utilise l'action ordinaire → mapping `TYO:7203` + supply ×10. Samsung `SSU/SMSN` représente ~25 actions ordinaires `KRX:005930` → spot ×25.

## Bitpanda Sync / Remplacement SyncWith

- **Connecteur Bitpanda (2026-06-13)** : `src/35_BITPANDA_SYNC.gs` remplace progressivement SyncWith via l'API Bitpanda officielle. Documentation : `docs/bitpanda-sync.md`.
- **Secret API** : stocker la cle uniquement dans `ScriptProperties` via `SET_BITPANDA_API_KEY("...")`. Ne jamais écrire la cle dans une cellule, un fichier tracked ou les logs.
- **Diagnostic avant bascule** : exécuter `DIAG_BITPANDA_API()` et vérifier les buckets `crypto`, `commodity`, `fiat`, `stocks`, `unknown`. Ne pas supprimer SyncWith tant que les sorties API ne reproduisent pas les onglets Bitpanda attendus.
- **Un seul compte Bitpanda** : pas de `BITPANDA_ACTION_API_KEY`. Le bucket `action` de l'API officielle est fusionne dans `Bitpanda Spot Stocks`.
- **Trigger (v4.15.114)** : le refresh auto passe par `CEX_HOURLY_REFRESH` (trigger `everyHours(4)`, installe par l'auto-heal). `INSTALL_BITPANDA_SYNC_TRIGGER()` et `BITPANDA_REFRESH_WATCHDOG()` sont `LEGACY_DISABLED`. Vérifier `BITPANDA_SYNC_STATUS()` après exécution.
- **Checkboxes refresh CEX (v4.15.115)** : `Action Rebalancing!Z1` queue `TOP_MARKETCAP` + `BITPANDA_STOCKS_FIAT` (`CEX - Bitpanda Stocks` + `Fiat`). `Portefeuille Crypto!AC2` queue `BITPANDA_CRYPTO` (crypto SEUL — pas de refresh `CEX - Bitpanda Fiat` depuis v4.15.115) + Binance + Bitfinex + Bybit + Coinbase + OKX. Ne pas remettre `AC2` dans `Action Rebalancing` ni `Portefeuille Crypto Details`.

## Binance Sync

- **Connecteur Binance (2026-06-13)** : `src/36_BINANCE_SYNC.gs` alimente `Binance Crypto` via relais Railway. Documentation : `docs/binance-sync.md`.
- **Relais obligatoire** : Binance bloque les IP Google Apps Script. Utiliser `SET_BINANCE_RELAY(url, token)`; le secret Binance reste dans Railway, pas dans Apps Script.
- **Buckets Binance** : `spot`, `earn-flexible`, `earn-locked`. Le relais normalise `USDC/TUSD -> USDT` et `EUR/EURI -> EURC`.
- **Refresh manuel CEX = queue one-shot (v4.15.107-118)** : cocher `A1` sur un onglet CEX écrit `QUEUED: <ts> <kind>` en `B1` et pousse un job dans `CEX_MANUAL_JOB_QUEUE`; `CEX_MANUAL_REFRESH_WORKER` (trigger récurrent `everyMinutes(1)` v4.15.118, lease `CEX_WORKER_LEASE` 2 min) draine toute la queue dans un budget de 3 min; succès = `B1` timestamp canonique (lu depuis `D3`, v4.15.117); transitoire (timeout Spreadsheets / quota / BUSY) = `RETRY n/2: ...` + requeue auto (max 2) à +5s; erreur définitive = diagnostic visible en `B1`. Plus AUCUN poller `B1=REQUEST`/watchdog 1 min.
- **Binance manuel** : `Binance Crypto!A1` refresh seulement Binance. `Portefeuille Crypto!AC2` refresh le bloc CEX crypto complet (`Bitpanda Spot Crypto`, `Bitpanda Spot Fiat`, `Binance Crypto`, `Bitfinex Crypto`, `Bybit Crypto`). Les watchdogs individuels Binance/Bitfinex/Bybit sont legacy; auto-heal supprime les triggers individuels et garde le watchdog central.
- **Architecture commune CEX** : voir `docs/cex-sync.md` (queue one-shot `CEX_MANUAL_JOB_QUEUE` + worker lease, locks par connecteur `CEX_ACQUIRE_LOCK`, relais `cex-relay`, helpers `CEX_*` dans `35_BITPANDA_SYNC.gs`, integration `Portefeuille Crypto Details`).
- **Portefeuille Crypto Details — positions CEX (2026-06-15)** : libelle colonne E = `CEX - Bitpanda/Binance/Bitfinex/Bybit`. Soldes via formules SUMIFS dediees pointant vers `<X> Crypto` (Bitpanda en VLOOKUP). Bybit branche en SUMIFS le 2026-06-15 (5 lignes : BTC, USDT, CC, LINK, EURC) — avant, valeurs en dur jamais mises a jour. `CEX - OKX` / `CEX - Coinbase` = saisie manuelle (pas d'onglet/connecteur), ne pas convertir en formule. Renommer un onglet CEX casse formules Details + code GAS + flux `B1=REQUEST` : ne pas renommer sans migration coordonnee.

## Bitfinex Sync

- **Connecteur Bitfinex (2026-06-14)** : `src/37_BITFINEX_SYNC.gs` alimente `Bitfinex Crypto` via l'API officielle v2. Documentation : `docs/bitfinex-sync.md`.
- **Pas de relais** : contrairement à Binance, Bitfinex **ne bloque PAS** l'IP Apps Script. Appel direct `POST /v2/auth/r/wallets` (testé HTTP 200 depuis IP datacenter).
- **Signature HMAC-SHA384** (pas SHA256). Payload signé = `/api/{path}{nonce}{body}`, `nonce = Date.now()*1000` (microsecondes, strictement croissant). Headers `bfx-nonce`, `bfx-apikey`, `bfx-signature`. GAS utilise `Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_384, ...)`.
- **Secrets** : stockés dans `UserProperties` + `DocumentProperties` via `SET_BITFINEX_API_KEYS(key, secret)` depuis v4.15.88. Les time-triggers lisent `DocumentProperties`; si `Bitfinex Crypto!B1` affiche `Missing BITFINEX_API_KEY/BITFINEX_API_SECRET`, relancer `SET_BITFINEX_API_KEYS(...)` une fois depuis l'éditeur Apps Script. Jamais dans une cellule.
- **Wallet exchange seulement** : `BITFINEX_SYNC_CONFIG.WALLET_TYPES = ["exchange"]` (spot). `funding`/`margin` ignorés. Format réponse : `[WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED, AVAILABLE, ...]` → on prend `BALANCE` (index 2).
- **Aliases devises** : `BITFINEX_SYMBOL_ALIASES` normalise les codes Bitfinex courts (`ATO→ATOM`, `DOG→DOGE`, `IOT/MIOTA→IOTA`, `*F0→sous-jacent`).
- **Consolidation stables/fiat (comme Binance/Bitpanda)** : `BITFINEX_STABLE_MAP` regroupe tout USD/stable USD → `USDT` (`USD`, `UST`, `USDC`/`UDC`, `TUSD`, `USTF0`) et tout EUR/stable EUR → `EURC` (`EUR`, `EURT`/`EUT`, `EURS`/`EUS`, `EURI`, `EUTF0`). Applique APRÈS les alias de tickers, cumul sur la ligne cible.
- **Refresh manuel** : `Bitfinex Crypto!A1` refresh seulement Bitfinex. `Portefeuille Crypto!AC2` (watchdog Bitpanda) inclut désormais Bitfinex dans le bloc CEX commun.

## ByBit EU Sync

- **Connecteur Bybit EU (2026-06-15)** : `src/38_BYBIT_SYNC.gs` (version `4.15.95`) alimente `Bybit Crypto` via le relais Railway multi-CEX `cex-relay`. Documentation : `docs/bybit-eu-sync.md`.
- **Relais actif** : `https://cex-relay-production.up.railway.app`. Apps Script stocke seulement `BYBIT_RELAY_URL` + `BYBIT_RELAY_TOKEN` via `SET_BYBIT_RELAY(url, token)`; les secrets Bybit restent dans les variables Railway.
- **Endpoint EU direct** : `https://api.bybit.eu` uniquement. `api.bybit.com` est bloqué par CloudFront (HTTP 403) depuis l'IP Apps Script; `api.bybit.eu` est aussi geo-bloqué depuis GAS, d'où le relais EU West.
- **Header EU SDK** : `x-referer: Cg000971` ajouté automatiquement par le SDK `tiagosiebler/bybit-api` quand `apiRegion: "EU"`. Notre connecteur l'envoie en dur.
- **`recvWindow`** : 20000ms (5000ms rejeté par Bybit EU avec `retCode:10002`).
- **Bloqueurs confirmés** : (1) Bybit EU n'autorise plus la création de clés API système personnelles (UI force "Connect to Third-Party Applications"). (2) Les clés tierces (Gainium, Siebly SDKs, Finestel, etc.) sont IP-whitelistées sur l'infra du partenaire → `retCode:10010 Unmatched IP` depuis l'IP Apps Script, même avec `x-referer: Cg000971`. (3) `clasp run` indisponible (EXECUTION_API non déployé, voir gotcha).
- **Tax API** : clé Bybit EU Tax API validée via relais. Comptes lus : `UNIFIED` + `FUND`, fusionnés en `USDT`, `CC`, `LINK`, `EURC`, `BTC` au moment de l'intégration.
- **Apps tierces évaluées (non exploitables)** : Gainium, Finestel, Wick Hunter, HaasOnline, Siebly SDKs, Botty EU, SIGNUM EU, Bothub Trade EU. Aucune n'expose d'API portfolio publique exploitable par WCORE.
- **Secret** : ne pas stocker la clé Bybit dans GAS pour le flux actif. `SET_BYBIT_API_KEYS(apiKey, apiSecret)` reste seulement comme fallback direct/debug.
- **Refresh manuel** : `CEX - Bybit!A1` écrit `B1=QUEUED: ...` et pousse un job `BYBIT` dans la queue one-shot (`CEX_MANUAL_REFRESH_WORKER`). Le refresh auto passe par `CEX_HOURLY_REFRESH()` (4h) garanti par `WCORE_AUTO_HEAL`; les triggers Bybit individuels sont legacy.
- **Inclus dans Recap** : `_isLedgerLike_()` et `_wd_isCexSheet_()` couvrent `bybit` (affichage seul, pas de pulse watchdog).
- **Statut** : opérationnel via `cex-relay`. `UPDATE_BYBIT_SPOT()` retry 3 fois les erreurs transitoires `UrlFetchApp.fetch` vers le relais. Si `ScriptProperties` est saturé, l'écriture de `BYBIT_SYNC_STATUS` peut être skippee sans bloquer l'onglet; le flag manuel `CEX - Bybit!A1` fallback en `UserProperties`.

## Coinbase Sync

- **Connecteur Coinbase (2026-06-15)** : `src/39_COINBASE_SYNC.gs` alimente `CEX - Coinbase` via le relais Railway `cex-relay`. Documentation : `docs/coinbase-sync.md`.
- **Signature JWT ES256** : Apps Script ne sait pas signer ES256/ECDSA de façon fiable → la signature CDP est faite côté Node dans le relais (`/coinbase`). Le relais convertit la signature DER en JOSE (`derToJose`).
- **Host** : `https://api.coinbase.com`, endpoint `/api/v3/brokerage/accounts`. JWT claim `uri = "GET api.coinbase.com/api/v3/brokerage/accounts"`, **pas** de claim `aud`.
- **Secrets Railway** : `COINBASE_API_KEY_NAME` (`organizations/.../apiKeys/...`) + `COINBASE_PRIVATE_KEY` (EC PEM, `\n` acceptés). Jamais dans GAS/cellule/repo.
- **Setup GAS** : `SET_COINBASE_RELAY(url, token)`. Fallback automatique sur le relais Bybit/Binance existant si `COINBASE_RELAY_*` absent.
- **Aliases** : `RONIN -> RON`, USD/stables -> `USDT`, EUR/stables -> `EURC`.

## OKX Sync

- **Connecteur OKX (2026-06-15)** : `src/40_OKX_SYNC.gs` alimente `CEX - OKX` via le relais Railway `cex-relay`. Documentation : `docs/okx-sync.md`.
- **Host EEA obligatoire** : `https://my.okx.com` (variable relais `OKX_BASE_URL`, défaut `my.okx.com`). `www.okx.com` retourne `code 50119 "API key doesn't exist"` car le compte est sur l'entité EEA. Vérifier le domaine de login OKX avant de choisir le host.
- **Signature** : HMAC-SHA256 base64, prehash `timestamp+method+requestPath+body`, headers `OK-ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE`. **3 secrets requis** : clé + secret + passphrase (le "nom de clé API" n'est PAS la passphrase).
- **Secrets Railway** : `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_API_PASSPHRASE`. Comptes lus : trading (`/api/v5/account/balance`) + funding (`/api/v5/asset/balances`), fusionnés.
- **Setup GAS** : `SET_OKX_RELAY(url, token)`, fallback relais Bybit/Binance.
- **Endpoint vide accepté** : `/okx` retourne `ok:true spot:[]` si aucun solde positif (ne throw pas), pour ne pas casser l'onglet.

## Renommage onglets CEX `CEX - ...` (2026-06-15, v4.15.98)

- **Tous les onglets CEX sont préfixés `CEX - `** : `CEX - Bitpanda Crypto/Fiat/Stocks/Commodity`, `CEX - Binance`, `CEX - Bitfinex`, `CEX - Bybit`, `CEX - Coinbase`, `CEX - OKX`.
- **Source unique** : chaque `*_SYNC_CONFIG.SHEET` (et `BITPANDA_SYNC_CONFIG.SHEETS.*`) porte le nouveau nom. Seul littéral en dur hors config : `34_TOP_MARKETCAP.gs` (`_topMcBitpandaLookupFormula_("CEX - Bitpanda Stocks", ...)`).
- **Filtres Recap inchangés** : `_isLedgerLike_` / `_wd_isCexSheet_` matchent des sous-chaînes minuscules (`bitpanda`, `binance`, `okx`...) toujours présentes dans les nouveaux noms.
- **Migration formules** : renommer un onglet via l'API Sheets (`updateSheetProperties`) réécrit AUTOMATIQUEMENT toutes les formules `Portefeuille Crypto Details` / `Action Rebalancing` qui le référencent. Aucune réécriture manuelle nécessaire (vérifié `oldRefs=0`).
- **Gotcha** : ne jamais renommer un onglet CEX sans migration coordonnée (config GAS + onglet + reconstruire cache Recap via `REFRESH_LEDGER_CACHE`).

## Refresh central CEX + queue one-shot (v4.15.114-115)

- **`CEX_HOURLY_REFRESH()`** (`35_BITPANDA_SYNC.gs`) met à jour les 6 CEX (Bitpanda/Binance/Bitfinex/Bybit/Coinbase/OKX), chaque update protégé indépendamment (un CEX en erreur ne bloque pas les autres) + retry `BUSY`.
- **Cadence 4h (v4.15.114)** : `WCORE_AUTO_HEAL` installe `CEX_HOURLY_REFRESH` en `everyHours(4)` — dernier palier GAS sous le seuil stale watchdog `WD_STALE_I1_HOURS=5h` (`everyHours` n'accepte que 1/2/4/6/8/12). Il SUPPRIME les anciens triggers horaires individuels (`UPDATE_*_SPOT`) et les watchdogs 1 min (`*_REFRESH_WATCHDOG`, tous `LEGACY_DISABLED`). Après changement de cadence, run `WCORE_CEX_TRIGGER_CLEANUP_FORCE()` une fois depuis l'éditeur (un push ne modifie PAS les triggers déjà installés).
- **Queue manuelle one-shot** : `A1` CEX / `Z1` / `AC2` -> `CEX_QUEUE_OR_MARK_MANUAL_JOB` / `_cexEnqueueManualJobs_` (enqueue BATCH : 1 écriture queue + 1 seul ensure trigger — jamais N appels par-job, sinon `MASTER_ON_EDIT` retombe à 50-75s) -> `CEX_MANUAL_REFRESH_WORKER` (**trigger récurrent `everyMinutes(1)`** v4.15.118, drain budget 3 min, lease `CEX_WORKER_LEASE` 2 min) -> statut visible `QUEUED:`/`RETRY n/2:`/`OK:`/`ERROR:`. Erreurs transitoires (`Service Spreadsheets timed out`, quota, `BUSY`) = requeue auto max 2, retry à +5s, `Utilities.sleep(2s)`. Pendant un job : `CEX_MANUAL_ACTIVE_UNTIL_MS` (90s v4.15.117) + `BaseEngine.cexBusyStatus` font retourner `[BUSY:CEX]` aux `*_REFRESH_STATUS` on-chain ; `_wd_needsRefresh_` re-pulse ces onglets (sinon gelés à jamais).
- **Checkboxes refresh (v4.15.115)** : `Action Rebalancing!Z1` -> jobs `TOP_MARKETCAP` + `BITPANDA_STOCKS_FIAT` (statut `AA1`). `Portefeuille Crypto!AC2` -> jobs `BITPANDA_CRYPTO` (crypto SEUL — ne PAS rafraîchir `CEX - Bitpanda Fiat` depuis AC2) + Binance + Bitfinex + Bybit + Coinbase + OKX (statut `AD2`).
- **Locks par connecteur** : `CEX_ACQUIRE_LOCK(name)`/`CEX_RELEASE_LOCK(name)` (lease ScriptProperties 90s). Ne pas revenir au `LockService.getScriptLock()` global (tenu par watchdog/pricing/cache -> BUSY permanent).
- **Tests de garde** : `tests/cex-refresh-load-guard.test.js` + `tests/action-rebalancing-direct-refresh.test.js` verrouillent queue/lease/batch/retry/cadence/watchdogs désactivés/onEdit no-op/trigger 1 min/BUSY:CEX re-pulse.
- **Coinbase/OKX A1 checkbox** : restaurées via `dataValidation BOOLEAN strict`. Le remplissage via API REST (service account) NE pose PAS la validation; seul `_*WriteSheet_` (GAS) ou un `setDataValidation` explicite la garantit.
- **Gotcha host OKX** : `code 50119` = mauvais host (utiliser `my.okx.com` pour comptes EEA).
- **Gotcha Bybit 401 corps vide** : `server: Openresty`, pas de `cf-ray` => rejet d'auth Bybit (clé invalide/non autorisée), PAS un géo-blocage CloudFront. Regénérer la clé Bybit EU et MAJ `BYBIT_API_KEY`/`BYBIT_API_SECRET` Railway.

## Synchronisation wcore-web

`wcore-gsheet/src/*.gs` est la source canonique des configs chaînes. Le package généré `wcore-gsheet/dist/` (`@wcore/chains`) est consommé par `wcore-web`.

**Procédure courante** :
```powershell
# Depuis wcore-gsheet
npm run validate:static
npm run build:chains
npm run test:phase3-chains
```

Ne pas copier manuellement `src/*.gs` vers un dossier `wcore-web/src/` : cette ancienne procédure est historique et crée du drift. Toute correction de config chaîne doit être faite dans `wcore-gsheet/src/*.gs`, puis extraite dans `dist/`.

## Fonctions diagnostic utiles

- `WCORE_HEALTH()` — Dashboard système (Version, CacheVersion, Modules count, Cache Guard, Quota, Dynamic RPC)
- `WCORE_VERSION_CHECK()` — Vérification versions
- `GET_QUOTA_BREAKER_STATUS()` — État réel du circuit breaker quota
- `TEST_QUOTA_NOW()` — Test réel UrlFetch/httpbin (à utiliser avec parcimonie)
- `GET_CACHE_GUARD_STATUS()` — Protection cache
- `DegradedMode.getStatus()` — Circuit breaker
- `GET_STORAGE_STATS()` — Usage stockage 500KB
- `PURGE_CHAIN_PRICES(contracts, chainSlug, gtNetwork)` — Purge prix d'un token de tous les caches
- `DIAG_*_NATIVE_PRICE()` — Test pricing par chaîne
- `DIAG_*_RPC_STATUS()` — Test RPC par chaîne
- `UPDATE_DYNAMIC_RPCS()` — MAJ RPCs dynamiques (chainlist + Cosmos registry)
- `SHOW_DYNAMIC_RPCS()` — Afficher RPCs dynamiques stockés
- `DYNAMIC_RPC_STATUS()` — Statut du store (âge, taille, compteurs)
- `CLEAR_DYNAMIC_RPCS()` — Vider le store de RPCs dynamiques

## Procédures de maintenance

### Après chaque déploiement
1. ~~Exécuter `BUILD_RPC_LOOKUP()` depuis l'éditeur GAS~~ **OPTIONNEL v4.15.42** — l'auto-heal le fait automatiquement
2. Exécuter `WCORE_AUTO_HEAL("force", true)` pour réinstaller les triggers et rebouter le RPC lookup
3. Vérifier `WCORE_AUTO_HEAL_STATUS()` : tous les triggers à 1

### En cas de saturation quota
1. NE PAS attendre une "heure de reset" : le quota est une fenêtre glissante ~24h, la récupération est progressive (~24h après le burst)
2. Le breaker se rétablit seul via test httpbin toutes les 15 min dès que Google réaccepte les appels
3. NE PAS relancer d'opérations HTTP lourdes tant que le quota est bas (ça repousse la récupération)
4. `EMERGENCY_RESET_QUOTA()` ne sert que si le breaker est un faux positif (vérifier `TEST_QUOTA_NOW` : s'il re-trippe immédiatement, le quota est réellement épuisé — attendre)
5. Vérifier `GET_QUOTA_BREAKER_STATUS()`

### En cas de cache corrompu
1. `DIAG_CACHE_INTEGRITY()` pour identifier
2. `REPAIR_DECIMALS(wallet, config, false)` pour réparer
3. `PURGE_CHAIN_PRICES(contracts, chainSlug, gtNetwork)` pour purger prix

### En cas de mise en forme cassée sur `Portefeuille Action`
1. Utiliser `REPAIR_STOCK_PORTFOLIO_FORMATS()` uniquement. Ne pas formatter manuellement une plage pendant que le filtre est actif.
2. Cause racine observée le 2026-07-13 : `SpreadsheetApp.getRange(...).setNumberFormat(...)` sous filtre actif peut laisser les lignes masquées avec des formats bruts. Quand l'utilisateur change le filtre, ces lignes réapparaissent sans `€`, `%` ou alignements cohérents.
3. Le repair v4.15.159 sauvegarde le filtre, le retire, formate toutes les lignes gérées, étend les conditional formats, puis recrée le filtre et ses critères. Les refreshs normaux `UPDATE_STOCK_PORTFOLIO()` ne doivent jamais réparer ou modifier le layout implicitement.

### Diagnostic complet
1. `WCORE_HEALTH()` — santé globale
2. `WCORE_VERSION_CHECK()` — cohérence versions
3. `DIAG_WATCHDOG()` — état watchdog
4. `GET_QUOTA_BREAKER_STATUS()` — quota HTTP réel côté breaker
5. `DYNAMIC_RPC_STATUS()` — RPCs dynamiques

## FX cascade (v4.15.50, 2026-06-17)

- **4 sources canoniques** : Frankfurter (ECB), open.er-api.com, Coinbase exchange-rates, DefiLlama EURC oracle. Toutes free, sans clé, sans auth. Frankfurter et DefiLlama EURC retournent `1 EUR = X USD` nativement → **inversés** dans le parseur pour obtenir `1 USD = X EUR` (convention `priceEur = priceUsd * fxRate`).
- **Consensus médian** : ≥3 sources → médiane (rejette outliers), 2 sources → moyenne si delta < 5% sinon throw, 1 source → retour, 0 source → **throw** explicite. **Plus aucun fallback fixe** (`0.92` supprimé). Si toutes les sources tombent, le scan throw `FX cascade: only 0 source(s) succeeded, need 1` — pas de corruption silencieuse.
- **Version stamp cross-deploy** : `FxRate._CURRENT_VERSION = "4.15.50"` stampé dans memory + L1 CacheService. Bumper la version force un fresh fetch après deploy (évite d'attendre 1h de TTL). **Bump obligatoire** à chaque changement de cascade.
- **Cross-runtime telemetry** : `FxRate._postTelemetry_(rate, results)` POST après chaque fetch réussi à `https://api-production-b5bf.up.railway.app/api/gsheet/fx-telemetry` (auth `x-gsheet-token`, `WCORE_WEB_API_URL` et `GSHEET_API_TOKEN` set par onOpen). Drift détectable via `GET /api/diag/fx-parity`. Drift > 2% = drift runtime, > 5% = bug.
- **Callers durcis** : `10_OUTPUT.gs:212`, `15_COSMOS_ENGINE.gs:113`, `FOGO.gs:110,218`, `26_OPTIMIZATIONS.gs:331` wrappent `FxRate.getUsdToEur()` en try/catch + traitent l'échec comme `null` (au lieu des fallbacks hardcodés `0.86`/`0.92` historiques). L'engine valide ensuite `isValidPositive(fxRate)` et return `null` proprement.
- **Repro du bug originel** (sans cascade) : web ETH = 1623.96 EUR (FX 0.918 stale), web WBTC = 154.05 EUR, gsheet ETH = 1539.64 EUR (FX 0.854 stale), gsheet WBTC = 142.38 EUR. Dérive 5.5% intra-runtime, 8.2% cross-runtime, **sans aucun signe visible UI**. La cascade élimine cette classe de bug.
- **Symptôme post-deploy** : après un deploy FX, les scan results cachés en `scan:v2:*` (Redis web, TTL 5min) peuvent encore utiliser l'ancien FX. ETH et WBTC scannés à des moments différents montrent des prix incohérents. Fix : `WALLET_SCAN_CACHE_VERSION` bump ou `forceRefresh=true` sur les chaînes concernées. Le cache FX lui-même est invalidé immédiatement par la version stamp.

## Gotcha CRITIQUE — triggers "présents mais mal autorisés" (freeze 2026-06-01, v4.15.61)

- **Symptôme** : tous les B1/I1/J1 gelés à une date passée (ex: 31/05) alors qu'on est plus tard (01/06). La page **Exécutions** de l'éditeur GAS montre pourtant les triggers (`WATCHDOG_FROM_RECAP`, `SYNC_J1_ALL_SHEETS`, `ACTIVITY_WATCHDOG`...) qui s'exécutent normalement avec état **"Terminée"** et 0% d'erreur. Les @customfunction (A1, IS_WCORE_SAFE, GET_QUOTA_BREAKER_STATUS) fonctionnent. Le cache, le quota et le code sont sains.
- **Cause racine** : après plusieurs `clasp push` rapprochés (qui modifient le code), les **triggers déjà installés tournent sous une autorisation OAuth périmée**. En **contexte trigger** (PAS en @customfunction), `SpreadsheetApp.openById()` ET le service avancé `Sheets` échouent → le watchdog ne peut ni lire ni écrire la spreadsheet → B1/I1/J1 jamais mis à jour. Le trigger "réussit" (return silencieux) donc apparaît "Terminée".
- **Preuve / diagnostic** : lire le ScriptProperty `WCORE_WD_LAST_DIAG` via la customfunction `=WCORE_WD_LAST_DIAG_READ()` (13B_DIAG_RPC.gs) dans une cellule scratch (ex: `Recap Chain!CP202`, hors zone visible). Si on y voit `mode:"SHEETS_API_NO_ACTIVE_SPREADSHEET"`, `error:"Advanced Sheets service unavailable"`, `N:0` → c'est ce bug. Le stack pointe `_wd_watchdogFromRecapViaSheetsApi_ (16_REFRESH:148)` ← `WATCHDOG_FROM_RECAP (16_REFRESH:787)` ← `_wcoreGetSpreadsheet_()` a retourné null.
- **Piège supplémentaire** : `_WD_DIAG!A3` (bloc diag du chemin A) utilise `SpreadsheetApp.getActiveSpreadsheet()` directement (null en trigger) → A3 reste figé même quand le watchdog tourne. NE PAS conclure à partir de A3 ; utiliser `WCORE_WD_LAST_DIAG_READ()` (ScriptProperty, écrit dans les deux chemins).
- **Angle mort de l'auto-heal (avant v4.15.61)** : `_wcoreAutoHealEnsureTriggers_` jugeait les triggers "OK" car présents (`count=1`), sans détecter qu'ils étaient mal autorisés. Un trigger `count=1` peut être (1) mort/silencieux OU (2) vivant mais sous autorisation périmée — `count` ne distingue ni l'un ni l'autre.
- **Fix immédiat** : exécuter **`WCORE_AUTO_HEAL_FORCE()` UNE FOIS depuis l'éditeur Apps Script** (contexte avec autorisation fraîche — peut déclencher un dialogue "Autoriser" à valider). Le delete+recreate des triggers les **réautorise**. Déblocage immédiat : I1 repasse à 120/120 à la date du jour, J1 suit, B1 se débloque par batchs (probe ~20/run + cooldown). Via Chrome CDP : `node scripts/run-gas-function.js WCORE_AUTO_HEAL_FORCE` (script lent ~75s+ à cause du chargement éditeur ; le dialogue d'autorisation peut nécessiter un clic utilisateur).
- **Fix permanent (v4.15.61)** : (1) `_wcoreGetSpreadsheet_()` (16_REFRESH.gs) logge désormais l'échec `openById` dans `WCORE_SS_OPEN_ERR` au lieu d'avaler l'exception. (2) `_wcoreAutoHealEnsureTriggers_` (16B_AUTO_HEAL.gs) **sonde l'accès spreadsheet réel** (`_wcoreGetSpreadsheet_()`) et force la réinstallation des triggers si l'accès échoue (`ssAccessOk=false`), détectant le cas "présent mais mal autorisé". Trigger spec bumpé à `v4.15.61:...:ssAccessProbe`.
- **`clasp run` ne pouvait PAS servir ici non plus** : déploiement EXECUTION_API cassé (voir gotcha ci-dessous). La seule voie d'exécution de `WCORE_AUTO_HEAL_FORCE` est l'éditeur GAS (CDP ou manuel).
- **Prévention** : après une rafale de `clasp push`, exécuter `WCORE_AUTO_HEAL_FORCE()` depuis l'éditeur pour réautoriser proprement les triggers, OU laisser v4.15.61 le détecter au prochain cycle d'auto-heal.
- **Fix permanent self-heal (v4.15.103, 2026-06-29 — MIS À JOUR v4.15.113)** : `_bpEnsureCexTriggers_()` dans `35_BITPANDA_SYNC.gs` **delete + recreate** les triggers CEX (fresh auth). Depuis v4.15.113 : ne gère plus que `CEX_HOURLY_REFRESH` (4h) et SUPPRIME les watchdogs legacy (`BITPANDA/BINANCE/BITFINEX/BYBIT_REFRESH_WATCHDOG`). Il n'est PLUS appelé depuis les `*_ON_EDIT` (trop lent pendant un clic — un `getProjectTriggers`+delete+create coûte 2-5s; test de garde l'interdit) : uniquement via `BP_REINSTALL_CEX_TRIGGERS()` ou `WCORE_CEX_TRIGGER_CLEANUP_FORCE()` depuis l'éditeur. Le principe delete+recreate (un trigger `count=1` n'est pas garanti vivant) reste valable.
- **GAS restriction cadences** : `everyMinutes` n'accepte que `{1, 5, 10, 15, 30}`; `everyHours` que `{1, 2, 4, 6, 8, 12}` — 5h exact impossible, d'où le choix 4h pour les CEX (table `_BP_CEX_TRIGGERS_TO_HEAL` distingue `unit: "minutes"` vs `unit: "hours"`).

## Gotchas déploiement (session 2026-05-31)

- **`clasp run` IMPOSSIBLE à utiliser de façon fiable avec les tokens actuels — vérifier via service-account sur la spreadsheet** : après un `clasp push`, `clasp run FONCTION` (CLI) retourne `Script function not found. Please make sure script is deployed as API executable`, surtout pour une fonction nouvellement ajoutée (ex: `DIAG_OUTPUT_SNAPSHOT_STATS`). Le projet n'a **aucun déploiement EXECUTION_API actif**, et AUCUNE combinaison de tokens disponibles ne permet d'en créer un :
  - CLI `clasp deploy` / `clasp deployments` avec le token push (`1072944905499`) → `Insufficient Permission` (le client OAuth n'est pas autorisé pour le management REST côté GCP).
  - REST `POST /v1/projects/{SID}/versions` ou `/deployments` avec le token run (`652188583224`, scope `script.scriptapp`) → `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT`.
  - REST `POST /v1/scripts/{SID}:run` avec `devMode:true` (token run) → `404 NOT_FOUND` (Requested entity was not found — pas de déploiement EXECUTION_API).
  - **Conclusion** : ne PAS perdre de temps à essayer de faire marcher `clasp run` après un changement de code. Le runtime réel des utilisateurs (triggers + @customfunction dans Sheets) utilise HEAD et n'est JAMAIS affecté. Pour **vérifier** une fonction/diagnostic en live, lire directement le résultat sur la spreadsheet via le service-account gsheets (`Recap Chain`, cellules I1/J1, onglets Ledger) — c'est la seule voie fiable et sans quota supplémentaire. SID = `1I_GcliVEAHnWrV3R3j2ONntRwHh9-ebW4sSPXapJi3CxoR_qgvYxi2cw`.
- **Conflit tokens push vs run dans `.clasprc.json`** : `clasp push` exige le token client `1072944905499-...` (scopes `script.projects`/`script.deployments`, via `scripts/clasp-login-full.js`). `clasp run` exige le token wcore-mcp `652188583224-...` (scope `script.scriptapp`, via `scripts/oauth-auto.js`). Les deux écrasent le MÊME fichier `~/.clasprc.json`. Conséquence : enchaîner push puis run sans re-login échoue (`Insufficient Permission` au push si token=run ; `Script function not found`/`Unable to run` au run si token=push). **Toujours re-login avant de switcher d'opération.**
- **Port 8888 EADDRINUSE** : `scripts/oauth-auto.js` et `scripts/clasp-login-full.js` ouvrent un serveur redirect sur `:8888`. Si un run précédent a laissé un process zombie, le suivant crash `listen EADDRINUSE`. Fix : `Get-NetTCPConnection -LocalPort 8888 | Stop-Process -Id {OwningProcess} -Force` avant relance.
- **`.temp_push` verrouillé** : `safe-push.ps1` peut échouer au cleanup (`fichier en cours d'utilisation`) si un push précédent a crashé en plein milieu. Fix : `Remove-Item .temp_push -Recurse -Force` (ou `fs.rmSync`) avant relance.
- **Vérifier les edits AVANT de pusher** : des edits `Edit` peuvent échouer silencieusement (oldString ne matche pas exactement à cause d'indentation/whitespace) tout en laissant croire au succès si on ne revérifie pas. Lors de cette session, OUTPUT_VERSION et la fonction DIAG n'avaient PAS été appliqués au 1er push v4.15.60 → re-push nécessaire. Toujours `Read` le fichier réel après edit, et NE PAS valider via `node -e` avec regex contenant `\"` sous PowerShell (l'échappement casse). Utiliser un script `.js` ou `String.fromCharCode(34)`.

## Nouveautés v4.15.59 / v4.15.60

### OutputSnapshotCache — préservation d'affichage en BLOCKED:QUOTA (10_OUTPUT.gs, 11/14/15 engines)

- **Problème** : pendant un quota UrlFetch épuisé (breaker tripped), si `WalletCache.load()` retourne null (packed cache absent/réduit), `CACHED_WALLET_ASSETS_*` (A1) pouvait afficher `NO_CACHE_WAITING_REFRESH` — sortie vide alors qu'un affichage utilisable existait avant. Le latch J1 seul ne suffit pas : Google Sheets peut réexécuter A1 à arguments identiques après push/redeploy.
- **Fix** : `OutputSnapshotCache` (10_OUTPUT.gs) stocke la dernière sortie valide dans `ScriptProperties` sous `OUTSNAP_<hash>` (hash chain|wallet), **séparé** de `GLOBAL_WALLET_CACHE_V1`. `MAX_BYTES=30000`. Refuse de sauvegarder une sortie contenant `NO_CACHE_WAITING_REFRESH` ou `[NO_CACHE]`.
- **Wiring** : EVM/SVM/Cosmos `getCachedWalletAssets` → `save()` sur sorties valides ; si `WalletCache.load()==null` ET système bloqué (breaker/DegradedMode/quota) → `load()` sert le snapshot + ajoute `INFO_SNAPSHOT` (age_h, reason) et `META snapshot_ts`. Sinon seulement → `NO_CACHE_WAITING_REFRESH`.
- **`pruneHttpCounters_()`** supprime les vieux `WCORE_HTTP_*` avant d'écrire un snapshot pour réduire la pression ScriptProperties.
- **WCORE_HEALTH breaker priority (01_INIT.gs)** : `WCORE_HEALTH` lit désormais `QuotaCircuitBreaker.isTripped()` en priorité → `WARN BREAKER TRIPPED` au lieu du faux `OK` (bug v4.15.57/58 où Quota Status affichait `OK` malgré breaker tripped).
- **DIAG_OUTPUT_SNAPSHOT_STATS() (v4.15.60)** : compte les snapshots `OUTSNAP_*` (count, bytes, oldest/newest age) **sans consommer de quota HTTP** (`NO_HTTP`).
- **Limite** : les snapshots ne restaurent pas rétroactivement les sorties déjà perdues ; ils protègent les sorties futures/encore valides. Tant que le quota est tripped, l'affichage attendu sur `Recap Chain` est `[BLOCKED:QUOTA]` (pas vide) — c'est l'invariant correct.

## Nouveautés v4.15.51

### J1 latch self-healing (16_REFRESH.gs, 16B_AUTO_HEAL.gs, 27_ACTIVITY_REFRESH.gs)

- **Gotcha critique — affichage gelé sans perte de cache** : `CACHED_WALLET_ASSETS_*` (cellule A1) ne se recalcule QUE quand **J1 change** (latch volontaire anti-quota). Si le trigger `SYNC_J1_ALL_SHEETS` (everyMinutes 5) est présent (`count=1`) mais **cesse silencieusement de tourner** (GAS arrête parfois les time-triggers sans erreur visible), J1 gèle → A1 reste figé sur sa dernière évaluation. Si cette évaluation datait d'une période cache-vide, on voit `NO_CACHE_WAITING_REFRESH` **partout alors que le cache est sain**. Diagnostic : comparer I1 (Recap col F) vs J1 (col G) ; si I1 frais et J1 vieux → latch gelé, PAS perte de cache. Vérifier `GET_STORAGE_STATS` (GLOBAL_WALLET_CACHE_V1 présent) + `DIAG_*_CACHE` (Found) avant de conclure à une perte.
- **Fix immédiat** : pulser J1=I1 sur les sheets stale (le service account gsheets a le scope `spreadsheets`). Voir `scripts/j1-sync.js`. Déclenche un thundering-herd de recalc (~119 sheets) — les lectures API timeout pendant quelques minutes, c'est normal.
- **Garde-fou 3 couches (v4.15.51)** : (1) `SYNC_J1_ALL_SHEETS()` appelé en TÊTE d'`ACTIVITY_WATCHDOG` (avant le scan lourd) → un timeout watchdog ne saute plus le latch. (2) `_wcoreAutoHealJ1Staleness_` (16B_AUTO_HEAL.gs) détecte un écart I1/J1 > 30 min sur ≥10 sheets, force un sync ET **ressuscite le trigger** (delete+recreate réveille un time-trigger mort) — `count=1` ne suffit PAS à prouver qu'un trigger tourne. (3) `SYNC_J1_MAX_SYNCS_PER_RUN=20` était de toute façon **non utilisé** (la fonction traite déjà tous les sheets/run).
- **Note** : un trigger GAS `count=1` peut être mort. La détection par count (`_wcoreAutoHealCountHandlers_`) ne détecte PAS un trigger qui ne fire plus. Seule la détection de staleness des effets (J1 gelé) le révèle.

## Nouveautés v4.15.50

### RPC Resilience (05_RPC.gs, 33_DYNAMIC_RPC.gs, 08_ASSETS.gs, 10A_BASE_ENGINE.gs, engines)

- **Fallback Blockscout générique** : `_deriveBlockscoutRpc(config)` (05_RPC.gs) dérive un proxy JSON-RPC en dernier recours. Priorité : (1) `config.RPC.BLOCKSCOUT_RPC` explicite, (2) auto-dérivation `{ACTIVITY_EXPLORER.BASE_URL}/api/eth-rpc` si `TYPE==="blockscout"`. Injecté en fin de liste dans `_getDynamicRpcsMerged` (jamais prioritaire sur un vrai RPC sain). CAMP utilise `RPC.BLOCKSCOUT_RPC`, RACE via auto-dérivation.
- **Hack RACE supprimé** : `_RACE_blockscoutNativeFallback_` (~90 lignes chain-specific) remplacé par le système générique. RACE fait maintenant consensus avec ses 2 RPCs + racescan.io.
- **Sonde cold-start** : `BalanceFetcher._coldStartProbeIfNeeded` (08_ASSETS.gs). Quand AUCUN candidat n'a de health data, sonde `eth_blockNumber` en parallèle pour éliminer les RPCs morts AVANT la sélection consensus. Corrige le bug où des RPCs cassés (404/403) paraissent sains au cold-start et squattent les 3 slots (`maxRpcs`), excluant un RPC sain en position 4+ (cas CORN). Une fois par exécution par chaîne.
- **Busy-guard anti-#ERROR!** : `BaseEngine.isBusy(config)` + garde en tête de `getRefreshStatus` (EVM/SVM/Cosmos). Si le système est sous charge (circuit breaker quota / DegradedMode / quota épuisé) et `forceFull=false`, retourne `[BUSY] <ts cache>` au lieu de risquer le timeout 30s GAS. Bypassé par C1=TRUE.

**Gotcha critique** : tous les proxies Blockscout ne servent PAS `eth_chainId`. `racescan.io/api/eth-rpc` retourne `result:null` sur `eth_chainId` mais sert correctement `eth_getBalance`/`eth_blockNumber`. C'est pourquoi la sonde cold-start ET le health-check (`DIAG_CHAIN_RPC_TEST` 13B_DIAG_RPC.gs) utilisent `eth_blockNumber` (et acceptent un RPC vivant via blockNumber même si chainId échoue). Ne JAMAIS sonder un RPC uniquement via `eth_chainId`.

## Nouveautés v4.15.49

### Multicall3 Transport (05_RPC.gs, 09_SIMPLE_ROTATION.gs, 11_EVM_ENGINE.gs)

- **Primitive Multicall3** dans `05_RPC.gs` : `Multicall3.encodeTryAggregate()`, `decodeTryAggregateResult()`, `Multicall3.call()`, `RpcClient.multicall3()`.
- Adresse CREATE2 `0xcA11bde05977b3631167028862bE2a173976CA11` (identique sur 200+ EVM chains).
- **`_scanBatch()`** tente `Multicall3` avant le batch JSON-RPC existant. Fallback automatique vers le batch/chunk/individual si échec ou désactivé.
- **`config.RPC.DISABLE_MULTICALL3`** désactive par chaîne.
- Compteurs `mc3:used/fallback` dans `INFO_NATIVE` pour diagnostic.

### STRICT_TOKEN_RANGE - I2:I devient whitelist stricte

- **`config.FLAGS.STRICT_TOKEN_RANGE = true`** (activé par défaut dans `11_EVM_ENGINE.gs DEFAULT_CONFIG`).
- `ContractListBuilder.build()` (06_TOKENS.gs) : si un `I2:I` est fourni et `STRICT_TOKEN_RANGE=true`, il n'ajoute **plus** les assets en cache ni les `KNOWN_TOKENS`. Seul `I2:I` définit la liste.
- **EVM Engine** (11_EVM_ENGINE.gs) : après `ContractListBuilder.build()`, nettoie `assetByKey` et `cache.assets` des tokens absents de la whitelist. `native` toujours préservé (`sak !== "native"`).
- **WalletCache merge** (04C_CACHE_GLOBAL.gs) : respecte `walletCache.strictTokenSet` lors de la fusion cache → pas de résurrection des tokens retirés de `I2:I`.
- **Impact** : retirer un contrat de `I2:I` + rafraîchir (C1=TRUE ou B1 pulse) le fait disparaître de la sortie, même s'il a une balance on-chain positive. Le token n'est pas perdu — il réapparaît si remis dans `I2:I`.

### clamp run sous PowerShell

- **Paramètres JSON échappés** requis : `$p='[\"addr\",\"\",\"I2:I\",true,\"manual\"]'; npx @google/clasp run FONCTION -p $p`.
- Sans backslash-quotes, PowerShell/clasp casse le JSON.

## Nouveautés v4.15.31

### Fix priorité prix live (07_PRICES.gs)

- **Problème** : `PriceManager.computePriceEur` lisait le cache EUR frais **avant** les prix `priceUsdMap` live du cycle. Un cache empoisonné (prix incorrect mais TTL encore valide) bloquait les corrections automatiques.
- **Symptômes** : Base BONSAI/CREATE, BSC BTCB/OWL — prix totalement faux persistant malgré des sources live correctes.
- **Fix (v4.15.31)** : insertion d'un bloc live `priceUsdMap` **avant** la lecture du cache EUR. Le cache reste en fallback si le live n'a pas de prix du tout.
- **Impact** : les prix live GT/Llama/Dex de chaque cycle peuvent guérir un cache EUR empoisonné sans nécessiter de purge manuelle ni de forceFull.
- **Fichier** : `src/07_PRICES.gs:2551-2570`.

### Mapping contrat BSC OWL (BSC.gs)

- **Problème** : le token OWL (`0x51e667e91b4b8cb8e6e0528757f248406bd34b57`) sur BSC n'avait pas de mapping contrat DefiLlama explicite → prix live jamais résolu → cache stale à 0.09 €/token.
- **Fix** : ajout `LLAMA_CONTRACT_MAP: { "0x51e...": "bsc:0x51e..." }` dans `BSC.gs`.
- **Prix réel** (DefiLlama/GT) : ~0.0012 USD → ~0.0011 EUR.

## Nouveautés wcore-web — alignment v4.15.31

### strictTokens mode (/api/scan)

- `strictTokens: true` dans le body → le moteur EVM ne scanne/pricera que les `customTokens` fournis, sans discovery registry/explorer/logs.
- Équivalent de `STRICT_TOKEN_RANGE` côté `wcore-gsheet`.
- Activé pour `/api/scan`, `/api/scan/batch`, et `/api/scan/async`.
- **Schéma** : `apps/api/src/schemas.ts` — champ `strictTokens` optionnel dans `ScanRequestBodySchema` + `BatchScanRequestBodySchema`.

### forceRefresh skip stale price cache

- `forceRefresh: true` bypass désormais le cache prix, sauf pour les tokens dont le scan courant vient d'écrire un prix bulk live (GT/Llama batch prefetch).
- **Fichiers** : `packages/core/src/engines/evm-scan.ts` (livePrefetchedPriceContracts), `evm-pricing.ts` (paramètre skipCache), `evm-batch.ts`.
- **Gotcha** : sans le tracking `livePrefetchedPriceContracts`, forceRefresh bypassait aussi les prix GT bulk fraîchement récupérés → la cascade tombait sur onchain-v3/CoinGecko avec des prix moins fiables.

### Micro-prix token — roundPrice (1e-12) vs roundMoney (cents)

- `priceEur` utilise désormais `roundPrice` (précision 1e-12) pour éviter d'afficher `0` pour des tokens à très petite valeur unitaire.
- `valueEur` reste en `roundMoney` (centimes), l'impact monétaire réel.
- **Fichier** : `packages/core/src/engines/evm-pricing.ts` — fonction `roundPrice`.

### Exclusion *.test.ts du build core

- `packages/core/tsconfig.json` exclut `src/**/*.test.ts` du build production.
- Sans cette exclusion, un doublon d'import dans un fichier de test bloque tout le build Docker Railway.

### Gnosis RealToken dans I2:I

- 9 contrats RealToken ajoutés dans `I2:I5:I13` de `Ledger - Gnosis` (ex: Vervana, 11222 E 7 Mile, 11300 E 7 Mile, 11766 College, etc.).
- Les formules `H3:H15` mises à jour pour whitelister ces contrats dans le OR de vérification.
- **Prix** : le premier cycle forceFull a détecté les balances mais pas les prix (`cycle:partial price_missing:9`). Les prix se résolvent sur les cycles watchdog suivants via l'API `realtoken.community`.
- **Total estimé** : ~1083 € (web total clean Gnosis = 1088.14 €, final avant ajout = 4.58 €).

### Faux positifs — tokens à prix gonflés

- **Scroll** : `ethscroll` (`0x94b5...`) — balance 1, prix web 1653 € → non compté dans le clean total web (écart final/web = 0.20 € seulement).
- **World Chain** : Ramen, SATOSHI, ROBIN, Moon, PIZZA — prix web gonflés (6-138 €/token) → non comptés dans le clean total web (écart = 0.27 €).
- **Règle** : un token absent de `I2:I` dont la valeur dépasse largement l'écart web−final est un faux positif scam/prix. Ne jamais l'ajouter sans vérification externe.


## clasp MCP + Blockchain RPC MCP

Deux MCPs custom wrappers locaux dans `.mcp/`.

### clasp-mcp (`.mcp/clasp-mcp.js`)
Push/pull/deploy .gs files.
- Tools : `clasp_status`, `clasp_push`, `clasp_pull`, `clasp_deploy`, `clasp_logs`, `clasp_run`, `clasp_version`
- **Toujours `clasp_status` avant `clasp_push`**
- **Ne jamais push si `src/` a des changements non committés** — `git status` d'abord
- Rappel : `.clasp.json` `rootDir` doit être `"src"` pour push, puis remettre `"."` après

### rpc-mcp (`.mcp/rpc-mcp.js`)
Debug RPC responses multi-chain.
- **Auto-discovery au boot** : parse `src/*.gs` → toutes les chaînes actives
- Tools : `rpc_call`, `rpc_get_balance`, `rpc_get_token_balance`, `rpc_call_price`, `rpc_validate_endpoint`, `rpc_consensus_check`, `rpc_chain_list`
- **`rpc_consensus_check`** reproduit la règle WCORE `votes*2 > total`

## DefiLlama MCP — Cascade Pricing Validation

`defillama-mcp` (`.mcp/defillama-mcp.js`) — wrapper local.

### Tools
- `llama_get_price(coins[])` — prix courant, format `chain:address` ou `coingecko:id`
- `llama_get_price_historical(coins[], timestamp)` — prix historique
- `llama_search_token(query)` — résoudre symbole/nom → adresse
- `llama_validate_cascade(token, chain, gtNetwork?)` — simule DefiLlama → DexScreener → GT
- `llama_batch_prices(tokens[])` — batch en 1 appel HTTP
- `llama_quota_status()` — compteur du jour par host

### Workflow debug pricing
1. `llama_validate_cascade(token, chain)` → identifier source échouée
2. `llama_get_price(coins[])` → vérifier valeur brute
3. Si DefiLlama OK mais WCORE faux → bug parsing dans `07_PRICES.gs`
4. Si DefiLlama KO → fallback attendu (DexScreener → GT)

## CoinGecko MCP — Cascade Fallback Validation

`coingecko-mcp` (`.mcp/coingecko-mcp.js`) — wrapper local.

### Position dans la cascade WCORE
Stablecoins → Cache → DefiLlama → DexScreener → GT Try1/2/3 → Jupiter (SVM) → [CoinGecko, dernier recours]

### Tools
- `gecko_ping()` — health check
- `gecko_get_price(ids[], vs_currencies?)` — par CG id
- `gecko_search_coin(query)` — résoudre symbole → CG id
- `gecko_get_contract_price(chain, contract_address)` — lookup par contrat
- `gecko_validate_cascade_fallback(chain, address)` — simule GT → Jupiter → CG
- `gecko_batch_prices(tokens[])` — batch groupé par chaîne
- `gecko_quota_status()` — compteurs + buckets per-minute

### Règles
- **Quota free tier** : 30 calls/min sans clé
- **Pro tier** : set `COINGECKO_API_KEY` → auto-routé vers pro-api
- **Batch** : toujours `gecko_batch_prices` pour multi-tokens
- **Jamais deviner un CG id** : `gecko_search_coin(symbol)` avant `gecko_get_price(ids)`
