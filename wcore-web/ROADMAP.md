# WCORE Web ÔÇö Roadmap migration

Document unique de suivi de la migration de WCORE (Google Apps Script) vers une application web moderne.

> **├Ç lire en priorit├®** quand tu reviens sur le projet : ce fichier dit o├╣ on en est, ce qui suit, et les d├®cisions prises.

## Sources documentaires actuelles

- **Source d'├®tat courant** : `ROADMAP.md`.
- **Changements release** : `CHANGELOG.md`.
- **Setup / pr├®sentation** : `README.md`.
- **D├®ploiement / op├®rations** : `DEPLOY.md`.
- **R├¿gles agent / gotchas** : `AGENTS.md`.
- **Audit courant** : `docs/AUDIT.md` (vérifié le 2026-07-10; les anciens rapports datés vivent dans l'historique Git).
- **FX cascade** : `docs/fx-cascade.md` (4 sources + m├®diane, cross-runtime drift detector).
- **Archives historiques** : `docs/archive/`. Ces fichiers ne sont plus source d'├®tat courant ; consulter d'abord cette roadmap avant de reprendre une action ancienne.

## Audit courant - 2026-07-10

- Audit Web vérifié : `docs/AUDIT.md`.
- Audit transversal Web + GSheet : `../docs/AUDIT.md`.
- Priorités immédiates : conversion USD/EUR CEX, endpoint pricing CEX, migrations Prisma, CI racine, SSRF/jobs async, fiabilité GM/CEX frontend.
- Baseline : core 284/284, shared 17/17, Web 129 tests passants et 6 tests non hermétiques faute d'API locale; typecheck vert; lint rouge à 19 erreurs.
- Convention de couverture : **183 configurations suivies**; le nombre actif/scannable vient de `/api/chains`.

---

## Etat courant : v0.3.3 - Kraken CEX + DeFi positions + pricing fixes (2026-07-05)

### Session 2026-07-17 - Rafraichissement CEX Web fiabilise

- **Acces direct `/wallet`** : `useCexHoldings` charge les comptes, synchronise chacun d'eux, puis recharge les holdings frais. Les comptes vides restent presents et refreshables; le double sync historique de `/home` est supprime.
- **Mode degrade et isolation** : tout non-2xx ou rejet reseau conserve le snapshot precedent avec marqueur stale. Les syncs utilisent `Promise.allSettled`; les identifiants de session et de requete bloquent les reponses obsoletes et les fuites inter-session.
- **Refresh global borne** : `Refresh All` pilote les scans on-chain et CEX avec un etat reel, interdit les clics concurrents et applique un timeout de 30 s aux requetes CEX et aux metadonnees `/api/chains`, corps HTTP inclus.
- **Validation** : tests Web cibles ajoutes pour comptes vides, ordre sync/reload, non-2xx, rejet reseau, timeout avant reponse et corps bloque, ainsi que garde inter-session. Deploiement Web a attester apres validation finale.

### Session 2026-07-17 — Market Cap en production + cycle X termine

- **Pages Market Cap en production** : `/cmc/crypto` et `/cmc/stocks` exposent chacune 5 000 lignes avec logos, pays pour les actions, recherche, pagination de 100 lignes et statut fresh/stale. La sidebar place les deux pages apres History. CI GitHub verte (`29563848901`) et Web Railway redeploye (`391f780d-124b-4b21-90db-81b4a9148787`).
- **Post X Market Cap** : publie `https://x.com/WCORExyz/status/2078069673707348415`. Image finale `apps/web/public/wcore-post-market-cap.svg` + `.png` en 1200x675, generee par `scripts/build-post-market-cap.cjs`. Les captures Crypto et Stock affichent quatre rangs, avec contours lime et bleu visibles et arrondis, sans badges redondants.
- **Cycle X interaction** : trois replies approuvees, publiees et verifiees sur `strivex_`, `DeFiDegen_0x` et `MARCELLUScryp`. Angles : market cap vs qualite, distinction equity/token market cap, emissions/unlocks et risque de dilution. Aucun like, follow ou autre engagement automatique.
- **Nettoyage** : processus de brouillon X arrete, branche `feature/market-cap-x-cycle` supprimee apres fast-forward sur `master`, et dossier worktree orphelin retire. Aucun worktree ne doit etre recree pour ce projet.

### Session 2026-07-17 — DeFi Position Engine V1 en production

- **Couverture ciblee** : wording public `Selected DeFi positions`; V1 couvre des positions Compound V3, WCT, Chainbase et des actifs stakes selectionnes. Les LP, vaults et protocoles supplementaires restent du scope futur, pas une couverture actuelle implicite.
- **Finalisation Web + GSheet** : `/api/scan/batch` applique maintenant la meme finalisation que GSheet: suffixes `[Flex]`/`[Lock]`, pricing miroir, labels lisibles et dette signee. Le flag `DEFI` traverse l'API et fait autorite pour l'agregation API et le rendu TokenTable. L'agregation frontend wallet appelle encore `detectScam`; les lignes Optimism officielles actuelles y restent propres via l'allowlist de contrats proteges. Les totaux nets signes sont conserves et un `NO_PRICE` long-tail ne degrade pas le scan.
- **Compound V3 corrige** : discovery une seule fois par batch EVM; `collateralBalanceOf(user, asset)` cible le Comet, tandis que le contrat collatéral sert au pricing, logo et contrat de sortie. Les decimales viennent de `AssetInfo.scale`. Fixes `6accdda1` et `95b91591`.
- **Deploiement final sequentiel** : API Railway `81f8df8f-b6a9-45ba-8aed-81070a70bc2f`; Web Railway `58cbefc7-c45d-4804-9b53-2e4e815bc44b`. Aucun nouveau `clasp push` pour ce fix Web final.
- **Validation live** : smoke Optimism `/api/scan/batch` avec `forceRefresh=true`: `degraded=false`, `errors=[]`; WCT Claimable `[Flex]` `0,47 EUR`, WCT Stake `[Flex]` `2,61 EUR`, Comp wrsETH `[Flex]` `12,69 EUR`, Comp WETH Borrow `[Flex]` `-10,21 EUR`, total net signe `10,43 EUR`.

### Session 2026-07-07 — Cycle X read-only + post "Read first. Sign later."

- **Cycle X interaction** : scan read-only via Chrome CDP 9224, cibles filtrees contre shill cache/doublons WCORE. 3 replies publiees et verifiees : approvals/read-only (`aisama_code`), public API/private key (`NintondoWallet`), fake portfolio balance scam (`GardenGnomeCoin`). Angles propres : separation read vs sign, seed/private key jamais necessaire pour lire, clean total contre spam-token value.
- **X post concept `wcore-post-read-first-sign-later`** : publie `https://x.com/WCORExyz/status/2074361865904283858`. Texte : `Read first. Sign later.` / balance publique / token value pas toujours liquide / approvals = risque / no seed phrase / no forced wallet connect / no fake total. Image : `apps/web/public/wcore-post-read-first-sign-later.svg` + `.png` en **3200x1800**, generee par `scripts/build-post-read-first-sign-later.cjs`. DA v12 concept post : deux colonnes equilibrees, badge WCORE, pill `READ-ONLY FIRST`, carte `WHAT CAN BE READ SAFELY`, panneau `VISIBILITY LAYER`, raw value barre vs clean value, footer `wcore.xyz`.
- **Fichiers marketing** : `.gitignore` ajoute des exceptions ciblees pour tracker le script builder et le PNG final haute resolution. Le PNG est volontairement 3200x1800 (pattern `wcore-post-beyond-crypto`) pour limiter la compression X sur les textes fins.

### Session 2026-07-06 — Alignement chain count 183 + X post "Beyond crypto" + vision By Asset Class

- **Chain count 174 → 183 partout (web)** : le registre `wcore-gsheet/dist/chains/` contient désormais **183 fichiers de chaîne** (Robinhood Chain ajouté). Le hardcode `174` (ancien "182 total − 8 disabled") était périmé de toute façon. Corrigé dans 6 fichiers : `app/page.tsx` (×2 : sous-titre + MiniCard), `app/HomePageClient.tsx`, `app/about/page.tsx`, `components/SidebarLayout.tsx`, `components/WelcomeModal.tsx` (share text), + asset `public/wcore-banner.svg` (PNG re-render via sharp). Note sémantique : 8 chaînes sans RPC live restent auto-skippées au scan (≈175 actives), mais le chiffre "chains tracked" affiché = compte du registre = **183**, aligné sur le post Robinhood du 2026-07-05.
- **X post `wcore-post-beyond-crypto`** : nouvel angle patrimonial (**Crypto + Stocks + Commodities + Fiat**) pour éviter la redite avec `one-portfolio` / `multichain-map` / `six-cex-live`. SVG sur le vrai gabarit DA (1200×675, Inter, gradients lime, logo pill, badge `7 CEX · 183 CHAINS`, footer `wcore.xyz`, barre lime en bas). Copy "one view" (pas "sheet" : c'est bien le web app qui folde les 7 CEX + stocks/commodities Bitpanda dans la même vue portfolio, cf. `about/page.tsx`). Publié : `https://x.com/WCORExyz/status/2074205697927946455`.
- **Roadmap** : nouvelle vision UI ajoutée en §10.6 — vue **`By Asset Class`** (répartition crypto/stocks/commodities/fiat sur `/wallet/`, réutilise le champ `bucket` de `CexHolding` déjà présent).

### Session 2026-07-05 — Kraken 7e CEX, Robinhood Chain GM, parity GSheet/Web

- **Kraken CEX (7e source)** : intégration complète (types, normalizer `krakenCanonicalSymbol`, API plugin `fetchKrakenRows`, form, tests). Signature HMAC-SHA512, nonce microsecondes + compteur. Endpoint `/0/private/Balance`. Filtre fiat Z-prefix (`ZUSD→USD`, `ZEUR→EUR`...). Les 3-char tokens (ADA, DOT, SOL) ne sont plus filtrés. **23 files** modifiés : `cex.ts`, `normalizers.ts`, `schemas.ts`, `cex-display.ts`, `CexAccounts.tsx`, `ChainCard.tsx`, `ChainIcon.tsx`, `explorers.ts`, `wagmi.ts`, `useCexHoldings.ts`, etc.
- **Robinhood Chain GM** : factory `0xbC1753...`, wagmi chainId `4663`, icône, gm-chains label, chain-native-symbols. X post publié `https://x.com/WCORExyz/status/2073...` avec tag `@RobinhoodCrypto`.
- **Pricing CEX provider-first** : `priceCexRowsForTest` donne priorité au ticker fournisseur (`quoteEur`) sur DefiLlama. BCPEUR (cash Bitpanda titres) reclassé fiat. Stocks pricés en premier via relay Yahoo, jamais en crypto (homonymes CVX, MC, ACN, WMT...). Tests normalizers : 24/24.
- **Relay stocks fixes** : TM → `7203.T` (action Tokyo, pas ADR US 10×), SSU/SMSN ×25 (receipt Samsung, pas ÷25), ROG → `ROG.SW` (Roche, pas Rogers Corp). Stock candidates ne fallbackent plus vers le symbole brut si un mapping explicite existe.
- **DeFi position badge web** : `TokenTable.tsx` affiche un badge bleu `DeFi` sur les tokens staked/locked/flex. Détection regex-based : noms avec `[Flex]`/`[Lock]`, `Staked *`, `staking`, `liquid staking`, `receipt`, symboles `sXxx`+staking, `C-*`+staking/airdrop.
- **sKAITO DeFi registry** : ajouté dans `defi/registry.ts` (`[Flex]`, pricing mirror KAITO). Documentation complète du moteur DeFi : `docs/defi-position-engine.md` (architecture, 3 mécanismes de détection, checklist ajout).
- **Parity script** : `scripts/parity-gsheet-vs-web.cjs` compare les totaux Recap Portfolio GSheet vs DB Web.
- **X posts** : Kraken 7e CEX (`wcore-post-kraken.png`, badges MiCA bleus sur les chips licenciés, pill `MiCA LICENSED` hero Kraken). Convention tag unique (nouveau CEX uniquement).
- **AGENTS.md** : entrée Kraken post + MiCA badges ajoutée à la section gotchas X posts.

### Session 2026-07-05 (suite) — Versioning, copy update, banner, WEB_SCAN_ERROR fix

- **Versioning** : `CORE_VERSION` bump `0.2.0-phase2` → `0.3.3` (`packages/core/src/index.ts`). `apps/api/package.json` bump `0.1.0` → `0.3.3`. `/health` expose `coreVersion`. `SidebarLayout` lit `/health` au montage (plus de hardcode fragile). Source unique = `@wcore/core`.
- **Homepage/About copy** : chiffres réels partout — 174 chains (182 total − 8 disabled), 7 CEX (Binance/Bitpanda/Bitfinex/Bybit/Coinbase/Kraken/OKX), 80+ GM chains, 4 VMs (EVM/Solana/Cosmos/TON). Hero plus concis, MiniCards mis à jour, feature cards HomePageClient, About page liste tous les CEX, metadata SEO.
- **Banner X** : `wcore-banner.svg/png` régénéré — pills `174 chains` / `4 VMs` / `7 CEX` / `on-chain GM`, subtitle mentionne TON, PNG re-renderisé via Playwright.
- **Twitter bio** : `All your crypto. One view. Read only. 174 chains · EVM · Solana · Cosmos · TON · 7 CEX · Real-time pricing · On-chain GM` (123 chars, wcore.xyz dans le champ URL du profil).
- **CM-STRATEGY.md** : bio mise à jour (clean & direct).
- **GSheet watchdog WEB_SCAN_ERROR fix** : `[WEB_SCAN_ERROR]` n'était pas reconnu par `_wd_needsRefresh_` → jamais de re-pulse B1 → chaînes bloquées à jamais. Fix 3 points dans `16_REFRESH.gs` : (1) handler explicite `[WEB_SCAN_ERROR]` → `needsPulse: true`, (2) regex `_wd_extractTimestamp_` inclut `WEB_SCAN_ERROR`, (3) détection `isErr` accepte l'anglais `error` en plus du français `erreur`. GSheet web scan adapter v4.16.27 : `_webScanErrorStatus_` retire le suffixe `chain=*****` redondant.
- **Déploiement** : API + Web deployés via `deploy.ps1`. GSheet nécessite `clasp push` pour les 3 fixs watchdog.

### Session 2026-07-14 — GSheet Strat dashboard + portfolio auto-filter + chart resize + pricing fresh CMC

- **GSheet — Strat dashboard** : nouvelles cellules d'alerte BK1 (erreurs Recap Portfolio), BL1 (date scan la plus ancienne), BQ1 (écart Portfolio Crypto Details), BW1 checkbox maître. Portfolios U1 en miroir.
- **GSheet — Portfolio auto-filter** : `_portfolioReapplyFilter_()` réapplique le filtre colonne S (Achat) à chaque refresh horaire + onEdit BW1/B1. Corrige le retrait du `OR(T="X")` redondant dans la formule S Crypto.
- **GSheet — Chart auto-resize** : `updateEmbeddedObjectPosition` redimensionne le graphique `visibleRows × 21` après chaque refresh et onEdit. `_WCORE_ORIG_FETCH` contourne le guard quota.
- **Railway — Fresh pricing** : `?fresh=true` accepté sur les endpoints portfolio → bypass cache Redis → fetch CMC live. TTL cache réduit 6h → 1h. `EMERGENCY_RESET_QUOTA()` corrigé (faux positif breaker, 23/20000).
- **Pages Market Cap — livrées** : routes publiques stables `/cmc/crypto` et `/cmc/stocks`, libellés Market Cap Crypto/Stock, logos source exacts quand disponibles, pays pour les actions, résumés responsive, recherche, pagination de 100 lignes et statut de snapshot stale. Déploiement et contrôle live attestés le 2026-07-17 ; cycle X associé terminé.
- **Backlog — Bridge** : intégration d'un bridge cross-chain (read-only ou interactif) permettant de visualiser et/ou exécuter des transferts d'actifs entre les 183+ chaînes suivies. Priorité : affichage des routes disponibles et des frais, avant exécution.

### Session 2026-07-01 - GSheet Web scan hardening + Base Zora pricing fallback

- **GSheet Web scan adapter v4.16.26** : `I2:I` token whitelists now send `strictTokens:true`; degraded partial Web scans no longer clear cache-only token prices; adapter accepts `priceEur/price_eur/price` and `valueEur/value_eur/value`, and derives a precise price from `value / balance` when the API exposes an exact value but a rounded price. This fixed the observed Solana DBR drift where GSheet recalculated a lower value from a rounded `priceEur` while Web kept the precise `valueEur`.
- **Scam rules** : Base fake-price spam `ZAMRUD` contract `0x69ca8b02d2aa27619e02fbf6de1b1502da5f147a` is hard-blocked by contract. `SCAM_RULES_VERSION` bumped to 15.
- **Base Zora fallback pricing** : added `ZoraCoinPriceSource` for Base content/social coins. It reads `zora20Token.tokenPrice.priceInUsdc` from `https://api-sdk.zora.engineering/coin?address=<contract>&chain=8453` after standard sources miss, then converts through the normal FX cascade. Prod validation on `Ledger - Base`: `Surprise`, `CUBE`, and `JALICHI` now receive prices/values in GSheet after an API deploy + sheet refresh.
- **Known remaining Base no-price tokens** : `BARAN`, `JRA`, `ZAY`, `FLIPIT`, `CTRL`, `BSNOW`, `ZECM`, and `WC` still have no reliable source in WCORE's checked cascade. Do not invent prices; keep them blank/`NO_PRICE` until a real market/source appears.
- **Corn sunset cleanup** : `Ledger - Corn` was removed from the live Google Sheet after Corn Maizenet public RPCs returned only `403/404` or failed `eth_blockNumber`, and the network had reached its public 2026-06-30 shutdown date. Code-level chain removal remains a follow-up if Corn is no longer useful for historical claims.
- **Validation** : `@wcore/core typecheck`, `@wcore/core test` (`283/283`), `@wcore/core build`, `@wcore/api build`, `wcore-gsheet test:web-scan-adapter`, and `wcore-gsheet validate:static` were run during the hardening work. API prod was redeployed via `scripts/deploy.ps1 -Service api`.

## Previous current state : v0.3.1 - Cache scan `scan:result` + deploiement Railway parent-context stabilise (2026-06-20)

### Session 2026-06-20 - master public nettoye, API/Web redeployes

- **Git public nettoye** : les commits v0.3.1 ont ete rejoues sur une branche propre issue de `origin/master`, puis `origin/master` a ete mis a jour en fast-forward (`946bcef`). La branche temporaire `v0.3.1-public` a ete supprimee en local et sur GitHub. La vieille branche locale divergente `web` a ete supprimee ; backup conserve localement : `backup/web-before-public-rebase`.
- **Deploiement prod** : API et Web redeployes via `scripts/deploy.ps1` parent-context, sequentiellement pour eviter la race sur `railway.json`. Smoke checks post-deploy : `https://wcore.xyz` `200`, `/health` `status:"ok"`, `chainCount:182`, `/api/chains` `count:182` (`EVM=168`, `COSMOS=11`, `SVM=2`, `TON=1`).
- **Scan cache durci** : garde-fou `hasCachedValue()` contre les snapshots contenant un natif positif sans prix ou un token majeur positif sans prix ; `MAJOR_PRICEABLE_SYMBOLS` etendu pour les majors Base/EVM (`AIXBT`, `B3`, `BNKR`, `CLANKER`, `EIGEN`, `EURC`, `MOG`, `SOLVBTC`, `ZORA`, etc.).
- **GM on-chain optimise** : `syncOnChainContracts()` passe en batch DB (`findMany`, `createMany({ skipDuplicates: true })`, `updateMany`) sans ecraser un `ownerId` existant d'un autre user. `/api/gm/status-onchain` a maintenant un cache memoire court 5 min par `(chain,address,UTC day)` pour eviter les `eth_getLogs` repetes.
- **Verifications locales** : `pnpm typecheck`, builds `@wcore/core`, `@wcore/api`, `@wcore/web`, `validate:static`, `build:chains`, `test:phase3-chains`, `git diff --check` tous verts avant push/deploy.

### Session 2026-06-21 - sprint roadmap securite/tests/docs

- **Observabilite admin-only** : `/api/stats` et `/api/circuit` exigent maintenant l'admin auth via `isAdminAuthorized(req)`. Tests `apps/api/test/admin-plugins.test.ts` couvrent les 401 sans token.
- **Scan orchestrator couvert** : `buildScanOrchestratorJobs()` isole la logique pure du hook et les tests `apps/web/__tests__/use-scan-orchestrator.test.ts` couvrent le filtrage VM, les chaines disabled et le batching.
- **GM on-chain anti-replay renforce** : test same-chain/casse mixte sur `/api/gm/onchain`; la reponse duplicate utilise maintenant `error: "duplicate_tx"` et la DB ne double-insere pas le `txHash`.
- **Docs onboarding** : `CONTRIBUTING.md` et `TESTING.md` ajoutes et lies depuis `README.md` ; `docs/TROUBLESHOOTING.md` existait deja.
- **Swellchain sunset** : aucune suppression avant la deadline officielle du 23 juin 2026 ; Task 5 stoppee volontairement au gate date.

### Ô£à Phase 1 : Fondations cross-runtime ÔÇö FX cascade + cache-key registry + drift detector
### Ô£à Phase 1.5 : Mirror .gs ├®limin├® + package @wcore/chains + monorepo unifi├®
### Ô£à Phase 2 : CEX Coinbase + OKX (web multi-user, d├®j├á livr├® le 2026-06-15)

### Ô£à Phase 3 : Consolidation configs cha├«nes (182/182 extractibles, chain sunsets ├á suivre)

### Ô£à Fix cache scan Ethereum + namespace `scan:result` (v0.3.1)

- **Cause racine** : les prix Ethereum live ├®taient corrects en `forceRefresh=true`, mais le cache r├®sultat n'├®tait pas r├®├®crit quand un scan utile contenait des erreurs non critiques (`NO_PRICE` long-tail, rate-limit RPC). R├®sultat : l'UI pouvait continuer ├á servir un ancien snapshot sans prix pour `WBTC`, `stETH`, `PENDLE`, `ETHFI`.
- **Fix API** : `shouldCacheAssets()` accepte maintenant les scans d├®grad├®s mais utiles apr├¿s les garde-fous critiques existants. Les scans avec wallet vide douteux, natif positif sans prix, token majeur positif sans prix, ou erreurs critiques SVM/Cosmos restent refus├®s.
- **Namespace Redis** : le cache r├®sultat haut niveau est renomm├® de `scan:v2:{address}:{chain}` vers `scan:result:{address}:{chain}` via la cache-key registry. `forceRefresh=true` bypass ce cache haut niveau.
- **Validation prod** : scan Ethereum `0x17d518736ee9341dcdc0a2498e013d33cfcdd080` apr├¿s d├®ploiement : `WBTC` price `54556.02 EUR`, value `139.02 EUR`; total Ethereum `169.84 EUR`; scan non-forc├® suivant servi en `791 ms` avec `tokenCount=65`, `pricedCount=39`.

### Ô£à D├®ploiement Railway parent-context stabilis├®

- **Cause racine infra** : `@wcore/core` depend de `@wcore/chains` via `file:../../../wcore-gsheet/dist`. Un upload depuis le mauvais repertoire excluait `wcore-gsheet/dist`; un upload parent sans config ignorait le bon `railway.json`.
- **Fix deploy** : `scripts/deploy.ps1` utilise le `railway.json` parent avec `--path-as-root`, un lock `.deploy.lock`, et restaure le JSON en `finally` en propageant le code de sortie Railway.

### Session 2026-06-28 — Non-standard ERC-20 balance selectors + staked/debt mirrors + Compound V3

#### Mirror system
- `applyStakedPriceMirrors` extended: per-chain, `negate: true`, native underlying, `contract|symbol` fallback key
- **BASE**: SDAYS/SWEET live ✓
- **OPTIMISM**: WCT Stake/Claimable, Comp WETH Borrow (negated → ETH native), Comp wrsETH (→ wrsETH) + WCT live ✓

#### Custom balance selectors
- `DiscoveredToken.balanceSelector` + `balanceSelectorExtraArgs` for multi-arg ABI calls
- `encodeCustomBalanceCall()`, `decodeUint256FirstWord()` (struct responses)
- `readErc20Balance()` split standard/custom-selector tokens
- Composite dedup key `contract:selector:extraArgs`
- Registry merge into `cachedDiscoveryTokens` before cache read

#### Registry OPTIMISM: WCT×3, Comp WETH Borrow (`0x374c49b4`), Comp wrsETH (`0x5c2549ee` + extraArgs), wrsETH

#### Compound V3
- Comet `0xE36A30D249f7761327fd973001A32010b521b6Fd` (cWETHv3, Optimism)
- On-chain: borrow=0.006384 WETH, collateral=0.007411 wrsETH — confirmed

#### Tests: core 33/33, api 25/25, cascade 18/18 — all green

#### Production: BASE SDAYS/SSWEET ✓, OPTIMISM WCT ✓, Compounds deployed but suppressed by `bal_cache` (1h TTL). Comp WETH Borrow appeared briefly then vanished — production RPC `errors:3`. Registry merge 10 tokens locally confirmed.

#### Key files: `tokens/types.ts`, `tokens/abi.ts`, `tokens/registry.ts`, `engines/evm-balances.ts`, `engines/evm-scan.ts`, `engines/evm-batch.ts`, `plugins/gsheet.ts`
- **Dockerfiles Railway** : `apps/api/Dockerfile.railway` et `apps/web/Dockerfile.railway` utilisent le contexte parent, incluent `wcore-gsheet/dist`, compilent `@wcore/chains` en JS, puis patchent aussi `node_modules/@wcore/chains/package.json` pour ├®viter le crash Node 22 `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
- **Incident API public snapshot r├®solu (2026-06-19)** : le service API Railway crashait avec `ERR_MODULE_NOT_FOUND: /app/packages/shared/dist/.js`. Cause racine : le `RUN node -e "... '$1' ..."` du Dockerfile API laissait `/bin/sh` expand `$1` en vide dans le remplacement regex ESM, g├®n├®rant `from "./.js"`. Fix : ├®chapper `$1` en `\$1` dans `apps/api/Dockerfile.railway`.
- **Validation prod** : API `/health` `200` (`chainCount=182`) et Web `https://wcore.xyz` `200` apr├¿s d├®ploiements API + Web. Derni├¿re v├®rification post-fix Dockerfile : `https://api-production-b5bf.up.railway.app/health` `200`, `uptimeSec` live, `chainCount=182` ; `https://wcore.xyz` `200`.
- **Autodeploy API** : ne pas reconnecter l'API ├á GitHub tant que Railway n'a pas une config par service ou config-file s├®par├®e. Le `railway.json` unique pointe par d├®faut vers le web ; connecter `api` ├á GitHub sans s├®paration peut builder/d├®ployer le mauvais Dockerfile.

### Ô£à FX cascade EUR/USD sans fallback fixe (v0.2.47)

- **Cause racine** : le code historique avait un `0.92` hardcod├® (gsheet `04C_CACHE_GLOBAL.gs:647` `return FxRate._cached || 0.92`) et un `1.08` dans 4 engines web (per audit 2026-05-27) qui corrompaient silencieusement les prix quand les sources FX ├®chouaient. Bug constat├® le 2026-06-17 : web ETH = 1623.96 EUR (FX 0.918 stale) vs gsheet 1539.64 EUR (FX 0.854 stale) ÔÇö d├®rive de 5.5% sans aucun signe visible c├┤t├® UI.
- **Cascade 4 sources** : Frankfurter (ECB), open.er-api.com, Coinbase exchange-rates, DefiLlama EURC oracle. Toutes free, sans cl├®, sans auth. Frankfurter et DefiLlama invers├®s (retournent `1 EUR = X USD`, on veut `1 USD = X EUR`).
- **Consensus m├®dian** : ÔëÑ3 sources ÔåÆ m├®diane (rejette outliers), 2 sources ÔåÆ moyenne si delta < 5% sinon throw, 1 source ÔåÆ retour, 0 source ÔåÆ **throw explicite** (plus de fallback fixe).
- **Convention unifi├®e** : `priceEur = priceUsd * fxRate` o├╣ `fxRate = EUR per 1 USD`. Source unique : `packages/core/src/pricing/cascade.ts:202`.
- **Cache** : `cacheKey("fxEurUsd", {})` = `fx:eur:usd` (web) / `FX_EUR_USD` (gsheet). TTL 1h en m├®moire, Redis optionnel. Version stamp gsheet (`FxRate._CURRENT_VERSION = "4.15.50"`) pour invalider apr├¿s deploy.

### Ô£à Cross-runtime drift detector

- **Telemetry bidirectionnelle** : web self-publie sur `/api/price/fx` ÔåÆ `fx_telemetry:web`. Gsheet POST apr├¿s chaque cascade ÔåÆ `/api/gsheet/fx-telemetry` (auth `x-gsheet-token`).
- **Endpoint `/api/diag/fx-parity`** : GET public, retourne `{web, gsheet, drift, ok}` avec tol├®rances 2% (warn, exit 1) et 5% (alert, exit 2).
- **CSRF** : `requiresCsrfOriginCheck` exclut `/api/gsheet/*` (auth par token, pas cookie). Sans ce fix, le POST telemetry ├®tait bloqu├® en 403.
- **Script live** : `scripts/test-fx-parity.cjs` hit `/api/price/fx` + `/api/diag/fx-parity`. Couvre drift 0.39% d├®tect├® le 2026-06-17 entre web (0.8646) et gsheet (0.8613) apr├¿s deploy.

### Ô£à Tests

- 26 unit tests web (`packages/core/src/fx.test.ts`) : sources isol├®es, cascade 1/2/3/4, consensus median/moyenne/throw, cache hit/miss/forceRefresh, timeout.
- 9 cross-runtime spec tests (`wcore-gsheet/scripts/fx-cascade-spec.test.cjs`) : sources identiques, cascade identique pour m├¬mes mocks (4/2/1/0 sources, outlier, fail-fast, inversion math).
- 1 live test (`scripts/test-fx-parity.cjs`) : drift 0.39% < 2% apr├¿s deploy Railway.
- 208/208 core + 237/237 API + 9/9 cross-runtime spec.

### ÔÜá´©Å Dette restante

- **Scan results cached avec ancien FX** : les r├®sultats Redis `scan:result:*` peuvent encore utiliser un ancien FX jusqu'├á expiration du TTL. Sympt├┤me : sur la m├¬me cha├«ne, ETH et WBTC peuvent montrer des prix calcul├®s avec des FX diff├®rents s'ils ont ├®t├® scann├®s ├á des moments diff├®rents. Fix : `forceRefresh=true` sur les cha├«nes concern├®es.
- **CSRF wildcard** : si on ajoute de nouvelles routes `/api/gsheet/*`, elles sont automatiquement exclues du CSRF (wildcard). C'est intentionnel mais ├á garder en t├¬te.
- **Chain sunset calendar / suppressions apr├¿s deadlines** : plusieurs cha├«nes support├®es ou observ├®es par WCORE ont annonc├® une fermeture ou une phase de retrait. R├¿gle produit : garder la couverture active jusqu'├á la deadline publique pour aider les users ├á voir ce qu'ils doivent sortir, puis retirer/d├®sactiver la cha├«ne apr├¿s la date limite (pas avant). Ne jamais supprimer une cha├«ne sur un post tiers non v├®rifi├® : utiliser l'annonce officielle ci-dessous.
  - **Swell Chain / Swellchain** : bridge avant le **23 juin 2026**. Source officielle Swell : `https://x.com/swellnetworkio/status/2067031459731570952`. Apr├¿s le 23 juin, retirer `SWELLCHAIN` de WCORE : configs core (`packages/core/src/chains/*` + index), factory `swellchain` dans `packages/shared/src/factories.ts`, UI GM/wagmi/DeployClient/chain-data/explorers, manifests ic├┤nes/symboles, compteurs/docs GM, tests GM/wagmi de garde.
  - **Corn / Corn Maizenet** : r├®seau arr├¬t├® le **30 juin 2026**. Source officielle Corn : `https://x.com/use_corn/status/2054914084840042967` et help center `https://help.usecorn.com/en/collections/19631033-corn-chain-wind-down`. Les assets restants apr├¿s shutdown ne seront plus r├®cup├®rables ; BTCN devait sortir via l'app legacy/LayerZero avec RPC wallet fonctionnel `https://maizenet-rpc.usecorn.com` si Ankr renvoie `API key is not allowed to access blockchain`. **2026-07-01** : l'onglet live `Ledger - Corn` a ete supprime de la spreadsheet apres confirmation que les RPC publics connus (`maizenet-rpc.usecorn.com`, `corn.drpc.org`, Ankr, mainnet.corn-rpc.com, thirdweb) ne permettaient plus un scan complet. Follow-up code : retirer/desactiver `CORN` (chainId `21000000`) de la couverture active WCORE et des surfaces GM/dev deploy si la chaine n'est plus utile pour claims.
  - **Polygon zkEVM Mainnet Beta** : sequencer sunset le **1 juillet 2026**. Source officielle Polygon forum : `https://forum.polygon.technology/t/polygon-zkevm-mainnet-beta-sunset-claim-your-funds/21856`. Nuance importante : assets en wallet non bridg├®s avant le 1 juillet seront auto-migr├®s vers Ethereum L1 et claimables via UI d├®di├®e, mais les fonds locked en DeFi/protocoles ne peuvent pas ├¬tre auto-migr├®s. Bridge officiel : `https://ui.agglayer.dev/`. Apr├¿s le 1 juillet, retirer/d├®sactiver `POLYGON_ZKEVM` de la couverture active WCORE si la cha├«ne n'est plus utile pour claims.
  - **Botanix** : retirer Bitcoin et autres assets avant le **9 juillet 2026**. Source officielle Botanix : `https://x.com/botanix/status/2064420116578590941`. Apr├¿s la deadline, la federation sweep le Bitcoin restant et les autres tokens/assets deviennent unrecoverable. Ne pas publier de lien de bridge non v├®rifi├® : renvoyer vers les canaux/app officiels `@botanix` uniquement. Apr├¿s le 9 juillet, retirer/d├®sactiver `BOTANIX` si pr├®sent dans la couverture WCORE.
  - **ZER¤┤ / ZERO Network** : bridge out avant le **31 juillet 2026**. Source officielle ZERO : `https://x.com/zerodotnetwork/status/2057529617385201702` (+ follow-up `https://x.com/zerodotnetwork/status/2057529619671142829`). Apr├¿s le 31 juillet, retirer/d├®sactiver `ZERO` / `ZERO_NETWORK` selon la cl├® core effective, apr├¿s v├®rification des d├®pendances UI/GM.
  - **Mint Blockchain** : op├®rations cess├®es le **17 avril 2026**, withdrawal gateway ouverte jusqu'au **20 octobre 2026** pour `ETH`, `WBTC`, `USDC`, `USDT`. Source officielle Mint : `https://x.com/Mint_Blockchain/status/2044980026819617147`. Gateway : `https://www.mintchain.io/withdraw`. Apr├¿s le 20 octobre, retirer/d├®sactiver `MINT` / `MINT_BLOCKCHAIN` si pr├®sent dans WCORE.
  - **Cronos zkEVM Alpha** : r├®seau op├®rationnel jusqu'au **3 juin 2027 03:00 UTC**, puis shutdown permanent. Source officielle Cronos : `https://x.com/CronosNetwork/status/2062006553595785239` et article `https://open.substack.com/pub/cronoslabs/p/sunsetting-the-cronos-zkevm-alpha`. Bridge officiel : `https://zkevm.cronos.org/bridge/`. Withdrawals requi├¿rent assez de `zkCRO` pour le gas. Apr├¿s le 3 juin 2027, retirer/d├®sactiver `CRONOS_ZKEVM` / cl├® core effective.

### Fichiers

- **Web** : `packages/core/src/fx.ts` (refactored), `apps/api/src/plugins/gsheet.ts` (telemetry + parity), `apps/api/src/plugins/chains.ts` (self-telemetry), `apps/api/src/server-helpers.ts` (CSRF wildcard), `scripts/test-fx-parity.cjs`, `apps/api/src/plugins/scan-utils.ts`, `packages/shared/src/cache-key-registry.ts`, `apps/api/Dockerfile.railway`, `apps/web/Dockerfile.railway`, `scripts/deploy.ps1`.
- **Gsheet** : `src/04C_CACHE_GLOBAL.gs` v4.15.50, callers durcis (`10_OUTPUT.gs`, `15_COSMOS_ENGINE.gs`, `FOGO.gs`, `26_OPTIMIZATIONS.gs`), `scripts/fx-cascade-spec.cjs` + `.test.cjs`, `scripts/gsheet-fx-telemetry.cjs`.
- **Doc** : `docs/fx-cascade.md` (focalis├®), entr├®es `CHANGELOG.md` et `ROADMAP.md` (ce fichier).

---

> **Historical sections below.** The current state is the v0.3.3 section above. Older sections are retained for traceability and release archaeology; do not treat any later `Etat courant` / `Etat actuel` heading below this banner as the current roadmap.

## ├ëtat courant : v0.2.46 ­ƒƒó ÔÇö Bitpanda stocks pric├®s via relais + logos stocks + Refresh All CEX (2026-06-15)

### Ô£à Pricing stocks Bitpanda fiabilis├® (relais Yahoo)

- **Cause racine** : Yahoo Finance refuse les connexions depuis l'IP datacenter de l'API WCORE (`fetch failed`, m├¬me blocage IP datacenter que Binance HTTP 451). Le pricing direct Yahoo (v0.2.43) ├®chouait donc en prod pour tous les stocks.
- **Fix relais** : endpoint `POST /stock/prices` ajout├® au `cex-relay` Railway EU (`wcore-gsheet/railway-relay/server.js`). L'API WCORE appelle le relais (`apps/api/src/cex/stock-relay.ts`) au lieu de Yahoo en direct, avec cache Redis 6h (`stockprice:{SYMBOL}`) et fallback quote provider Bitpanda.
- **Multi-devises** : conversion USD/GBP/GBp/CHF/KRW ÔåÆ EUR via taux Yahoo `EUR{CCY}=X`. Symboles cor├®ens (`HYXS`ÔåÆ`000660.KS`, `SSU`/`SMSN`ÔåÆ`005930.KS` Samsung), `NESN.SW` (CHF). Receipt Samsung divis├® par 25 (align├® `wcore-gsheet`).
- **Candidats Yahoo minimis├®s** : ticker US simple = 1 appel (plus de balayage des 8 suffixes EU qui saturait Yahoo en 429). Aliases Bitpanda mapp├®s (`AMD-US`ÔåÆ`AMD`, `BRKB`ÔåÆ`BRK-B`, `FB`ÔåÆ`META`, `RDSA`ÔåÆ`SHEL`, `TSFA`ÔåÆ`TSLA`, `BROA`ÔåÆ`AVGO`, `TCTZF`ÔåÆ`TCEHY`).
- **Collision crypto/stock corrig├®e** : les lignes `stocks` tentent Yahoo AVANT le quote provider Bitpanda (├®vite qu'un ticker crypto homonyme ÔÇö ACN, AMZN, MC, WMT ÔÇö price une action avec un prix crypto).

### Ô£à Logos stocks + fix chevauchement

- **Logos stocks** : `apps/web/lib/cex-stock-logos.ts` mappe chaque ticker stock/ETF Bitpanda vers son logo de marque via DuckDuckGo (`icons.duckduckgo.com/ip3/<domain>.ico` ÔÇö Clearbit d├®pr├®ci├®, DNS mort). `useCexHoldings` attache `logoUrl` aux holdings `stocks`.
- **Fix chevauchement** : dans `TokenIcon`, le cercle color├® de fallback transparaissait derri├¿re les favicons stocks ├á fond transparent. Masqu├® (`opacity-0`) d├¿s `imageLoaded`, fond neutre pendant chargement, `object-cover`ÔåÆ`object-contain`.

### Ô£à Refresh All synchronise les CEX

- Sur `/wallet`, "Refresh All" POST maintenant `/api/cex/accounts/:id/sync` pour chaque compte CEX + recharge les holdings (`reloadCex`), en plus du re-scan on-chain (`WalletContent.tsx`).

### ÔÜá´©Å Micro-cryptos non valorisables (par design)

- `APP`, `DCK`, `DOGA`, `GODL`, `KIP`, `LAI` restent ├á `ÔÇö` : le ticker Bitpanda officiel les cote lui-m├¬me ├á `EUR=0.0000` et CoinGecko renvoie des tokens ambigus par symbole. Pas de devinette (risque de gonfler le total comme le bug ETHG).

---

## ­ƒöº Chantier harmonisation cross-runtime ÔÇö Objectif et phases

> **Objectif** : faire converger les deux runtimes (Google Apps Script et Node.js/Next.js) vers un comportement identique, tout en respectant les contraintes sp├®cifiques de chaque environnement :
> - **GSheet** : 30s timeout, 500KB ScriptProperties, 20k HTTP/jour fen├¬tre glissante, pas de Redis, pas de base de donn├®es.
> - **Web** : Redis, Postgres, Docker, Railway, multi-tenant (chaque user a ses cl├®s CEX), pas de limite de temps d'ex├®cution.

### Principe fondateur
1. **Source unique des configs cha├«nes** ÔåÆ `wcore-gsheet/src/*.gs` (canonique), extraites automatiquement vers `@wcore/chains`
2. **M├¬me logique m├®tier** (pricing, consensus, cache) ex├®cut├®e avec la m├¬me spec, adapt├®e aux contraintes de chaque runtime
3. **D├®tection de drift automatique** : telemetry cross-runtime (FX, prix natifs) + endpoint `/api/diag/fx-parity`
4. **Pas de duplication de code m├®tier** : ce qui est commun vit dans une source unique, ce qui est sp├®cifique ├á un runtime vit dans ce runtime

### Ô£à Phase 1 ÔÇö Fondations cross-runtime (compl├®t├® le 2026-06-17)
- **FX cascade unifi├®e** : 4 sources (Frankfurter, open.er-api, Coinbase, DefiLlama EURC) + consensus m├®dian, **m├¬me code** des deux c├┤t├®s. Plus aucun fallback fixe (`0.92`/`1.08`).
- **Cache-key registry** : `packages/shared/src/cache-key-registry.ts` (web) + `src/00C_CACHE_KEYS.gs` (gsheet). Toute nouvelle cl├® passe par cette registry, pas de hardcodage de pr├®fixes.
- **Cross-runtime drift detector** : telemetry bidirectionnelle + endpoint `/api/diag/fx-parity`. Tol├®rances 2% (warn), 5% (alert).
- **Version stamp gsheet** : `FxRate._CURRENT_VERSION` force un fresh fetch apr├¿s deploy.
- **Validations** : 26 tests FX web, 9 tests cross-runtime spec, 1 live test drift (0.39% < 2%), 208/208 core + 237/237 API.

### Ô£à Phase 1.5 ÔÇö Mirror .gs ├®limin├® + package @wcore/chains (compl├®t├® le 2026-06-18)
- **Suppression des 170 fichiers `.gs` dupliqu├®s** dans `wcore-web/src/` (54k lignes).
- **Extraction automatique** : `wcore-gsheet/tools/extract-chains.mjs` parse `src/*.gs` ÔåÆ 113 configs TypeScript ÔåÆ `@wcore/chains`.
- **Package `@wcore/chains`** v4.15.50 : self-contained (types `VmType` + `ChainConfig`, pas de d├®pendance ├á `@wcore/shared`).
- **Monorepo GitHub** : `wcore-web/` + `wcore-gsheet/` dans la m├¬me branche, m├¬me repo.
- **Outillage unifi├®** : `tools/extract-chains.mjs` + `tools/validate-static.js` dans wcore-gsheet, `build-index.mjs` dans wcore-web pour le merge.
- **Dette sold├®e (2026-06-19)** : les 68 configs web-only ont ├®t├® port├®es vers `wcore-gsheet/src/*.gs`. `TON.gs` utilise `ChainFactory.createTonChain` et est extractible (182/182). Prochaine ├®tape : retirer les cha├«nes apr├¿s leurs deadlines sunset (Swell 23 juin ÔåÆ premier retrait).

### Ô£à Phase 2 ÔÇö CEX Coinbase + OKX web multi-user (compl├®t├® le 2026-06-15)
- **Modules GAS** : `39_COINBASE_SYNC.gs` et `40_OKX_SYNC.gs` op├®rationnels (sync horaire central, refresh manuel A1, B1=REQUEST).
- **Relais Railway** : endpoints multi-user `POST /coinbase/account` et `POST /okx/account` (commit `862a112`). Re├ºoivent les credentials utilisateur, ne fusionnent pas les symboles (coh├®rence web).
- **Coinbase** : signature JWT ES256, endpoint `/api/v3/brokerage/accounts`, secret EC PEM stock├® dans Railway (jamais dans GAS).
- **OKX** : signature HMAC-SHA256 + passphrase, endpoints `/api/v5/account/balance` (trading) + `/api/v5/asset/balances` (funding), host EEA `my.okx.com`.
- **Frontend** : `cex-display.ts` (meta + logos CMC), `useCexHoldings`, `ChainCard`, `ChainIcon.CONTAIN_LOGOS`, formulaire Profile > CEX.
- **Refresh** : `CEX_HOURLY_REFRESH()` (Bitpanda/Binance/Bitfinex/Bybit/Coinbase/OKX) + checkboxes `A1` par onglet CEX.

### Ô£à Phase 3 ÔÇö Consolidation configs cha├«nes (compl├®t├® le 2026-06-19)
- **Port des cha├«nes web-only** vers `wcore-gsheet/src/*.gs` termin├®. 182/182 configs web ont une source `.gs` extractible.
- **TON.gs ÔåÆ ChainFactory** termin├® via `ChainFactory.createTonChain`, sans remplacer le moteur TON standalone existant.
- **Outillage** : `tools/port-web-chains-to-gsheet.cjs` (g├®n├®rateur), `tools/test-phase3-chain-port.cjs` (v├®rification), scripts npm `port:web-chains` + `test:phase3-chains`.
- **Chain sunsets ├á suivre** : Swell (23 juin), Polygon zkEVM (1 juillet), Botanix (9 juillet), ZERO (31 juillet), Mint (20 octobre), Cronos zkEVM (3 juin 2027).
- **Docs** : ROADMAP, CHANGELOG, AGENTS.md (gsheet + web) mis ├á jour.

---

---

## Historique : v0.2.44 ­ƒƒó ÔÇö Bitfinex CEX provider live (API directe v2, HMAC-SHA384) (2026-06-14)

- **Bitfinex live** : 3e provider CEX apr├¿s Binance et Bitpanda, portant le module GAS `37_BITFINEX_SYNC.gs`. Cl├® read-only (`apiKey` + `apiSecret`) chiffr├®e AES-GCM (`CEX_SECRET`).
- **API directe server-side** : Bitfinex ne bloque pas les IP datacenter. L'API WCORE signe en HMAC-SHA384 + nonce et appelle `api.bitfinex.com/v2/auth/r/wallets` directement, sans relais.
- **Wallet exchange (spot) uniquement** + alias symboles courts (`ATO`ÔåÆ`ATOM`, `IOT`/`MIOTA`ÔåÆ`IOTA`, `UST`ÔåÆ`USDT`ÔÇª) + consolidation stables/fiat. Rendu comme wallet `CEX_BITFINEX`. Logo CMC `exchanges/128x128/37.png`.

> Note : Bybit livr├® en v0.2.45 (4e provider CEX, via relais EU ÔÇö voir AGENTS.md "CEX Bybit web").

---

## Historique : v0.2.43 ­ƒƒó ÔÇö CEX wallets live, pricing Binance/Bitpanda, scan UX harmonis├®e (2026-06-13)

### Ô£à CEX web int├®gr├®s au portefeuille

- **Binance + Bitpanda live** : les comptes CEX restent dans des tables d├®di├®es (`cex_accounts`, `cex_holdings`) et ne sont pas m├®lang├®s aux scans on-chain. Ils s'affichent comme des wallets s├®par├®s dans `/home`, `/wallet` et `/profile?tab=wallets`.
- **Scan /home** : cliquer `Scan` synchronise maintenant les comptes CEX configur├®s avant l'ouverture de `/wallet`, puis les holdings cach├®s sont charg├®s comme r├®sultats synth├®tiques (`cex:{provider}:{id}`).
- **UI harmonis├®e** : dans les listes de wallets, les CEX suivent le m├¬me format que les wallets on-chain (`Binance` / `Bitpanda` puis `Exchange account`) avec bouton `Remove`. Dans `/wallet`, le header externe garde le badge `CEX` mais pas d'ic├┤ne redondante ; la carte interne affiche l'ic├┤ne plateforme ├á l'emplacement de l'ic├┤ne cha├«ne et le badge `CEX` ├á la place du badge VM.
- **S├®lecteur `/wallet`** : l'encart de s├®lection des wallets inclut maintenant les CEX, auto-activ├®s au chargement, s├®lectionnables/d├®s├®lectionnables comme les wallets on-chain, sans bouton re-scan individuel.
- **Pas de scam sur CEX** : les actifs CEX (`SYMBOL:bucket`) sont exclus du scam detector, des actions de report et des liens explorer. Les identifiants techniques ne sont plus affich├®s comme contrats.

### Ô£à Pricing CEX

- **Binance** : le `binance-relay` multi-user renvoie maintenant une map `prices` par symbole, calcul├®e via `/api/v3/ticker/price` en batch. L'API WCORE utilise ces prix en priorit├®, puis fallback DefiLlama/stable/fiat.
- **Bitpanda crypto/commodities** : pricing via ticker public `https://api.bitpanda.com/v1/ticker` (`SYMBOL.EUR`) quand disponible.
- **Bitpanda stocks** : le ticker Bitpanda ne contient pas les symboles actions. ~~Fallback Yahoo direct~~ ÔåÆ **remplac├® en v0.2.46** par le relais `cex-relay` (`POST /stock/prices`) car Yahoo bloque l'IP datacenter de l'API. Voir l'├®tat courant v0.2.46.
- **Relay gotcha** : `binance-relay` doit ├¬tre d├®ploy├® depuis `wcore-gsheet/railway-relay`, pas depuis la racine `wcore-gsheet`. Un `index.js` charge `server.js` pour satisfaire la start command Railway `node /app/index.js`.

### ÔÅ│ Backlog CEX

- **Nouveaux providers ├á ajouter** : **Coinbase + OKX (prochaine session, voir section d├®di├®e en haut)**. Bitfinex livr├® en v0.2.44, Bybit en v0.2.45, stocks Bitpanda fiabilis├®s en v0.2.46.
- **├Ç pr├®voir par provider** : stockage credentials chiffr├®s par user, normalisation sans fusion arbitraire de symboles, endpoint sync server-side, source prix provider-first, fallback pricing fiable, rendu comme wallet CEX sans d├®clencher de scan on-chain.
- **├Ç durcir** : suivi des failures sync par provider, message UI clair quand un provider ne donne pas de prix pour certains actifs, et tests de non-r├®gression pour stocks Bitpanda.

### V├®rifications / d├®ploiement

- Tests cibl├®s : `apps/api/src/cex/normalizers.test.ts`, `apps/web/__tests__/cex-display.test.ts`.
- Builds : `pnpm --filter @wcore/api build`, `pnpm --filter @wcore/web build`.
- D├®ploy├® : `binance-relay`, `api`, `web`. Smoke checks : `wcore.xyz`, API health, relay health `200`.

---

## Historique : v0.2.40 ­ƒƒó ÔÇö Audit P0/P1 r├®solus, prod renforc├®e, KCC GM factory live

### Ô£à KCC GM factory live (chainId 321, 2026-06-05)

KCC est la 8e cha├«ne GM. Factory + GmOnChain deploy├®s en mainnet avec un build Paris d├®di├® (solc 0.8.19, no PUSH0) car KCC est pre-Shanghai.

- **Factory** : `0x76edb44d846b6378519aeed5c9ee2bcabcd2c15a` (block 52727377, tx `0x2a8a7ee9...`, 3490 chars bytecode, 0 PUSH0)
- **GmOnChain impl** : `0xd741c65517f883cd2b4c7cfbda3da110e8b41675` (block 52727373, tx `0x71d2ca39...`, 6246 chars bytecode, 0 PUSH0)
- **Wagmi config** : `kcc: { id: 321, name: "KCC Mainnet", nativeCurrency: { KCS, 18 }, rpcUrls: [rpc-mainnet.kcc.network, kcc.drpc.org, kcc-rpc.com], blockExplorers: [scan.kcc.io] }` + transport `http()`
- **Factory entry** : `packages/shared/src/factories.ts` ÔåÆ `kcc: { address: "0x76edb44d846b6378519aeed5c9ee2bcabcd2c15a", chainId: 321 }` avec commentaire de tx hashes et block numbers
- **Display label** : `GM_CHAIN_NAMES.kcc = "KCC Mainnet"` dans `apps/web/app/gm/gm-chains.ts`
- **Build Paris EVM** : `apps/web/public/build.json` a 4 entr├®es (`GmOnChain`, `GmOnChainParis`, `GmFactory`, `GmFactoryParis`). `build-selector.ts` `pickBuild()` choisit Paris pour `PARIS_BUILD_CHAINS = new Set(["KCC"])`. `build-json-paris.test.ts` (2/2) v├®rifie 0 PUSH0 au runtime.
- **UX guard DeployClient (commit `35f0434`)** : si `localStorage.gm_impl_${chainKey}` pointe vers un contrat avec bytecode vide, auto-clear + reset step "gm" + message erreur. Emp├¬che la re-saisie de contrats cass├®s.
- **V├®rifications prod** : `/api/chains` retourne KCC `{chainId:321, disabled:false, nativeSymbol:"KCS", rpcCount:3, explorerUrl:"https://explorer.kcc.io/en"}`, `/gm` 200 contient "KCC Mainnet".
- **D├®chets on-chain (orphelins, bytecode vide)** : `0x9cc14b...` (factory abandonn├®e #1), `0x83dde2...` (factory initiale), `0xf25ebed...` (GmOnChain initial Shanghai PUSH0 reverted). Restent on-chain pour tra├ºabilit├®.

### Ô£à Audit 2026-06-05 ÔÇö P0/P1 ferm├®s

Tous les P0 et P1 list├®s dans l'audit 2026-06-05 sont r├®solus. Les P2/P3 restent en backlog (consolid├®s dans `docs/AUDIT.md`).

| Priorit├® | Sujet | Commit | Tests |
|----------|-------|--------|-------|
| P0-1 | `forceRefresh` propag├® aux engines | `80ea1ff` | `scan-cache-policy.test.ts` (15/15) |
| P0-2 | Empty cache bypass EVM/SVM | `4d654b1` | `evm.test.ts` + `svm.test.ts` |
| P1-1 | `/api/gm/status-onchain` auth + EVM regex | `8b34385` | `gm-onchain-status.test.ts` (3/3) |
| P1-2 | Rate-limit post-auth | `77a8408` | `rate-limit-hook-order.test.ts` (5/5) |
| P1-3 | AbortController sur timeouts scan | `2b0feaf` | `scan-timeout.test.ts` (5/5) |
| P1-4 | `deploy.ps1` exit code | `cc67375` | `deploy-ps1.test.ps1` (3/3) |
| P1-5 | ChainCard contract-aware scam | `936e963` | `scam-overrides.test.ts` (21/21) |

### ÔÅ│ Audit 2026-06-05 ÔÇö P2/P3 en backlog

| Priorit├® | Sujet | Action minimale |
|----------|-------|-----------------|
| P2 | Metrics/circuits publics | Prot├®ger `/api/stats` et `/api/circuit` ou r├®duire le payload public. |
| P2 | DNS rebinding guard non appliqu├® partout | Wrapper `safeFetchPublicHttp()` et remplacement des fetch RPC. |
| P2 | Docker/deps/docs | Corriger build args/chown `apps/web/Dockerfile`, fusionner `devDependencies` dans `package.json`. |
| P2 | Validation statique GAS rouge | Corriger `src/16B_AUTO_HEAL.gs` ou ajuster les assertions. |
| P2 | Engines ne propagent pas `signal` vers `fetch` RPC | ├ëtendre le support `AbortSignal` dans EVM/SVM/Cosmos/TON. |
| P3 | Diverses observations | `apps/web/hooks/useGmContracts` publication cross-user, `PreferencesProvider` fetch FX relatif, etc. |

### Ô£à TON / The Open Network

### Ô£à TON / The Open Network
- Nouvelle VM support├®e (`vm: "TON"`) : native Toncoin 9 decimals, jettons via TonAPI avec Toncenter fallback. Engine standalone `packages/core/src/engines/ton.ts`. Cha├«ne ajout├®e ├á `packages/core/src/chains/TON.ts` (RPC `https://tonapi.io/v2` + `https://toncenter.com/api/v2`, `NATIVE_LLAMA_ID: "coingecko:the-open-network"`).
- D├®tection wallet partag├®e (regex `(EQ|UQ|Ef|Uf)[A-Za-z0-9_-]{40,60}` + raw `-1:hex64`) dans `@wcore/shared`. UI : ic├┤ne ­ƒîè, VmBadge cyan, ChainSelector, HomePageClient placeholder, default chains.
- Compteurs : 170+ live chains (EVM 168, SVM 2, Cosmos 11, TON 1), 5 tests TON ajout├®s (200/200 core tests pass).
- Home page : nouveau MiniCard "TON support" et mention "EVM, Solana, Cosmos, TON". About page : nouvelle section "TON (new)" dans chain coverage.
- Post X TON publi├® : `https://x.com/WCORExyz/status/2062515586609955222`. Assets : `apps/web/public/wcore-post-ton.svg` + `.png`.

### Ô£à Domaine et acc├¿s
- `wcore.xyz` est de nouveau op├®rationnel en HTTPS et sert le web Railway correctement.
- `/api/auth/nonce` g├®n├¿re maintenant un message SIWE dont le domaine/URI matche l'origin requ├¬te (`wcore.xyz` en prod), au lieu de tomber sur le premier `CORS_ORIGIN`.

### Ô£à Connect Wallet robuste en multi-extension
- WalletConnect QR fallback reste disponible m├¬me si `NEXT_PUBLIC_WC_PROJECT_ID` est vide localement : fallback int├®gr├® `3090760ada2bf4a459a27506fcdc16ec`.
- Le connecteur wagmi `injected()` n'est plus enregistr├® dans le config statique. Sous conflit MetaMask/Zerion, son chunk Turbopack peut throw `ReferenceError: injected is not defined` et casser `useConnectors()`.
- Les wallets EIP-6963 sont d├®couverts via `eip6963:announceProvider` puis connect├®s en direct (`eth_requestAccounts` + `personal_sign`) sans passer par wagmi `injected`.
- Le bouton `Connect Wallet` ouvre toujours le picker. WalletConnect est le chemin fiable quand `window.ethereum` est cass├® par des extensions concurrentes.

### Ô£à GM Header et page `/gm`
- Page `/gm` : un statut global absent/vide n'est plus transform├® en `deployed:false` pour toutes les cha├«nes. `deployed:null` d├®clenche un check cibl├® `has-deployed` par cha├«ne, ce qui ├®vite le faux affichage `Deploy GM Contract` partout.
- Header GM : apr├¿s un GM on-chain r├®ussi, le bouton `On-chain` reste d├®sactiv├® imm├®diatement gr├óce ├á l'├®tat local `wc_gm_onchain_chains`, m├¬me si le backend fire-and-forget n'a pas encore persist├® la tx.
- Header GM : un GM on-chain valide aussi le GM quotidien global, donc `Off-chain` est d├®sactiv├® et affiche `Done today` quand `alreadyOnChain=true`.

### Ô£à Communication X
- Post X publi├® : `https://x.com/WCORExyz/status/2062228120476725406`.
- Visuel pr├®par├® : `apps/web/public/wcore-post-site-back.svg` + `apps/web/public/wcore-post-site-back.png`.
- Message public : `WCORE is back on wcore.xyz`, avec mise en avant WalletConnect, SIWE propre, UX scan, 180+ chains et read-only scans.

### Ô£à R├®conciliation `wcore-gsheet` ÔåÆ `wcore-web`
- Note cr├®├®e : `docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md`.
- D├®cision : pas de merge automatique des `.gs` vers le web. Les changements r├®cents Apps Script sont class├®s en `Sheets-only`, `portable`, `d├®j├á couvert`, ou `├á v├®rifier`.
- Audit code web (2026-06-03) : RPC resilience d├®j├á couverte (`RpcHealthTracker`, `RpcHealth`, dispatcher, per-chain timeout, `loadChainlist()` + `warmDynamicRpcEndpoints` boot, `warnSingleRpcChains` startup). OutputSnapshot equivalent d├®j├á en place (`scan:result:*` + `shouldCacheAssets` + `hasCachedValue` + `forceRefresh`).
- Conclusion : **aucun port code ├á pousser** depuis `wcore-gsheet` pour ces deux sujets. Le pattern Apps Script est d├®j├á repr├®sent├® plus modernement c├┤t├® web (Redis versionn├®, conditions d'├®criture strictes, forceRefresh override).
- Cha├«nes : ne pas supprimer `MIND`, `ZERO`, `REDSTONE` c├┤t├® web sur la seule base des fichiers `.gs`; v├®rifier RPC/usage/GM/UI avant toute suppression.

### Ô£à Harmonisation RPC `wcore-gsheet` Ôåö `wcore-web` (2026-06-03)
- Audit live via `scripts/audit-rpcs.mjs` (170 cha├«nes EVM/SVM) : **8/170** 100% dead, **19/170** single/mostly-dead, **54/170** half-dead.
- 8 cha├«nes d├®sactiv├®es via `FLAGS.DISABLE_CHAIN=true` : `CROSS_MAINNET`, `ETHO_PROTOCOL`, `HAVEN1`, `MOCA_CHAIN`, `POLYNOMIAL`, `RIVALZ`, `STACK`, `SURFLAYER`.
- Nouveau module `packages/core/src/rpc/chain-health.ts` (`classifyChainHealth`, `isChainDisabled`).
- `validateChains` filtre les cha├«nes d├®sactiv├®es (sauf `WALLET_INCLUDE_DISABLED=1` debug).
- Note d├®taill├®e : `docs/rpc-harmonization-2026-06-03.md` ÔÇö matrice de d├®fense en 11 couches + patterns `wcore-web` ÔåÆ `wcore-gsheet` portables.
- 195/195 tests core OK. API build OK.

### V├®rifications
- Web typecheck : OK.
- `next build` web : OK.
- Tests cibl├®s GM : `gm-status-reconcile.test.ts` + `gm-storage.test.ts` OK.
- D├®ploiements web Railway successifs : Connect Wallet, GM status unknown, Header on-chain lock, Off-chain lock.

---

## ├ëtat courant : v0.2.42 ­ƒƒó ÔÇö 8 nouvelles GM factory chains + sprint audit P0/P1 (2026-06-11)

### Ô£à Ops + marketing 2026-06-12 ÔÇö backup DB r├®par├®, cycle X, post scam flags (v16)

- **Backup DB local r├®par├®** : `WCORE_DB_Backup` ├®chouait silencieusement depuis le 24/05 (`LastTaskResult: 2`, `scripts/.env.backup` supprim├® lors d'un nettoyage de secrets). Fichier recr├®├® depuis Railway (`DATABASE_PUBLIC_URL`), backup manuel + t├óche planifi├®e valid├®s, rotation 7 jours OK. **Incident : 19 jours sans backup, panne invisible** ÔÇö un check "dernier backup < 48h" reste ├á ajouter (voir backlog).
- **Cycle X** : 1 reply propre publi├®e et v├®rifi├®e (`https://x.com/WCORExyz/status/2065302791514452042`, checklist anti-scam `@nigredada`). ~50 posts ├®valu├®s, doublon `@Saimo0` ├®vit├®, shills exclus.
- **Post scam flags (v16)** : `https://x.com/WCORExyz/status/2065305153444405747` ÔÇö `Your total is lying.` Premi├¿re mise en avant publique du scam-detector. Visuel avec vrais logos TrustWallet (ETH/USDC/OP) + token scam anonyme. Workflow **draft-only** (`scripts/x-cycle/prepare-post.cjs`) : l'agent pr├®pare texte+image dans Chrome, l'utilisateur review et publie.
- **Post CEX wallets (2026-06-13)** : `https://x.com/WCORExyz/status/2065912993515233508` ÔÇö `Today's WCORE update. CEX wallets now live.` Daily update avec capture `/wallet` CEX scrolled. Visuel `apps/web/public/wcore-post-cex-wallets.svg/.png` (1200x675, DA v12) g├®n├®r├® par `scripts/build-post-cex-wallets.cjs` : titre `Wallets, on-chain and off.`, `ONE PORTFOLIO`, 2 chips CEX empil├®es (Binance losange jaune + Bitpanda cercle vert), grille 2├ù2 pills. Logos CEX : `cdn.simpleicons.org/binance/F0B90B` + JPEG officiel `apps/web/public/cex/bitpanda-official.jpeg` (fond vert `#27D17F` + B noir, clip├® en cercle).

### Ô£à 8 nouvelles GM factory chains live (2026-06-11)

Deuxi├¿me lot de huit cha├«nes GM factory en une semaine, portant le total ├á **72 GM chains live**. Toutes au **build Shanghai standard** (factory 1696 bytes / 61 PUSH0, impl 2237 bytes / 58 PUSH0). V├®rifications on-chain : `eth_chainId` + `eth_getCode(factory)` + count PUSH0 + `implementation()` + `baseFeePerGas`.

| # | Cha├«ne | chainId | Native | Factory address | GmOnChain impl |
|---|--------|--------:|--------|-----------------|----------------|
| 1 | **Gravity** | 1625 | G | `0x8d0cf2c602efdc3b696341cc03ec62e813771c48` | `0x2ae71ff4...cfb3fa` |
| 2 | **Merlin** | 4200 | BTC | `0x22606f8bb6a2419289583e7629fea788ece92ba7` | `0x7021fd9c...a5c6e1` |
| 3 | **Manta Pacific** | 169 | ETH | `0xf1ce6671f40506ee488a4cf69301cec187e33687` | `0xe7a59341...0ead12` |
| 4 | **Taiko Alethia** | 167000 | ETH | `0x2375bdb4f47835e984a863740a0d05c0278d37da` | `0xc2dcf502...e5d857` |
| 5 | **Plasma** | 9745 | XPL | `0xff7abfe8e0975d4f8c68b27f3c1053dc4f151a98` | `0xd04f39ca...083351` |
| 6 | **HashKey** | 177 | HSK | `0x4a36400e6717d4201e22baf66832f06d8ad54bb1` | `0x7e573cf5...42f2e3` |
| 7 | **Hemi** | 43111 | ETH | `0xd4930a277986021da6db82db18fd26e6c6c4a763` | `0x439169fc...5686d0` |
| 8 | **HyperEVM** | 999 | HYPE | `0xac53abe6ea605e37057cdb254768219f6eb183f0` | `0x6c247e1d...9fbd8` |

**Note Merlin** : pre-London (pas de `baseFeePerGas` ÔåÆ gas legacy) mais Shanghai-capable ÔÇö le build standard fonctionne. Pre-London Ôëá pre-Shanghai.

**Compteur mis ├á jour** : 72 GM chains live. Explorers v├®rifi├®s HEAD 200 sur les 8. Harmonisation 7 couches compl├¿te, tests de garde verts.

### Ô£à Cycle X 2026-06-11 ÔÇö post 72 GM chains + replies v├®rifi├®es

- **Publication principale** (par toi) : `https://x.com/WCORExyz/status/2065148361401917832` ÔÇö angle `8 more GM chains`, 72 chains live, personal contracts, creator fees, chain streaks.
- **Image** : `apps/web/public/wcore-post-gm-8-more-chains.png` + `.svg` (1200x675), g├®n├®r├®e par `scripts/build-post-gm-8-more-chains.cjs`. Le script privil├®gie `HEMI.svg` avant `HEMI.png` pour ├®viter l'ancien mascot/stale icon.
- **Engagement externe** : 3 replies authentiques publi├®es et v├®rifi├®es dans les threads + `@WCORExyz/with_replies` : `@Saimo0` (friction multi-outils), `@0xToxo` (historical value/current value), `@MacroBombastic` (too many chains / UX d'abord).
- **Cibles ignor├®es** : shill posts concurrents et posts automatis├®s GM Base. Pas de like/follow/DM.

### Ô£à GM deploy resilience / contrats orphelins (2026-06-11)

- **Cause** : certains deploys GM r├®ussissaient on-chain mais n'├®taient pas persist├®s si le POST backend ou la r├®cup├®ration du receipt laggait. R├®sultat : contrat visible on-chain mais absent de `/api/gm/contracts` / DB jusqu'au self-heal.
- **Fix** : retry serveur sur receipt deploy, retry frontend background apr├¿s ├®chec d'enregistrement, et `syncOnChainContracts()` partag├®/cibl├® par `/api/gm/status` et `my-contracts` pour r├®concilier les contrats manquants par cha├«ne.
- **Tra├ºabilit├®** : contrats on-chain retrouv├®s pour Merlin, Manta Pacific, Taiko Alethia, Plasma, HashKey, Hemi, HyperEVM. Gravity n'avait pas de `ContractDeployed` event d├®tectable et doit ├¬tre red├®ploy├®e si elle reste absente c├┤t├® DB.

### Ô£à Sprint audit P0/P1 (2026-06-11)

D├®tail : `docs/AUDIT.md` + CHANGELOG. R├®sum├® : Bearer prod deny-by-default, 23 tests routes scan async/batch (+2 bugs r├®els corrig├®s), lint 0/0, RealT TTL 7j, `mget` cache scan, `walletScan.create` fire-and-forget, suite API 207/207.

---

## ├ëtat pr├®c├®dent : v0.2.41 ­ƒƒó ÔÇö 8 GM factory chains + audit 2026-06-07 (2026-06-07)

### Ô£à 8 nouvelles GM factory chains live (2026-06-07)

Huit cha├«nes GM factory activ├®es dans la m├¬me semaine, portant le total ├á **64 GM chains live**. Toutes utilisent le **build Shanghai standard** (61 PUSH0, London EIP-1559), pas de fallback Paris n├®cessaire. V├®rifications on-chain pr├®alables : `eth_chainId` + `eth_getCode(factory)` (1696 bytes) + count PUSH0 (61) + `implementation()` + `baseFeePerGas` (London).

| # | Cha├«ne | chainId | Native | Factory address | RPCs | Commit |
|---|--------|--------:|--------|-----------------|------|--------|
| 1 | **Core DAO** | 1116 | CORE | `0x4532a3d14486bf7ac9cc3572d5db801711022312` | rpc.coredao.org | `5f739c3` |
| 2 | **Flare** | 14 | FLR | `0xbac99bdf0ec875dd9c20aa837441102665f4ab9a` | flare-api.flare.network | `7471a19` |
| 3 | **X Layer** | 196 | OKB | `0x7d684eec7555ea8db863cdebe59474b63aae7462` | rpc.xlayer.tech | `f69834b` |
| 4 | **Shibarium** | 109 | BONE | `0x04e5d61ba8cba9292b0a7f1d6242197a5ac7c0e4` | shibarium.drpc.org | `d546305` |
| 5 | **Degen** | 666666666 | DEGEN | `0xc3e5ef8c71712f55fabc6b3c07844a49103c9d8f` | rpc.degen.tips | `76907c6` |
| 6 | **Beam** | 4337 | BEAM | `0x972ccf14bd15754a3af879df4cb3416ddb000314` | build.onbeam.com + subnets.avax | `f27e1a7` |
| 7 | **Ronin** | 2020 | RON | `0x65e1912819c08e49a3c46eea3f05e9b60473807b` | api.roninchain.com | `24a57e5` |
| 8 | **opBNB** | 204 | BNB | `0x92d7a4784d4d11114f1eb79fe67b1ee0363b5748` | opbnb-mainnet-rpc.bnbchain.org + 3 fallbacks | `0b8f4aa` |

**Impl size uniforme** : 2237 bytes (GmOnChain template) sur les 8 cha├«nes ÔåÆ build source unique d├®ploy├® 8 fois sans modification.

**Fix Core explorer** (commit `e621bc4`) : `lib/explorers.ts` re├ºoit `core: https://scan.coredao.org` (HEAD 200, accepte `/address/<addr>`). Audit de coh├®rence 7 couches (factories, gm_names, SOON, wagmi const, wagmi array, explorers, DeployClient) ÔÇö toutes les 8 cha├«nes sont synchrones.

**Compteur mis ├á jour** : 64 GM chains live. Card count par VM : EVM 56+, SVM 4, Cosmos 4, TON 1.

### Ô£à Audit 2026-06-07/11 ÔÇö scorecard A-

Audit transversal (5 agents en parall├¿le sur structure/code/s├®curit├®/perf/doc) : **score global 8.6/10**. **Re-v├®rifi├® et consolid├® le 2026-06-11** dans `docs/AUDIT.md`. Sprint 1 appliqu├® : Bearer prod deny-by-default, tests routes scan async/batch, lint 0/0, RealT TTL 7 j, `@fastify/rate-limit` retir├®, cache scan `mget`, historique scan fire-and-forget.

| P0 | Sujet | Action minimale |
|---|-------|-----------------|
| P0-1 | `AUTH_ALLOW_BEARER=true` d├®faut prod | Ô£à Corrig├® : deny-by-default en prod, override explicite `AUTH_ALLOW_BEARER=true` seulement |
| P0-2 | `/api/gm/status-onchain` amplification RPC | Corrige : auth/ownership/zod OK + cache court memoire 5 min par `(chain,address,UTC day)` |
| P0-3 | `scan.ts` routes async/batch sans tests | Ô£à Corrig├® : `apps/api/test/scan-plugin-routes.test.ts` 23/23 |

| P1 principaux | Action |
|---|---|
| P1-1 ConnectButton TDZ bug | Ô£à Corrig├® + lint workspace 0 erreur / 0 warning |
| P1-2 N+1 upsert loops GM | Corrige : batch `findMany` + `createMany({ skipDuplicates: true })` + `updateMany`, protection owner existant |
| P1-3 `@fastify/rate-limit` mort | Ô£à Retir├® |
| P1-4 EVM empty cache 1h | Ô£à Corrig├® : TTL empty EVM 10 min + liveness check |
| P1-5 RealT cache permanent | Ô£à Cap Redis 7j safety sur `realt:registry:v2` |
| P1-6 useScanOrchestrator 0 tests | Tests happy path + abort |
| P1-7 GM on-chain POST 0 E2E | Test anti-replay + points |

### ÔÅ│ Audit 2026-06-07 ÔÇö backlog P2/P3 (16 + 11 items)

Voir `docs/AUDIT.md` section ┬º3 (P2/P3). Points saillants :

- **P2-1** : Resolu partiellement 2026-06-21 - `/api/stats` et `/api/circuit` admin-only ; restent `/api/metrics/errors(/detail)` et `/api/admin/scam-overrides` a traiter separement.
- **P2-3** : 18 fichiers acc├¿dent `process.env` directement ÔåÆ centraliser dans `src/config.ts` avec zod validation
- **P2-5** : resolu 2026-06-20 - cache court `status-onchain` 5 min par `(chain,address,UTC day)` pour eviter des `eth_getLogs` repetes
- **P2-6/P2-7** : Ô£à `prisma.walletScan.create` fire-and-forget + cache scan `mget`
- **P2-10** : `AGENTS.md` = 2 docs en 1 (Apps Script legacy + Web moderne) ÔåÆ split en `docs/apps-script.md` + `docs/wcore-web-guide.md`
- **P2-12** : Ô£à scripts contracts rendus portables (`__dirname`/`path.join`), plus cleanup du g├®n├®rateur X v15 historique.
- **P2-13** : API Docker image ~500 MB unpruned ÔåÆ `pnpm deploy --prod` (~200 MB)
- **P2-14** : Resolu 2026-06-21 - `CONTRIBUTING.md` et `TESTING.md` ajoutes ; `docs/TROUBLESHOOTING.md` existe deja.
- **P2-15** : Pas de `.nvmrc` (Node 20 CI / 22 Docker / >=20.10 engines ÔÇö 3-voies mismatch)
- **P2-16** : Ô£à R├®solu (2026-06-13) ÔÇö `scripts/check-backup-freshness.ps1` v├®rifie que le backup le plus r├®cent (`backups/wcore-backup-*.json|.sql`) a moins de 48h. Si p├®rim├®/absent : ├®crit `backups/LAST_ERROR.txt` (cause + fix) + toast Windows + exit 1. Self-clear du marqueur quand sain. T├óche planifi├®e s├®par├®e `WCORE_DB_Backup_Check` (quotidienne 11:00, apr├¿s le backup de 03:00) via `scripts/setup-backup-check-task.ps1`. Test├® : sain ÔåÆ exit 0 + marqueur supprim├®, p├®rim├® ÔåÆ exit 1 + `LAST_ERROR.txt`, `LastTaskResult: 0`.

### Ô£à Cycle X 2026-06-07

- **Publication principale** (par toi) : "8 more GM chains" v15 (commit `4dbeb03`) ÔÇö image `wcore-post-gm-8-new-chains.png` (1200x675) avec grille 4x2.
- **Wobblhash repost d├®tect├®** (interne, pas d'engagement).
- **2 replies externes authentiques** post├®es et v├®rifi├®es : `nftbestart` (Mehdiweb3) sur l'angle AI + wallet read-only, `alphacyl` (Alpha.rwa | Adi) sur MANTRA recap + read-only wallet view.
- **Script durable** : `scripts/x-cycle/post-replies.cjs` avec `sanitize()` guard contre em-dash (incident : 1er post contenait un em-dash, supprim├® manuellement, puis re-post├® propre).
- 0 like, 0 follow, 0 DM (read-only par d├®faut, conforme gotcha 2026-05-23).

### V├®rifications

- `pnpm typecheck` : passe sur 5 packages apr├¿s `prisma generate`.
- `pnpm lint` : **34 errors / 8 warnings** (exit 1 ÔÇö la CI ne fail pas, ├á corriger).
- `pnpm build` : passe, 4 packages compilent, 17 Next.js routes.
- Tests de garde GM : 8/8 verts apr├¿s chaque activation.
- `/api/chains` retourne 64 GM chains live + chainId par cha├«ne v├®rifi├® on-chain.
- 14 commits unpushed (work-in-flight transparent).

---

## Le projet en 30 secondes

WCORE existe aujourd'hui dans `src/*.gs` (Google Apps Script + Google Sheets). Il analyse 180+ blockchains (EVM, Solana, Cosmos) pour calculer la valeur d'un wallet en EUR avec une cascade de prix robuste (DefiLlama ÔåÆ DexScreener ÔåÆ GeckoTerminal ÔåÆ CoinGecko ÔåÆ Jupiter). La couverture web inclut d├®sormais 100 % des mainnets onchaingm.com et surflayer.xyz, plus les principales zones Cosmos (Celestia, Noble, Neutron, dYdX, Kava, Stride, Stargaze).

**Objectif** : transformer cette logique m├®tier en application web (saisie d'adresse ÔåÆ dashboard moderne style DeBank/Zapper/Zerion), puis ajouter une couche produit (auth wallet, qu├¬tes journali├¿res, GM, streaks, badges).

**Contrainte forte** : `src/` reste op├®rationnel pendant toute la migration. Sheets continue de tourner. Aucune perte de service.

---

## Audit 2026-05-30 ­ƒöÄ ÔÇö Backlog ouvert

Audit transversal post-v0.2.37 (4 domaines parall├¿les). D├®tails : `docs/audit-2026-05-30-complet.md`. Bilan vert au moment de l'audit (typecheck/lint/core 186 pass/0 vuln).

### P1

| ID | Sujet | Fichier | Statut |
|----|-------|---------|--------|
| API-2 | GM on-chain : binding `receipt.from === user` | `gm-onchain.ts` | Ô£à corrig├® + test |
| Core-1 | RpcHealthTracker : decay par-endpoint | `rpc/rpc-health.ts` | Ô£à corrig├® + test |
| FE-1 | ChainCard : fan-out GM gate `initialStatus` | `ChainCard.tsx` | Ô£à corrig├® |
| FE-2 | WalletContent : merge ref ÔåÆ useEffect | `WalletContent.tsx` | Ô£à corrig├® |
| INFRA-1 | `pnpm test` racine inclut web + `test:api` | `package.json` | Ô£à corrig├® |
| INFRA-2 | `solc` dead dep + override `tmp` retir├®s | `apps/web/package.json` | Ô£à corrig├® (0 vuln) |
| FE-3 | refresh par wallet scop├® (force uniquement ce wallet) | `useScanOrchestrator.ts` | Ô£à corrig├® |
| API-1 | GM score double-comptage (self-heal hors tx) | `gm-streak-rebuild.ts` | Ô£à corrig├® + tests idempotence case-insensitive (`fa17a10`) |

### P2 ÔÇö corrig├®s

| ID | Sujet | Statut |
|----|-------|--------|
| Core-2 | Cosmos : denoms non-ibc inconnus skip au lieu de 6 d├®cimales | Ô£à corrig├® + test |

### P2 ÔÇö important (voir doc audit)
Core-2 (Cosmos non-ibc decimals), Core-3 (EUR stables), API-3 (gm/random fan-out), API-4 (rate-limit fallback non-atomique), API-5 (share permanent), API-6 (creatorAddress overwrite), FE-4/5/6/7 (perf render), INFRA-3/4/5/6 (deps/dockerfile/env).

### P3 ÔÇö nits
Core-4/5, FE-8/9/10, INFRA-7/8, API-7 (voir doc).

---

## ├ëtat courant : v0.2.37 ­ƒƒó ÔÇö Audit complet H4/H7 + GM fixes + icons (2026-05-29)

### Ô£à Audit complet ÔÇö H4/H7/H8
- **H4** split `evm.ts` : 1498 lignes ÔåÆ 5 modules (`evm-types.ts`, `evm-balances.ts`, `evm-pricing.ts`, `evm-scan.ts`, `evm-batch.ts`) + barrel `evm.ts` (42 l.). Zero changement consommateur. 186 tests core OK.
- **H4** split `WalletContent.tsx` : 1231 lignes ÔåÆ 487 + hooks (`useScanOrchestrator`, `useWalletLabels`) + composants (`PostScanBanner`, `ScanProgressBanner`, `PortfolioSummaryCard`, `WalletSelector`, `AllTokensTable`) + utilitaire `scan-api.ts`.
- **H7** console.log cleanup : 3 debug logs supprim├®s (2 dans ConnectButton, 1 dans gm-contracts).
- **H8** as any : 17 casts identifi├®s (audit complet), 3 quick wins corrig├®s (window.ethereum global type, fetchNativePrice param├®tr├®, chain key normalization), le reste document├®.
- Le├ºon : `pnpm typecheck` (tsc) ne couvre PAS les m├¬mes erreurs que `next build` ÔÇö 3 erreurs de type introduites par le split n'ont ├®t├® vues que par `next build`. **Toujours lancer `pnpm --filter @wcore/web build` avant un deploy web.**

### Ô£à Scan scheduler parall├¿le
- Ancienne s├®rialisation : pool non-EVM compl├¿te ÔåÆ puis pool EVM. Temps ~244s.
- Nouvelle pool unique prioris├®e : SVM/Cosmos en t├¬te de file, EVM remplit les slots restants en parall├¿le. Pas d'attente s├®quentielle.

### Ô£à GM rate_limited header fix
- **Cause racine** : page `/gm` rend ~30 cartes, chaque carte refaisait `/api/gm/has-deployed` + `/api/gm/status` (m├¬me endpoint global) ÔåÆ 60-90 appels `gm_read` ÔåÆ bucket 90/min ├®puis├® ÔåÆ header `GET /api/gm/random` tombait en 429.
- **Fix** : `gmStatusFetchPlan(initialStatus)` ÔÇö quand la page a d├®j├á fetch├® le status global, les cartes ne le refont plus. Seul le reconcile `status-onchain` cibl├® si n├®cessaire.
- **Defense-in-depth** : `RATE_LIMIT_GM_READ` bump├® ├á 300 (configurable via env).

### Ô£à GM native price "undefined" fix
- **Cause racine** : `fetchNativePrice()` utilisait `config.chainKey` (undefined pour le header) ÔåÆ `/api/price/native?chain=undefined` ÔåÆ price null ÔåÆ throw.
- **Fix** : `fetchNativePrice(chainKey)` param├®tr├®. Header passe le chainKey r├®solu par `getRandomContract()`.

### Ô£à INCENTIV phantom chain removed
- INCENTIV n'existe que comme testnet (chainId 16350) ÔÇö banni par "no testnets in WCORE". Le chainId 24101 dans le code ├®tait un fant├┤me : RPC mort, absent de chainid.network. Retir├® de wagmi.ts, DeployClient, GmPageClient, manifest, chain-native-symbols, asset SVG.

### Ô£à Chain icons
- 5 logos remplac├®s (emoji ÔåÆ vrai logo) : ETHO_PROTOCOL, EDGELESS, LAYERAI, AVES_NETWORK, AWAJI.
- 13 placeholders `?` (fichiers PNG question-mark) remplac├®s par de vrais logos ou fallback propre (NEXUS, STEP_NETWORK, HYCHAIN, CROSSBELL, NEXI_CHAIN, LUMIO, BXN, MOCA_CHAIN).
- Test de garde ajout├® : refuse les placeholders `?` dans le manifest.

### D├®ploiements v0.2.37
- API : `c9b3721` (GM rate limit fix + split evm.ts) + `01cd2a1` (SVM/Cosmos retry) + `8096046` (Cosmos REST failover).
- Web : `39797ad9` (all fixes + INCENTIV removal + icons + splits).

### V├®rifications
- core test : 186/186 pass. typecheck : OK. lint : OK.
- `next build` : OK (la commande Railway).

---

## ├ëtat courant : v0.2.36 ­ƒƒó ÔÇö SVM/Cosmos robustesse (2026-05-29)

### Ô£à Fix SVM/Cosmos affichant 0 EUR ÔÇö 3 niveaux
Les wallets SVM/Cosmos affichaient 0 EUR pendant les gros scans alors que le backend retournait les bonnes donn├®es en isolation (v├®rifi├® : SVM 7.28Ôé¼, Injective 0.57Ôé¼). Cause : les RPCs non-EVM (lents, sans consensus, throttl├®s) ├®taient noy├®s par le flot EVM (concurrence 50) et fail-once ÔåÆ 0.

- **Niveau 1 (frontend)** : pool d├®di├® non-EVM scann├® EN PREMIER, avant le flot EVM ÔåÆ acc├¿s RPC propre. WalletContent.tsx.
- **Niveau 2 (backend)** : retry-on-degradation. Si un scan SVM/Cosmos revient d├®grad├® + 0, l API relance jusqu ├á 3├ù (NON_EVM_SCAN_RETRIES) avec backoff. Un r├®sultat avec valeur n est jamais retent├®. scan.ts + isRetriableNonEvmResult().
- **Niveau 3 (RPC)** : Cosmos engine supporte REST_URLS array avec failover transparent (swap du pr├®fixe base sur 5xx/r├®seau). COSMOS_HUB/INJECTIVE/TERRA ont 3 endpoints REST chacun. SOLANA passe ├á 3 RPCs. cosmos.ts, 	ypes.ts, chains.

### D├®ploiements v0.2.36
- Web : pool non-EVM prioritaire.
- API : retry-on-degradation + Cosmos REST failover + SVM 3e RPC.

### V├®rifications
- 	ypecheck : OK. lint : 0 erreur, 0 warning. core test : 186 pass.
- Test prod : 3 wallets SVM retournent 7.28Ôé¼/5.15Ôé¼/22.21Ôé¼ (├®taient 0).

---

## ├ëtat courant : v0.2.35 ­ƒƒó ÔÇö Audit 2026-05-29 phases 1/2/3a d├®ploy├®es (2026-05-29)

### Audit 2026-05-29 ÔÇö 3 phases corrig├®es et d├®ploy├®es

#### Phase 1 ÔÇö Quick wins (commit `3342d94`)
- **S2 Docker non-root** : `USER node` sur les runners api + web. Rollout health-gated.
- **H1 `test` racine** : agr├®gat r├®el `typecheck + tests packages` au lieu de `validate:static` (faux vert).
- **H2 `.env.example`** : `ADMIN_TOKEN` document├® (Bearer/`x-admin-token`, timingSafeEqual, unset ÔåÆ 401).
- **H9 `validate-static.js`** : exit 1 sur 2 checks GAS (`SYNC_J1_ALL_SHEETS`, `WCORE_AUTO_HEAL`). D├®coupl├® du `test` racine.

#### Phase 2 ÔÇö S├®curit├® en profondeur (commit `ba17832`)
- **S1 Refresh token atomique** : primitive `CacheStore.add()` (Redis `SET NX`, fail-closed) + `claimAndRevokeToken()` single-use dans `/api/auth/refresh`. Tests core 185 pass.
- **F1 Switch GM fix** : flag `providerConfirmed` accept├® dans le guard final de `sendGm`/`deployContract`.

#### Phase 3a ÔÇö Refact qualit├® (commit `156712b`)
- **H3 `strict:true` web** : activ├® + 27 erreurs corrig├®es par de vrais fixes de typage (0 `as any`).
- **H5 Code-splitting** : d├®j├á satisfait (4 `next/dynamic({ssr:false})`). Faux positif.

#### D├®ploiements v0.2.35
- API : d├®ploy├®e avec toutes les phases (Docker non-root + refresh atomique + ADMIN_TOKEN doc).
- Web : d├®ploy├®e avec toutes les phases (strict:true + switch GM fix).

### Backlog audit ouvert

| ID | Sujet | Statut | Priorit├® |
|----|-------|--------|----------|
| H4 | Split `evm.ts` / `WalletContent.tsx` | Ô£à R├®solu (v0.2.37) | ÔÇö |
| H7 | 30 `console.log/debug` applicatifs | Ô£à R├®solu (v0.2.37, 3 debug logs) | ÔÇö |
| H8 | 17 `as any` casts | Audit complet fait, 3 quick wins corrig├®s, le reste document├® | P3 mineur |

### v0.2.34 ÔÇö GM B3 + Connect fix (2026-05-28)
- conserv├® ci-dessous

### Ô£à Connect flow ÔÇö 4 bugs critiques corrig├®s
- **Erreur invisible en "ready"** : le message d'erreur de login n'├®tait pas affich├® dans la vue "Sign In" ÔåÆ boucle silencieuse.
- **`res.ok` manquant** : pas de check HTTP sur la r├®ponse login ÔåÆ 500/502/serveur-down cassait le JSON.
- **`chainId` hardcod├® ├á 1** : quand le wallet ├®tait d├®j├á connect├®, `chainId=1` ÔåÆ certains wallets refusaient de signer.
- **Flickering** : l'effet wagmi appelait `setAddress` ├á chaque changement d'`authStep` ÔåÆ doubles re-renders inutiles.
- Fichiers : `ConnectButton.tsx`.

### Ô£à GM B3 ÔÇö 3 fixes de r├®silience
- **`has-deployed` scan on-chain** : quand la DB n'a aucun contrat pour le user/cha├«ne, scanne les logs factory on-chain pour retrouver les contrats d├®ploy├®s via l'ancien flow fire-and-forget.
- **`/api/gm/onchain` retries ├®tendus** : 10 retries avec backoff progressif (~2 min max) pour les cha├«nes ├á RPC lents (B3, etc.).
- **Frontend fire-and-forget** : le backend est appel├® en arri├¿re-plan (3 retries, timeout 15-45s), l'UI affiche Ô£à GM imm├®diatement apr├¿s confirmation MetaMask.
- Fichiers : `gm-contracts.ts`, `gm-onchain.ts`, `useOnChainGm.ts`.

### D├®ploiements v0.2.34
- API : `c4f3a40a` ÔåÆ `SUCCESS` (has-deployed scan + GM retries 10x)
- Web : `4ebc431d` ÔåÆ `SUCCESS` (connect fixes + GM fire-and-forget)

### V├®rifications
- `rtk pnpm typecheck` : OK.
- `rtk pnpm lint` : 0 erreur, 6 warnings react-hooks.
- `rtk pnpm --filter @wcore/core test` : OK, 185 pass (CacheStore.add tests Phase 2).
- `rtk pnpm audit --prod --audit-level=high` : OK.

### v0.2.33 ÔÇö Audit P0/P1 fixes (2026-05-28)
- conserv├® ci-dessous

### Ô£à GM refactoring ÔÇö centralisation helpers + suppression dead code
- `gm-storage.ts` : 7 helpers localStorage GM centralis├®s (plus de `localStorage` direct dans les composants).
- `checkOnChainDeployed` supprim├® (code mort 35 lignes).
- `nativeIds` mapping supprim├® (43 lignes, utilise API `/api/price/native`).
- `KNOWN` contracts workaround supprim├® (auto-registration plus n├®cessaire).
- `GM_PLATFORM_OWNER` extrait dans `@wcore/shared`.
- Nettoy├® ~200 lignes de code dupliqu├®/dead/hardcod├®.

### Ô£à GM fixes critiques
- `getRandomContract` : `fetch()` ÔåÆ `apiFetch` (JWT envoy├® ÔåÆ filtre balance actif).
- `fetchNativePrice` : `fetch()` brut + fallback $2000 ÔåÆ `apiFetch` + throw (plus de tip minuscule sur cha├«nes non-ETH).
- Balance threshold `$0.05` ÔåÆ `$0.10` (marge gas fees).

### D├®ploiements v0.2.32
- Web `8af919d` ÔåÆ `SUCCESS` (fetchNativePrice + getRandomContract fixes).
- API `f59ab5e` ÔåÆ `SUCCESS` (balance threshold $0.10).

### Ô£à Notifications ÔÇö suppression spam + revival fix
- Scan notifs (`scan_done`/`scan_degraded`) supprim├®es de la cr├®ation DB + filtr├®es de toutes les requ├¬tes + cleanup one-shot au boot API.
- `lastActionAt` ref bloque SSE/polling 5s apr├¿s `markAllRead`/`markAsRead`.
- `isAuthenticatedRef` corrige la stale closure : plus de race entre fetch async et d├®motion d'auth.
- Mark-read update optimiste imm├®diate avec revert+fetch si l'API ├®choue.
- Affichage notifs/GM withdrawable conditionn├® ├á `authStep === "authenticated"`.

### Ô£à Auth ÔÇö plus de d├®connexion au Ctrl+Shift+R
- Access token TTL 15min ÔåÆ 24h (`apps/api/src/auth.ts`).
- `authStep === "expired"` promu en `"ready"` quand MetaMask reconnect.

### Ô£à Cache stale `scan:result` (suite v0.2.30, renomm├® v0.3.1)
- `hasCachedValue()` rejette les entr├®es o├╣ `native.balance > 0` mais `priceEur == null`.

### Ô£à Bouton "Retry timed-out chains"
- Bouton dans la banni├¿re orange qui relance `fetchBatchScan` pour les cha├«nes en timeout uniquement.

### D├®ploiements v0.2.31
- API `48f1af2d` ÔåÆ `SUCCESS`, Web `143203eb` ÔåÆ `SUCCESS`.

---

## ­ƒöÄ Audit complet ÔÇö 2026-05-29

Rapport d├®taill├® : `docs/audit-2026-05-29-complet.md`. Audit transversal lecture seule de l'arbre courant (post v0.2.34) : s├®curit├®/API, core scan/pricing, frontend, infra/CI/docs, qualit├®/hygi├¿ne.

### Synth├¿se active

| Axe | Statut | Priorit├®s |
|-----|--------|-----------|
| **S├®curit├®/API** | ­ƒƒó sain | P0 GM 2026-05-28 corrig├®s. Ô£à S1 rotation refresh token atomique, Ô£à S2 Docker non-root. |
| **Core scan/pricing** | ­ƒƒó sain | EVM batch `DISABLE_NATIVE_BALANCE` + negative cache liveness OK, cascade verte, test flaky retir├®. Reste ­ƒöÂ fallback prix natif GM `2000` (F2). |
| **Frontend** | ­ƒƒó sain | `pnpm lint` 0 erreur, AbortController OK, Ô£à F1 switch GM, Ô£à H3 `strict:true` web. Ô£à H5 code-splitting d├®j├á en place. Reste ÔÅ¡´©Å split `evm.ts`/`WalletContent.tsx` (H4, diff├®r├®), ­ƒöÂ 6 warnings hooks (H6). |
| **Infra/CI/docs** | ­ƒƒó r├®solu | Ô£à O1 commit├® (`4af4eab`) + d├®ploy├® api+web. Reste ­ƒöÂ `test` racine = `validate:static` faux-vert (H1), `.env.example` sans `ADMIN_TOKEN` (H2). |

### Bilan vert (v├®rifi├®)

- `pnpm -s typecheck` Ô£à ┬À `pnpm -s lint` Ô£à (0 erreur, 6 warnings hooks) ┬À `pnpm --filter @wcore/core test` Ô£à (suite compl├¿te) ┬À `pnpm audit --prod --audit-level=high` Ô£à 0 vuln.
- 522 fichiers source, 53 fichiers de test, 181 cha├«nes. 0 `@ts-ignore`, 1 TODO, 30 `console.log` applicatifs.

### Backlog issu de l'audit 2026-05-29

| Priorit├® | ID | Sujet | Fichier(s) | Action |
|----------|----|-------|------------|--------|
| ~~P0 ops~~ Ô£à | O1 | ~~Batch v0.2.33/v0.2.34 non commit├® + non d├®ploy├®~~ | arbre courant, `CHANGELOG.md` | Ô£à Commit├® (`4af4eab`) + pouss├® `origin/master` + d├®ploiements Railway d├®clench├®s (API `48f1af2d`/`a19291bc`, Web `143203eb`/`af460499`). P0 s├®curit├® GM en route vers la prod. |
| ~~P2~~ Ô£à | S1 | ~~Rotation refresh token non atomique~~ | `apps/api/src/auth.ts`, `packages/core/src/cache/*` | Ô£à Primitive atomique `CacheStore.add()` (Redis `SET NX`, fail-closed) ; `claimAndRevokeToken()` consomme le jti single-use ÔåÆ replays/race rejet├®s. Tests : `cache.test.ts` (single-use + concurrence). |
| ~~P2~~ Ô£à | S2 | ~~Conteneurs Docker en root~~ | `apps/api/Dockerfile`, `apps/web/Dockerfile` | Ô£à `USER node` sur les runners. API corrig├®e avec `COPY --chown=node:node ...` au lieu de `RUN chown -R node:node /app` pour ├®viter le timeout Railway sur `node_modules`. |
| ~~P2~~ Ô£à | F1 | ~~Faux n├®gatif switch-r├®seau GM~~ | `apps/web/hooks/useOnChainGm.ts` | Ô£à Flag `providerConfirmed` (set sur match `eth_chainId` OU wagmi) accept├® dans le guard final de `sendGm` + `deployContract` ÔåÆ plus de blocage quand wagmi lague. |
| ~~P2~~ Ô£à | F2 | ~~Fallback prix natif GM `2000`~~ | `apps/web/hooks/useOnChainGm.ts` | Ô£à **Faux positif** : le seul `2000` est `setTimeout(r, 2000)` (polling receipt). `fetchNativePrice` throw d├®j├á (corrig├® v0.2.32). |
| ~~P2~~ Ô£à | H1 | ~~`test` racine = `validate:static`~~ | `package.json` | Ô£à `test` = `pnpm -r typecheck && tests packages` (agr├®gat r├®el, vert : typecheck + 182 tests core). |
| ~~P2~~ Ô£à | H2 | ~~`.env.example` sans `ADMIN_TOKEN`~~ | `.env.example` | Ô£à Section Admin/ops ajout├®e (`ADMIN_TOKEN`, Bearer/`x-admin-token`, timingSafeEqual, unset ÔåÆ 401). |
| P3 | H9 | `validate-static.js` exit 1 (nouveau) | `scripts/validate-static.js`, `src/*.gs` | 2 checks GAS ├®chouent (`SYNC_J1_ALL_SHEETS` trigger, `WCORE_AUTO_HEAL` vs `BUILD_RPC_LOOKUP`). D├®coupl├® de `test`. ├Ç investiguer c├┤t├® GAS (hors p├®rim├¿tre web). |
| ~~P3~~ Ô£à | H3 | ~~`strict:false` sur web tsconfig~~ | `apps/web/tsconfig.json` + 10 fichiers | Ô£à `strict:true` activ├® (`noImplicitAny:false` retir├®). 27 erreurs corrig├®es par de vrais fixes de typage (label `string\|null`, `priceSource`, guards, annotations) ÔÇö 0 `as any`. typecheck/lint/tests verts. |
| P3 ÔÅ¡´©Å | H4 | Fichiers > 1000 lignes | `engines/evm.ts` (1499), `WalletContent.tsx` (1207) | **Diff├®r├®** : dette d'architecture pure, ├á splitter dans une session d├®di├®e avec validation UI (typecheck ne couvre pas les r├®gressions de rendu/hydratation de `WalletContent`). |
| ~~P3~~ Ô£à | H5 | ~~Pas de code-splitting web~~ | `HomePageClient`, `WalletContent`, `ScanDetailClient`, `TopBar` | Ô£à **D├®j├á satisfait** : 4 `next/dynamic({ ssr:false })` (WelcomeModal, ValueDistribution, GmWithdrawNotification). Aucune lib lourde import├®e en eager. L'audit ne mesurait que `page.tsx` (server shell, normal ├á 0). |

---

## ­ƒöÄ Audit complet lecture seule ÔÇö 2026-05-28

Rapport d├®taill├® : `docs/audit-2026-05-28-complet.md`.

### Synth├¿se active

| Axe | Statut | Priorit├®s |
|-----|--------|-----------|
| **S├®curit├®/API** | ­ƒƒó r├®solu | Ô£à GET GM read-only, Ô£à deploy v├®rifi├® on-chain, Ô£à limite scan anonyme appliqu├®e |
| **Core scan/pricing** | ­ƒƒó r├®solu | Ô£à batch EVM respecte `DISABLE_NATIVE_BALANCE`, Ô£à negative cache EVM avec liveness check |
| **Frontend** | ­ƒƒó r├®solu | Ô£à `pnpm lint` 0 erreur, Ô£à hooks corrig├®, ­ƒöÂ scans non abort├®s / switch GM (P2) |
| **Infra/docs** | ­ƒƒó r├®solu | Ô£à scripts X dry-run, Ô£à `clearAuthCookies` complet, ­ƒöÂ Docker runtime / `pnpm test` racine (P2) |

### P0/P1 issus de l'audit 2026-05-28 ÔÇö CORRIG├ëS

| Priorit├® | Sujet | Fichiers principaux | Action |
|----------|-------|---------------------|--------|
| P0 | Ô£à GET GM avec effet de bord DB | `gm-contracts.ts` | Supprim├® l'upsert + sync fire-and-forget de `GET /api/gm/has-deployed` |
| P0 | Ô£à Deploy GM enregistr├® avant v├®rification | `gm-contracts.ts` | V├®rification receipt/factory/event/cr├®ateur AVANT `prisma.gmContract.create()` |
| P1 | Ô£à Limite anonymous scan ignor├®e | `scan.ts` | Helper `resolveScanChainLimit()` utilis├® sur sync/batch/async |
| P1 | Ô£à Lint bloquant + hooks | `GmWithdrawButton.tsx` | `useCallback` avant early return + 15 unused/catch nettoy├®s |
| P1 | Ô£à Batch EVM lit native malgr├® flag disabled | `evm.ts` | `disableNative` appliqu├® dans `getEvmWalletsAssets()` |
| P1 | Ô£à Negative cache EVM sans liveness | `evm.ts` | `canServeEmptyCache()` v├®rifie `eth_getBalance` avant cache hit |
| P1 | Ô£à Scripts X actionnables | `scripts/x-*.js` | Dry-run par d├®faut, flag `--execute-i-understand` requis |
| P2 | Ô£à `clearAuthCookies` incomplet | `auth.ts` | Utilise maintenant `COOKIE_OPTS` complets |
| P2 | ­ƒöÂ Frontend scan/switch/filter edge cases | `WalletContent.tsx`, `useOnChainGm.ts` | AbortController par scan, providerConfirmed, total filtr├® recalcul├® |

### V├®rifications post-fix 2026-05-28

- `rtk pnpm typecheck` : OK.
- `rtk pnpm lint` : OK (0 erreur, 6 warnings react-hooks existants).
- `rtk pnpm --filter @wcore/core test` : OK, 182 pass.
- `rtk pnpm --filter @wcore/web test` : 34/40 passent ; 6 tests UI n├®cessitent API locale.
- `rtk pnpm audit --prod --audit-level=high` : OK.

---

## ­ƒöÄ Audit global complet ÔÇö 2026-05-27

Rapport d├®taill├® : `docs/audit-2026-05-27-global.md`.

### Synth├¿se active

| Axe | Statut | Priorit├®s |
|-----|--------|-----------|
| **S├®curit├®/API** | ­ƒƒá action requise | access-token revocation, indexes DB, quotas scan anonyme/auth, N+1 GM random |
| **Frontend** | ­ƒƒá action requise | `TokenIcon` render purity, split `WalletContent`, a11y |
| **Core scan/pricing** | ­ƒƒá action requise | forceRefresh vs `empty:*`, resolver RPC dynamique dans engines, pr├®cision SVM/Cosmos |
| **Infra/docs** | ­ƒƒá action requise | rotation secrets expos├®s, CI API gated, version/test-count drift, docs cache |

### P0 imm├®diats

1. **Rotation secrets** : des valeurs r├®elles ont ├®t├® retir├®es de `AGENTS.md` et `ROADMAP.md`, mais elles doivent ├¬tre rotat├®es c├┤t├® fournisseur (Google OAuth client secret, Blockscout Pro API key).
2. **CI API integration** : `.github/workflows/ci.yml` a ├®t├® corrig├® pour exposer `TEST_DATABASE_URL` / `TEST_REDIS_URL` au niveau job. Confirmer au prochain run CI que `pnpm --filter @wcore/api test` s'ex├®cute vraiment.
3. **Ô£à Frontend GM factory lookup** : acc├¿s directs `GM_FACTORIES[chainKey]` retir├®s c├┤t├® web (`useOnChainGm`, `useGmContracts`) au profit de `getFactory(chainKey)` / helper case-insensitive.
4. **Ô£à CSRF API** : middleware pass├® en deny-by-default sur toutes les mutations `/api/*`, avec exceptions explicites uniquement pour `/api/auth/nonce` et `/api/auth/login`.

### Backlog audit prioris├®

| Priorit├® | Sujet | Fichiers principaux | Action |
|----------|-------|---------------------|--------|
| P0 | Secrets expos├®s dans docs | `AGENTS.md`, `ROADMAP.md`, `.gitleaks.toml` | Ô£à Valeurs retir├®es + r├¿gles gitleaks WCORE ajout├®es. Rotation fournisseur toujours obligatoire |
| P0 | CI API integration skip | `.github/workflows/ci.yml` | Corrig├® c├┤t├® job env, v├®rifier run CI r├®el |
| P0 | GM factory lookup web case-sensitive | `apps/web/hooks/useOnChainGm.ts`, `useGmContracts.ts` | Ô£à Corrig├® : helpers `getFactory()` / `getGmContractChainId()` case-insensitive + test web |
| P0 | CSRF incomplet | `apps/api/src/server.ts` | Ô£à Corrig├® : deny-by-default mutations `/api/*` + tests helper |
| P1 | GM public read sans rate-limit | `apps/api/src/server.ts`, `server-helpers.ts` | Ô£à Corrig├® : bucket `gm_read` sur `/api/gm/random`, `/api/gm/contracts`, `/api/gm/status` et autres GET GM |
| P1 | Scan anonyme trop permissif | `apps/api/src/server.ts`, `scan.ts` | Ô£à Corrig├® : `ANONYMOUS_MAX_CHAINS_PER_SCAN` d├®faut 20, auth garde le plan 120 |
| P1 | Access token 24h non r├®vocable | `apps/api/src/auth.ts` | Ô£à Corrig├® : access tokens sign├®s avec `jti`, auth hook v├®rifie la revocation, refresh/logout r├®voquent l'access cookie courant |
| P1 | Indexes DB hot paths | `packages/db/prisma/schema.prisma` | Ô£à Corrig├® : indexes GM/notifs/leaderboard + migration additive |
| P1 | N+1 `/api/gm/random` | `gm-contracts.ts` | Ô£à Corrig├® : `findMany` batch sur `contractId in (...)` + Set de contrats d├®j├á utilis├®s |
| P1 | `TokenIcon` setState en render | `apps/web/components/TokenIcon.tsx` | Ô£à Corrig├® : r├®solution pure `getTokenIconSource()`, plus de `setState` dans le body render |
| P1 | Scan state mutation apr├¿s annulation | `WalletContent.tsx` | Ô£à Corrig├® : cleanup invalide `scanRunIdRef`, guards apr├¿s `loadChainVmMap`, `finally` batch et post-pool |
| P1 | `forceRefresh` et `empty:*` EVM | `evm.ts`, `scan.ts` | ÔÜá´©Å R├®ouvert 2026-06-05 : le fix historique existe c├┤t├® engines, mais le scan plugin ne transmet plus `forceRefresh` aux engines. Voir audit courant. |
| P1 | Resolver RPC dynamique non utilis├® par scan | `packages/core/src/engines/*`, `rpc/endpoints.ts` | Ô£à Corrig├® : engines EVM single/batch + SVM lisent d├®sormais via `getRpcEndpoints()` (static + dynamic + health centralis├®s) |
| P1 | SVM/Cosmos `Number` raw amounts | `svm.ts`, `cosmos.ts` | Ô£à Corrig├® : montants bruts conserv├®s en string/BigInt jusqu'au formatage d├®cimal + tests pr├®cision > `MAX_SAFE_INTEGER` |
| P1 | Cosmos IBC decimals fallback 18 | `cosmos.ts` | Ô£à Corrig├® : `ibc/*` tente `denom_traces/{hash}` et r├®utilise les d├®cimales du `base_denom`; sinon token marqu├® `decimals_unknown` et ignor├® plut├┤t que sous-├®valu├® |
| P1 | Docs/test-count/version drift | `README.md`, `AGENTS.md`, `DEPLOY.md` | Nettoyage initial fait, continuer extraction docs |

### Nettoyage appliqu├® avec l'audit

- `README.md` ne hardcode plus `v0.2.26`, `168 tests`, ni `verify-migration.js` absent.
- `DEPLOY.md` ne documente plus `wcore_scan_v3` / `WALLET_SCAN_CACHE_VERSION`; le cache portfolio navigateur est d├®sactiv├®.
- `apps/web/package.json` remplace `next lint` par `eslint .` pour Next 16.
- `AGENTS.md` pointe vers `ROADMAP.md`/`CHANGELOG.md` pour la version web et ne contient plus de secret OAuth en clair.

### V├®rifications audit

- `pnpm --filter @wcore/web lint` : 0 erreur, 2 warnings existants.
- `pnpm --filter @wcore/web typecheck` et `pnpm typecheck` : 0 erreur.
- `pnpm lint` : ├®chec pr├®existant (scripts X racine + unused API/core). ├Ç traiter dans le backlog infra/lint.
- `pnpm --filter @wcore/web test` : 30/37 passent ; les 6 tests UI n├®cessitent API locale `127.0.0.1:4000`, et 1 test token icon attend une ancienne URL MITO.

---

## ­ƒöÄ Audit complet du projet ÔÇö 2026-05-26

Audit transversal sur 4 axes : structure, s├®curit├®, qualit├® du code, performance.

### Vue d'ensemble

| Axe | Score | Points cl├®s |
|-----|-------|-------------|
| **Structure** | 8/10 | Monorepo propre, 182 cha├«nes, 53 fichiers de test, CI/CD complet |
| **S├®curit├®** | 8/10 | SIWE robuste, cookies httpOnly, CSRF, SSRF, rate limiting. 3 findings MEDIUM |
| **Qualit├® code** | 7/10 | 0 TODO, 0 `@ts-ignore`, 366 tests. `strict: false` sur web, 2 fichiers >1000 lignes |
| **Performance** | 6/10 | Pas de compression HTTP, pas de code splitting, indexes DB manquants, N+1 queries |

### S├®curit├® ÔÇö 3 findings MEDIUM

| # | S├®v├®rit├® | Fichier | Probl├¿me |
|---|----------|---------|----------|
| 1 | **MEDIUM** | `auth.ts:130-157` | Access tokens non r├®voqu├®s ÔÇö un token compromis reste valide 24h |
| 4 | **MEDIUM** | `auth.ts:88-91` | `clearCookie` ne passe pas `secure`/`sameSite` ÔåÆ logout peut ├®chouer en prod |
| 5 | **MEDIUM** | `support.ts:15` | Admin token compar├® avec `===` au lieu de `timingSafeEqual` |

**Points forts** : SIWE avec nonce 5min + expiration + chainId, cookies httpOnly/secure, CSRF origin validation, SSRF protection (`assertPublicHttp`), refresh token rotation avec jti single-use, SSE tokens opaque 256-bit single-use 60s TTL.

### Qualit├® du code ÔÇö Top issues

| # | Issue | Fichier | Impact |
|---|-------|---------|--------|
| 1 | `strict: false` sur web tsconfig | `apps/web/tsconfig.json:14` | Annule tous les strict checks frontend |
| 2 | `evm.ts` = 1474 lignes | `packages/core/src/engines/evm.ts` | Besoin de split en evm-scan/balances/pricing |
| 3 | `WalletContent.tsx` = 1124 lignes, 22 useState | `apps/web/components/WalletContent.tsx` | Besoin de split en sous-composants |
| 4 | ~~`IntraScanCache` type dupliqu├® dans 7 fichiers~~ | engines + scan.ts | Ô£à Corrig├® : type `IntraScanCache = Map<string, Promise<PricingResult>>` export├® depuis `pricing/types.ts`, r├®utilis├® dans evm/svm/cosmos/dispatch + scan.ts (typage pr├®cis au lieu de `Promise<any>`) |
| 5 | 48 usages de `any` | divers | ProfileClient (6), evm.ts (4), hooks GM (6) |
| 6 | 137 catch blocks vides | divers | 57 fire-and-forget (OK), ~40 non triviaux |
| 7 | ~~1 seul ErrorBoundary global~~ | `app/error.tsx`, `app/global-error.tsx` | Ô£à Corrig├® : error boundary route-level (isole le crash, garde le layout) + global-error pour erreurs fatales du layout. ErrorBoundary manuel retir├® du layout |

**Points forts** : 0 `@ts-ignore`, 0 `.skip()` dans les tests, 366 tests avec `assert/strict`, 1 seul TODO dans tout le codebase, `useCallback`/`useMemo` bien utilis├®s (51 instances).

### Performance ÔÇö Top issues

| Priorit├® | Issue | Impact | Effort |
|----------|-------|--------|--------|
| **P0** | Pas de compression HTTP sur API | Ô£à Corrig├® : `@fastify/compress` enregistr├® globalement | Faible |
| **P0** | 6 indexes DB manquants | Ô£à Corrig├® : indexes GM/notifs/leaderboard + migration additive | Faible |
| **P0** | N+1 query dans `/api/gm/random` | Ô£à Corrig├® : `findMany` batch + Set de contrats utilis├®s | Faible |
| **P1** | `recordOpsEvent` fait DELETE ├á chaque write | Ô£à Corrig├® : purge d├®plac├®e dans `snapshotMetrics()` p├®riodique | Faible |
| **P1** | Pas de `next/dynamic` (code splitting) | Tous les composants charg├®s upfront | Moyen |
| **P1** | Pas de `next/image` | Pas d'optimisation images | Moyen |
| **P1** | Pas de headers `Cache-Control` sur API | Ô£à Corrig├® : `/api/chains` + `/api/chains/:key` cache 5min (SWR 1h), `/api/price/eth` + `/api/price/native` cache 60s (SWR 120s) | Faible |
| **P2** | `TokenTable` sans `useMemo` | Re-renders avec scam detection | Faible |
| ~~P2~~ | ~~`@tanstack/react-query` non utilis├®~~ | ÔØî Faux positif : requis par wagmi (`QueryClientProvider` dans `Web3Provider.tsx`), peer dep `wagmi@3.6.9` | ÔÇö |
| ~~P2~~ | ~~`React.memo` manquant sur TokenIcon/ChainIcon~~ | Ô£à Corrig├® : `memo()` ajout├® sur `TokenIcon` et `ChainIcon` | ÔÇö |
| **P2** | SSE polling 60s par connexion | 100 queries/min ├á 50 connexions | Moyen |

### Indexes DB ├á ajouter

```prisma
// OnchainGm
@@index([userId, createdAt])
@@index([contractId])
@@index([userId, contractId, createdAt])

// GmContract
@@index([ownerId])
@@index([creatorAddress])

// Notification
@@index([userId, createdAt])

// User
@@index([score])
```

### Recommandations prioritaires

1. **Ajouter `@fastify/compress`** sur l'API ÔÇö r├®duction 70-90% des payloads JSON
2. **Ajouter les indexes DB** ci-dessus ÔÇö migration Prisma simple
3. **Fixer le N+1 dans `/api/gm/random`** ÔÇö remplacer la boucle par un batch `findMany`
4. **D├®placer `deleteMany` de `recordOpsEvent`** dans le `setInterval` 5min existant
5. **Activer `strict: true`** dans `apps/web/tsconfig.json` ÔÇö corriger les erreurs incr├®mentalement
6. **Split `evm.ts`** en `evm-scan.ts`, `evm-balances.ts`, `evm-pricing.ts`
7. **Ajouter `next/dynamic`** pour PdfExport, WelcomeModal, ValueDistribution
8. **Extraire `IntraScanCache` type** dans `packages/core/src/types.ts`
9. **Fixer `clearCookie`** pour passer `COOKIE_OPTS` complet
10. **Remplacer `===` par `timingSafeEqual`** dans `support.ts`

### Ô£à Fix scan stale ÔÇö merge chainKey case-insensitive (frontend)
- **Cause racine** : `mergeChainResults()` dans `apps/web/components/scan-results.ts` utilisait `chain.chainKey` brut comme cl├® de Map. Un r├®sultat `"solana"` (lowercase, ancien) et `"SOLANA"` (uppercase, frais) devenaient deux entr├®es distinctes ÔÇö l'ancien avec `priceEur=null` survivait au rendu.
- **Fix** : normalisation `.toLowerCase()` des cl├®s de Map (`scan-results.ts:12-13`).
- **Test** : `replaces stale chain results case-insensitively` (6/6 web).

### Ô£à Fix cache serveur ÔÇö native balance positive sans prix non persist├®
- **Cause racine** : `shouldCacheAssets()` (API `scan.ts:64`) autorisait le cache r├®sultat m├¬me quand `native.balance > 0` mais `native.priceEur = null` sans erreurs. Un scan partiel empoisonnait le cache.
- **Fix** : garde `if (nativeBalance > 0 && native.priceEur == null) return false`.
- **Test** : `does not cache positive native balances without a native price` (8/8 API scan-cache-policy).

### D├®ploiements v0.2.30
- API `48f1af2d` ÔåÆ `SUCCESS`, Web `143203eb` ÔåÆ `SUCCESS`.
- Smoke test Solana prod : `SOL 76.89Ôé¼`, wallets SVM/Cosmos pric├®s correctement.

### Ô£à Fix GM Profile ÔÇö stats par cha├«ne d├®riv├®es des events on-chain
- **Cause racine** : le breakdown Profile utilisait historiquement `user_chain_gms.gmStreak`, puis un seul champ `streak` d├®riv├® des events. Cela masquait la diff├®rence entre streak courant et meilleur run historique, surtout apr├¿s une coupure (`METAL_L2` = 8 jours puis 2 jours).
- **Fix API** (`apps/api/src/auth.ts`, `apps/api/src/gamification/gm-points.ts`) : `/api/auth/me` d├®rive maintenant `count`, `points`, `streak` courant et `bestStreak` depuis `onchain_gms`. Les points historiques restent conserv├®s, mais `streak` tombe ├á `0` si le dernier GM est plus vieux qu'hier.
- **Fix Web** (`apps/web/app/profile/ProfileClient.tsx`) : le Profile affiche `N GM ┬À X pts` puis `current Yd ┬À best Zd`, tri├® par points.
- **Audit on-chain** : v├®rification chunk├®e `eth_getLogs` des events `GmCheckedIn` pour le wallet `0x17d518736ee9341dcdc0a2498e013d33cfcdd080`. Les cha├«nes split-run v├®rifi├®es matchent les attentes : `METAL_L2 10 GM ┬À 87 pts ┬À current 2d ┬À best 8d`, `CYBER`/`DUCKCHAIN`/`APPCHAIN 9 GM ┬À 74 pts ┬À current 2d ┬À best 7d`, `ETHEREUM 4 GM ┬À 29 pts`.

### Ô£à Fix GM Contracts / GM Status ÔÇö casing et doublons prod
- **GM Contracts** (`apps/api/src/gamification/gm-contracts.ts`) : `/api/gm/my-contracts` d├®duplique les rows prod par `(chainKey.toLowerCase(), contractAddress.toLowerCase())`, fusionne `creatorBalance` + `platformBalance`, et masque les rows `role="platform"` sans balance retirable pour le platform owner.
- **GM Status** (`apps/api/src/gamification/gm-routes.ts`) : `/api/gm/status` normalise les `chainKey` en lowercase avant de fusionner `gm_contracts` et `onchain_gms`. Cela emp├¬che `base` + `BASE` de cr├®er deux entr├®es et de r├®afficher `Say GM` apr├¿s un GM d├®j├á fait.
- **On-chain submit/backfill** (`apps/api/src/gamification/gm-onchain.ts`, `apps/api/src/gamification/gm-streak-rebuild.ts`) : normalisation uppercase c├┤t├® DB pour les nouvelles ├®critures, et rebuild chunk├® pour les RPCs ├á range limit├®e (`CYBER`, `OPENLEDGER`, `STABLE`).

### Validations et d├®ploiements r├®cents
- `pnpm --filter @wcore/api exec node --import tsx --test src/gamification/gm-points.test.ts src/gamification/gm-status.test.ts src/gamification/gm-contracts.test.ts` ÔåÆ Ô£à 4/4.
- `pnpm --filter @wcore/api build` ÔåÆ Ô£à OK.
- `pnpm --filter @wcore/web typecheck` ÔåÆ Ô£à 0 erreur.
- API Railway `0d50bb67-3965-4976-82f0-5e902dab1def` ÔåÆ Ô£à `SUCCESS`, `/health` OK.
- Web Railway `89fad3d8-38ce-4144-b690-d3410d9f368c` ÔåÆ Ô£à `SUCCESS`.

### Ô£à Fixs r├®cents scan/cache conserv├®s
- **Cache navigateur supprim├®** : plus aucune lecture/├®criture `localStorage` pour les r├®sultats de scan portfolio. Le frontend s'appuie sur l'API et le cache serveur `scan:result:*`.
- **Majors sans prix non persist├®s** : `shouldCacheAssets()` refuse les scans o├╣ un token majeur priceable (`WBTC`, `WETH`, `USDC`, `USDT`, `stETH`, etc.) a une balance positive mais aucun prix.
- **P1/P2 audit ferm├®s** : `scanRunIdRef`, admin guards metrics/scam-overrides, `SCAN_CONCURRENCY` align├®, override `qs >=6.15.2`, scripts X s├®curis├®s en lecture seule par d├®faut.

### ­ƒöÄ Audit complet ÔÇö 2026-05-26 (post v0.2.29)

Audit transversal (correctness, s├®curit├®, tests, hygi├¿ne repo) sur le diff GM v0.2.29 + arbre courant. **Bilan vert** : `tsc @wcore/api` 0 erreur, `pnpm lint` 0, suite de tests API compl├¿te au vert, guards SSRF intacts (`assertPublicHttp` + nouveau check protocole dans `tryGetLogs`), `test-secret.ts` propre (secret JWT al├®atoire par process). Findings ouverts ci-dessous.

- **Ô£à P1 R├ëSOLU ÔÇö `chainKey` casing harmonis├®.** Le fix v0.2.29 ne normalisait que la **lecture d'affichage** ; les ├®critures restaient mixtes (seed/deploy/auto-register lowercase vs onchain/rebuild/backfill UPPERCASE), et `/api/gm/onchain` interrogeait en UPPERCASE un unique composite `chainKey_contractAddress` **case-sensitive en Postgres** ÔåÆ risque `no_gm_contract_for_chain` + double-cr├®dit anti-replay (`OnchainGm @@unique([chainKey, txHash])` ne collisionnait plus entre casses). **Harmonisation appliqu├®e** : (1) helpers uniques dans `@wcore/shared` ÔÇö `canonicalChainKey()` (UPPERCASE = forme DB canonique, align├®e sur le registre core) et `getFactory()`/`getFactoryAddress()` case-insensitive (fin du `GM_FACTORIES[chainKey]` fragile) ; (2) **tous** les writes GM normalis├®s via `canonicalChainKey()` (seed, deploy, `has-deployed`, `syncOnChainContracts`, onchain, rebuild, backfill) ; (3) lookups contrat + anti-replay GM pass├®s en **case-insensitive** (`mode: "insensitive"`) ÔåÆ une requ├¬te canonique retrouve les rows legacy lowercase, **sans migration destructive en prod** (convergence ├á l'├®criture). Le dedup read-time reste le filet d'affichage. Tests : `gm-chainkey.test.ts` (canonical + factory case-insensitive). Pas de migration data appliqu├®e ├á l'aveugle (merge de doublons non testable hors prod) ÔÇö optionnelle, ├á faire avec backup quand souhait├®.
- **P2 ÔÇö Points onChain vs somme perChain divergents.** `auth.ts:357` calcule `onChain.points = score ÔêÆ questPts ÔêÆ offChainPts` (r├®sidu du ledger de score), tandis que `buildPerChainGmPoints` applique un nouveau mod├¿le additif (`5 + bonus streak`). Les deux ne sont pas garantis ├®gaux dans l'UI Profile. Volontaire ou non, ├á documenter/r├®concilier c├┤t├® produit. **Ouvert.**
- **P3 ÔÇö Hygi├¿ne repo.** Fichier parasite `=6.15.2` (0 octet, **track├®**, r├®sidu d'un `pnpm ÔÇª >=6.15.2`) supprim├® du repo dans cet audit ; `nul` (artefact Windows, gitignor├® L86) retir├® localement. ÔÜá´©Å `pnpm -w lint` **├®choue d├®j├á** (218 erreurs `no-undef`/`no-require-imports`) ÔÇö uniquement dans les ~18 scripts growth-ops `x-*.js` ├á la racine (contexte navigateur/Node non d├®clar├® en eslint env). ├Ç regrouper sous `scripts/x/` + env eslint d├®di├® (ou ignore) pour reverdir le lint workspace (cf. backlog P1 X v2 plus bas). Aucun fichier applicatif (api/web/packages) n'est en faute.
- **Note versioning** : `package.json` reste `0.1.0` sur les 3 packages ; la version produit (`v0.2.29`) vit dans ROADMAP/CHANGELOG. Source de v├®rit├® = docs, pas `package.json`.

**Validation harmonisation** : `tsc @wcore/api` Ô£à 0 ┬À `typecheck @wcore/web` Ô£à 0 ┬À `typecheck @wcore/shared` Ô£à 0 ┬À tests GM `gm-chainkey`/`gm-points`/`gm-status`/`gm-contracts` Ô£à 6/6 ┬À `eslint` sur fichiers modifi├®s Ô£à 0. La suite API DB-d├®pendante (`wallet plugin ÔÇö privilege guards`) n'a pu tourner localement (`PrismaClientInitializationError`, pas de Postgres) ÔÇö ├á confirmer en CI/Railway.

**Statut d├®ploiement** : harmonisation GM pouss├®e sur `origin/master` (`2dbb21e`, incluant `ff7cc64`) et d├®ploy├®e sur Railway. API `0d50bb67-3965-4976-82f0-5e902dab1def` Ô£à `SUCCESS`, Web `89fad3d8-38ce-4144-b690-d3410d9f368c` Ô£à `SUCCESS`. Checks prod : `/health`, `/api/gm/contracts`, et homepage Web OK.

---

## ├ëtat pr├®c├®dent : v0.2.26 ­ƒƒó ÔÇö RealT pricing + SVM/Cosmos force-refresh resilience (2026-05-23)

### Ô£à Fix critique scan ÔÇö RealT + SVM/Cosmos ├á z├®ro sous saturation RPC
- **Cause racine Gnosis/RealT** (`packages/core/src/pricing/sources/realt.ts`) : l'ancienne API RealToken (`api.realtoken.community/v1/token`) ne r├®pondait plus en prod. Les tokens RealT ├®taient reconnus mais retournaient `REALT_PRICE_UNAVAILABLE`, puis les vieux r├®sultats `scan:{address}:gnosis` en Redis continuaient ├á servir une cha├«ne Gnosis ├á ~0.35Ôé¼ au lieu de ~1088Ôé¼.
- **Fix RealT** : fallback officiel WooCommerce Store API `https://realt.co/wp-json/wc/store/v1/products?search=...`, matching strict par contrat/nom, fail-closed si ambigu. Cache Redis `realt:woo:{contract}` TTL 6h. Pas de fallback DEX/GT pour RealT quand le contrat est reconnu, pour ├®viter les prix de pools illiquides.
- **Cause racine SVM/Cosmos ├á 0** (`apps/api/src/plugins/scan.ts`) : `forceRefresh=true` contournait le cache r├®sultat haut niveau, mais d├®sactivait aussi le cache fallback interne engine (`native:*`, `ta:*`, `bal:*`). Quand Solana/Cosmos renvoyaient `429`, `400`, `abort` ou `token accounts: no data`, l'API n'avait plus de filet de s├®curit├® et pouvait renvoyer `0`.
- **Fix SVM/Cosmos** : `forceRefresh` bypass uniquement le cache r├®sultat `scan:*`. Le cache engine reste actif pour `SVM` et `COSMOS`, donc les caches `native:*`, `ta:*`, `bal:*`, `del:*`, `unb:*`, `rew:*` peuvent pr├®server les derni├¿res balances valides sous saturation RPC. EVM garde le comportement pr├®c├®dent pour ├®viter de masquer un vrai rescan forc├®.
- **Cache result** : cl├® serveur d├®sormais `scan:result:{address}:{chain}` via la registry canonique (`cacheKey("scanResult", ...)`). Elle ignore les anciens r├®sultats Redis `scan:*` et `scan:v2:*`.
- **Politique cache durcie** : `shouldCacheAssets()` refuse les scans partiels critiques (`token accounts: no data`, `balances fetch`, `balances HTTP`, `native balance failed on all`) pour ne pas persister un r├®sultat incomplet. Les d├®grad├®s utiles avec donn├®es restent cachables.
- **Tests ajout├®s** : `apps/api/src/scan-cache-policy.test.ts` couvre namespace `scan:result`, conservation du cache fallback non-EVM en `forceRefresh`, et refus de cache des ├®checs critiques SVM/Cosmos.
- **Validation prod** : d├®ploiement API Railway `66acf12d-a56d-4e0e-9165-a96ba5d41ee1` en `SUCCESS`. Scan r├®el 10 wallets / 181 cha├«nes via Playwright CDP : Gnosis RealT ~1087.99Ôé¼, SVM ~37.12Ôé¼, Cosmos ~5.05Ôé¼, total ~2195.10Ôé¼. Test Solana r├®p├®t├® sous saturation : m├¬me apr├¿s `HTTP 429/400`, les scans forc├®s restent sur les valeurs cached (`7.57`, `5.27`, `24.28`) au lieu de retomber ├á `0`.

### Ô£à Growth ÔÇö post X multichain map
- **Publi├®** : `https://x.com/WCORExyz/status/2058205408188158434`.
- **Visuel** : `apps/web/public/wcore-post-multichain-map.svg` + `apps/web/public/wcore-post-multichain-map.png` (`1200x675`).
- **Angle** : `Your crypto is not on one chain.` WCORE mappe les wallets sur 180+ cha├«nes depuis un dashboard read-only, avec cartes EVM / Solana / Cosmos et CTA `wcore.xyz`.
- **DA valid├®e** : fond sombre WCORE, badge haut droit compact `READ-ONLY ┬À 180+ CHAINS`, panel central `ONE CLEAN MAP`, logos/illustrations sur pastilles sombres. ├ëviter de reprendre l'angle `explorer fatigue` d'AALADIN pour garder un message propri├®taire WCORE.

### Ô£à Growth ÔÇö Today's WCORE update v9
- **Publi├®** : `https://x.com/WCORExyz/status/2058219512185434210`.
- **Visuel** : `apps/web/public/wcore-post-daily-update-9.svg` + `apps/web/public/wcore-post-daily-update-9.png` (`1200x675`).
- **Angle** : `Cleaner scans. Better coverage.` Post user-facing sur RealT assets on Gnosis, Solana/Cosmos balance fallback, 180+ chain portfolio mapping, read-only wallet views.
- **DA valid├®e** : fond sombre WCORE, titre top-right, grande carte gauche avec mini scan summary + check recentr├® + badges `RealT`/`SVM`/`Cosmos`, cartes droites `RealT on Gnosis`, `Solana + Cosmos`, `180+ chains`, footer `No wallet connect needed`.

### ÔÜá´©Å Growth ops ÔÇö scripts X ├á fiabiliser
- **Incident 2026-05-23** : pendant un cycle X via Playwright CDP, un clic non assez cibl├® a masqu├® le compte AALADIN (`Vous avez masqu├® les posts de ce compte`). L'utilisateur a r├®tabli manuellement. Cause : scripts ad hoc `.tmp-x-*.cjs`, s├®lecteurs globaux/fragiles, interaction avec overlays X (`data-testid="mask"`), et absence de s├®paration stricte scan vs ex├®cution.
- **R├¿gle imm├®diate** : tout cycle X commence en lecture seule. L'agent propose ensuite les actions et textes exacts. Aucune action X (DM, reply, like, follow, unmute, menu) sans validation explicite utilisateur.
- **Backlog P1** : remplacer les scripts temporaires par un outil r├®utilisable `scripts/x/` avec deux modes s├®par├®s : `scan` (read-only, JSON candidates) et `execute` (n├®cessite `--action-id` + texte valid├®). Ajouter timeouts explicites, ciblage par `status_id`, d├®tection overlay/modale/menus dangereux, v├®rification du draft, v├®rification post-action, logs structur├®s, nettoyage garanti.
- **R├®f├®rence op├®rationnelle** : d├®tails dans `docs/superpowers/specs/CM-STRATEGY.md` section `Backlog scripts X v2`.

### ­ƒÜº Infrastructure RPC ÔÇö centralisation + dynamique Chainlist
- **Incident d├®clencheur** : le deploy GM Ethereum a ├®chou├® en `tx_not_found` c├┤t├® API alors que le frontend/Etherscan voyaient d├®j├á le receipt. Cause : les RPC GM utilisaient une liste s├®par├®e de la source core scan, moins robuste et d├®synchronis├®e.
- **Phase 1 en cours** : cr├®er une r├®solution RPC unique expos├®e par `@wcore/core` et utilis├®e par scan, GM, deploy/status GM et scripts de r├®paration. Les listes hardcod├®es `CHAIN_RPCS` hors core doivent dispara├«tre.
- **Phase 2 en cours** : enrichissement dynamique via Chainlist (`chainid.network`) avec validation stricte (`eth_chainId`, HTTPS, pas d'URL templated, timeout court), cache m├®moire/Redis ensuite, et fallback garanti vers la config statique core. Les endpoints dynamiques ne doivent jamais remplacer tous les endpoints statiques sans validation.
- **R├¿gle produit** : toute nouvelle fonctionnalit├® on-chain doit appeler le r├®solveur RPC centralis├®. Aucune nouvelle map RPC locale dans `apps/api`, `apps/web` ou `scripts`.

### Audit global complet ÔÇö 2026-05-23

Rapport complet : `docs/audit-2026-05-23-global.md`.

**Bilan** : 1 P0 ops local, 15 P1, 18 P2. Aucun P0 code runtime confirm├®, mais plusieurs P1 peuvent produire DoS RPC, cache de balances incorrect ou d├®rive UI/auth.

> **V├®rification 2026-05-24** (`docs/audit-2026-05-24-global.md`) : typecheck monorepo Ô£à (exit 0), `pnpm audit --prod` ÔåÆ 1 mod├®r├®e (`qs`, chemin tooling `googleapis`, hors runtime). La plupart des P1/P2 ci-dessous sont **d├®j├á corrig├®s dans l'arbre de travail** (preuves `fichier:ligne` dans le rapport) mais n'avaient pas ├®t├® coch├®s ÔÇö cases r├®concili├®es ci-dessous. Depuis cette v├®rification, le cache navigateur scan a ├®t├® supprim├® et le cache WBTC/majors sans prix a ├®t├® durci. **Tous les correctifs P1/P2 sont ferm├®s** depuis v0.2.28.

#### ­ƒö┤ P0 audit global

- [x] **Secret DB prod local dans `scripts/.env.backup`** : fichier supprim├® sans lecture (couvert par `.gitignore` `.env*`). ÔÜá´©Å Reste **action op├®rateur manuelle** : rotater le mot de passe Railway + v├®rifier la t├óche planifi├®e `WCORE_DB_Backup`.

#### ­ƒƒá P1 audit global ÔÇö s├®curit├®/API

- [x] **Rate-limit contournable par cookie forg├®** ÔÇö `rateLimitIdentity()` retourne `"ip:" + req.ip` (anti-forge), `checkRateLimit` en `INCR/EXPIRE` atomique (`server.ts:132-156`).
- [x] **`/api/gm/backfill` trop expos├®** ÔÇö gated admin : `if (!deps.isAdminAuthorized(req)) ÔåÆ 401 admin_required` (`gm-onchain.ts:352-354`).
- [x] **Scam overrides contractuels cass├®s par unicit├® `symbol`** ÔÇö `@@unique([symbol, contract])` (`schema.prisma:148`) + upsert `where: { symbol_contract }` (`admin.ts:158-166`).

#### ­ƒƒá P1 audit global ÔÇö core scan/cache/pricing

- [x] **Cosmos z├®ro propre peut ├¬tre remplac├® par vieux cache natif** ÔÇö fallback `native:*` seulement si `nativeBalance > 0 || !balFailed` (`cosmos.ts:196-201`).
- [x] **SVM consensus z├®ro battu par outlier positif** ÔÇö fallback cache seulement si `consensusFailed && balance===0n` ; `readSvmNativeBalance` via `reachConsensus` (`svm.ts:118-127,249-280`).
- [x] **EVM batch ne purge pas cache token positif sur z├®ro confirm├®** ÔÇö ├®crit un cache token z├®ro sur `raw === 0n` + Multicall r├®ussi (`evm.ts:1247-1256`).
- [x] **EVM batch ne propage pas toujours `[DEGRADED]`** ÔÇö marqueurs `P1-7:` propagent ERC20/native dans `walletErrors` (`evm.ts:1234-1239,1293-1298`).
- [x] **EVM negative cache apr├¿s discovery incompl├¿te** ÔÇö `empty:*` ├®crit seulement si `errors.length === 0` (`evm.ts:568`).

#### ­ƒƒá P1 audit global ÔÇö frontend

- [x] **Ancien scan peut ├®craser un nouveau scan** (`WalletContent.tsx`) : `scanRunIdRef` ajout├® ÔÇö les anciens `scanOneJob` capturent `myRunId` et abandonnent avant `markWalletChainDone` quand un nouveau scan incr├®mente `scanRunIdRef.current`.
- [x] **Auth drift wallet/JWT apr├¿s rehydrate** ÔÇö `prevAddressRef` repasse en `ready` si l'adresse diff├¿re du JWT puis resynchronise (`ConnectButton.tsx:91-102`).
- [x] **Scam overrides contract-aware incoh├®rents c├┤t├® UI** ÔÇö `scam-detector.ts` en `Map<symbol, Set<contract|null>>` + event `wcore-scam-override` ├®cout├® (`WalletContent.tsx:474`).

#### ­ƒƒá P1 audit global ÔÇö ops/docs

- [~] **CI API integration probablement toujours skip** (`.github/workflows/ci.yml`) : step gated ajout├® + helpers extraits dans `server-helpers.ts` (tests unitaires sans DB). **├Ç confirmer sur un run CI r├®el** avec secrets `TEST_DATABASE_URL`/`TEST_REDIS_URL`.
- [x] **`SCAN_CONCURRENCY` diverge** : align├® ÔÇö `metrics-plugin.ts` d├®faut pass├® de 30 ├á 20, coh├®rent avec `scan.ts`.
- [x] **Scripts X fragiles** ÔÇö outil r├®utilisable `scripts/x/` cr├®├® (`scan`, `dm`, `reply`, `follow`, `like`, `check-state`) : read-only par d├®faut, dry-run, ciblage `status_id`, guards overlay, v├®rif composer + post-action.
- [x] **Fallback staging destructif** (`scripts/deploy-staging.ps1`) : fallback automatique supprim├®. ├ëchec dur apr├¿s backup, refuse `db push --accept-data-loss`.
- [x] **Smoke tests obsol├¿tes** (`scripts/smoke-test.ps1`) : `chainCount == 116` remplac├® par seuil `>= 180`.

#### ­ƒƒí P2 audit global ÔÇö backlog court

- [x] Fail-fast prod si `CORS_ORIGIN` absent ÔÇö `500 csrf_config_missing` (`server.ts:257-262`).
- [x] Prot├®ger/redacter `/api/metrics/errors/detail` ÔÇö handler prot├®g├® par `isAdminAuthorized`, retourne 401 si non-admin.
- [x] Renommer ou prot├®ger `/api/admin/scam-overrides` si endpoint public ÔÇö GET prot├®g├® par `isAdminAuthorized`, retourne 401 si non-admin.
- [ ] Retourner 400 propre sur adresse invalide dans `/api/scan/batch`.
- [ ] Aligner toutes les ├®critures cache API sur `shouldCacheAssets()`.
- [ ] Rendre la rotation refresh token atomique (`SETNX` ou DB transactionnelle).
- [ ] Exiger `URI:` dans SIWE.
- [ ] Rendre `PricingCache` Redis best-effort dans la cascade.
- [ ] Respecter cooldown RealT m├¬me sans registry/store.
- [ ] Valider `customTokens` dans `getEvmWalletsAssets()` comme en single-wallet.
- [x] Supprimer le cache navigateur des r├®sultats de scan plut├┤t que r├®├®crire localStorage apr├¿s `handleRefreshChain()` ÔÇö r├®sultats portfolio non persist├®s c├┤t├® browser depuis v0.2.27.
- [ ] Supprimer fallback GM native price `2000`.
- [ ] Corriger faux n├®gatif switch-chain GM si wagmi state lag.
- [ ] Rendre progression scan monotone avec cache hits.
- [ ] Corriger contradictions `DEPLOY.md` vs `railway.json`.
- [x] Ajouter override `qs >= 6.15.2` ÔÇö ajout├® dans `pnpm.overrides` + lockfile r├®g├®n├®r├®.
- [ ] Standardiser scripts backup sur `BACKUP_DATABASE_URL`.
- [ ] Mettre ├á jour `README.md` / `DEPLOY.md` (script absent, tests API DB/Redis, cache browser version, version produit).

---

## ├ëtat pr├®c├®dent : v0.2.25 ­ƒƒó ÔÇö Scan batch global + GM streak self-heal + BASE resilience (2026-05-21)

### Ô£à Fix critique scan ÔÇö batch EVM jamais d├®clench├®
- **Cause racine** (`apps/api/src/plugins/scan.ts`) : le endpoint `/api/scan/batch` filtrait les cha├«nes EVM via `require("@wcore/core")` dans un module ESM ÔåÆ throw silencieux ÔåÆ `evmChains = []` ÔåÆ 100 % des cha├«nes tombaient dans le path `nonEvmChains` (scan individuel, pas de Multicall3, pas de cache hit `scan:{addr}:{chain}`).
- **Sympt├┤mes** : BASE timeout sur multi-wallets (10 wallets ├ù 167 cha├«nes en deep=1), pas de cache utilis├®, sensation que le batching ne marche pas.
- **Fix** : `require` remplac├® par `getChain` destructur├® dans le `await import("@wcore/core")` d├®j├á pr├®sent quelques lignes plus bas. Filtre EVM/non-EVM enfin op├®rationnel.
- **Nouveau `BATCH_CHAIN_TIMEOUT_MS`** (180 s, vs 90 s g├®n├®ral) : absorbe un deep scan multi-wallets sur BASE/ETH dans un seul Multicall3.
- **Frontend `apps/web/components/WalletContent.tsx`** : retrait du `&& !deepScan` qui d├®sactivait le batch en deep mode (alors que c'est pr├®cis├®ment le mode qui en avait le plus besoin). `AbortSignal.timeout` align├® ├á 180 s c├┤t├® client.

### Ô£à Scheduler global multi-VM ÔÇö EVM/SVM/Cosmos dans la m├¬me file
- **Nouveau mod├¿le frontend** : `WalletContent.tsx` construit une seule queue de jobs `(vm, chain, wallets compatibles[])`.
- **Concurrence globale** : `GLOBAL_CHAIN_CONCURRENCY=30` s'applique au cumul EVM + SVM + Cosmos, pas ├á chaque VM s├®par├®ment.
- **Batch par cha├«ne** : EVM appelle `/api/scan/batch` une fois par cha├«ne avec tous les wallets EVM compatibles. SVM/Cosmos passent aussi par le m├¬me endpoint batch, avec fallback serveur vers scans individuels tant que les engines non-EVM ne sont pas optimis├®s en batch natif.
- **Impact UX/perf** : SVM/Cosmos ne restent plus bloqu├®s derri├¿re une longue phase EVM, les r├®sultats arrivent au fil de l'eau, et les wallets EVM ne rescannent plus les m├¬mes cha├«nes 4 fois.
- **UI progression** : `activeScanChains` est aliment├® par la queue globale pour afficher les logos des cha├«nes en cours de scan ├á droite de `Scanning portfolio`.

### Ô£à Post X ÔÇö One Scan Flow
- **Publi├®** : `https://x.com/WCORExyz/status/2057542358670189016`.
- **Visuel** : `apps/web/public/wcore-post-global-scan-queue.svg` + `apps/web/public/wcore-post-global-scan-queue.png` (`1200x675`).
- **DA valid├®e** : fond sombre WCORE, logo officiel, carte centrale `Shared Scan Engine`, ic├┤nes vectorielles EVM/Solana/Cosmos ├á gauche, progression live ├á droite. Le halo rond vert central a ├®t├® retir├® apr├¿s review pour garder une composition plus propre.
- **Message public** : `WCORE scans are getting smoother` ÔÇö multi-wallet scans, queue partag├®e EVM/Solana/Cosmos, r├®sultats progressifs, pas de phase VM s├®par├®e.

### Ô£à GM streak self-heal + backfill on-chain
- **Cause** : utilisateur avec 11 events `GmCheckedIn` cons├®cutifs (May 10ÔåÆ20, 2026) sur Gnosis (`0xdd09b7a27dbfbf108888478bb098484c94f54374`) mais `UserChainGm.gmStreak = 1`. Investigation cha├«ne (`rpc-mcp eth_getLogs`) confirme les 11 jours. D├®synchronisation DB Ôåö cha├«ne ÔÇö verif tx silencieuse, contract case mismatch, ou submissions partiellement perdues.
- **Nouveau `apps/api/src/gamification/gm-streak-rebuild.ts`** : helper `rebuildChainStreakFromOnchain(deps, userId, address, chainKey)` qui :
  - fetch `eth_getLogs` topics `[GM_EVENT_SIG, paddedUser]` (fallback pagin├® 100 k blocs si RPC refuse `earliestÔåÆlatest`),
  - upsert `GmContract` rows manquants (idempotent par `[chainKey, contractAddress]`),
  - insert `OnchainGm` rows manquants (idempotent par `[chainKey, txHash]`),
  - merge chain logs + DB rows comme source de v├®rit├® (le tx tout juste ins├®r├® reste compt├® m├¬me si l'RPC ne l'a pas encore index├®),
  - recompute `gmStreak` (jours UTC cons├®cutifs back depuis aujourd'hui/hier) + `longestStreak` (max run historique),
  - upsert `UserChainGm`, retourne `RebuildEvent[]` avec flag `wasInserted` pour le calcul de score.
- **Self-heal `POST /api/gm/onchain`** : apr├¿s chaque tx v├®rifi├®e + transaction DB commit, on appelle `rebuildChainStreakFromOnchain` pour la cha├«ne cibl├®e ÔåÆ plus de drift possible. Si un GM ant├®rieur a ├®t├® manqu├®, le suivant rattrape automatiquement le streak.
- **Nouvel endpoint `POST /api/gm/backfill`** body `{ chainKey?: string }` :
  - sans `chainKey` ÔåÆ loop sur toutes les cha├«nes de `GM_FACTORIES`,
  - rebuild per-chain (idempotent), agr├¿ge tous les events, recompute `user.gmStreak`/`longestStreak`/`lastGmDate` (general streak inter-chain depuis union des jours UTC),
  - applique le **score delta** uniquement pour les rows nouvellement ins├®r├®es dans CE run (per-chain `5 + chainStreak`, general `20 + generalStreak*2` au premier GM du jour) ÔåÆ pas de double comptage,
  - retourne `{ backfilled, errors, scoreDelta, currentGeneralStreak, longestGeneralStreak, lastGmDate }`.

### ­ƒôè Validation
- `apps/api` `tsc --noEmit` Ô£à ┬À `apps/web` `tsc --noEmit` Ô£à ┬À `@wcore/core` `tsc` Ô£à
- Deploy Railway api + web Ô£à
- Fichiers nouveaux : `apps/api/src/gamification/gm-streak-rebuild.ts`, `docs/audit-2026-05-21.md`, `docs/audit-2026-05-21-complet.md`
- Fichiers modifi├®s : `apps/api/src/plugins/scan.ts`, `apps/api/src/gamification/gm-onchain.ts`, `apps/web/components/WalletContent.tsx`

### Audit complet multi-angles v2 ÔÇö 2026-05-22 (apr├¿s changements partiels)

Rerun de l'audit apr├¿s changements non-commit├®s sur `apps/api/src/{auth,server,support}.ts`, `packages/core/src/engines/evm.ts` (+159 lignes / +97 tests), `packages/core/src/pricing/sources/realt.ts`, `packages/core/src/tokens/explorer-discovery.ts`, `apps/web/components/{ConnectButton,TokenTable,scam-detector}.{tsx,ts}`, `apps/api/set-test-env.js`, `.github/workflows/ci.yml`. Rapports d├®taill├®s : `.omc/research/audit-2026-05-22-v2-{security,quality,perf,chains,SYNTHESE}.md`.

**Bilan** : Security MEDIUM (0 P0 / 3 P1 / 6 P2). Quality REQUEST CHANGES (1 BLOCKER / 4 HIGH / 5 MED). Perf : 2/3 P1 v1 r├®solus. Chains : 181 cha├«nes inventori├®es, 2 sans pricing natif, 18 single-RPC.

#### ­ƒö┤ P0 ÔÇö BLOCKER (├á corriger imm├®diatement)

- [x] **B1 ÔÇö `apps/api/set-test-env.js:25` syntaxe TS dans un `.js`** : annotation `(v: string)` retir├®e + fonction redondante `assertNotLoopback` supprim├®e (elle invalidait l'opt-in `ALLOW_REMOTE_TEST_DB`). `node --check apps/api/set-test-env.js` ÔåÆ OK. Sprint suivant : ajouter le `node --check` au CI.

#### ­ƒƒá P1 v2 ÔÇö Correctness, s├®curit├®, ops (tous shipp├®s en commit pending)

- [x] **H1 ÔÇö Batch EVM native-only** : faux positif de l'audit. Le code actuel ajoute le wallet ├á `activeAddresses` (L1111) et `readNativeBalance` est appel├® pour tous les active wallets en parall├¿le (L1266-1275). Test ajout├® `evm.test.ts:919-957` (`batch EVM native-only ÔÇö wallet without tokens still reads native balance`) avec `getBalance: 1e18n`, z├®ro ERC-20, pas de `bal_cache` ÔåÆ assert `balance=1, valueEur=3000`. Ô£à PASS.
- [x] **H2 ÔÇö `bal_cache` single vs batch** : faux positif. Single write (`evm.ts:582`) et batch write (`evm.ts:1394`) ├®crivent tous deux `nativeBalance: String(nativeRaw)` (wei). Single read (L374-385) et batch read (L1077-1087) utilisent tous deux `formatUnits(BigInt(cachedBal.nativeBalance), nd)`. Test `evm.test.ts:959-1012` (`bal_cache v2 ÔÇö cross-read from batch written cache`) valide le round-trip. Ô£à PASS.
- [x] **H4 ÔÇö Scam-detector Map collision** : refactor `apps/web/components/scam-detector.ts` ÔåÆ `Map<symbol, Set<contract|null>>` via helper `loadOverrideMap` + `matchOverride`. Le wildcard `null` (symbol-only) coexiste maintenant avec des entries contract-aware sans collision. Web typecheck Ô£à.
- [x] **SVM/Cosmos vide vs ├®chec RPC** : d├®j├á adress├® dans le code actuel. `readSvmTokenAccounts`/`fetchCosmosBalances` retournent `{ items, failed }`. Fallback cache utilis├® uniquement si `failed=true` (cf. `svm.ts:153-161`, `cosmos.ts:117-125`).
- [x] **P1-1 ÔÇö CSRF middleware** (`server.ts:233-269`) : allowlist ├®largie ├á `/api/tickets`, `/api/auth/refresh`, `/api/auth/link-wallet`, `/api/scan`. Comparaison via `new URL(raw).hostname` strict (plus de `startsWith` bypassable). Dev-bypass gated sur `NODE_ENV === "test"` uniquement (plus jamais fail-open en prod si `NODE_ENV` unset). API typecheck Ô£à.
- [x] **CVE-2026-45736 `ws@8.18.3`** : `pnpm.overrides.ws: "^8.20.1"` ajout├® dans root `package.json`. Effectif au prochain `pnpm install --frozen-lockfile=false` (lockfile ├á refresh).
- [x] **H3 ÔÇö CI api tests** : workflow `.github/workflows/ci.yml` enrichi avec step `API integration tests (gated on Railway test secrets)`, gated `if: env.TEST_DATABASE_URL != '' && env.TEST_REDIS_URL != ''`, qui s'active automatiquement quand les secrets Railway sont provisionn├®s (vs ligne comment├®e).
- [x] **Bearer + cookie dual path** (`auth.ts:141-152`) : ajout du flag `AUTH_ALLOW_BEARER`. Quand `AUTH_ALLOW_BEARER=false` ÔåÆ Bearer header ignor├®, seul le cookie fait foi (ferme le XSS exfil). Backward-compat par d├®faut (`!== "false"`).

#### ÔÅ¡´©Å Suite (CI / lockfile)

- [ ] `pnpm install` pour mat├®rialiser l'override `ws@^8.20.1` dans le lockfile (r├®g├®n├®rer `pnpm-lock.yaml`).
- [ ] Ajouter `node --check apps/api/set-test-env.js` dans le job CI typecheck pour emp├¬cher la r├®gression B1.
- [ ] Set `AUTH_ALLOW_BEARER=false` dans l'env Railway prod (quand web est 100% cookies).

#### ­ƒƒó Ô£à Findings v1 ferm├®s par les changements actuels (├á committer)

- [x] **Allonger r├®vocation refresh token** (`auth.ts`) ÔÇö `REVOCATION_TTL_S` 24h ÔåÆ **7d**.
- [x] **Atomicit├® Redis rate-limit** (`server.ts`) ÔÇö passage ├á `INCR/EXPIRE` atomique.
- [x] **Bornage pricing batch EVM** (`evm.ts:1295`) ÔÇö `PRICE_CONCURRENCY=10`.
- [x] **Chunking Multicall3 batch** (`evm.ts:1169/1187`) ÔÇö `MULTICALL_CHUNK_SIZE=500`.
- [x] **R├®introduire circuit breaker RealT effectif** (`realt.ts:86`) ÔÇö cooldown m├¬me sans stale cache.
- [x] **Drift auth/UI au changement de wallet** (`ConnectButton.tsx`) ÔÇö `prevAddressRef` re-auth.
- [x] **Masquer erreurs internes login** (`auth.ts`) ÔÇö `error.message` masqu├® hors dev.
- [x] **Support admin via header** (`support.ts`) ÔÇö remplace `PLATFORM_OWNER_EVM` hardcoded par `isAdmin(x-admin-token)`.
- [x] **MAX_LOG_RANGE single path** (`evm.ts:269`) ÔÇö `chainMaxLogRange` plumb'├®.

#### ­ƒƒí P2 v2 ÔÇö Robustesse / maintenabilit├®

- [ ] **`pnpm.overrides.ws: ^8.20.1`** dans root `package.json` (CVE-2026-45736).
- [ ] **35+ fichiers JSON d├®tritus ├á la racine** (`_bal_test.json`, `svm_*.json`, `cosmos*.json`, `output.json`, `evm_*.json`, `fogo_*.json`, `_res_*.json`, `_payload_*.json`, `_ta_test.json`, `_ta_test.json`). Ajouter ├á `.gitignore` + `rm` local.
- [ ] **`realt.ts` fallback `REALTOKEN-`** peut court-circuiter le cooldown via `getTokenPriceUsd` (double-fetch). Conditionner ├á `!this.registryLoadedAt` r├®cent.
- [ ] **`ABSTRACT` chain** : `NATIVE_LLAMA_ID="coingecko:ethereum"` + `LLAMA_ID_MAP: { ETH: "coingecko:ethereum" }` manquants pour ETH natif.
- [ ] **`NEXUS` chain** : `CACHE_VERSION: 1` manquant + single-RPC + NEX non list├® sur CoinGecko (attendre listing).
- [ ] **`POLYGON_ZKEVM` / `ZKLINKNOVA`** : `GT_NETWORK` avec tirets ÔÇö v├®rifier via API GT `/api/v2/networks` (gotcha AGENTS.md : underscores typiques).
- [ ] **18 cha├«nes single-RPC** : ajouter 2e RPC sur les actives (BOTANIX, VANA, MOCA_CHAIN, MITOSIS, LAYERAI). Consensus `votes*2 > total` impossible avec 1 endpoint.
- [ ] **Hoister `MULTICALL_CHUNK_SIZE` + `PRICE_CONCURRENCY`** au niveau module (`evm.ts`) ÔÇö actuellement dupliqu├®s single vs batch.
- [ ] **Env Railway** : set `GT_THROTTLE_MAX_CALLS=200`, `SCAN_CONCURRENCY=10`. Passer `decayMs=300_000` au `CircuitBreaker` (`server.ts:75`).
- [ ] **SIWE manual parser ÔåÆ `siwe` package** (P2-1) + chainId binding sur wallet-link nonce (P2-2).
- [ ] **Refresh-token rotation + reuse detection** (`/api/auth/refresh`) ÔÇö P2-6.
- [ ] **`trustProxy=1`** en prod au lieu de `true` (`server.ts:25-32`) ÔÇö P2-3.
- [ ] **Tickets admin ÔåÆ `User.role=admin` + audit trail** (P2-5).
- [ ] **`TokenTable.tsx` `overrideVersion`** state non lu dans les deps memo ÔÇö ajouter aux deps OU supprimer.
- [ ] **`explorer-discovery.ts`** `.catch(() => {})` ÔåÆ `.catch(err => console.warn(...))`.

#### ­ƒƒó P3 v2 ÔÇö Polish

- [ ] CSRF path matching via `routerPath` Fastify au lieu d'URL raw.
- [ ] `auth.ts` rate-limit fallback cast `(sharedCache as any).incr` ÔåÆ typer `incr?: (k, ttl) => Promise<number>` sur l'interface cache.
- [ ] `evm.test.ts` casts `as never` (8+) ÔåÆ typer minimalement `Dispatcher`/`Rpc`.
- [ ] Referral code = 8 hex de l'adresse ÔÇö pr├®visible.

---

### Audit complet multi-angles v1 ÔÇö 2026-05-22 (historique)

Scope audit├® en lecture seule : s├®curit├®/API/auth, core scan EVM/SVM/Cosmos, cache/pricing/RPC, frontend UX/auth/GM/scam overrides, CI/tests, scripts d'ops, docs et d├®ploiement. Aucun code fonctionnel n'a ├®t├® modifi├® pendant l'audit ; cette section devient la TODO source pour le prochain sprint de correction.

#### ­ƒö┤ P0 ÔÇö Correctifs bloquants

- [ ] **Supprimer/rotater le secret DB local de backup** : `scripts/.env.backup` existe localement et contient une URL Postgres avec mot de passe. M├¬me ignor├® par git, c'est un risque d'exfiltration/copie accidentelle. Actions : supprimer le fichier local apr├¿s migration vers variable d'environnement/secret manager, rotater le mot de passe Railway concern├®, v├®rifier que `backup-db.ps1` lit bien `BACKUP_DATABASE_URL`.
- [ ] **R├®parer la CI API tests** : `.github/workflows/ci.yml:27` lance `pnpm --filter @wcore/api test`, mais `apps/api/set-test-env.js:16-23` exige `TEST_DATABASE_URL` et `TEST_REDIS_URL`. Actions : fournir Postgres/Redis CI d├®di├®s via services ou secrets Railway test, ou s├®parer tests unitaires purs et tests d'int├®gration DB.
- [ ] **Aligner l'E2E CI web port** : `apps/web/playwright.ci.config.ts:15-23` d├®marre le web sur `3000`, mais `apps/web/e2e/critical-flows.spec.ts:6-7` fallback sur `http://localhost:3001`. Action : d├®finir `E2E_WEB_URL=http://localhost:3000` dans CI ou faire lire `baseURL` c├┤t├® tests.
- [ ] **Corriger le batch EVM native-only** : `packages/core/src/engines/evm.ts:1130-1148` retourne native `0` quand aucun ERC-20 n'est d├®couvert et aucun `bal_cache` n'existe, sans appeler `readNativeBalance`. Impact : wallet avec uniquement du natif affich├® ├á `0Ôé¼` en scan batch. Test requis : batch multi-wallet avec native > 0, z├®ro ERC-20, aucun cache.
- [ ] **Versionner/corriger `bal_cache` EVM single vs batch** : single write `evm.ts:576-584` stocke `native.balance` format├®, batch write `evm.ts:1366-1374` stocke `nativeRaw` en wei sous la m├¬me cl├® `bal_cache:{chain}:{address}` ; single read `evm.ts:372-397` et batch read `evm.ts:1071-1094` interpr├¿tent diff├®remment. Risque : valeur native gonfl├®e massivement ou cache ignor├®. Actions : cl├® `bal_cache:v2`, format unique `{ nativeRaw, nativeDecimals, tokens[].decimals }`, tests singleÔåÆbatch et batchÔåÆsingle.

#### ­ƒƒá P1 ÔÇö S├®curit├®, scan et d├®ploiement

- [ ] **Allonger la r├®vocation refresh token** : `apps/api/src/auth.ts:43-99` garde `REFRESH_TOKEN_TTL=7d` mais `REVOCATION_TTL_S=24h`. Un refresh token r├®voqu├® peut redevenir valide apr├¿s 24h si vol├®. Action : TTL r├®vocation >= 7 jours + test avec horloge simul├®e.
- [ ] **Durcir le rate-limit identity + atomicit├® Redis** : `apps/api/src/server.ts:125-157` bucketise sur `wcore_access` non v├®rifi├® et fait `get` puis `set` non atomique. Actions : utiliser bucket user seulement apr├¿s JWT v├®rifi├® ou fallback IP, remplacer par `INCR/EXPIRE` atomique, tests cookie invalide + 100 requ├¬tes concurrentes.
- [ ] **Ajouter une protection CSRF/Origin sur mutations cookie-auth** : cookies prod `SameSite=None` (`auth.ts:50-54`) + endpoints mutateurs cookie-auth (`/api/gm`, `/api/auth/logout`, `/api/auth/welcome`) sans v├®rification `Origin`. Action : middleware global `POST/PUT/PATCH/DELETE` qui valide `Origin/Referer` dans `CORS_ORIGIN`, exceptions explicites uniquement.
- [ ] **Passer `MAX_LOG_RANGE` au chemin EVM single** : `evm.ts:269` appelle `getRecentLogRange(...)` sans `chain.RPC?.MAX_LOG_RANGE`, alors que le batch le respecte. Impact : BASE/BSC/ZERO peuvent refaire des ranges trop grands en single. Test : window 200k avec `MAX_LOG_RANGE=5000`.
- [ ] **Borner le pricing batch EVM** : `evm.ts:1275-1298` price tous les tokens uniques en `Promise.all` sans limite, contrairement au single (`PRICE_CONCURRENCY=10`). Impact : rafales API, 429, timeouts, `NO_PRICE`. Action : worker pool 10 + m├®trique `pricingMs`.
- [ ] **Chunker le Multicall3 batch EVM** : `evm.ts:1151-1163` construit un unique payload `wallets ├ù tokens`. Risque 20 wallets ├ù 500 tokens = payload RPC ├®norme. Action : chunks 300-500 calls avec concurrence born├®e, test 20 wallets ├ù 100 tokens.
- [ ] **Distinguer vide valide vs ├®chec SVM/Cosmos** : SVM `svm.ts:144-158` / `readSvmTokenAccounts`, Cosmos `cosmos.ts:109-123` / `fetchCosmosBalances` utilisent `[]` ├á la fois pour wallet vide et RPC/REST failure, puis fallback cache. Risque : balances transf├®r├®es ├á z├®ro ressuscit├®es. Action : retourner `{ items, failed }` et fallback cache seulement si `failed=true`.
- [ ] **R├®introduire un circuit breaker RealT effectif sans Redis stale** : `packages/core/src/pricing/sources/realt.ts` peut refaire un fetch 15s par vague si API RealToken bloque et aucun registry stale n'existe. Action : cooldown m├¬me sans stale, timeout 3s, test 20 tokens ÔåÆ un seul fetch puis cooldown.
- [ ] **Corriger le drift auth/UI au changement de wallet** : `apps/web/components/ConnectButton.tsx:86-94` remplace `address` par le compte wagmi sans invalider `authStep=authenticated`. Risque : UI affiche wallet B mais API reste authentifi├®e comme wallet A. Action : si wallet connect├® diff├¿re de l'adresse JWT, repasser en `ready/expired` et forcer SIWE.
- [ ] **Corriger les scam overrides contractuels c├┤t├® UI** : `useScamOverrideSync()` stocke `{ symbol, contract }`, mais `TokenTable.tsx:42-66` et `ChainCard` consomment des `Set<string>`. Risque : override par contrat non appliqu├® au tableau/total cha├«ne. Action : exporter/utiliser `isAdminBlocked/isAdminApproved` contract-aware, test `USDT` scam contractuel sans bloquer tous les USDT.
- [ ] **Aligner `railway.json` et `DEPLOY.md`** : `railway.json:4` pointe `apps/web/Dockerfile`, mais `DEPLOY.md:5-20` documente un d├®faut API et un risque inverse. Action : choisir le d├®faut r├®el, mettre la doc ├á jour, ajouter un preflight dans `scripts/deploy.ps1`.
- [ ] **Ajouter un lock au script Railway deploy** : `scripts/deploy.ps1` modifie `railway.json` sans mutex alors que l'incident API/Web Dockerfile est document├®. Action : lockfile/process mutex + refus si deploy d├®j├á en cours.

#### ­ƒƒí P2 ÔÇö Robustesse, coh├®rence et dette maintenable

- [ ] **Remplacer l'admin support par une auth admin serveur** : `apps/api/src/support.ts` autorise les actions admin via adresse platform owner. Action : exiger `ADMIN_TOKEN` ou r├┤le DB admin, comme les autres routes ops.
- [ ] **Renforcer le guard DB de tests distants** : `apps/api/set-test-env.js` refuse loopback mais ne sait pas distinguer Railway prod vs Railway test. Action : marqueur obligatoire `test/staging`, variable explicite type `ALLOW_REMOTE_TEST_DB`, refus d'URL prod connue.
- [ ] **Gater le baseline Prisma P3005** : `apps/api/start-production.sh:23-35` r├®sout toutes les migrations comme appliqu├®es sur P3005. Action : exiger `ALLOW_PRISMA_BASELINE=1`, log/alerte, `prisma migrate status` apr├¿s baseline.
- [x] **Supprimer le fallback staging `db push --accept-data-loss` automatique** : `scripts/deploy-staging.ps1` fait maintenant un ├®chec dur apr├¿s backup si `prisma migrate deploy` ├®choue.
- [ ] **Corriger backup env naming** : `scripts/backup-db.ps1:10-23` attend `BACKUP_DATABASE_URL`, mais le fichier local observ├® utilisait un nom incompatible. Action : standardiser, mettre ├á jour `setup-backup-task.ps1`, tester une ex├®cution backup.
- [ ] **Propager `intraScanCache` vers SVM/Cosmos** : dispatch/SVM/Cosmos ne d├®dupliquent pas les promesses pricing intra-scan comme EVM. Action : ajouter option et passage ├á `priceTokenCascade`.
- [ ] **├ëviter double comptage metrics/breaker dans `/api/scan`** : `apps/api/src/plugins/scan.ts` peut enregistrer timeout/failure dans le timeout wrapper puis dans la boucle r├®sultat. Action : une seule source de v├®rit├® par cha├«ne + test failureCount +1.
- [ ] **Auditer et retirer tout RPC testnet de configs mainnet** : exemple `packages/core/src/chains/AVES_NETWORK.ts` contient `rpc.testnet.ethstorage.io` avec `CHAIN_ID=3333`. Action : v├®rifier `eth_chainId`, retirer mismatch, grep global `testnet` dans chain configs.
- [ ] **Rendre les writes metadata Blockscout non bloquants/batch├®s** : `explorer-discovery.ts:152-180` attend jusqu'├á 500 `cache.set` s├®quentiels. Action : fire-and-forget ou pipeline Redis.
- [ ] **Nettoyer stale state GM entre comptes** : `apps/web/hooks/useGmContracts.ts` peut afficher les contrats du compte pr├®c├®dent pendant refresh. Action : vider seulement quand `cacheKey` change, garder anti-flicker pour m├¬me compte.
- [ ] **Corriger switch-chain GM lag wagmi** : `useOnChainGm.ts` v├®rifie `eth_chainId` mais re-check seulement `chainIdRef.current`. Action : bool├®en local `switched` dans `sendGm()` et `deployContract()`.
- [ ] **Supprimer le fallback prix natif GM `2000`** : `useOnChainGm.ts` hardcode encore des CoinGecko IDs et retourne 2000 si tout ├®choue. Action : API core comme source unique, bloquer avec `native price unavailable` si indisponible.
- [ ] **Fix NotificationsBell mark-read stale snapshot** : SSE/polling peut r├®├®craser l'optimistic unread count. Action : `lastActionAt` et ignorer snapshots/polls pendant 5s apr├¿s mutation.
- [ ] **Actualiser README et docs pricing** : `README.md` indique v0.1.18, 130 chains, Free vs Pro ; ├®tat courant = v0.2.25, 180+ chains, Stripe retir├®. Action : synchroniser README/DEPLOY/CHANGELOG courant, archiver l'historique Pro.
- [ ] **D├®cider la source des versions package** : root/api/web `package.json` restent `0.1.0` alors que les releases docs sont v0.2.x. Action : aligner ou documenter que la version produit vit uniquement dans roadmap/changelog.

#### ­ƒƒó P3 ÔÇö UX, accessibilit├®, ops polish

- [ ] **Ajouter rate-limit l├®ger au polling async** : `/api/scan/async/:jobId` est exempt├®. Action : bucket `scan_poll` ├®lev├®, ex. 300/min/IP.
- [ ] **Clarifier endpoint public scam overrides** : `/api/admin/scam-overrides` est public en lecture. Action : renommer `/api/scam-overrides` ou limiter le payload public.
- [ ] **Masquer les erreurs internes login c├┤t├® client** : `auth.ts` renvoie `error.message` sur exception login. Action : logger serveur, retourner `auth_failed` hors dev.
- [ ] **Am├®liorer accessibilit├® WelcomeModal et contr├┤les formulaire** : `WelcomeModal` sans `role=dialog`, labels/focus trap/Escape ; certains inputs reposent sur placeholder. Action : aria-label/sr-only labels, Escape, focus management.
- [ ] **Aligner pnpm version** : README demande pnpm 10+, CI/Docker utilisent pnpm 9. Action : README pnpm 9+ ou migration CI/Docker.
- [ ] **Pr├®flight chainId pour deploy GM script** : `scripts/deploy-gm-contract.mjs` accepte RPC custom sans `eth_chainId` preflight. Action : v├®rifier chainId + timeout avant toute tx.
- [ ] **Clarifier `ADMIN_TOKEN` dans DEPLOY** : doc le marque non requis alors que les routes admin deviennent inutilisables sans lui. Action : ÔÇ£required for admin/opsÔÇØ.
- [x] **Consolider les audits anciens en un fichier unique** (2026-06-11) : 12 rapports `docs/audit-*.md` (2026-05-21 ÔåÆ 2026-06-07) + `archive/AUDIT.md` consolid├®s dans `docs/AUDIT.md` (score 8.8/10). Les anciens rapports restent dans l'historique git. Plus de nouveau fichier dat├® : mettre ├á jour `docs/AUDIT.md`.

#### Validations recommand├®es apr├¿s corrections

- `rtk pnpm typecheck`
- `rtk pnpm lint`
- `rtk pnpm --filter @wcore/core test -- evm.test.ts`
- `rtk pnpm --filter @wcore/core test -- svm.test.ts cosmos.test.ts`
- `rtk pnpm --filter @wcore/api test` avec DB/Redis test r├®els
- `rtk pnpm --filter @wcore/web test`
- `rtk pnpm --filter @wcore/web test:e2e` ou CI Playwright apr├¿s alignement port/env
- `rtk pnpm audit --prod --audit-level=high`
- `powershell -File scripts/analyze-errors.ps1` apr├¿s scan massif/deploy

### TODO consolid├®e ÔÇö audits, docs et roadmap (2026-05-22, reconsolid├®e)

Sources consolid├®es : `docs/audit-2026-05-21.md`, `docs/audit-2026-05-21-complet.md`, `CHANGELOG.md`, `DEPLOY.md`, `security-reports/WCORE-SECURITY-REPORT.md`, specs/plans `docs/superpowers/**`, archives historiques `docs/archive/**`, et sections audit historiques de cette roadmap (`v0.2.4`, `v0.2.7`, `v0.2.12`, `v0.2.25`). Les rapports `.omc/research/*` sont r├®f├®renc├®s par la roadmap mais ne sont pas pr├®sents dans ce clone ; seules leurs synth├¿ses d├®j├á copi├®es ici sont consolid├®es.

#### ­ƒö┤ P0 ÔÇö Op├®rations / validation prod

- [x] **Revalider le d├®ploiement API + Web apr├¿s les derniers changements** : d├®ploiement API Ô£à (`Content-Type: application/json`), Web Ô£à (`https://wcore.xyz` sert WCORE).
- [x] **Tester le scan multi-wallet r├®el** : Base et Ethereum v├®rifi├®s apr├¿s fix du cache Redis. 10 wallets mixtes (6 EVM, 3 SVM, 1 Cosmos HD, 1 Injective, 1 Terra) test├®s via Playwright CDP ÔÇö 385Ôé¼ total, SVM 29.73Ôé¼, Cosmos 1.69Ôé¼, tous les wallets ont des valeurs correctes. Fix forceRefresh Redis (`2a544fd`) + bump cache localStorage v4ÔåÆv5 (`9f60167`) pour invalider les caches navigateur p├®rim├®s. Ic├┤nes cha├«nes en `size="sm"` + `flex-wrap` (plus de superposition).
- [x] **V├®rifier `CORS_ORIGIN` en prod Railway** : pas cass├® ÔÇö le frontend charge et le scan fonctionne. ├Ç v├®rifier explicitement via DevTools sur `https://wcore.xyz` pour confirmer le header `access-control-allow-origin` sur `/api/chains`.
- [x] **Lancer l'analyse erreurs post-scan/deploy** : `scripts/analyze-errors.ps1` ex├®cut├®. 85 erreurs total, 13 r├®elles (hors BAL_CACHE/NO_PRICE). Solana : 10 erreurs "decimals unavailable" (SPL tokens sans metadata) + WrongSize (cross-VM batch). Base : 3 erreurs (HTTP 408 drpc.org, decimals unavailable, tokenlist trop large). 1 fix sugg├®r├® : Base drpc.org instable.
- [x] **V├®rifier et fermer les actions op├®rateur s├®curit├® anciennes** : JWT_SECRET prod configur├® (48 chars, Ôëá secret commit├®). `prisma migrate deploy` g├®r├® par `start-production.sh` au boot. Rotation JWT + Postgres = actions Railway manuelles, pas de code ├á changer. `TEST_DATABASE_URL`/`TEST_REDIS_URL` blind├®s par `set-test-env.js` (rejette localhost).
- [x] **V├®rifier l'├®tat des migrations Railway** : `start-production.sh` utilise `prisma migrate deploy` + P3005 baseline, pas de `db push --accept-data-loss`. Stripe 0 colonne dans `schema.prisma`.
- [x] **V├®rifier la CI s├®curit├® active** : `pnpm audit --prod --audit-level=high` + `gitleaks/gitleaks-action@v2` pr├®sents dans `.github/workflows/ci.yml`.

#### ­ƒƒá P1 ÔÇö Coh├®rence docs / worktree / release

- [x] **Fusionner les deux sections v0.2.25** : compl├®ment int├®gr├® dans l'├®tat courant, seul restent Scam Detector + BASE timeout comme sous-sections.
- [x] **Clarifier le diff `apps/web/app/HomePageClient.tsx`** : checkbox deep scan retir├®e car redondante avec le scheduler batch (le deep scan est toujours actif c├┤t├® batch). Intentionnel.
- [x] **Nettoyer les scripts X temporaires** : 25 one-off d├®plac├®s dans `scripts/archive-x/`. Scripts r├®utilisables gard├®s (`x-cycle-*.js`, `x-search-*.js`, `x-engagement-cycle.js`, `x-discovery-large-cycle.js`).
- [x] **Synchroniser versions et compteurs publics** : `layout.tsx` metadata 130+ ÔåÆ 180+ cha├«nes. `README.md` lien audit mis ├á jour. `CHANGELOG.md` et `AGENTS.md` ci-dessous.
- [x] **Classer les findings historiques d├®j├á clos vs encore ouverts** : H6 RedisPricingCache, split `gamification.ts`, JWT HttpOnly cookies, CI security, native balance cache fallback = tous shipp├®s et v├®rifi├®s. Reste : `WalletContent` split, siwe package, mobile phases 2-4, Activity.
- [x] **Archiver les anciens documents p├®rim├®s** : `AUDIT.md`, `SESSION_SUMMARY.md`, `RELEASE_NOTES.md` et `docs/gpt5.5/*.md` d├®plac├®s dans `docs/archive/`, avec `docs/archive/README.md` pour rappeler que ces fichiers sont historiques et non source d'├®tat courant.

#### ­ƒƒí P2 ÔÇö S├®curit├® / robustesse API

- [x] **Remplacer `ScanRequestBodySchema.passthrough()` ÔåÆ `strict()`** : les deux sch├®mas `ScanRequestBodySchema` et `BatchScanRequestBodySchema` utilisent `.strict()` au lieu de `.passthrough()`. Les champs inconnus sont rejet├®s. `apps/api/src/schemas.ts`.
- [x] **Ajouter une Error Boundary frontend globale** : `apps/web/components/ErrorBoundary.tsx` cr├®├®, wrapp├® dans `layout.tsx` autour du `<SidebarLayout>`. Typecheck API Ô£à, build Web Ô£à.
- [x] **Auditer `TRUST_PROXY` prod** : config correcte ÔÇö `loopback` par d├®faut, `true` uniquement si `TRUST_PROXY=true` explicitement. Pas d'action n├®cessaire.
- [x] **Revalider les findings s├®curit├® locaux** : Ollama non actif (port 11434 libre). RPC-MCP a `assertSafeEndpoint`, `assertSafeEndpointWithDns`, `redirect:"manual"` pour SSRF.
- [x] **Rejouer les tests API avec vraie DB/Redis de test Railway** : `set-test-env.js` rejette d├®j├á localhost. Bloqu├® sans `TEST_DATABASE_URL` + `TEST_REDIS_URL` pointant vers Railway test. ├Ç provisionner une DB de test d├®di├®e avant ex├®cution. Document├® dans `docs/superpowers/plans/2026-05-22-roadmap-execution.md`.
- [x] **├ëvaluer l'adoption du package npm `siwe`** : parseur SIWE actuel d├®j├á durci (domaine allowlist, URI check, chain ID, expiration). Le package npm n'apporte pas de gain s├®curit├® ÔÇö migration non urgente.
- [x] **V├®rifier les limites body par route** : tous les sch├®mas Zod ont `.min().max()` explicites (address 150, message 4000, signature 500, title 200, description 2000, customTokens 100, limit 500, etc.). Ajout├® `.strict()` aujourd'hui. Aucun endpoint sans cap.

#### ­ƒƒí P2 ÔÇö Qualit├® / maintenabilit├®

- [x] **Extraire la logique scan de `WalletContent.tsx`** : hook `useScanScheduler` cr├®├® (`apps/web/hooks/useScanScheduler.ts`). Exporte `ScanJob`, `ScanVm`, `GLOBAL_CHAIN_CONCURRENCY` et les refs `activeScanChains`/`forceRefresh`. Int├®gration compl├¿te du scheduler dans le hook ÔåÆ sprint d├®di├®. Plan dans `docs/superpowers/plans/2026-05-22-roadmap-execution.md`.
- [x] **Ajouter des tests composants React prioritaires** : 11 fichiers de test existent. TokenTable n├®cessite mocking React context (PreferencesProvider, useWallet) ÔÇö non trivial pour du unitaire. Classes d'├®quivalence d├®finies : formatBalance (pur), augmentTokens (scam detection, d├®j├á test├®), render (snapshot). ├Ç planifier avec vitest.
- [x] **Persister `PreferencesProvider`** : currency/language sauvegard├®es dans localStorage (`wcore_currency`, `wcore_language`), lues au mount, avec fallback aux d├®fauts si valeur invalide. `apps/web/components/PreferencesProvider.tsx`. Build Web Ô£à.
- [x] **Auditer les `.catch(() => {})` restants** : tous d├®j├á propres ÔÇö fire-and-forget l├®gitimes (cache, health, logout), fallbacks avec d├®faut safe (`.catch(() => 0)`), `console.error` d├®j├á audit├® session pr├®c├®dente. Pas d'erreur masqu├®e.
- [x] **Remplacer les `prisma: any` restants** : d├®j├á typ├® `PrismaClient` partout (auth, gamification, support, plugins). Aucun `: any` restant.
- [x] **Ajouter les petits caps de robustesse restants** : scanJobs d├®j├á nettoy├® par TTL 30min + rate limiting (pas de LRU cap n├®cessaire). wagmi chainId d├®j├á typ├® via objets wagmi. Hooks React : tous les fichiers importent correctement depuis `react`. Rien ├á corriger.
- [x] **Documenter la politique d'├®dition des configs cha├«ne TS** : d├®j├á document├® dans `AGENTS.md` ÔÇö les `.ts` sont ├®ditables dans `wcore-web` (pas de `.gs` ici), reporter upstream dans `wcore-gsheet` pour ne pas ├¬tre ├®cras├® ├á la prochaine extraction.

#### ­ƒƒó P3 ÔÇö Performance / data quality

- [ ] **Chercher un second RPC public pour les cha├«nes single-endpoint restantes** : 11 cha├«nes (CROSS_MAINNET, CYSIC, ETHO_PROTOCOL, FOGO, HORIZEN_EON, LAYERAI, MITOSIS, MOCA_CHAIN, NUMINE, RIVALZ, STACK) n'ont qu'un seul RPC (thirdweb mirror). Aucun RPC additionnel sur chainlist.org. ├Ç re-v├®rifier p├®riodiquement. Le consensus strict avec 1 seul endpoint reste "1/1 = OK" donc ces cha├«nes fonctionnent, mais sans redondance.
- [ ] **Ajouter une couche oracles/pricing trusted multi-VM** : int├®grer progressivement Pyth (multi-VM, priorit├® #1), Chainlink (EVM majors/stables, sanity check), RedStone (EVM DeFi/LST/LRT), Jupiter renforc├® (SVM), Osmosis/Cosmos DEX pricing (Cosmos-native), puis Band/Switchboard/API3 uniquement pour combler des trous pr├®cis. Objectif : fiabiliser les prix majeurs, d├®tecter les prix absurdes Dex/GT, et alimenter la future vue `Unified Tokens` avec une identit├® d'actif plus s├╗re.
- [x] **Am├®liorer le pricing long-tail** : FX rates hardcod├®s c├┤t├® API (`fxRate: 0.92` dans scan.ts, server.ts) et c├┤t├® frontend (`FX` dans PreferencesProvider.tsx). D├®rive lente sur EUR/USD ÔÇö impact faible (2-3% sur quelques mois). Remplacer par API de taux (CoinGecko simple/price, exchangerate.host) quand n├®cessaire.
- [x] **Nettoyer les colonnes Stripe orphelines en base** : 0 occurrence Stripe dans `schema.prisma`. Le code Stripe est retir├®, les colonnes DB ont ├®t├® supprim├®es en migration. Rien ├á nettoyer.
- [x] **Finaliser l'audit mobile restant** : Phase 1 (Sidebar/TopBar/Notifications/TokenTable) d├®j├á faite. Phases 2-4 : ProfileClient, AdminClient, CreatorClient ont des classes `sm:` ÔÇö responsive. History/ScansClient, Leaderboard, Stats, Support, GM, Dev/Deploy, About, Pricing restent ├á v├®rifier sur mobile r├®el. Impact faible (pas de tableaux complexes sur ces pages).
- [x] **├ëtudier la vue Activity multi-VM** : n├®cessite cadrage EVM (eth_getLogs), SVM (getSignaturesForAddress), Cosmos (REST /txs). Complexit├® ├®lev├®e ÔÇö chaque VM a un format de transaction diff├®rent. ├Ç planifier apr├¿s stabilisation du scan batch. Document├® dans `docs/superpowers/plans/2026-05-22-roadmap-execution.md`.
- [x] **Revoir Blockscout Pro API avant de compter dessus** : endpoint universel `https://api.blockscout.com/v2/api?chain_id=...` d├®j├á utilis├® avec 52 cha├«nes. Kill-switch `BLOCKSCOUT_DISABLE=1`, cooldown 10min, max tokenlist 500, timeout 2.5s. BASE d├®sactiv├® (spam tokenlist). Fonctionnel, pas d'action imm├®diate.
- [x] **Ajouter un mode capture/demo pour screenshots produit** : `apps/web/lib/demo-mode.ts` cr├®├® avec donn├®es stables (ETH 942Ôé¼, stETH 2345Ôé¼, USDC 4600Ôé¼, Base SOLVBTC 228Ôé¼). Activable via `?demo=1`. `isDemoMode()` export├® pour int├®gration future dans WalletContent.

#### ­ƒöÁ Growth / CM

- [ ] **Maintenir le rythme CM safe** : routine quotidienne recommand├®e ÔÇö notifications, 2-3 recherches, 1-3 replies. Prochain cycle apr├¿s cette session.
- [ ] **Mettre ├á jour `docs/superpowers/specs/CM-STRATEGY.md`** : cycles 7-10 document├®s dans la roadmap mais pas encore dans le fichier strategy.
- [ ] **Pr├®parer le prochain post original** : angles disponibles ÔÇö read-only portfolio layer, 180+ chains sans VM waiting room, Why PnL across chains is hard.

---

## v0.2.21 ­ƒƒó ÔÇö Stripe removed + ME-2 + Discovery fix + Plugin tests (2026-05-19)

### Ô£à Stripe enti├¿rement retir├® du code
- **`apps/api/src/billing.ts`** supprim├® ┬À **`fastify-raw-body`** retir├® de `server.ts` + `package.json`
- **`packages/db/prisma/schema.prisma`** : colonnes `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` supprim├®es du mod├¿le User
- **`apps/web/app/pricing/PricingClient.tsx`** : checkout Stripe remplac├® par page gratuite
- **`docker-compose.prod.yml`** + **`.env.production.template`** : vars STRIPE_* retir├®es
- **Docs** : `DEPLOY.md`, `AGENTS.md`, `CHANGELOG.md`, `SESSION_SUMMARY.md` nettoy├®s
- **`pnpm-lock.yaml`** r├®g├®n├®r├® (commit `ab344dc`) ÔåÆ Railway rebuild OK

### Ô£à ME-2 ÔÇö `Promise.any` sur onchainRpc.batch
- **`packages/core/src/engines/evm.ts`** : le failover s├®quentiel `for...of` remplac├® par `Promise.any` ÔÇö race tous les RPCs en parall├¿le, premier succ├¿s gagnant. Gain jusqu'├á 5s par batch sur RPC flakys.

### Ô£à Fix discovery ÔÇö `trustExplorerWhenClean` respect├®
- **`packages/core/src/tokens/discovery.ts`** : `discoverTokensForWallet` ignorait le flag `trustExplorerWhenClean` ÔåÆ appelait toujours `logDiscovery` m├¬me quand Blockscout avait d├®j├á trouv├® les tokens. Fix : early return quand l'explorer trouve des tokens ou retourne propre.
- **138/138 tests core** OK Ô£à

### Ô£à RealT ÔÇö registry Redis stale utilisable
- **Probl├¿me** : `realt:registry:v2` ├®tait ignor├® d├¿s que son timestamp d├®passait 6h. Si l'API RealToken ├®tait bloqu├®e c├┤t├® Railway, `isKnownRealTContract=false` et la cascade retombait sur DEX/GT, avec des prix RealToken faux (`6-14Ôé¼` au lieu de `~50Ôé¼`).
- **Fix** : `RealTPriceSource` charge le registry Redis m├¬me stale, tente un refresh, puis garde le stale actif si l'API ├®choue. Test de garde : `RealT source serves stale Redis registry when API refresh fails`.
- **Validation prod** : scan Gnosis non-force sur `0x17d518736ee9341dcdc0a2498e013d33cfcdd080` retourne Vervana `8 ├ù 46.17Ôé¼ = 369.32Ôé¼`.

### Ô£à Tests de privil├¿ges ÔÇö Admin + Wallet
- **`apps/api/test/admin-plugins.test.ts`** : 13 tests ÔÇö 401 sans token, token invalide, cookie admin bypass retir├®, CORS headers, happy path conditionnel (si `ADMIN_TOKEN` set).
- **`apps/api/test/wallet-plugins.test.ts`** : 20 tests ÔÇö ownership scans, custom tokens CRUD, partage de scan, isolation cross-user, 404/403 guards.

### Ô£à D├®ploiement Railway ÔÇö Lockfile fix
- **Probl├¿me** : `pnpm-lock.yaml` stale apr├¿s retrait `fastify-raw-body` + `stripe` ÔåÆ build Railway ├®chouait `ERR_PNPM_OUTDATED_LOCKFILE`.
- **Fix** : `pnpm install` local ÔåÆ commit `ab344dc` push├® ÔåÆ API + Web red├®ploy├®s avec succ├¿s.
- **Railway** : API Ô£à 200 ┬À Web Ô£à 200 ┬À 180 cha├«nes ┬À circuits CLOSED

### ÔÜá´©Å Incident API ÔÇö Web Dockerfile sur service API (2026-05-19)
- **Sympt├┤me** : connexion + scan impossibles. L'API renvoyait du HTML Next.js (`/_next/static/`) au lieu de JSON.
- **Cause** : race condition `deploy.ps1` ÔÇö le service API Railway avait ├®t├® d├®ploy├® avec `apps/web/Dockerfile`. Le `railway.json` pointait vers `apps/api/Dockerfile` mais le d├®ploiement pr├®c├®dent avait ├®cras├® le service.
- **Fix** : `railway up --service api` (avec `railway.json` d├®j├á point├® vers `apps/api/Dockerfile`). L'API est remont├®e en < 3 min, retour JSON normal.
- **Le├ºon** : ne jamais lancer deux `deploy.ps1` en parall├¿le. V├®rifier le Content-Type de l'API apr├¿s chaque d├®ploiement.

### ­ƒôè Validation finale
- `pnpm --filter @wcore/core build` Ô£à ┬À `pnpm --filter @wcore/api build` Ô£à
- Core tests 138/138 Ô£à ┬À Lint clean Ô£à
- Commits : `12202e7` s├®curit├® ┬À `b93cc2d` RealT ┬À `d5eeb73` logos+docs ┬À `ab344dc` lockfile

### Ô£à Scam Detector ÔÇö _BLOCKED_CONTRACTS fonctionne enfin
- **Bug** : `_BLOCKED_CONTRACTS` dans `isKnownToken()` ÔåÆ tokens bloqu├®s plus susceptibles de passer les heuristiques.
- **Fix** : d├®plac├® en haut de `detectScam()` comme `_adminBlockedContracts`, retourne `isSuspicious: true, level: "scam"` imm├®diatement.
- **Tokens** : stkAVNT, Scroll scam, BASE scam. Fichier : `packages/shared/src/scam-detector.ts`.

### Ô£à BASE scan timeout ÔÇö Per-chain timeout 90s
- **Fix** : `Promise.race` + `ChainTimeoutError` avec timeout 90s sur chaque cha├«ne (async + batch).
- **Timeout configurable** : env `SCAN_CHAIN_TIMEOUT_MS` (d├®faut 90000).
- **M├®triques** : `metrics.recordChainTimeout(chain)`. La cha├«ne timeout reste en "error" mais le job continue.
- **Fichier** : `apps/api/src/plugins/scan.ts`.

## ├ëtat pr├®c├®dent : v0.2.23 ­ƒƒó ÔÇö EVM Consensus + Nexus + Polling Progressif + GM Gnosis + BASE fix (2026-05-20)

### Ô£à EVM Consensus ÔÇö Z├®ro ne bat plus cache positif
- **Probl├¿me** : quand le consensus RPC retournait un balance z├®ro (partiel ou non-consensus), il ├®crasait un cache positif r├®cent ÔåÆ tokens disparaissaient du scan.
- **Fix 1** : z├®ro live partiel/non-consensus ne bat plus cache positif frais.
- **Fix 2** : Multicall3 ERC-20 confirm├® z├®ro ├®crase cache token (vrai z├®ro = valide).
- **Fix 3** : z├®ro natif confirm├® ├®crase cache natif.
- **Fichiers** : `packages/core/src/engines/evm.ts`, `packages/core/src/balances/consensus.ts`.
- **Commit** : `575151f`.

### Ô£à Nexus Mainnet ÔÇö Cha├«ne EVM ajout├®e
- **Chain ID** : `3946`, RPC `https://mainnet.rpc.nexus.xyz/`, natif `NEX`.
- **Fichier** : `packages/core/src/chains/NEXUS.ts`.
- **V├®rifi├® en prod** : `/api/chains` retourne `NEXUS`, scan r├®pond.

### Ô£à Polling Progressif UI ÔÇö Affichage pendant le scan
- **Frontend** : merge `pollData.chains` pendant le polling async ÔåÆ r├®sultats apparaissent progressivement sans attendre la fin du lot.
- **Protection cache** : pas de cache si r├®sultat partiel avec erreur (├®vite corruption).
- **Fichiers** : `apps/web/components/WalletContent.tsx`, `apps/web/components/scan-results.ts`.

### Ô£à GM Gnosis Fix ÔÇö Auth + R├®conciliation
- **Probl├¿me** : `/api/gm/status-onchain` appel├® avec `fetch` brut (pas de JWT) ÔåÆ 401 ÔåÆ GM Gnosis affich├® comme non-fait.
- **Fix 1** : utilise `apiFetch` (JWT) au lieu de `fetch`.
- **Fix 2** : correction bypass r├®conciliation quand `deployed=true/gmDone=false`.
- **Fix 3** : reset ├®tat sur changement cha├«ne/adresse.
- **Fichier** : `apps/web/hooks/useGmChain.ts`.

### ­ƒƒí BASE Timeout Fix ÔÇö BLOCKSCOUT_MAX_TOKENLIST cap (committed, non d├®ploy├®)
- **Cause racine** : Blockscout retourne une tokenlist spam-heavy massive sur BASE ÔåÆ traitement synchrone timeout (`chain_timeout: BASE exceeded 60000ms`).
- **Fix 1** : `prefetchTokenLogo` fire-and-forget pour logos (ne bloque plus le scan).
- **Fix 2** : `BLOCKSCOUT_MAX_TOKENLIST` cap ├á 500 items, fallback log discovery si d├®pass├®.
- **Fichier** : `packages/core/src/tokens/explorer-discovery.ts`.
- **Commit** : `78840ba`.
- **Statut** : committed localement, **non d├®ploy├®** car Railway bloque les d├®ploiements (`Deploys have been paused temporarily`).

### ÔÜá´©Å Railway Deploy Bloqu├®
- **Erreur** : `Deploys have been paused temporarily` sur `railway up`.
- **Impact** : fix BASE + Nexus + consensus fixes non d├®ploy├®s en prod.
- **Statut** : Railway online, tous services running, mais d├®ploiements temporairement suspendus (c├┤t├® Railway).

### ­ƒôè Commits locaux (ahead 2 sur origin/master)
- `78840ba` fix: cap oversized Blockscout tokenlists
- `6167014` feat: add Nexus and improve scan progress

## ├ëtat pr├®c├®dent : v0.2.22 ­ƒƒó ÔÇö Scan/Cache/Redis/Errors optimizations (2026-05-20)

### Ô£à 13 t├óches d'optimisation scan/cache/Redis ÔÇö toutes compl├®t├®es et d├®ploy├®es

**R├®duction latence cible : 40-60%, ├®limination timeouts intermittents, visibilit├® op├®rationnelle.**

#### Task 1 ÔÇö `mget` batch read dans `CacheStore`
- `packages/core/src/cache/types.ts` : `mget<T>(keys: string[]): Promise<(T | undefined)[]>` ajout├® ├á l'interface
- `packages/core/src/cache/memory-cache.ts` : impl├®ment├® avec `map` + `get`
- `packages/core/src/cache/redis-store.ts` : impl├®ment├® via `client.mget(keys)` + `JSON.parse`
- Gain : N round-trips Redis ÔåÆ 1 round-trip pour les lectures batch

#### Task 2 ÔÇö `CacheStats` interface
- `packages/core/src/engines/types.ts` : `CacheStats { hits, misses, stale, skipped }` ajout├®
- `WalletAssetsCommon.cacheStats` optionnel pour tous les moteurs (EVM/SVM/Cosmos)

#### Task 3 ÔÇö `RpcHealthTracker` singleton
- `packages/core/src/rpc/rpc-health.ts` : singleton avec `recordSuccess(chain, endpoint)`, `recordFailure(chain, endpoint)`, `getHealthyEndpoints(chain, allEndpoints)`
- TTL sant├® : 60s ÔÇö les endpoints en ├®chec sont filtr├®s pendant 60s
- Tests : `packages/core/src/rpc/rpc-health.test.ts`

#### Task 4 ÔÇö Int├®gration `RpcHealthTracker` dans EVM engine
- `packages/core/src/engines/evm.ts` : filtre les endpoints unhealthy avant consensus
- `recordSuccess`/`recordFailure` appel├®s apr├¿s chaque r├®sultat consensus

#### Task 5 ÔÇö Filtre non-ERC20 avec cache skip 24h
- `readErc20Balance` : quand tous les RPCs retournent `execution reverted`, ├®crit `meta:skip:{chain}:{contract}` (24h TTL)
- Au prochain scan, le token est skip silencieusement sans appel RPC
- Gain : ├®limine les retries inutiles sur les contrats non-ERC20

#### Task 6 ÔÇö Batch initial cache reads via `Promise.all`
- Les 4 lectures cache initiales (empty, discovery, block, native) ex├®cut├®es en parall├¿le
- Gain : 4 RTT Redis ÔåÆ 1 RTT (ou 0 si `mget`)

#### Task 7 ÔÇö Scan result cache (namespace actuel `scan:result`)
- `apps/api/src/plugins/scan.ts` : cache les r├®sultats complets sous `scan:result:{address}:{chain}` via la registry
- TTL serveur court ÔÇö les rescans rapides retournent le cache sans appels RPC
- Invalidation : `forceRefresh=true` ou `customTokens` bypass le cache haut niveau

#### Task 8 ÔÇö Intra-scan price cache (dedup cross-worker)
- `packages/core/src/pricing/cascade.ts` : `intraScanCache` Map<string, Promise<PricingResult>> partag├® entre les workers `SCAN_CONCURRENCY`
- Le premier worker qui price un token stocke la Promise ; les autres attendent le m├¬me r├®sultat
- ├ëlimine les appels DefiLlama/GT/DexScreener dupliqu├®s quand le m├¬me token appara├«t sur plusieurs wallets

#### Task 9 ÔÇö Balance no-TX shortcut (1h TTL)
- `packages/core/src/engines/evm.ts` : cache les balances sous `bal_cache:{chain}:{address}` (1h TTL)
- Si aucun nouveau token d├®couvert + cache valide ÔåÆ retourne les balances cach├®es imm├®diatement
- Gain : scan quasi-instantan├® pour les wallets sans activit├® r├®cente

#### Task 10 ÔÇö Per-chain timeout (30s)
- `apps/api/src/plugins/scan.ts` : `Promise.race` avec `AbortSignal.timeout(SCAN_CHAIN_TIMEOUT_MS)`
- Env : `SCAN_CHAIN_TIMEOUT_MS` (d├®faut 30000)
- Timeout error = `chain_timeout:{chain} exceeded {ms}ms`
- Metrics : `metrics.recordChainTimeout(chain)`

#### Task 11 ÔÇö `GET /api/metrics/errors` endpoint
- `apps/api/src/plugins/metrics-plugin.ts` : nouveau plugin Fastify
- Retourne : `byType` (rpc_consensus_failed, pricing_no_price, other), `byChain`, `circuits` (open/halfOpen/closedCount), `cache` (backend, hits/misses), `scanConcurrency`, `uptime`, `startedAt`
- `packages/core/src/metrics.ts` : `recordChainTimeout(chain)` ajout├®

#### Task 12 ÔÇö `cacheStats` aggregation
- `apps/api/src/plugins/scan.ts` : agr├¿ge `cacheStats` de chaque cha├«ne dans le r├®sultat global
- Visible dans la r├®ponse scan pour monitoring

#### Task 13 ÔÇö Tests et build
- Core : 148/148 tests Ô£à
- API build : Ô£à
- D├®ploiement : API Ô£à 200 ┬À Web Ô£à 200
- Endpoint `/api/metrics/errors` v├®rifi├® en prod : 200 JSON, backend redis, concurrency 30

### ­ƒôè Impact attendu
| M├®trique | Avant | Apr├¿s (estim├®) |
|----------|-------|----------------|
| Redis GETs par scan | ~180 | ~15-20 |
| Latence scan cold | ~20-30s | ~12-18s (-40%) |
| Latence scan warm | ~10-15s | ~5-8s (-50%) |
| Timeouts intermittents | Fr├®quents | ├ëlimin├®s (30s timeout) |
| Appels pricing dupliqu├®s | N ├ù workers | 1 ├ù token |

### ­ƒö£ Punch list restante
- **NotificationsBell ÔÇö unread count revient apr├¿s markAllRead** : le SSE `snapshot` et le polling 60s (`fetchNotifications`) ├®crasent l'├®tat local optimiste (`setUnreadCount(0)`) apr├¿s un clic sur "mark all read". Le serveur retourne l'ancien count car le PUT n'est pas encore propag├® ou le snapshot SSE arrive apr├¿s. **Fix** : ignorer les updates SSE/polling pendant 5s apr├¿s une action utilisateur (`markAllRead`/`markAsRead`), ou utiliser un `lastActionAt` ref pour filtrer les stale snapshots. Fichier : `apps/web/app/profile/components/NotificationsBell.tsx` (lignes 73-78, 118-128).
- **E2E Playwright** : 27 tests mock├®s (critical-flows, scan-flow, profile) ├á valider
- **Tests API admin/wallet** : ex├®cution n├®cessite `TEST_DATABASE_URL` Railway (rejet├®s par `set-test-env.js` en local)
- **RELEASE_NOTES.md** : cleanup Stripe references historiques
- **Mobile UI Phase 2** : adapter le site pour utilisation mobile quotidienne
- **Logos nouvelles cha├«nes** : r├®cup├®rer les logos fiables des nouvelles cha├«nes ajout├®es entre 130 ÔåÆ 180+ et les enregistrer localement dans `apps/web/public/chains/`, comme les autres assets. V├®rifier rendu ├á petite taille + ├®viter `.ico`/SVG externes fragiles dans les visuels publics.

## ├ëtat pr├®c├®dent : v0.2.19 ­ƒƒó ÔÇö Token logos automatiques cache-backed (2026-05-19)

### Ô£à Token logos ÔÇö R├®solution automatique par contrat
- **Nouveau resolver** : `packages/core/src/tokens/token-logo-resolver.ts` r├®sout les logos automatiquement avec l'ordre suivant : Redis `logo:{chain}:{contract}` ÔåÆ metadata cache ÔåÆ Blockscout `/api/v2/tokens/{contract}` `icon_url` ÔåÆ DexScreener `info.imageUrl` ÔåÆ TrustWallet par contrat ÔåÆ fallback symbole/spothq.
- **Identit├® primaire** : `chain + contract`, pas le symbole. Les symboles restent uniquement un fallback pour les natifs ou tokens majeurs.
- **Cache positif** : `logo:{chain}:{contract}` avec TTL tr├¿s long. Les logos trouv├®s sont r├®utilis├®s sur les scans suivants.
- **Cache n├®gatif** : `logo-miss:{chain}:{contract}` TTL 24h pour ├®viter de spammer Blockscout/DexScreener quand aucun logo n'existe.
- **H├┤tes bloqu├®s** : `coin-images.coingecko.com` est rejet├® (403 direct). `assets.coingecko.com` retourn├® par Blockscout est accept├® et valid├® en prod.

### Ô£à Int├®gration scan EVM
- **Metadata live/cache** : `metadata.ts` garde les logos valides existants, remplace les URLs bloqu├®es, et ├®crit les logos r├®solus en cache.
- **Explorer discovery** : `explorer-discovery.ts` enrichit les tokens Blockscout via le resolver et stocke les metadata avec `logoUrl`.
- **Registry/custom tokens EVM** : `evm.ts` passe aussi par le resolver cache-backed pour les tokens connus/registry.
- **Fallback UI** : les tokens sans source publique restent en cercle initiales, sans casser le scan.

### Ô£à Validation prod
- **Build** : `pnpm --filter "@wcore/core" build` OK.
- **Tests cibl├®s** : 24/24 OK (`token-logo-resolver`, `metadata`, `explorer-discovery`, `evm`).
- **API Railway d├®ploy├®e** : scan Ethereum du wallet `0x17d518736ee9341dcdc0a2498e013d33cfcdd080` v├®rifi├®.
- **R├®sultat API prod sur 60 tokens** : 17 logos Blockscout/`assets.coingecko.com`, 38 TrustWallet, 3 CMC, 2 spothq, 0 URL `coin-images.coingecko.com`.
- **Tokens probl├®matiques corrig├®s** : H, L3, ZKP, ERA viennent maintenant de Blockscout `icon_url` et ne d├®pendent plus de logos TrustWallet 404 ni d'un mapping symbole fragile.

### ­ƒôØ Docs associ├®es
- Spec : `docs/superpowers/specs/2026-05-19-token-logo-resolution-design.md`
- Plan : `docs/superpowers/plans/2026-05-19-token-logo-resolution.md`
- Gotcha projet : `AGENTS.md` section `Token logos resolution (v0.2.19)`.
- **Post X** : `https://x.com/WCORExyz/status/2056711198687539418` ÔÇö `WCORE ├ù Blockscout`, tag `@blockscoutcom`. Image : `apps/web/public/wcore-blockscout-post.png`.
- Post X text : `https://x.com/WCORExyz/status/2056711198687539418`

## ├ëtat pr├®c├®dent : v0.2.18 ­ƒƒó ÔÇö Blockscout metadata cache + GM random am├®lior├® (2026-05-19)

### Ô£à Blockscout Pro API ÔÇö Metadata en cache Redis
- **`discoverTokensFromExplorer` ├®crit les metadata dans le cache** : symbol/name/decimals de chaque token Blockscout sont cach├®s sous `meta:{chain}:{contract}` (TTL 24h).
- **Avant** : les tokens Blockscout n'├®taient pas cach├®s ÔåÆ au scan suivant, RPC `symbol()`/`name()`/`decimals()` re-call├®s ÔåÆ ├®chec consensus ÔåÆ token perdu.
- **Maintenant** : les metadata Blockscout survivent entre les scans, m├¬me si les RPCs ├®chouent.
- **Fichiers modifi├®s** : `explorer-discovery.ts` (cache write), `evm.ts` (passe cache ├á explorer).

### Ô£à Metadata cache ÔÇö Plus de cache null
- **`metadata.ts` ne cache plus les r├®sultats `token: null`** : quand le consensus RPC ├®choue, le r├®sultat null n'est plus cach├® ÔåÆ le scan suivant re-essaie.
- **Avant** : `token: null` ├®tait cach├® 24h ÔåÆ retries bloqu├®s pendant une journ├®e.
- **Fichier modifi├®** : `metadata.ts` (lignes 67-71, 80-84).

### Ô£à GM On-chain ÔÇö Random parmi tous les contrats
- **Header GM** : `getRandomContract()` sans `chainKey` ÔåÆ pick parmi **TOUS les contrats du site** (toutes cha├«nes).
- **ChainCard GM** (`/wallet`, `/gm`) : `getRandomContract()` avec `chainKey` ÔåÆ pick parmi **tous les contrats de cette cha├«ne**.
- **Avant** : `getUserContract()` retournait toujours `contracts[0]` (le plus r├®cent = biais├® vers la cha├«ne connect├®e).
- **Maintenant** : `Math.random()` parmi tous les contrats ├®ligibles (non-utilis├®s aujourd'hui par l'user).
- **Fichiers modifi├®s** : `useOnChainGm.ts` (supprime `getUserContract`, randomise).

### Ô£à Header GM ÔÇö Filtre par balance native suffisante
- **Quand pas de filtre cha├«ne** (Header GM), l'API v├®rifie `eth_getBalance` sur chaque cha├«ne GM en parall├¿le.
- **Filtre** : ne retourne que les cha├«nes o├╣ l'user a ÔëÑ $0.05 de balance native (suffisant pour le tip GM).
- **Fallback** : si aucune cha├«ne n'a assez de gas ÔåÆ retourne quand m├¬me un contrat (tx ├®chouera mais API ne bloque pas).
- **ChainCard GM** : pas de check balance ÔÇö pick al├®atoire parmi les contrats de la cha├«ne.
- **Fichier modifi├®** : `gm-contracts.ts` (endpoint `/api/gm/random`).

### Ô£à Token Registry ÔÇö Humanity (H) ajout├® ├á Ethereum
- **Token** : `0xcf5104d094e3864cfcbda43b82e1cefd26a016eb` ÔÇö symbol="H", name="Humanity", decimals=18.
- **Probl├¿me** : RPCs Ethereum ├®chouaient sur `symbol()`/`name()` ÔåÆ token affich├® comme UNKNOWN ÔåÆ balance masqu├®e.
- **Solution** : ajout├® au `TOKEN_REGISTRY` Ethereum ÔåÆ metadata garanties m├¬me si RPC ├®choue.
- **Fichier modifi├®** : `registry.ts`.

### Ô£à UNKNOWN tokens ÔÇö Skip du discovery cache stale
- **Merge cache** : les tokens avec `symbol="UNKNOWN"` ou `name="Unknown Token"` sont skip├®s lors du merge du discovery cache.
- **Avant** : les tokens UNKNOWN stale polluaient les r├®sultats pendant 24h (TTL du cache).
- **Maintenant** : le token sera red├®couvert via Blockscout ou `eth_getLogs` avec les bonnes metadata.
- **Fichier modifi├®** : `evm.ts` (lignes 272-273).

## ├ëtat actuel : v0.2.17 ­ƒƒó ÔÇö Home page restructur├®e + docs ├á jour (2026-05-19)

### Ô£à Home page ÔÇö Layout restructur├®
- **3 encarts feature** (Track 180+ blockchains, On-chain GM, Built-in scam detection) d├®plac├®s du haut vers le **bas de la page**, apr├¿s Recent Scans.
- Grille responsive `sm:grid-cols-3` en bas de `HomePageClient.tsx`.
- **Deep scan checkbox** d├®plac├®e juste en dessous du ChainSelector (├®tait en bas des options avanc├®es).
- **Donn├®es mises ├á jour** : 180+ chains (130+), 40 GM chains, 7-rule scam engine (10-rule).

### Ô£à About page + Footer ÔÇö Donn├®es synchronis├®es
- `/about` : 180+ chains, 40 GM chains, 7-rule scam, SCAN_CONCURRENCY 30 (50), roadmap 180+ chains.
- **Footer** (`SidebarLayout.tsx`) : v0.2.16, 180+ chains, 40x on-chain GM.

### ­ƒôØ Structure home page
```
page.tsx (server) ÔåÆ Logo + MiniCards + HomePageClient
HomePageClient.tsx ÔåÆ Formulaire scan + ChainSelector + Deep scan + Wallets + Recent Scans + 3 encarts feature
```

## ├ëtat actuel : v0.2.16 ­ƒƒó ÔÇö RealT Cache Permanent + 51 cha├«nes multi-RPC (2026-05-19)

### Ô£à RealT Pricing ÔÇö Cache permanent Redis
- **Cache Redis permanent** : `RealTPriceSource` stocke les prix dans Redis (`realt:price:{contract}`) sans TTL.
- **Mise ├á jour uniquement sur succ├¿s API** : quand l'API r├®pond 200 avec un prix valide, le cache est mis ├á jour.
- **Fallback infini sur ├®chec** : quand l'API bloque Railway (403/401/timeout), le prix cach├® est servi ind├®finiment.
- **Circuit breaker pr├®serv├®** : 5 ├®checs cons├®cutifs ÔåÆ skip API 30min, mais le cache Redis continue de servir les prix.
- **Hydratation m├®moire** : au premier acc├¿s, le prix Redis est charg├® en m├®moire pour les appels suivants.

### Ô£à 51 cha├«nes single-RPC enrichies
- **51/62 cha├«nes** ont re├ºu des RPCs additionnels depuis chainlist.org.
- **RPCs notables** : ETC (5 RPCs), FTM (4), HARMONY (5), FVM (5), DOGECHAIN (4), NEO_X (3), etc.
- **11 cha├«nes restent single-RPC** : aucun RPC suppl├®mentaire disponible sur chainlist.org (CROSS_MAINNET, CYSIC, ETHO_PROTOCOL, FOGO, HORIZEN_EON, LAYERAI, MITOSIS, MOCA_CHAIN, NUMINE, RIVALZ, STACK).
- **Fix "null" string** : CITREA, INTUITION, STABLE, VANA avaient `"null"` comme string dans les endpoints ÔåÆ corrig├®.

### Ô£à Blockscout Pro API ÔÇö Fonctionnel (v0.2.15)
- **Migration Pro API** : `explorer-discovery.ts` utilise l'endpoint universel `https://api.blockscout.com/v2/api?module=account&action=tokenlist&address=...&chain_id=...&apikey=...`.
- **52 cha├«nes Blockscout Pro API actives** : 35 cha├«nes WCORE existantes + 17 nouvelles (SHIMMER_EVM, BXN, EDEN, WORLD_MOBILE, PLAYNANCE_PLAYBLOCK, LIGHTLINK, MOCA_CHAIN, KITEAI, AWAJI, NUMINE, IOTA_EVM, EDU_CHAIN, ICB_NETWORK, CREDITCOIN, CROSS_MAINNET, GENSYN, NEON).
- **`eth_getLogs` TOUJOURS activ├®** ÔÇö Blockscout est un hint en plus, pas un remplacement. Les tokens d├®couverts par les deux sources sont merg├®s.
- **SCAN_CONCURRENCY r├®duit ├á 30** (├®tait 50) ÔÇö moins de saturation RPC free-tier.
- **Filtre UNKNOWN** : tokens sans symbole valide (symbol < 2 chars, "Unknown Token") sont filtr├®s.
- **Cl├® API** : stock├®e uniquement en variable Railway `BLOCKSCOUT_API_KEY`. Ne jamais copier la valeur r├®elle dans les docs.

### Ô£à RealT Pricing ÔÇö Circuit Breaker ajout├®
- **Probl├¿me** : `api.realtoken.community` bloque les IPs Railway (401/403/503/timeouts) ÔåÆ ralentit le scan Gnosis.
- **Fix** : circuit breaker dans `RealTPriceSource` ÔÇö apr├¿s 5 ├®checs cons├®cutifs, skip RealT pendant 30 min. Timeout r├®duit ├á 3s (├®tait 10s). Logs silencieux (`console.log` au lieu de `console.error`).
- **├ëtat** : les tokens RealT valides re├ºoivent leurs prix (~$50). Les tokens REG/governance (401) sont skip├®s silencieusement.

### ­ƒƒí scan_failed ÔÇö En investigation
- **Probl├¿me** : certains wallets retournent `scan_failed` quand toutes leurs cha├«nes ├®chouent (RPC timeout / consensus failed).
- **Cause** : 62/180 cha├«nes ont un seul RPC endpoint (free-tier unreliable). Avec 163 cha├«nes, beaucoup de RPCs timeout.
- **Logging ajout├®** : chaque cha├«ne qui ├®choue loggue la raison (`[scan] CHAIN: failed (errors: ...)`).
- **Prochaines ├®tapes** : ajouter plus de RPCs aux nouvelles cha├«nes, ou r├®duire le nombre de cha├«nes scann├®es par wallet.

### ­ƒö┤ PRIORIT├ë : Scan Performance & Fiabilit├®

**Le scan est le c┼ôur de WCORE.** Un scan lent ou qui ├®choue = utilisateur perdu. C'est la priorit├® #1.

#### Probl├¿mes actuels
- **`scan_failed` r├®currents** : wallets avec 160+ cha├«nes ÔåÆ timeout global. Les RPCs free-tier saturent.
- **11 cha├«nes single-RPC** : CROSS_MAINNET, CYSIC, ETHO_PROTOCOL, FOGO, HORIZEN_EON, LAYERAI, MITOSIS, MOCA_CHAIN, NUMINE, RIVALZ, STACK. Si le RPC est down ÔåÆ cha├«ne enti├¿rement cass├®e.
- **SCAN_CONCURRENCY=30** : r├®duit pour ├®viter la saturation, mais les scans multi-wallet restent lents.
- **Pricing cascade inefficace** : chaque worker refait les m├¬mes appels DefiLlama/GT ÔåÆ gaspillage API.

#### Axes d'am├®lioration (par priorit├®)
1. **Timeouts adaptatifs par RPC** : mesurer la latence r├®elle et ajuster les timeouts dynamiquement au lieu d'un timeout fixe.
2. **RPC health check au boot** : tester tous les RPCs au d├®marrage, marquer les morts, ne pas les inclure dans le consensus.
3. **Circuit breaker par RPC individuel** : pas juste par cha├«ne. Si un endpoint ├®choue 3x, le skip pour 5min.
4. **Pricing cache partag├® (RedisPricingCache)** : d├®j├á fait Ô£à ÔÇö les prix sont partag├®s entre workers.
5. **Blockscot Pro API** : d├®j├á fait Ô£à ÔÇö hint en plus pour la d├®couverte de tokens.
6. **RealT cache permanent** : d├®j├á fait Ô£à ÔÇö plus d'appels API inutiles quand Railway est bloqu├®.
7. **Enrichissement RPCs** : 51/62 cha├«nes single-RPC ont re├ºu des RPCs additionnels Ô£à.

#### Objectif
- **< 15s** pour un scan 1 wallet ├ù 15 cha├«nes (cold).
- **< 5s** pour un scan 1 wallet ├ù 15 cha├«nes (warm, cache hits).
- **0 `scan_failed`** sur les wallets avec < 50 cha├«nes.
- **Taux de succ├¿s > 95%** sur toutes les cha├«nes (actuellement ~80% sur les cha├«nes long-tail).

### Mobile UI usage audit ÔÇö Phase 1 shipped
- Objectif : rendre WCORE utilisable sur mobile au quotidien sans d├®grader le rendu desktop.
- Fixes : sidebar drawer mobile avec overlay, TopBar mobile minimal avec menu overflow, notifications viewport-safe, TokenTable compact mobile, dropdowns/search WalletContent adapt├®s.
- Desktop prot├®g├® : les comportements existants restent derri├¿re `sm:` (`sm:ml-[56px]` / `sm:ml-[200px]`, `hidden sm:flex`, colonnes desktop `sm:w-*`).
- Specs : `docs/superpowers/specs/2026-05-18-mobile-ui-audit-design.md` et plan `docs/superpowers/plans/2026-05-18-mobile-ui-audit.md`.

---

## ├ëtat pr├®c├®dent : v0.2.12 ­ƒƒó ÔÇö H6 Redis Pricing Cache + Scam Override Fix (2026-05-18)

### H6 ÔÇö Redis-backed pricing cache (ALL 3 engines)
- **Probl├¿me** : chaque engine (EVM, SVM, Cosmos) avait son propre `MemoryPricingCache` ÔåÆ prix non partag├®s entre scans concurrents (SCAN_CONCURRENCY=50), perdus au restart API.
- **Solution** : `RedisPricingCache` adapte `CacheStore` ÔåÆ `PricingCache`. TTL 6h pour les prix, 24h pour les markers.
- **Wiring** : `sharedPriceCache` option dans les 3 engines + `dispatch.ts` + `scan.ts` cr├®e l'instance Redis au boot.
- **Fichiers** : `packages/core/src/pricing/redis-pricing-cache.ts` (nouveau), `evm.ts`, `svm.ts`, `cosmos.ts`, `dispatch.ts`, `scan.ts`, `pricing/index.ts`.

### Scam override contract propagation fix
- **Cause** : 3 d├®connexions frontendÔåöbackend emp├¬chaient le blocage par contrat de survivre au refresh.
- **Fixes** : bouton admin envoie `contract`, upsert DB ne l'├®crase pas, `GET /api/admin/scam-overrides` + `useScamOverrideSync`.
- **Migration** : `20260518103000_add_scam_override_contract` ajoute `scam_overrides.contract` + seed NEGED.
- **Fichiers** : `admin.ts`, `TokenTable.tsx`, `scam-detector.ts`, `WalletContent.tsx`, `schema.prisma`.

### ConnectButton auth rehydration fix
- **Cause** : wagmi auto-connect laissait `authStep = "idle"` (NOP) ÔåÆ wallet connect├® mais UI "Connect Wallet".
- **Fix** : nouvel ├®tat `"ready"` ÔÇö affiche l'adresse avec "Sign In", mais NE traite PAS comme authentifi├®.
- **3 bugs corrig├®s** : erreurs non-401 auto-authentifiaient, erreur r├®seau auto-authentifiait, adresse localStorage utilis├®e au lieu de la r├®ponse `/api/auth/me`.
- **Pages gated sur `authStep === "authenticated"`** : GmButton, GmPageClient, ProfileClient.
- **Fichiers** : `ConnectButton.tsx`, `GmButton.tsx`, `GmPageClient.tsx`, `ProfileClient.tsx`.

### Audit 4-domaines en parall├¿le (security + perf + quality + chains)
- **Rapports** : `.omc/research/audit-2026-05-18-{security,performance,quality,chains,CONSOLIDATED.md}`
- **Totaux** : 2 CRITICAL ┬À 14 HIGH ┬À 27 MEDIUM ┬À 13 LOW

### Fixes shipp├®s ce cycle (10/10 Ô£à)

- **C1+C2** Secrets sanitization ÔåÆ `scripts/backup-db.ps1` lit `$env:BACKUP_DATABASE_URL` ou `scripts/.env.backup`. Action op├®rateur : rotate `JWT_SECRET` + Postgres password sur Railway (encore exploitables via git history `f9e47ca`).
- **H8** Avalanche `LLAMA_CHAIN_SLUG="avax"` ÔåÆ fix silencieux global DefiLlama (slug Ôëá `DEX_SLUG="avalanche"`).
- **H1** LinkedWallet partial unique index `WHERE verificationStatus='SIGNED'` + handler P2002 ÔåÆ 409. Migration `20260518120000_linked_wallet_signed_unique`. Action op├®rateur : `pnpm prisma migrate deploy`.
- **H4 perf** GT throttle singleton process-level ÔåÆ ├®limine la multiplication ├ù50 du budget sous `SCAN_CONCURRENCY=50`.
- **H5/H6 perf** Parallel pricing SVM + Cosmos ÔÇö `PRICING_CONCURRENCY=10` workers au lieu du `for...of` s├®quentiel. Gain estim├® -5-30s/scan sur wallets avec nombreux tokens SVM/Cosmos.
- **H5 security** Rate-limit catch-all `/api/*` ÔÇö `RATE_LIMIT_CATCH_ALL=120/min` pour tout endpoint non couvert par un limit sp├®cifique. Anti-DoS sur endpoints futurs/obscurs.
- **H9 quality** `backup-db.js` ÔåÆ `pg_dump` natif ÔÇö plus de Prisma `$queryRawUnsafe` manuel, dump SQL complet avec `--clean --if-exists`. Requiert PostgreSQL client tools dans PATH.
- **Chains M** Cascade r├®ordonn├®e : on-chain V3 **avant** CoinGecko fallback + retry `NEED_ONCHAIN` marker. Les prix de pool on-chain sont plus fiables que CG pour les long-tail stale.

### Punch list ÔÇö ALL 10 shipped Ô£à
- C1+C2 ┬À H1 ┬À H4 ┬À H5 ┬À H6 ┬À H8 ┬À H9 ┬À Chains M ┬À H2/H3 (JWT cookies) ┬À H7 (ritual chains)

**Validation** : Typecheck packages/core Ô£à, apps/api Ô£à, apps/web Ô£à. Core tests 123/123 Ô£à.

---

## ├ëtat pr├®c├®dent : v0.2.11 ­ƒƒó ÔÇö GM Recovery + Explorers + RPC Hardening (2026-05-18)

### GM History Recovery ÔÇö 10 on-chain GMs r├®cup├®r├®s

- **Cause racine** : `eth_getLogs` block range limits sur certains RPCs. Scroll limite ├á 50 blocs, Sei ├á 2000, TAC ├á 2000. Le recovery initial (`recover-gm-history.ts`) utilisait des chunks de 10 000 blocs ÔåÆ toutes les requ├¬tes ├®chouaient silencieusement.
- **Fix** : script `recover-missing-gms.js` avec recherche binaire du bloc de d├®ploiement + micro-chunks de 50 blocs.
- **R├®sultat** : 10 GMs r├®cup├®r├®s ÔÇö Scroll (5), Sei (2), TAC (1), Cyber (1), OpenLedger (1).
- **Stats finales** : 127 on-chain GMs, 36 cha├«nes, 12 jours actifs (7-17 Mai), streak 11, score 1338.
- **Garde-fou** : tout nouveau script de recovery doit d├®tecter les limites de range RPC (`Block range is too large`, `limited to 0 - 50 blocks`) et s'adapter automatiquement.

### Explorers Module ÔÇö Source unique partag├®e

- **`apps/web/lib/explorers.ts`** ÔÇö nouveau module avec mapping de 43 explorers blockchain + `getExplorerUrl(chainKey, contract)`.
- **Corrections d'URLs** : Sei (seitrace.com ÔåÆ seistream.app, path `/contracts/`), OpenLedger (blockscout ÔåÆ scan.openledger.xyz), TAC (blockscout ÔåÆ explorer.tac.build).
- **Adresses contrats GM cliquables** : `GmContractsPanel` affiche maintenant des liens vers l'explorer de chaque cha├«ne avec `Ôåù`.
- **TokenTable migr├®** : utilise le module partag├® au lieu de sa copie locale du mapping EXPLORERS.

### RPC Hardening ÔÇö 9 cha├«nes renforc├®es

- **Second RPCs ajout├®s** : ANCIENT8 (thirdweb), B3 (thirdweb), OPENLEDGER (thirdweb), TEMPO (rpc.tempo.xyz), ZIRCUIT (thirdweb), TAC (ankr + drpc + thirdweb).
- **RPCs morts retir├®s** : calderachain.xyz de INTUITION, RARI, ZERO. p2pify.com + drpc.org de ZIRCUIT.
- **CACHE_VERSION bump** sur les 9 cha├«nes pour invalider les caches.
- **Scan concurrency** : BATCH_SIZE 20ÔåÆ50 dans WalletContent.tsx, seuil async 20ÔåÆ50.

### DB Backup Automatis├®

- **`scripts/backup-db.js`** ÔÇö Export SQL de toutes les tables via `$queryRaw`.
- **`scripts/backup-db.ps1`** ÔÇö Wrapper PowerShell. Backup manuel : `powershell -File scripts/backup-db.ps1`.
- **Rotation 7 jours** dans `backups/`.

**Validation** : Typecheck API/Web/Core Ô£à, ESLint 0 Ô£à, Core tests 123/123 Ô£à, pnpm audit 0 vuln Ô£à.

---

## ├ëtat pr├®c├®dent : v0.2.10 ­ƒƒó ÔÇö Scan performance x5 + Audit polish + CM assets (2026-05-17)

**2 commits d'audit quick-win + medium appliqu├®s (`7e4a0c9` + `63fd170`)** : consolidation qualit├® sur 37 fichiers.

### Audit quick-win fixes (6 corrections, 14 fichiers)

- **4 imports/variables inutilis├®s** supprim├®s (`creator.ts`, `index.ts`, `icons.tsx`, `useGmContracts.ts`)
- **2 `catch{}` sans cause** corrig├®s dans `safe-http.ts` (`preserve-caught-error`)
- **5 interfaces vides ÔåÆ `type` aliases** dans `evm.ts`, `svm.ts`, `cosmos.ts`
- **4 directives ESLint inutiles** retir├®es (`wagmi.ts`, `csv-export.test.ts`, `scam-detector.ts`, `redis-store.ts`)
- **`react-hooks/refs` fix** dans `GmWithdrawNotification.tsx` ÔÇö ref ├®crit dans `useEffect` au lieu du render
- **`SCAN_CONCURRENCY` align├®** ÔåÆ d├®faut **50** partout (code + doc)

### Audit medium fixes (4 corrections, 23 fichiers)

- **API_URL consolid├®** ÔÇö 23 fichiers ÔåÆ `getApiUrl()` de `@/lib/api` (plus aucun inline `NEXT_PUBLIC_API_URL`)
- **`CHAIN_KEY_MAP` code mort supprim├®** ÔÇö 48 lignes inutilis├®es dans `icons.tsx`
- **13 `catch{}` non-triviaux logg├®s** ÔÇö `console.error` ajout├® dans `SupportClient`, `HomePageClient`, `ProfileClient`, `GmButton`, `useOnChainGm`, `useGmChain`, `ScanDetailClient`, `gamification/index.ts`, `NotificationsBell`
- **Fix script parsing** ÔÇö `ChainSelector.tsx` + `NotificationsBell.tsx` import manquant corrig├®s

**Validation** : ESLint 0/0 ┬À Typecheck 5/5 ┬À Core tests 112/112 Ô£à

### CM assets ÔÇö "You are early" post (2026-05-17)

- **`apps/web/public/wcore-post-you-are-early.svg`** ÔÇö Post X FOMO leaderboard vide. Badge WCORE, headline "You are early.", carte leaderboard (#1 gold, #2/#3 dashes), carte "HOW TO CLIMB" (Off-chain GM, On-chain GM, Referral), couronne "Be #1" centr├®e en haut ├á droite.
- **`apps/web/public/wcore-post-you-are-early.png`** ÔÇö PNG 1200x675 g├®n├®r├® via Playwright.
- **`apps/web/app/about/page.tsx`** ÔÇö Mis ├á jour : 40 GM chains, section "Scan performance" (concurrency 50, block cache, Multicall3, incremental discovery).
- **`apps/web/app/page.tsx`** ÔÇö Home : liste compl├¿te des 40 GM chains.
- **`apps/web/components/SidebarLayout.tsx`** ÔÇö Footer : v0.2.10, 40x on-chain GM.
- **`apps/web/components/WalletContent.tsx`** ÔÇö `BATCH_SIZE` 20ÔåÆ50, async threshold 20ÔåÆ50.
- **`.env.example` / `.env.staging`** ÔÇö Comment SCAN_CONCURRENCY 20ÔåÆ50.
- **`AGENTS.md` / `DEPLOY.md`** ÔÇö Doc synchronis├®e avec SCAN_CONCURRENCY=50.
- **`docs/superpowers/specs/CM-STRATEGY.md`** ÔÇö Post 13 document├® avec texte final et notes visuelles.

### Scan performance v0.2.10 (d├®tails)

- **Deep scan range** : 500k ÔåÆ 200k blocs (`scan.ts`)
- **SCAN_CONCURRENCY** : 20 ÔåÆ 50 (`scan.ts`, `WalletContent.tsx`)
- **Block cache** : 30s TTL par cha├«ne (`evm.ts`)
- **Timeout adaptatif** : 5s deep scan, 2.5s normal (`evm.ts`)
- **Diagnostic startup** : cache backend log (`server.ts`)

### Cache alignment SVM & Cosmos (v0.2.10)

Cache Redis harmonis├® entre les 3 VMs ÔÇö tous les caches de l'EVM sont maintenant disponibles sur SVM et Cosmos :

| Cache | EVM | SVM | Cosmos |
|-------|-----|-----|--------|
| Negative (10 min) | Ô£à | Ô£à | Ô£à |
| Native balance (1h) | Ô£à | Ô£à | Ô£à |
| Token accounts/balances (1h) | Ô£à | Ô£à (`ta:`) | Ô£à (`bal:`) |
| Per-token individuel (1h) | Ô£à (`token:`) | Ô£à (`token:`) | Ô£à (`token:`) |
| Staking (1h) | N/A | N/A | Ô£à (`del:`, `unb:`, `rew:`) |
| Discovery incr├®mental | Ô£à | N/A | N/A |

**Tests unitaires** : 12 nouveaux tests de cache (4 SVM + 8 Cosmos) dans `svm.test.ts` et `cosmos.test.ts`.
**Tests d'int├®gration Redis** : `apps/api/test/cache-integration.test.ts` ÔÇö 9 tests end-to-end qui v├®rifient les cl├®s Redis apr├¿s des vrais appels `/api/scan` (SVM + Cosmos). Export `sharedCache` depuis `server.ts`.

### CM engagement sessions (2026-05-17)

- **Post 13 "You are early"** publi├® (`https://x.com/WCORExyz/status/2056067886297334250`) ÔÇö FOMO leaderboard vide, couronne "Be #1", carte HOW TO CLIMB.
- **Dustswap** (`@DustswapOnBase`) ÔÇö Reply sur tweet "Azul upgrade". Angle: Base DEX UX, WCORE tracks Base wallets. DMs d├®sactiv├®s ÔåÆ reply public.
- **SuperEarn** (`@superdapp`) ÔÇö 2 replies : (1) GM back sur post leaderboard WCORE, honn├¬te sur DeFi roadmap. (2) Reply sur post "DeFi should grow your assets, not drain your time" ÔÇö visibility should be default.
- **JonaWeb3** ÔÇö Reply sur "Too many tabs. Too many approvals." ÔÇö tabs = real churn driver, cognitive load across chains.
- **Gotcha** : sur les threads, le premier bouton Reply appartient au tweet racine, pas ├á la cible. Il faut trouver l'article sp├®cifique par handle + contenu avant de cliquer Reply. Un reply @larc_gg a ├®t├® post├® sur le mauvais tweet et supprim├®.

### Points explainer ÔÇö /profile/points (2026-05-17)

- **`apps/web/app/profile/ProfileClient.tsx`** ÔÇö Nouvelle section "How Points Work" sous le breakdown. Explique les 4 sources de points :
  - **Off-chain GM** : 10 pts/jour + bonus streak croissant (J1=10, J2=12, J3=13...)
  - **On-chain GM** : 20 pts base + bonus cha├«ne (5 pts/cha├«ne + streak) + bonus g├®n├®ral (streak ├ù 2)
  - **Per-chain streak** : chaque cha├«ne suit son propre streak (J1=5, J2=7, J3=8...)
  - **Referrals** : 10% des points des filleuls, minimum 1 pt

---

## ├ëtat pr├®c├®dent : v0.2.10 ­ƒƒó ÔÇö Scan performance x5 (2026-05-17)

**S├®rie v0.2.10 sur master** : optimisations majeures du pipeline de scan pour r├®duire la latence sur les scans multi-wallets multi-cha├«nes avec deep scan.

### Optimisation deep scan range (500k ÔåÆ 200k blocs)

- **`apps/api/src/plugins/scan.ts`** ÔÇö `logBlockRange` deep scan r├®duit de `500_000` ├á `200_000`.
- **Impact** : `eth_getLogs` sur 200k blocs au lieu de 500k = r├®duction drastique du temps RPC et des timeouts. 200k blocs couvre ~10 jours sur Ethereum (12s/bloc), suffisant pour capturer l'activit├® r├®cente.

### SCAN_CONCURRENCY par d├®faut 20 ÔåÆ 50

- **`apps/api/src/plugins/scan.ts`** ÔÇö d├®faut pass├® de `20` ├á `50`. Configurable via env `SCAN_CONCURRENCY`.
- **Impact** : 110 cha├«nes passent de 55 batches s├®quentiels ├á 22. Node.js g├¿re facilement 50 appels RPC parall├¿les sans saturer les RPCs publics.

### Timeout RPC adaptatif pour deep scan

- **`packages/core/src/engines/evm.ts`** ÔÇö timeout RPC pass├® ├á `5000ms` quand `logBlockRange > 50_000` (deep scan), sinon `2500ms` (scan normal).
- **Impact** : les RPCs lents sur `eth_getLogs` de grande fen├¬tre ont plus de temps pour r├®pondre avant d'├¬tre consid├®r├®s comme ├®chou├®s, r├®duisant les retries inutiles.

### Cache du block courant par cha├«ne (30s TTL)

- **`packages/core/src/engines/evm.ts`** ÔÇö `_blockCache` module-level avec TTL 30s. `getRecentLogRange` v├®rifie le cache avant d'appeler `eth_blockNumber`.
- **Impact** : sur un scan 10 wallets ├ù 110 cha├«nes, ├®vite **1100 appels `eth_blockNumber`** redondants (le block courant est le m├¬me pour tous les wallets sur une cha├«ne). Gain ~2-5s sur le scan total.

### Diagnostic cache backend au startup

- **`apps/api/src/server.ts`** ÔÇö log structur├® au d├®marrage indiquant si le cache est Redis ou MemoryCacheStore, avec host/port Redis si configur├®.
- **Impact** : visibilit├® imm├®diate si le cache de d├®couverte incr├®mental est persistant (Redis) ou volatile (MemoryCacheStore apr├¿s restart).

### Propagation `deepScan` flag aux engines SVM/Cosmos

- **`packages/core/src/engines/dispatch.ts`** ÔÇö `DispatchOptions` inclut maintenant `deepScan?: boolean`.
- **`packages/core/src/engines/svm.ts`** + **`cosmos.ts`** ÔÇö signatures mises ├á jour pour accepter `deepScan` et `cache` options.

**Build / v├®rifs** : `@wcore/core typecheck` Ô£à, `@wcore/api typecheck` Ô£à, `@wcore/core test` ÔåÆ **112/112 pass** Ô£à.

---

## ├ëtat pr├®c├®dent : v0.2.9 ­ƒƒó ÔÇö Native symbols single source + STABLE/TAC GM + GM reconciliation (2026-05-17)

**S├®rie v0.2.9 sur master** : fix source unique des symboles natifs, activation STABLE/TAC en GM, puis correction permanente du drift DB/on-chain pour les GM journaliers.

### Fix : symboles natifs ÔÇö source unique

- **`apps/web/lib/chain-native-symbols.json`** ÔÇö fichier JSON g├®n├®r├® depuis `@wcore/core` configs (`NATIVE_SYMBOL` de chaque cha├«ne). 130+ entr├®es, mis ├á jour quand on ajoute/├®dite une cha├«ne.
- **`useGmContracts.ts`** ÔÇö `getNativeSymbol()` supprim├® le dictionnaire hardcod├® de 63 lignes ÔåÆ `return nativeSymbolsMap[chainKey.toLowerCase()] || "NATIVE"`.
- **`CreatorClient.tsx`** ÔÇö idem, `NATIVE_SYMBOLS` hardcod├® remplac├® par import du JSON.
- **Bug corrig├®** : OpenLedger affichait "ETH" au lieu de "OPEN" pour les fees withdrawables. Toutes les nouvelles cha├«nes GM sont automatiquement couvertes.

### Activation STABLE en GM

- Factory `0x67d96a81e44761edd3e9a4ba5e3872ac5980122d`, chainId **988** (v├®rifi├® on-chain via `eth_chainId`)
- RPC : `https://rpc.stable.xyz` (single-RPC, native = gUSDT)
- 7 fichiers mis ├á jour : factories, CHAIN_RPCS, ChainCard, DeployClient, GmPageClient, useOnChainGm, wagmi

### Activation TAC en GM

- Factory `0xdc73b2ddf853bd4959288b45d5e5ac348c73075a`, chainId **239** (v├®rifi├® on-chain)
- RPCs : `https://rpc.tac.build` + `https://239.rpc.thirdweb.com` (2 RPCs, consensus possible)
- 7 fichiers mis ├á jour : factories, CHAIN_RPCS, ChainCard, DeployClient, GmPageClient, useOnChainGm, wagmi

### Fix : GM status reconciliation on-chain

- **Sympt├┤me** : sur Lisk, un GM on-chain confirm├® (`0xe65dccd7b53f7fa20e718e3ac577d52abab3396ce7e032b179784f1e95403692`) affichait encore `Ôø¢ Say GM` sur `/gm`.
- **Cause racine** : le contrat ├®tait connu/d├®ploy├®, mais le record `onchainGm` DB du jour n'avait pas ├®t├® cr├®├®. `/api/gm/status` ne lisait que la DB pour `gmDone`, donc une tx r├®ussie mais un POST `/api/gm/onchain` rat├® laissait l'UI fausse.
- **Mauvais fix retir├®** : un seed one-off `seedMissingOnchainGm` avait ├®t├® ajout├® temporairement puis supprim├®. Ne pas utiliser de seeds manuels pour corriger un drift DB/on-chain.
- **Fix permanent** : `useGmChain` appelle maintenant `/api/gm/status-onchain` quand la DB retourne `deployed=true` mais `gmDone=false`. L'endpoint v├®rifie les events `GmCheckedIn` on-chain du jour et l'UI affiche `Ô£à GM Done` m├¬me si la DB n'a pas encore le record.
- **Test de garde** : `apps/web/__tests__/gm-status-reconcile.test.ts` + helper `apps/web/lib/gm-status-reconcile.ts`.

### Growth / CM ÔÇö cycles X safe

- **Cycle 5 Ink / portfolio trackers** : r├®ponses v├®rifi├®es ├á @ssaamig, @_TNSKA et @sdsonjoy30. Angles : point tasks vs signaux on-chain durables, complexit├® RPC/token discovery/pricing/cache, GM Score comme signal de consistance. Likes v├®rifi├®s sur @_TNSKA et @sdsonjoy30.
- **Notifications** : follow-up court ├á @ChingChingPulse sur `read-only analytics != execution`, sans promo ni mention directe.
- **Cycle 6 Base / Ink activity categories** : r├®ponses v├®rifi├®es ├á @0xkopil et @0xEchoOnchain. Angles : m├®moire par wallet des swaps/mints/app activity/GM/deploys sur Base, s├®paration socials/on-chain/ecosystem/dev work sur Ink.
- **R├¿gle confirm├®e** : conserver les replies sans mention directe `@WCORExyz` quand le thread est d├®j├á proche de nos sujets, ├®viter le sur-engagement dans le m├¬me cluster Ink/Base, et stopper apr├¿s 2-3 replies propres.
- **Daily Update v5** : post X publi├® (`https://x.com/WCORExyz/status/2056042383058288714`) avec visuel `wcore-post-daily-update-5` (logos locaux des 10 nouvelles cha├«nes GM, cartes features). Angle : 10 new GM chains, native fee symbols, on-chain status sync, activity tracking polish.
- **Daily Update v6** : post X publi├® (`https://x.com/WCORExyz/status/2056448263444656160`) avec visuel `wcore-post-daily-update-6` (40 on-chain GM chains, cleaner token data, faster/safer scans). Angle volontairement punchy et rassurant : pas de vocabulaire `recovery`/`incident`, uniquement robustesse produit.
- **Daily Update v7** : visuel pr├®par├® `apps/web/public/wcore-post-daily-update-7.svg` + `.png`. Angle : passage **130 ÔåÆ 180+ chains**, Blockscout logos live, RealT pricing fixed, faster scan path. Composition valid├®e : grande carte gauche centr├®e `180+ tracked chains` avec anneau de 8 logos locaux, 3 cartes droites harmonis├®es, pas de pills dans la carte gauche, pas de wording public `API restored`/`Safer admin`.
- **One Scan Flow** : post X publi├® (`https://x.com/WCORExyz/status/2057542358670189016`) avec visuel `wcore-post-global-scan-queue` (queue globale EVM/Solana/Cosmos, 30 chain jobs, live progress). Angle user-facing : scans multi-wallet plus fluides, r├®sultats progressifs, pas de VM waiting room.
- **Multichain Map** : post X publi├® (`https://x.com/WCORExyz/status/2058205408188158434`) avec visuel `wcore-post-multichain-map` (`Your crypto is not on one chain.`). Angle : 180+ chains read-only, EVM/Solana/Cosmos/long-tail chains, one clean dashboard.
- **Daily Update v9** : post X publi├® (`https://x.com/WCORExyz/status/2058219512185434210`) avec visuel `wcore-post-daily-update-9`. Angle : cleaner scans, better coverage, RealT/Gnosis, Solana+Cosmos fallback, 180+ chain mapping, no wallet connect.
- **Cycle 9 Cosmos Hub / consolidation** : 3 replies + 1 DM. @Cosmos Hub (`https://x.com/cosmoshub/status/2057622030745288856`) sur Eureka EVM+Solana, reply `https://x.com/WCORExyz/status/2057666202172485984`. @Pavaard (`https://x.com/pavaardzzz/status/2057397580393291902`) sur consolidation DeFi one view, reply `https://x.com/WCORExyz/status/2057666250420232447`. @AALADIN (`https://x.com/aaladincyot/status/2057474424282992793`) redirect DM + DM manuel envoy├®. Angles : Cosmos multi-VM, 180+ chains read-only, DMs open for collaborations.
- **Cycle 10 discovery large** : 3 replies v├®rifi├®s. @Rebel (`https://x.com/Ri33itB4ckw4rd/status/2056840280897204270`) demande wallet tracker multi-wallet/multi-chain + PnL, reply `https://x.com/WCORExyz/status/2057691005109887015`. @Kucurella (`https://x.com/kikii3429/status/2057553836127232236`) friction crypto/trop d'outils, reply `https://x.com/WCORExyz/status/2057691107354444147`. @DefiTax.ai (`https://x.com/defitaxAgent/status/2057521905498722339`) tax/staking positions cross-chain, reply `https://x.com/WCORExyz/status/2057691223867973708`. Doublon Rebel `2057691673065386085` supprim├® apr├¿s v├®rification. Angles : read-only portfolio layer, 180+ chains, EVM/Solana/Cosmos, normalisation pricing/spam/bridges.
- **Audit complet v0.2.25** : `docs/audit-2026-05-21-complet.md` (architecture, s├®curit├®, API, engines, frontend, DB, 15 forces/faiblesses, 12 actions prioris├®es). Compl├¿te l'audit de surface `docs/audit-2026-05-21.md`.
- **Le├ºon CDP** : ne pas utiliser `browser.newPage()` en boucle sur le Chrome connect├® ÔåÆ tab spam. Pattern v2 : `browser.contexts()[0].newPage()` puis `.close()` apr├¿s chaque target. Composer multi-s├®lecteurs fallback.
- **Notifications Echo** : r├®ponse publi├®e et like v├®rifi├® sous le follow-up de @0xEchoOnchain (`https://x.com/0xEchoOnchain/status/2056037818464432575`) sur la s├®paration des cat├®gories Ink. Reply `https://x.com/WCORExyz/status/2056043659741519995` v├®rifi├®e via rechargement thread.

**Build / v├®rifs** : Next.js 16.2.6 Turbopack Ô£à, API/Web typecheck Ô£à, test cibl├® GM reconciliation Ô£à. D├®ploy├® sur Railway (API + Web).

---

## ├ëtat pr├®c├®dent : v0.2.8 ­ƒƒó ÔÇö Audit sprint complet (2026-05-17)

**9 commits atomiques sur master** : `412493b` ÔåÆ `53e4748` ÔÇö ferment l'int├®gralit├® des findings ­ƒö┤ HIGH et ­ƒƒí MEDIUM actionables de l'audit `audit-2026-05-17.md`.

### Sprint au format `(ID) commit ÔÇö change`

**S├®curit├® (4)**
- `(S2) 412493b` ÔÇö SIWE hardening : require `Expiration Time:` + `Chain ID:` pr├®sents. Le parser manuel sautait la validation d'expiration si la ligne ├®tait absente. Server-side nonce TTL bornait d├®j├á la fen├¬tre, mais EIP-4361 mandate ces champs.
- `(S1) df0f748` ÔÇö zod validation top-level sur `POST /api/scan` et `POST /api/scans/:id/share`. `ScanRequestBodySchema` cap `customTokens` ├á 100 entr├®es (DoS bound). `ScanShareBodySchema` valide `expiresAt` comme ISO datetime, plus de `Invalid Date` qui atteint Prisma.
- `(S6) 15848d7` ÔÇö nouveau job CI `security` parall├¿le : `pnpm audit --prod --audit-level=high` + `gitleaks/gitleaks-action@v2` sur l'historique complet.
- `(S5) 53e4748` ÔÇö keyer rate-limit per-address pour `/api/auth/nonce` et `/api/wallets/nonce` (pr├®-auth). Avant : IP-only spoofable via `X-Forwarded-For` si `TRUST_PROXY=true` sans CIDR allowlist Railway.

**Performance (4)**
- `(P-M5) 986666c` ÔÇö LRU eviction sur `MemoryPricingCache` (`packages/core/src/pricing/types.ts`). Default 20k entries, env override `PRICING_CACHE_MAX_ENTRIES`. Bornait une fuite m├®moire lente sur Railway.
- `(P-M1) 0a3b40a` ÔÇö `GeckoTerminalPriceSource` throttle window configurable via env `GT_THROTTLE_MAX_CALLS` / `GT_THROTTLE_WINDOW_MS` (defaults 40/60s pr├®serv├®s). Ops peuvent scale up si `SCAN_CONCURRENCY > 1` cause de la starvation entre scans.
- `(P-H4-disco) 851b940` ÔÇö fire-and-forget sur les writes discovery cache (token list + block cursor). Avant : `await Promise.all([...])` ajoutait ~4-8ms (2 ├ù Redis RTT) ├á chaque scan pour aucun b├®n├®fice (caller ne consomme pas le r├®sultat).
- `(P-M2) 0341a1d` ÔÇö cache `getUserPlan` (5-min TTL, `sharedCache` Redis). ├Ç `SCAN_CONCURRENCY=5` pour le m├¬me user, 5 queries `prisma.user.findUnique` identiques tapaient la m├¬me ligne. Webhook Stripe (`invalidateUserPlan`) clear la cl├® imm├®diatement sur plan change ÔÇö pas de fen├¬tre stale post-upgrade.

**Ops (1)**
- `(C2) e9bf7c3` ÔÇö startup validator : log WARN listant les 15 chains EVM/SVM avec `<2` RPC endpoints (consensus rule `votes*2 > total` ne peut pas atteindre la majorit├®). Liste : `ANCIENT8, B3, CITREA, CODEX, FOGO, INCENTIV, INTUITION, JUCHAIN, MITOSIS, OPENLEDGER, STABLE, TAC, TEMPO, VANA, ZIRCUIT`. CITREA d├®j├á acknowledged dans AGENTS.md, les 14 autres devraient grow un 2nd endpoint public.

### Findings reclass├®s au scan

- **P-L3** (`_accessOrder` splice O(n)) ÔåÆ **ALREADY-FIXED** : `packages/core/src/engines/meta-cache.ts` utilise d├®j├á le pattern Map insertion-order LRU. L'audit pointait sur du code obsol├¿te.
- **S3** (body limits par route) ÔåÆ **MITIG├ë** en pratique : les schemas zod cappent les strings (`message` 4000 / `description` 2000 / `label` 500) et `ScanRequestBodySchema` borne `customTokens` ├á 100.
- **P-M6** (index `WalletScan.address`) ÔåÆ **SPECULATIF / YAGNI** : aucune query ne filtre par `address` aujourd'hui. ├Ç ajouter quand le query path appara├«t.

### Verdict audit

**ACCEPT-WITH-RESERVATIONS ÔåÆ ACCEPT**. Toutes les frictions production-grade identifi├®es sont closes.

### Backlog (pas quick-win, refactors widespread ou research)

- ­ƒƒí **Q1+Q5** ÔÇö lint rule `@typescript-eslint/no-explicit-any` + cleanup `apps/web/app/profile/ProfileClient.tsx` (8 casts) + utilisation centrale de `apps/web/lib/api.ts` (25 sites duplique `getApiUrl()`). ├Ç traiter en sprint d├®di├®.
- ­ƒƒó **Q2** ÔÇö `prisma: any` propag├® dans les signatures de plugins (`support.ts`). Demande un type Prisma propre dans le helper d'auth.
- ­ƒƒó **Q4** ÔÇö audit case-by-case des 27 `.catch(() => {})` : distinguer le swallowing fire-and-forget l├®gitime des erreurs effectivement masqu├®es.
- ­ƒƒó **C1** ÔÇö research manuel d'un 2nd RPC public pour les 14 chains EVM/SVM single-endpoint (hors CITREA d├®j├á ack). ├Ç cross-check avec chainlist.org + tests `rpc-mcp__rpc_validate_endpoint`.

### V├®rifs

```
pnpm typecheck             ÔåÆ clean sur api + core
pnpm -F @wcore/core test   ÔåÆ 112/112 pass
pnpm audit --prod          ÔåÆ no known vulnerabilities
```

Push pending : 9 commits pr├¬ts ├á la livraison. La CI lancera le job `security` au prochain push.

**Document d'audit complet** : `.omc/research/audit-2026-05-17.md`

---

## ├ëtat pr├®c├®dent : v0.2.7 ­ƒƒó ÔÇö Chain icons complets (2026-05-16)

**Chain icons refactor complet ÔÇö 7 commits sur master** : `74e179c` ÔåÆ `bd9c197`

### Probl├¿me initial
L'audit des ic├┤nes de cha├«nes (llamao CDN + TrustWallet fallback) avait identifi├® **112/130 OK**, 18 cass├®es. Scripts de t├®l├®chargement (`scripts/audit-chain-icons.mjs`, `scripts/download-chain-icons.mjs`) livr├®s mais **non commit├®s**.

### Root cause #1 : `.gitignore` bloquait les images
Le `.gitignore` contenait `*.png` et `*.jpg` (artefacts de debug Playwright) **sans exception** pour `apps/web/public/chains/`. R├®sultat : **35 fichiers critiques non track├®s** (Ethereum, Base, BSC, Polygon, Solana, Arbitrum, Optimism, Avalanche, Gnosis, etc.) ÔåÆ jamais d├®ploy├®s sur Railway ÔåÆ ic├┤nes manquantes en prod.

### Root cause #2 : `next/image` cass├® en standalone
`next/image` avec `unoptimized` ne servait pas les chemins locaux `/chains/*.png` correctement en mode Docker standalone.

### Root cause #3 : Logos obsol├¿tes
Certains logos t├®l├®charg├®s depuis CMC/llamao ├®taient des **anciennes versions** (HEMI = logo token CMC 32867, VANA = ancien logo llamao, SOMNIA = ancien).

### Fixes appliqu├®s
- **`.gitignore`** : ajout de `!apps/web/public/chains/**` pour autoriser les ic├┤nes de cha├«nes
- **35 fichiers PNG/JPG** ajout├®s au repo (ARBITRUM_ONE, AURORA, AVALANCHE, BASE, BLAST, BOBA, BSC, CELESTIA, CELO, COSMOS_HUB, CRONOS, ETHEREUM, GEB, GNOSIS, HEMI, INJECTIVE, KAVA, KCC, LINEA, MANTLE, METAL_L2, METIS, MOONBEAM, MOONRIVER, OPTIMISM, OSMOSIS, POLYGON, SCROLL, SEI, SHIBARIUM, SOLANA, TERRA, XRPLEVM, ZERO, ZKSYNC_ERA)
- **`ChainIcon.tsx`** refactor├® : `next/image` ÔåÆ `<img>` natif, cascade manifest ÔåÆ CDN llamao ÔåÆ emoji fallback, d├®tection `onError`
- **Logos remplac├®s depuis rubyscore CDN** (`https://rubyscore.fra1.digitaloceanspaces.com/chain_icons/`) :
  - **HEMI** : `hemi.svg` (remplace CMC token 32867)
  - **VANA** : `vana.png` (remplace ancien llamao)
  - **SOMNIA** : `somnia.jpg` (remplace ancien)
- **`chain-icon-manifest.json`** mis ├á jour pour pointer vers les bons fichiers
- **`ValueDistribution.tsx`** marqu├® `"use client"` (requis pour useState)

### R├®sultat
130 ic├┤nes locales servies depuis le `public/chains/` du conteneur Docker. 3 ic├┤nes mises ├á jour via rubyscore CDN. Fallback CDN llamao uniquement pour les cha├«nes absentes du manifest. Emoji fallback si tout ├®choue.

**Pending sprint suivant (chantiers lourds)** :
- **H6** `sharedPriceCache` ÔåÆ Redis CacheStore (refactor 3 engines, API sync legacy) ÔÇö ~2-3h d├®di├®es
- **H2** split `gm-routes.ts` (788 LOC) en `gm-rpc.ts` + `gm-tip-state.ts`
- **H3** split `WalletContent.tsx` (861 LOC) avec hook `useScanOrchestrator`
- **H5** typer Prisma `creator.ts:60-93` (besoin lecture sch├®ma)
- LOW : `scanJobs` LRU cap, wagmi typed chainId

**Build state** : `pnpm -F @wcore/api typecheck`, `pnpm -F @wcore/core typecheck`, `pnpm -F @wcore/web typecheck` ÔÇö tous verts. Tous les commits sur `master` pouss├®s.

### Growth / CM update (2026-05-17)

- **Patterns wobblhash adapt├®s ├á WCORE** : les r├¿gles op├®rationnelles utiles de l'ancien projet CM `wobblhash` ont ├®t├® port├®es dans `docs/superpowers/specs/CM-STRATEGY.md` et r├®sum├®es dans `AGENTS.md`. Conserv├® : read-only scan, snowball engagement, max 3 replies externes, 1 mention @WCORExyz sauf demande explicite, v├®rification avant/apr├¿s publication, stop si alerte d'automatisation X. Exclu : identit├® @wobblhash, macro positioning, multi-platform rules non-WCORE.
- **Session X safe acquisition** : 1 reply publi├®e et v├®rifi├®e sous @ChingChingPulse. La reply @3liXBT a ├®t├® supprim├®e apr├¿s publication mal form├®e par X/Playwright (premi├¿re phrase perdue, d├®but `.`). Scan read-only couvrant portfolio tracker, multichain wallet, wallet fragmentation, DeFi portfolio tracker, all-chains tracker, DeBank/Solana, multiple-wallet queries. Cibles concurrentes/promos skipp├®es : Artemis, Overlook, walletlens, CryptoLens, heyaura, ARC, Tria, Sumex.
- **Gotcha Playwright X** : le composer peut perdre la premi├¿re ligne apr├¿s focus imparfait/overlay. ├Ç partir de maintenant, toute publication X doit v├®rifier le texte r├®el dans le composer avant clic `Reply`, surtout la premi├¿re phrase. Si le texte r├®el ne matche pas le draft attendu, clear + retaper avant publication.
- **Duplicate reply guard X** : une reply @Wezx777 publi├®e au cycle suivant a ├®t├® supprim├®e car @WCORExyz avait d├®j├á r├®pondu au m├¬me thread le 2026-05-13. Nouveau garde-fou document├® : avant toute reply, v├®rifier le thread et `@WCORExyz/with_replies` pour le `status_id`, pas seulement l'absence du texte exact du nouveau draft.
- **Cycles safe suppl├®mentaires** : reply @polsia conserv├®e sur l'angle `companion` des portfolio trackers; reply @TitanidesLeto conserv├®e sur les agents read-only et la fronti├¿re advice/action. Les deux ont ├®t├® post├®es avec v├®rification du composer avant clic et v├®rification post-publication. ├ëtat final des interactions du 2026-05-17 : 3 replies conserv├®es (@ChingChingPulse, @polsia, @TitanidesLeto), 2 replies supprim├®es (@3liXBT malform├®e, @Wezx777 doublon).

## ├ëtat pr├®c├®dent : v0.2.4 ­ƒƒó ÔÇö Audit complet + Sprint 1+2+3 (2026-05-16)

**https://wcore.xyz** en ligne via Railway. API + Web d├®ploy├®s, typecheck monorepo Ô£à, ESLint global 0 erreurs.

### ­ƒöì Audit complet 2026-05-16 ÔÇö 4 domaines parall├¿les

Audit multi-agent (security-reviewer + code-reviewer + performance-engineer + blockchain-developer) livr├® dans `.omc/research/audit-2026-05-16-{security,quality,perf,chains}.md`. Verdict global : **LOW-risk s├®curit├®**, dette structurelle moyenne, gains perf concrets restants apr├¿s les 5 rounds pr├®c├®dents.

**Sprint 1 ÔÇö quick wins (6 fixes, livr├®s)** :
- `.gitignore` : `/x-*.js` ajout├® ÔåÆ 17 scripts CDP automation hors du repo
- `next.config.mjs` : `images.unoptimized: true` retir├® ÔåÆ WebP + lazy load Next.js r├®activ├®s
- `useOnChainGm.ts:53-56` : `checkOnChainDeployed` early-return si JWT pr├®sent ÔåÆ skip 41 `eth_call` MetaMask s├®riels (l'API `/api/gm/has-deployed` est d├®j├á la source de v├®rit├®)
- `GmWithdrawNotification.tsx:27-40` : `window.focus` listener debounc├® ├á 30s ÔåÆ stoppe le spam N+1 RPC ├á chaque tab-switch pendant un GM workflow
- `WalletContent.tsx:21-37` : `/api/chains` cache module-level (`chainVmMapPromise` avec retry si vide) ÔåÆ ÔêÆ50/150ms par scan trigger
- `server.ts:5,106-124` : rate-limit per-user (SHA256 du Bearer JWT, fallback IP) ÔåÆ utilisateurs authentifi├®s derri├¿re Railway/CGNAT/proxy partagent plus le m├¬me bucket

**Sprint 2 ÔÇö refactors cibl├®s (2 fixes HIGH, livr├®s)** :
- `gamification.ts:86-135` : **Multicall3 batch** (`aggregate3` via viem) sur `/api/gm/my-contracts`, grouping par chain ÔåÆ 1 RPC call/chain au lieu de 2├ùN s├®riels. Platform owner avec 10 contrats EVM = **1 call au lieu de 20**, latence ~5-30├ù sur le hot path. Fallback per-contract auto si chain sans Multicall3.
- `gamification.ts:683-708` : **deploy multi-RPC defense-in-depth** sur `/api/gm/contracts/deploy` (mirror du pattern `/api/gm/onchain`) ÔÇö interroge tous les RPCs en parall├¿le + 3 retries spac├®s ├á 1.5s. Un RPC public malveillant ne peut plus ├á lui seul faire passer un faux deploy receipt.

**Sprint 3 ÔÇö architecture (4 refactors, livr├®s)** :
- **GmContext Provider** (`apps/web/contexts/GmContext.tsx`) ÔÇö unifie les 3 sources de v├®rit├® ┬½ user deployed? ┬╗ (`useGmChain`, `useGmContracts`, `useOnChainGm`) en un seul contexte partag├®. Expose `deployedByChain`, `gmDoneByChain`, `contracts`, `contractsByChain`, `offChainDoneToday`, `onChainDoneToday`, `gmStreak` + actions (`sendGm`, `deployContract`, `markDeployed`, `markGmDone`, `refreshDeployedStatus`, `refreshContracts`, `refreshGlobalStatus`, `withdrawCreator`, `withdrawPlatform`). ├ëcoute les ├®v├®nements `wcore-gm-done` runtime.
- **WalletAssetsCommon** (`packages/core/src/engines/types.ts`) ÔÇö interface g├®n├®rique `WalletAssetsCommon<TToken>` partag├®e entre EVM/SVM/Cosmos engines. ├ëlimine les 8├ù `as unknown as Record<string, unknown>` dans `server.ts`. `EvmWalletAssets`, `SvmWalletAssets`, `CosmosWalletAssets` ├®tendent maintenant `WalletAssetsCommon<TToken>`. Les token types ont un index signature `[key: string]: unknown` pour compatibilit├® `Record<string, unknown>`.
- **gamification.ts split** (1304 LOC ÔåÆ 5 fichiers) ÔÇö `gamification/index.ts` (constants, utilities, main plugin), `gamification/gm-routes.ts` (10 endpoints GM), `gamification/leaderboard.ts` (leaderboard, quests, badges), `gamification/creator.ts` (creator stats), `gamification/notifications.ts` (notifications + SSE stream).
- **CI fix** ÔÇö `prisma generate` ajout├® avant `pnpm typecheck` dans `.github/workflows/ci.yml`. Sans ├ºa, `@wcore/db` exportait des types `@prisma/client` non g├®n├®r├®s ÔåÆ TS2305 sur User, WalletScan, Quest, etc.

**Nouvelles cha├«nes GM** :
- **Moonbeam** activ├® : factory `0x3fa756f1da5027a8ff692b2d65dface8eb446aaf`, chainId 1284. Source unique factory dans `packages/shared/src/factories.ts`; RPCs r├®solus centralement depuis `@wcore/core`.
- **Moonriver** activ├® : factory `0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1`, chainId 1285. M├¬me m├®canisme.
- **Moonbeam/Moonriver v├®rifi├®s en prod (2026-06-04)** : cartes `/gm` actives, `Ô£à GM Done` apr├¿s tx on-chain, `Fees Earned` et `Fees Platform` visibles. Fix compl├®mentaire : `/api/gm/status-onchain` respecte `RPC.MAX_LOG_RANGE` (Moonriver/Moonbeam 1024) pour ├®viter les faux `gmDone=false`.
- **Mode** activ├® : factory `0x7480f3d34784f45cd3c7f2f668822ee9a8029a90`, chainId 34443, RPCs `mainnet.mode.network`, `mode.drpc.org`, `1rpc.io/mode`
- **Sei** activ├® : factory `0x71e7436f0854890d7984198e22226fb67f1dce24`, chainId 1329, RPCs `evm-rpc.sei-apis.com`, `sei.drpc.org`, `sei-evm-rpc.publicnode.com`
- **90 cha├«nes EVM** ajout├®es ├á `/dev/deploy` ÔÇö toutes les cha├«nes `@wcore/core` non encore d├®ploy├®es sont maintenant disponibles dans le dropdown (L2s, OP Stack, majors EVM)

**Diff├®r├® (post-v0.2.4)** :
- Migration `ChainFactory` pattern c├┤t├® TS (0/130 chains aujourd'hui dans `packages/core/src/chains/*.ts`)
- Migration JWT `localStorage` ÔåÆ httpOnly cookie (breaking, ├á planifier)
- CI : ajouter `pnpm audit --prod --audit-level=high` + gitleaks dans `.github/workflows/ci.yml`

**Build state** : `pnpm -F @wcore/api typecheck`, `pnpm -F @wcore/web typecheck`, `pnpm -F @wcore/api test` ÔÇö tous verts.

## ├ëtat pr├®c├®dent : v0.2.3c ÔÇö GM withdraw centralis├® + Zora GM (2026-05-15)

### Ô£à v0.2.3c ÔÇö GM Withdraw Source Unique + Zora GM
- **GM contracts centralis├®s** : `/api/gm/my-contracts` renvoie d├®sormais les balances `creatorBalance` / `platformBalance` directement, avec fallback multi-RPC via `readGmContractBalances()`. Le frontend ne lance plus 20+ fetchs `/api/gm/contracts/:id/balance` qui pouvaient diverger au refresh.
- **Hook partag├® stable** : `useGmContracts` garde un cache m├®moire partag├® entre Header, `/gm`, `/profile?tab=gm-contracts` et wallet `ChainCard`. Changer de page ne repart plus syst├®matiquement d'un tableau vide si les contrats sont d├®j├á charg├®s.
- **Multi-contrats par chain** : `contractsByChain` expose maintenant `Map<chain, GmContractWithBalance[]>`. `/gm` et `ChainCard` rendent tous les boutons withdrawables d'une chain, au lieu de choisir un seul contrat et masquer certains `Fees Earned` visibles dans `/profile`.
- **Header withdrawable** : `GmWithdrawNotification` lit le m├¬me hook partag├® et conserve le dernier count non-z├®ro pendant les re-fetchs, sans masquer les vrais `20/21 withdrawable`.
- **Alignement GM cards** : `Connect to Deploy`, `Coming Soon`, `­ƒÜÇ Deploy GM Contract`, `Ôø¢ Say GM` et `Ô£à GM Done` partagent une classe commune `h-9 flex items-center justify-center` pour une taille identique.
- **Polygon zkEVM detection fix** : le fallback frontend on-chain v├®rifie `creator()` (`0x02d05d3f`) et non `owner()` (`0x8da5cb5b`). `/api/gm/status` matche aussi `creatorAddress` / adresse wallet, pas seulement `ownerId`.
- **Zora GM activ├®** : factory `0xd0f92622a510f82eef0178e596a4d6f17418c3c2`, chainId `7777777`, RPCs `rpc.zora.energy`, `zora.drpc.org`, `1rpc.io/zora`. Ajout dans `GM_FACTORIES`, `CHAIN_RPCS`, `/gm`, `ChainCard`, `/dev/deploy`, wagmi et pricing fallback natif.
- **├Ç ├®claircir dans l'UI Points/GM** : rendre le scoring GM lisible pour les utilisateurs. Off-chain GM = daily greeting gratuit 1x/jour, `+10` premier jour, `+10+N` au jour N de streak. On-chain GM = `+20` points de base, `+2N` bonus streak, `+5` bonus par cha├«ne, `+N` chain streak. ├ëviter d'afficher ces formules trop dens├®ment dans les posts X, mais les documenter clairement dans l'app.
- **X daily update v3 publi├®** : post manuel publi├® avec `apps/web/public/wcore-post-daily-update-3.png` / `.svg`. Angle valid├® : `GM streaks simplified`, nouvelles cha├«nes GM `Zora` + `Polygon zkEVM`, `Product polish`. Le visuel ne mentionne pas platform fees et ├®vite les formules GM trop denses.
- **Tour X notifications/engagement** : scan notifications + home feed + recherches cibl├®es effectu├® apr├¿s le post. Aucun engagement post├® : cibles remont├®es trop anciennes, d├®j├á trait├®es, concurrentes/promo (Tria, Artemis, tokens Pumpfun), ou hors sujet. Mieux vaut skip que forcer une interaction faible.

### Ô£à v0.2.3b ÔÇö Default Profile Tab + GM Withdraw Notification + GM Flicker Fix
- **Default tab = Points** : `/profile` ouvre maintenant sur l'onglet "Points" au lieu de "Scans" (bug `useState("overview")` non-match├®)
- **`?tab=gm-contracts` support** : le server component `page.tsx` lit `searchParams` et passe `defaultTab` en prop ÔåÆ ├®vite le `useSearchParams()` c├┤t├® client (Next.js 16 exige Suspense boundary)
- **GmWithdrawNotification** : nouveau composant header qui d├®tecte les contrats avec tips withdrawables via `useGmContracts` et affiche un bouton `­ƒÆ© N withdrawable` ÔåÆ clic = redirect vers `/profile?tab=gm-contracts`
- **TopBar global** : `GmWithdrawNotification` est dans `TopBar` (vrai header global via `SidebarLayout`), pas dans `NavHeader` legacy. Visible sur toutes les pages.
- **GM card sync** : les tuiles `/gm` ├®coutent `wcore-gm-done` avec `detail.chain` et flippent en `Ô£à GM Done` uniquement pour la cha├«ne correspondante, y compris quand le GM vient du bouton Header.
- **No new localStorage dependency** : fix bas├® sur API/hook + ├®v├®nement runtime, pas sur du storage client additionnel.
- **GM withdraw notification flicker fix** : `useGmContracts` ne vide plus `contracts` pendant le refresh. `GmWithdrawNotification` garde le dernier count non-z├®ro en `useRef` pour ├®viter que la notif disparaisse pendant les re-fetchs.
- **Polygon zkEVM GM activ├®** : factory `0x1a891c1a...` ajout├®e dans `GM_FACTORIES` (`packages/shared`), `CHAIN_RPCS` (API), `ChainCard.tsx`, `DeployClient.tsx`, `GmPageClient.tsx`.

### Ô£à v0.2.3 ÔÇö Server Split + Typecheck Fix + Web Deploy
- **API server split** : `server.ts` (1262 LOC ÔåÆ ~360 LOC) d├®coup├® en 4 plugins typ├®s (`scan.ts`, `admin.ts`, `wallet.ts`, `chains.ts`) avec interfaces de d├®pendances explicites (`ScanPluginDeps`, `AdminPluginDeps`, etc.)
- **SCAN_CONCURRENCY env** restaur├® avec safe clamping (`Math.max(1, Math.floor(Number(...) || 20))`)
- **Circuit breaker metrics** : `metrics.recordCircuitBreakerTrip()` restaur├® sur les routes sync/async scan
- **Admin scam-override auth** : `isAdminAuthorized()` v├®rifi├® avant le DB lookup (├®vite 401 quand DB down)
- **Test exports** : `app`, `prisma`, `validateChains`, `buildChainScan` r├®-export├®s depuis `server.ts` pour les tests existants
- **gamification.ts** : 6 erreurs TS fix├®es (`$transaction` tx type, `ownerId` nullable, `pick` non-null, `creatorAddress` null, `checkStreakBadges` tx param)
- **Web fixes** : `TokenIcon` + `ValueDistribution` marqu├®s `"use client"`, `SidebarLayout` `useState` mal utilis├® ÔåÆ `useEffect`, `useOnChainGm.ts` import `useEffect` manquant ajout├®
- **next.config.mjs** : `ignoreBuildErrors: true` retir├® pour d├®tecter les erreurs au build
- **Dockerfile** : `NEXT_PUBLIC_WC_PROJECT_ID` par d├®faut (Reown: `3090760ada2bf4a459a27506fcdc16ec`)
- **ESLint global** : 0 erreurs (4 warnings directives inutilis├®es), `wallet.ts` `MAX_CUSTOM_TOKENS` supprim├®, `ChainCard` import inutilis├® retir├®, `ChainIcon` vars inutilis├®es pr├®fix├®es `_`
- **Typecheck monorepo** : `pnpm -r typecheck` Ô£à sur les 5 packages

### ­ƒöä Audit Ultra v2 (2026-05-14) ÔÇö Punch list active
Audit 4-domaines (s├®cu / qualit├® / perf / chains) livr├® dans `.omc/research/audit-2026-05-14-v2-*.md`. Verdict global : **production-ready avec r├®serves**, 1 CRITICAL action, 7 HIGH, ~15 MEDIUM, ~10 LOW.

**Shipped** :
- JWT_SECRET startup guard renforc├® (`auth.ts:24-31`) ÔÇö rejette placeholders + secrets <32 char hors dev
- **#1 zod validation runtime** sur 40 sites Fastify (`auth.ts`, `gamification.ts`, `support.ts`, `server.ts`) ÔÇö `apps/api/src/schemas.ts` centralise, `fastify-type-provider-zod` pour la validation. R├®sout H1 s├®cu + H1 qualit├® + H2 s├®cu. Typecheck Ô£à, tests Ô£à.
- **#2 Round 5 perf (4/4)** :
  - H1 `metadata.ts` ÔÇö `Promise.all` sur symbol/name/decimals (ÔêÆ150 ├á ÔêÆ600ms par token cold discovery)
  - H2 `cascade.ts` ÔÇö dedup Redis GET via `previousPriceEur` captur├® une fois ; `commitSourcePrice` sync + fire-and-forget `setPrice` (├®limine Ôëñ8 GET et N AWAIT par token)
  - H3 `meta-cache.ts` ÔÇö LRU `Map`-based (move-to-end O(1)), suppression `_accessOrder` qui fuyait en m├®moire
  - M4 `defillama.ts` + `evm.ts` ÔÇö batch endpoint `batchTokenPrices(slug, contracts)` chunked 80, pr├®-warm `sharedPriceCache` avec `source: "llama-batch"` avant la cascade (1 HTTP pour N tokens vs N HTTPs). Cascade short-circuit sur cache hit.
  - Typecheck Ô£à, tests Ô£à.
- **#3 DeployClient refactor** : chainIds + names d├®riv├®s de `@wcore/core` `chainList` au lieu d'une map hardcod├®e de 27 chains. ├ëlimine la classe de bugs Ink (0xdef0 stale), Abstract (chainId), etc. `explorer` ├®tait du dead data ÔÇö supprim├®. Typecheck apps/web Ô£à.
- **S├®curit├®** : `pnpm audit --prod` Ô£à ÔÇö aucune vuln. Confirme CVE Next.js d├®j├á fix├®e (16.2.6).

**Next** :
- Replace `prisma: any` (7 plugins) ÔÇö H2 qualit├®
- Refactor `getApiUrl()` usage (25 duplications, SSR cass├® sur leaderboard/stats)
- Split `server.ts` (1232 LOC) + `gamification.ts` (1201 LOC) en plugins
- Adopter npm `siwe` package ┬À Startup warning 15 chains single-RPC
- Refactor `DeployClient.tsx` pour importer chainIds depuis `@wcore/core` (├®limine bugs r├®currents Ink/Abstract)
- Replace `prisma: any` (7 plugins) ┬À refactor `getApiUrl()` usage (25 duplications, SSR cass├® sur leaderboard/stats)

**Backlog** :
- Split server.ts (1232 LOC) + gamification.ts (1201 LOC) en plugins
- Adopter npm `siwe` package ┬À Trancher contradiction auto-gen vs hand-edit sur `packages/core/src/chains/*.ts` ┬À Startup warning 15 chains single-RPC

### Ô£à v0.2.2 ÔÇö Bio 130+ chains + Streak Warnings + ChainIcon v2
- **Site copy** : home/about/metadata/footer/WelcomeModal pass├®s de 116+ ├á 130+ chains, 8x ÔåÆ 21x GM
- **Streak warning** : badge jaune sur le profil quand le streak est en danger (aucun GM off-chain ou on-chain aujourd'hui)
- **ChainIcon cascade v2** : plus de TrustWallet auto-d├®riv├® (suppression `twSlug`), naturalWidth check CDN-only, `hasFallbackIcon()` gate
- **ERC20 cache fallback** : `readErc20Balance` pr├®serve les balances du cache quand le consensus RPC ├®choue
- **Ink/Abstract activ├®s** : factories d├®ploy├®es (57073 / 2741), 6 cha├«nes "coming soon" dans /gm et /dev/deploy
- **GM native pricing** : utilise `NATIVE_LLAMA_ID`/`NATIVE_GECKO_ID` des configs cha├«ne, pas de mapping hardcod├®
- **DB-backed GM status** : `/api/gm/status` remplace localStorage pour le statut GM par cha├«ne
- **X daily update post** : `wcore-post-daily-update-2` (130 chains + GM expansion)
- **JWT_SECRET prod guard** : refuse les secrets faibles/placeholders hors dev (32+ chars requis)
- **CM daily engagement** : 5 replies v├®rifi├®s (2026-05-14), dont 4 replies externes et 1 thread reply sous le post WCORE. Engagement automatis├® 2026-05-15 : 2 replies + 5 likes + 1 follow. Le├ºon : Playwright like nos propres r├®ponses ÔÇö r├¿gle stricte ajout├®e dans AGENTS.md.
- **GM harmonization** : hook `useGmChain` centralise toute la logique GM (DB status, deploy, send), partag├® entre ChainCard et GmChainCard. `/gm` ne flash plus gr├óce ├á `statusLoaded`.
- **Native symbols fix** : `GmContractsPanel` corrig├® pour afficher les vrais symboles natifs (CELO, FRAX, BERA, etc.) au lieu de "ETH" par d├®faut
- **GM withdraw UI unifi├®** : hook `useGmContracts` + composant `GmWithdrawButton` partag├®s entre `/profile`, `/gm` et wallet chain cards. Le bouton withdraw n'appara├«t que quand `creatorBalance > threshold`. Z├®ro pollution UI pour les contrats sans solde.
- **Profile overhaul** : stats inutiles retir├®es (scans, valeur totale, meilleur scan, cha├«nes vues, badges). Gard├® uniquement score, GM streak, best streak. Per-chain bonuses capitalis├®s. Section badges retir├®e. Onglet GM Contracts refait en grille responsive avec r├®sum├® withdrawable.
- **GM withdraw on /gm** : chaque card d├®ploy├®e affiche un bouton withdraw compact conditionnel. Aucune info affich├®e si solde nul.
- **GM withdraw on wallet ChainCard** : withdraw visible seulement si wallet connect├® = wallet scann├®, cha├«ne GM support├®e, contrat utilisateur existe et solde > 0. Boutons GM/Deploy/Withdraw agrandis.
- **Points tab overhaul** : Overview renomm├® Points, gros bloc score centr├®, per-chain bonuses avec ic├┤nes de cha├«ne en grille compacte, points calcul├®s par cha├«ne (formule `(N^2 + 11N - 2)/2`).
- **GM withdraw emoji** : bouton `­ƒÆ© Withdraw X ETH` avec couleurs distinctes (accent pour earned, jaune pour platform).
- **GM Contracts cards** : grille 5 colonnes, labels "Earned" et "Platform" avec montant, adresse contrat visible.
- **/gm cards** : grille 6 colonnes, plus compactes, platform withdraw ajout├®.
- **Platform withdraw** : disponible dans /profile, /gm et wallet ChainCard pour le platform owner.
- **GM fees label** : boutons renomm├®s `­ƒÆ© Fees Earned` et `­ƒÆ© Fees Platform`, couleurs pastel (emerald/amber).
- **GM grid 8 colonnes** : /gm et GM Contracts pass├®s ├á `xl:grid-cols-8`.
- **RealT pricing retry** : source RealT renforc├®e avec 3 tentatives + d├®lai 1s. Fix prix faux sur Gnosis (CoinGecko/DexScreener tombaient sur ~Ôé¼10 au lieu de ~Ôé¼50).
- **Circuit breaker graceful** : quand une cha├«ne a le circuit ouvert, le scan continue sur les autres au lieu d'├®chouer en bloc (`circuit_open`).
- **Refresh Ôå╗ rotation** : corrig├® centre de rotation via span inline-block d├®di├®.
- **DeployClient Turbopack fix** : `chainList` retir├® de `@wcore/core` (Turbopack ne r├®sout pas les imports runtime workspace). Remplac├® par constante `CHAIN_META` inline avec 27 cha├«nes.
- **Web Dockerfile** : revert├® la patch core package.json (inutile apr├¿s fix DeployClient).
- **X GM morning post** : post original publi├® (`https://x.com/WCORExyz/status/2055180114221007102`) avec asset `apps/web/public/wcore-post-gm-morning.png`. DA valid├®e : `GM` en soleil, logos des cha├«nes GM en plan├¿tes orbitantes, source SVG conserv├®e.

### ­ƒöä Engagement X ÔÇö Automatis├® avec prudence (2026-05-15)
- **R├®ponses post├®es** : 2 replies ├á @Creatooors (persistent state + GM) et @Piloth116787 (Good tek)
- **Likes** : @Creatooors (2 tweets), @Piloth116787 (2 tweets), @0xAthos (1 tweet)
- **Follow** : @Piloth116787 d├®j├á suivi
- **Le├ºon critique** : Playwright like syst├®matiquement nos PROPRES r├®ponses au lieu des tweets des autres. R├¿gle ajout├®e dans AGENTS.md : v├®rifier l'auteur AVANT tout like, skipper si URL contient `WCORExyz`. Pr├®f├®rer l'engagement manuel pour ├®viter les erreurs.
- **Correction m├®thode engagement** : script safe valid├® avec ciblage par `status_id` + v├®rification `unlike` apr├¿s clic. 3 engagements externes r├®ussis : @vodkamq, @ThisEmmy_1, @SantoXBT. Chaque tweet a re├ºu un like v├®rifi├® + une r├®ponse personnalis├®e sans em dash.
- **DM Athos** : call refus├® poliment, r├®ponse async envoy├®e : pas disponible pour calls, ouvert ├á discuter par DM.

### ­ƒö£ Prochaine ├®tape ÔÇö DeFi Position Tracking
- R├®cup├®rer les positions DeFi (LP staking, lending, farming) sur les 130+ cha├«nes support├®es
- Int├®gration avec les protocoles majeurs par cha├«ne (Uniswap, Aave, Curve, etc.)

### ­ƒö£ Scan Performance ÔÇö Am├®lioration de la rapidit├®
- Optimiser le pipeline de scan pour r├®duire le temps par wallet
- Cache plus agressif, parall├®lisation accrue, r├®duction des appels RPC redondants
- Objectif : diviser par 2 le temps de scan moyen sur un wallet multi-cha├«ne

### ­ƒôú Growth / Community Management ÔÇö X acquisition active (2026-05-15)
- **Constat** : @WCORExyz a encore peu d'abonn├®s, donc les posts propres servent surtout de preuve de vie et de cr├®dibilit├® quand un utilisateur visite le profil.
- **Canal prioritaire court terme** : replies externes sous conversations existantes avec audience, pas posts isol├®s.
- **Cadence cible** : 80% replies externes / 20% posts propres, 3 replies externes max par session, 1-2 mentions `@WCORExyz` max par session.
- **Qualit├®** : r├®pondre aux vrais pain points wallet / portfolio / multichain / DeFi tracking. ├ëviter competitors promos, giveaways, recovery/scam accounts, KOL shills et collabs douteuses.
- **Session r├®cente** : r├®ponses visibles ├á @Daninoks, @NgocThu01159840, @tofudestiny, @Almstin4Crypto + une question sous le post WCORE pour demander les cha├«nes prioritaires. Le 2026-05-15, post original GM morning publi├® avec illustration WCORE DA (`wcore-post-gm-morning`).
- **Source de v├®rit├® CM** : `docs/superpowers/specs/CM-STRATEGY.md` contient les scripts, cibles, logs et r├¿gles anti-spam.

### Ô£à v0.2.1 ÔÇö Security & Reliability Hardening (audit triple)
Audit parall├¿le security-reviewer + code-reviewer + performance-engineer, 7 findings r├®solus :
- **Next.js ^16.2.4 ÔåÆ ^16.2.6** : CVE-2026-23870 (RSC DoS), CVE-2026-44581 (XSS via CSP nonce), GHSA-vfv6 (cache poisoning)
- **Test JWT secret rotation** : `apps/api/src/test-secret.ts` g├®n├¿re un secret al├®atoire par process et set `process.env.JWT_SECRET` avant import auth.ts. Plus aucune occurrence du literal `wcore-dev-secret-change-in-prod` dans les 5 fichiers de test
- **GM_FACTORIES source unique** : `apps/web/hooks/useOnChainGm.ts` importe d├®sormais depuis `@wcore/shared` (suppression de la duplication 12-entr├®es qui avait failli rater l'alignement Scroll/Linea/Mantle)
- **Onchain GM RPC backoff** : `gamification.ts` retry loop passe de 2s constant ÔåÆ exponentiel 1s/2s/4s pour ├®viter rate-limit bans sur Scroll/Linea/Mantle (RPCs publics plus fragiles)
- **SIWE chainId strict** : `/api/auth/nonce` reject `invalid_chain_id` quand chainId n'est pas un entier positif (avant : silent default ├á mainnet via `|| 1`)
- **chainId assertion post-switch** : `useOnChainGm.ts` lit `useChainId()` et asserte apr├¿s `switchChainAsync` (certains wallets no-op silencieusement ÔåÆ tx sur la mauvaise cha├«ne)
- **onchainV3 RPC failover** : `packages/core/src/engines/evm.ts` batch it├¿re sur tous les endpoints (avant : `endpoints[0]` hardcod├® ÔåÆ flake primaire = silent null arrays pour tous les microcaps)

Commits : `0830215` (HIGH) + `4a3ac98` (MED).
Restants ├á traiter (non bloquants) : zod validation runtime sur endpoints API (M1), GT throttle 40/60s partag├® (perf, plan-d├®pendant), empty-TTL backoff exponentiel sur wallets sparse (perf, sch├®ma cache).

### Ô£à v0.2.0-phase2 ÔÇö Production Deployment + Multi-Chain GM
- Railway production (wcore.xyz) avec API + Web + Postgres
- GM on-chain sur 4 cha├«nes (Base, Arbitrum, Optimism, Polygon)
- Pricing natif par cha├«ne (POL, BNB, AVAX)
- RPC multi-fallback pour GM (CHAIN_RPCS avec tableau)
- Contrat discovery via factory.contracts() fallback
- Scam override par contrat (pas juste symbole)
- native POL precompile filtr├® (plus de doublon)
- Banni├¿re + avatar X/Farcaster
- Homepage mise ├á jour avec features actuelles

### Ô£à v0.1.19 ÔÇö Security Audit + Fixes
- 27/27 findings corrig├®s
- SIWE domain binding (CORS_ORIGIN, pas req.headers.host)
- JWT_SECRET persistence (.env.staging)
- CORS multi-origine (localhost + 127.0.0.1)
- View-only linked wallets, CreatorWithdrew event fix
- Scam-detector v6 (ETHG/BTCB false positives)
- Audit icons 404 (24/113 URLs corrig├®s)

### Ô£à v0.1.18 ÔÇö Share Reports + CSV/PDF Export
### Ô£à v0.1.17 ÔÇö Monetization (Stripe + Plans)
### Ô£à v0.1.14 ÔÇö GM System & Creator Dashboard
### Ô£à Phase 8 ÔÇö Engagement (GM / qu├¬tes / streak / badges)
### Ô£à Phase 7 ÔÇö Core Scan Engine (EVM/SVM/Cosmos)
### Ô£à Phase 6 ÔÇö Pricing Cascade (DefiLlama, DexScreener, GeckoTerminal, Jupiter, CoinGecko)
- [x] Bouton GM dans l'UI + streak counter
- [x] Page profil avec badges, streak, historique scans, wallets li├®s
- [x] Leaderboard page
- [x] `longestStreak` persist├® en DB (fix gamification.ts)
- [x] Multi-wallet aggregation avec labels persist├®s (localStorage)
- [x] Refresh per-wallet, per-chain, refresh-all
- [x] ValueDistribution : EVM/SVM/COSMOS breakdown, expandable
- [x] Contracts copiables + explorer links
- [x] Scan progressif + cache session + parall├®lisation 3├ù
- [x] Barre de chargement anim├®e (point vert) + timer + wallet en cours
- [x] i18n EN/FR sur tous les composants
- [x] Devises EUR/USD/GBP/CHF/JPY appliqu├®es partout
- [x] **Crit├¿re** : UI compl├¿te, GM/streak/badges fonctionnels, multi-wallet

### v0.1.1 Post-Audit (ajouts hors roadmap)

- [x] chainKey canonique (DEX_SLUG ÔåÆ chain.key) dans 3 engines
- [x] chainlist.org : loader non-bloquant, retry 5min, 13 tests
- [x] CORS : `CORS_ORIGIN` env var, refus par d├®faut en prod
- [x] JWT : throw si absent en prod
- [x] Rate limit : 10ÔåÆ60
- [x] Backup DB : script PowerShell + hook pre-migration
- [x] DB errors : log structur├®
- [x] Timer cleanup + cache custom tokens fix

### Pour faire tourner localement

```powershell
# 1. Installer
pnpm install

# 2. Lancer en dev
pnpm dev:api        # http://127.0.0.1:4000/health
pnpm dev:web        # http://localhost:3000

# 3. Optionnel (Phase 7+)
docker compose -f docker-compose.dev.yml up -d
```

### D├®cisions prises (autonomes, modifiables)

| Question | D├®cision | Raison |
|---|---|---|
| D├®tection des tokens | `eth_getLogs Transfer` via RPC public (gratuit, 117 chains support├®es). Adapter `TokenDiscovery` pour swap vers Alchemy/Routescan plus tard si besoin de fiabilit├®. | Pas de d├®pendance payante au MVP, miroir de ce que fait WCORE aujourd'hui. |
| Auth MVP | Acc├¿s anonyme, rate-limit par IP c├┤t├® API. SIWE arrive en Phase 7 avec la persistance utilisateur. | L'analyse wallet ne n├®cessite pas d'auth. Permet test rapide sans friction. |
| `.manifest/` | Conserv├® tel quel, ignor├® par la migration. ├Ç nettoyer plus tard. | Orphelin du commit `chore: remove Manifest Router` ÔÇö pas li├® ├á WCORE web. |

---

## ­ƒö£ Phase 10 ÔÇö Produit Utilisateur Ô£à

### 10.1 Export CSV Ô£à
- [x] Bouton "Export CSV" sur la page de r├®sultats de scan
- [x] Format : Address, Chain, Symbol, Name, Contract, Balance, Price, Value
- [x] G├®n├®ration c├┤t├® frontend (pas de round-trip API)
- [x] **Crit├¿re** : 1 clic ÔåÆ fichier `.csv` t├®l├®charg├®

### 10.2 Dashboard Stats UI Ô£à
- [x] Page `/stats` affichant les m├®triques `/api/stats`
- [x] Charts simples : scans/24h, top 5 chains, erreurs RPC/pricing
- [x] Cache hit rate, rate limit hits
- [x] **Crit├¿re** : dashboard lisible, < 3s load

### 10.3 Notifications Ô£à
- [x] Streak en danger ÔåÆ badge warning sur le profil
- [x] Notifications DB (scan_done, scan_degraded) + SSE stream
- [x] **Crit├¿re** : feedback imm├®diat apr├¿s scan long

### 10.4 Custom Token Lists Ô£à
- [x] Sauvegarde des custom tokens par utilisateur (DB)
- [x] Autocomplete sur la home page
- [x] **Crit├¿re** : les tokens custom persistent entre sessions

### 10.5 Historique Scans D├®taill├® Ô£à
- [x] Page `/scans/:id` affichant les r├®sultats stock├®s d'un scan
- [x] Click ÔåÆ affiche les r├®sultats du scan (chains, tokens, prices)
- [x] Export CSV depuis la page de d├®tail
- [x] **Crit├¿re** : historique pagin├®, d├®tail accessible en 1 clic

### 10.6 ├ëvolutions UI Produit ÔÇö Backlog inspir├® dashboards crypto
- [x] Navigation interne des r├®sultats de scan : onglets `Overview`, `Wallets`, `Tokens` avec barre d'onglets dans WalletContent. (v0.2.13)
- [x] Vue globale `All Tokens` : table plate tous tokens confondus (Asset/Balance/Price/Value/Chain/Wallet), tri├®e par valeur. (v0.2.13)
- [x] Vue globale `Wallets` : grille de cartes par wallet (total EUR, # chains, # tokens, top 3 tokens). (v0.2.13)
- [x] Topbar contextuelle page wallet : `Updated X ago`, bouton `´╝ï Add`, refresh all, export. (v0.2.13)
- [x] Moderniser `Sidebar` : remplacer les emojis par ic├┤nes SVG/lucide, garder le layout r├®ductible existant. (v0.2.13 ÔÇö d├®j├á en place : 7 ic├┤nes SVG inline dans `Sidebar.tsx`)
- [x] Moderniser `SettingsBar` : segmented control visible pour USD/EUR, menu secondaire pour GBP/CHF/JPY et langue. (v0.2.13)
- [x] Am├®liorer les tables tokens : tri explicite (colonnes cliquables Ôû▓/Ôû╝), table plate globale dans l'onglet Tokens. (v0.2.13)
- [ ] **Vue secondaire `Unified Tokens` / `By Asset`** : inspir├®e du point Uniswap ÔÇ£duplicate tokens are confusingÔÇØ. Agr├®ger les m├¬mes actifs ├á travers les cha├«nes et wallets (ex: USDC Base + USDC Arbitrum + USDC Optimism ÔåÆ une ligne USDC), avec total balance/value global, d├®tail expandable par cha├«ne/wallet, et garde-fous pour ne pas fusionner de faux homonymes/scams. Objectif : offrir une lecture ÔÇ£ce que je poss├¿deÔÇØ avant ÔÇ£o├╣ je le poss├¿deÔÇØ.
- [ ] **Vue `By Asset Class` / Répartition patrimoniale** : nouvel onglet sur la page `/wallet/` (même barre d'onglets que `Overview`/`Wallets`/`Tokens`) présentant la répartition du patrimoine par **classe d'actif — Crypto / Stocks / Commodities / Fiat**. Agrège les holdings on-chain (toujours crypto) et CEX ; le champ `bucket` de `CexHolding` porte déjà la classe (crypto/fiat/commodities/stocks côté Bitpanda), donc l'API scan/portfolio doit surtout exposer cette classe et un composant `AssetClassBreakdown` la rendre (donut + barres, total EUR + % du portfolio par classe, détail expandable par source chaîne/exchange). Objectif : répondre "quelle part de mon patrimoine est en crypto vs actifs traditionnels", pas seulement "quels tokens / où". Base marketing/DA : post `wcore-post-beyond-crypto` (2026-07-06, angle "Not just crypto. Everything you own.").
- [ ] Adapter le site pour une utilisation Mobile.
- [ ] ├ëtudier une vraie vue `Activity` multi-VM plus tard. Ne pas promettre transaction history tant que EVM/SVM/Cosmos ne sont pas cadr├®s.
- [x] IndexerDiscovery (Blockscout) pour 9 cha├«nes ÔÇö `explorer-discovery.ts` c├óbl├® dans l'EVM engine via `discovery.ts`. (v0.2.10)
 - [ ] **Crit├¿re** : l'utilisateur comprend le produit en 30 secondes depuis les r├®sultats de scan, sans perdre la densit├® data WCORE.

### 10.7 Swap/Bridge Aggregator
- [ ] Int├®gration d'un agr├®gateur de swap multi-cha├«nes (Jupiter pour SVM, 1inch/0x/Matcha pour EVM)
- [ ] Bridge cross-chain (Stargate, Across, Orbiter, LayerZero)
- [ ] UI int├®gr├®e dans les r├®sultats de scan : bouton "Swap" ou "Bridge" ├á c├┤t├® de chaque token
- [ ] Routing intelligent : meilleur prix + meilleur bridge route
- [ ] Support multi-VM : EVM ÔåÆ SVM, EVM ÔåÆ Cosmos via IBC bridges
- [ ] Estimation des fees et temps de transaction avant ex├®cution
- [ ] Historique des swaps/bridges dans l'onglet Activity
- [ ] **Crit├¿re** : l'utilisateur peut swap/bridge un token directement depuis WCORE sans quitter l'app
### v0.1.2 ÔÇö Wallet Linking +
- [x] Wallet connect├® auto-ajout├® ├á la liste sur la home page
- [x] Fix Solana wallet linking (connect + publicKey fallback)
- [x] Badge de v├®rification par wallet (Ô£ô Sign├® / ÔÜá Local)
- [x] Messages d'erreur d├®taill├®s (plus de "Failed to link wallet" g├®n├®rique)

---

Priorit├® : d├®ploiement fiable, observabilit├®, tests frontend. Pas de grosse feature.

### 9.1 D├®ploiement staging reproductible Ô£à
- [x] `docker-compose.staging.yml` (Postgres 5434 + Redis 6381, healthchecks)
- [x] `scripts/deploy-staging.ps1` : build, migrate, seed, instructions
- [x] `.env.staging` template avec valeurs s├╗res
- [x] `apps/api/Dockerfile` + `apps/web/Dockerfile` (multi-stage, pr├¬ts)
- [x] `.dockerignore` + `apps/web/public/` cr├®├®
- [x] **Crit├¿re** : 1 commande, < 60s

### 9.2 Smoke tests automatis├®s post-d├®ploiement Ô£à
- [x] `scripts/smoke-test.ps1` : 16 tests (health, CORS, chains, scan, web)
- [x] V├®rifie CORS headers, circuit breaker, chain count
- [x] Int├®gr├® dans `deploy-staging.ps1 -AutoStart` avec rollback auto
- [x] Backup DB automatique avant migration, rollback si smoke ├®choue
- [x] `-Rollback` flag pour restaurer un backup pr├®c├®dent
- [x] **Crit├¿re** : smoke test ├®choue ÔåÆ rollback automatique (DB restaur├®e, services stopp├®s)

### 9.3 Observabilit├® serveur Ô£à
- [x] `packages/core/src/metrics.ts` ÔÇö `MetricsStore` thread-safe (compteurs scans, cache, erreurs, rate limits, circuit breaker)
- [x] `/api/stats` ÔÇö snapshot complet : uptime, scans par cha├«ne, cache hit/miss, erreurs RPC/pricing agr├®g├®es, rate limits, circuit breaker
- [x] Scan instrument├® par cha├«ne : `totalMs`, `tokensFound`, `pricedTokens`, erreurs RPC/pricing/other
- [x] Rate limiter + circuit breaker instrument├®s
- [x] Smoke test `/api/stats` (18 tests total)
- [x] **Crit├¿re** : dashboard `/api/stats` lisible, logs exploitables

### 9.4 Tests frontend r├®els Ô£à
- [x] `apps/web/__tests__/e2e.spec.ts` ÔÇö 10 tests Playwright
  1. Home page loads (title, form, chain selector)
  2. Chain selector ouvre et recherche (Zero, Solana)
  3. Scan wallet EVM (r├®sultats Ôé¼, Base, ETH)
  4. Wallet 0x0 visible (degraded chain)
  5. Diagnostics expand/collapse
  6. Leaderboard charge
  7. Profile non-connect├® ÔåÆ connect prompt
  8. Switch langue FR/EN
  9. Switch devise EURÔåÆUSD
  10. Deep scan toggle visible
- [x] `apps/web/playwright.config.ts` ÔÇö Chromium, retry 1├ù, screenshots on failure
- [x] `pnpm test:e2e` ÔÇö lance tous les tests E2E
- [x] **Crit├¿re** : 10 tests Playwright, couvrent parcours principaux

### 9.5 Features produit Ô£à (livr├® en Phase 10)
- [x] Export CSV des r├®sultats de scan (v0.1.18)
- [x] Notifications (scan termin├®, streak en danger) (v0.2.4+)
- [x] Custom token lists persist├®es par utilisateur (v0.2.4+)

---

## Plan complet (8 phases)

Chaque phase = un PR atomique, tests verts, app encore d├®ployable. `src/*.gs` reste vivant tant que la Phase 5 n'est pas en prod.

### Ô£à Phase 1 ÔÇö Squelette monorepo (DONE)

- [x] `pnpm-workspace.yaml` + `tsconfig.base.json`
- [x] `apps/api` Fastify avec `/health`
- [x] `apps/web` Next.js 15 minimal avec input wallet
- [x] `packages/shared` (zod) et `packages/core` (placeholder)
- [x] `docker-compose.dev.yml` (Postgres + Redis)
- [x] `.gitignore` mis ├á jour (`.next`, `dist`, `.env*` + whitelist `.env.example`)
- [x] **Crit├¿re** : `node scripts/validate-static.js` ne r├®gresse pas (les 2 erreurs vues sont pr├®-existantes sur `src/04B_CACHE_WALLET.gs` et autres modifi├®s avant cette session)

### Ô£à Phase 2 ÔÇö Port chains + RPC core (DONE)

Objectif : extraire la liste des cha├«nes en data TS pure, et porter le client RPC avec sa r├¿gle de consensus stricte.

- [x] `tools/migrate/extract-chains.mjs` parse les `src/*.gs` (pattern `ChainFactory.createEvmChain|SvmChain|CosmosChain`) avec scanner d'accolades ├®quilibr├®es + collecte des `var X = ...;` pr├®ludes (cas `FOGO_KNOWN_TOKENS`). G├®n├¿re 116 fichiers `packages/core/src/chains/<key>.ts`
- [x] `packages/core/src/chains/index.ts` exporte `chains` (record) + `chainList` + `getChain(key)` + type `ChainKey`
- [x] `packages/core/src/types.ts` ÔÇö interface `ChainConfig` (loose pour couvrir EVM/SVM/Cosmos)
- [x] `packages/core/src/rpc/client.ts` ÔÇö `RpcClient` JSON-RPC 2.0 + `EvmRpc` helpers (`chainId`, `blockNumber`, `getBalance`, `getTransactionCount`, `ethCall`, batch). Timeout via `AbortController` (Node fetch honore, contrairement ├á GAS UrlFetchApp)
- [x] `packages/core/src/rpc/health.ts` ÔÇö escalating block: 2 fails ÔåÆ 30min, 4 ÔåÆ 2h, 6+ ÔåÆ 6h (mirror v4.12.22)
- [x] `packages/core/src/rpc/consensus.ts` ÔÇö r├¿gle stricte `votes * 2 > total` (mirror v4.15.1)
- [x] `packages/core/src/rpc/dispatcher.ts` ÔÇö `RpcDispatcher` orchestrateur (pickEndpoints + run + consensus). Mirror `pickForConsensus` + `batchWithConsensus`
- [x] **Tests unitaires : 14/14 passent** : 2/4 Ôëá consensus Ô£à, 3/4 = consensus Ô£à, escalation 2/4/6 fails ÔåÆ 30min/2h/6h Ô£à
- [x] API `GET /api/chains` retourne 116 cha├«nes (110 EVM, 4 Cosmos, 2 SVM), `GET /api/chains/:key` retourne la config compl├¿te
- [x] `pnpm -r typecheck` vert sur shared / core / api / web
- [x] **Crit├¿re atteint** : 116 chains expos├®es (vs 117 estim├®s au cadrage ÔÇö diff├®rence = `DIAG_BASE_RPC_AUDIT.gs` n'est pas un chain, c'est un diagnostic)

### Phase 3 ÔÇö Cascade pricing

Objectif : porter `07_PRICES.gs` (1 800 lignes) en TS modulaire.

- [x] Analyse initiale de `src/07_PRICES.gs` : sources, ordre de fallback, caches, stablecoins, marqueurs `NEED_DEEP` / `NEED_TRY3` / `NEED_ONCHAIN`, cooldown `attemptTsMap`
- [x] `packages/core/src/pricing/types.ts` ÔÇö types purs `PricingToken`, `PricingResult`, `PricingSourceSet`, cache injectable, `MemoryPricingCache`
- [x] `packages/core/src/pricing/stablecoins.ts` ÔÇö fast-path USD/EUR + sanity guard inspir├® de `_sanitizeStableEur_`
- [x] `packages/core/src/pricing/markers.ts` ÔÇö gestion `NEED_DEEP`, `NEED_TRY3`, `NEED_ONCHAIN`, cl├®s GT/onchain et TTL 6h
- [x] `packages/core/src/pricing/sources/defillama.ts` ÔÇö DefiLlama Coins API par id et par `{chain}:{contract}` avec filtre confidence >= 0.6
- [x] `packages/core/src/pricing/sources/dexscreener.ts` ÔÇö endpoint `/tokens/v1/{chain}/{tokens}`, filtre liquidit├® >= $50, meilleur pool par liquidit├®
- [x] `packages/core/src/pricing/sources/geckoterminal.ts` ÔÇö Try1 `/simple/networks/.../token_price`, Try2 `/tokens/{addr}`, Try3 `/pools?page=1` avec meilleur `reserve_in_usd`
- [x] `packages/core/src/pricing/sources/coingecko.ts` ÔÇö fallback simple price par id v├®rifi├® fourni par config
- [x] `packages/core/src/pricing/sources/jupiter.ts` ÔÇö SVM uniquement via Jupiter Price API V2
- [x] `packages/core/src/pricing/sources/onchain-v3.ts` ÔÇö calcul onchain-v3 par RPC batch injectable (getPool ÔåÆ slot0/liquidity/token0/decimals), choix du pool le plus liquide, marqueur `NEED_ONCHAIN`
- [x] `packages/core/src/pricing/cascade.ts` ÔÇö orchestrateur progressif Stablecoins ÔåÆ Cache ÔåÆ Llama map/native ÔåÆ Dex ÔåÆ Llama Coins ÔåÆ GT ÔåÆ Jupiter (SVM) ÔåÆ CG opt-in ÔåÆ onchain
- [x] `packages/core/src/pricing/cascade.test.ts` ÔÇö unit tests mock├®s : stablecoin, Llama, Dex, GT, no price, `NEED_TRY3`, ordre de cascade
- [x] Export public depuis `packages/core/src/index.ts`
- [x] `packages/core/src/pricing/sources/source-adapters.test.ts` ÔÇö tests mock fetch pour DefiLlama confidence, DexScreener liquidit├®/quote inference, GT Try3 pools, Jupiter SVM-only, CoinGecko id v├®rifi├®
- [x] Brancher un cache Redis L1 ÔÇö l'interface `CacheStore` + `MemoryCacheStore` sont pr├¬ts, swap Redis via docker-compose en phase suivante (`MemoryPricingCache` est volontairement in-memory pour tests et MVP core)
- [x] `packages/core/src/pricing/sources/onchain-v3.test.ts` ÔÇö test unitaire mock RPC pour prix USDC pool + unsupported chain
- [ ] **Couche `TrustedOraclePriceSource`** : ajouter une couche oracle non-bloquante dans la cascade, d├®di├®e aux actifs majeurs et aux sanity checks plut├┤t qu'au long-tail. Ordre recommand├® : stablecoin peg connu ÔåÆ cache r├®cent ÔåÆ oracle trusted si disponible ÔåÆ DefiLlama ÔåÆ DexScreener ÔåÆ GeckoTerminal ÔåÆ Jupiter/SVM ÔåÆ CoinGecko opt-in ÔåÆ onchain-v3.
- [ ] **Pyth Network** : priorit├® #1 pour oracle multi-VM. Utiliser Hermes/off-chain en premier pour ├®viter des appels RPC on-chain suppl├®mentaires. Couvre EVM/SVM et certaines zones Cosmos, utile pour natifs, stables, majors et assets march├®/perps. Tests : staleness, confidence, mapping priceId ÔåÆ canonical asset.
- [ ] **Chainlink Data Feeds** : priorit├® #2 pour EVM majors/stables. Utiliser comme source trusted et garde-fou anti-prix absurdes (ex: Dex/GT ├á 10├ù du feed). Lire via Multicall3 quand possible. G├®rer `decimals`, `updatedAt`, feeds stale/d├®sactiv├®s, et conversion USDÔåÆEUR.
- [ ] **RedStone** : priorit├® #3 pour EVM DeFi, LST/LRT et assets mieux couverts que Chainlink. ├Ç int├®grer comme compl├®ment/sanity check, pas comme source unique. Tester d'abord en mode API/off-chain avant lecture on-chain.
- [ ] **Jupiter Price API renforc├®** : SVM retail tokens. Garder comme source VM-native pratique pour SPL tokens, avec cache Redis partag├® et limites de concurrence.
- [ ] **Osmosis / sources Cosmos DEX** : pricing Cosmos-native pour ATOM, OSMO, TIA, INJ, stATOM, stTIA, etc. ├Ç traiter comme DEX pricing Cosmos, pas oracle universel. Ajouter garde-fous liquidit├®/staleness.
- [ ] **Band / Switchboard / API3** : int├®grer seulement si un trou de pricing pr├®cis le justifie. Band pour Cosmos/EVM historique, Switchboard surtout SVM, API3 surtout EVM. Ne pas alourdir la cascade sans coverage mesur├®e.
- [ ] **Identit├® d'actif pour `Unified Tokens`** : enrichir `canonicalAssetId` avec `coingeckoId`, `llamaId`, `pythPriceId`, `chainlinkFeedId`, registry v├®rifi├® et contrat canonique. Ne jamais fusionner deux tokens uniquement par symbole ; un faux `USDC` doit rester s├®par├®/scam.
- [ ] Brancher `OnchainV3PriceSource` sur le `RpcDispatcher` consensus r├®el quand l'engine EVM Phase 4 fournit les endpoints
- [ ] Tests golden : un token r├®el par stage (DAI sur Llama, MINT sur GT Try3, microcap Base sur onchain)
- [ ] **Crit├¿re** : prix EUR coh├®rent vs WCORE actuel sur 10 wallets de test

### Phase 4 ÔÇö Engine EVM (read-only)

Objectif : remplacer le c├┤t├® HTTP de `EvmEngine.getWalletAssets`.

- [x] `packages/core/src/engines/evm.ts` ÔÇö engine EVM minimal visible produit : balance native via consensus RPC, allowlist temporaire USDC/USDT/WETH sur Base + Ethereum, pricing cascade, total EUR
- [x] API `POST /api/scan` body `{address}` ÔåÆ scan Base + Ethereum, agr├®gation `chains[]` + `totalValueEur`, erreurs par cha├«ne
- [x] `apps/web/app/wallet/[address]/page.tsx` ÔÇö rendu SSR simple : total portfolio, cha├«nes, native + tokens, erreurs lisibles
- [x] Validation manuelle locale : `/health` OK, `POST /api/scan` OK sur `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, page wallet HTTP 200 avec Portfolio/Base/Ethereum/USDC
- [x] `packages/core/src/tokens/` ÔÇö couche TokenDiscovery minimale (`types.ts`, `registry.ts`, `discovery.ts`, `abi.ts`, `index.ts`)
- [x] `packages/core/src/tokens/registry.ts` ÔÇö registry temporaire USDC/USDT/WETH sur Base + Ethereum
- [x] `packages/core/src/tokens/abi.ts` ÔÇö helpers `encodeBalanceOf`, `decodeUint256`, `formatUnits`
- [x] `packages/core/src/engines/evm.ts` ÔÇö suppression de l'allowlist locale, utilisation de `TokenDiscovery`
- [x] API `POST /api/scan` retourne maintenant le format `ScanResult` partag├® (`requestedChains`, `chains[].totals`, `totals`, `generatedAt`)
- [x] Tests unitaires tokens + engine discovery : ABI helpers, registry Base/Ethereum, discovery, engine avec discovery inject├®e
- [x] `packages/core/src/tokens/log-discovery.ts` ÔÇö d├®couverte ERC-20 minimale via `eth_getLogs` Transfer, requ├¬tes from/to, d├®duplication contrats, erreurs non bloquantes
- [x] `packages/core/src/tokens/metadata.ts` ÔÇö metadata ERC-20 via consensus `eth_call` (`symbol`, `name`, `decimals`), `decimals` obligatoire, fallback symbol/name propre
- [x] `packages/core/src/tokens/discovery.ts` ÔÇö combine registry + logs + metadata, d├®duplique par contrat, conserve le registry si les logs ├®chouent
- [x] `packages/core/src/tokens/abi.ts` ÔÇö selectors ERC-20 metadata + d├®codage string dynamique/bytes32 + decimals
- [x] `packages/core/src/engines/evm.ts` ÔÇö discovery r├®elle branch├®e par d├®faut avec fen├¬tre limit├®e aux 5 000 derniers blocs ; erreurs discovery ajout├®es ├á `chain.errors[]`
- [x] `packages/core/src/cache/` ÔÇö `CacheStore` interface + `MemoryCacheStore` (in-memory Map, TTL, pr├®vue swappable Redis)
- [x] Cache int├®gr├® dans `discoverTokensForWallet` (cl├® wallet+chain+fromBlock+toBlock, TTL 15 min) et `getErc20Metadata` (cl├® chain+contract, TTL 24h)
- [x] `POST /api/scan` accepte `{address, chains?:string[], deepScan?:boolean}`, validation des cha├«nes (EVM only), deepScan (5 000 vs 50 000 blocs)
- [x] UI info text "Standard scan (last 5,000 blocks) ÔÇö Deep scan not enabled in UI"
- [x] Tests : 61/61 core + 14/14 API, typecheck vert
- [ ] `packages/core/src/cache/redis.ts` ÔÇö fa├ºade Redis L1 (priceMap, NEED_TRY3, etc.)
- [ ] `packages/core/src/tokens/discovery.ts` ÔÇö ajouter une impl `IndexerDiscovery` future en Phase 8
- [ ] `packages/core/src/tokens/metadata.ts` ÔÇö optimiser metadata en batch multi-token quand le volume augmente
- [ ] `packages/core/src/engines/base-engine.ts` ÔÇö circuit breaker, mode d├®grad├® (`[DEGRADED]`)
- [ ] **Crit├¿re** : scan d'un wallet test sur Base + Ethereum retourne valeur coh├®rente

### Ô£à Phase 5 ÔÇö UI MVP dashboard

Objectif : interface utilisateur lisible et moderne.

- [x] `apps/web/components/WalletHeader.tsx` ÔÇö total EUR, nombre de cha├«nes, nombre de tokens, timestamp
- [x] `apps/web/components/ChainCard.tsx` ÔÇö une carte par cha├«ne, native + tokens, badge `[DEGRADED]` si applicable
- [x] `apps/web/components/TokenTable.tsx` ÔÇö colonnes Asset / Balance / Price / Value, tri par valeur DESC, badge `NO_PRICE` si `priceEur=null`
- [x] `apps/web/components/ErrorPanel.tsx` ÔÇö affiche erreurs RPC consensus / quota
- [x] `apps/web/components/ScanSkeleton.tsx` ÔÇö skeleton loading anim├® pour la page wallet
- [x] `apps/web/app/wallet/[address]/page.tsx` ÔÇö refactor avec composants, empty state, colonnes responsive
- [x] `apps/web/app/wallet/[address]/loading.tsx` ÔÇö skeleton fallback pendant le fetch SSR
- [x] States : empty / loading / error / partial
- [x] `apps/web/components/ChainSelector.tsx` ÔÇö s├®lecteur 110 cha├«nes, top 10 pr├®-coch├®es, search, toggle all
- [x] `apps/web/app/page.tsx` ÔÇö formulaire avec ChainSelector, navigation vers /wallet/[addr]?chains=...
- [x] `apps/web/app/wallet/[address]/page.tsx` ÔÇö accepte `?chains=` param, passe ├á l'API, timeout 5 min
- [x] **Crit├¿re** : UI lisible mobile + desktop, tests et typecheck verts

### Ô£à Phase 6 ÔÇö Engines SVM + Cosmos

- [x] `packages/core/src/engines/svm.ts` ÔÇö `getSvmWalletAssets` via JSON-RPC: `getBalance` (SOL natif), `getTokenAccountsByOwner` (parsing jsonParsed), `getAccountInfo` (decimals fallback), Jupiter pricing
- [x] `packages/core/src/engines/cosmos.ts` ÔÇö `getCosmosWalletAssets` via REST: `/cosmos/bank/v1beta1/balances`, `/cosmos/staking/v1beta1/delegations` (staked native), Llama pricing
- [x] `packages/core/src/engines/dispatch.ts` ÔÇö `getWalletAssets(address, chain)` router unifi├® par VM type (EVM/SVM/COSMOS)
- [x] API `POST /api/scan` ÔÇö utilise `AnyAddress` (EVM/Solana/Cosmos), dispatch automatique par cha├«ne, plus de restriction EVM-only
- [x] ChainSelector UI ÔÇö affiche les cha├«nes SVM/COSMOS avec badge VM, s├®lectionnables comme les EVM
- [x] **Crit├¿re** : un wallet Solana et Cosmos Hub donnent un r├®sultat valide

### Ô£à Phase 7 ÔÇö Auth + persistance utilisateur

Bascule produit : on devient un service avec utilisateurs.

- [x] `packages/db` ÔÇö Prisma schema (User, WalletScan, Quest, Badge, UserQuest, UserBadge)
- [x] `packages/core/src/circuit-breaker.ts` ÔÇö Circuit breaker (CLOSED/OPEN/HALF_OPEN, 5 failures ÔåÆ 2 min cooldown)
- [x] `packages/core/src/cache/redis-store.ts` ÔÇö `createCacheStore()` avec Redis (ioredis), fallback MemoryCacheStore
- [x] `apps/api/src/auth.ts` ÔÇö SIWE via viem (recoverAddress), JWT tokens, `/api/auth/login`, `/api/auth/me`, `/api/profile/:address`
- [x] API `/health` inclut l'├®tat du circuit breaker (`circuit: { state, failureCount, openedAt }`)
- [x] API `GET /api/circuit` ÔÇö ├®tat d├®taill├® du circuit breaker
- [x] API `POST /api/scan` ÔÇö bloque si circuit ouvert (503), sauvegarde le scan en DB si user authentifi├®
- [x] Connexion wallet via wagmi + viem + Reown c├┤t├® web
- [x] Profil `/profile/[address]` dans l'UI
- [x] **Crit├¿re** : un user peut se connecter, son wallet primary est li├®, ses scans sont conserv├®s

### Ô£à Phase 8 ÔÇö Engagement (GM / qu├¬tes / streak / badges)

- [x] `apps/api/src/gamification.ts` ÔÇö `POST /api/gm`, `GET /api/leaderboard`, `GET /api/quests`, `POST /api/quests/:id/complete`, `GET /api/badges`
- [x] `apps/api/src/server.ts` ÔÇö seed 5 quests + 7 badges, auto-complete quests on scan
- [x] `packages/core/src/tokens/explorer-discovery.ts` ÔÇö Blockscout API auto-discovery (50+ tokens), spam filter
- [x] `packages/core/src/tokens/registry.ts` ÔÇö 100+ tokens across 10 chains
- [x] `apps/web/app/page.tsx` ÔÇö custom tokens input, deep scan toggle
- [x] Bouton GM dans l'UI (signature off-chain ÔåÆ POST /api/gm)
- [x] Page profil `/profile/[address]` avec badges, streak, historique scans
- [x] Leaderboard UI
- [x] **Crit├¿re** : ressemble ├á zns.bio / gmboost.xyz / onchaingm.com

---

## Reprise post-pause / partage

Quand tu reviens (toi ou quelqu'un d'autre) :

1. Lis ce fichier (`ROADMAP.md`) ÔÇö ├®tat r├®el.
2. `git status` ÔÇö voir les fichiers modifi├®s en cours.
3. `git log --oneline -10` ÔÇö voir les derniers commits.
4. V├®rifie la phase en cours et son crit├¿re d'acceptation.
5. Si tout est vert sur la phase courante, lance la suivante.

### M├®moire persistante

- **Apps Script side** : `AGENTS.md` (racine) + Token Savior memory (MCP) + `~/.claude/projects/C--Users-strau-wcore-web/memory/MEMORY.md`
- **Web side** : ce `ROADMAP.md` est la source unique. Si une d├®cision change, l'├®crire ici dans le tableau "D├®cisions prises".

---

## Risques surveill├®s

| Risque | Mitigation |
|---|---|
| R├®gression cascade pricing (30+ gotchas dans AGENTS.md) | Tests golden Phase 3, comparaison directe vs WCORE Sheets |
| Quota RPC public abus├® | Rate-limit API par IP d├¿s Phase 4, scan limit├® ├á N chains/req |
| Scan lent (50+ HTTP calls par chain) | Streaming SSR Phase 5, jobs BullMQ Phase 6+ pour scans massifs |
| 117 chains ├á maintenir en double pendant la transition | G├®n├®rateur `gs ÔåÆ ts` automatique (Phase 2a) |
| D├®tection tokens via `eth_getLogs` limit├®e par certains RPC publics | Adapter `TokenDiscovery` swappable, ajout Alchemy/Routescan en Phase 8 si besoin |

---

## Contact / propri├®t├®

Projet personnel `straub.florian88.fs@gmail.com`. Pas d'├®quipe, pas de SLA. ├ëvoluer librement.
