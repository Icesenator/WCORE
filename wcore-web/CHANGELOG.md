# Changelog

## 2026-07-17 — DeFi Web batch finalise en production

- **Perimetre** : `Selected DeFi positions` couvre en V1 des positions Compound V3, WCT, Chainbase et des actifs stakes selectionnes; aucune couverture generale des LP, vaults ou protocoles n'est revendiquee.
- **Causes racines** : `/api/scan/batch` ne passait pas par la finalisation WCT/Compound du chemin GSheet; la serialisation perdait la semantique DeFi, le filtre scam pouvait retraiter ces lignes et le calcul Web pouvait borner un net signe. Un `NO_PRICE` long-tail marquait aussi a tort un scan comme degrade.
- **Fixes** : le Web batch reutilise la finalisation GSheet pour suffixes `[Flex]`/`[Lock]`, pricing miroir, labels lisibles et dette signee. Compound est decouvert une fois par batch EVM; les appels `collateralBalanceOf(user, asset)` ciblent le Comet, tandis que l'actif collatéral fournit pricing/logo/sortie et `AssetInfo.scale` fournit les decimales. Le flag `DEFI` traverse l'API, les lignes officielles contournent le filtre scam, les nets signes sont preserves et un `NO_PRICE` long-tail ne degrade plus le scan.
- **Commits** : `6accdda1` (`fix: finalize DeFi positions in web scans`) et `95b91591` (`fix: keep missing token prices non-degrading`).
- **Production** : deploys Railway sequentiels API `81f8df8f-b6a9-45ba-8aed-81070a70bc2f`, puis Web `58cbefc7-c45d-4804-9b53-2e4e815bc44b`. Aucun nouveau `clasp push` pour ce fix Web final.
- **Smoke Optimism** : `/api/scan/batch`, `forceRefresh=true`, `degraded=false`, `errors=[]`; WCT Claimable `[Flex]` `0,47 EUR`, WCT Stake `[Flex]` `2,61 EUR`, Comp wrsETH `[Flex]` `12,69 EUR`, Comp WETH Borrow `[Flex]` `-10,21 EUR`; net signe `10,43 EUR`.
- **Verification** : shared 21 tests, core 290 tests, Web 161 tests, 104 tests API cibles, typecheck global, lint cible et builds production API/Web.

## 2026-07-17 — Market Cap production launch + X cycle

- **Market Cap Crypto/Stock** : pages publiques `/cmc/crypto` et `/cmc/stocks` livrées avec 5 000 lignes, logos, pays, recherche, pagination et statut fresh/stale. Navigation sidebar mise à jour.
- **Visuel X** : `wcore-post-market-cap.svg/.png` finalisé en 1200x675 avec quatre rangs par capture, contours arrondis lime/bleu visibles et suppression des badges redondants.
- **Publication** : post publié sur `https://x.com/WCORExyz/status/2078069673707348415`.
- **Interactions** : trois réponses approuvées publiées et vérifiées sur les fils `strivex_`, `DeFiDegen_0x` et `MARCELLUScryp`; aucun like ou follow automatique.
- **Opérations** : ancien brouillon X arrêté, branche de cycle fusionnée supprimée et dossier worktree orphelin nettoyé.

## 2026-07-17 — CI racine, lint vert, ws patché et GM lifecycle aligné

- **CI** : workflow déplacé de `wcore-web/.github/workflows/` vers la racine `.github/workflows/`; working-directory, cache pnpm, E2E et artifacts adaptés au monorepo.
- **Qualité** : 18 erreurs ESLint + 1 warning corrigés. Les 6 tests UI dépendant d'une API locale sont isolés sous `test:integration`; la suite Web unitaire est hermétique (137/137).
- **Sécurité** : override `ws` mis à jour de 8.20.1 à 8.21.1; audit production sans vulnérabilité HIGH/CRITICAL.
- **Chain lifecycle** : factories GM retirées pour Polygon zkEVM et Ancient8 (chaînes désactivées), et retrait RARI finalisé dans factories, wagmi, deploy UI/data, explorer, manifests et scripts. Un test interdit désormais toute factory GM pointant vers une chaîne absente ou désactivée.

## 2026-07-07 — X cycle read-only + concept post

- **Cycle X** : 3 replies publiees et verifiees apres scan read-only et filtrage shill/doublons : approvals/read-only, API publique sans private key, fake portfolio balance scam.
- **Post X concept** : `https://x.com/WCORExyz/status/2074361865904283858` — `Read first. Sign later.` Visuel `apps/web/public/wcore-post-read-first-sign-later.svg` + `.png` en 3200x1800, genere par `scripts/build-post-read-first-sign-later.cjs`.
- **DA / assets** : composition WCORE v12 reequilibree apres review : titre compact, deux colonnes, panneau `VISIBILITY LAYER`, raw value barree vs clean value, carte read-only, footer discret. Exceptions `.gitignore` ajoutees pour conserver le script et le PNG final.

## 2026-07-05 — Kraken CEX + DeFi positions + pricing fixes

- **Kraken 7e CEX** : full integration (normalizer, API plugin, form, tests). HMAC-SHA512, microsecond nonce, Z-fiat prefix mapping. 23 files modified.
- **Robinhood Chain GM** : factory, wagmi chainId 4663, icon, gm-chains label. X post published with `@RobinhoodCrypto`.
- **CEX pricing provider-first** : `quoteEur` (ticker) prioritized over DefiLlama. BCPEUR reclassified fiat. Stocks priced before crypto (no homonym mispricing). ZUSD fiat mapping fixed.
- **Relay stock fixes** : TM→`7203.T`, SSU/SMSN ×25 multiplier, ROG→`ROG.SW`, explicit candidates don't fallback to raw symbol.
- **DeFi badge web** : `DeFi` badge in TokenTable based on name/symbol regex (staked, flex, lock, staking, C-* pattern).
- **sKAITO DeFi registry** : `[Flex]` suffix + mirror KAITO pricing. DeFi engine documented (`docs/defi-position-engine.md`).
- **Parity script** : `scripts/parity-gsheet-vs-web.cjs` compares GSheet totals vs Web DB.
- **X post** : Kraken 7e CEX with MiCA badges (blue `MiCA` on Bitpanda/Bybit/Coinbase/OKX chips, `MiCA LICENSED` pill on hero Kraken). Convention: tag only the new CEX.

## 2026-07-05 (suite) — Versioning, copy, banner, watchdog fix

- **Versioning** : `CORE_VERSION` 0.3.3, `package.json` 0.3.3. `/health` exposes `coreVersion`. SidebarLayout reads it dynamically (no more hardcoded drift).
- **Homepage/About copy** : real numbers everywhere — 174 chains, 7 CEX, 80+ GM, 4 VMs. Banner SVG/PNG refreshed.
- **Twitter bio** : `All your crypto. One view. Read only.` (clean & direct, 123 chars).
- **GSheet WEB_SCAN_ERROR retry** : `[WEB_SCAN_ERROR]` was silently dead-ending (watchdog never re-pulsed B1). Fixed: explicit handler, English error detection, timestamp extraction, redundant `chain=` suffix removed. Adapter v4.16.27.

## 2026-07-01 - GSheet Web scan parity + Base Zora fallback pricing

- **GSheet Web scan adapter v4.16.26** : strict token whitelists, stable degraded merges, and precise price derivation from `valueEur / balance` fix GSheet/Web valuation drift for Web-backed scans.
- **Base Zora fallback** : added `ZoraCoinPriceSource` for Base content coins using `tokenPrice.priceInUsdc` from Zora after standard sources miss. Prod/GSheet validation: `Surprise`, `CUBE`, and `JALICHI` are now priced on `Ledger - Base`.
- **Scam rules v15** : hard-blocked Base `ZAMRUD` fake-price spam by contract.
- **Corn cleanup** : removed live `Ledger - Corn` tab after Corn Maizenet shutdown and failed public RPC checks. Code-level chain disable/removal remains a follow-up.
- **Still no reliable source** : `BARAN`, `JRA`, `ZAY`, `FLIPIT`, `CTRL`, `BSNOW`, `ZECM`, and `WC` remain unpriced by design.

## 2026-06-29 — Scam-detector v13: Base BONSAI absurd-price protection

- **Prix absurde neutralisé côté GSheet API** : `BONSAI` n'est pas hard-blocké comme scam quand le prix est sain; les valeurs absurdes sont remplacées par `null` et tracées en erreur `ABSURD_PRICE`.
- **Tests** : ajout d'un test négatif pour garantir que `BONSAI` reste autorisé par le scam detector lorsque le pricing est raisonnable.
- **Note** : évite de supprimer un token légitime uniquement à cause d'une source de prix corrompue.

## 2026-06-29 — Compound V3 on-chain cToken discoverer integrated in engine (no more suffix)

- **Architecture** : Compound V3 positions are no longer read from a static registry. At scan time, the engine calls `getCompoundV3Tokens(chain, user, rpc, endpoint)` which queries `Comet.numAssets()` + `Comet.getAssetInfo(i).asset` to enumerate the unique cToken addresses per collateral type, then `cToken.symbol()` for naming. Each cToken (unique per collateral: wrsETH, wstETH, rETH, wBTC, USDT, USDC, ezETH, weETH) becomes a separate `DiscoveredToken` with `balanceSelector=collateralBalanceOf(user, cToken)` and `balanceSelectorExtraArgs=[cToken]`. Borrow position uses the Comet proxy directly with `balanceSelector=borrowBalanceOf(user)`. No more `@collateral`/`@borrow` suffix collisions.
- **Registry cleanup** : `defi/registry.ts` removed the 2 hardcoded Compound V3 entries (`Comp WETH Borrow`, `Comp wrsETH`). The registry now only contains non-Compound protocols (SDAYS, SSWEET, WCT Stake, WCT Claimable) that don't have an on-chain discoverer.
- **`applyStakedPriceMirrors` enhancement** : reads `liquidityStatus` from the token itself (for discovered positions) or from the registry (for known positions). The `[Flex]`/`[Lock]` suffix works for both paths.
- **WCT Stake dynamic lock status** : `getWCTStakeLockStatus(rpc, endpoint, user)` queries `lockUntil(address)` on the WCT staking contract. Returns `"lock"` if `lockUntil > now`, else `"flex"`. Default `"flex"` on RPC failure (safe default). The API injects the fetcher at startup and the GSheet scan surface renders `[Lock]` / `[Flex]` from the dynamic status.
- **Tests** : core targeted suite 62/62, API Chainbase 4/4, API GSheet 36/36.

## 2026-06-29 — Scam-detector v12: World Chain XDogeCoin airdrop scam blocked

- **`_BLOCKED_CONTRACTS` étendu** (1 nouvelle entrée):
  - `0x37cff256e4aed256493060669a04b59d87d509d1` (World Chain: `XDoge` "XDogeCoin" — variante Dogecoin, generic airdrop)
- **Tests** : 12/12 passent dans `apps/web/__tests__/scam-detector.test.ts`. SCAM_RULES_VERSION bump 11 → 12.
- **Effet** : `XDoge` est maintenant flagged `scam level=10` au lieu de `suspicious` (générique + valeur > 10 EUR). Même pattern que LUCKY (World Chain airdrop scam).

## 2026-06-29 — Compound V3 on-chain discoverer (cToken address, no suffix)

- **Problème** : la version précédente suffixait `@collateral` / `@borrow` au Comet proxy pour distinguer les 2 sous-positions Compound V3, mais toutes les collatérales d'un même marché (wrsETH, wstETH, cbETH, etc.) partagent le même Comet proxy → collision dans Portefeuille Crypto Details.
- **Solution architecturale** : passer de "registry statique" à "découverte on-chain" pour Compound V3. Chaque collateral a son **propre cToken address** (différent par type d'asset). Le cToken est ce qu'on met dans `contract_address`, garantissant l'unicité.
- **`discoverCompoundV3CTokens(rpc, endpoint, cometAddress)`** dans `packages/core/src/defi/compound-v3.ts` : query `Comet.numAssets()` + `Comet.getAssetInfo(i).asset` pour chaque collateral, retourne la liste des cToken addresses. Tolère les erreurs partielles (continue si un getAssetInfo rate). Limite max 32 collatérales par marché.
- **`decodeAddressFromWord(hex)`** ajouté dans `packages/core/src/tokens/abi.ts` : décode une address d'un word ABI 32-byte (left-padded).
- **`positionToTokenLike`** : la logique de suffix `@collateral`/`@borrow` est retirée. Le `contract` est passé tel quel — c'est maintenant le **cToken address** (unique par collateral) qui sert de clé SUMPRODUCT dans Portefeuille Crypto Details. Plus aucune collision possible entre wrsETH, wstETH, cbETH collatéral sur le même marché.
- **Tests** : 3 nouveaux tests dans `compound-v3.test.ts` (decouverte, numAssets=0, partial failure recovery). 4 tests Compound V3 mis à jour dans `positions.test.ts`. **15/15 positions + 3/3 compound-v3 = 18 tests verts** pour le module DeFi.
- **État historique** : cette étape intermédiaire a été finalisée depuis. L'intégration moteur et le déploiement production sont attestés dans l'entrée du 2026-07-17.

## 2026-06-29 — Scam-detector v11: 5 nouveaux contrats bloqués + 2 nouvelles règles (typo-phishing + Base impersonation)

- **`_BLOCKED_CONTRACTS` étendu** (5 nouvelles entrées):
  - `0xf34f722fc7617300ad37f499d7a36780d81daa29` (BASE: `BASED` "Based" — generic Base meme impersonation)
  - `0x208e0664114880b76471fec59fdd1bead62620d3` (BASE: `IMOUT` "I AM OUT" — joke airdrop dust)
  - `0x0d4d191a72c1d8d6703d6d3ed1a532b67d5a5f14` (BASE: `SEC` "Secury Wallet" — typo-phishing pour drain on approve)
  - `0xf21dbea34ca178d424a6f2184b094f279de915ff` (BASE: `SHIT` "ShitToken" — joke airdrop dust)
  - `0x3a27edadf19d362a60b0b5a7bd3e8c48273c5e2e` (World Chain: `LUCKY` "LuckyCoin" — generic airdrop sur nouvelle chaîne)
- **Règle 11 — Typo-phishing** : détecte les fautes volontaires de mots-clés sécurité (`secury|saef|safty|securty|valut|wallat|wallett|offical|0fficial`) dans le symbol ou le name → `weight 4` → `scam`. Cible les honeypots qui imitent "Secure", "Safe", "Vault", "Wallet", "Official" avec une lettre changée.
- **Règle 12 — Ultra-generic chain name impersonation** : détecte les patterns `Based|BaseCoin|Base Token|BaseToken|World Coin|WorldCoin` (symbol ou name exact) → `weight 4` → `scam`. Cible les tokens qui se font passer pour la "monnaie officielle" d'une chaîne.
- **Tests** : 11/11 passent dans `apps/web/__tests__/scam-detector.test.ts`. SCAM_RULES_VERSION bump 10 → 11.
- **Effet** : ces 5 contrats sont maintenant flagged `scam level=10` au lieu de `clean` ou `suspicious`. Les admins platform-owner peuvent toujours les override via `addAdminApproved()` si besoin.

## 2026-06-29 — DeFi Compound V3: suffixed contract pour collateral/borrow distincts

- **Bug** : Compound V3 (et autres protocoles multi-position) exposent plusieurs sous-positions (collateral, borrow) sous une même address on-chain. Le moteur DeFi (`packages/core/src/defi/positions.ts`) sortait 2 lignes avec le même `contract_address`, ce qui cassait la formule `SUMPRODUCT` de `Portefeuille Crypto Details` (lookup par G3=contract) — les 2 lignes recevaient la même valeur.
- **Fix** : `positionToTokenLike()` suffix le `contract` par type de position:
  - `lending_collateral` → `0xe36a...:collateral`
  - `lending_debt` → `0xe36a...:borrow`
  - Autres types → contract brut inchangé
- **Tests** : 4 nouveaux tests dans `packages/core/src/defi/positions.test.ts` (`lending_collateral` suffix, `lending_debt` suffix, `wallet_token` no-suffix, `staking_locked` no-suffix). 12/12 verts.
- **Effet** : la même address Compound V3 (ex: `0xe36a30d2...`) sort maintenant 2 lignes avec des `contract_address` distincts (`...@collateral` et `...@borrow`). La formule SUMPRODUCT de Portefeuille Crypto Details peut maintenant distinguer les 2 positions.
- **Note** : `applyStakedPriceMirrors` continue de fonctionner (il utilise `mirror.underlying`, pas le contract). Le raw contract est préservé dans la position object interne (`position.contract`) pour les lookups internes.

## 2026-06-29 — Fix label wallet SVM case-sensitive dans `/api/gsheet/scan`

- **Bug** : `labelGsheetWalletScan()` dans `apps/api/src/plugins/gsheet.ts` faisait `address.toLowerCase()` pour lookup les wallets EVM. Les adresses Solana base58 sont case-sensitive (ex: `9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5` ≠ `9gjm5hw5e6hliscrciewcnqv9mt1l4dcm9w2arex6pe5`). Résultat : les 3 wallets SVM (`Layer3`, `Ledger`, `Seeker` du `WALLET_REGISTRY` dans `12_WALLET_NAMES.gs`) n'étaient jamais reconnus, et `chainName` restait `Fogo` au lieu de `Layer3 - Fogo`.
- **Fix** : lookup exact d'abord (`map[rawAddress]`), puis fallback lowercase pour les adresses EVM. Ajout des 3 entrées SVM dans `GSHEET_WALLET_LABELS` (`9gjm...`, `AxU6...`, `GWLC...`).
- **Test** : nouveau test `labels registered case-sensitive SVM gsheet wallets in web scan responses` qui échouait avant le fix (assertion `chainName === "Layer3 - Fogo"` retournait `"Fogo"`) et passe après. 30/30 tests API `gsheet.test.ts` verts.
- **Déployé** : API Railway redéployée avec succès. Build `pnpm --filter @wcore/api build` OK, `railway up --service api --ci` Deploy complete. `railway.json` parent restauré vers `wcore-web/apps/web/Dockerfile.railway` après deploy.

## 2026-06-29 — Renommage live `CEX - Bitpanda` → `CEX - Bitpanda Crypto` (Portefeuille Crypto Details)

- **Bug** : 136 cellules de `Portefeuille Crypto Details!E:E` (gsheet) portaient le libellé `CEX - Bitpanda` (sans suffixe). Le sheet CEX réel est `CEX - Bitpanda Crypto` (distinct de `CEX - Bitpanda Fiat/Stocks/Commodity`). La formule VLOOKUP colonne H résolvait par recherche exacte, donc `CEX - Bitpanda` retournait toujours 0 ou erreur.
- **Fix** : renommé live via Google Sheets API (`batchUpdate` avec 136 `updateCells`) : `CEX - Bitpanda` → `CEX - Bitpanda Crypto`. Liens hypertexte re-générés via `_setDetailsChainHyperlinks_` (709 cellules linkées au final).
- **Note** : `CEX - Bitpanda Fiat` n'apparaît PAS dans `Portefeuille Crypto Details` par design (la fiat n'est pas un asset à tracker là-bas, normal).

## 2026-06-22 — Web pricing fix: GT throttle + cache policy + error logging

- **GT throttle bumped (40→300 calls/60s)** : le web n'a pas la limite 30s de GSheet. Le throttle à 40 était un copier-coller inadapté qui empêchait le pricing de >40 tokens par scan. Ajout d'un inter-call pacing de 10ms pour éviter les burst 429. (`packages/core/src/pricing/sources/geckoterminal.ts`)
- **Cache write error logging** : `cache.setPrice()` était fire-and-forget (`void`), avalant les erreurs Redis silencieusement. Ajout de `.catch()` avec log dans `cascade.ts` et `try/catch` dans `RedisPricingCache.setPrice()`. (`packages/core/src/pricing/cascade.ts`, `redis-pricing-cache.ts`)
- **Cache policy fix — object-style errors** : `shouldCacheAssets()` et `hasMajorPriceableTokenWithoutPrice()` appelaient `.toLowerCase()` sur des objets `{message, stage}` (bug), donc les checks d'erreur ne matérialisaient jamais. Ajout d'un helper `errorMessage()` + rejet du cache si >50% des tokens (balance>0) sont sans prix. (`apps/api/src/plugins/scan-utils.ts`)
- **GSheet tag `startale`** : ajouté dans `_isLedgerLike_()` (17_LISTING.gs) pour que l'onglet "Startale - Soneium" soit inclus dans le Recap Portfolio et le watchdog. Wallet `0xe9c0...` nommé "Startale" dans `WALLET_REGISTRY` (12_WALLET_NAMES.gs).
- **safe-push.ps1 v3.2** : ajout d'une étape 7 post-push qui ouvre l'éditeur Apps Script et rappelle de lancer `WCORE_AUTO_HEAL_FORCE()`.
- **opencode gsheets MCP** : configuré dans `.opencode/opencode.json` (projet) via `cmd /c set ... &&`. Le champ `env` d'opencode ne passe pas les variables d'environnement aux processus MCP sur Windows.

## 2026-06-21 — Roadmap sprint: observability guards, scan/GM tests, contributor docs

- **Observability guards**: `/api/stats` and `/api/circuit` now require admin authorization. Regression tests cover unauthenticated 401 responses.
- **Scan orchestrator tests**: added pure job-building coverage for VM filtering, disabled chains, and batching.
- **GM on-chain replay guard**: added same-chain replay coverage for `/api/gm/onchain`; duplicate transactions now return `error: "duplicate_tx"` and are not inserted twice.
- **Contributor docs**: added `CONTRIBUTING.md` and `TESTING.md`, linked from `README.md`.
- **Swellchain sunset gate**: no chain removal before the public 2026-06-23 deadline.

## 2026-06-19 ÔÇö GitHub public + API Railway restaur├®e apr├¿s crash Dockerfile

- **Repo public propre** : `https://github.com/Icesenator/WCORE` publi├® sur `master` depuis un snapshot ├á historique neuf, pour ├®viter de publier l'ancien historique priv├® contenant des secrets r├®els. Les secrets historiques doivent rester consid├®r├®s compromis c├┤t├® fournisseurs.
- **Railway web OK** : `https://wcore.xyz` v├®rifi├® `200 OK` apr├¿s d├®ploiement depuis le snapshot public.
- **API crash corrig├®** : l'API Railway crashait avec `ERR_MODULE_NOT_FOUND: Cannot find module '/app/packages/shared/dist/.js'`. Cause racine : dans `apps/api/Dockerfile.railway`, le rewrite post-build des imports ESM utilisait `$1` dans un `RUN node -e "..."`; `/bin/sh` expandait `$1` en vide dans Docker/Alpine, g├®n├®rant `from "./.js"`.
- **Fix Dockerfile** : remplacement chang├® en `from "./\$1.js"`. Build Docker `builder` valid├® localement et artefact `packages/shared/dist/index.js` inspect├® (`./address.js`, `./cache-key-registry.js`, etc., aucun `./.js`).
- **D├®ploy├® et v├®rifi├®** : API `/health` `200` (`service=wcore-api`, `chainCount=182`) et Web `https://wcore.xyz` `200`. Railway status : `api`, `web`, `cex-relay`, Postgres et Redis `Online`.
- **Ops follow-up** : garder l'autodeploy GitHub API d├®sactiv├® tant que Railway n'a pas une config service-level s├®par├®e pour le Dockerfile API. Le `railway.json` unique reste dangereux pour deux services.

## 2026-06-19 ÔÇö Phase 3 : consolidation configs cha├«nes (182/182 extractibles) + TON ÔåÆ ChainFactory

- **Portage massif web-only ÔåÆ gsheet** : les 68 configs de cha├«nes qui n'existaient que c├┤t├® `wcore-web/packages/core/src/chains/*.ts` ont ├®t├® port├®es automatiquement vers `wcore-gsheet/src/*.gs` via le g├®n├®rateur `tools/port-web-chains-to-gsheet.cjs`. Chaque fichier `.gs` utilise `ChainFactory.createEvmChain`/`createSvmChain`/`createCosmosChain`/`createTonChain`.
- **TON.gs ÔåÆ ChainFactory** : `TON.gs` utilisait un pattern `TON_CONFIG` non standard qui bloquait l'extraction automatique. Ajout de `ChainFactory.createTonChain()` dans `19_CHAIN_FACTORY.gs` comme wrapper vers le moteur TON standalone existant, sans r├®├®crire l'engine. `extract-chains.mjs` reconna├«t maintenant `createTonChain`.
- **Outillage Phase 3** :
  - `tools/port-web-chains-to-gsheet.cjs` ÔÇö g├®n├¿re les `.gs` manquants depuis les configs TS web.
  - `tools/test-phase3-chain-port.cjs` ÔÇö v├®rifie pr├®sence `.gs`, extraction, factory, et ├®quivalence c├┤t├® `dist/chains/`.
  - `npm run port:web-chains` + `npm run test:phase3-chains`.
- **R├®sultat final** : 182/182 configs web ont une source `.gs` extractible. `wcore-web/packages/core/src/chains/index.ts` : `182 chains from wcore-gsheet/dist + 0 local web-only chains`. Delta : `web:182`, `extractibleGsheet:182`, `localAfterExtraction:[]`, `sourceMissing:[]`.
- **Validations** : `validate:static` OK (2904 fonctions), `build:chains` OK (182 cha├«nes, EVM=168 SVM=2 Cosmos=11), `test:phase3-chains` OK (182 chains verified).
- **ROADMAP.md** : Phase 3 cl├┤tur├®e ; restent les chain sunsets (Swell 23 juin, Polygon zkEVM 1 juillet, etc.).

## 2026-06-19 ÔÇö Cache scan `scan:result` + d├®ploiement Railway parent-context (v0.3.1)

- **Fix cache scan utile mais d├®grad├®** : `shouldCacheAssets()` accepte maintenant les scans qui contiennent de la valeur exploitable malgr├® des erreurs non critiques (`NO_PRICE` long-tail, cooldown explorer/RPC), apr├¿s les garde-fous critiques existants. Cela permet ├á un `forceRefresh=true` de remplacer un ancien snapshot sans prix au lieu de laisser l'UI resservir un vieux cache.
- **Garde-fous conserv├®s** : refus de cache si natif positif sans prix, token majeur priceable positif sans prix (`WBTC`, `WETH`, `USDC`, `USDT`, `stETH`, etc.), wallet vide douteux, ou erreurs critiques SVM/Cosmos (`token accounts: no data`, balances fetch/HTTP, native balance failed on all).
- **Namespace Redis renomm├®** : cache r├®sultat haut niveau `scan:v2:{address}:{chain}` ÔåÆ `scan:result:{address}:{chain}` via `packages/shared/src/cache-key-registry.ts`. Les docs/UI/tests ont ├®t├® align├®s.
- **Validation Ethereum prod** : wallet `0x17d518736ee9341dcdc0a2498e013d33cfcdd080`, `forceRefresh=true` puis scan normal. `WBTC` valoris├® (`139.02 EUR`, prix `54556.02 EUR`), `stETH`, `PENDLE`, `ETHFI` pric├®s, scan non-forc├® servi depuis cache en `256 ms` puis `791 ms` apr├¿s red├®ploiement final API.
- **Validation Base prod** : m├¬me wallet, Base natif `ETH` confirm├® pric├® apr├¿s red├®ploiement final (`priceEur=1486.27`, `valueEur=1.59`) et scan non-forc├® servi en `267 ms`. Si l'UI affiche encore `ÔÇö` pour Base native apr├¿s ce d├®ploiement, rafra├«chir la carte/onglet pour recharger le cache serveur `scan:result`.
- **Railway parent-context** : le repo actif est le parent `C:\Users\strau\WCORE\wcore-web` contenant `wcore-web/` et `wcore-gsheet/`. `scripts/deploy.ps1` ├®crit le `railway.json` parent, lance `railway up <parent> --path-as-root --service api|web --ci`, restaure le JSON et propage le code de sortie.
- **Dockerfiles Railway d├®di├®s** : `apps/api/Dockerfile.railway` et `apps/web/Dockerfile.railway` incluent `wcore-gsheet/dist`, compilent `@wcore/chains` en JS, puis patchent aussi `node_modules/@wcore/chains/package.json`. Sans ├ºa, Node 22 crashe en prod avec `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` sur `node_modules/@wcore/chains/chains/index.ts`.
- **D├®ploy├® et v├®rifi├®** : API `/health` `200` (`chainCount=182`) et Web `https://wcore.xyz` `200`.

## 2026-06-18 ÔÇö Refactor mirror .gs ├®limin├® + monorepo unifi├® (v0.3.0)

- **├ëlimination du mirror `.gs`** : les 170 fichiers `.gs` dupliqu├®s dans `wcore-web/src/` sont supprim├®s. La source unique est `wcore-gsheet/src/*.gs`. Les configs de cha├«nes sont extraites via `wcore-gsheet/tools/extract-chains.mjs` ÔåÆ `wcore-gsheet/dist/chains/*.ts` ÔåÆ package `@wcore/chains` ÔåÆ consomm├® par `wcore-web/packages/core` via pnpm `file:` protocol. Plus aucun doublon de code m├®tier entre les deux runtimes.
- **Architecture** : 113 cha├«nes extraites initialement (107 EVM + 2 SVM + 4 Cosmos) + 69 cha├«nes web-only conserv├®es localement (port├®es vers gsheet le 2026-06-19). Total final: 182 cha├«nes dans le registre web, toutes extractibles. Package `@wcore/chains` v4.15.50 self-contained (types `VmType` + `ChainConfig`, pas de d├®pendance ├á `@wcore/shared`).
- **Outillage** : `wcore-gsheet/tools/extract-chains.mjs` (g├®n├®rateur), `wcore-gsheet/tools/validate-static.js` (validation GAS 2632 global functions), `wcore-web/packages/core/src/chains/build-index.mjs` (merge gsheet + local chains).
- **Nettoyage** : `wcore-web/tools/migrate/extract-chains.mjs` supprim├® (doublon), `wcore-web/scripts/validate-static.js` supprim├® (doublon), `wcore-web/.mcp/rpc-mcp.js` pointe maintenant vers `wcore-gsheet/src/`.
- **Monorepo GitHub** : repo `Icesenator/WCORE` unifi├® ÔÇö branche `web` contient `wcore-web/` et `wcore-gsheet/` en sous-dossiers. Branche `gsheet` supprim├®e (contenu migr├® dans `wcore-gsheet/`).
- **Validations** : `pnpm typecheck` 5/5 packages OK, `pnpm test` core 238/239 pass, `wcore-gsheet` validate-static OK, `wcore-gsheet` build:chains 113 ├®mises.
- **Dette follow-up sold├®e (2026-06-19)** : 69 cha├«nes web-only port├®es vers gsheet, TON.gs converti en `ChainFactory.createTonChain`, docs AGENTS.md/AUDIT.md mises ├á jour.

## 2026-06-18 ÔÇö Post X Swellchain shutdown + retrait apr├¿s deadline

- **Post X Swellchain shutdown** : `https://x.com/WCORExyz/status/2067654188692111746` ÔÇö alerte publique suite ├á l'annonce Swell : bridge avant le 23 juin, ne pas d├®pendre d'un seul tracker, WCORE retirera Swell Chain de la couverture active apr├¿s le 23 juin. Visuel `apps/web/public/wcore-post-swell-shutdown.svg` + `.png` (1200x675, DA v12) g├®n├®r├® par `scripts/build-post-swell-shutdown.cjs`; draft pr├®par├® via `scripts/x-cycle/prepare-post-swell-shutdown.cjs` et publi├® manuellement.
- **Roadmap** : ajout de la t├óche de suppression `SWELLCHAIN` apr├¿s le 23 juin (configs core, `GM_FACTORIES`, wagmi, DeployClient, explorers, manifests ic├┤nes/symboles, docs/compteurs et tests GM/wagmi).

## 2026-06-17 ÔÇö FX cascade (4 sources + median consensus) + cross-runtime drift detector (v0.2.47)

- **FX cascade EUR/USD sans fallback fixe** : le code historique avait un `0.92` hardcod├® (gsheet) ou un `1.08` dans 4 engines (web) qui corrompait silencieusement les prix quand les sources FX ├®chouaient. Remplac├® par une cascade temps-r├®el de 4 sources (Frankfurter, open.er-api.com, Coinbase, DefiLlama EURC) avec consensus m├®dian (3+ sources) ou moyenne 2-sources (delta < 5%) ou throw explicite si 0 source r├®ussit. Convention unifi├®e `priceEur = priceUsd * fxRate` (EUR per 1 USD).
- **Cross-runtime telemetry** : web self-publie sur `/api/price/fx` ÔåÆ `fx_telemetry:web` (TTL 2h). Gsheet POST apr├¿s chaque cascade r├®ussie ÔåÆ `/api/gsheet/fx-telemetry` (auth `x-gsheet-token`). Endpoint public `GET /api/diag/fx-parity` retourne `{web, gsheet, drift, ok}` avec tol├®rances 2% (warn) et 5% (alert).
- **CSRF : `/api/gsheet/*` exclues** : `requiresCsrfOriginCheck` retourne `false` pour les routes gsheet (auth par token, pas cookie). Sans ce fix, le POST telemetry ├®tait bloqu├® en 403 `csrf_origin_mismatch`.
- **Version stamp gsheet** : `FxRate._CURRENT_VERSION = "4.15.50"` stamp├® dans memory + L1 CacheService. Bumper la version force un fresh fetch apr├¿s deploy (├®vite d'attendre 1h de TTL). Bump obligatoire ├á chaque changement de cascade.
- **Callers gsheet durcis** : `10_OUTPUT.gs`, `15_COSMOS_ENGINE.gs`, `FOGO.gs` (2 occurrences), `26_OPTIMIZATIONS.gs` wrappent maintenant `FxRate.getUsdToEur()` en try/catch + traitent l'├®chec comme `null` (au lieu d'un fallback hardcod├® `0.86`/`0.92`).
- **Tests** : 26 unit tests (web `fx.test.ts`) + 9 cross-runtime spec tests (`wcore-gsheet/scripts/fx-cascade-spec.test.cjs`) + 1 live test (`wcore-web/scripts/test-fx-parity.cjs`, drift 0.39% < 2% apr├¿s deploy). 208/208 core + 237/237 API + 9/9 cross-runtime spec.
- **Doc focalis├®e** : `wcore-web/docs/fx-cascade.md` (convention, sources, consensus, cache, telemetry, tests, dette).
- **Dette restante** : les scan results cach├®s en Redis `scan:result:*` peuvent encore utiliser l'ancien FX jusqu'├á expiration du TTL. Sympt├┤me : sur la m├¬me cha├«ne, ETH et WBTC peuvent montrer des prix calcul├®s avec des FX diff├®rents s'ils ont ├®t├® scann├®s ├á des moments diff├®rents. Fix : `forceRefresh=true` sur les cha├«nes concern├®es.
- **Deploy** : web API v0.2.47 d├®ploy├® sur Railway, gsheet v4.15.50 push├® via clasp.

## 2026-06-15 ÔÇö Bitpanda stocks pric├®s via relais (KRW/CHF/GBP) + logos stocks + Refresh All CEX (v0.2.46)

- **Pricing stocks Bitpanda d├®plac├® vers le `cex-relay`** : Yahoo Finance refuse les connexions depuis l'IP datacenter de l'API WCORE (`fetch failed`, m├¬me blocage que Binance HTTP 451). Nouveau endpoint `POST /stock/prices` sur le relais Railway EU (`wcore-gsheet/railway-relay/server.js`) : re├ºoit `{token, symbols}`, price via Yahoo chart, convertit en EUR, renvoie `{SYMBOL:{priceEur,source}}`. L'API WCORE appelle le relais (`apps/api/src/cex/stock-relay.ts`) au lieu d'appeler Yahoo en direct, avec cache Redis 6h (`stockprice:{SYMBOL}`) et fallback quote provider Bitpanda.
- **Multi-devises stocks** : conversion USD/GBP/GBp(pence)/CHF/KRW vers EUR via taux Yahoo `EUR{CCY}=X`. Symboles cor├®ens ajout├®s (`HYXS`ÔåÆ`000660.KS` SK Hynix, `SSU`/`SMSN`ÔåÆ`005930.KS` Samsung), Nestl├® `NESN.SW` (CHF). Receipt Samsung `SSU`/`SMSN` divis├® par 25 (align├® sur le facteur ├ù25 de `wcore-gsheet`).
- **Candidats Yahoo minimis├®s** : un ticker US simple r├®sout en 1 seul appel (plus de balayage sp├®culatif des 8 suffixes europ├®ens qui saturait Yahoo en 429). Mapping curat├® pour les tickers europ├®ens + aliases Bitpanda (`AMD-US`ÔåÆ`AMD`, `BRKB`ÔåÆ`BRK-B`, `FB`ÔåÆ`META`, `MRKUS`ÔåÆ`MRK`, `RDSA`ÔåÆ`SHEL`, `TSFA`ÔåÆ`TSLA`, `BROA`ÔåÆ`AVGO`, `TCTZF`ÔåÆ`TCEHY`).
- **Collision crypto/stock corrig├®e** : les lignes `stocks` tentent Yahoo AVANT le quote provider Bitpanda, pour ├®viter qu'un ticker crypto homonyme (ACN, AMZN, MC, WMT) ne price une action avec un prix crypto.
- **Logos stocks** : `apps/web/lib/cex-stock-logos.ts` mappe chaque ticker stock/ETF Bitpanda vers son logo de marque via DuckDuckGo (`icons.duckduckgo.com/ip3/<domain>.ico` ÔÇö Clearbit d├®pr├®ci├®, DNS mort). `useCexHoldings` attache `logoUrl` aux holdings `stocks`.
- **Fix chevauchement des logos** : dans `TokenIcon`, le cercle color├® de fallback (lettre du symbole) restait visible derri├¿re l'image et transparaissait sous les favicons stocks ├á fond transparent. Le fallback est maintenant masqu├® (`opacity-0`) d├¿s que l'image charge (`imageLoaded`), fond neutre pendant le chargement, et `object-cover`ÔåÆ`object-contain` pour ne pas recadrer les favicons carr├®s.
- **Refresh All synchronise les CEX** : sur `/wallet`, le bouton "Refresh All" POST maintenant `/api/cex/accounts/:id/sync` pour chaque compte CEX puis recharge leurs holdings (`reloadCex`), en plus du re-scan on-chain (`WalletContent.tsx`).
- **Micro-cryptos non valorisables** : `APP`, `DCK`, `DOGA`, `GODL`, `KIP`, `LAI` restent ├á `ÔÇö` car le ticker Bitpanda officiel les cote lui-m├¬me ├á `EUR=0.0000` et CoinGecko renvoie des tokens ambigus par symbole. Comportement honn├¬te, pas de devinette (risque de gonfler le total comme le bug ETHG).
- **Post X concept (stocks + crypto)** : visuel `apps/web/public/wcore-post-bitpanda-stocks.svg` + `.png` (1200x675, DA v12) g├®n├®r├® par `scripts/build-post-bitpanda-stocks.cjs` (screenshot Bitpanda r├®el int├®gr├® ├á droite). Draft pr├®par├® via `scripts/x-cycle/prepare-post-bitpanda-stocks.cjs` ÔÇö `Your stocks and crypto. One value.` (concept post, PAS un 2e "Today's WCORE update." du jour). Publication manuelle.
- **Tests** : `apps/api/src/cex/normalizers.test.ts` (candidats minimaux, cache stock, collision crypto/stock, aliases), `apps/api/src/cex/stock-relay.test.ts` (3 cas relais), `apps/web/__tests__/cex-display.test.ts` (logos stocks + DuckDuckGo), `apps/web/__tests__/token-icons.test.ts` (object-contain). Tous verts. D├®ploy├® `cex-relay` + `api` + `web` (SUCCESS).

## 2026-06-14 ÔÇö Bitfinex CEX provider (API directe v2, HMAC-SHA384)

- **Bitfinex ajout├®** : 3e provider CEX apr├¿s Binance et Bitpanda, portant `37_BITFINEX_SYNC.gs` (wcore-gsheet) vers le web. L'utilisateur fournit sa cl├® read-only (`apiKey` + `apiSecret`), chiffr├®e AES-GCM (`CEX_SECRET`).
- **API directe server-side** : Bitfinex ne bloque pas les IP datacenter (contrairement ├á Binance HTTP 451 ÔåÆ relais). L'API WCORE signe en HMAC-SHA384 + nonce et appelle `api.bitfinex.com/v2/auth/r/wallets` directement, sans relais ni modif de `wcore-gsheet`.
- **Wallet exchange/spot uniquement** + alias symboles courts (`ATO`ÔåÆ`ATOM`, `IOT`/`MIOTA`ÔåÆ`IOTA`, `UST`ÔåÆ`USDT`ÔÇª) et consolidation stables/fiat (`USD`/`UDC`/`TUSD`ÔåÆ`USDT`, `EUR`/`EUT`/`EURS`ÔåÆ`EURC`), r├®pliqu├®s du module GAS.
- **Fichiers** : `apps/api/src/schemas.ts` (`CexProviderSchema`), `apps/api/src/cex/normalizers.ts` (`BitfinexBuckets`, `normalizeBitfinexBuckets`, `bitfinexCanonicalSymbol`), `apps/api/src/plugins/cex.ts` (`BitfinexCredentials`, `bitfinexAuthPost`, `fetchBitfinexRows`, routage), `apps/web/lib/cex-display.ts` (meta + regex), `ChainCard.tsx`, `useCexHoldings.ts`, `CexAccounts.tsx` (3e carte), `chain-icon-manifest.json` + `ChainIcon.tsx` (logo CMC `exchanges/128x128/37.png`).
- **Logo** : CMC officiel Bitfinex (`s2.coinmarketcap.com/static/img/exchanges/128x128/37.png`) ÔÇö simpleicons et `bitfinex.com/favicon.ico` renvoient 404.
- **Post X Bitfinex** : `https://x.com/WCORExyz/status/2066215478549180488` ÔÇö `Today's WCORE update. Bitfinex is now live.` Visuel `apps/web/public/wcore-post-bitfinex.svg` + `.png` (1200x675, DA v12) g├®n├®r├® par `scripts/build-post-bitfinex.cjs` : Bitfinex en carte hero, Binance/Bitpanda en cartes secondaires, tags `Read-only` / `Direct API` / `Provider-first pricing`.
- **Tests** : `apps/api/src/cex/normalizers.test.ts` (4 cas Bitfinex), `apps/web/__tests__/cex-display.test.ts` (4 cas). 9/9 + 7/7 verts. `tsc --noEmit` API clean, `next build` web clean. Commit `f6d7eed`, d├®ploy├® API + Web (CT JSON OK).

## 2026-06-13 ÔÇö CEX wallets live + pricing Binance/Bitpanda + post X publi├®

- **Post X CEX wallets** : `https://x.com/WCORExyz/status/2065912993515233508` ÔÇö `Today's WCORE update. CEX wallets now live.` Daily update (PAS un concept post) avec capture `/wallet` CEX scrolled. Visuel `apps/web/public/wcore-post-cex-wallets.svg` + `.png` (1200x675, DA v12 + badge WCORE top-left) g├®n├®r├® par `scripts/build-post-cex-wallets.cjs`. Logos CEX : Binance `cdn.simpleicons.org/binance/F0B90B` + Bitpanda JPEG officiel `apps/web/public/cex/bitpanda-official.jpeg` (fond vert `#27D17F` + B noir, clip├® en cercle pour matcher le style Binance).

## 2026-06-13 ÔÇö CEX wallets live + pricing Binance/Bitpanda

- **CEX dans le portefeuille** : Binance et Bitpanda sont affich├®s comme wallets s├®par├®s dans `/home`, `/wallet` et `/profile?tab=wallets`, sans ├¬tre m├®lang├®s aux scans on-chain. Les CEX peuvent ├¬tre supprim├®s depuis les listes de wallets et restent disponibles dans Profile > CEX pour sync/d├®tails.
- **Scan `/home`** : le bouton `Scan` lance une sync CEX avant d'ouvrir `/wallet`, pour afficher des holdings et prix frais.
- **UI harmonis├®e** : lignes wallets CEX align├®es sur les wallets on-chain, badge `CEX` conserv├® dans `/wallet`, ic├┤ne plateforme seulement dans la carte interne. Les CEX apparaissent dans le s├®lecteur `/wallet` et la `Value Distribution`.
- **Pricing** : Binance price provider-first via `binance-relay` (`prices` batch ticker). Bitpanda crypto/commodities via ticker public Bitpanda. Stocks Bitpanda via fallback Yahoo Finance + conversion USDÔåÆEUR.
- **S├®curit├®/UX** : aucun scam detector/report/explorer sur actifs CEX synth├®tiques (`SYMBOL:bucket`). Les symboles restent distincts, sans fusion `USDC/TUSD/USDT` ni `EUR/EURI/EURC`.

## 2026-06-12 ÔÇö Backup DB r├®par├® + cycle X + post scam flags (v16)

- **Backup DB local r├®par├®** : la t├óche planifi├®e `WCORE_DB_Backup` ├®chouait silencieusement depuis le 24/05 (`LastTaskResult: 2`) car `scripts/.env.backup` (gitignor├®) avait ├®t├® supprim├® lors d'un nettoyage de secrets. Fichier recr├®├® depuis `railway variables --service Postgres` (`DATABASE_PUBLIC_URL`, host `viaduct.proxy.rlwy.net`). Backup manuel + t├óche planifi├®e valid├®s (`LastTaskResult: 0`, rotation 7 jours OK). Gotcha document├® dans `AGENTS.md`.
- **Cycle X** : 10 requ├¬tes scann├®es, ~50 posts ├®valu├®s, 1 seule cible propre retenue. Reply publi├®e et v├®rifi├®e : `https://x.com/WCORExyz/status/2065302791514452042` (checklist anti-scam de `@nigredada`). Doublon `@Saimo0` d├®tect├® et ├®vit├®, shills cach├®s (useTria, FlutonIO, AI data) exclus.
- **Post X scam flags (v16)** : `https://x.com/WCORExyz/status/2065305153444405747` ÔÇö `Your total is lying.` Visuel `apps/web/public/wcore-post-scam-flags.svg/.png` (1200x675, DA v12) g├®n├®r├® par `scripts/build-post-scam-flags.cjs` : portfolio mock (total gonfl├® barr├® vs clean total), vrais logos TrustWallet ETH/USDC/OP embarqu├®s en base64, token scam ETHG en pastille anonyme, 4 cards signaux.
- **Tooling cycle X durable** : `scripts/x-cycle/` enrichi ÔÇö `scan-notifications.cjs`, `scan-search.cjs`, `verify-targets.cjs` (scan lecture seule + check doublons), `prepare-post.cjs` (draft complet texte+image dans Chrome CDP **sans publier**, retrait des attachments stale), `check-with-replies.cjs` (v├®rification post-publication). Tous portables (`__dirname`, fallback require Playwright).

## 2026-06-11 ÔÇö GM deploy resilience + cycle X 72 GM chains

- **GM deploy resilience** : les contrats GM d├®ploy├®s on-chain ne doivent plus ├¬tre perdus si le backend ou le receipt RPC lag apr├¿s la tx. `fetchDeployReceipt` retry c├┤t├® serveur, `useOnChainGm` retry en background c├┤t├® frontend, et `syncOnChainContracts()` devient le helper partag├® de self-heal pour `/api/gm/status` et `my-contracts`.
- **Contrats orphelins r├®conciliables** : events `ContractDeployed` retrouv├®s pour Merlin, Manta Pacific, Taiko Alethia, Plasma, HashKey, Hemi et HyperEVM. Gravity n'avait pas d'event d├®tectable lors du scan et doit ├¬tre red├®ploy├®e si elle reste absente c├┤t├® DB.
- **Post X 72 GM chains** : publication `https://x.com/WCORExyz/status/2065148361401917832`. Image `apps/web/public/wcore-post-gm-8-more-chains.png` + `.svg`, g├®n├®r├®e par `scripts/build-post-gm-8-more-chains.cjs`.
- **3 replies externes v├®rifi├®es** : r├®ponses publi├®es sur `@Saimo0`, `@0xToxo`, `@MacroBombastic`, puis confirm├®es dans chaque thread et sur `@WCORExyz/with_replies`. Cibles shill/concurrents ignor├®es, 0 like/follow/DM.
- **Repo hygiene** : `scripts/build-post-gm-8-new-chains.cjs` (g├®n├®rateur historique v15) rendu portable comme le g├®n├®rateur v16 : plus de chemin Windows hardcod├® vers Playwright ou la racine repo.

## 2026-06-11 ÔÇö 8 nouvelles GM factory chains (Gravity, Merlin, Manta Pacific, Taiko, Plasma, HashKey, Hemi, HyperEVM)

- **8 cha├«nes GM activ├®es** dans le m├¬me lot, portant le total ├á **72 GM chains live**. Toutes au build Shanghai standard (factory 1696 bytes / 61 PUSH0, impl 2237 bytes / 58 PUSH0) :
  - Gravity (1625, natif G), Merlin (4200, natif BTC, **pre-London** ÔåÆ gas legacy), Manta Pacific (169), Taiko Alethia (167000), Plasma (9745, natif XPL), HashKey (177, natif HSK), Hemi (43111), HyperEVM (999, natif HYPE).
- **Harmonisation 7 couches** : `GM_FACTORIES` (+ commentaires impl/tra├ºabilit├®), `GM_CHAIN_NAMES`, SOON auto-filtr├®, wagmi consts + chains[] + transports (7 nouvelles, mantaPacific existait), `EXPLORERS` (8 URLs v├®rifi├®es HEAD 200), `chain-data.ts` d├®j├á g├®n├®r├®.
- **V├®rifications** : tests de garde `gm-chains.test.ts` 2/2 + `wagmi-gm-chains.test.ts` 1/1, typecheck/lint/build verts, prod `/gm` affiche les 8 cha├«nes, API health JSON OK.
- **Note infra** : le service web Railway s'auto-d├®ploie depuis les pushes GitHub (railway.json committ├® pointe vers `apps/web/Dockerfile`) ÔÇö le deploy manuel web est devenu optionnel pour les changements web-only.

## 2026-06-11 ÔÇö Sprint audit P0/P1 scan/auth/lint

- **Auth prod durcie** : `AUTH_ALLOW_BEARER` est deny-by-default en production. Le Bearer token n'est accept├® en prod que si `AUTH_ALLOW_BEARER=true` est explicitement configur├® ; hors prod, le comportement dev reste actif sauf `false`.
- **Routes scan couvertes** : ajout de `apps/api/test/scan-plugin-routes.test.ts` (23 tests) pour `/api/scan/async` et `/api/scan/batch` : validation body/adresse/cha├«nes, circuit ouvert, lifecycle job async, ownership user/IP, cache hit vs `forceRefresh`, persistence historique fire-and-forget.
- **Bugs trouv├®s par les tests** : `/api/scan/async` propage maintenant `forceRefresh` aux engines ; `/api/scan/batch` retourne `400 invalid_address` au lieu d'un 500 sur adresse invalide.
- **Lint revenu vert** : correction TDZ `sendLogin` dans `ConnectButton`, nettoyage imports/vars inutiles, globals Node pour scripts contracts, chemins contracts portables via `__dirname`/`path.join`. `pnpm lint` est ├á 0 erreur / 0 warning.
- **Perf/cache** : cache scan lu via `mget`, `walletScan.create` rendu fire-and-forget, RealT registry Redis cap├® par TTL safety 7 jours.
- **Hygi├¿ne deps/docs** : d├®pendance morte `@fastify/rate-limit` retir├®e, `docs/AUDIT.md` et `ROADMAP.md` align├®s sur l'├®tat corrig├®.

## 2026-06-07 ÔÇö 8 GM factory chains live + audit transversal + cycle X (commits `5f739c3`, `7471a19`, `f69834b`, `d546305`, `76907c6`, `f27e1a7`, `24a57e5`, `0b8f4aa`, `e621bc4`, `4dbeb03`, `945f8f0`, `24a0085`, `fcb6ea8`)

### 8 GM factory chains activ├®es

- **Core DAO** (chainId 1116) ÔÇö commit `5f739c3`. Factory `0x4532a3d1...`, native CORE, RPC `rpc.coredao.org`. Standard build Shanghai (61 PUSH0, London EIP-1559). Inclut aussi le fix auth flow (double Sign In bounce + random logout).
- **Flare** (chainId 14) ÔÇö commit `7471a19`. Factory `0xbac99bdf...`, native FLR, RPC `flare-api.flare.network`.
- **X Layer** (chainId 196) ÔÇö commit `f69834b`. Factory `0x7d684eec...`, native OKB, RPC `rpc.xlayer.tech`.
- **Shibarium** (chainId 109) ÔÇö commit `d546305`. Factory `0x04e5d61b...`, native BONE, RPC `shibarium.drpc.org` (shibrpc.com DNS fail).
- **Degen** (chainId 666666666) ÔÇö commit `76907c6`. Factory `0xc3e5ef8c...`, native DEGEN, RPC `rpc.degen.tips`, baseFeePerGas ~12 gwei.
- **Beam** (chainId 4337) ÔÇö commit `f27e1a7`. Factory `0x972ccf14...`, native BEAM, RPC `build.onbeam.com` + `subnets.avax.network/beam`, baseFeePerGas ~1 gwei.
- **Ronin** (chainId 2020) ÔÇö commit `24a57e5`. Factory `0x65e19128...`, native RON, RPC `api.roninchain.com`, baseFeePerGas ~20 gwei.
- **opBNB** (chainId 204) ÔÇö commit `0b8f4aa`. Factory `0x92d7a478...`, native BNB, RPC `opbnb-mainnet-rpc.bnbchain.org` + 3 fallbacks, OP-Stack Bedrock EIP-1559.

**Impl size uniforme** : 2237 bytes (GmOnChain template unique) sur les 8 cha├«nes. **Build source unique d├®ploy├® 8 fois sans modification**.

### Fixes associ├®s

- **`apps/web/lib/explorers.ts`** (commit `e621bc4`) : `core: "https://scan.coredao.org"` ajout├®. Core avait l'entr├®e factories + wagmi + DeployClient mais pas l'explorer. V├®rifi├® HEAD 200 sur `https://scan.coredao.org/address/0x4532a3d1...` (le builder `getExplorerUrl` utilise `${base}/address/${contract}`).
- **Image v15 (commit `4dbeb03`)** : `apps/web/public/wcore-post-gm-8-new-chains.png` + `.svg` (1200x675) ÔÇö grille 4x2 avec les 8 nouvelles cha├«nes. Layout : WCORE badge top-left + "64 GM CHAINS LIVE" counter top-right, pills "8 NEW TODAY" (lime) / "Shanghai build" / "London EIP-1559", titre "8 more GM chains.", 4x2 grid, footer "wcore.xyz".
- **Image fixes v15 (commits `945f8f0`, `24a0085`)** : (1) fix chevauchement pills + counter dot (`AUTH_ALLOW_BEARER` sur "E" de "LIVE"), (2) shift des noms de cha├«nes vers la droite (x+100 ÔåÆ x+114, gap logoÔåÆlabel 2px ÔåÆ 16px).

### Cycle X 2026-06-07

- **Publication principale** (par toi, pas script) : `https://x.com/WCORExyz/status/2063579743736254824` (2026-06-07 11:12:05 UTC). Texte : "8 more GM chains went live on WCORE. Core. Flare. X Layer. Shibarium. Degen. Beam. Ronin. opBNB. Personal contracts. Creator fees. Chain streaks. 64 chains live now. Which chain do you want next? wcore.xyz"
- **Wobblhash repost** d├®tect├® (interne, pas d'engagement public).
- **2 replies externes authentiques** post├®es + v├®rifi├®es :
  - `nftbestart` (Mehdiweb3) sur l'angle AI + wallet read-only : "The read-only part is what makes or breaks it. An agent that signs for you is a different threat model than one that just reads your wallets and helps you see clearly. We have been building that angle at wcore.xyz. No signing, no custody, just one map across 180+ chains. Same shift you describe."
  - `alphacyl` (Alpha.rwa | Adi) sur MANTRA recap : "Good MANTRA recap. A read-only wallet view is useful for readers in this thread too. Track positions across Cosmos and the L2s without needing a custody step. We do that angle at wcore.xyz."
- **Script durable** (commit `fcb6ea8`) : `scripts/x-cycle/post-replies.cjs` avec `sanitize()` guard contre em-dash (incident : 1er post contenait un em-dash, supprim├® manuellement par l'utilisateur, puis re-post├® propre). `.gitignore` exception `!/scripts/x-cycle/` ajout├®e.

### Audit transversal

- **`docs/audit-2026-06-07-complet.md`** cr├®├®. Score global 8.6/10. 5 agents en parall├¿le (structure/code/s├®curit├®/perf/doc). 3 P0 + 7 P1 + 16 P2 + 11 P3 identifi├®s. P0 critiques : `AUTH_ALLOW_BEARER=true` d├®faut prod, `/api/gm/status-onchain` amplification RPC, `scan.ts` 612 LOC sans tests de route. Quick wins identifi├®s : retirer `@fastify/rate-limit` (mort), fire-and-forget `walletScan.create`, mget scan cache, memoize `AllTokensTable`/`TokenTable`, fix TDZ ConnectButton, cr├®er `.nvmrc`, split contracts/* paths hardcod├®s, cr├®er `docs/TROUBLESHOOTING.md`.

### V├®rifications

- 64 GM chains live au total (56 EVM + 4 SVM + 4 Cosmos + 1 TON apr├¿s cette session).
- Tests de garde GM : 8/8 verts apr├¿s chaque activation.
- API + Web d├®ploy├®s pour chaque cha├«ne.
- `wcore.xyz/gm` affiche les 8 nouvelles cha├«nes en section active, pas en "Coming Soon".
- 14 commits unpushed au moment de l'audit (work-in-flight transparent).

## 2026-06-06 ÔÇö GM score double-comptage guard (commit `fa17a10`)

- **Bug** : `rebuildChainStreakFromOnchain()` s'appuyait sur `OnchainGm @@unique([chainKey, txHash])` pour l'idempotence. Cette contrainte est case-sensitive en Postgres. Une row legacy `chainKey="base"` et une nouvelle row canonique `chainKey="BASE"` avec le m├¬me `txHash` ne collisionnaient donc pas, ce qui pouvait laisser le self-heal/backfill ins├®rer un doublon et cr├®diter le score deux fois.
- **Fix** : pre-fetch des `txHash` existants pour `(userId, chainKey)` au d├®but du rebuild, comparaison lowercased, skip des logs d├®j├á connus, et ajout du hash au set apr├¿s chaque insert r├®ussi. Le guard couvre ├á la fois les rows legacy lowercase et les doublons dans un m├¬me batch de logs.
- **Tests** : `gm-streak-rebuild.test.ts` couvre l'idempotence avec chainKey de casse diff├®rente et l'insert d'un vrai nouveau `txHash`. V├®rif session : `node --import ./set-test-env.js --import tsx --test --test-force-exit src/gamification/gm-streak-rebuild.test.ts src/gamification/gm-onchain-status.test.ts` = 5/5 verts. `pnpm --filter @wcore/api typecheck` OK.

## 2026-06-06 ÔÇö Token icon broken-image overlay (commit `e0bead8`)

- **Bug** : `TokenIcon` rendait TOUJOURS le cercle color├® de fallback (texte sur fond color├®) derri├¿re le `<img>`. Quand l'URL retournait 404 ÔÇö fr├®quent pour tout token absent de spothq/cryptocurrency-icons (SOMI, MON, tous les RealToken symbols sur Gnosis, la plupart des ERC-20 non-majeurs sur Base, HH, etc.) ÔÇö le navigateur affichait son ic├┤ne "image cass├®e" PAR-DESSUS le cercle color├®. C'est le "chevauchement de plusieurs infos" rapport├® par l'utilisateur.
- **Fix** : nouveau state `imageBroken`. Quand l'img d├®clenche `onError` (404) ou se charge avec `naturalWidth === 0` (SVG vide), `imageBroken` passe ├á `true` et le `<img>` n'est plus rendu. Seul le cercle color├® avec texte est visible (le fallback pr├®vu). Cascade `logoUrl ÔåÆ spothq ÔåÆ CMC ÔåÆ null` inchang├®e, seul le rendu de l'image cass├®e est corrig├®.
- **Bonus** : ajout d'overrides v├®rifi├®s pour les natives r├®centes (spothq pas ├á jour) :
  - `SOMI` (Somnia native) : `https://icons.llamao.fi/icons/chains/rsz_somnia.jpg` (200 OK) + CMC fallback UCID 37637 (200 OK).
  - `MON` (Monad native) : `https://icons.llamao.fi/icons/chains/rsz_monad.jpg` (200 OK) + CMC fallback UCID 30495 (200 OK).
- **Tests** : 2 nouveaux tests (override SOMI/MON + CMC fallback IDs). 83/89 verts ; 6 failures pr├®-existantes `ui.test.ts` (ECONNREFUSED, hors scope).
- **Deploy** : web red├®ploy├® (deployment ID `b81a861f-312c-4964-b362-221f1e1001f0`).

## 2026-06-06 ÔÇö FX rate fetch + GM contracts cross-user publication (commit `e2e72d1`)

- **`apps/web/components/PreferencesProvider.tsx`** : `fetch("/api/price/fx")` (URL relative cass├®e en dev/staging) remplac├® par `apiFetch("/api/price/fx", { signal: ctrl.signal })` + `r.ok` check + AbortController cleanup sur unmount. Le default `1.08` est conserv├® si l'API ├®choue. Source : audit P2 `2026-06-05-complet.md` C.2.
- **`apps/web/hooks/useGmContracts.ts`** : `publishContracts(key, contracts)` passe maintenant le `key` aux listeners. Chaque listener filter sur son propre `cacheKey` avant `setContracts(nextContracts)`. Emp├¬che une r├®ponse stale pour user A d'├®craser l'├®tat d'un hook subscribed pour user B (race condition cross-user). Source : audit P2 C.3.
- **Tests** : 81/87 verts. 6 failures pr├®-existantes dans `ui.test.ts` (ECONNREFUSED `127.0.0.1:4000`, hors scope de ce fix).
- **Deploy** : web red├®ploy├® avec `railway up --service web` (deployment ID `79d47d1b-81aa-4f38-b34e-73c2e5dfcfdd`). V├®rif prod : `wcore.xyz` 200, `/api/price/fx` retourne `{"eurUsd":1.164,"timestamp":...}`.

## 2026-06-06 ÔÇö X daily update v11 (KCC + Paris EVM build story)

- **Tweet publi├®** : https://x.com/WCORExyz/status/2063165356722524491 (status_id `2063165356722524491`, time `2026-06-06T07:45:27 UTC`). Texte user-facing : "KCC just got GM coverage on wcore.xyz. KCC is pre-Shanghai. No PUSH0. No EIP-1559. To ship it, WCORE now runs a custom Paris EVM build (solc 0.8.19, evmVersion=paris) alongside the default Shanghai build. Same ABI, different bytecode. The deploy selector picks the right one per chain. Pre-Shanghai chains get the same Say GM, the same streaks, the same creator fees as the rest. 56 GM factory chains. 4 VMs."
- **Image** : `apps/web/public/wcore-post-daily-update-11.png` + `.svg` (1200x675). DA valid├®e : fond sombre WCORE, hexagone + n┼ôuds + connexions logo top-left, "Today's WCORE update." top-right + subtitle "KCC GM is live. Pre-Shanghai. No skip.", grande carte gauche avec logo KCC + label "KCC Mainnet" + pills "Paris EVM build" / "solc 0.8.19" / "0 PUSH0", carte droite top "Pre-Shanghai chains" + carte droite bottom "56 GM factory chains", footer "Pre-Shanghai chains get the same coverage as the rest. KCC just shipped." + wcore.xyz.
- **Rendu** : Playwright avec `page.goto(file://...)` (pas `setContent`) pour que les `image href="chains/KCC.png"` relatifs r├®solvent correctement. Le `setContent` + base href ne fonctionne pas ├á cause des restrictions Chromium file://.

## 2026-06-05 ÔÇö KCC GM factory live (chainId 321, Paris EVM build, deploy `a18c112`)

### Frontend
- **`packages/shared/src/factories.ts`** : `kcc: { address: "0x76edb44d846b6378519aeed5c9ee2bcabcd2c15a", chainId: 321 }` ajout├®e ├á `GM_FACTORIES`. Commentaire en-tete cite les 2 tx hashes + block numbers + bytecode sizes pour tra├ºabilit├®.
- **`apps/web/lib/wagmi.ts`** : ajout de la cha├«ne `kcc: { id: 321, name: "KCC Mainnet", nativeCurrency: { name: "KCS", symbol: "KCS", decimals: 18 }, rpcUrls: [rpc-mainnet.kcc.network, kcc.drpc.org, kcc-rpc.com], blockExplorers: [scan.kcc.io] }` + entr├®e `[kcc.id]: http()` transport + `kcc` dans le tableau `chains[]`. `wagmi-gm-chains.test.ts` 1/1 vert (KCC 321 couvert).
- **`apps/web/app/gm/gm-chains.ts`** : `GM_CHAIN_NAMES.kcc = "KCC Mainnet"`. `gm-chains.test.ts` 2/2 verts (label pr├®sent, KCC n'appara├«t plus dans `SOON_CHAIN_CANDIDATES`).
- **Chain icon/native** : `apps/web/lib/chain-icon-manifest.json` ligne 50 = `/chains/KCC.png` ; `apps/web/lib/chain-native-symbols.json` ligne 59 = `"kcc":"KCS"`.

### Deploy (KCC mainnet, factory `0x76edb44d...`)
- **GmOnChain (impl)** : `0xd741c65517f883cd2b4c7cfbda3da110e8b41675` d├®ploy├® via `/dev/deploy` (Paris build, solc 0.8.19). Tx `0x71d2ca39496a925ba5c5947529eb1aedd59fa41a3eb248a50b100657cc0e79c7`, block `0x3256369` (52727373), bytecode 6246 chars, **0 PUSH0**.
- **GmFactory** : `0x76edb44d846b6378519aeed5c9ee2bcabcd2c15a` d├®ploy├® via `/dev/deploy` (Paris build, solc 0.8.19), constructor arg = address du GmOnChain. Tx `0x2a8a7ee971c531ab726fcdd6f13df7a6bcda651c067098c4b27966be0aa6c835`, block `0x324e581` (52727377), bytecode 3490 chars, **0 PUSH0**.

### D├®chets on-chain (orphelins, bytecode vide `eth_getCode = 0x`)
- **Factory abandonn├®e #1** : `0x9cc14b976a713d388636cd8736b291ff4be3a1c3` (block 52725852). Factory Paris OK mais implementation = ancien GmOnChain Shanghai PUSH0 reverted `0xf25ebed98426a4dc01e30a1e04ead7d3639579bd` (block 52716806). Ces 2 contracts sont vides et inutilisables, restent on-chain pour tra├ºabilit├®.
- **Factory abandonn├®e #0** : `0x83dde2e0a15417c3d206a9c74827ef5a15194632` (block 52716810, Paris OK + impl cass├®e).

### UX guard
- **`apps/web/app/dev/deploy/DeployClient.tsx`** useEffect (commit `35f0434`) : si `localStorage.gm_impl_${chainKey}` pointe vers une adresse valide et que `eth_getCode` retourne `0x` (contrat vide on-chain), auto-clear le localStorage, reset step "gm", et affiche un message d'erreur. Emp├¬che la re-saisie accidentelle d'un GmOnChain cass├® lors d'un nouveau deploy.

### V├®rifications prod
- `/api/chains` 200 retourne KCC `{key:"KCC", chainId:321, disabled:false, nativeSymbol:"KCS", rpcCount:3, explorerUrl:"https://explorer.kcc.io/en"}`.
- `/gm` page 200 contient "KCC Mainnet" et propose le flow Say GM complet.
- `https://wcore.xyz` derni├¿re deployment `c881c980-...` (commit `a18c112`).

## 2026-06-05 ÔÇö KCC GM factory fix : Paris EVM build (solc 0.8.19, no PUSH0)

### Diagnose
- **KCC mainnet est pre-London** : `baseFeePerGas` absent dans les blocks ÔåÆ EIP-1559 pas activ├® ÔåÆ KCC n'a jamais re├ºu la mise ├á jour Shanghai (PUSH0 opcode). Le bytecode actuel dans `apps/web/public/build.json` (compil├® avec solc 0.8.20+, default `evmVersion=shanghai`) contient 65 PUSH0 (4 dans le constructor + 61 dans le runtime).
- Le constructeur `0x60806040...5f5ffd5b` (PUSH0 utilis├® pour la valeur de retour `0`) ÔåÆ constructor revert silencieusement ├á l'ex├®cution ÔåÆ contrat d├®ploy├® vide (`eth_getCode = 0x`). Les 2 contrats d├®ploy├®s aujourd'hui sur KCC (`0x83dde2e0a15417c3d206a9c74827ef5a15194632` factory et `0xf25ebed98426a4dc01e30a1e04ead7d3639579bd` GmOnChain) sont inutilisables.

### Frontend Deploy
- **Build Paris EVM s├®par├® (solc 0.8.19, `evmVersion=paris`)** : `apps/web/public/build.json` re├ºoit 2 nouvelles entr├®es `GmOnChainParis` et `GmFactoryParis`, compil├®es avec solc 0.8.19 (default Paris). V├®rifi├® 0 PUSH0 dans constructor ET runtime pour les 2 contrats via parsing instruction-aware (track PUSH1-PUSH32 immediates).
- **`build-selector.ts`** : nouveau module pur exporte `pickBuild(build, chainKey, contract)`. Renvoie Paris pour les cha├«nes list├®es dans `PARIS_BUILD_CHAINS` (initialement `KCC`), default sinon. Lance une erreur explicite si le Paris build manque pour une cha├«ne list├®e.
- **`DeployClient.tsx`** : utilise `pickBuild()` dans `deployGmOnChain()` et `deployFactory()`. Affiche un indicateur jaune "Paris EVM build (solc 0.8.19) ÔÇö pre-Shanghai chain without PUSH0 opcode" quand la cha├«ne cibl├®e est dans `PARIS_BUILD_CHAINS`. `BuildOutput` interface ├®tendue pour accepter `GmOnChainParis?` / `GmFactoryParis?`.
- **Tests** : `build-selector.test.ts` (7 tests) couvre default/Paris/caseless/manquant, `build-json-paris.test.ts` (2 tests) lit `build.json` au runtime et v├®rifie 0 PUSH0 dans constructor+runtime pour les 2 entr├®es Paris.

### Infra
- **`contracts/compile-v0.8.19.js`** : script Node.js qui t├®l├®charge/utilise solc 0.8.19 (npm `solc@0.8.19` ajout├® en devDependency), compile les sources avec `evmVersion=paris`, ├®crit `GmOnChain.v0819.json` et `GmFactory.v0819.json` dans `contracts/`. Le script relaxe temporairement la pragma `^0.8.20` ÔåÆ `^0.8.19` dans un dossier `tmp-paris/` pour la compilation, puis nettoie.
- **`contracts/patch-build-json.js`** : patche `apps/web/public/build.json` pour ajouter/remplacer les entr├®es `*Paris` ├á partir des artefacts `.v0819.json`. R├®utilise l'ABI existant (identique entre Paris et Shanghai). Idempotent.
- **`.gitignore`** : `contracts/*.compiled.json`, `contracts/*.v0819.json`, `contracts/input-paris.json`, `contracts/output-paris.json` ajout├®s (artefacts r├®g├®n├®rables). `contracts/compile-v0.8.19.js` et `contracts/patch-build-json.js` sont track├®s (sources du pipeline).
- **`solc@0.8.19`** ajout├® en `devDependencies` (n├®cessaire au script de reg├®n├®ration).

### Action utilisateur requise
- **Deploy les 2 contrats Paris via `/dev/deploy` sur KCC** : le dropdown "Target Chain" ÔåÆ KCC affiche maintenant l'indicateur Paris. ├ëtape 1 "Deploy GmOnChain" et ├ëtape 2 "Deploy GmFactory" utilisent automatiquement le bytecode Paris (PUSH0-free).
- Une fois d├®ploy├®s, ajouter les 2 adresses dans `packages/shared/src/factories.ts` :
  ```ts
  kcc: { address: "<NOUVELLE_FACTORY>", chainId: 321, implementation: "<NOUVELLE_GM_ON_CHAIN>" }
  ```
- Les anciennes adresses cass├®es (`0x83dde2e0a15417c3d206a9c74827ef5a15194632` et `0xf25ebed98426a4dc01e30a1e04ead7d3639579bd`) peuvent rester on-chain comme d├®chets (elles n'ont pas de code de toute fa├ºon).

### V├®rification
- 24 tests `node --test` verts dans `apps/web/app/dev/deploy/` (9 chain-switch + 6 chain-params + 7 build-selector + 2 build-json-paris).
- `npx tsc --noEmit --project apps/web/tsconfig.json` propre.
- `npx next build` compile `/dev/deploy` sans erreur.

## 2026-06-05 ÔÇö /dev/deploy wallet_switchEthereumChain 4902 fallback

### Frontend Deploy

- **`/dev/deploy` chain switch fix (v3, post-prod-feedback)** : la v2 (pas de retry switch apr├¿s add) a r├®duit l'erreur "Unrecognized chain ID 0x141" sur KCC pour la plupart des wallets, mais reste fragile face aux quirks par-wallet (certain wallets wrappent le code dans `data.originalError.code`, d'autres utilisent un string code `"4902"`, d'autres encore throw un code inconnu). Helper durcie dans `chain-switch.ts` : `getErrorCode(e)` lit `e.code` (number ou string), `e.data?.originalError?.code` (pattern wagmi), et fallbacks. Pour les codes **autres que 4001 (user reject)** et **4902 (chain not in wallet)**, on tente quand m├¬me `wallet_addEthereumChain` en fallback (certains wallets throw -32000/-32603 sur des chains qu'ils ne connaissent pas). 9 tests `chain-switch.test.ts` : chain connue (1 appel), 4902 + add (2 appels, no retry), 4902 string, 4902 nested `data.originalError.code`, unknown code + add OK (fallback), unknown code + add fail (re-throw original), 4001 user reject (pas d'add), chain pas dans notre liste (erreur claire), pas de window.ethereum. Meta tag `wcore-deploy` bump├® ├á `v0.2.36-deploy-switch-no-retry-2026-06-05` pour que l'utilisateur puisse v├®rifier qu'il a bien le nouveau bundle.

### Repo hygiene

- **Script generator** : `scripts/extract-deploy-chain-data.mjs` reg├®n├¿re `chain-data.ts` depuis `packages/core/src/chains/*.ts`. ├Ç lancer quand une cha├«ne change de RPC ou de native currency.
- **Inline chain data conforme au gotcha** : AGENTS.md documente que Turbopack ne r├®sout pas `.js` ÔåÆ `.ts` dans les workspace packages, m├¬me avec `transpilePackages`. La solution officielle est de dupliquer la constante inline (et non importer `@wcore/core` au runtime depuis le frontend web). 112 cha├«nes dupliqu├®es.

### V├®rification

- Tests : `chain-params.test.ts` 6/6 (KCC 321ÔåÆ`0x141`, BASE 8453ÔåÆ`0x2105`, Moonbeam 1284ÔåÆGLMR, PulseChain 369ÔåÆPLS, unknownÔåÆnull). Typecheck 5/5. Build clean. Commit `7280c94` + `5908651`.

## 2026-06-05 ÔÇö PulseChain GM factory live + /gm load + Deploy latency wins

### GM factories (nouvelles cha├«nes)

- **PulseChain factory activ├®e** (chainId 369) : factory `0x245cb609aaff4b375ad3c60a4d2397a6963892c3`. Entr├®e ajout├®e ├á `packages/shared/src/factories.ts`, label `PulseChain` ajout├® ├á `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retir├® de `SOON_CHAIN_CANDIDATES`, cha├«ne `pulsechain` (3 RPCs : `rpc.pulsechain.com`, `pulsechain-rpc.publicnode.com`, `rpc-pulsechain.g4mm4.io`) ajout├®e ├á `wagmi.ts` avec transport http(). `eth_chainId = 0x171` v├®rifi├® en prod. `PULSECHAIN.webp` d├®j├á track├® dans `chain-icon-manifest.json`. Commit `9057ca2`.

### Frontend GM (latence)

- **Cards visibles imm├®diatement** : supprim├® la gate `!statusLoaded` dans `GmPageClient` qui rendait un spinner plein ├®cran pendant ~500ms. Les cards montent d├®sormais avec les defaults `lsGmDone` et se raffinent quand `/api/gm/status` arrive. Chaque card garde un spinner per-card sur le bouton (d├®j├á l├á). Commit `059f603`.
- **Deploy instantan├®** : `useGmChain.handleDeploy` n'attend plus `await checkHasDeployed()` (~500ms HTTP avant que MetaMask s'ouvre). On trust `lsContractDeployed` + le `/api/gm/status` d├®j├á charg├® ; le factory revert proprement si duplicate. `GmPageClient` pre-warm `/api/price/native?chain=X` pour toutes les GM chains en parall├¿le au mount et passe la map ├á `useOnChainGm` qui l'utilise en sync dans `deployContract`/`sendGm` (skip la ladder 3-retry ~500-1500ms). Commit `059f603`.

## 2026-06-05 ÔÇö Boba + Metis GM factory live + Say GM flicker fix + /gm fan-out stop

### GM factories (nouvelles cha├«nes)

- **Boba factory activ├®e** (chainId 288) : factory `0xced8cacde0ea15adf489f6fca9ed65dff2fb1efe`. Entr├®e ajout├®e ├á `packages/shared/src/factories.ts`, label `Boba` ajout├® ├á `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retir├® de `SOON_CHAIN_CANDIDATES`, cha├«ne `boba` (3 RPCs : `mainnet.boba.network`, `1rpc.io/boba/eth`, `gateway.tenderly.co/public/boba-ethereum`) ajout├®e ├á `wagmi.ts` avec transport http(). `eth_chainId = 0x120` v├®rifi├® en prod. RPC `boba-ethereum.drpc.org` dropp├® du config `@wcore/core` (404). `BOBA.png` d├®j├á track├® dans `chain-icon-manifest.json`. Commit `2f8ff4e`.
- **Metis factory activ├®e** (chainId 1088) : factory `0x493d13b68fcaf08a5036b185c29a08f22046cf0e`. Entr├®e ajout├®e ├á `packages/shared/src/factories.ts`, label `Metis` ajout├® ├á `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retir├® de `SOON_CHAIN_CANDIDATES`, cha├«ne `metis` (3 RPCs : `andromeda.metis.io/?owner=1088`, `metis-rpc.publicnode.com`, `metis.drpc.org`) ajout├®e ├á `wagmi.ts` avec transport http(). `eth_chainId = 0x440` v├®rifi├® en prod. Commit `347b072`.

- **Metis factory activ├®e** (chainId 1088) : factory `0x493d13b68fcaf08a5036b185c29a08f22046cf0e`. Entr├®e ajout├®e ├á `packages/shared/src/factories.ts`, label `Metis` ajout├® ├á `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retir├® de `SOON_CHAIN_CANDIDATES`, cha├«ne `metis` (3 RPCs : `andromeda.metis.io/?owner=1088`, `metis-rpc.publicnode.com`, `metis.drpc.org`) ajout├®e ├á `wagmi.ts` avec transport http(). `eth_chainId = 0x440` v├®rifi├® en prod. Commit `347b072`.

### Frontend GM

- **Say GM flicker fix** : `useOnChainGm.sendGm` attendait `lsSetGmDone` + dispatchait `wcore-gm-done` d├¿s la signature MetaMask (txHash, pas mining). Le handler `wcore-gm-done` dans `useGmChain` appelait `checkStatus()` qui lisait `/api/gm/status` avant que `recordGmBackend` n'ait persist├® (fire-and-forget) ÔåÆ override ├á `gmDone:false` ÔåÆ re-flippe "Say GM". Nouvelle helper `waitForGmReceipt(txHash, ethereum, 60_000)` poll `eth_getTransactionReceipt` ├ù 30 ├ù 2s = 60s, throw sur `status === 0x0` (reverted) ou timeout. `sendGm` await le receipt avant `lsSetGmDone` + dispatch. Handler `wcore-gm-done` n'appelle plus `checkStatus()`. Boutons `ChainCard` et `GmPageClient` exposent `title`/`aria-label` "Waiting for on-chain confirmationÔÇª" pendant `sending=true`.
- **/gm fan-out stop pour users sans contrat** : quand `/api/gm/status` retournait `{}`, `GmPageClient` mettait `deployed: null` sur les 6 cha├«nes ÔåÆ 6 `/api/gm/has-deployed` parall├¿les ÔåÆ `gm_read` rate limit ÔåÆ 429 sur le header. Nouvelle helper `buildChainStatusesFromApi(data, chainKeys, lsGmDoneLookup)` dans `apps/web/lib/gm-status-reconcile.ts` traite `{}` comme `deployed:false` d├®finitif (pas de per-card fetch) et `null` (erreur r├®seau) comme `deployed:null` (per-card fetch peut r├®cup├®rer). Tests `gm-status-reconcile.test.ts` (5/5). Commit `3a701e0`.

### V├®rification

- API + Web Railway d├®ploy├®s. `/api/chains` 200 (41.7 KB), `/api/price/native?chain=boba` 200 (1547.6 USD via DefiLlama), `/api/price/native?chain=metis` 200 (2.47 USD via DefiLlama), `/api/gm/status` 401 sans auth (P1-1 confirm├® prod), `/gm` 200 avec Boba + Metis + Astar + Aurora pr├®sents.
- Tests : gm-chains 2/2, wagmi-gm-chains 1/1, gm-status-reconcile 5/5. Typecheck monorepo 5/5.

## 2026-06-05 ÔÇö Audit P0/P1 r├®solus : forceRefresh, scan/cache, GM, deploy

### Scan / cache

- **P0-1 forceRefresh propag├®** : `getEngineCacheForScan(forceRefresh, vm, cache)` wrappe le cache pour bypasser les pr├®fixes `empty:*` et `bal_cache:*` quand `forceRefresh=true`. Le wrapper d├®l├¿gue les writes/reads/deletes au cache original. Propagation dans les 3 call sites de `apps/api/src/plugins/scan.ts` (sync scan, EVM batch, non-EVM batch). Tests `scan-cache-policy.test.ts` (15/15) + `scan.test.ts` (26/26). Commit `80ea1ff`.
- **P0-2 empty cache bypass EVM/SVM** : `evm-scan.ts:125` et `svm.ts:102` retournent `emptyCacheKey = undefined` quand `opts.forceRefresh === true`. Liveness check SVM `quickSvmLivenessCheck` d├®tecte activit├® native avant de servir le cache. Tests SVM `forceRefresh bypasses the empty cache for a fresh re-scan` ajout├®s. Commit `4d654b1` (le bypass prod et le test EVM ├®taient d├®j├á dans `6b6c5dd`/v0.2.30).

### API s├®curit├®

- **P1-1 `/api/gm/status-onchain` durci** : auth requise (401 sans `req.user`), validation `EvmAddress` Zod stricte (400 sur query invalide), check `address === req.user.address` (403 sur mismatch, bypass admin via `isAdminAuthorized`). Tests `gm-onchain-status.test.ts` (3/3). Commit `8b34385`.
- **P1-2 rate-limit post-auth** : `registerPostAuthRateLimit(app, deps)` extrait dans `server-helpers.ts`, appel├® APR├êS `authPlugin` pour que `req.user` soit popul├®. CSRF check reste dans le hook `onRequest` d'origine. Tests `rate-limit-hook-order.test.ts` (5/5). Commit `77a8408`.
- **P1-3 AbortController sur timeouts** : helper `runWithTimeout(factory, ms)` dans `scan-utils.ts` cr├®e un `AbortController` par cha├«ne, l'abort() AVANT le reject. 4 call sites de `scan.ts` (sync, EVM batch, non-EVM batch, async) utilisent le helper. `DispatchOptions.signal?: AbortSignal` ajout├®. Tests `scan-timeout.test.ts` (5/5). Commit `2b0feaf`.

### Deploy

- **P1-4 `deploy.ps1` exit code** : capture `$LASTEXITCODE` apr├¿s `railway up`, restoration de `railway.json` + lock cleanup en `finally`, puis `exit $deployExitCode` si != 0. Test process-based `scripts/deploy-ps1.test.ps1` (3/3) qui mock `railway.cmd` dans PATH temporaire. Commit `cc67375`.

### Frontend

- **P1-5 ChainCard contract-aware scam** : nouveau module `apps/web/lib/scam-overrides.ts` avec helpers purs (`isSymbolBlocked`, `isContractBlocked`, `isSymbolApproved`, `isContractApproved`, `applyScamOverrides`, `readScamOverrides`, `writeScamOverride`, `buildScamEntry`). `ChainCard.tsx` lit les entries contract-aware et exclut les tokens bloqu├®s par contrat du `cleanTotal`. `TokenTable.tsx` utilise les write helpers partag├®s. Tests `scam-overrides.test.ts` (21/21). Commit `936e963`.

### Audit doc

- `docs/audit-2026-06-05-complet.md` : source d'├®tat courant pour P0/P1/P2/P3. `ROADMAP.md` mis ├á jour pour marquer P0/P1 comme r├®solus avec liens vers les commits.
- Plan d'ex├®cution : `docs/superpowers/plans/2026-06-05-audit-fixes-p0-p1.md`.

## 2026-06-05 ÔÇö Audit global enregistr├® + docs align├®es

- **Audit courant** : ajout de `docs/audit-2026-06-05-complet.md` (s├®curit├®/API, core scan/pricing/RPC/cache, frontend/UX, CI/deploy/docs). Les P0 ouverts sont `forceRefresh` non propag├® aux engines et empty cache token-only.
- **Roadmap** : `ROADMAP.md` pointe maintenant vers l'audit 2026-06-05 comme source d'├®tat courant et r├®ouvre explicitement le sujet `forceRefresh` au lieu de le pr├®senter comme enti├¿rement corrig├®.
- **Deploy docs** : `DEPLOY.md` marque le chemin Docker Compose comme legacy/self-hosted, corrige le compteur `116+ chains`, et retire l'affirmation incorrecte selon laquelle `forceRefresh=true` d├®sactive toujours les caches engine.
- **Docs CM** : `docs/superpowers/specs/CM-STRATEGY.md` remplace les mentions publiques `116+ chains` par `170+ live chains`.

## 2026-06-04 ÔÇö GM Moonbeam/Moonriver finalis├® + API Docker anti-timeout

- **GM Moonbeam/Moonriver finalis├®** : `/gm` affiche Moonbeam et Moonriver comme cha├«nes actives, avec `Ô£à GM Done` apr├¿s GM on-chain et les cartes `Fees Earned`/`Fees Platform`. Tests de garde : `gm-chains.test.ts`, `wagmi-gm-chains.test.ts`, `gm-storage.test.ts`, `gm-onchain-status.test.ts`.
- **GM status-onchain robuste** : `/api/gm/status-onchain` respecte d├®sormais `RPC.MAX_LOG_RANGE` pour scanner les events `GmCheckedIn`. Cause racine Moonriver : l'endpoint officiel rejette les ranges 10k (`-32603 block range is too wide`, max 1024), donc le bouton restait `Say GM` malgr├® une tx confirm├®e.
- **GM deploy recovery** : `/api/gm/status` r├®cup├¿re les contrats GM d├®j├á d├®ploy├®s on-chain quand le POST de registration a ├®chou├® ou quand la DB est stale. Le scan utilise `fetchOnChainContracts()` avec chunking par cha├«ne.
- **API Dockerfile** : suppression de `RUN chown -R node:node /app` dans le runner stage. Chaque `COPY` runner utilise maintenant `--chown=node:node`, ce qui ├®vite le timeout Railway de ~15 min sur `node_modules` quand le cache Docker est absent.
- **Comms X** : post daily update publi├® `https://x.com/WCORExyz/status/2062634948259885209`. Assets : `apps/web/public/wcore-post-daily-update-10.svg` + `.png` (1200x675), angle `Moonbeam + Moonriver GM is live`, wording `170+ live` v├®rifi├® (174 cha├«nes enabled / 182 registry).

## 2026-06-03 ÔÇö TON support + wcore.xyz restaur├® + Connect Wallet/GM hardening

- **GM Moonbeam activ├®** : factory `0x3fa756f1da5027a8ff692b2d65dface8eb446aaf` ajout├®e dans `packages/shared/src/factories.ts` avec chainId `1284`. Wagmi ├®tendu (cha├«ne + transport), test de garde `wagmi-gm-chains.test.ts` qui emp├¬che toute cha├«ne GM absente du wagmi config. Build + deploy Web v├®rifi├®.
- **GM Moonriver activ├®** : factory `0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1` ajout├®e dans `packages/shared/src/factories.ts` avec chainId `1285`. Wagmi ├®tendu, `/gm` affiche Moonriver ├á c├┤t├® de Moonbeam.
- **TON / The Open Network** : nouvelle VM support├®e (`vm: "TON"`, 9 decimals, jettons via TonAPI avec Toncenter fallback). `packages/core/src/engines/ton.ts` (engine standalone), 5 tests core pass. TON chain ajout├® ├á `packages/core/src/chains/TON.ts` + `chains/index.ts` + `chainList`. D├®tection wallet partag├®e : regex `(EQ|UQ|Ef|Uf)[A-Za-z0-9_-]{40,60}` + raw `-1:hex64`. UI : ic├┤ne ­ƒîè, VmBadge cyan, ChainSelector, HomePageClient placeholder, default chains. 170+ live chains (EVM 168, SVM 2, Cosmos 11, TON 1).
- **Comms X TON** : post publi├® `https://x.com/WCORExyz/status/2062515586609955222`. Assets : `apps/web/public/wcore-post-ton.svg` + `.png` (1200x675, vrai logo TON, wording `Toncoin and TON tokens`).
- **Domaine** : `wcore.xyz` de nouveau op├®rationnel en HTTPS sur Railway. Le SIWE nonce utilise maintenant l'origin requ├¬te correspondant (`wcore.xyz`) au lieu du premier `CORS_ORIGIN`.
- **Connect Wallet** : WalletConnect QR fallback reste disponible avec un `projectId` par d├®faut si l'env est vide. Le connecteur wagmi `injected()` est retir├® du config statique pour ├®viter le crash Turbopack `ReferenceError: injected is not defined` en conflit MetaMask/Zerion.
- **EIP-6963** : ajout d'un picker robuste. Les providers annonc├®s sont connect├®s en direct (`eth_requestAccounts` + `personal_sign`) sans d├®pendre de `window.ethereum` global.
- **GM `/gm`** : `deployed:null` signifie d├®sormais statut inconnu et d├®clenche un check cibl├®. Un status global vide ne force plus `Deploy GM Contract` sur toutes les cha├«nes.
- **GM Header** : apr├¿s un GM on-chain, le Header reste d├®sactiv├® localement pendant que le backend fire-and-forget persiste la tx. Le GM on-chain d├®sactive aussi le bouton Off-chain (`Done today`).
- **Comms X** : post `WCORE is back on wcore.xyz` publi├® (`2062228120476725406`) avec visuel `wcore-post-site-back.svg/.png`.
- **Docs** : ajout d'une note de r├®conciliation `wcore-gsheet` ÔåÆ `wcore-web` (`docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md`). Les changements Apps Script r├®cents ne doivent pas ├¬tre merg├®s automatiquement ; ils sont class├®s par portabilit├®.
- **Harmonisation RPC** : audit live de 170 cha├«nes via `scripts/audit-rpcs.mjs` (8 dead, 19 single, 54 half-dead). Nouveau module `chain-health.ts` (classification). 8 cha├«nes d├®sactiv├®es via `FLAGS.DISABLE_CHAIN=true` pour ne plus consommer du quota scan. Note `docs/rpc-harmonization-2026-06-03.md` matrice 11 couches.
- **Validation** : typecheck core/API OK, build API OK, 200/200 tests core OK (5 nouveaux tests TON).

## 2026-06-03 ÔÇö wcore.xyz restaur├® + Connect Wallet/GM hardening

- **Domaine** : `wcore.xyz` de nouveau op├®rationnel en HTTPS sur Railway. Le SIWE nonce utilise maintenant l'origin requ├¬te correspondant (`wcore.xyz`) au lieu du premier `CORS_ORIGIN`.
- **Connect Wallet** : WalletConnect QR fallback reste disponible avec un `projectId` par d├®faut si l'env est vide. Le connecteur wagmi `injected()` est retir├® du config statique pour ├®viter le crash Turbopack `ReferenceError: injected is not defined` en conflit MetaMask/Zerion.
- **EIP-6963** : ajout d'un picker robuste. Les providers annonc├®s sont connect├®s en direct (`eth_requestAccounts` + `personal_sign`) sans d├®pendre de `window.ethereum` global.
- **GM `/gm`** : `deployed:null` signifie d├®sormais statut inconnu et d├®clenche un check cibl├®. Un status global vide ne force plus `Deploy GM Contract` sur toutes les cha├«nes.
- **GM Header** : apr├¿s un GM on-chain, le Header reste d├®sactiv├® localement pendant que le backend fire-and-forget persiste la tx. Le GM on-chain d├®sactive aussi le bouton Off-chain (`Done today`).
- **Comms X** : post `WCORE is back on wcore.xyz` publi├® (`2062228120476725406`) avec visuel `wcore-post-site-back.svg/.png`.
- **Docs** : ajout d'une note de r├®conciliation `wcore-gsheet` ÔåÆ `wcore-web` (`docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md`). Les changements Apps Script r├®cents ne doivent pas ├¬tre merg├®s automatiquement ; ils sont class├®s par portabilit├®.
- **Harmonisation RPC** : audit live de 170 cha├«nes via `scripts/audit-rpcs.mjs` (8 dead, 19 single, 54 half-dead). Nouveau module `chain-health.ts` (classification). 8 cha├«nes d├®sactiv├®es via `FLAGS.DISABLE_CHAIN=true` pour ne plus consommer du quota scan. Note `docs/rpc-harmonization-2026-06-03.md` matrice 11 couches.
- **Validation** : typecheck core/API OK, build API OK, 195/195 tests core OK.

## 2026-05-30 ÔÇö Corrections audit (batch 2 : Core-2 + FE-3)

- **Core-2** (donn├®es) : `resolveCosmosTokenDecimals` ne suppose plus 6 d├®cimales pour les denoms non-`ibc/` inconnus. Seuls les micro-denoms standard (`^u[a-z]+$`) gardent 6 ; les denoms non-standard (`factory/`, `erc20/`, `cw20:`, etc.) absents de `DENOM_DECIMALS` sont skipp├®s (`decimals_unknown`) au lieu d'├¬tre mal valoris├®s (risque 10^12 d'├®cart). Test ajout├® (188 core pass).
- **FE-3** (UX/perf) : le bouton "refresh ce wallet" ne force plus un cache-bypass (= fan-out RPC max) sur TOUS les wallets. `refreshWallet(addr)` scope le force-refresh ├á l'adresse cibl├®e ; les autres wallets re-scannent depuis le cache. `forceRefreshAddrsRef` + split force/cache groups dans le batch scan.

## 2026-05-30 ÔÇö Corrections audit (P1 batch 1)

- **API-2** (s├®curit├®) : `/api/gm/onchain` exige `receipt.from === req.user.address`. Emp├¬che un contrat enregistr├® malveillant de cr├®diter un GM + tip pour autrui via event forg├®. Test ajout├®.
- **Core-1** : `RpcHealthTracker` decay par-endpoint ÔÇö un endpoint avec ├®checs p├®rim├®s (`lastSeen > ttl`) redevient ├®ligible. ├ëvite le r├®tr├®cissement permanent du pool RPC sur une session. Test ajout├® (187 core pass).
- **FE-1** : `ChainCard` n'engage `useGmChain` que si `isCurrentWallet && FACTORIES[chain]` ÔÇö supprime le fan-out 2├ùN `gm_read` qui 429ait le header GM.
- **FE-2** : `WalletContent` merge des prev-results d├®plac├® render ÔåÆ `useEffect` (`mergePrevResults` m├®mo├»s├®). Plus de mutation de ref au render (React 18 concurrent-safe).
- **INFRA-1** : `pnpm test` racine inclut maintenant `@wcore/web` ; nouveau `test:api` s├®par├® (DB).
- **INFRA-2** : `solc` (dead dep) retir├® + override `tmp` supprim├® ÔåÆ `pnpm audit --prod` toujours 0 vuln. `@types/bs58` phantom retir├® (bs58 v6 ship ses types).
- **Docs** : `.env.example` ajoute `JWT_SECRET` + `RATE_LIMIT_GM_READ`.
- **Diff├®r├®s** : API-1 (GM score double-count, besoin tests DB idempotence), FE-3 (force-refresh cibl├®, UX).

## 2026-05-30 ÔÇö Audit transversal lecture seule

- Audit parall├¿le 4 domaines (API s├®curit├®, core scan/pricing, frontend React/perf, infra/config/deps) post-v0.2.37. Doc : `docs/audit-2026-05-30-complet.md`.
- **8 findings P1** identifi├®s (r├®els, non corrig├®s) : API-1 (GM score double-count), API-2 (GM `receipt.from` binding), Core-1 (RpcHealthTracker sans decay), FE-1 (ChainCard fan-out GM), FE-2 (mutation ref au render), FE-3 (force-refresh non cibl├®), INFRA-1 (`pnpm test` incomplet), INFRA-2 (`solc` dead dep).
- **~16 findings P2/P3** (perf render, deps, dockerfile, env, decimals Cosmos non-ibc, EUR stables).
- Nombreuses zones v├®rifi├®es **propres** : auth/CSRF/admin/SQL/IDOR/SSRF, consensus zero protection, decimals override, FX direction, Docker non-root, `@tanstack/react-query` (pas dead), ConnectButton/NotificationsBell/GmContext.
- `ROADMAP.md` pointe vers ce nouvel audit ; `docs/audit-2026-05-29-complet.md` passe en historique.

## 2026-05-29 ÔÇö Audit H4/H7/H8 + GM fixes + chain icons (v0.2.37)

### H4 ÔÇö Split monsters files
- **`evm.ts`** (1498 l.) ÔåÆ 5 modules : `evm-types.ts`, `evm-balances.ts`, `evm-pricing.ts`, `evm-scan.ts`, `evm-batch.ts` + barrel `evm.ts` (42 l.). Zero changement API. 186 tests core OK.
- **`WalletContent.tsx`** (1231 l.) ÔåÆ ~487 l. + hooks (`useScanOrchestrator`, `useWalletLabels`) + composants (`PostScanBanner`, `ScanProgressBanner`, `PortfolioSummaryCard`, `WalletSelector`, `AllTokensTable`) + utilitaire `scan-api.ts`.
- **Gotcha** : `pnpm typecheck` (tsc) ne couvre PAS `next build`. 3 erreurs (TokenTable collision, `chains: unknown[]`, `secondaryLabel?: string` vs `null`) n'ont ├®t├® vues que par `next build` ÔåÆ 2 deploy web ├®chou├®s. Le├ºon document├®e. Corrig├® : `AllTokensTable` renomm├®, `TokenTable` original restaur├®, types align├®s.

### H7 ÔÇö Nettoyage console.log debug
- 3 logs supprim├®s : 2 dans `ConnectButton.tsx` ([ConnectButton] nonce/login response), 1 dans `gm-contracts.ts` ([gm-balance-debug]).
- Audit complet : 52 `console.*` analys├®s, tous les autres gard├®s (error logs intentionnels, monitoring prod, instrumentation scan).

### H8 ÔÇö Casts `as any`
- Audit complet : 17 `as any` identifi├®s dans apps/web + packages/core.
- 3 corrig├®s : `window.ethereum` type global + `fetchNativePrice` param├®tr├® + chain key normalization.
- 1 truly n├®cessaire (wagmi connector list sur 80+ cha├«nes). Le reste document├® pour session d├®di├®e.

### Scan scheduler ÔÇö pool unique prioris├®e
- Remplace la s├®rialisation non-EVM ÔåÆ EVM (244s) par une pool unique avec SVM/Cosmos prioritaires.
- `orderScanJobsForExecution()` dans `scan-results.ts`. Test unitaire de garde ajout├®.

### GM rate_limited header ÔÇö fix fan-out per-card
- **Racine** : ~30 cartes sur `/gm`, chacune fetchant `/api/gm/has-deployed` + `/api/gm/status` (m├¬me endpoint global) ÔåÆ 90 appels `gm_read` ÔåÆ `GET /api/gm/random` en 429.
- **Fix** : `gmStatusFetchPlan(initialStatus)` ÔÇö la carte ne refait plus le fetch global quand `initialStatus` est fourni par la page. Test : 4 nouveaux cas.
- **Defense-in-depth** : `RATE_LIMIT_GM_READ` (d├®faut 300, env override), ind├®pendant de `RATE_LIMIT_AUTH`.

### GM native price "undefined"
- **Racine** : `fetchNativePrice()` lisait `config.chainKey` (undefined pour le header GM random multi-cha├«ne).
- **Fix** : `fetchNativePrice(chainKey)` param├®tr├®. Header passe le chainKey r├®solu par `getRandomContract()`.

### INCENTIV phantom chain removed
- INCENTIV n'existe que comme testnet (16350), banni par "no testnets in WCORE". Le chainId 24101 r├®f├®renc├® ├®tait fant├┤me (RPC mort, absent chainid.network).
- Retir├® de `wagmi.ts`, `DeployClient.tsx`, `GmPageClient.tsx`, `chain-icon-manifest.json`, `chain-native-symbols.json`, asset SVG supprim├®.

### Chain icons ÔÇö 3 passes
- **Pass 1** : 3 `.ico` cass├®s (AEVO, PLAYNANCE_PLAYBLOCK, SHIDO_NETWORK) ÔåÆ PNG valides.
- **Pass 2** : 13 placeholders `?` (NEXUS, STEP_NETWORK, ETHO_PROTOCOL, etc.) ÔåÆ vrais logos ou fallback propre.
- **Pass 3** : 5 emoji (ETHO_PROTOCOL, EDGELESS, LAYERAI, AVES_NETWORK, AWAJI) ÔåÆ logos v├®rifi├®s.
- Test de garde : `chain-icons.test.ts` (refuse placeholders, valide les assets pr├®c├®demment cass├®s).

### D├®ploiements
- API : `c9b3721` (GM fix + evm split) ┬À `01cd2a1` (SVM retry) ┬À `8096046` (Cosmos REST failover) ┬À `1783ebf3` (refactor core)
- Web : `531b29ad` (failed ÔÇö TokenTable collision) ÔåÆ `6112271` (fixed) ┬À `6b6a3f8` (native price fix) ┬À `39797ad9` (INCENTIV removal)

### V├®rifications
- core test : 186/186 pass ┬À typecheck : OK ┬À lint : OK ┬À web build (next build) : OK

## 2026-05-29 ÔÇö Backlog audit Phase 3 ÔÇö cl├┤ture (H5 / H4)

- **H5** code-splitting : d├®j├á satisfait ÔÇö 4 `next/dynamic({ ssr:false })` (WelcomeModal, ValueDistribution, GmWithdrawNotification) ; aucune lib lourde import├®e en eager. Le finding ├®tait un faux positif (mesure limit├®e ├á `page.tsx`, un server shell). Marqu├® r├®solu.
- **H4** split `evm.ts` (1499 l.) / `WalletContent.tsx` (1207 l.) : **diff├®r├®**. Dette d'architecture pure, sans bug associ├® ; le split de `WalletContent` n├®cessite une validation UI (rendu/hydratation/timing d'├®tat) que le typecheck ne couvre pas. ├Ç traiter dans une session d├®di├®e.

## 2026-05-29 ÔÇö Backlog audit Phase 3a (H3 strict TypeScript web)

### H3 ÔÇö `strict:true` activ├® sur `apps/web`
- `apps/web/tsconfig.json` : `strict:true`, suppression de `noImplicitAny:false`. Les strict checks frontend ne sont plus annul├®s.
- 27 erreurs corrig├®es par de vrais fixes de typage (pas de `as any` ni `@ts-ignore`) :
  - `WalletRecord.label` et `DbGmStatus.deployed` ├®largis pour matcher l'API (`string \| null`, `boolean \| null`).
  - `demo-mode.ts` : champ `priceSource` ajout├® aux tokens/natifs de d├®mo.
  - `scan-results.test.ts` : `scriptVersion` ajout├® ├á la fixture `ChainScan`.
  - Guards/annotations : `scam-detector` (`c.tokens ?? []`), `api.ts` (`?? undefined`), `useGmChain` (optional chaining), `GmPageClient` (assertion post-filter), `reduce` typ├®, `getNativeSymbol`/Creator (`Record<string,string>` index), `ProfileClient` wallet-id (`!` sur invariant runtime).
- Validation : `pnpm -r typecheck` Ô£à (web strict) ┬À `pnpm -s lint` Ô£à 0 erreur ┬À `pnpm --filter @wcore/core test` Ô£à 185 pass.

## 2026-05-29 ÔÇö Backlog audit Phase 2 (s├®curit├® en profondeur)

### S1 ÔÇö Rotation refresh token atomique
- Nouvelle primitive `CacheStore.add(key, value, ttlMs)` (set-if-absent) : Redis `SET NX` (fail-closed sur erreur), `MemoryCacheStore` atomique dans l'event loop. Interface + 2 stores + mocks de test mis ├á jour.
- `apps/api/src/auth.ts` : `POST /api/auth/refresh` utilise `claimAndRevokeToken()` ÔÇö claim atomique single-use du jti. Deux refresh concurrents (ou un token vol├® racing le l├®gitime) : un seul gagne, l'autre est rejet├® en `token_revoked`. Remplace le check-then-revoke non atomique.
- Tests : `cache.test.ts` ÔÇö `add` single-use, 10 claims concurrents ÔåÆ 1 gagnant, r├®-claim apr├¿s expiration. Core : 185 pass.

### F1 ÔÇö Faux n├®gatif switch-r├®seau GM
- `apps/web/hooks/useOnChainGm.ts` (`sendGm` + `deployContract`) : flag `providerConfirmed` pos├® quand `eth_chainId` (provider) OU wagmi confirme la cha├«ne ; le guard final accepte la confirmation provider m├¬me si le state React wagmi lague. Plus de blocage ┬½ Wallet did not switch ┬╗ sur un switch pourtant effectif.

### Validation
- `pnpm -r typecheck` Ô£à ┬À `pnpm --filter @wcore/core test` Ô£à 185 pass ┬À `pnpm -s lint` Ô£à 0 erreur. Tests API refresh (DB/Redis) ├á confirmer en CI.

## 2026-05-29 ÔÇö Backlog audit Phase 1 (quick wins)

### S├®curit├® ÔÇö S2 Docker non-root
- `apps/api/Dockerfile` et `apps/web/Dockerfile` : conteneurs en `USER node`. C├┤t├® API, ne pas utiliser `RUN chown -R node:node /app` dans le runner stage : la correction actuelle utilise `COPY --chown=node:node ...` sur les copies runner pour ├®viter le timeout Railway quand `node_modules` nÔÇÖest pas en cache.

### Hygi├¿ne ÔÇö H1 / H2
- **H1** : `package.json` `test` = `pnpm -r typecheck && pnpm -r --filter "./packages/*" --if-present test` (agr├®gat r├®el). V├®rifi├® vert : typecheck monorepo + 182 tests `@wcore/core`. `validate:static` reste un script s├®par├®.
- **H2** : `.env.example` documente `ADMIN_TOKEN` (section Admin/ops) ÔÇö header `Authorization: Bearer` ou `x-admin-token`, compar├® en `timingSafeEqual`, unset ÔåÆ endpoints admin en 401.

### Faux positif ÔÇö F2
- Le ┬½ fallback prix natif `2000` ┬╗ signal├® n'existe pas : le seul `2000` dans `useOnChainGm.ts` est `setTimeout(r, 2000)` (polling receipt). `fetchNativePrice` throw d├®j├á proprement (corrig├® v0.2.32). Marqu├® r├®solu.

### Nouveau finding ÔÇö H9
- `scripts/validate-static.js` exit 1 sur 2 checks GAS (`SYNC_J1_ALL_SHEETS` trigger, `WCORE_AUTO_HEAL` vs `BUILD_RPC_LOOKUP`). Le `test` racine n'├®tait donc pas ┬½ faux-vert ┬╗ mais rouge. D├®coupl├® de `test` ; ├á investiguer c├┤t├® `src/*.gs` (hors p├®rim├¿tre web).

## 2026-05-29 ÔÇö Audit complet lecture seule

### Documentation
- Ajout de `docs/audit-2026-05-29-complet.md` : audit transversal de l'arbre courant (post v0.2.34) ÔÇö s├®curit├®/API, core scan/pricing, frontend, infra/CI/docs, qualit├®/hygi├¿ne.
- `ROADMAP.md` pointe maintenant vers cet audit comme audit courant ; `docs/audit-2026-05-28-complet.md` passe en historique. Backlog 2026-05-29 consolid├® (O1 ops, S1/S2 s├®curit├®, F1/F2 frontend, H1ÔÇôH5 hygi├¿ne).

### Bilan vert (v├®rifi├®)
- `pnpm -s typecheck` Ô£à ┬À `pnpm -s lint` Ô£à (0 erreur, 6 warnings react-hooks) ┬À `pnpm --filter @wcore/core test` Ô£à ┬À `pnpm audit --prod --audit-level=high` Ô£à 0 vuln.
- Tous les findings P0/P1 du 2026-05-28 confirm├®s corrig├®s dans l'arbre (GM GET read-only, deploy v├®rifi├® on-chain, limite scan anonyme, EVM `DISABLE_NATIVE_BALANCE` + negative cache liveness, lint 0 erreur).

### O1 r├®solu ÔÇö commit + d├®ploiement
- Ô£à Batch v0.2.33/v0.2.34 commit├® (`4af4eab`) et pouss├® sur `origin/master`.
- Ô£à D├®ploiements Railway d├®clench├®s : API (service `48f1af2d`, build `a19291bc`) + Web (service `143203eb`, build `af460499`). Les P0 s├®curit├® GM partent en prod avec ce build.

## 2026-05-28 soir ÔÇö Connect + GM B3 fixes (v0.2.34)

### Connect flow ÔÇö 4 bugs critiques
- **Erreur invisible en etat "ready"** : l'erreur de login etait set mais jamais affichee dans la vue "Sign In". Ajout de l'affichage d'erreur + messages contextualises (`nonce_failed`, `network_error`, `chain_id_mismatch`). Fichier : `ConnectButton.tsx`.
- **Pas de `res.ok` sur login** : ajout du check HTTP avant `res.json()`. Les 500/502/serveur-down produisent maintenant un message d'erreur lisible. Fichier : `ConnectButton.tsx`.
- **`chainId` hardcode a 1** : quand le wallet etait deja connecte (`isConnected=true`), `chainId` restait 0 ÔåÆ fallback `chainId \|\| 1`. Certains wallets (Zerion, etc.) refusaient de signer un message claimant une autre chaine. Fix : lecture de `wagmiChainId` depuis `useAccount()`. Fichier : `ConnectButton.tsx`.
- **Flickering bouton Sign In** : l'effet wagmi appelait `setAddress(addr)` a chaque changement d'`authStep` meme si l'adresse n'avait pas change. Ajout d'un guard `prevAddressRef` + `prevAuthStepRef` pour ne transitionner idle/expiredÔåÆready qu'une fois. Fichier : `ConnectButton.tsx`.

### GM B3 ÔÇö 3 fixes de resilience
- **`has-deployed` scan on-chain** : quand `prisma.gmContract.count()` retourne 0, le backend scanne maintenant les logs factory on-chain (`eth_getLogs`) pour retrouver les contrats deployes via l'ancien flow fire-and-forget. Fichier : `gm-contracts.ts`.
- **`/api/gm/onchain` retries etendus** : 3ÔåÆ10 retries, backoff `pow(2,n)` ÔåÆ `5000 + n*2000` ms (~2 min max). Fichier : `gm-onchain.ts`.
- **Frontend fire-and-forget** : `POST /api/gm/onchain` est appele en arriere-plan avec 3 retries (timeout 15-45s). L'UI affiche Ô£à GM immediatement apres confirmation MetaMask. Fichier : `useOnChainGm.ts`.

### Deploiements
- API `c4f3a40a` : has-deployed scan + GM retries 10x
- Web `4ebc431d` : connect fixes + GM fire-and-forget

## 2026-05-28 ÔÇö Audit P0/P1 fixes (v0.2.33)

### Securite/API ÔÇö P0 corriges
- **`GET /api/gm/has-deployed` read-only** : suppression de l'upsert DB direct par query `contract=` et du sync fire-and-forget `fetchOnChainContracts()`. La route ne fait plus que `prisma.gmContract.count()`.
- **`POST /api/gm/contracts/deploy` verifie on-chain AVANT insertion** : `fetchDeployReceipt()` interroge tous les RPCs en parallele, `findVerifiedDeployedContract()` verifie `status=0x1`, `to=factory`, event `ContractDeployed`, createur attendu, adresse extraite depuis `topics[1]`. Si la verification echoue ÔåÆ `400 deploy_verification_failed`. Fichier : `gm-contracts.ts`.

### Scan ÔÇö P1 corriges
- **Limite scan anonyme** : `resolveScanChainLimit()` (exporte depuis `scan.ts`) est utilisee sur `/api/scan`, `/api/scan/batch`, `/api/scan/async`. Les anonymes sont limites a `ANONYMOUS_MAX_CHAINS_PER_SCAN` (20), les authentifies gardent leur plan. Fichiers : `scan.ts`, `scan.test.ts`.

### Core EVM ÔÇö P1 corriges
- **Batch EVM respecte `DISABLE_NATIVE_BALANCE`** : `getEvmWalletsAssets()` lit `chain.FLAGS?.DISABLE_NATIVE_BALANCE` et skip `readNativeBalance()` pour les chaines comme TEMPO. Fichier : `evm.ts`.
- **Negative cache avec liveness check** : `canServeEmptyCache()` appelle `eth_getBalance` avant de servir `[CACHED_EMPTY]`. Si le wallet est funde ou si la verification echoue, le scan live continue. Applique a `getEvmWalletAssets()` (single) et `getEvmWalletsAssets()` (batch). Fichier : `evm.ts`.

### Frontend ÔÇö P1 corriges
- **`GmWithdrawButton.tsx`** : `useCallback` deplace avant le `if (!contract || !balance) return null` ÔåÆ plus de violation `react-hooks/rules-of-hooks`. Fichier : `GmWithdrawButton.tsx`.

### Lint ÔÇö nettoyage complet
- 15 erreurs unused/catch corrigees : `auth.ts` (`FastifyRequest`, `setAuthCookies` reappelee, `jti`/`newJti` nettoyes, `catch (e)` ÔåÆ `catch`), `metrics-plugin.ts` (`reply` ÔåÆ `_reply`), `server.ts` (`createHash` retir├®), `cosmos.ts` (`denomDecimals` + `let` ÔåÆ `const`), `cascade.ts` (`nowMs`/`trail` retires), `cascade.test.ts` (`chainA`/`chainB` retires), `restore-db.cjs` (`path` retir├®), `tools/add-chains.cjs` (`catch (e)` ÔåÆ `catch`). `pnpm lint` : 0 erreur, 6 warnings react-hooks existants.

### Auth hardening ÔÇö P2
- **`clearAuthCookies()`** utilise maintenant `COOKIE_OPTS` complets (`secure`, `sameSite`) au lieu de `{ path: "/" }`. Corrige le logout cookie fragile en prod.

### Scripts X ÔÇö neutralises
- 6 scripts (`x-cycle8.js`, `x-discovery-large-cycle.js`, `x-cycle-v2.js`, `x-cycle-global-scan.js`, `x-cycle-4.js`, `x-cycle-3-replies.js`) : dry-run par defaut. Flag `--execute-i-understand` requis pour publier. Les scripts sont ignores par git (`.gitignore`), les modifications sont locales.

### Tests ajoutes
- `gm-contracts.test.ts` : `findVerifiedDeployedContract()` strict receipt checks.
- `gamification.test.ts` : deploy non verifie rejete + GET read-only sans ecriture.
- `scan.test.ts` : `resolveScanChainLimit()` anonyme vs auth.
- `evm.test.ts` : negative cache liveness + batch `DISABLE_NATIVE_BALANCE`.

### Deploiements
- API : deploye le 2026-05-29 via commit `4af4eab` (service `48f1af2d`, build `a19291bc`) ÔÇö P0 GM fixes + scan limit + clearCookie hardening.
- Web : deploye le 2026-05-29 via commit `4af4eab` (service `143203eb`, build `af460499`) ÔÇö lint hook fix.

## 2026-05-28 ÔÇö Audit complet lecture seule

### Documentation
- Ajout de `docs/audit-2026-05-28-complet.md` : audit transversal s├®curit├®/API, core scan/pricing, frontend, infra/CI/docs.
- `ROADMAP.md` pointe maintenant vers cet audit comme audit courant et consolide les P0/P1 actifs.

### Findings majeurs enregistr├®s
- Critique : `GET /api/gm/has-deployed` ├®crit en DB via `upsert` et peut r├®attribuer un contrat GM.
- Critique : `POST /api/gm/contracts/deploy` enregistre le contrat avant v├®rification serveur on-chain.
- High : `ANONYMOUS_MAX_CHAINS_PER_SCAN` est d├®fini mais ignor├® par les endpoints scan sync/batch/async.
- High : `pnpm lint` est rouge, avec une violation `react-hooks/rules-of-hooks` dans `GmWithdrawButton.tsx`.
- High : batch EVM ignore `FLAGS.DISABLE_NATIVE_BALANCE`, et le negative cache EVM n'a pas de liveness check.
- High : scripts X actionnables encore pr├®sents dans `scripts/`.

### V├®rifications audit
- `rtk pnpm typecheck` : OK.
- `rtk pnpm audit --prod --audit-level=high` : OK.
- `rtk pnpm lint` : ├®chec, 29 erreurs + 6 warnings.
- `rtk pnpm --filter @wcore/core test` : ├®chec, 179/180 passent ; test timing fragile.
- `rtk pnpm --filter @wcore/web test` : ├®chec, 34/40 passent ; API locale absente pour les tests UI.

## 2026-05-27 ÔÇö GM refactoring + native price fix

### Refactoring GM (Phase 1+2)
- Extrait `gm-storage.ts` : centralise les helpers localStorage GM (`lsGmDone`, `lsDeployed`, `lsContractDeployed`, `lsSetContractDeployed`, `lsSetGmDone`, `lsGetBalance`, `lsSetBalance`). Fichier unique au lieu de 3 fichiers dispers├®s.
- Supprim├® `checkOnChainDeployed` : 35 lignes de code mort (`return false` au ligne 58).
- Supprim├® `nativeIds` mapping : 43 lignes de CoinGecko IDs hardcod├®s (utilise `/api/price/native` API au lieu).
- Supprim├® workaround `KNOWN` contracts : auto-registration Citrea/Cronos/Fuse plus n├®cessaire (tous en DB).
- Extrait `GM_PLATFORM_OWNER` dans `@wcore/shared` : constante partag├®e web+api au lieu de hardcoding local.
- Refactor `checkHasDeployed` : utilise `lsContractDeployed` helper.
- Refactor `sendGm` : utilise `lsSetGmDone` helper.
- Refactor `deployContract` : utilise `lsSetContractDeployed` helper.
- Refactor `GmWithdrawButton` : utilise `lsGetBalance`/`lsSetBalance` helpers.
- Nettoy├® ~200 lignes de code dupliqu├®/dead/hardcod├®.

### Fixes GM critiques
- **`getRandomContract` CORS fix** : `fetch()` brut ÔåÆ `apiFetch` pour que le JWT soit envoy├®. Sans ├ºa, le serveur ne pouvait pas identifier l'utilisateur ÔåÆ pas de filtre balance $0.05. Fichier : `useOnChainGm.ts`.
- **`fetchNativePrice` fallback 2000 fix** : `fetch()` brut avec `return 2000` comme fallback ÔåÆ `apiFetch` + throw. Le fallback $2000 (prix ETH) causait des tips de 0.0000255 POL au lieu de 0.57 POL sur Polygon. Toutes les cha├«nes non-ETH gas ├®taient affect├®es. Fichier : `useOnChainGm.ts`.
- **Balance threshold `$0.05` ÔåÆ `$0.10`** : le filtre `/api/gm/random` v├®rifie maintenant `balanceUsd >= 0.10` pour couvrir tip $0.05 + gas fees variables. Fichier : `gm-contracts.ts`.

## 2026-05-27 ÔÇö Audit global + docs/CI cleanup

### Session v0.2.30+ ÔÇö Continuation (apr├¿s-midi)
- Activation GM Mitosis : factory `0x540dbcb3b2055ef5790b9fdaa197216bb4aac3c2` sur chainId 124816. Fichiers : `factories.ts`, `ChainCard.tsx`, `DeployClient.tsx`, `GmPageClient.tsx`, `useOnChainGm.ts`.
- Auth resilience : `/api/auth/me` et `doRefresh()` ne downgrade plus l'├®tat auth sur erreurs r├®seau/5xx. Seul un 401 explicite d├®connecte. Corrige la session perdue apr├¿s restart API ou Ctrl+Shift+R. Fichiers : `ConnectButton.tsx`, `api.ts`.
- Dead code supprim├® : `useScanScheduler.ts`.
- Concurrence harmonis├®e : `GLOBAL_CHAIN_CONCURRENCY` lit `NEXT_PUBLIC_SCAN_CONCURRENCY` (d├®faut 50), align├® avec `SCAN_CONCURRENCY` backend.
- Scan duration : affiche le temps r├®el du scan au lieu de la somme des `scanMs` de toutes les cha├«nes.
- Suppression PDF : `PdfExport.tsx`, `MultiWalletPdfExport.tsx`, boutons `window.print()` retir├®s.
- `next/dynamic` code splitting : `ValueDistribution`, `WelcomeModal`, `GmWithdrawNotification` lazy-load├®s.
- `React.memo` sur `TokenIcon` et `ChainIcon`.
- `IntraScanCache` type partag├® : `Map<string, Promise<PricingResult>>` export├® depuis `@wcore/core`.
- Pricing native fallback cache : utilise le cache stale quand DefiLlama/CoinGecko ├®chouent.
- Optimisation scan massif : SCAN_CONCURRENCY 20ÔåÆ50 + pr├®-warm du pricing cache via batch DefiLlama.

### Correctifs P0/P1 audit (matin)
- CSRF API pass├® en deny-by-default sur toutes les mutations `/api/*`, avec exceptions explicites uniquement pour le pr├®-auth SIWE (`/api/auth/nonce`, `/api/auth/login`).
- Lectures publiques GM (`/api/gm/random`, `/api/gm/contracts`, `/api/gm/status`, etc.) remises sous bucket rate-limit `gm_read` au lieu de bypasser le limiter GM et le catch-all.
- C├┤t├® web, les retraits GM r├®solvent les chain IDs via `getFactory()` case-insensitive (`getGmContractChainId`) au lieu d'indexer directement `GM_FACTORIES[chainKey]`.
- `x-admin-token` ajout├® aux headers CORS autoris├®s pour ├®viter les preflights admin cross-origin bloqu├®s.
- Quotas scan s├®par├®s : les anonymes utilisent `ANONYMOUS_MAX_CHAINS_PER_SCAN` (d├®faut 20), les utilisateurs authentifi├®s gardent leur limite de plan (`MAX_CHAINS_PER_SCAN` / 120).
- `/api/gm/random` ne fait plus un `findFirst` par contrat pour exclure les GM d├®j├á faits aujourd'hui : un seul `findMany` batch construit un Set de `contractId` utilis├®s.
- `TokenIcon` ne d├®clenche plus de `setState` pendant le render quand aucun fallback CMC n'existe. La r├®solution d'image passe par le helper pur `getTokenIconSource()`.
- Overrides TokenIcon long-tail r├®align├®s avec les tests existants pour MITO, OPEN, BTCN, GHO et G.
- Indexes DB hot paths ajout├®s : `users(score)`, `gm_contracts(ownerId)`, `gm_contracts(creatorAddress)`, `onchain_gms(userId, createdAt)`, `onchain_gms(contractId)`, `notifications(userId, createdAt)` + migration additive.
- R├®gression GM Base verrouill├®e : `/api/gm/random` peut retourner `chainKey: "BASE"`; le hook on-chain expose/teste `getGmChainId("BASE")` pour ├®viter l'erreur frontend `GM not supported on BASE`.
- GM Base : `/api/gm/random` pr├®f├¿re maintenant le contrat dont `creatorAddress` matche l'adresse demand├®e, et le contrat legacy Base `0x4622e578...556fb1b` est filtr├® c├┤t├® API + supprim├® par migration additive. Le contrat attendu pour le owner reste `0xeA392000a2ae8045cFE72e538cDfbB809c6C49eA`.
- Notifications streak en boucle : `createNotification` d├®duplique par `(userId, type, title)` pour emp├¬cher les doublons. Le SSE snapshot et `unread-count` utilisent maintenant `notifWhere` (coh├®rent avec `read-all` et le REST GET). Migration SQL de nettoyage des doublons existants.
- Fix `apiFetch` : ne plus envoyer `Content-Type: application/json` quand il n'y a pas de body. Corrige le `PUT /api/notifications/read-all` qui retournait 400 "Body cannot be empty" ÔåÆ la notif streak revenait en boucle car le mark-all-read ├®chouait silencieusement.
- `forceRefresh` bypass le cache n├®gatif `empty:*` : le flag est pass├® jusqu'aux engines EVM/SVM/Cosmos, qui sautent le short-circuit du cache n├®gatif quand il est actif. Corrige le cas o├╣ un wallet vide puis aliment├® restait `[CACHED_EMPTY]` malgr├® un force refresh.
- `GET /api/auth/me` : le calcul des points on-chain n'utilise plus le r├®sidu `user.score - questPts - offChainPts` (faux apr├¿s tout reset de streak). Il d├®rive maintenant `onChain.points` et `onChain.count` de `buildPerChainGmPoints`, qui est toujours correct. Le total du score reste inchang├®.
- Self-heal `POST /api/gm/onchain` : apr├¿s la reconstruction per-chain, r├®concilie maintenant le streak g├®n├®ral (`user.gmStreak`, `longestStreak`, `lastGmDate`) ├á partir de tous les `onchainGms`. ├ëvite la divergence silencieuse entre streak g├®n├®ral et per-chain.
- Access tokens 24h : les nouveaux access tokens incluent maintenant un `jti`; l'auth hook v├®rifie `revoked:{jti}` et refresh/logout r├®voquent aussi l'access cookie courant, pas seulement le refresh token.
- Scan UI : l'annulation/changement de scan invalide maintenant `scanRunIdRef` et prot├¿ge les mutations d'├®tat apr├¿s `loadChainVmMap`, dans le `finally` des jobs batch et apr├¿s le pool global. ├ëvite les toasts/progr├¿s/active chains stale apr├¿s annulation.
- SVM/Cosmos precision : les montants bruts SPL/REST ne sont plus convertis via `Number(...)` avant formatage. Ils restent en string/BigInt jusqu'au calcul d├®cimal, et les caches native/token conservent les unit├®s brutes. Tests ajout├®s au-dessus de `Number.MAX_SAFE_INTEGER`.
- Cosmos IBC decimals : les denoms `ibc/*` ne fallback plus aveugl├®ment ├á 18 d├®cimales. Le scan tente `denom_traces/{hash}` et r├®utilise les d├®cimales du `base_denom` connu; si la r├®solution ├®choue, le token est marqu├® `decimals_unknown` et ignor├® plut├┤t que sous-├®valu├® massivement.
- RPC resolver scan : les engines EVM (single + batch) et SVM utilisent maintenant `getRpcEndpoints()` au lieu de lire directement `chain.RPC.ENDPOINTS`, ce qui active le merge static + dynamic + health centralis├® pour les scans.
- Secrets docs : ajout de `.gitleaks.toml` avec r├¿gles WCORE sp├®cifiques pour Google OAuth (`GOCSPX-*`), Blockscout Pro (`proapi_*`), URLs Postgres et Redis avec credentials. La rotation fournisseur reste obligatoire pour les secrets historiques.
- Ops events perf : `recordOpsEvent()` ne purge plus la table `ops_events` ├á chaque ├®criture. La purge 7 jours est d├®plac├®e dans le cleanup p├®riodique `snapshotMetrics()`.
- API compression : `@fastify/compress` enregistr├® globalement sur Fastify pour compresser les r├®ponses JSON volumineuses (scan results, m├®triques, historique).
- Error boundaries Next : ajout de `app/error.tsx` (boundary route-level qui isole le crash d'une page tout en gardant le layout/sidebar) et `app/global-error.tsx` (erreurs fatales du layout). L'ancien `ErrorBoundary` manuel qui wrappait tout le `SidebarLayout` a ├®t├® retir├® du layout ÔÇö un crash de page ne fait plus tomber toute l'app.
- API Cache-Control : `/api/chains` et `/api/chains/:key` cach├®s 5min (stale-while-revalidate 1h, config quasi-statique); `/api/price/eth` et `/api/price/native` cach├®s 60s (SWR 120s) pour r├®duire les hits CoinGecko/DefiLlama r├®p├®t├®s.
- Refactor `IntraScanCache` : type partag├® `IntraScanCache = Map<string, Promise<PricingResult>>` export├® depuis `@wcore/core` (pricing), rempla├ºant les 7 duplications `Map<string, Promise<any>>` dans les engines EVM/SVM/Cosmos, le dispatch et le scan plugin. Typage pr├®cis, aucun changement runtime.
- Pricing native fallback cache : quand DefiLlama et CoinGecko ├®chouent (rate limiting pendant scans massifs), le pricing cascade utilise maintenant le cache stale comme fallback au lieu de retourner `NO_PRICE`. Corrige SOL/ATOM/INJ/BASE affichant `ÔÇö` apr├¿s scans longs (70+ min). Fichiers : `packages/core/src/pricing/cascade.ts` (lignes 152-158 pour natif, 133-139 pour tokens).
- Optimisation scan massif : SCAN_CONCURRENCY augment├® (20 ÔåÆ 50) + pr├®-warm du pricing cache via batch DefiLlama (1 appel HTTP pour toutes les cha├«nes). R├®duit la dur├®e du scan de ~70 min ├á ~30 min et ├®vite le rate limiting. Fichier : `apps/api/src/plugins/scan.ts`.
- `React.memo` sur `TokenIcon` et `ChainIcon` : ├®vite les re-renders inutiles dans les listes de centaines de tokens/cha├«nes pendant les scans. Gain perf sur les gros portefeuilles.
- `next/dynamic` code splitting : `ValueDistribution`, `WelcomeModal`, `GmWithdrawNotification` charg├®s async avec `ssr: false`. R├®duit le bundle initial JS.
- Suppression export PDF : `PdfExport.tsx` et `MultiWalletPdfExport.tsx` retir├®s. Le bouton "PDF" reste dans `ScanDetailClient.tsx` mais utilise `window.print()` directement sans wrapper.
- Bug GM "Deploy" sans auth (page wallet) : sur `ChainCard`, le bouton "­ƒÜÇ Deploy GM Contract" apparaissait quand le wallet ├®tait connect├® mais **pas authentifi├®** (header "Sign In", `authStep="ready"`). `/api/gm/status` et `/api/gm/has-deployed` renvoient `401` sans session ÔåÆ `hasDeployed=false` ÔåÆ bouton trompeur qui red├®ployait un contrat existant. **Fix** : `WalletContent` ne passe `connectedAddress` aux features GM que si `authStep === "authenticated"` (sinon `null` ÔåÆ boutons GM/Deploy masqu├®s, aucun fetch GM). **D├®fense en profondeur** : `handleDeploy` re-v├®rifie `checkHasDeployed()` juste avant d'envoyer la tx et abandonne si un contrat existe d├®j├á.

### Audit global
- Ajout de `docs/audit-2026-05-27-global.md` : s├®curit├®/API, frontend, core scan/pricing, infra/docs.
- Nouveaux P0/P1 actifs consolid├®s dans `ROADMAP.md` : CSRF deny-by-default, rate-limit GM/scan, GM factory lookup web case-insensitive, `TokenIcon` render purity, forceRefresh vs `empty:*` EVM, pr├®cision SVM/Cosmos, resolver RPC dynamique dans engines.

### Nettoyage docs/secrets
- Secrets r├®els retir├®s de `AGENTS.md` et `ROADMAP.md` et remplac├®s par placeholders/variables d'environnement.
- `README.md` nettoy├® : plus de version/test counts hardcod├®s, script absent supprim├®, tests renvoy├®s vers CI.
- `DEPLOY.md` corrig├® : d├®ploiement Railway direct, cache portfolio navigateur d├®sactiv├®, cache serveur document├®. Note v0.3.1 : namespace courant `scan:result:*`.

### CI/tooling
- `.github/workflows/ci.yml` expose `TEST_DATABASE_URL` / `TEST_REDIS_URL` au niveau job pour que le step API integration gated puisse r├®ellement s'ex├®cuter.
- `apps/web/package.json` remplace `next lint` par `eslint .` pour Next 16.

### Action op├®rateur requise
- Rotater le Google OAuth client secret et la cl├® Blockscout Pro qui ├®taient pr├®sents dans l'historique de docs.

## 2026-05-26 ÔÇö v0.2.31 : notification spam + auth resilience + cache stale fix

### Notifications spam/revival fix (3 root causes)
1. **Scan notifs supprim├®es** ÔÇö `prisma.notification.create` pour `scan_done`/`scan_degraded` retir├® de `apps/api/src/plugins/scan.ts`. Les vieilles notifs filtr├®es de toutes les requ├¬tes + cleanup one-shot au boot API.
2. **SSE overwrites optimistic state** ÔÇö `lastActionAt` ref bloque SSE/polling pendant 5s apr├¿s `markAllRead`/`markAsRead`. Fix├®e ├®galement : stale closure via `isAuthenticatedRef`.
3. **Mark-read sans auth** ÔÇö `markAllRead`/`markAsRead` ne font plus rien si `!isAuthenticated`. Update optimiste imm├®diate avec revert+fetch si l'API ├®choue.

### Notifications/GM affich├®es sans ├¬tre connect├®
- `NotificationsBell` vide ses states (`unreadCount=0`) d├¿s que `authStep !== "authenticated"` + race async corrig├®e via `isAuthenticatedRef`.
- `GmWithdrawNotification` passe `address=null` ├á `useGmContracts` si pas authentifi├® ÔåÆ pas de fetch ni d'affichage "X withdrawable".

### D├®connexion syst├®matique au Ctrl+Shift+R
- **Access token TTL 15min ÔåÆ 24h** (`apps/api/src/auth.ts`).
- `authStep === "expired"` maintenant promu en `"ready"` quand MetaMask reconnect, donc le bouton "Sign In" s'affiche au lieu de "Connect Wallet".

### Cache stale `scan:v2` (suite v0.2.30, renomm├® `scan:result` en v0.3.1)
- `hasCachedValue()` rejette les entr├®es cache o├╣ `native.balance > 0` mais `native.priceEur == null` ÔåÆ l'API re-scanne au lieu de servir le cache pollu├®.

### Bouton "Retry timed-out chains"
- Nouveau bouton dans la banni├¿re orange qui relance `fetchBatchScan` uniquement pour les cha├«nes en timeout.

### Auth resilience (v0.2.31b)
- **Erreur r├®seau sur `/api/auth/me`** ÔåÆ garde `storedAddr` en localStorage et passe ├á `"ready"` au lieu de `"expired"` ÔåÆ l'utilisateur voit "Sign In" au lieu de perdre tout ├®tat.
- **`wcore-logout` event** ÔåÆ ne vide plus `address` ni `localStorage` ÔåÆ seul `authStep` passe ├á `"expired"`, promu en `"ready"` par la synchro wagmi.
- **`doRefresh` failure** ÔåÆ ne supprime plus `localStorage` ÔåÆ l'adresse survit aux erreurs r├®seau temporaires.
- **R├®sultat** : les erreurs r├®seau temporaires ne d├®connectent plus l'utilisateur.

### D├®ploiements
- API Railway `48f1af2d` ÔåÆ `SUCCESS` (├ù3 d├®ploiements).
- Web Railway `143203eb` ÔåÆ `SUCCESS` (├ù6 d├®ploiements).

## 2026-05-26 ÔÇö v0.2.30 : stale SVM/Cosmos cache + frontend merge case-insensitive

### Bug 1 ÔÇö Frontend merge chainKey case-sensitive
- **Root cause** : `mergeChainResults()` dans `apps/web/components/scan-results.ts` utilisait `chain.chainKey` brut comme cl├® de Map. Un ancien r├®sultat `"solana"` (lowercase) et un frais `"SOLANA"` (uppercase) devenaient deux entr├®es distinctes ÔÇö l'ancien avec `priceEur=null` survivait au rendu (SVM/Cosmos affichait `0Ôé¼` / `price ÔÇö`).
- **Fix** : normalisation `.toLowerCase()` des cl├®s dans la Map (`scan-results.ts:12-13`).
- **Test** : `replaces stale chain results case-insensitively` ajout├® ├á `apps/web/__tests__/scan-results.test.ts`.

### Bug 2 ÔÇö Cache serveur `scan:v2` pollu├® par un r├®sultat sans prix natif (namespace courant `scan:result`)
- **Root cause** : `shouldCacheAssets()` autorisait le cache quand `native.balance > 0` mais `native.priceEur = null` et `errors.length = 0`. Un scan partiel SVM/Cosmos avec le prix natif absent empoisonnait le cache r├®sultat.
- **Fix** : garde `if (nativeBalance > 0 && native.priceEur == null) return false` dans `apps/api/src/plugins/scan.ts:64`.
- **Test** : `does not cache positive native balances without a native price` ajout├® ├á `apps/api/src/scan-cache-policy.test.ts`.

### D├®ploiements
- API Railway `48f1af2d` ÔåÆ `SUCCESS`.
- Web Railway `143203eb` ÔåÆ `SUCCESS`.
- `pnpm --filter @wcore/web typecheck` ÔåÆ 0, `pnpm --filter @wcore/web exec node --import tsx --test __tests__/scan-results.test.ts` ÔåÆ 6/6.
- `pnpm --filter @wcore/api exec node --import tsx --test src/scan-cache-policy.test.ts` ÔåÆ 8/8 (nouveau test inclus).
- Solana smoke test prod : `SOL priceEur: 76.89Ôé¼`, `balance: 0.0464`, `value: 3.57Ôé¼`.

## 2026-05-26 ÔÇö Audit + GM chainKey harmonization

Audit transversal post-v0.2.29 (correctness, s├®curit├®, tests, hygi├¿ne). Findings et r├®solutions d├®taill├®s dans `ROADMAP.md` ┬º ┬½ ­ƒöÄ Audit complet ÔÇö 2026-05-26 ┬╗.

### GM chainKey canonicalization (P1 audit)
- **Root cause**: the v0.2.29 casing fix only normalized the read/display layer. Writes stayed mixed (seed/deploy/auto-register lowercase vs onchain/rebuild/backfill UPPERCASE). Because `GmContract @@unique([chainKey, contractAddress])` and `OnchainGm @@unique([chainKey, txHash])` are case-sensitive in Postgres, an UPPERCASE submit query could miss a legacy lowercase contract row (ÔåÆ `no_gm_contract_for_chain`) and the anti-replay unique no longer collided across cases (ÔåÆ potential double-credit).
- **Fix**: single canonical helpers in `@wcore/shared` ÔÇö `canonicalChainKey()` (UPPERCASE = DB-canonical, aligned with the core chain registry) and case-insensitive `getFactory()`/`getFactoryAddress()`. All GM DB writes now go through `canonicalChainKey()` (`seedGmContracts`, deploy, `has-deployed`, `syncOnChainContracts`, `/api/gm/onchain`, rebuild, backfill). GM contract lookups + the on-chain anti-replay pre-check are now case-insensitive (`mode: "insensitive"`), so canonical queries still resolve legacy lowercase rows ÔÇö **no destructive prod migration required** (convergence happens on write). Read-time dedup remains the display safety net.
- **Cleanup**: removed dead bindings (`addReferralBonus`, `createNotification` in `gm-onchain.ts`; unused `rpcJson` param in `gm-streak-rebuild.ts`'s `tryGetLogs`). Removed a stray tracked junk file (`=6.15.2`).
- **Validation**: `gm-chainkey.test.ts` (canonical + factory case-insensitivity) + existing GM tests ÔåÆ 6/6. `tsc @wcore/api` 0, `typecheck @wcore/web` 0, `typecheck @wcore/shared` 0, `eslint` on changed files 0. DB-backed `wallet plugin ÔÇö privilege guards` not runnable locally (no Postgres) ÔÇö verify in CI/Railway.
- **├ëtat d├®ploiement**: pouss├® sur `origin/master` (`2dbb21e`, incluant `ff7cc64`) et d├®ploy├® sur Railway. API `0d50bb67-3965-4976-82f0-5e902dab1def` ÔåÆ `SUCCESS`; Web `89fad3d8-38ce-4144-b690-d3410d9f368c` ÔåÆ `SUCCESS`. Checks prod: `/health`, `/api/gm/contracts`, homepage Web OK.

## 2026-05-26 ÔÇö GM Profile/state consistency

### Profile ÔÇö per-chain GM current vs best streak
- **Root cause**: the per-chain Profile breakdown derived display stats from `onchain_gms`, but exposed only one `streak` value. That value was the last historical run, which can be misleading after a missed day. On-chain audit of `GmCheckedIn` logs confirmed split-run chains such as `METAL_L2` (`10 GM ┬À 87 pts`, current `2d`, best `8d`) and `CYBER`/`APPCHAIN`/`DUCKCHAIN` (`9 GM ┬À 74 pts`, current `2d`, best `7d`).
- **Fix**: `buildPerChainGmPoints()` now returns both current `streak` and `bestStreak`, and current streak drops to `0` when the latest GM is older than yesterday. Profile now displays `current Xd ┬À best Yd`.
- **Validation**: `gm-points.test.ts` covers normalized chain keys, duplicate same-day events, points, current streak, and best streak.

### Profile ÔÇö duplicate GM Contracts cards for platform owner
- **Root cause**: production data can contain case-variant `chainKey` rows for the same GM contract (`base` and `BASE`). `/api/gm/my-contracts` deduped platform-owner rows by DB `id`, not by canonical `(chainKey, contractAddress)`, so the Profile GM Contracts tab rendered duplicate cards.
- **Platform-only noise**: platform-owner view also included platform-only contracts with no withdrawable platform balance, producing confusing cards like `BASE PLATFORM` without a fees button.
- **Fix**: `/api/gm/my-contracts` now normalizes `chainKey`/`contractAddress`, merges case-variant duplicates, preserves creator+platform balances on a single card, and hides platform-only rows without withdrawable platform fees.
- **Validation**: `gm-contracts.test.ts` passes and `@wcore/api` build passes.

### GM page ÔÇö chain status normalization
- **Root cause**: `/api/gm/status` returned chain keys with the DB casing. If contracts were stored as `base` but today's `OnchainGm` row was stored as `BASE`, the API returned separate `base` and `BASE` entries. The `/gm` page reads lowercase keys, so chains already GM'd could still display `Say GM`.
- **Fix**: `/api/gm/status` now normalizes contract rows and today's GM rows to lowercase before merging `deployed` and `gmDone`.
- **Validation**: `gm-status.test.ts` covers `base` + `BASE` and `arbitrum_one` + `ARBITRUM_ONE` merge behavior.

### GM on-chain submit/backfill ÔÇö canonical chain keys
- **Fix**: `/api/gm/onchain` now canonicalizes incoming `chainKey` to uppercase before DB lookup/write, matching `gm_contracts` uniqueness expectations.
- **Backfill/rebuild**: `rebuildChainStreakFromOnchain()` normalizes chain keys to uppercase, writes `OnchainGm.createdAt` from the event timestamp, keeps existing higher streaks, and uses chunked `eth_getLogs` for block-range-limited RPCs (`CYBER`, `OPENLEDGER`, `STABLE`).

### Validation / deploy
- `pnpm --filter @wcore/api exec node --import tsx --test src/gamification/gm-points.test.ts src/gamification/gm-status.test.ts src/gamification/gm-contracts.test.ts` ÔåÆ 4/4.
- `pnpm --filter @wcore/api build` ÔåÆ OK.
- `pnpm --filter @wcore/web typecheck` ÔåÆ 0 errors.
- API Railway deploy `0d50bb67-3965-4976-82f0-5e902dab1def` ÔåÆ `SUCCESS`, `/health` OK.
- Web Railway deploy `89fad3d8-38ce-4144-b690-d3410d9f368c` ÔåÆ `SUCCESS`.

## 2026-05-24 ÔÇö Scan cache hardening + HEMI/scam updates

### Frontend ÔÇö browser scan cache removed
- **`apps/web/components/WalletContent.tsx`** no longer reads or writes portfolio scan results in `localStorage`. The browser no longer persists `v*:scan:*` results or `scan_prev_eur_*` totals.
- **`apps/web/components/scan-cache.ts`** now exposes `BROWSER_SCAN_CACHE_ENABLED = false`; `apps/web/__tests__/scan-cache.test.ts` guards this product decision.
- Reason: stale browser scan results were masking fresh API fixes and forcing code/version bumps to recover user-visible balances.

### Cache policy ÔÇö major tokens without price are not cacheable
- **`apps/api/src/plugins/scan.ts`** refuses to cache scans where a major priceable token has positive balance but `NO_PRICE` (`WBTC`, `WETH`, `USDC`, `USDT`, `stETH`, etc.). Existing Redis entries matching this shape are ignored and re-scanned.
- **`apps/web/components/scan-results.ts`** mirrors the same rule for frontend safety.
- Regression covered by `apps/api/src/scan-cache-policy.test.ts` and `apps/web/__tests__/scan-results.test.ts` using the Ethereum WBTC case.

### UI assets / scam detection
- **HEMI icon**: `apps/web/lib/chain-icon-manifest.json` now uses `https://rubyscore.fra1.digitaloceanspaces.com/chain_icons/hemi.svg`.
- **BASE scam contract**: `packages/shared/src/scam-detector.ts` permanently blocks `0x260b9ac75753fbd67f2ea6d10724dd89a52c1913`; test added in `packages/core/src/tokens/scam-detector-shared.test.ts`.

### Validation
- `pnpm --filter @wcore/web exec node --import tsx --test __tests__/scan-cache.test.ts __tests__/scan-results.test.ts` ÔåÆ 6/6.
- `pnpm --filter @wcore/web typecheck` ÔåÆ 0 errors.
- `pnpm --filter @wcore/core exec node --import tsx --test src/tokens/scam-detector-shared.test.ts` ÔåÆ 1/1.
- `pnpm --filter @wcore/shared build` and `pnpm --filter @wcore/api build` ÔåÆ OK.

## 2026-05-24 ÔÇö Audit de v├®rification + r├®conciliation roadmap

### Audit ÔÇö verification only (no functional code change)
- **`docs/audit-2026-05-24-global.md`** added: measured reconciliation of the 2026-05-23 punch list against the current working tree, with `file:line` evidence.
- **Validations**: `pnpm -r typecheck` Ô£à (exit 0, all packages); `pnpm audit --prod --audit-level=moderate` ÔåÆ 1 moderate (`qs` via `googleapis-common`, root tooling path, not in api/web runtime); `node --check apps/api/set-test-env.js` Ô£à.
- **Result**: P0-1 + P1-1/2/3/4/5/6/7/8/10/11/14/15 + P2-1 verified **fixed in code** (were still unchecked in the punch list ÔÇö now reconciled in `ROADMAP.md`).
- **Still open**: P1-9 (frontend stale-scan race, no `scanRunIdRef`), P1-13 (`SCAN_CONCURRENCY` 20 in `scan.ts` vs 30 in `metrics-plugin.ts`), P2-2 (`/api/metrics/errors/detail` public), P2-3 (`/api/admin/scam-overrides` public), P2-16 (no `qs` override in `pnpm.overrides`).

## 2026-05-23 ÔÇö RealT pricing + SVM/Cosmos force-refresh resilience

### Infrastructure ÔÇö centralized RPC resolution
- **`packages/core/src/rpc/endpoints.ts`** : added a single RPC resolver backed by `@wcore/core` chain configs, with optional Chainlist dynamic warmup, strict `eth_chainId` validation, HTTPS/template filtering, health filtering, and static fallback.
- **GM API** : removed the separate gamification `CHAIN_RPCS` map. `getChainRpc()` / `getChainRpcs()` now wrap the central resolver, so deploy/status/on-chain repair use the same source as scans.
- **Scripts** : `scripts/audit-gm-consistency.ts` and `scripts/recover-gm-history.ts` now consume `getRpcEndpoints()` instead of importing API internals or maintaining local RPC maps. `recover-gm-history.ts` also now requires `DATABASE_URL` instead of embedding a DB URL.
- **Web cleanup** : removed the unused `apps/web/lib/gm-utils.ts` local RPC map.

### Security / Ops ÔÇö audit follow-ups
- **Local secret cleanup** : removed `scripts/.env.backup` without reading it; `.gitignore` already covers `scripts/.env.backup` via `.env*`.
- **Rate-limit regression guard** : updated `apps/api/src/scan.test.ts` so forged `wcore_access` cookies are ignored for rate-limit bucketing. The server remains IP-only for rate-limit identity.
- **API unit tests without local DB** : extracted pure server helpers to `apps/api/src/server-helpers.ts`, so `scan.test.ts` no longer imports the Fastify server or touches Prisma. The scan helper tests now run without a local Postgres instance.
- **Staging deploy safety** : `scripts/deploy-staging.ps1` no longer falls back to `prisma db push --accept-data-loss` after migration failure. It now stops after creating a backup and requires migrations to be fixed explicitly.
- **Smoke tests** : `scripts/smoke-test.ps1` now checks for `180+` chains instead of the obsolete exact `116` count.

### Growth ÔÇö Multichain Map post
- **Post X** : `https://x.com/WCORExyz/status/2058205408188158434`.
- **Visual** : `apps/web/public/wcore-post-multichain-map.svg` + `.png` (`1200x675`). `.gitignore` includes a targeted exception so the PNG can be versioned despite the global `*.png` ignore.
- **Angle** : `Your crypto is not on one chain.` WCORE maps wallets across 180+ chains from one read-only dashboard, with EVM / Solana / Cosmos cards and `wcore.xyz` CTA.

### Growth ÔÇö Today's WCORE update v9
- **Post X** : `https://x.com/WCORExyz/status/2058219512185434210`.
- **Visual** : `apps/web/public/wcore-post-daily-update-9.svg` + `.png` (`1200x675`). `.gitignore` includes a targeted exception so the PNG can be versioned despite the global `*.png` ignore.
- **Angle** : `Cleaner scans. Better coverage.` User-facing update covering RealT assets on Gnosis, Solana/Cosmos fallback, 180+ chain mapping, and read-only wallet views.

### Growth ops ÔÇö X automation rules tightened
- **Incident documented** : an X Playwright/CDP action accidentally muted AALADIN during a CM cycle. The account was restored manually by the user.
- **Rule change** : X automation is read-only by default. Scans must propose actions + exact text and wait for explicit user approval before any DM/reply/like/follow/menu action.
- **Backlog** : replace ad hoc `.tmp-x-*.cjs` scripts with reusable `scripts/x/` tooling split into `scan` and `execute`, with strict `status_id` targeting, explicit timeouts, overlay/modal aborts, draft verification, post-action verification, and structured logs.

### Fix ÔÇö RealT Gnosis pricing
- **`packages/core/src/pricing/sources/realt.ts`** : added an official WooCommerce Store API fallback (`https://realt.co/wp-json/wc/store/v1/products?search=...`) when `api.realtoken.community/v1/token` returns 404/unavailable. Matching is strict/fail-closed and cached in Redis as `realt:woo:{contract}` for 6h.
- RealT contracts recognized by the registry no longer fall back to DEX/GeckoTerminal prices, because illiquid pools produced false prices.

### Fix ÔÇö SVM/Cosmos forced refresh returning random zeroes
- **`apps/api/src/plugins/scan.ts`** : `forceRefresh=true` now bypasses only the top-level scan result cache, not non-EVM engine fallback caches. `getEngineCacheForScan()` keeps `sharedCache` for `SVM`/`COSMOS` so `native:*`, `ta:*`, `bal:*`, staking caches, etc. can preserve balances when public RPCs return `429`, `400`, aborts, or no token-account data.
- EVM keeps the previous forced-refresh behavior (`cache: undefined`) to avoid masking intentional full rescans.

### Cache ÔÇö scan result v2
- **`apps/api/src/plugins/scan.ts`** : scan result cache key changed to `scan:v2:{address}:{chain}` via `getScanResultCacheKey()`, invalidating old Redis entries like `scan:{address}:{chain}` that were created before the RealT/cache fixes. Note v0.3.1: current namespace is `scan:result:{address}:{chain}` via the cache-key registry.
- **`shouldCacheAssets()`** now refuses to persist critical partial scans: `token accounts: no data`, `balances fetch`, `balances HTTP`, and `native balance failed on all`.

### Tests / validation
- **`apps/api/src/scan-cache-policy.test.ts`** added coverage for the scan result namespace, non-EVM cache fallback under `forceRefresh`, and critical SVM/Cosmos cache rejection.
- Validation: `scan-cache-policy.test.ts` 6/6 pass, API typecheck clean, Railway API deployment `66acf12d-a56d-4e0e-9165-a96ba5d41ee1` success.
- Production Playwright check on 10 wallets / 181 chains: Gnosis RealT ~1087.99Ôé¼, SVM ~37.12Ôé¼, Cosmos ~5.05Ôé¼, total ~2195.10Ôé¼.

## 2026-05-22 ÔÇö Cache fix + Schema hardening + Docs cleanup

### Fix ÔÇö forceRefresh did not bypass scan result cache
- **`apps/api/src/plugins/scan.ts`** : `forceRefresh=true` bypassed `effectiveCache` (engine-level) but NOT the top-level scan result cache (`scan:{addr}:{chain}`). A first scan with broken pricing stored a nil result ÔåÆ all subsequent `forceRefresh=true` scans returned the poisoned cache in 25ms. Fix: `if (!forceRefresh)` guard around the cache check loop in sync handler (l.141) and batch EVM handler (l.331). Non-EVM path already had the guard. Commit `2a544fd`.

### Security ÔÇö Schema validation strict mode
- **`apps/api/src/schemas.ts`** : `ScanRequestBodySchema` and `BatchScanRequestBodySchema` changed from `.passthrough()` to `.strict()`. Unknown fields now cause validation errors instead of being silently accepted.

### UI ÔÇö ErrorBoundary + Preferences persistence
- **`apps/web/components/ErrorBoundary.tsx`** : global React error boundary with fallback UI, wrapped around `<SidebarLayout>` in `layout.tsx`.
- **`apps/web/components/PreferencesProvider.tsx`** : currency/language persisted in localStorage (`wcore_currency`, `wcore_language`), read at mount, fallback to defaults if invalid.

### Docs ÔÇö Consolidation + cleanup
- **`ROADMAP.md`** : consolidated TODO from all audits, merged duplicate v0.2.25 sections, added current source reference.
- **`docs/archive/`** : moved `AUDIT.md`, `SESSION_SUMMARY.md`, `RELEASE_NOTES.md`, `docs/gpt5.5/*` to archive with README.
- **`scripts/archive-x/`** : moved 25 one-off X automation scripts; reusable scripts kept.
- **`README.md`** : audit link updated to `ROADMAP.md` + `docs/archive/`.
- **`apps/web/app/layout.tsx`** : metadata updated from 130+ to 180+ chains.
- **`AGENTS.md`** : added forceRefresh cache bypass gotcha + version sync.
- **Execution plan** : `docs/superpowers/plans/2026-05-22-roadmap-execution.md`.

### Validation
- `pnpm --filter @wcore/api typecheck` Ô£à ┬À `pnpm --filter @wcore/web build` Ô£à ┬À Core tests 168/168 Ô£à
- Deployed to Railway (api + web). Verified: `Content-Type: application/json`, `wcore.xyz` serves WCORE.

## v0.2.25 ÔÇö Scan batch global + GM streak self-heal + BASE resilience (2026-05-21)

### Fix ÔÇö scan batch endpoint silently fell through to per-wallet path
- **`apps/api/src/plugins/scan.ts`** : `/api/scan/batch` used `require("@wcore/core")` inside an ESM module ÔåÆ silent throw inside `try/catch` ÔåÆ `evmChains = []` ÔåÆ every chain landed in the `nonEvmChains` individual-scan path. No Multicall3, no `scan:{addr}:{chain}` cache hit, BASE timing out on 10-wallet deep scans, "batch ne marche pas" UX report.
- **Fix** : destructure `getChain` from the existing `await import("@wcore/core")` a few lines below. EVM/non-EVM split now works.
- **`BATCH_CHAIN_TIMEOUT_MS`** introduced (180 s, vs 90 s shared `CHAIN_TIMEOUT_MS`) ÔÇö absorbs a deep scan over 10 wallets in a single Multicall3 on BASE/ETH.
- **`apps/web/components/WalletContent.tsx`** : removed `&& !deepScan` so batch is also used in deep mode (the slowest path was the one most in need of batching). Client `AbortSignal.timeout` aligned to 180 s.
- **Global VM scheduler** : the frontend now builds one queue of `(VM, chain, compatible wallets[])` jobs. `GLOBAL_CHAIN_CONCURRENCY=30` applies across EVM, SVM, and Cosmos combined. Each EVM job calls `/api/scan/batch` once for all EVM wallets on that chain; SVM/Cosmos jobs use the same batch endpoint and server fallback. This avoids EVM monopolizing the scan and prevents 4├ù duplicate EVM scans.

### Growth ÔÇö One Scan Flow post
- **Post X** : `https://x.com/WCORExyz/status/2057542358670189016`.
- **Visual** : `apps/web/public/wcore-post-global-scan-queue.svg` + `.png` (`1200x675`). `.gitignore` includes a targeted exception so the PNG can be versioned despite the global `*.png` ignore.
- **Angle** : user-facing scan flow improvement ÔÇö multi-wallet scans share one queue across EVM, Solana and Cosmos; results stream progressively; no VM waits for a separate scan phase.

### GM streak self-heal + on-chain backfill
- **New `apps/api/src/gamification/gm-streak-rebuild.ts`** : `rebuildChainStreakFromOnchain(deps, userId, address, chainKey)` fetches all `GmCheckedIn` events for a user on a chain (paginated 100k-block fallback if RPC rejects `earliestÔåÆlatest`), upserts missing `GmContract` + `OnchainGm` rows (idempotent on unique constraints), merges DB rows with chain logs (the just-inserted tx is counted even if the RPC hasn't indexed it yet), recomputes `gmStreak` (consecutive UTC days back from today/yesterday) + `longestStreak` (max consecutive run), upserts `UserChainGm`, returns `RebuildEvent[]` with `wasInserted` flags.
- **`apps/api/src/gamification/gm-onchain.ts`** : after each successful tx + DB commit, `/api/gm/onchain` now calls `rebuildChainStreakFromOnchain` for the active chain ÔåÆ self-heals from chain truth. A prior missed GM is reconciled at the next successful submission.
- **New endpoint `POST /api/gm/backfill`** body `{ chainKey?: string }` : with no `chainKey`, loops over every chain in `GM_FACTORIES`. Rebuilds per chain, aggregates events across chains, recomputes `user.gmStreak`/`longestStreak`/`lastGmDate` (general streak = union of UTC days), applies the score delta only for rows newly inserted in this run (per-chain `5 + chainStreak`, general `20 + generalStreak*2` for the first GM of the day) ÔåÆ idempotent, no double counting. Returns `{ backfilled, errors, scoreDelta, currentGeneralStreak, longestGeneralStreak, lastGmDate }`.

### Validation
- `apps/api` `tsc --noEmit` Ô£à ┬À `apps/web` `tsc --noEmit` Ô£à
- Deployed to Railway (api + web).

## v0.2.21 ÔÇö Stripe removed + ME-2 + Discovery fix + Plugin tests (2026-05-19)

### Stripe removal
- **`apps/api/src/billing.ts`** deleted ÔÇö billing plugin, checkout, webhook, portal removed.
- **`fastify-raw-body`** removed from `server.ts` + `package.json`.
- **`packages/db/prisma/schema.prisma`** : `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` columns removed from User model.
- **`apps/web/app/pricing/PricingClient.tsx`** : Stripe checkout replaced with free plan page.
- **`docker-compose.prod.yml`** + **`.env.production.template`** : all STRIPE_* env vars removed.
- **Docs** : `DEPLOY.md`, `AGENTS.md`, `ROADMAP.md`, `SESSION_SUMMARY.md` cleaned of Stripe references.
- **`pnpm-lock.yaml`** regenerated after package removal ÔåÆ Railway build fixed.

### ME-2 ÔÇö `Promise.any` on onchainRpc.batch
- **`packages/core/src/engines/evm.ts`** : sequential `for...of` failover replaced with `Promise.any`. All RPCs raced in parallel, first success wins. Up to 5s saved per batch on flaky RPCs.

### Fix ÔÇö discovery `trustExplorerWhenClean`
- **`packages/core/src/tokens/discovery.ts`** : `discoverTokensForWallet` was ignoring the `trustExplorerWhenClean` flag, always calling `logDiscovery` even when Blockscout had already found tokens. Added early returns when explorer found tokens or returned clean.
- **138/138 core tests passing**.

### Tests ÔÇö Admin + Wallet plugin privilege guards
- **`apps/api/test/admin-plugins.test.ts`** : 13 tests ÔÇö 401 without token, invalid token, admin cookie bypass removed (H1 fix), CORS headers, conditional happy path.
- **`apps/api/test/wallet-plugins.test.ts`** : 20 tests ÔÇö scan ownership, custom tokens CRUD, scan sharing, cross-user isolation, 404/403 guards.

### Railway ÔÇö Lockfile fix
- **Root cause** : `pnpm-lock.yaml` was stale after `fastify-raw-body` and `stripe` removal ÔåÆ `ERR_PNPM_OUTDATED_LOCKFILE` on Railway build.
- **Fix** : `pnpm install` local ÔåÆ commit `ab344dc` pushed ÔåÆ API + Web redeployed successfully.

### Validation
- `pnpm --filter @wcore/core build` Ô£à ┬À `pnpm --filter @wcore/api build` Ô£à
- Core tests 138/138 Ô£à ┬À Lint clean Ô£à
- Railway API Ô£à 200 ┬À Web Ô£à 200

## v0.2.20 ÔÇö Audit triple shipped (2026-05-19)

### Security
- **H1 ÔÇö admin scam-override cookie fallback removed** (`apps/api/src/plugins/admin.ts`): the route no longer derives admin authority from a session cookie when ADMIN_TOKEN is unset/wrong. A stolen platform-owner cookie can no longer write to scam overrides.
- **M2 ÔÇö Scam symbol normalization**: scam-override now uppercases `sym` for both in-memory and DB writes, eliminating casing-divergent lookups during a live session.

### Pricing ÔÇö RealToken bulk registry
- **Root cause**: per-contract API calls timed out ÔåÆ circuit breaker tripped ÔåÆ cascade fell through to DexScreener/GeckoTerminal illiquid pools, which returned wildly wrong prices (~$50 RealT tokens shown as Ôé¼6-14). The wrong price was then cached for 1h, poisoning future scans.
- **Fix**: `packages/core/src/pricing/sources/realt.ts` switched to a single bulk fetch of `https://api.realtoken.community/v1/token` (829 tokens in one HTTP call). Result is a contractÔåÆprice registry mirrored in Redis (`realt:registry:v2`, 6h refresh, infinite stale fallback). Lookup is O(1).
- **Anti-poisoning**: `cascade.ts` short-circuits the main price cache for known RealT contracts and returns `REALT_PRICE_UNAVAILABLE` on miss, never falling back to DEX/GT.
- **Type**: new `RealTSource extends TokenPriceSource` interface exposes `isKnownRealTContract(token)`.

### Perf ÔÇö Logos lifted off the pricing hot path
- **QW-2/LR-1**: `priceToken` in `evm.ts` was awaiting `resolveTokenLogoAsync` per token, blocking the cascade with up to 2 sequential HTTP fetches (Blockscout + DexScreener) on every cold scan. Logos are UI-only.
- **Fix**: new `resolveTokenLogoCachedOrFallback` (Redis-only, sync fallback to TrustWallet/CMC, never HTTP) on the hot path, plus `prefetchTokenLogo` fire-and-forget with module-level single-flight Map. 30 concurrent scans of the same `(chain, contract)` issue exactly one HTTP fetch. Next scan returns the high-quality logo.
- **QW-1**: two sequential Redis GETs (logo hit + miss keys) collapsed into one `Promise.all` round-trip (~15ms saved per token).
- **QW-3**: `metadata.ts` skips `resolveTokenLogoAsync` when the cached token already has a usable `logoUrl`, eliminating a redundant Redis+HTTP call per metadata cache hit.

### Docs
- **QW-4**: `.env.example` and `DEPLOY.md` aligned to the actual `SCAN_CONCURRENCY` default of **30** (intentional since 2026-05-18 to reduce RPC free-tier saturation; was drifting against the documented 50).

## Unreleased ÔÇö DB Recovery + GM History Restore (2026-05-18)

### Incident ÔÇö Production DB wiped by test suite
- **Root cause**: `.env.test` contained `TEST_DATABASE_URL` pointing to production Railway DB (`viaduct.proxy.rlwy.net:51381`). Running `pnpm test` executed `deleteMany()` on all production users.
- **Impact**: User account wiped (streak=11, score=1338, plan=admin, 38 GM contracts, all onchain_gms).
- **Fix**: `.env.test` now points to `localhost`. `apps/api/set-test-env.js` explicitly rejects `localhost`, `127.0.0.1`, `::1` in `TEST_DATABASE_URL` for production runs.

### Recovery ÔÇö Full GM history restored from on-chain data
- **Method**: `scripts/recover-gm-history.ts` scanned all 38 GM contracts via `eth_getLogs` (500k blocks back, chunked by 10k).
- **Chains with RPC issues**: cyber, scroll, openledger, sei, tac required special handling:
  - **sei**: RPC limits block range to 2000 blocks ÔåÆ used explorer API (seiscan.io) to find tx hashes, then `eth_getTransactionReceipt` for tipWei.
  - **tac/openledger**: RPC limits block range ÔåÆ explorer APIs (explorer.tac.build, scan.openledger.xyz) provided tx hashes.
  - **cyber/scroll**: deep RPC scan with 500-block chunks found events that standard 1000-block scans missed.
- **Result**: 160 onchain_gms restored across 38 chains, 12 active days (2026-05-07 ÔåÆ 2026-05-18).
- **User state**: streak=12, longest=12, score=1671, lastGmDate=2026-05-18T05:35:34Z.

### Backup system ÔÇö Windows-compatible Prisma-based
- Replaced `pg_dump` dependency with `apps/api/backup-db.cjs` (Node.js/Prisma, zero external deps).
- Scheduled task `WCORE_DB_Backup` updated to use new script.
- Daily backups in `backups/` with 7-day rotation.

### Audit P1ÔÇôP6 fixes (commit `f65e3ac`)
- **P1**: GM refactor typecheck (`prisma` passed to `createGmHelpers`).
- **P2**: Rate-limit Bearer spoof removed; refresh token `type === "access"` check.
- **P3**: Auth gates use `isAuthenticated` deps; `WalletProvider` listens to `wcore-logout`; `apiFetch` dispatches event on retry 401.
- **P4**: Scam filtering on sync per-chain totals + async scan accumulation.
- **P5**: Redis cache shared across sources; SVM/Cosmos keys scoped by chain; `onchainMarkerKey()` canonical.
- **P6**: 22 new regression tests (`scam-filtering`, `auth`, `scan`, `cascade`).

### Fix ÔÇö RealT pricing diagnostic logging
- Added `console.log`/`console.error` to `RealTPriceSource` to diagnose why Gnosis RealT tokens show wrong prices (DexScreener/GT pool prices instead of api.realtoken.community prices).
- Added `User-Agent: WCORE/1.0` header to RealT API requests (some APIs block headless fetches).
- Logs: `[RealT] Fetching {contract}`, `[RealT] Cache hit`, `[RealT] HTTP {status}`, `[RealT] Error`.
- File: `packages/core/src/pricing/sources/realt.ts`.

## Previous ÔÇö Audit Ultra 2026-05-18 (ALL 10 punch list items shipped)

### Audit & rapports
- 4-domain parallel audit (security + performance + quality + chains). 2 CRITICAL ┬À 14 HIGH ┬À 27 MEDIUM ┬À 13 LOW findings total.
- Reports persisted in `.omc/research/audit-2026-05-18-{security,performance,quality,chains,CONSOLIDATED}.md`.

### CRITICAL fixes
- **C1+C2 ÔÇö Secrets sanitization**: `scripts/backup-db.ps1` no longer hardcodes the Railway Postgres password; reads `$env:BACKUP_DATABASE_URL` or a gitignored `scripts/.env.backup`. The leaked `JWT_SECRET` (commit `f9e47ca`, `.env.staging`) and Postgres password must be rotated on Railway side ÔÇö file is no longer tracked but lives in git history.

### HIGH fixes
- **H8 chains ÔÇö Avalanche `LLAMA_CHAIN_SLUG`**: added `"avax"` to `packages/core/src/chains/AVALANCHE.ts`. Without it, DefiLlama Coins lookups silently fell through to DexScreener/GT (DefiLlama uses `avax`, not `avalanche`).
- **H1 security ÔÇö LinkedWallet partial unique index**: migration `20260518120000_linked_wallet_signed_unique` adds a partial unique index on `linked_wallets(address) WHERE verificationStatus='SIGNED'`. UNSIGNED claims remain shared. Pre-existing duplicates are demoted to UNSIGNED keeping the oldest signer as owner. `apps/api/src/auth.ts` now catches P2002 and returns `409 address_already_verified`.
- **H4 perf ÔÇö GT throttle singleton**: `packages/core/src/pricing/sources/geckoterminal.ts` now uses a process-level `sharedGtThrottle` shared across all `GeckoTerminalPriceSource` instances. Eliminates the 50├ù budget multiplication under `SCAN_CONCURRENCY=50`.
- **H5 security ÔÇö Rate-limit catch-all**: `server.ts:255-256` covers all `/api/*` endpoints not explicitly rate-limited (anti-DoS for undocumented/future endpoints).
- **H5/H6 perf ÔÇö Parallel SVM/Cosmos pricing**: both engines use `PRICING_CONCURRENCY=10` worker pools to avoid GT throttle starvation under `SCAN_CONCURRENCY=50`.
- **H9 quality ÔÇö pg_dump backup**: `scripts/backup-db.js` uses native `pg_dump` (not `$queryRawUnsafe`), with 7-day rotation.

### Security ÔÇö JWT HttpOnly Cookie Auth (H2/H3)
- Replaced Bearer token in `localStorage` with HttpOnly cookie-based JWT auth (`wcore_access` 15min + `wcore_refresh` 7d).
- Backend: `auth.ts` rewritten (login/refresh/logout with cookies, Redis revocation, backward-compat Bearer fallback).
- Frontend: ~20 files migrated to `apiFetch()` from `@/lib/api` (auto-refresh on 401, `credentials: "include"`).
- `server.ts`: cookie plugin registered, CORS credentials enabled, rateLimitIdentity cookie-aware.
- E2E tests updated for cookie auth.

### Chains ÔÇö Migrate ritual chains (H7)
- Added 8 new chain configs: **Celestia**, **Noble**, **Neutron**, **dYdX**, **Kava**, **Stride**, **Stargaze** (Cosmos SDK), **SurfLayer** (EVM).
- All configs follow the existing pattern (publicnode RPCs, correct denoms/decimals, llama/gecko IDs).

### Perf ÔÇö H6 Redis-backed pricing cache (all 3 engines)
- Replaced per-engine `MemoryPricingCache` with shared `RedisPricingCache` (adapts `CacheStore` ÔåÆ `PricingCache`).
- TTL 6h prices / 24h markers. Keys prefixed `price:` / `marker:`.
- Wiring: `opts.sharedPriceCache` in EVM/SVM/Cosmos engines ÔåÆ `dispatch.ts` ÔåÆ `scan.ts` creates Redis instance at boot.
- All 3 VMs benefit from cross-scan pricing sharing and API restart survival.
- New files: `packages/core/src/pricing/redis-pricing-cache.ts`, migration `20260518103000_add_scam_override_contract`.
- Modified: `evm.ts`, `svm.ts`, `cosmos.ts`, `dispatch.ts`, `scan.ts`, `admin.ts`, `pricing/index.ts`, `scam-detector.ts`, `TokenTable.tsx`, `WalletContent.tsx`, `schema.prisma`.

### Fix ÔÇö Scam override contract propagation + frontend sync
- Admin button now sends `contract` to `/api/admin/scam-override` (was symbol-only).
- DB `upsert` no longer overwrites `contract` with `null` when absent from request.
- New endpoint `GET /api/admin/scam-overrides` returns all overrides with contracts.
- New hook `useScamOverrideSync` fetches overrides from API at mount, merges into `localStorage`.
- Migration adds `scam_overrides.contract` column + seeds `NEGED` with Base contract.

### Fix ÔÇö ConnectButton wagmi auto-connect regression + auth rehydration + GmButton gate
- New `authStep = "ready"` state: wallet address visible, "Sign In" button shown, but NOT treated as authenticated.
- GmPageClient, ProfileClient, GmButton all gated on `authStep === "authenticated"` (not just `address`).
- BUG 1: non-200/non-401 API errors no longer auto-authenticate (now `setAuthStep("expired")`).
- BUG 2: network error `.catch()` no longer auto-authenticates (now `setAuthStep("expired")`).
- BUG 3: uses server-verified address from `/api/auth/me` response instead of localStorage.

### Already done (confirmed in codebase)
- **M ÔÇö Cascade reorder**: `cascade.ts:79-83` already runs onchain-v3 before CoinGecko + NEED_ONCHAIN marker retry.

### Operator actions required
1. Rotate `JWT_SECRET` on Railway staging (the committed value at `f9e47ca` remains valid until rotated).
2. Rotate Postgres password on Railway (the previously hardcoded value remains valid until rotated).
3. Run `pnpm prisma migrate deploy` on staging then prod to apply the partial unique index.

## Previous ÔÇö Scan Reliability + Scam Rules

### Chain Coverage
- Added 3 mainnet chains to align WCORE scan coverage with onchaingm.com (85/85 mainnets now scannable): **Codex** (chainId 81224, native ETH, RPC `rpc.codex.xyz`), **0G Mainnet** (chainId 16661, native 0G, RPC `0g.drpc.org` + `evmrpc.0g.ai`, gecko_id `zero-gravity`), **XDC Network** (chainId 50, native XDC, 5 public RPCs, gecko_id `xdce-crowd-sale`).
- New configs: `packages/core/src/chains/{CODEX,OG,XDC}.ts` + wired into `packages/core/src/chains/index.ts`. ChainIds confirmed via live `eth_chainId`. GM factory addresses not extended (out of scope of scan coverage).
- Added 4 mainnet chains to align WCORE scan coverage with surflayer.xyz (73/73 Surflayer mainnets now scannable): **JuChain** (chainId 210000, native JU, RPC `rpc.juchain.org`), **Mint Blockchain** (chainId 185, native ETH, 3 RPCs `*.rpc.mintchain.io`), **Conflux eSpace** (chainId 1030, native CFX, RPC `evm.confluxrpc.com`, gecko_id `conflux-token`), **Incentiv** (chainId 24101, native INC, RPC `rpc.incentiv.io`).
- New configs: `packages/core/src/chains/{JUCHAIN,MINT,CONFLUX,INCENTIV}.ts` + wired into `index.ts`. ChainIds confirmed via live `eth_chainId` (0x33450, 0x406, 0x5e25; Mint via chainid.network). Native price IDs for JuChain/Incentiv left empty ÔÇö cascade fallback handles missing native pricing.
- Added 7 Cosmos zones to broaden L1 coverage beyond the EVM-heavy ritual platforms: **Celestia** (TIA, DA layer), **Noble** (USDC-native issuer, fees in USDC), **Neutron** (NTRN, smart contracts L1), **dYdX** (DYDX, 18-dec native ÔÇö unusual for Cosmos), **Kava** (KAVA, EVM+Cosmos hybrid), **Stride** (STRD, liquid staking), **Stargaze** (STARS, NFT L1). REST endpoints validated live: 6/7 via publicnode, Noble via polkachu + cosmos.directory (publicnode does not host Noble).

### Security + Audit Hotfixes
- Linked-wallet signature verification now binds SVM/Cosmos public keys to the claimed wallet address before marking a wallet `SIGNED`.
- Added regression tests for SVM/Cosmos linked-wallet impersonation attempts.
- GM contract balance reads now authorize creators through `creatorAddress` or legacy `ownerId`, preserving access for older rows without `creatorAddress`.
- Notification SSE now uses a short-lived opaque stream token instead of putting the JWT in the EventSource URL.
- `GmOnChain.withdrawCreator()` now emits `CreatorWithdrew` with the actual withdrawn amount.
- Dependency audit overrides force patched `postcss` and `tmp` versions; `pnpm audit` reports zero vulnerabilities.

### Ops Notes
- Commit `c3f3adc` is local until a Git remote is configured for this clone.
- Staging validation used API port `4001` from `.env.staging`; normal dev/prod API default remains `4000`.
- PowerShell staging scripts repaired: both scripts are ASCII-safe for Windows PowerShell 5.1, and `smoke-test.ps1 -ApiPort 4001 -WebPort 3001` passes 15/15 checks locally.
- Full `deploy-staging.ps1 -SkipBuild` verification is pending outside the sandbox because Docker API access is denied here (`.docker/config.json` and named pipe).
- Next standalone correctly reads `process.env.PORT`; the earlier "PORT=3002 ignored" report was caused by a Manifest app running on port 3000 that confused the smoke test.
- CORS now accepts both `localhost` and `127.0.0.1` origins via comma-separated `CORS_ORIGIN` to prevent "Failed to fetch" when the browser uses a different loopback hostname.
- Manifest app removed entirely from system (`~\.manifest`, `~\manifest`, `wcore-web\.manifest`).
- `smoke-test.ps1` now validates "WCORE" in the response body to detect wrong-app-on-port.
- `deploy-staging.ps1 -AutoStart` detects port conflicts before launching services.
- `com.docker.service` may stop spontaneously in sandbox, requiring Docker Desktop restart to bring Postgres/Redis back up.

### Scam Detection
- **ETHG scam token filtered**: Ethereum Games (2M tokens x 0.25 EUR = 497k EUR) was inflating scan totals. Rule #9 added: unknown token + value > 1000 EUR + supply > 100k ÔåÆ scam (weight 3). Rule #6 also covers game-themed tokens with inflated supply.
- `SCAM_RULES_VERSION` bumped to 5 (core + frontend) to invalidate cached scam results.
- `detectScam` now applied in the API backend before computing scan notification totals, so the SSE notification no longer shows inflated scam-included amounts.

### Token Icons
- Fixed broken token icons from `spothq/cryptocurrency-icons` CDN (xdai, celo, arb, cro, frax, imx, ton). Overrides now use TrustWallet PNGs. TrustWallet uses `xdai` for Gnosis chain (not `gnosis`).

### Cache Alignment ÔÇö SVM & Cosmos
- **SVM cache fallbacks** : negative cache (`empty:`, 10 min), native balance cache (`native:`, 1h), token accounts cache (`ta:`, 1h), per-token cache (`token:{chain}:{mint}:{address}`, 1h). Tous avec fallback lecture si le RPC ├®choue.
- **Cosmos cache fallbacks** : negative cache (`empty:`, 10 min), bank balances cache (`bal:`, 1h), native balance cache (`native:`, 1h), per-token cache (`token:{chain}:{denom}:{address}`, 1h), staking caches (`del:`, `unb:`, `rew:`, 1h chacun). Fallback lecture si la REST API ├®choue.
- **Tests unitaires** : 12 nouveaux tests dans `svm.test.ts` (4) et `cosmos.test.ts` (8) ÔÇö couvrent negative cache, fallback balance, fallback token accounts, per-token cache, staking fallbacks.
- **Tests d'int├®gration Redis** : `apps/api/test/cache-integration.test.ts` ÔÇö 9 tests end-to-end v├®rifiant les cl├®s Redis apr├¿s vrais appels `/api/scan` (SVM + Cosmos). `sharedCache` export├® depuis `server.ts`.
- **Total tests** : 123/123 (core) + 9 tests d'int├®gration Redis.

### Scan Reliability
- Deep scans now use async polling for every deep request, not only large chain sets.
- Async scan polling forwards the same `Authorization` header used to create the job; authenticated jobs no longer poll as anonymous and loop on hidden 404s.
- Unknown chain keys returned by the frontend are skipped by backend validation instead of crashing the whole scan payload.
- EVM deep discovery keeps the 500k block range but chunks `eth_getLogs` in parallel groups.
- ERC-20 balance reads use Multicall3 batching on EVM chains before pricing.
- ERC-20 balance fallback reads now run in bounded parallel groups when Multicall3 misses, reducing latency on chains with partial Multicall/RPC failures.
- EVM scans run native-balance read+price in parallel with token discovery instead of sequentially.
- GeckoTerminal prices are now bulk-fetched in 1 HTTP call per chain instead of individually per token, pre-warming the shared price cache.
- Pricing cascade now runs DexScreener + DefiLlama in parallel after llama-map misses, cutting one sequential HTTP roundtrip.
- Empty wallet/chain results are memoized for 10 minutes per `(wallet, chain)` so re-scans of inactive chains skip the full RPC cascade and surface as `[CACHED_EMPTY]` (EVM + SVM).
- SVM scans now report `scanMs` (was always 0) and propagate the same negative-cache short-circuit as EVM via the dispatcher.
- Cosmos scans now report `scanMs` so async-job metrics no longer collapse to 0 for COSMOS chains.
- Each `ChainScan` exposes `phases.{nativeMs, discoveryMs, balancesMs, pricingMs}` so scan latency can be attributed by stage across all VMs.

### Tests
- API test runner now uses `--test-concurrency=1`. Multiple test files were stepping on each other through the shared Prisma database (e.g. `support tickets > admin users still see all tickets` would fail intermittently when run alongside `gamification` / `share` suites). Sequential file execution removes the flake without altering individual test logic.

### Token Coverage
- ZERO Network WBTC (`0xf1f9e08a0818594fde4713ae0db1e46672ca960e`) added to the token registry.
- ZERO WBTC pricing mapped to `coingecko:wrapped-bitcoin`.
- Wallet scan cache namespace bumped to `v3` so existing browser caches do not hide newly registry-backed ZERO WBTC.
- BSC token registry expanded with SOL, EURI, RIVER, HLG, FROG to fix discovery gap on BNB Chain where RPC log range cannot reach older tokens.

### Scam Detection
- Unknown high-value game tokens with inflated supply are now flagged as scam, covering ETHG / Ethereum Games.
- `SCAM_RULES_VERSION` bumped so cached scan results are re-evaluated with the new rules.

### UX
- Linked wallets can now be added as server-synced view-only wallets without signing immediately. Rows display `Unsigned` / `Signed`, and unsigned wallets can be upgraded later with `Sign later`.
- Connected-wallet-without-SIWE-token state now shows "Sign in required" instead of allowing silent no-op GM clicks.
- Deep scans now show a compact loading card with global weighted `chain checks`, based on wallet VM compatibility and per-wallet chain counts.
- Deep scan progress now displays at least `1%` once one real chain check has completed, avoiding misleading `1/N` with `0%`.
- Header on-chain GM now syncs from ChainCard GM completion without requiring a page refresh.
- Header on-chain GM label now reads `On-chain +25 pts`, without the gas-fee copy.
- Optimism chain icon now uses a stable PNG fallback instead of the unreliable generated Llama icon URL.
- Optimism token `OP` now uses a stable PNG logo override instead of the broken `spothq` `op.svg` URL.

---

## v0.1.18 ÔÇö Full Audit + Share Reports (2026-05-07)

### Audit ÔÇö 27/27 Fixed
- **HIGH(7)**: deploy RPC timeout, GM API before localStorage, SIWE chainId bypass, ETH price oracle, admin NODE_ENV check, JWT expiration validation, stablecoin detection expansion
- **MEDIUM(13)**: circuit breaker events, dispatcher unhealthy fallback, ChainCard factories sync, cosmos timeout, Docker HEALTHCHECK node, scam-detector O(n), metrics reset, amino key parsing, CSV pipe neutralization
- **LOW(7)**: memory-cache negative ttl, various minor edge cases

### Shareable Reports
- `POST /api/scans/:id/share` + `DELETE` ÔÇö public share links (owner-only)
- `GET /api/public/scans/:shareToken` ÔÇö no-auth read with expiry
- `/share/[token]` page ÔÇö read-only portfolio + PDF

### Tests: 133/133 (89+34+7+3), Typecheck 5/5

---

## v0.1.17 ÔÇö Monetization (2026-05-07)

### Plans (retired ÔÇö Stripe removed in v0.2.21)
- `User.plan` (free/admin), `PLAN_LIMITS` retired. All users have unlimited access.

### Usage Dashboard
- `/api/me/plan` enriched: `scansUsedToday`, `scansRemainingToday`, `resetAt`
- Profile: usage bar + reset timer + plan card
- Homepage: "X scans left today" badge (color-coded)

### Upgrade UX
- `/pricing` page: Free vs Pro comparison
- Scan limit error: "Upgrade to Pro" link when limit hit
- Multi-wallet PDF lock: disabled for Free, "(Pro)" label

---

## v0.1.16 ÔÇö Ops Monitoring & Admin (2026-05-07)

### Admin Dashboard (`/admin`)
- Health cards, circuit breakers, GM stats (24h/7d/30d), rate limits
- Chain errors + slow chains, recent scans
- Admin auth: `ADMIN_TOKEN` env var, login form, sessionStorage

### Persistent Metrics
- `SystemMetricSnapshot` table, 5min snapshots, 7d retention
- CSS bar charts for scans, GM, pricing/RPC errors

### Ops Timeline
- `OpsEvent` model: circuit open/close, health degraded, DB/Redis down
- Type filter dropdown, severity dots, 7d retention

### Webhook Alerting
- `ALERT_WEBHOOK_URL` ÔåÆ POST JSON on critical events
- Fire-and-forget, 5s timeout

### SIWE UX Polish
- Auth states: idleÔåÆconnectingÔåÆsigningÔåÆverifyingÔåÆauthenticatedÔåÆexpired
- User-friendly error messages, JWT expiration, clean reconnect

### PDF v2
- Branded WCORE cover, exec summary, page numbers, warnings
- `PdfTokenTable` reusable component

### Notifications
- Triggers: scan completed, GM streak, first GM
- In-app via NotificationsBell (SSE + polling)

---

## v0.1.15 ÔÇö Hardened (2026-05-07)

- Full SIWE (EIP-4361): domain, URI, chainId, issuedAt, expiration
- Consensus RPC/SVM strict
- Factories config (Base only)

## v0.1.14 ÔÇö GM System (2026-05-06)

- GM on-chain/off-chain with per-chain tracking
- Creator dashboard with tipWei
- GM contract deploy with on-chain verification

## v0.1.13 ÔÇö Auth Fix (2026-05-06)

- Critical EVM login bug (nonce: prefix)
- Rate-limiting 3 tiers
- Non-blocking my-contracts

## v0.1.11 ÔÇö API Bug Fixes & Cleanup (2026-05-06)

### API Fixes (courtesy of GPT-5.5 audit)
- **Removed implicit Base RPC fallback**: `CHAIN_RPCS[chainKey] ?? "https://mainnet.base.org"` removed. Unknown chains now return `400 unsupported_chain` instead of silently verifying on Base.
- **Multi-chain GM contract balance checking**: `getChainRpc()` replaces hardcoded Base-only RPC map. Balances work for all configured chains.
- **UTC date normalization**: all GM date comparisons use `startOfUtcDay()` instead of local server timezone, preventing double-GM near midnight.
- **Anti-replay fixed**: `onchainGm.create()` now happens **after** successful TX verification. A failed verification can never poison a txHash.
- **Race condition guard**: GM off-chain uses `updateMany` with `lastGmDate < today` condition, preventing parallel double-GM.
- **`extractDeployedContractAddresses` helper**: factored and unit-tested, correctly reads contract from `topics[1]` and filters by creator in `topics[2]`.

### Cleanup
- **Deleted duplicate worktree**: `.worktrees/gm-onchain-v2/` (~50MB duplicate)
- **Deleted 51 debug scripts**: `query-*`, `debug-*`, `test-*`, `screenshot-*`, `verify-*`, `manifest-*`
- **Deleted temp files**: `api.err`, `api.log`, `package-lock.json`, 7 screenshots
- **Deleted legacy folders**: `pulls/`, `packages/db/backups/`, `.tmp/`, `.temp_delete/`
- **Pruned old backups**: kept only 3 latest in `.backups/`
- **Removed unused dependency**: `siwe` removed from API package.json
- **Removed dead code**: `autoCompleteQuests()`, `GM_CREATOR_FEE_BPS`, hardcoded owner check in profile
- **Startup non-blocking**: `seedGamification` and `seedGmContracts` no longer block server startup

### Solidity
- **Fixed naming conflict**: `interface GmFactory` ÔåÆ `IGmFactory`, `interface GmOnChain` ÔåÆ `IGmOnChain` (prevents compilation error when both files are compiled together)

### UI/UX
- **Typo fixed**: "Deploy GM Contrat" ÔåÆ "Deploy GM Contract"
- **Tip indication**: GM buttons now show "~$0.05 tip" and "~$0.10 fee" in tooltips
- **Scam detector improved**: `.com`/`.io`/`.net`/`.org` no longer auto-flag tokens; only unknown domains are flagged. Known domains (Uniswap, Aave, etc.) are whitelisted.
- **React keys fixed**: `TokenTable` uses `asset.contract ?? asset.symbol` instead of `symbol-index` (prevents duplicate-key collisions)
- **Accessibility**: added `aria-label` to refresh, GM, and deploy buttons in `ChainCard`

## v0.1.10 ÔÇö GM Daily Sync Fix (2026-05-05)

### Bug Fixes
- **Unified daily GM tracking**: single `wc_gm_date` localStorage key for both on-chain and off-chain GM
- **Cross-component GM sync**: `CustomEvent("wcore-gm-done")` broadcast ensures `ChainCard` and `GmButton` stay synchronized
- **ChainCard state update**: `alreadyGmToday` is set immediately after `sendGm()` succeeds
- **GmButton listens for on-chain GM**: detects when a GM is done via ChainCard and shows "Ô£à GM"
- **Public contracts API**: removed `ownerId: null` filter so user-deployed contracts are visible for GM detection

## v0.1.9 ÔÇö Security & Performance Audit (2026-05-05)

### Security
- **JWT secret warning**: added startup warning when JWT_SECRET is not set, explaining that tokens will be invalidated on restart
- **Circuit breaker per chain**: replaced global circuit breaker with per-chain breakers to prevent one degraded chain from blocking all others
- **GM on-chain verification**: points are no longer credited if transaction verification fails on-chain (prevents spam with invalid txHash)
- **Anti-replay cleanup**: if tx verification fails, the anti-replay entry is removed so the user can retry

### Bug Fixes
- **GM "Failed to fetch"**: `sendGm` no longer blocks on API failure after a successful on-chain transaction. API sync is best-effort.
- **GM button always active**: added `alreadyGmToday` check in `ChainCard` using localStorage. Button shows "Ô£à GM" and is disabled after daily GM.
- **ETH price check**: `sendGm` now validates `ethPrice > 0` before calculating tip to prevent NaN/Infinity crashes
- **Error handling**: `fetchScan` now preserves previous results when a scan fails instead of showing empty data

### Performance
- **Leaderboard N+1 queries fixed**: replaced 150 sequential `prisma.count()` calls with 3 batched `groupBy` aggregations + 1 `$queryRaw`
- **React.memo on ChainCard**: wrapped `ChainCard` in `memo()` to prevent unnecessary re-renders during scan progress updates
- **Cache versioning**: added `CACHE_VERSION = 2` to localStorage cache keys. Old format entries are auto-invalidated on format changes.

### Code Quality
- **Eliminated casts `any`**: replaced `(asset as any)._isScam` with typed `AugmentedTokenAsset` interface in `TokenTable.tsx`
- **Typed error fallback**: replaced `as unknown as WalletAssets` with proper `WalletAssetsError` type in `@wcore/core`

## v0.1.8 ÔÇö GM Contract Detection Fix (2026-05-05)

### GM Contracts
- **Fixed contract detection for externally deployed contracts**: contracts deployed via MetaMask (not through the app UI) are now properly detected
- **Fallback to public contract list**: when `/api/gm/my-contracts` returns empty (missing ownerId), the hook falls back to `/api/gm/contracts`
- **API upsert fix**: `fetchOnChainContracts` now updates `ownerId` during upsert to associate contracts with the correct user
- **Empty state in profile**: `GmContractsPanel` now shows a helpful message when no contracts are deployed instead of hiding entirely

## v0.1.7 ÔÇö Wallet Labels Fix (2026-05-05)

### Wallet Labels
- **API source of truth**: wallet labels are now fetched from `/api/wallets` and take precedence over localStorage
- **Profile saveLabel**: updates localStorage immediately so other pages see the change without reload
- **Removed hardcoded "Connected" label**: replaced with truncated address fallback; visual dot indicator in WalletManager instead
- **WalletContent race condition fixed**: labels fetched from API are now applied to scan results via reactive useEffect
- **Case-sensitive address comparison fixed**: prevents duplicate wallet entries when API returns checksummed addresses

## v0.1.6 ÔÇö Profile & Creator Suite (2026-05-05)

### Security
- **Gamification authorization audit**: `/api/gm/contracts/:id/balance` now enforces strict role-based access
  - Contract owners see `creatorBalance` only (platformBalance returns "0")
  - Platform owner (`0x17d518736Ee9341dcDc0A2498e013D33CFCDD080`) sees `platformBalance` for ANY contract (creatorBalance returns "0")
  - Unauthorized users receive `403 Forbidden`
  - Rate limiting now covers all `/api/gm/*` endpoints via `path.startsWith("/api/gm")`
- **Gamification security tests**: 5 new API security tests covering authorization, balance filtering, and rate limiting

### Database
- **Multi-chain schema**: `GmContract` now has `chainId`, `network`, and `explorerUrl` fields
- **Notifications model**: new `Notification` table with `type`, `title`, `body`, `read`, `metadata` (Json), indexed on `[userId, read]`

### Profile
- **Component decomposition**: monolithic 565-line `profile/page.tsx` split into 7 focused components
  - `ProfileStats`, `GmContractsPanel`, `PointsBreakdown`, `LinkedWallets`, `CustomTokens`, `RecentScans`, `LeaderboardPreview`
- **Notifications bell**: new notification system with bell icon, unread badge, dropdown panel, auto-poll every 60s
  - Endpoints: `GET /api/notifications`, `POST /api/notifications/:id/read`, `GET /api/notifications/unread-count`
- **Profile E2E tests**: 5 Playwright tests covering profile load, GM contracts visibility, withdraw button states

### Leaderboard
- **Aggregate metrics**: new `GET /api/leaderboard/stats` endpoint with Contracts, Tips, Streak, and GM counts per user
- **Time filters**: 7 days, 30 days, All-time tabs on leaderboard page

### Creator Dashboard
- **New `/creator` page**: dedicated dashboard for contract creators
  - Stats cards: Total GMs, Contracts, 30d GMs
  - `RevenueChart`: CSS-based 30-day activity bar chart
  - `GmLogTable`: recent GM activity with explorer links (Base, Ethereum, Arbitrum, Optimism, Polygon)
  - Endpoint: `GET /api/creator/stats`

### Tests
- **API test infrastructure**: `set-test-env.js` loader, `--test-force-exit` flag, test-mode server exports
- **24 API tests passing** (including 5 new gamification security tests)
- **5 E2E profile tests passing"

### Logo & Branding
- **New SVG logo**: hexagon with 3 symmetric orbital nodes representing multi-chain connectivity (EVM, Solana, Cosmos)
- **Logo integration**: header (clickable), hero section, footer, favicon (`icon.svg`), loading spinner (`LogoSpinner`)
- **Logo animation**: `animate-spin-slow` CSS keyframe for loading states
- **Loading states**: LogoSpinner integrated into scan progress bar (WalletContent) and skeleton screens (ScanSkeleton)

### UI/UX
- **Homepage hero copy**: rewritten to be more engaging. "Your crypto. Every chain. One view."
- **Layout width**: increased max-width across all pages for better desktop experience
  - Home, Profile, History, Deploy: max-w-3xl ÔåÆ max-w-5xl
  - Leaderboard: max-w-2xl ÔåÆ max-w-5xl
  - Creator: max-w-4xl ÔåÆ max-w-6xl

---

## v0.1.5 ÔÇö GM On-Chain Fixes & Documentation (2026-05-05)

### Gamification (GM)
- **On-chain contract detection**: API now scans factory `ContractDeployed` events via `eth_getLogs` when DB is missing contracts (Base RPC chunked scan: 10k blocks per query, up to 100k blocks back)
- **Fix POST body**: `POST /api/gm` now sends `body: JSON.stringify({})` ÔÇö Fastify rejects empty JSON bodies with `FST_ERR_CTP_EMPTY_JSON_BODY`
- **Fix UI dropdown**: dropdown no longer disappears brutally when `alreadyGm` state arrives from API; buttons are disabled in-place instead
- **Fix on-chain independence**: on-chain GM button is no longer disabled by off-chain GM state (different tracking systems)
- **Rename button**: "Deploy GM" ÔåÆ "­ƒÜÇ Deploy GM Contrat"

### Leaderboard
- **Move "How to earn points" above rankings**: section repositioned at top of page for better UX
- **Add fees & sustainability section**: explains fees are paid in native chain asset, platform funds maintenance, potential future airdrop for active participants
- **Fix typography**: replace dash separators with periods in feature descriptions

### Profile
- **Merge Platform Earnings into My GM Contracts**: single section shows both Creator and Platform balances per deployed contract
- **API balance endpoint**: `/api/gm/contracts/:id/balance` now returns `{ creatorBalance, platformBalance }` (selectors `0x62a5dbbc` for platform, existing for creator)
- **Dual withdraw buttons**: "Withdraw Creator" (green, visible to all) and "Withdraw Platform" (yellow, visible only to `0x17d518736Ee9341dcDc0A2498e013D33CFCDD080`)
- **Section reordering**: My GM Contracts now appears before Points breakdown and Linked Wallets
- **Text style consistency**: removed emojis from Points breakdown, replaced em-dashes and sentence dashes with periods

### Documentation
- Complete README rewrite for v0.1.x web platform
- AUDIT.md checklist updated with completed security items

## v0.1.4 ÔÇö Sync wcore-gsheet v4.15.42 + SVM Consensus (2026-05-05)

### Core Engine Fixes (port from wcore-gsheet v4.15.42)
- **SVM Native Balance Consensus**: `readSvmNativeBalance()` now queries all RPC endpoints in parallel (`Promise.allSettled`) and votes majority. Prevents stale-RPC zero balances from overwriting correct cached values (same fix as GAS `getBalanceWithConsensus()`).
- Compilation: 0 errors, tests: 74/74 pass

### Legacy GAS Sync
- Synchronized all 169 `.gs` files from `wcore-gsheet/src/`
- Regenerated 116 TypeScript chain configs via `extract-chains.mjs`
- Verification: `verify-migration.js` (2 expected divergences: DIAG_BASE_RPC_AUDIT non-chain, FOGO `as Omit<>` parse)

## v0.1.3 ÔÇö Security Hardening & Test Stabilization (2026-05-05)

### Security
- Remove `/_dev/consensus-demo` route exposed without environment guard (`server.ts`)
- Fix rate-limiting to use `X-Forwarded-For` instead of `req.ip` only (`server.ts`)
- Make `JWT_SECRET` mandatory in `start-api.ps1` (removed weak default `dev-secret-change-me`)
- Make `DB_PASSWORD` mandatory in `deploy-staging.ps1` (removed weak default `wcore_staging`)

### Tests
- Refactor `auth.test.ts` to use `app.inject()` instead of external HTTP fetch (prevents server startup deadlock during test runs)
- Fix all Playwright E2E selectors (strict-mode violations on `Chains`, `ETH`, `Connect`, `Solana`)
- Stabilize degraded-chain test (`waitUntil: networkidle` ÔåÆ `domcontentloaded` + explicit wait function)
- All test suites green: core 74/74, API auth+scan, Playwright E2E 10/10

### Infrastructure
- Fix `scripts/validate-static.js` obsolete assertions (`MASTER_ON_EDIT`, wallet cache L1 fallback)
- Create `scripts/verify-migration.js` ÔÇö deep-equality check between `src/*.gs` and `packages/core/src/chains/*.ts`
- Apply pending Prisma migration `add_deploy_txhash`
- Remove duplicate `seedGamification` call at top-level of `server.ts`

## v0.1.2 ÔÇö UX & Wallet Linking

### Wallet Linking
- Fix: Solana wallet connection (`connect()` before `signMessage()` + fallback `publicKey` via `solana.publicKey`)
- Fix: detailed error messages on signature/crypto failures (no more generic "Failed to link wallet")
- Add: verification badge per wallet ÔÇö "Ô£ô Sign├®" (API-verified) vs "ÔÜá Local" (localStorage only)

### UX
- Add: connected wallet auto-added to wallet list on home page (no need to re-enter)
- Add: `/scans/[id]` page ÔÇö click any scan in history to view stored results with full chain/token detail + CSV export
- History page now links to stored results instead of re-running the scan

## v0.1.1 ÔÇö Post-Audit Consolidation

### chainKey Canonical Fix (P1)
- Root cause: engines returned `DEX_SLUG` as `chain` field instead of canonical key
- Fix: `evm.ts`, `svm.ts`, `cosmos.ts` now return `chain.key.toLowerCase()`
- Impact: chain refresh works for all chains, explorer URLs resolved correctly
- TokenTable `EXPLORERS` map expanded to 40+ chains with canonical keys

### chainlist.org Integration
- New `packages/core/src/chainlist.ts`: fetches 2595 chains from chainid.network
- Non-blocking boot, 15s timeout, auto-retry every 5min on failure
- `/api/chains` enriched with `explorerUrl` and `iconUrl`
- Graceful degradation: local WCORE data served if chainlist is down
- 13 unit tests covering success/failure/timeout/retry

### Security
- CORS: `origin` now uses `CORS_ORIGIN` env var with allowlist; denies all in production by default
- JWT: throws at boot if `JWT_SECRET` missing in production (no more dev fallback)
- Rate limit: `RATE_LIMIT_SCAN` increased from 10ÔåÆ60 (was too aggressive for multi-wallet scan)

### Reliability
- DB scan save errors: logged as structured warnings instead of silent catch
- Scan timer: properly cleaned up on effect cancellation
- Cache key: includes `customTokenList` to avoid stale results

### UX
- Removed `valueEur > 0` filter: degraded/zero-value chains now visible
- Loading bar: animated green dot scanning left-to-right, elapsed time, current wallet
- Refresh buttons: per-wallet Ôå╗, per-chain Ôå╗, refresh-all Ôå╗ in portfolio card
- Labels: persisted to localStorage, passed via URL params, displayed in green
- Contract addresses: copyable + explorer link (Ôåù) per token
- ValueDistribution: EVM/SVM/COSMOS breakdown, expandable "other chains", horizontal bars
- Progress display: `Wallet 1/4 (25%)` instead of raw decimal
- Table columns: `table-fixed` + `colgroup` for consistent alignment
- i18n: all components use `t()`, currency via `formatValue()` everywhere
- 20+ new translation keys (EN/FR)

### Config
- `.env.example` aligned with code defaults (`RATE_LIMIT_SCAN=60`, `MAX_CHAINS_PER_SCAN=120`)
- `DEPLOY.md` updated with backup procedure, correct limits, chainlist note

### Bug Fixes
- CORS registered after routes ÔåÆ preflight failed ÔåÆ moved before all routes
- Race condition: `setLabels({})` triggered re-render ÔåÆ scan cancelled
- `AbortSignal.timeout()` ÔåÆ replaced with `AbortController` + retry 3├ù
- GM `longestStreak` not persisted on reset
- Cosmos/SVM chain matching: used hardcoded `COSMOS_HUB` ÔåÆ now reads VM from `/api/chains`
- Wallet display: duplicate address removed, green text shows label
- Scan results: incremental display (chains appear by batch group of 3)

### Backup
- `packages/db/scripts/backup-db.ps1`: PostgreSQL dump (keeps last 10)
- `packages/db/scripts/premigrate-warn.cjs`: auto-backup before `prisma migrate dev`
- `db:migrate` script now runs backup first; `db:migrate:no-backup` for bypass

### Files Changed
- 15 existing files modified (+630 / ÔêÆ246 lines)
- 5 new files: `chainlist.ts`, `chainlist.test.ts`, `backup-db.ps1`, `premigrate-warn.cjs`, `.gitignore`

## v0.1.0 ÔÇö MVP Release

### Core
- 116 chains (110 EVM + 4 Cosmos + 2 SVM)
- Cascade pricing: DefiLlama ÔåÆ DexScreener ÔåÆ GeckoTerminal ÔåÆ CoinGecko ÔåÆ Onchain V3
- Blockscout explorer auto-discovery (50+ tokens)
- Token registry: 100+ tokens across 10 chains
- Onchain V3 pricing for Aerodrome/Uniswap pools
- RPC consensus engine (strict majority)
- VM dispatch router (EVM/SVM/Cosmos)

### API (Fastify, port 4000)
- `POST /api/scan` ÔÇö multi-chain wallet scan with metrics
- `POST /api/auth/login` ÔÇö SIWE with nonce (5 min expiry)
- `GET /api/auth/nonce` ÔÇö server nonce generation
- `GET /api/auth/me` ÔÇö current user profile
- `GET /api/profile/:address` ÔÇö public profile
- `POST/GET/PATCH/DELETE /api/wallets` ÔÇö linked wallet CRUD
- `POST /api/gm` ÔÇö daily GM with streak
- `GET /api/leaderboard` ÔÇö top 50 by score
- `GET /api/quests` ÔÇö quest list + completion status
- `GET /api/badges` ÔÇö badge list + unlock status
- `POST /api/quests/:id/complete` ÔÇö quest completion
- `GET /api/circuit` ÔÇö circuit breaker status

### Web (Next.js 16, port 3000)
- Homepage with wallet input, chain selector, connect button
- Wallet dashboard with per-chain cards, token tables, donut chart
- Profile page with stats, badges, linked wallet management
- Leaderboard page
- GM button with streak counter
- Currency selector (EUR/USD/GBP/CHF/JPY)
- Language selector (FR/EN, 52 translation keys)
- Chain logos (TrustWallet CDN) + token icons (colored + Blockscout)
- Deep scan toggle (500K blocks)
- VM badges (EVM green, SVM purple, Cosmos blue)
- Multi-wallet aggregation with per-wallet filter
- Smart VM routing (auto-detect address type)
- Diagnostics panel (error categories per chain)
- Observability metrics in UI

### Infrastructure
- PostgreSQL 16 + Prisma (migrations + seed)
- Redis 7 (cache with memory fallback)
- Circuit breaker (20 failures, only on total failure)
- Rate limiting (10 scans/min/IP, 30 auth/min/IP)
- Chain concurrency batching (3 parallel)
- All limits configurable via .env

### Tests
- 86 tests: 61 core, 19 API, 6 web
- Typecheck 5/5 packages green

### Documentation
- ROADMAP.md ÔÇö project plan
- SESSION_SUMMARY.md ÔÇö session handoff + audit prompt
- DEPLOY.md ÔÇö deployment checklist
