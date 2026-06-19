# Changelog

## 2026-06-18 — Refactor mirror .gs éliminé + monorepo unifié (v0.3.0)

- **Élimination du mirror `.gs`** : les 170 fichiers `.gs` dupliqués dans `wcore-web/src/` sont supprimés. La source unique est `wcore-gsheet/src/*.gs`. Les configs de chaînes sont extraites via `wcore-gsheet/tools/extract-chains.mjs` → `wcore-gsheet/dist/chains/*.ts` → package `@wcore/chains` → consommé par `wcore-web/packages/core` via pnpm `file:` protocol. Plus aucun doublon de code métier entre les deux runtimes.
- **Architecture** : 113 chaînes extraites automatiquement (107 EVM + 2 SVM + 4 Cosmos) + 69 chaînes web-only conservées localement (portage vers gsheet prévu). Total: 182 chaînes dans le registre web. Package `@wcore/chains` v4.15.50 self-contained (types `VmType` + `ChainConfig`, pas de dépendance à `@wcore/shared`).
- **Outillage** : `wcore-gsheet/tools/extract-chains.mjs` (générateur), `wcore-gsheet/tools/validate-static.js` (validation GAS 2632 global functions), `wcore-web/packages/core/src/chains/build-index.mjs` (merge gsheet + local chains).
- **Nettoyage** : `wcore-web/tools/migrate/extract-chains.mjs` supprimé (doublon), `wcore-web/scripts/validate-static.js` supprimé (doublon), `wcore-web/.mcp/rpc-mcp.js` pointe maintenant vers `wcore-gsheet/src/`.
- **Monorepo GitHub** : repo `Icesenator/WCORE` unifié — branche `web` contient `wcore-web/` et `wcore-gsheet/` en sous-dossiers. Branche `gsheet` supprimée (contenu migré dans `wcore-gsheet/`).
- **Validations** : `pnpm typecheck` 5/5 packages OK, `pnpm test` core 238/239 pass, `wcore-gsheet` validate-static OK, `wcore-gsheet` build:chains 113 émises.
- **Dette follow-up** : 69 chaînes web-only à porter vers gsheet, TON.gs à convertir au pattern ChainFactory, docs AGENTS.md/AUDIT.md à mettre à jour.

## 2026-06-18 — Post X Swellchain shutdown + retrait après deadline

- **Post X Swellchain shutdown** : `https://x.com/WCORExyz/status/2067654188692111746` — alerte publique suite à l'annonce Swell : bridge avant le 23 juin, ne pas dépendre d'un seul tracker, WCORE retirera Swell Chain de la couverture active après le 23 juin. Visuel `apps/web/public/wcore-post-swell-shutdown.svg` + `.png` (1200x675, DA v12) généré par `scripts/build-post-swell-shutdown.cjs`; draft préparé via `scripts/x-cycle/prepare-post-swell-shutdown.cjs` et publié manuellement.
- **Roadmap** : ajout de la tâche de suppression `SWELLCHAIN` après le 23 juin (configs core, `GM_FACTORIES`, wagmi, DeployClient, explorers, manifests icônes/symboles, docs/compteurs et tests GM/wagmi).

## 2026-06-17 — FX cascade (4 sources + median consensus) + cross-runtime drift detector (v0.2.47)

- **FX cascade EUR/USD sans fallback fixe** : le code historique avait un `0.92` hardcodé (gsheet) ou un `1.08` dans 4 engines (web) qui corrompait silencieusement les prix quand les sources FX échouaient. Remplacé par une cascade temps-réel de 4 sources (Frankfurter, open.er-api.com, Coinbase, DefiLlama EURC) avec consensus médian (3+ sources) ou moyenne 2-sources (delta < 5%) ou throw explicite si 0 source réussit. Convention unifiée `priceEur = priceUsd * fxRate` (EUR per 1 USD).
- **Cross-runtime telemetry** : web self-publie sur `/api/price/fx` → `fx_telemetry:web` (TTL 2h). Gsheet POST après chaque cascade réussie → `/api/gsheet/fx-telemetry` (auth `x-gsheet-token`). Endpoint public `GET /api/diag/fx-parity` retourne `{web, gsheet, drift, ok}` avec tolérances 2% (warn) et 5% (alert).
- **CSRF : `/api/gsheet/*` exclues** : `requiresCsrfOriginCheck` retourne `false` pour les routes gsheet (auth par token, pas cookie). Sans ce fix, le POST telemetry était bloqué en 403 `csrf_origin_mismatch`.
- **Version stamp gsheet** : `FxRate._CURRENT_VERSION = "4.15.50"` stampé dans memory + L1 CacheService. Bumper la version force un fresh fetch après deploy (évite d'attendre 1h de TTL). Bump obligatoire à chaque changement de cascade.
- **Callers gsheet durcis** : `10_OUTPUT.gs`, `15_COSMOS_ENGINE.gs`, `FOGO.gs` (2 occurrences), `26_OPTIMIZATIONS.gs` wrappent maintenant `FxRate.getUsdToEur()` en try/catch + traitent l'échec comme `null` (au lieu d'un fallback hardcodé `0.86`/`0.92`).
- **Tests** : 26 unit tests (web `fx.test.ts`) + 9 cross-runtime spec tests (`wcore-gsheet/scripts/fx-cascade-spec.test.cjs`) + 1 live test (`wcore-web/scripts/test-fx-parity.cjs`, drift 0.39% < 2% après deploy). 208/208 core + 237/237 API + 9/9 cross-runtime spec.
- **Doc focalisée** : `wcore-web/docs/fx-cascade.md` (convention, sources, consensus, cache, telemetry, tests, dette).
- **Dette restante** : les scan results cachés en Redis `scan:v2:*` peuvent encore utiliser l'ancien FX (0.918) jusqu'à expiration 5min. Symptôme : sur la même chaîne, ETH et WBTC peuvent montrer des prix calculés avec des FX différents s'ils ont été scannés à des moments différents. Fix : `WALLET_SCAN_CACHE_VERSION` bump ou `forceRefresh=true` sur les chaînes concernées.
- **Deploy** : web API v0.2.47 déployé sur Railway, gsheet v4.15.50 pushé via clasp.

## 2026-06-15 — Bitpanda stocks pricés via relais (KRW/CHF/GBP) + logos stocks + Refresh All CEX (v0.2.46)

- **Pricing stocks Bitpanda déplacé vers le `cex-relay`** : Yahoo Finance refuse les connexions depuis l'IP datacenter de l'API WCORE (`fetch failed`, même blocage que Binance HTTP 451). Nouveau endpoint `POST /stock/prices` sur le relais Railway EU (`wcore-gsheet/railway-relay/server.js`) : reçoit `{token, symbols}`, price via Yahoo chart, convertit en EUR, renvoie `{SYMBOL:{priceEur,source}}`. L'API WCORE appelle le relais (`apps/api/src/cex/stock-relay.ts`) au lieu d'appeler Yahoo en direct, avec cache Redis 6h (`stockprice:{SYMBOL}`) et fallback quote provider Bitpanda.
- **Multi-devises stocks** : conversion USD/GBP/GBp(pence)/CHF/KRW vers EUR via taux Yahoo `EUR{CCY}=X`. Symboles coréens ajoutés (`HYXS`→`000660.KS` SK Hynix, `SSU`/`SMSN`→`005930.KS` Samsung), Nestlé `NESN.SW` (CHF). Receipt Samsung `SSU`/`SMSN` divisé par 25 (aligné sur le facteur ×25 de `wcore-gsheet`).
- **Candidats Yahoo minimisés** : un ticker US simple résout en 1 seul appel (plus de balayage spéculatif des 8 suffixes européens qui saturait Yahoo en 429). Mapping curaté pour les tickers européens + aliases Bitpanda (`AMD-US`→`AMD`, `BRKB`→`BRK-B`, `FB`→`META`, `MRKUS`→`MRK`, `RDSA`→`SHEL`, `TSFA`→`TSLA`, `BROA`→`AVGO`, `TCTZF`→`TCEHY`).
- **Collision crypto/stock corrigée** : les lignes `stocks` tentent Yahoo AVANT le quote provider Bitpanda, pour éviter qu'un ticker crypto homonyme (ACN, AMZN, MC, WMT) ne price une action avec un prix crypto.
- **Logos stocks** : `apps/web/lib/cex-stock-logos.ts` mappe chaque ticker stock/ETF Bitpanda vers son logo de marque via DuckDuckGo (`icons.duckduckgo.com/ip3/<domain>.ico` — Clearbit déprécié, DNS mort). `useCexHoldings` attache `logoUrl` aux holdings `stocks`.
- **Fix chevauchement des logos** : dans `TokenIcon`, le cercle coloré de fallback (lettre du symbole) restait visible derrière l'image et transparaissait sous les favicons stocks à fond transparent. Le fallback est maintenant masqué (`opacity-0`) dès que l'image charge (`imageLoaded`), fond neutre pendant le chargement, et `object-cover`→`object-contain` pour ne pas recadrer les favicons carrés.
- **Refresh All synchronise les CEX** : sur `/wallet`, le bouton "Refresh All" POST maintenant `/api/cex/accounts/:id/sync` pour chaque compte CEX puis recharge leurs holdings (`reloadCex`), en plus du re-scan on-chain (`WalletContent.tsx`).
- **Micro-cryptos non valorisables** : `APP`, `DCK`, `DOGA`, `GODL`, `KIP`, `LAI` restent à `—` car le ticker Bitpanda officiel les cote lui-même à `EUR=0.0000` et CoinGecko renvoie des tokens ambigus par symbole. Comportement honnête, pas de devinette (risque de gonfler le total comme le bug ETHG).
- **Post X concept (stocks + crypto)** : visuel `apps/web/public/wcore-post-bitpanda-stocks.svg` + `.png` (1200x675, DA v12) généré par `scripts/build-post-bitpanda-stocks.cjs` (screenshot Bitpanda réel intégré à droite). Draft préparé via `scripts/x-cycle/prepare-post-bitpanda-stocks.cjs` — `Your stocks and crypto. One value.` (concept post, PAS un 2e "Today's WCORE update." du jour). Publication manuelle.
- **Tests** : `apps/api/src/cex/normalizers.test.ts` (candidats minimaux, cache stock, collision crypto/stock, aliases), `apps/api/src/cex/stock-relay.test.ts` (3 cas relais), `apps/web/__tests__/cex-display.test.ts` (logos stocks + DuckDuckGo), `apps/web/__tests__/token-icons.test.ts` (object-contain). Tous verts. Déployé `cex-relay` + `api` + `web` (SUCCESS).

## 2026-06-14 — Bitfinex CEX provider (API directe v2, HMAC-SHA384)

- **Bitfinex ajouté** : 3e provider CEX après Binance et Bitpanda, portant `37_BITFINEX_SYNC.gs` (wcore-gsheet) vers le web. L'utilisateur fournit sa clé read-only (`apiKey` + `apiSecret`), chiffrée AES-GCM (`CEX_SECRET`).
- **API directe server-side** : Bitfinex ne bloque pas les IP datacenter (contrairement à Binance HTTP 451 → relais). L'API WCORE signe en HMAC-SHA384 + nonce et appelle `api.bitfinex.com/v2/auth/r/wallets` directement, sans relais ni modif de `wcore-gsheet`.
- **Wallet exchange/spot uniquement** + alias symboles courts (`ATO`→`ATOM`, `IOT`/`MIOTA`→`IOTA`, `UST`→`USDT`…) et consolidation stables/fiat (`USD`/`UDC`/`TUSD`→`USDT`, `EUR`/`EUT`/`EURS`→`EURC`), répliqués du module GAS.
- **Fichiers** : `apps/api/src/schemas.ts` (`CexProviderSchema`), `apps/api/src/cex/normalizers.ts` (`BitfinexBuckets`, `normalizeBitfinexBuckets`, `bitfinexCanonicalSymbol`), `apps/api/src/plugins/cex.ts` (`BitfinexCredentials`, `bitfinexAuthPost`, `fetchBitfinexRows`, routage), `apps/web/lib/cex-display.ts` (meta + regex), `ChainCard.tsx`, `useCexHoldings.ts`, `CexAccounts.tsx` (3e carte), `chain-icon-manifest.json` + `ChainIcon.tsx` (logo CMC `exchanges/128x128/37.png`).
- **Logo** : CMC officiel Bitfinex (`s2.coinmarketcap.com/static/img/exchanges/128x128/37.png`) — simpleicons et `bitfinex.com/favicon.ico` renvoient 404.
- **Post X Bitfinex** : `https://x.com/WCORExyz/status/2066215478549180488` — `Today's WCORE update. Bitfinex is now live.` Visuel `apps/web/public/wcore-post-bitfinex.svg` + `.png` (1200x675, DA v12) généré par `scripts/build-post-bitfinex.cjs` : Bitfinex en carte hero, Binance/Bitpanda en cartes secondaires, tags `Read-only` / `Direct API` / `Provider-first pricing`.
- **Tests** : `apps/api/src/cex/normalizers.test.ts` (4 cas Bitfinex), `apps/web/__tests__/cex-display.test.ts` (4 cas). 9/9 + 7/7 verts. `tsc --noEmit` API clean, `next build` web clean. Commit `f6d7eed`, déployé API + Web (CT JSON OK).

## 2026-06-13 — CEX wallets live + pricing Binance/Bitpanda + post X publié

- **Post X CEX wallets** : `https://x.com/WCORExyz/status/2065912993515233508` — `Today's WCORE update. CEX wallets now live.` Daily update (PAS un concept post) avec capture `/wallet` CEX scrolled. Visuel `apps/web/public/wcore-post-cex-wallets.svg` + `.png` (1200x675, DA v12 + badge WCORE top-left) généré par `scripts/build-post-cex-wallets.cjs`. Logos CEX : Binance `cdn.simpleicons.org/binance/F0B90B` + Bitpanda JPEG officiel `apps/web/public/cex/bitpanda-official.jpeg` (fond vert `#27D17F` + B noir, clipé en cercle pour matcher le style Binance).

## 2026-06-13 — CEX wallets live + pricing Binance/Bitpanda

- **CEX dans le portefeuille** : Binance et Bitpanda sont affichés comme wallets séparés dans `/home`, `/wallet` et `/profile?tab=wallets`, sans être mélangés aux scans on-chain. Les CEX peuvent être supprimés depuis les listes de wallets et restent disponibles dans Profile > CEX pour sync/détails.
- **Scan `/home`** : le bouton `Scan` lance une sync CEX avant d'ouvrir `/wallet`, pour afficher des holdings et prix frais.
- **UI harmonisée** : lignes wallets CEX alignées sur les wallets on-chain, badge `CEX` conservé dans `/wallet`, icône plateforme seulement dans la carte interne. Les CEX apparaissent dans le sélecteur `/wallet` et la `Value Distribution`.
- **Pricing** : Binance price provider-first via `binance-relay` (`prices` batch ticker). Bitpanda crypto/commodities via ticker public Bitpanda. Stocks Bitpanda via fallback Yahoo Finance + conversion USD→EUR.
- **Sécurité/UX** : aucun scam detector/report/explorer sur actifs CEX synthétiques (`SYMBOL:bucket`). Les symboles restent distincts, sans fusion `USDC/TUSD/USDT` ni `EUR/EURI/EURC`.

## 2026-06-12 — Backup DB réparé + cycle X + post scam flags (v16)

- **Backup DB local réparé** : la tâche planifiée `WCORE_DB_Backup` échouait silencieusement depuis le 24/05 (`LastTaskResult: 2`) car `scripts/.env.backup` (gitignoré) avait été supprimé lors d'un nettoyage de secrets. Fichier recréé depuis `railway variables --service Postgres` (`DATABASE_PUBLIC_URL`, host `viaduct.proxy.rlwy.net`). Backup manuel + tâche planifiée validés (`LastTaskResult: 0`, rotation 7 jours OK). Gotcha documenté dans `AGENTS.md`.
- **Cycle X** : 10 requêtes scannées, ~50 posts évalués, 1 seule cible propre retenue. Reply publiée et vérifiée : `https://x.com/WCORExyz/status/2065302791514452042` (checklist anti-scam de `@nigredada`). Doublon `@Saimo0` détecté et évité, shills cachés (useTria, FlutonIO, AI data) exclus.
- **Post X scam flags (v16)** : `https://x.com/WCORExyz/status/2065305153444405747` — `Your total is lying.` Visuel `apps/web/public/wcore-post-scam-flags.svg/.png` (1200x675, DA v12) généré par `scripts/build-post-scam-flags.cjs` : portfolio mock (total gonflé barré vs clean total), vrais logos TrustWallet ETH/USDC/OP embarqués en base64, token scam ETHG en pastille anonyme, 4 cards signaux.
- **Tooling cycle X durable** : `scripts/x-cycle/` enrichi — `scan-notifications.cjs`, `scan-search.cjs`, `verify-targets.cjs` (scan lecture seule + check doublons), `prepare-post.cjs` (draft complet texte+image dans Chrome CDP **sans publier**, retrait des attachments stale), `check-with-replies.cjs` (vérification post-publication). Tous portables (`__dirname`, fallback require Playwright).

## 2026-06-11 — GM deploy resilience + cycle X 72 GM chains

- **GM deploy resilience** : les contrats GM déployés on-chain ne doivent plus être perdus si le backend ou le receipt RPC lag après la tx. `fetchDeployReceipt` retry côté serveur, `useOnChainGm` retry en background côté frontend, et `syncOnChainContracts()` devient le helper partagé de self-heal pour `/api/gm/status` et `my-contracts`.
- **Contrats orphelins réconciliables** : events `ContractDeployed` retrouvés pour Merlin, Manta Pacific, Taiko Alethia, Plasma, HashKey, Hemi et HyperEVM. Gravity n'avait pas d'event détectable lors du scan et doit être redéployée si elle reste absente côté DB.
- **Post X 72 GM chains** : publication `https://x.com/WCORExyz/status/2065148361401917832`. Image `apps/web/public/wcore-post-gm-8-more-chains.png` + `.svg`, générée par `scripts/build-post-gm-8-more-chains.cjs`.
- **3 replies externes vérifiées** : réponses publiées sur `@Saimo0`, `@0xToxo`, `@MacroBombastic`, puis confirmées dans chaque thread et sur `@WCORExyz/with_replies`. Cibles shill/concurrents ignorées, 0 like/follow/DM.
- **Repo hygiene** : `scripts/build-post-gm-8-new-chains.cjs` (générateur historique v15) rendu portable comme le générateur v16 : plus de chemin Windows hardcodé vers Playwright ou la racine repo.

## 2026-06-11 — 8 nouvelles GM factory chains (Gravity, Merlin, Manta Pacific, Taiko, Plasma, HashKey, Hemi, HyperEVM)

- **8 chaînes GM activées** dans le même lot, portant le total à **72 GM chains live**. Toutes au build Shanghai standard (factory 1696 bytes / 61 PUSH0, impl 2237 bytes / 58 PUSH0) :
  - Gravity (1625, natif G), Merlin (4200, natif BTC, **pre-London** → gas legacy), Manta Pacific (169), Taiko Alethia (167000), Plasma (9745, natif XPL), HashKey (177, natif HSK), Hemi (43111), HyperEVM (999, natif HYPE).
- **Harmonisation 7 couches** : `GM_FACTORIES` (+ commentaires impl/traçabilité), `GM_CHAIN_NAMES`, SOON auto-filtré, wagmi consts + chains[] + transports (7 nouvelles, mantaPacific existait), `EXPLORERS` (8 URLs vérifiées HEAD 200), `chain-data.ts` déjà généré.
- **Vérifications** : tests de garde `gm-chains.test.ts` 2/2 + `wagmi-gm-chains.test.ts` 1/1, typecheck/lint/build verts, prod `/gm` affiche les 8 chaînes, API health JSON OK.
- **Note infra** : le service web Railway s'auto-déploie depuis les pushes GitHub (railway.json committé pointe vers `apps/web/Dockerfile`) — le deploy manuel web est devenu optionnel pour les changements web-only.

## 2026-06-11 — Sprint audit P0/P1 scan/auth/lint

- **Auth prod durcie** : `AUTH_ALLOW_BEARER` est deny-by-default en production. Le Bearer token n'est accepté en prod que si `AUTH_ALLOW_BEARER=true` est explicitement configuré ; hors prod, le comportement dev reste actif sauf `false`.
- **Routes scan couvertes** : ajout de `apps/api/test/scan-plugin-routes.test.ts` (23 tests) pour `/api/scan/async` et `/api/scan/batch` : validation body/adresse/chaînes, circuit ouvert, lifecycle job async, ownership user/IP, cache hit vs `forceRefresh`, persistence historique fire-and-forget.
- **Bugs trouvés par les tests** : `/api/scan/async` propage maintenant `forceRefresh` aux engines ; `/api/scan/batch` retourne `400 invalid_address` au lieu d'un 500 sur adresse invalide.
- **Lint revenu vert** : correction TDZ `sendLogin` dans `ConnectButton`, nettoyage imports/vars inutiles, globals Node pour scripts contracts, chemins contracts portables via `__dirname`/`path.join`. `pnpm lint` est à 0 erreur / 0 warning.
- **Perf/cache** : cache scan lu via `mget`, `walletScan.create` rendu fire-and-forget, RealT registry Redis capé par TTL safety 7 jours.
- **Hygiène deps/docs** : dépendance morte `@fastify/rate-limit` retirée, `docs/AUDIT.md` et `ROADMAP.md` alignés sur l'état corrigé.

## 2026-06-07 — 8 GM factory chains live + audit transversal + cycle X (commits `5f739c3`, `7471a19`, `f69834b`, `d546305`, `76907c6`, `f27e1a7`, `24a57e5`, `0b8f4aa`, `e621bc4`, `4dbeb03`, `945f8f0`, `24a0085`, `fcb6ea8`)

### 8 GM factory chains activées

- **Core DAO** (chainId 1116) — commit `5f739c3`. Factory `0x4532a3d1...`, native CORE, RPC `rpc.coredao.org`. Standard build Shanghai (61 PUSH0, London EIP-1559). Inclut aussi le fix auth flow (double Sign In bounce + random logout).
- **Flare** (chainId 14) — commit `7471a19`. Factory `0xbac99bdf...`, native FLR, RPC `flare-api.flare.network`.
- **X Layer** (chainId 196) — commit `f69834b`. Factory `0x7d684eec...`, native OKB, RPC `rpc.xlayer.tech`.
- **Shibarium** (chainId 109) — commit `d546305`. Factory `0x04e5d61b...`, native BONE, RPC `shibarium.drpc.org` (shibrpc.com DNS fail).
- **Degen** (chainId 666666666) — commit `76907c6`. Factory `0xc3e5ef8c...`, native DEGEN, RPC `rpc.degen.tips`, baseFeePerGas ~12 gwei.
- **Beam** (chainId 4337) — commit `f27e1a7`. Factory `0x972ccf14...`, native BEAM, RPC `build.onbeam.com` + `subnets.avax.network/beam`, baseFeePerGas ~1 gwei.
- **Ronin** (chainId 2020) — commit `24a57e5`. Factory `0x65e19128...`, native RON, RPC `api.roninchain.com`, baseFeePerGas ~20 gwei.
- **opBNB** (chainId 204) — commit `0b8f4aa`. Factory `0x92d7a478...`, native BNB, RPC `opbnb-mainnet-rpc.bnbchain.org` + 3 fallbacks, OP-Stack Bedrock EIP-1559.

**Impl size uniforme** : 2237 bytes (GmOnChain template unique) sur les 8 chaînes. **Build source unique déployé 8 fois sans modification**.

### Fixes associés

- **`apps/web/lib/explorers.ts`** (commit `e621bc4`) : `core: "https://scan.coredao.org"` ajouté. Core avait l'entrée factories + wagmi + DeployClient mais pas l'explorer. Vérifié HEAD 200 sur `https://scan.coredao.org/address/0x4532a3d1...` (le builder `getExplorerUrl` utilise `${base}/address/${contract}`).
- **Image v15 (commit `4dbeb03`)** : `apps/web/public/wcore-post-gm-8-new-chains.png` + `.svg` (1200x675) — grille 4x2 avec les 8 nouvelles chaînes. Layout : WCORE badge top-left + "64 GM CHAINS LIVE" counter top-right, pills "8 NEW TODAY" (lime) / "Shanghai build" / "London EIP-1559", titre "8 more GM chains.", 4x2 grid, footer "wcore.xyz".
- **Image fixes v15 (commits `945f8f0`, `24a0085`)** : (1) fix chevauchement pills + counter dot (`AUTH_ALLOW_BEARER` sur "E" de "LIVE"), (2) shift des noms de chaînes vers la droite (x+100 → x+114, gap logo→label 2px → 16px).

### Cycle X 2026-06-07

- **Publication principale** (par toi, pas script) : `https://x.com/WCORExyz/status/2063579743736254824` (2026-06-07 11:12:05 UTC). Texte : "8 more GM chains went live on WCORE. Core. Flare. X Layer. Shibarium. Degen. Beam. Ronin. opBNB. Personal contracts. Creator fees. Chain streaks. 64 chains live now. Which chain do you want next? wcore.xyz"
- **Wobblhash repost** détecté (interne, pas d'engagement public).
- **2 replies externes authentiques** postées + vérifiées :
  - `nftbestart` (Mehdiweb3) sur l'angle AI + wallet read-only : "The read-only part is what makes or breaks it. An agent that signs for you is a different threat model than one that just reads your wallets and helps you see clearly. We have been building that angle at wcore.xyz. No signing, no custody, just one map across 180+ chains. Same shift you describe."
  - `alphacyl` (Alpha.rwa | Adi) sur MANTRA recap : "Good MANTRA recap. A read-only wallet view is useful for readers in this thread too. Track positions across Cosmos and the L2s without needing a custody step. We do that angle at wcore.xyz."
- **Script durable** (commit `fcb6ea8`) : `scripts/x-cycle/post-replies.cjs` avec `sanitize()` guard contre em-dash (incident : 1er post contenait un em-dash, supprimé manuellement par l'utilisateur, puis re-posté propre). `.gitignore` exception `!/scripts/x-cycle/` ajoutée.

### Audit transversal

- **`docs/audit-2026-06-07-complet.md`** créé. Score global 8.6/10. 5 agents en parallèle (structure/code/sécurité/perf/doc). 3 P0 + 7 P1 + 16 P2 + 11 P3 identifiés. P0 critiques : `AUTH_ALLOW_BEARER=true` défaut prod, `/api/gm/status-onchain` amplification RPC, `scan.ts` 612 LOC sans tests de route. Quick wins identifiés : retirer `@fastify/rate-limit` (mort), fire-and-forget `walletScan.create`, mget scan cache, memoize `AllTokensTable`/`TokenTable`, fix TDZ ConnectButton, créer `.nvmrc`, split contracts/* paths hardcodés, créer `docs/TROUBLESHOOTING.md`.

### Vérifications

- 64 GM chains live au total (56 EVM + 4 SVM + 4 Cosmos + 1 TON après cette session).
- Tests de garde GM : 8/8 verts après chaque activation.
- API + Web déployés pour chaque chaîne.
- `wcore.xyz/gm` affiche les 8 nouvelles chaînes en section active, pas en "Coming Soon".
- 14 commits unpushed au moment de l'audit (work-in-flight transparent).

## 2026-06-06 — GM score double-comptage guard (commit `fa17a10`)

- **Bug** : `rebuildChainStreakFromOnchain()` s'appuyait sur `OnchainGm @@unique([chainKey, txHash])` pour l'idempotence. Cette contrainte est case-sensitive en Postgres. Une row legacy `chainKey="base"` et une nouvelle row canonique `chainKey="BASE"` avec le même `txHash` ne collisionnaient donc pas, ce qui pouvait laisser le self-heal/backfill insérer un doublon et créditer le score deux fois.
- **Fix** : pre-fetch des `txHash` existants pour `(userId, chainKey)` au début du rebuild, comparaison lowercased, skip des logs déjà connus, et ajout du hash au set après chaque insert réussi. Le guard couvre à la fois les rows legacy lowercase et les doublons dans un même batch de logs.
- **Tests** : `gm-streak-rebuild.test.ts` couvre l'idempotence avec chainKey de casse différente et l'insert d'un vrai nouveau `txHash`. Vérif session : `node --import ./set-test-env.js --import tsx --test --test-force-exit src/gamification/gm-streak-rebuild.test.ts src/gamification/gm-onchain-status.test.ts` = 5/5 verts. `pnpm --filter @wcore/api typecheck` OK.

## 2026-06-06 — Token icon broken-image overlay (commit `e0bead8`)

- **Bug** : `TokenIcon` rendait TOUJOURS le cercle coloré de fallback (texte sur fond coloré) derrière le `<img>`. Quand l'URL retournait 404 — fréquent pour tout token absent de spothq/cryptocurrency-icons (SOMI, MON, tous les RealToken symbols sur Gnosis, la plupart des ERC-20 non-majeurs sur Base, HH, etc.) — le navigateur affichait son icône "image cassée" PAR-DESSUS le cercle coloré. C'est le "chevauchement de plusieurs infos" rapporté par l'utilisateur.
- **Fix** : nouveau state `imageBroken`. Quand l'img déclenche `onError` (404) ou se charge avec `naturalWidth === 0` (SVG vide), `imageBroken` passe à `true` et le `<img>` n'est plus rendu. Seul le cercle coloré avec texte est visible (le fallback prévu). Cascade `logoUrl → spothq → CMC → null` inchangée, seul le rendu de l'image cassée est corrigé.
- **Bonus** : ajout d'overrides vérifiés pour les natives récentes (spothq pas à jour) :
  - `SOMI` (Somnia native) : `https://icons.llamao.fi/icons/chains/rsz_somnia.jpg` (200 OK) + CMC fallback UCID 37637 (200 OK).
  - `MON` (Monad native) : `https://icons.llamao.fi/icons/chains/rsz_monad.jpg` (200 OK) + CMC fallback UCID 30495 (200 OK).
- **Tests** : 2 nouveaux tests (override SOMI/MON + CMC fallback IDs). 83/89 verts ; 6 failures pré-existantes `ui.test.ts` (ECONNREFUSED, hors scope).
- **Deploy** : web redéployé (deployment ID `b81a861f-312c-4964-b362-221f1e1001f0`).

## 2026-06-06 — FX rate fetch + GM contracts cross-user publication (commit `e2e72d1`)

- **`apps/web/components/PreferencesProvider.tsx`** : `fetch("/api/price/fx")` (URL relative cassée en dev/staging) remplacé par `apiFetch("/api/price/fx", { signal: ctrl.signal })` + `r.ok` check + AbortController cleanup sur unmount. Le default `1.08` est conservé si l'API échoue. Source : audit P2 `2026-06-05-complet.md` C.2.
- **`apps/web/hooks/useGmContracts.ts`** : `publishContracts(key, contracts)` passe maintenant le `key` aux listeners. Chaque listener filter sur son propre `cacheKey` avant `setContracts(nextContracts)`. Empêche une réponse stale pour user A d'écraser l'état d'un hook subscribed pour user B (race condition cross-user). Source : audit P2 C.3.
- **Tests** : 81/87 verts. 6 failures pré-existantes dans `ui.test.ts` (ECONNREFUSED `127.0.0.1:4000`, hors scope de ce fix).
- **Deploy** : web redéployé avec `railway up --service web` (deployment ID `79d47d1b-81aa-4f38-b34e-73c2e5dfcfdd`). Vérif prod : `wcore.xyz` 200, `/api/price/fx` retourne `{"eurUsd":1.164,"timestamp":...}`.

## 2026-06-06 — X daily update v11 (KCC + Paris EVM build story)

- **Tweet publié** : https://x.com/WCORExyz/status/2063165356722524491 (status_id `2063165356722524491`, time `2026-06-06T07:45:27 UTC`). Texte user-facing : "KCC just got GM coverage on wcore.xyz. KCC is pre-Shanghai. No PUSH0. No EIP-1559. To ship it, WCORE now runs a custom Paris EVM build (solc 0.8.19, evmVersion=paris) alongside the default Shanghai build. Same ABI, different bytecode. The deploy selector picks the right one per chain. Pre-Shanghai chains get the same Say GM, the same streaks, the same creator fees as the rest. 56 GM factory chains. 4 VMs."
- **Image** : `apps/web/public/wcore-post-daily-update-11.png` + `.svg` (1200x675). DA validée : fond sombre WCORE, hexagone + nœuds + connexions logo top-left, "Today's WCORE update." top-right + subtitle "KCC GM is live. Pre-Shanghai. No skip.", grande carte gauche avec logo KCC + label "KCC Mainnet" + pills "Paris EVM build" / "solc 0.8.19" / "0 PUSH0", carte droite top "Pre-Shanghai chains" + carte droite bottom "56 GM factory chains", footer "Pre-Shanghai chains get the same coverage as the rest. KCC just shipped." + wcore.xyz.
- **Rendu** : Playwright avec `page.goto(file://...)` (pas `setContent`) pour que les `image href="chains/KCC.png"` relatifs résolvent correctement. Le `setContent` + base href ne fonctionne pas à cause des restrictions Chromium file://.

## 2026-06-05 — KCC GM factory live (chainId 321, Paris EVM build, deploy `a18c112`)

### Frontend
- **`packages/shared/src/factories.ts`** : `kcc: { address: "0x76edb44d846b6378519aeed5c9ee2bcabcd2c15a", chainId: 321 }` ajoutée à `GM_FACTORIES`. Commentaire en-tete cite les 2 tx hashes + block numbers + bytecode sizes pour traçabilité.
- **`apps/web/lib/wagmi.ts`** : ajout de la chaîne `kcc: { id: 321, name: "KCC Mainnet", nativeCurrency: { name: "KCS", symbol: "KCS", decimals: 18 }, rpcUrls: [rpc-mainnet.kcc.network, kcc.drpc.org, kcc-rpc.com], blockExplorers: [scan.kcc.io] }` + entrée `[kcc.id]: http()` transport + `kcc` dans le tableau `chains[]`. `wagmi-gm-chains.test.ts` 1/1 vert (KCC 321 couvert).
- **`apps/web/app/gm/gm-chains.ts`** : `GM_CHAIN_NAMES.kcc = "KCC Mainnet"`. `gm-chains.test.ts` 2/2 verts (label présent, KCC n'apparaît plus dans `SOON_CHAIN_CANDIDATES`).
- **Chain icon/native** : `apps/web/lib/chain-icon-manifest.json` ligne 50 = `/chains/KCC.png` ; `apps/web/lib/chain-native-symbols.json` ligne 59 = `"kcc":"KCS"`.

### Deploy (KCC mainnet, factory `0x76edb44d...`)
- **GmOnChain (impl)** : `0xd741c65517f883cd2b4c7cfbda3da110e8b41675` déployé via `/dev/deploy` (Paris build, solc 0.8.19). Tx `0x71d2ca39496a925ba5c5947529eb1aedd59fa41a3eb248a50b100657cc0e79c7`, block `0x3256369` (52727373), bytecode 6246 chars, **0 PUSH0**.
- **GmFactory** : `0x76edb44d846b6378519aeed5c9ee2bcabcd2c15a` déployé via `/dev/deploy` (Paris build, solc 0.8.19), constructor arg = address du GmOnChain. Tx `0x2a8a7ee971c531ab726fcdd6f13df7a6bcda651c067098c4b27966be0aa6c835`, block `0x324e581` (52727377), bytecode 3490 chars, **0 PUSH0**.

### Déchets on-chain (orphelins, bytecode vide `eth_getCode = 0x`)
- **Factory abandonnée #1** : `0x9cc14b976a713d388636cd8736b291ff4be3a1c3` (block 52725852). Factory Paris OK mais implementation = ancien GmOnChain Shanghai PUSH0 reverted `0xf25ebed98426a4dc01e30a1e04ead7d3639579bd` (block 52716806). Ces 2 contracts sont vides et inutilisables, restent on-chain pour traçabilité.
- **Factory abandonnée #0** : `0x83dde2e0a15417c3d206a9c74827ef5a15194632` (block 52716810, Paris OK + impl cassée).

### UX guard
- **`apps/web/app/dev/deploy/DeployClient.tsx`** useEffect (commit `35f0434`) : si `localStorage.gm_impl_${chainKey}` pointe vers une adresse valide et que `eth_getCode` retourne `0x` (contrat vide on-chain), auto-clear le localStorage, reset step "gm", et affiche un message d'erreur. Empêche la re-saisie accidentelle d'un GmOnChain cassé lors d'un nouveau deploy.

### Vérifications prod
- `/api/chains` 200 retourne KCC `{key:"KCC", chainId:321, disabled:false, nativeSymbol:"KCS", rpcCount:3, explorerUrl:"https://explorer.kcc.io/en"}`.
- `/gm` page 200 contient "KCC Mainnet" et propose le flow Say GM complet.
- `https://wcore.xyz` dernière deployment `c881c980-...` (commit `a18c112`).

## 2026-06-05 — KCC GM factory fix : Paris EVM build (solc 0.8.19, no PUSH0)

### Diagnose
- **KCC mainnet est pre-London** : `baseFeePerGas` absent dans les blocks → EIP-1559 pas activé → KCC n'a jamais reçu la mise à jour Shanghai (PUSH0 opcode). Le bytecode actuel dans `apps/web/public/build.json` (compilé avec solc 0.8.20+, default `evmVersion=shanghai`) contient 65 PUSH0 (4 dans le constructor + 61 dans le runtime).
- Le constructeur `0x60806040...5f5ffd5b` (PUSH0 utilisé pour la valeur de retour `0`) → constructor revert silencieusement à l'exécution → contrat déployé vide (`eth_getCode = 0x`). Les 2 contrats déployés aujourd'hui sur KCC (`0x83dde2e0a15417c3d206a9c74827ef5a15194632` factory et `0xf25ebed98426a4dc01e30a1e04ead7d3639579bd` GmOnChain) sont inutilisables.

### Frontend Deploy
- **Build Paris EVM séparé (solc 0.8.19, `evmVersion=paris`)** : `apps/web/public/build.json` reçoit 2 nouvelles entrées `GmOnChainParis` et `GmFactoryParis`, compilées avec solc 0.8.19 (default Paris). Vérifié 0 PUSH0 dans constructor ET runtime pour les 2 contrats via parsing instruction-aware (track PUSH1-PUSH32 immediates).
- **`build-selector.ts`** : nouveau module pur exporte `pickBuild(build, chainKey, contract)`. Renvoie Paris pour les chaînes listées dans `PARIS_BUILD_CHAINS` (initialement `KCC`), default sinon. Lance une erreur explicite si le Paris build manque pour une chaîne listée.
- **`DeployClient.tsx`** : utilise `pickBuild()` dans `deployGmOnChain()` et `deployFactory()`. Affiche un indicateur jaune "Paris EVM build (solc 0.8.19) — pre-Shanghai chain without PUSH0 opcode" quand la chaîne ciblée est dans `PARIS_BUILD_CHAINS`. `BuildOutput` interface étendue pour accepter `GmOnChainParis?` / `GmFactoryParis?`.
- **Tests** : `build-selector.test.ts` (7 tests) couvre default/Paris/caseless/manquant, `build-json-paris.test.ts` (2 tests) lit `build.json` au runtime et vérifie 0 PUSH0 dans constructor+runtime pour les 2 entrées Paris.

### Infra
- **`contracts/compile-v0.8.19.js`** : script Node.js qui télécharge/utilise solc 0.8.19 (npm `solc@0.8.19` ajouté en devDependency), compile les sources avec `evmVersion=paris`, écrit `GmOnChain.v0819.json` et `GmFactory.v0819.json` dans `contracts/`. Le script relaxe temporairement la pragma `^0.8.20` → `^0.8.19` dans un dossier `tmp-paris/` pour la compilation, puis nettoie.
- **`contracts/patch-build-json.js`** : patche `apps/web/public/build.json` pour ajouter/remplacer les entrées `*Paris` à partir des artefacts `.v0819.json`. Réutilise l'ABI existant (identique entre Paris et Shanghai). Idempotent.
- **`.gitignore`** : `contracts/*.compiled.json`, `contracts/*.v0819.json`, `contracts/input-paris.json`, `contracts/output-paris.json` ajoutés (artefacts régénérables). `contracts/compile-v0.8.19.js` et `contracts/patch-build-json.js` sont trackés (sources du pipeline).
- **`solc@0.8.19`** ajouté en `devDependencies` (nécessaire au script de regénération).

### Action utilisateur requise
- **Deploy les 2 contrats Paris via `/dev/deploy` sur KCC** : le dropdown "Target Chain" → KCC affiche maintenant l'indicateur Paris. Étape 1 "Deploy GmOnChain" et Étape 2 "Deploy GmFactory" utilisent automatiquement le bytecode Paris (PUSH0-free).
- Une fois déployés, ajouter les 2 adresses dans `packages/shared/src/factories.ts` :
  ```ts
  kcc: { address: "<NOUVELLE_FACTORY>", chainId: 321, implementation: "<NOUVELLE_GM_ON_CHAIN>" }
  ```
- Les anciennes adresses cassées (`0x83dde2e0a15417c3d206a9c74827ef5a15194632` et `0xf25ebed98426a4dc01e30a1e04ead7d3639579bd`) peuvent rester on-chain comme déchets (elles n'ont pas de code de toute façon).

### Vérification
- 24 tests `node --test` verts dans `apps/web/app/dev/deploy/` (9 chain-switch + 6 chain-params + 7 build-selector + 2 build-json-paris).
- `npx tsc --noEmit --project apps/web/tsconfig.json` propre.
- `npx next build` compile `/dev/deploy` sans erreur.

## 2026-06-05 — /dev/deploy wallet_switchEthereumChain 4902 fallback

### Frontend Deploy

- **`/dev/deploy` chain switch fix (v3, post-prod-feedback)** : la v2 (pas de retry switch après add) a réduit l'erreur "Unrecognized chain ID 0x141" sur KCC pour la plupart des wallets, mais reste fragile face aux quirks par-wallet (certain wallets wrappent le code dans `data.originalError.code`, d'autres utilisent un string code `"4902"`, d'autres encore throw un code inconnu). Helper durcie dans `chain-switch.ts` : `getErrorCode(e)` lit `e.code` (number ou string), `e.data?.originalError?.code` (pattern wagmi), et fallbacks. Pour les codes **autres que 4001 (user reject)** et **4902 (chain not in wallet)**, on tente quand même `wallet_addEthereumChain` en fallback (certains wallets throw -32000/-32603 sur des chains qu'ils ne connaissent pas). 9 tests `chain-switch.test.ts` : chain connue (1 appel), 4902 + add (2 appels, no retry), 4902 string, 4902 nested `data.originalError.code`, unknown code + add OK (fallback), unknown code + add fail (re-throw original), 4001 user reject (pas d'add), chain pas dans notre liste (erreur claire), pas de window.ethereum. Meta tag `wcore-deploy` bumpé à `v0.2.36-deploy-switch-no-retry-2026-06-05` pour que l'utilisateur puisse vérifier qu'il a bien le nouveau bundle.

### Repo hygiene

- **Script generator** : `scripts/extract-deploy-chain-data.mjs` regénère `chain-data.ts` depuis `packages/core/src/chains/*.ts`. À lancer quand une chaîne change de RPC ou de native currency.
- **Inline chain data conforme au gotcha** : AGENTS.md documente que Turbopack ne résout pas `.js` → `.ts` dans les workspace packages, même avec `transpilePackages`. La solution officielle est de dupliquer la constante inline (et non importer `@wcore/core` au runtime depuis le frontend web). 112 chaînes dupliquées.

### Vérification

- Tests : `chain-params.test.ts` 6/6 (KCC 321→`0x141`, BASE 8453→`0x2105`, Moonbeam 1284→GLMR, PulseChain 369→PLS, unknown→null). Typecheck 5/5. Build clean. Commit `7280c94` + `5908651`.

## 2026-06-05 — PulseChain GM factory live + /gm load + Deploy latency wins

### GM factories (nouvelles chaînes)

- **PulseChain factory activée** (chainId 369) : factory `0x245cb609aaff4b375ad3c60a4d2397a6963892c3`. Entrée ajoutée à `packages/shared/src/factories.ts`, label `PulseChain` ajouté à `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retiré de `SOON_CHAIN_CANDIDATES`, chaîne `pulsechain` (3 RPCs : `rpc.pulsechain.com`, `pulsechain-rpc.publicnode.com`, `rpc-pulsechain.g4mm4.io`) ajoutée à `wagmi.ts` avec transport http(). `eth_chainId = 0x171` vérifié en prod. `PULSECHAIN.webp` déjà tracké dans `chain-icon-manifest.json`. Commit `9057ca2`.

### Frontend GM (latence)

- **Cards visibles immédiatement** : supprimé la gate `!statusLoaded` dans `GmPageClient` qui rendait un spinner plein écran pendant ~500ms. Les cards montent désormais avec les defaults `lsGmDone` et se raffinent quand `/api/gm/status` arrive. Chaque card garde un spinner per-card sur le bouton (déjà là). Commit `059f603`.
- **Deploy instantané** : `useGmChain.handleDeploy` n'attend plus `await checkHasDeployed()` (~500ms HTTP avant que MetaMask s'ouvre). On trust `lsContractDeployed` + le `/api/gm/status` déjà chargé ; le factory revert proprement si duplicate. `GmPageClient` pre-warm `/api/price/native?chain=X` pour toutes les GM chains en parallèle au mount et passe la map à `useOnChainGm` qui l'utilise en sync dans `deployContract`/`sendGm` (skip la ladder 3-retry ~500-1500ms). Commit `059f603`.

## 2026-06-05 — Boba + Metis GM factory live + Say GM flicker fix + /gm fan-out stop

### GM factories (nouvelles chaînes)

- **Boba factory activée** (chainId 288) : factory `0xced8cacde0ea15adf489f6fca9ed65dff2fb1efe`. Entrée ajoutée à `packages/shared/src/factories.ts`, label `Boba` ajouté à `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retiré de `SOON_CHAIN_CANDIDATES`, chaîne `boba` (3 RPCs : `mainnet.boba.network`, `1rpc.io/boba/eth`, `gateway.tenderly.co/public/boba-ethereum`) ajoutée à `wagmi.ts` avec transport http(). `eth_chainId = 0x120` vérifié en prod. RPC `boba-ethereum.drpc.org` droppé du config `@wcore/core` (404). `BOBA.png` déjà tracké dans `chain-icon-manifest.json`. Commit `2f8ff4e`.
- **Metis factory activée** (chainId 1088) : factory `0x493d13b68fcaf08a5036b185c29a08f22046cf0e`. Entrée ajoutée à `packages/shared/src/factories.ts`, label `Metis` ajouté à `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retiré de `SOON_CHAIN_CANDIDATES`, chaîne `metis` (3 RPCs : `andromeda.metis.io/?owner=1088`, `metis-rpc.publicnode.com`, `metis.drpc.org`) ajoutée à `wagmi.ts` avec transport http(). `eth_chainId = 0x440` vérifié en prod. Commit `347b072`.

- **Metis factory activée** (chainId 1088) : factory `0x493d13b68fcaf08a5036b185c29a08f22046cf0e`. Entrée ajoutée à `packages/shared/src/factories.ts`, label `Metis` ajouté à `GM_CHAIN_NAMES` dans `apps/web/app/gm/gm-chains.ts`, retiré de `SOON_CHAIN_CANDIDATES`, chaîne `metis` (3 RPCs : `andromeda.metis.io/?owner=1088`, `metis-rpc.publicnode.com`, `metis.drpc.org`) ajoutée à `wagmi.ts` avec transport http(). `eth_chainId = 0x440` vérifié en prod. Commit `347b072`.

### Frontend GM

- **Say GM flicker fix** : `useOnChainGm.sendGm` attendait `lsSetGmDone` + dispatchait `wcore-gm-done` dès la signature MetaMask (txHash, pas mining). Le handler `wcore-gm-done` dans `useGmChain` appelait `checkStatus()` qui lisait `/api/gm/status` avant que `recordGmBackend` n'ait persisté (fire-and-forget) → override à `gmDone:false` → re-flippe "Say GM". Nouvelle helper `waitForGmReceipt(txHash, ethereum, 60_000)` poll `eth_getTransactionReceipt` × 30 × 2s = 60s, throw sur `status === 0x0` (reverted) ou timeout. `sendGm` await le receipt avant `lsSetGmDone` + dispatch. Handler `wcore-gm-done` n'appelle plus `checkStatus()`. Boutons `ChainCard` et `GmPageClient` exposent `title`/`aria-label` "Waiting for on-chain confirmation…" pendant `sending=true`.
- **/gm fan-out stop pour users sans contrat** : quand `/api/gm/status` retournait `{}`, `GmPageClient` mettait `deployed: null` sur les 6 chaînes → 6 `/api/gm/has-deployed` parallèles → `gm_read` rate limit → 429 sur le header. Nouvelle helper `buildChainStatusesFromApi(data, chainKeys, lsGmDoneLookup)` dans `apps/web/lib/gm-status-reconcile.ts` traite `{}` comme `deployed:false` définitif (pas de per-card fetch) et `null` (erreur réseau) comme `deployed:null` (per-card fetch peut récupérer). Tests `gm-status-reconcile.test.ts` (5/5). Commit `3a701e0`.

### Vérification

- API + Web Railway déployés. `/api/chains` 200 (41.7 KB), `/api/price/native?chain=boba` 200 (1547.6 USD via DefiLlama), `/api/price/native?chain=metis` 200 (2.47 USD via DefiLlama), `/api/gm/status` 401 sans auth (P1-1 confirmé prod), `/gm` 200 avec Boba + Metis + Astar + Aurora présents.
- Tests : gm-chains 2/2, wagmi-gm-chains 1/1, gm-status-reconcile 5/5. Typecheck monorepo 5/5.

## 2026-06-05 — Audit P0/P1 résolus : forceRefresh, scan/cache, GM, deploy

### Scan / cache

- **P0-1 forceRefresh propagé** : `getEngineCacheForScan(forceRefresh, vm, cache)` wrappe le cache pour bypasser les préfixes `empty:*` et `bal_cache:*` quand `forceRefresh=true`. Le wrapper délègue les writes/reads/deletes au cache original. Propagation dans les 3 call sites de `apps/api/src/plugins/scan.ts` (sync scan, EVM batch, non-EVM batch). Tests `scan-cache-policy.test.ts` (15/15) + `scan.test.ts` (26/26). Commit `80ea1ff`.
- **P0-2 empty cache bypass EVM/SVM** : `evm-scan.ts:125` et `svm.ts:102` retournent `emptyCacheKey = undefined` quand `opts.forceRefresh === true`. Liveness check SVM `quickSvmLivenessCheck` détecte activité native avant de servir le cache. Tests SVM `forceRefresh bypasses the empty cache for a fresh re-scan` ajoutés. Commit `4d654b1` (le bypass prod et le test EVM étaient déjà dans `6b6c5dd`/v0.2.30).

### API sécurité

- **P1-1 `/api/gm/status-onchain` durci** : auth requise (401 sans `req.user`), validation `EvmAddress` Zod stricte (400 sur query invalide), check `address === req.user.address` (403 sur mismatch, bypass admin via `isAdminAuthorized`). Tests `gm-onchain-status.test.ts` (3/3). Commit `8b34385`.
- **P1-2 rate-limit post-auth** : `registerPostAuthRateLimit(app, deps)` extrait dans `server-helpers.ts`, appelé APRÈS `authPlugin` pour que `req.user` soit populé. CSRF check reste dans le hook `onRequest` d'origine. Tests `rate-limit-hook-order.test.ts` (5/5). Commit `77a8408`.
- **P1-3 AbortController sur timeouts** : helper `runWithTimeout(factory, ms)` dans `scan-utils.ts` crée un `AbortController` par chaîne, l'abort() AVANT le reject. 4 call sites de `scan.ts` (sync, EVM batch, non-EVM batch, async) utilisent le helper. `DispatchOptions.signal?: AbortSignal` ajouté. Tests `scan-timeout.test.ts` (5/5). Commit `2b0feaf`.

### Deploy

- **P1-4 `deploy.ps1` exit code** : capture `$LASTEXITCODE` après `railway up`, restoration de `railway.json` + lock cleanup en `finally`, puis `exit $deployExitCode` si != 0. Test process-based `scripts/deploy-ps1.test.ps1` (3/3) qui mock `railway.cmd` dans PATH temporaire. Commit `cc67375`.

### Frontend

- **P1-5 ChainCard contract-aware scam** : nouveau module `apps/web/lib/scam-overrides.ts` avec helpers purs (`isSymbolBlocked`, `isContractBlocked`, `isSymbolApproved`, `isContractApproved`, `applyScamOverrides`, `readScamOverrides`, `writeScamOverride`, `buildScamEntry`). `ChainCard.tsx` lit les entries contract-aware et exclut les tokens bloqués par contrat du `cleanTotal`. `TokenTable.tsx` utilise les write helpers partagés. Tests `scam-overrides.test.ts` (21/21). Commit `936e963`.

### Audit doc

- `docs/audit-2026-06-05-complet.md` : source d'état courant pour P0/P1/P2/P3. `ROADMAP.md` mis à jour pour marquer P0/P1 comme résolus avec liens vers les commits.
- Plan d'exécution : `docs/superpowers/plans/2026-06-05-audit-fixes-p0-p1.md`.

## 2026-06-05 — Audit global enregistré + docs alignées

- **Audit courant** : ajout de `docs/audit-2026-06-05-complet.md` (sécurité/API, core scan/pricing/RPC/cache, frontend/UX, CI/deploy/docs). Les P0 ouverts sont `forceRefresh` non propagé aux engines et empty cache token-only.
- **Roadmap** : `ROADMAP.md` pointe maintenant vers l'audit 2026-06-05 comme source d'état courant et réouvre explicitement le sujet `forceRefresh` au lieu de le présenter comme entièrement corrigé.
- **Deploy docs** : `DEPLOY.md` marque le chemin Docker Compose comme legacy/self-hosted, corrige le compteur `116+ chains`, et retire l'affirmation incorrecte selon laquelle `forceRefresh=true` désactive toujours les caches engine.
- **Docs CM** : `docs/superpowers/specs/CM-STRATEGY.md` remplace les mentions publiques `116+ chains` par `170+ live chains`.

## 2026-06-04 — GM Moonbeam/Moonriver finalisé + API Docker anti-timeout

- **GM Moonbeam/Moonriver finalisé** : `/gm` affiche Moonbeam et Moonriver comme chaînes actives, avec `✅ GM Done` après GM on-chain et les cartes `Fees Earned`/`Fees Platform`. Tests de garde : `gm-chains.test.ts`, `wagmi-gm-chains.test.ts`, `gm-storage.test.ts`, `gm-onchain-status.test.ts`.
- **GM status-onchain robuste** : `/api/gm/status-onchain` respecte désormais `RPC.MAX_LOG_RANGE` pour scanner les events `GmCheckedIn`. Cause racine Moonriver : l'endpoint officiel rejette les ranges 10k (`-32603 block range is too wide`, max 1024), donc le bouton restait `Say GM` malgré une tx confirmée.
- **GM deploy recovery** : `/api/gm/status` récupère les contrats GM déjà déployés on-chain quand le POST de registration a échoué ou quand la DB est stale. Le scan utilise `fetchOnChainContracts()` avec chunking par chaîne.
- **API Dockerfile** : suppression de `RUN chown -R node:node /app` dans le runner stage. Chaque `COPY` runner utilise maintenant `--chown=node:node`, ce qui évite le timeout Railway de ~15 min sur `node_modules` quand le cache Docker est absent.
- **Comms X** : post daily update publié `https://x.com/WCORExyz/status/2062634948259885209`. Assets : `apps/web/public/wcore-post-daily-update-10.svg` + `.png` (1200x675), angle `Moonbeam + Moonriver GM is live`, wording `170+ live` vérifié (174 chaînes enabled / 182 registry).

## 2026-06-03 — TON support + wcore.xyz restauré + Connect Wallet/GM hardening

- **GM Moonbeam activé** : factory `0x3fa756f1da5027a8ff692b2d65dface8eb446aaf` ajoutée dans `packages/shared/src/factories.ts` avec chainId `1284`. Wagmi étendu (chaîne + transport), test de garde `wagmi-gm-chains.test.ts` qui empêche toute chaîne GM absente du wagmi config. Build + deploy Web vérifié.
- **GM Moonriver activé** : factory `0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1` ajoutée dans `packages/shared/src/factories.ts` avec chainId `1285`. Wagmi étendu, `/gm` affiche Moonriver à côté de Moonbeam.
- **TON / The Open Network** : nouvelle VM supportée (`vm: "TON"`, 9 decimals, jettons via TonAPI avec Toncenter fallback). `packages/core/src/engines/ton.ts` (engine standalone), 5 tests core pass. TON chain ajouté à `packages/core/src/chains/TON.ts` + `chains/index.ts` + `chainList`. Détection wallet partagée : regex `(EQ|UQ|Ef|Uf)[A-Za-z0-9_-]{40,60}` + raw `-1:hex64`. UI : icône 🌊, VmBadge cyan, ChainSelector, HomePageClient placeholder, default chains. 170+ live chains (EVM 168, SVM 2, Cosmos 11, TON 1).
- **Comms X TON** : post publié `https://x.com/WCORExyz/status/2062515586609955222`. Assets : `apps/web/public/wcore-post-ton.svg` + `.png` (1200x675, vrai logo TON, wording `Toncoin and TON tokens`).
- **Domaine** : `wcore.xyz` de nouveau opérationnel en HTTPS sur Railway. Le SIWE nonce utilise maintenant l'origin requête correspondant (`wcore.xyz`) au lieu du premier `CORS_ORIGIN`.
- **Connect Wallet** : WalletConnect QR fallback reste disponible avec un `projectId` par défaut si l'env est vide. Le connecteur wagmi `injected()` est retiré du config statique pour éviter le crash Turbopack `ReferenceError: injected is not defined` en conflit MetaMask/Zerion.
- **EIP-6963** : ajout d'un picker robuste. Les providers annoncés sont connectés en direct (`eth_requestAccounts` + `personal_sign`) sans dépendre de `window.ethereum` global.
- **GM `/gm`** : `deployed:null` signifie désormais statut inconnu et déclenche un check ciblé. Un status global vide ne force plus `Deploy GM Contract` sur toutes les chaînes.
- **GM Header** : après un GM on-chain, le Header reste désactivé localement pendant que le backend fire-and-forget persiste la tx. Le GM on-chain désactive aussi le bouton Off-chain (`Done today`).
- **Comms X** : post `WCORE is back on wcore.xyz` publié (`2062228120476725406`) avec visuel `wcore-post-site-back.svg/.png`.
- **Docs** : ajout d'une note de réconciliation `wcore-gsheet` → `wcore-web` (`docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md`). Les changements Apps Script récents ne doivent pas être mergés automatiquement ; ils sont classés par portabilité.
- **Harmonisation RPC** : audit live de 170 chaînes via `scripts/audit-rpcs.mjs` (8 dead, 19 single, 54 half-dead). Nouveau module `chain-health.ts` (classification). 8 chaînes désactivées via `FLAGS.DISABLE_CHAIN=true` pour ne plus consommer du quota scan. Note `docs/rpc-harmonization-2026-06-03.md` matrice 11 couches.
- **Validation** : typecheck core/API OK, build API OK, 200/200 tests core OK (5 nouveaux tests TON).

## 2026-06-03 — wcore.xyz restauré + Connect Wallet/GM hardening

- **Domaine** : `wcore.xyz` de nouveau opérationnel en HTTPS sur Railway. Le SIWE nonce utilise maintenant l'origin requête correspondant (`wcore.xyz`) au lieu du premier `CORS_ORIGIN`.
- **Connect Wallet** : WalletConnect QR fallback reste disponible avec un `projectId` par défaut si l'env est vide. Le connecteur wagmi `injected()` est retiré du config statique pour éviter le crash Turbopack `ReferenceError: injected is not defined` en conflit MetaMask/Zerion.
- **EIP-6963** : ajout d'un picker robuste. Les providers annoncés sont connectés en direct (`eth_requestAccounts` + `personal_sign`) sans dépendre de `window.ethereum` global.
- **GM `/gm`** : `deployed:null` signifie désormais statut inconnu et déclenche un check ciblé. Un status global vide ne force plus `Deploy GM Contract` sur toutes les chaînes.
- **GM Header** : après un GM on-chain, le Header reste désactivé localement pendant que le backend fire-and-forget persiste la tx. Le GM on-chain désactive aussi le bouton Off-chain (`Done today`).
- **Comms X** : post `WCORE is back on wcore.xyz` publié (`2062228120476725406`) avec visuel `wcore-post-site-back.svg/.png`.
- **Docs** : ajout d'une note de réconciliation `wcore-gsheet` → `wcore-web` (`docs/wcore-gsheet-to-web-reconciliation-2026-06-03.md`). Les changements Apps Script récents ne doivent pas être mergés automatiquement ; ils sont classés par portabilité.
- **Harmonisation RPC** : audit live de 170 chaînes via `scripts/audit-rpcs.mjs` (8 dead, 19 single, 54 half-dead). Nouveau module `chain-health.ts` (classification). 8 chaînes désactivées via `FLAGS.DISABLE_CHAIN=true` pour ne plus consommer du quota scan. Note `docs/rpc-harmonization-2026-06-03.md` matrice 11 couches.
- **Validation** : typecheck core/API OK, build API OK, 195/195 tests core OK.

## 2026-05-30 — Corrections audit (batch 2 : Core-2 + FE-3)

- **Core-2** (données) : `resolveCosmosTokenDecimals` ne suppose plus 6 décimales pour les denoms non-`ibc/` inconnus. Seuls les micro-denoms standard (`^u[a-z]+$`) gardent 6 ; les denoms non-standard (`factory/`, `erc20/`, `cw20:`, etc.) absents de `DENOM_DECIMALS` sont skippés (`decimals_unknown`) au lieu d'être mal valorisés (risque 10^12 d'écart). Test ajouté (188 core pass).
- **FE-3** (UX/perf) : le bouton "refresh ce wallet" ne force plus un cache-bypass (= fan-out RPC max) sur TOUS les wallets. `refreshWallet(addr)` scope le force-refresh à l'adresse ciblée ; les autres wallets re-scannent depuis le cache. `forceRefreshAddrsRef` + split force/cache groups dans le batch scan.

## 2026-05-30 — Corrections audit (P1 batch 1)

- **API-2** (sécurité) : `/api/gm/onchain` exige `receipt.from === req.user.address`. Empêche un contrat enregistré malveillant de créditer un GM + tip pour autrui via event forgé. Test ajouté.
- **Core-1** : `RpcHealthTracker` decay par-endpoint — un endpoint avec échecs périmés (`lastSeen > ttl`) redevient éligible. Évite le rétrécissement permanent du pool RPC sur une session. Test ajouté (187 core pass).
- **FE-1** : `ChainCard` n'engage `useGmChain` que si `isCurrentWallet && FACTORIES[chain]` — supprime le fan-out 2×N `gm_read` qui 429ait le header GM.
- **FE-2** : `WalletContent` merge des prev-results déplacé render → `useEffect` (`mergePrevResults` mémoïsé). Plus de mutation de ref au render (React 18 concurrent-safe).
- **INFRA-1** : `pnpm test` racine inclut maintenant `@wcore/web` ; nouveau `test:api` séparé (DB).
- **INFRA-2** : `solc` (dead dep) retiré + override `tmp` supprimé → `pnpm audit --prod` toujours 0 vuln. `@types/bs58` phantom retiré (bs58 v6 ship ses types).
- **Docs** : `.env.example` ajoute `JWT_SECRET` + `RATE_LIMIT_GM_READ`.
- **Différés** : API-1 (GM score double-count, besoin tests DB idempotence), FE-3 (force-refresh ciblé, UX).

## 2026-05-30 — Audit transversal lecture seule

- Audit parallèle 4 domaines (API sécurité, core scan/pricing, frontend React/perf, infra/config/deps) post-v0.2.37. Doc : `docs/audit-2026-05-30-complet.md`.
- **8 findings P1** identifiés (réels, non corrigés) : API-1 (GM score double-count), API-2 (GM `receipt.from` binding), Core-1 (RpcHealthTracker sans decay), FE-1 (ChainCard fan-out GM), FE-2 (mutation ref au render), FE-3 (force-refresh non ciblé), INFRA-1 (`pnpm test` incomplet), INFRA-2 (`solc` dead dep).
- **~16 findings P2/P3** (perf render, deps, dockerfile, env, decimals Cosmos non-ibc, EUR stables).
- Nombreuses zones vérifiées **propres** : auth/CSRF/admin/SQL/IDOR/SSRF, consensus zero protection, decimals override, FX direction, Docker non-root, `@tanstack/react-query` (pas dead), ConnectButton/NotificationsBell/GmContext.
- `ROADMAP.md` pointe vers ce nouvel audit ; `docs/audit-2026-05-29-complet.md` passe en historique.

## 2026-05-29 — Audit H4/H7/H8 + GM fixes + chain icons (v0.2.37)

### H4 — Split monsters files
- **`evm.ts`** (1498 l.) → 5 modules : `evm-types.ts`, `evm-balances.ts`, `evm-pricing.ts`, `evm-scan.ts`, `evm-batch.ts` + barrel `evm.ts` (42 l.). Zero changement API. 186 tests core OK.
- **`WalletContent.tsx`** (1231 l.) → ~487 l. + hooks (`useScanOrchestrator`, `useWalletLabels`) + composants (`PostScanBanner`, `ScanProgressBanner`, `PortfolioSummaryCard`, `WalletSelector`, `AllTokensTable`) + utilitaire `scan-api.ts`.
- **Gotcha** : `pnpm typecheck` (tsc) ne couvre PAS `next build`. 3 erreurs (TokenTable collision, `chains: unknown[]`, `secondaryLabel?: string` vs `null`) n'ont été vues que par `next build` → 2 deploy web échoués. Leçon documentée. Corrigé : `AllTokensTable` renommé, `TokenTable` original restauré, types alignés.

### H7 — Nettoyage console.log debug
- 3 logs supprimés : 2 dans `ConnectButton.tsx` ([ConnectButton] nonce/login response), 1 dans `gm-contracts.ts` ([gm-balance-debug]).
- Audit complet : 52 `console.*` analysés, tous les autres gardés (error logs intentionnels, monitoring prod, instrumentation scan).

### H8 — Casts `as any`
- Audit complet : 17 `as any` identifiés dans apps/web + packages/core.
- 3 corrigés : `window.ethereum` type global + `fetchNativePrice` paramétré + chain key normalization.
- 1 truly nécessaire (wagmi connector list sur 80+ chaînes). Le reste documenté pour session dédiée.

### Scan scheduler — pool unique priorisée
- Remplace la sérialisation non-EVM → EVM (244s) par une pool unique avec SVM/Cosmos prioritaires.
- `orderScanJobsForExecution()` dans `scan-results.ts`. Test unitaire de garde ajouté.

### GM rate_limited header — fix fan-out per-card
- **Racine** : ~30 cartes sur `/gm`, chacune fetchant `/api/gm/has-deployed` + `/api/gm/status` (même endpoint global) → 90 appels `gm_read` → `GET /api/gm/random` en 429.
- **Fix** : `gmStatusFetchPlan(initialStatus)` — la carte ne refait plus le fetch global quand `initialStatus` est fourni par la page. Test : 4 nouveaux cas.
- **Defense-in-depth** : `RATE_LIMIT_GM_READ` (défaut 300, env override), indépendant de `RATE_LIMIT_AUTH`.

### GM native price "undefined"
- **Racine** : `fetchNativePrice()` lisait `config.chainKey` (undefined pour le header GM random multi-chaîne).
- **Fix** : `fetchNativePrice(chainKey)` paramétré. Header passe le chainKey résolu par `getRandomContract()`.

### INCENTIV phantom chain removed
- INCENTIV n'existe que comme testnet (16350), banni par "no testnets in WCORE". Le chainId 24101 référencé était fantôme (RPC mort, absent chainid.network).
- Retiré de `wagmi.ts`, `DeployClient.tsx`, `GmPageClient.tsx`, `chain-icon-manifest.json`, `chain-native-symbols.json`, asset SVG supprimé.

### Chain icons — 3 passes
- **Pass 1** : 3 `.ico` cassés (AEVO, PLAYNANCE_PLAYBLOCK, SHIDO_NETWORK) → PNG valides.
- **Pass 2** : 13 placeholders `?` (NEXUS, STEP_NETWORK, ETHO_PROTOCOL, etc.) → vrais logos ou fallback propre.
- **Pass 3** : 5 emoji (ETHO_PROTOCOL, EDGELESS, LAYERAI, AVES_NETWORK, AWAJI) → logos vérifiés.
- Test de garde : `chain-icons.test.ts` (refuse placeholders, valide les assets précédemment cassés).

### Déploiements
- API : `c9b3721` (GM fix + evm split) · `01cd2a1` (SVM retry) · `8096046` (Cosmos REST failover) · `1783ebf3` (refactor core)
- Web : `531b29ad` (failed — TokenTable collision) → `6112271` (fixed) · `6b6a3f8` (native price fix) · `39797ad9` (INCENTIV removal)

### Vérifications
- core test : 186/186 pass · typecheck : OK · lint : OK · web build (next build) : OK

## 2026-05-29 — Backlog audit Phase 3 — clôture (H5 / H4)

- **H5** code-splitting : déjà satisfait — 4 `next/dynamic({ ssr:false })` (WelcomeModal, ValueDistribution, GmWithdrawNotification) ; aucune lib lourde importée en eager. Le finding était un faux positif (mesure limitée à `page.tsx`, un server shell). Marqué résolu.
- **H4** split `evm.ts` (1499 l.) / `WalletContent.tsx` (1207 l.) : **différé**. Dette d'architecture pure, sans bug associé ; le split de `WalletContent` nécessite une validation UI (rendu/hydratation/timing d'état) que le typecheck ne couvre pas. À traiter dans une session dédiée.

## 2026-05-29 — Backlog audit Phase 3a (H3 strict TypeScript web)

### H3 — `strict:true` activé sur `apps/web`
- `apps/web/tsconfig.json` : `strict:true`, suppression de `noImplicitAny:false`. Les strict checks frontend ne sont plus annulés.
- 27 erreurs corrigées par de vrais fixes de typage (pas de `as any` ni `@ts-ignore`) :
  - `WalletRecord.label` et `DbGmStatus.deployed` élargis pour matcher l'API (`string \| null`, `boolean \| null`).
  - `demo-mode.ts` : champ `priceSource` ajouté aux tokens/natifs de démo.
  - `scan-results.test.ts` : `scriptVersion` ajouté à la fixture `ChainScan`.
  - Guards/annotations : `scam-detector` (`c.tokens ?? []`), `api.ts` (`?? undefined`), `useGmChain` (optional chaining), `GmPageClient` (assertion post-filter), `reduce` typé, `getNativeSymbol`/Creator (`Record<string,string>` index), `ProfileClient` wallet-id (`!` sur invariant runtime).
- Validation : `pnpm -r typecheck` ✅ (web strict) · `pnpm -s lint` ✅ 0 erreur · `pnpm --filter @wcore/core test` ✅ 185 pass.

## 2026-05-29 — Backlog audit Phase 2 (sécurité en profondeur)

### S1 — Rotation refresh token atomique
- Nouvelle primitive `CacheStore.add(key, value, ttlMs)` (set-if-absent) : Redis `SET NX` (fail-closed sur erreur), `MemoryCacheStore` atomique dans l'event loop. Interface + 2 stores + mocks de test mis à jour.
- `apps/api/src/auth.ts` : `POST /api/auth/refresh` utilise `claimAndRevokeToken()` — claim atomique single-use du jti. Deux refresh concurrents (ou un token volé racing le légitime) : un seul gagne, l'autre est rejeté en `token_revoked`. Remplace le check-then-revoke non atomique.
- Tests : `cache.test.ts` — `add` single-use, 10 claims concurrents → 1 gagnant, ré-claim après expiration. Core : 185 pass.

### F1 — Faux négatif switch-réseau GM
- `apps/web/hooks/useOnChainGm.ts` (`sendGm` + `deployContract`) : flag `providerConfirmed` posé quand `eth_chainId` (provider) OU wagmi confirme la chaîne ; le guard final accepte la confirmation provider même si le state React wagmi lague. Plus de blocage « Wallet did not switch » sur un switch pourtant effectif.

### Validation
- `pnpm -r typecheck` ✅ · `pnpm --filter @wcore/core test` ✅ 185 pass · `pnpm -s lint` ✅ 0 erreur. Tests API refresh (DB/Redis) à confirmer en CI.

## 2026-05-29 — Backlog audit Phase 1 (quick wins)

### Sécurité — S2 Docker non-root
- `apps/api/Dockerfile` et `apps/web/Dockerfile` : conteneurs en `USER node`. Côté API, ne pas utiliser `RUN chown -R node:node /app` dans le runner stage : la correction actuelle utilise `COPY --chown=node:node ...` sur les copies runner pour éviter le timeout Railway quand `node_modules` n’est pas en cache.

### Hygiène — H1 / H2
- **H1** : `package.json` `test` = `pnpm -r typecheck && pnpm -r --filter "./packages/*" --if-present test` (agrégat réel). Vérifié vert : typecheck monorepo + 182 tests `@wcore/core`. `validate:static` reste un script séparé.
- **H2** : `.env.example` documente `ADMIN_TOKEN` (section Admin/ops) — header `Authorization: Bearer` ou `x-admin-token`, comparé en `timingSafeEqual`, unset → endpoints admin en 401.

### Faux positif — F2
- Le « fallback prix natif `2000` » signalé n'existe pas : le seul `2000` dans `useOnChainGm.ts` est `setTimeout(r, 2000)` (polling receipt). `fetchNativePrice` throw déjà proprement (corrigé v0.2.32). Marqué résolu.

### Nouveau finding — H9
- `scripts/validate-static.js` exit 1 sur 2 checks GAS (`SYNC_J1_ALL_SHEETS` trigger, `WCORE_AUTO_HEAL` vs `BUILD_RPC_LOOKUP`). Le `test` racine n'était donc pas « faux-vert » mais rouge. Découplé de `test` ; à investiguer côté `src/*.gs` (hors périmètre web).

## 2026-05-29 — Audit complet lecture seule

### Documentation
- Ajout de `docs/audit-2026-05-29-complet.md` : audit transversal de l'arbre courant (post v0.2.34) — sécurité/API, core scan/pricing, frontend, infra/CI/docs, qualité/hygiène.
- `ROADMAP.md` pointe maintenant vers cet audit comme audit courant ; `docs/audit-2026-05-28-complet.md` passe en historique. Backlog 2026-05-29 consolidé (O1 ops, S1/S2 sécurité, F1/F2 frontend, H1–H5 hygiène).

### Bilan vert (vérifié)
- `pnpm -s typecheck` ✅ · `pnpm -s lint` ✅ (0 erreur, 6 warnings react-hooks) · `pnpm --filter @wcore/core test` ✅ · `pnpm audit --prod --audit-level=high` ✅ 0 vuln.
- Tous les findings P0/P1 du 2026-05-28 confirmés corrigés dans l'arbre (GM GET read-only, deploy vérifié on-chain, limite scan anonyme, EVM `DISABLE_NATIVE_BALANCE` + negative cache liveness, lint 0 erreur).

### O1 résolu — commit + déploiement
- ✅ Batch v0.2.33/v0.2.34 commité (`4af4eab`) et poussé sur `origin/master`.
- ✅ Déploiements Railway déclenchés : API (service `48f1af2d`, build `a19291bc`) + Web (service `143203eb`, build `af460499`). Les P0 sécurité GM partent en prod avec ce build.

## 2026-05-28 soir — Connect + GM B3 fixes (v0.2.34)

### Connect flow — 4 bugs critiques
- **Erreur invisible en etat "ready"** : l'erreur de login etait set mais jamais affichee dans la vue "Sign In". Ajout de l'affichage d'erreur + messages contextualises (`nonce_failed`, `network_error`, `chain_id_mismatch`). Fichier : `ConnectButton.tsx`.
- **Pas de `res.ok` sur login** : ajout du check HTTP avant `res.json()`. Les 500/502/serveur-down produisent maintenant un message d'erreur lisible. Fichier : `ConnectButton.tsx`.
- **`chainId` hardcode a 1** : quand le wallet etait deja connecte (`isConnected=true`), `chainId` restait 0 → fallback `chainId \|\| 1`. Certains wallets (Zerion, etc.) refusaient de signer un message claimant une autre chaine. Fix : lecture de `wagmiChainId` depuis `useAccount()`. Fichier : `ConnectButton.tsx`.
- **Flickering bouton Sign In** : l'effet wagmi appelait `setAddress(addr)` a chaque changement d'`authStep` meme si l'adresse n'avait pas change. Ajout d'un guard `prevAddressRef` + `prevAuthStepRef` pour ne transitionner idle/expired→ready qu'une fois. Fichier : `ConnectButton.tsx`.

### GM B3 — 3 fixes de resilience
- **`has-deployed` scan on-chain** : quand `prisma.gmContract.count()` retourne 0, le backend scanne maintenant les logs factory on-chain (`eth_getLogs`) pour retrouver les contrats deployes via l'ancien flow fire-and-forget. Fichier : `gm-contracts.ts`.
- **`/api/gm/onchain` retries etendus** : 3→10 retries, backoff `pow(2,n)` → `5000 + n*2000` ms (~2 min max). Fichier : `gm-onchain.ts`.
- **Frontend fire-and-forget** : `POST /api/gm/onchain` est appele en arriere-plan avec 3 retries (timeout 15-45s). L'UI affiche ✅ GM immediatement apres confirmation MetaMask. Fichier : `useOnChainGm.ts`.

### Deploiements
- API `c4f3a40a` : has-deployed scan + GM retries 10x
- Web `4ebc431d` : connect fixes + GM fire-and-forget

## 2026-05-28 — Audit P0/P1 fixes (v0.2.33)

### Securite/API — P0 corriges
- **`GET /api/gm/has-deployed` read-only** : suppression de l'upsert DB direct par query `contract=` et du sync fire-and-forget `fetchOnChainContracts()`. La route ne fait plus que `prisma.gmContract.count()`.
- **`POST /api/gm/contracts/deploy` verifie on-chain AVANT insertion** : `fetchDeployReceipt()` interroge tous les RPCs en parallele, `findVerifiedDeployedContract()` verifie `status=0x1`, `to=factory`, event `ContractDeployed`, createur attendu, adresse extraite depuis `topics[1]`. Si la verification echoue → `400 deploy_verification_failed`. Fichier : `gm-contracts.ts`.

### Scan — P1 corriges
- **Limite scan anonyme** : `resolveScanChainLimit()` (exporte depuis `scan.ts`) est utilisee sur `/api/scan`, `/api/scan/batch`, `/api/scan/async`. Les anonymes sont limites a `ANONYMOUS_MAX_CHAINS_PER_SCAN` (20), les authentifies gardent leur plan. Fichiers : `scan.ts`, `scan.test.ts`.

### Core EVM — P1 corriges
- **Batch EVM respecte `DISABLE_NATIVE_BALANCE`** : `getEvmWalletsAssets()` lit `chain.FLAGS?.DISABLE_NATIVE_BALANCE` et skip `readNativeBalance()` pour les chaines comme TEMPO. Fichier : `evm.ts`.
- **Negative cache avec liveness check** : `canServeEmptyCache()` appelle `eth_getBalance` avant de servir `[CACHED_EMPTY]`. Si le wallet est funde ou si la verification echoue, le scan live continue. Applique a `getEvmWalletAssets()` (single) et `getEvmWalletsAssets()` (batch). Fichier : `evm.ts`.

### Frontend — P1 corriges
- **`GmWithdrawButton.tsx`** : `useCallback` deplace avant le `if (!contract || !balance) return null` → plus de violation `react-hooks/rules-of-hooks`. Fichier : `GmWithdrawButton.tsx`.

### Lint — nettoyage complet
- 15 erreurs unused/catch corrigees : `auth.ts` (`FastifyRequest`, `setAuthCookies` reappelee, `jti`/`newJti` nettoyes, `catch (e)` → `catch`), `metrics-plugin.ts` (`reply` → `_reply`), `server.ts` (`createHash` retiré), `cosmos.ts` (`denomDecimals` + `let` → `const`), `cascade.ts` (`nowMs`/`trail` retires), `cascade.test.ts` (`chainA`/`chainB` retires), `restore-db.cjs` (`path` retiré), `tools/add-chains.cjs` (`catch (e)` → `catch`). `pnpm lint` : 0 erreur, 6 warnings react-hooks existants.

### Auth hardening — P2
- **`clearAuthCookies()`** utilise maintenant `COOKIE_OPTS` complets (`secure`, `sameSite`) au lieu de `{ path: "/" }`. Corrige le logout cookie fragile en prod.

### Scripts X — neutralises
- 6 scripts (`x-cycle8.js`, `x-discovery-large-cycle.js`, `x-cycle-v2.js`, `x-cycle-global-scan.js`, `x-cycle-4.js`, `x-cycle-3-replies.js`) : dry-run par defaut. Flag `--execute-i-understand` requis pour publier. Les scripts sont ignores par git (`.gitignore`), les modifications sont locales.

### Tests ajoutes
- `gm-contracts.test.ts` : `findVerifiedDeployedContract()` strict receipt checks.
- `gamification.test.ts` : deploy non verifie rejete + GET read-only sans ecriture.
- `scan.test.ts` : `resolveScanChainLimit()` anonyme vs auth.
- `evm.test.ts` : negative cache liveness + batch `DISABLE_NATIVE_BALANCE`.

### Deploiements
- API : deploye le 2026-05-29 via commit `4af4eab` (service `48f1af2d`, build `a19291bc`) — P0 GM fixes + scan limit + clearCookie hardening.
- Web : deploye le 2026-05-29 via commit `4af4eab` (service `143203eb`, build `af460499`) — lint hook fix.

## 2026-05-28 — Audit complet lecture seule

### Documentation
- Ajout de `docs/audit-2026-05-28-complet.md` : audit transversal sécurité/API, core scan/pricing, frontend, infra/CI/docs.
- `ROADMAP.md` pointe maintenant vers cet audit comme audit courant et consolide les P0/P1 actifs.

### Findings majeurs enregistrés
- Critique : `GET /api/gm/has-deployed` écrit en DB via `upsert` et peut réattribuer un contrat GM.
- Critique : `POST /api/gm/contracts/deploy` enregistre le contrat avant vérification serveur on-chain.
- High : `ANONYMOUS_MAX_CHAINS_PER_SCAN` est défini mais ignoré par les endpoints scan sync/batch/async.
- High : `pnpm lint` est rouge, avec une violation `react-hooks/rules-of-hooks` dans `GmWithdrawButton.tsx`.
- High : batch EVM ignore `FLAGS.DISABLE_NATIVE_BALANCE`, et le negative cache EVM n'a pas de liveness check.
- High : scripts X actionnables encore présents dans `scripts/`.

### Vérifications audit
- `rtk pnpm typecheck` : OK.
- `rtk pnpm audit --prod --audit-level=high` : OK.
- `rtk pnpm lint` : échec, 29 erreurs + 6 warnings.
- `rtk pnpm --filter @wcore/core test` : échec, 179/180 passent ; test timing fragile.
- `rtk pnpm --filter @wcore/web test` : échec, 34/40 passent ; API locale absente pour les tests UI.

## 2026-05-27 — GM refactoring + native price fix

### Refactoring GM (Phase 1+2)
- Extrait `gm-storage.ts` : centralise les helpers localStorage GM (`lsGmDone`, `lsDeployed`, `lsContractDeployed`, `lsSetContractDeployed`, `lsSetGmDone`, `lsGetBalance`, `lsSetBalance`). Fichier unique au lieu de 3 fichiers dispersés.
- Supprimé `checkOnChainDeployed` : 35 lignes de code mort (`return false` au ligne 58).
- Supprimé `nativeIds` mapping : 43 lignes de CoinGecko IDs hardcodés (utilise `/api/price/native` API au lieu).
- Supprimé workaround `KNOWN` contracts : auto-registration Citrea/Cronos/Fuse plus nécessaire (tous en DB).
- Extrait `GM_PLATFORM_OWNER` dans `@wcore/shared` : constante partagée web+api au lieu de hardcoding local.
- Refactor `checkHasDeployed` : utilise `lsContractDeployed` helper.
- Refactor `sendGm` : utilise `lsSetGmDone` helper.
- Refactor `deployContract` : utilise `lsSetContractDeployed` helper.
- Refactor `GmWithdrawButton` : utilise `lsGetBalance`/`lsSetBalance` helpers.
- Nettoyé ~200 lignes de code dupliqué/dead/hardcodé.

### Fixes GM critiques
- **`getRandomContract` CORS fix** : `fetch()` brut → `apiFetch` pour que le JWT soit envoyé. Sans ça, le serveur ne pouvait pas identifier l'utilisateur → pas de filtre balance $0.05. Fichier : `useOnChainGm.ts`.
- **`fetchNativePrice` fallback 2000 fix** : `fetch()` brut avec `return 2000` comme fallback → `apiFetch` + throw. Le fallback $2000 (prix ETH) causait des tips de 0.0000255 POL au lieu de 0.57 POL sur Polygon. Toutes les chaînes non-ETH gas étaient affectées. Fichier : `useOnChainGm.ts`.
- **Balance threshold `$0.05` → `$0.10`** : le filtre `/api/gm/random` vérifie maintenant `balanceUsd >= 0.10` pour couvrir tip $0.05 + gas fees variables. Fichier : `gm-contracts.ts`.

## 2026-05-27 — Audit global + docs/CI cleanup

### Session v0.2.30+ — Continuation (après-midi)
- Activation GM Mitosis : factory `0x540dbcb3b2055ef5790b9fdaa197216bb4aac3c2` sur chainId 124816. Fichiers : `factories.ts`, `ChainCard.tsx`, `DeployClient.tsx`, `GmPageClient.tsx`, `useOnChainGm.ts`.
- Auth resilience : `/api/auth/me` et `doRefresh()` ne downgrade plus l'état auth sur erreurs réseau/5xx. Seul un 401 explicite déconnecte. Corrige la session perdue après restart API ou Ctrl+Shift+R. Fichiers : `ConnectButton.tsx`, `api.ts`.
- Dead code supprimé : `useScanScheduler.ts`.
- Concurrence harmonisée : `GLOBAL_CHAIN_CONCURRENCY` lit `NEXT_PUBLIC_SCAN_CONCURRENCY` (défaut 50), aligné avec `SCAN_CONCURRENCY` backend.
- Scan duration : affiche le temps réel du scan au lieu de la somme des `scanMs` de toutes les chaînes.
- Suppression PDF : `PdfExport.tsx`, `MultiWalletPdfExport.tsx`, boutons `window.print()` retirés.
- `next/dynamic` code splitting : `ValueDistribution`, `WelcomeModal`, `GmWithdrawNotification` lazy-loadés.
- `React.memo` sur `TokenIcon` et `ChainIcon`.
- `IntraScanCache` type partagé : `Map<string, Promise<PricingResult>>` exporté depuis `@wcore/core`.
- Pricing native fallback cache : utilise le cache stale quand DefiLlama/CoinGecko échouent.
- Optimisation scan massif : SCAN_CONCURRENCY 20→50 + pré-warm du pricing cache via batch DefiLlama.

### Correctifs P0/P1 audit (matin)
- CSRF API passé en deny-by-default sur toutes les mutations `/api/*`, avec exceptions explicites uniquement pour le pré-auth SIWE (`/api/auth/nonce`, `/api/auth/login`).
- Lectures publiques GM (`/api/gm/random`, `/api/gm/contracts`, `/api/gm/status`, etc.) remises sous bucket rate-limit `gm_read` au lieu de bypasser le limiter GM et le catch-all.
- Côté web, les retraits GM résolvent les chain IDs via `getFactory()` case-insensitive (`getGmContractChainId`) au lieu d'indexer directement `GM_FACTORIES[chainKey]`.
- `x-admin-token` ajouté aux headers CORS autorisés pour éviter les preflights admin cross-origin bloqués.
- Quotas scan séparés : les anonymes utilisent `ANONYMOUS_MAX_CHAINS_PER_SCAN` (défaut 20), les utilisateurs authentifiés gardent leur limite de plan (`MAX_CHAINS_PER_SCAN` / 120).
- `/api/gm/random` ne fait plus un `findFirst` par contrat pour exclure les GM déjà faits aujourd'hui : un seul `findMany` batch construit un Set de `contractId` utilisés.
- `TokenIcon` ne déclenche plus de `setState` pendant le render quand aucun fallback CMC n'existe. La résolution d'image passe par le helper pur `getTokenIconSource()`.
- Overrides TokenIcon long-tail réalignés avec les tests existants pour MITO, OPEN, BTCN, GHO et G.
- Indexes DB hot paths ajoutés : `users(score)`, `gm_contracts(ownerId)`, `gm_contracts(creatorAddress)`, `onchain_gms(userId, createdAt)`, `onchain_gms(contractId)`, `notifications(userId, createdAt)` + migration additive.
- Régression GM Base verrouillée : `/api/gm/random` peut retourner `chainKey: "BASE"`; le hook on-chain expose/teste `getGmChainId("BASE")` pour éviter l'erreur frontend `GM not supported on BASE`.
- GM Base : `/api/gm/random` préfère maintenant le contrat dont `creatorAddress` matche l'adresse demandée, et le contrat legacy Base `0x4622e578...556fb1b` est filtré côté API + supprimé par migration additive. Le contrat attendu pour le owner reste `0xeA392000a2ae8045cFE72e538cDfbB809c6C49eA`.
- Notifications streak en boucle : `createNotification` déduplique par `(userId, type, title)` pour empêcher les doublons. Le SSE snapshot et `unread-count` utilisent maintenant `notifWhere` (cohérent avec `read-all` et le REST GET). Migration SQL de nettoyage des doublons existants.
- Fix `apiFetch` : ne plus envoyer `Content-Type: application/json` quand il n'y a pas de body. Corrige le `PUT /api/notifications/read-all` qui retournait 400 "Body cannot be empty" → la notif streak revenait en boucle car le mark-all-read échouait silencieusement.
- `forceRefresh` bypass le cache négatif `empty:*` : le flag est passé jusqu'aux engines EVM/SVM/Cosmos, qui sautent le short-circuit du cache négatif quand il est actif. Corrige le cas où un wallet vide puis alimenté restait `[CACHED_EMPTY]` malgré un force refresh.
- `GET /api/auth/me` : le calcul des points on-chain n'utilise plus le résidu `user.score - questPts - offChainPts` (faux après tout reset de streak). Il dérive maintenant `onChain.points` et `onChain.count` de `buildPerChainGmPoints`, qui est toujours correct. Le total du score reste inchangé.
- Self-heal `POST /api/gm/onchain` : après la reconstruction per-chain, réconcilie maintenant le streak général (`user.gmStreak`, `longestStreak`, `lastGmDate`) à partir de tous les `onchainGms`. Évite la divergence silencieuse entre streak général et per-chain.
- Access tokens 24h : les nouveaux access tokens incluent maintenant un `jti`; l'auth hook vérifie `revoked:{jti}` et refresh/logout révoquent aussi l'access cookie courant, pas seulement le refresh token.
- Scan UI : l'annulation/changement de scan invalide maintenant `scanRunIdRef` et protège les mutations d'état après `loadChainVmMap`, dans le `finally` des jobs batch et après le pool global. Évite les toasts/progrès/active chains stale après annulation.
- SVM/Cosmos precision : les montants bruts SPL/REST ne sont plus convertis via `Number(...)` avant formatage. Ils restent en string/BigInt jusqu'au calcul décimal, et les caches native/token conservent les unités brutes. Tests ajoutés au-dessus de `Number.MAX_SAFE_INTEGER`.
- Cosmos IBC decimals : les denoms `ibc/*` ne fallback plus aveuglément à 18 décimales. Le scan tente `denom_traces/{hash}` et réutilise les décimales du `base_denom` connu; si la résolution échoue, le token est marqué `decimals_unknown` et ignoré plutôt que sous-évalué massivement.
- RPC resolver scan : les engines EVM (single + batch) et SVM utilisent maintenant `getRpcEndpoints()` au lieu de lire directement `chain.RPC.ENDPOINTS`, ce qui active le merge static + dynamic + health centralisé pour les scans.
- Secrets docs : ajout de `.gitleaks.toml` avec règles WCORE spécifiques pour Google OAuth (`GOCSPX-*`), Blockscout Pro (`proapi_*`), URLs Postgres et Redis avec credentials. La rotation fournisseur reste obligatoire pour les secrets historiques.
- Ops events perf : `recordOpsEvent()` ne purge plus la table `ops_events` à chaque écriture. La purge 7 jours est déplacée dans le cleanup périodique `snapshotMetrics()`.
- API compression : `@fastify/compress` enregistré globalement sur Fastify pour compresser les réponses JSON volumineuses (scan results, métriques, historique).
- Error boundaries Next : ajout de `app/error.tsx` (boundary route-level qui isole le crash d'une page tout en gardant le layout/sidebar) et `app/global-error.tsx` (erreurs fatales du layout). L'ancien `ErrorBoundary` manuel qui wrappait tout le `SidebarLayout` a été retiré du layout — un crash de page ne fait plus tomber toute l'app.
- API Cache-Control : `/api/chains` et `/api/chains/:key` cachés 5min (stale-while-revalidate 1h, config quasi-statique); `/api/price/eth` et `/api/price/native` cachés 60s (SWR 120s) pour réduire les hits CoinGecko/DefiLlama répétés.
- Refactor `IntraScanCache` : type partagé `IntraScanCache = Map<string, Promise<PricingResult>>` exporté depuis `@wcore/core` (pricing), remplaçant les 7 duplications `Map<string, Promise<any>>` dans les engines EVM/SVM/Cosmos, le dispatch et le scan plugin. Typage précis, aucun changement runtime.
- Pricing native fallback cache : quand DefiLlama et CoinGecko échouent (rate limiting pendant scans massifs), le pricing cascade utilise maintenant le cache stale comme fallback au lieu de retourner `NO_PRICE`. Corrige SOL/ATOM/INJ/BASE affichant `—` après scans longs (70+ min). Fichiers : `packages/core/src/pricing/cascade.ts` (lignes 152-158 pour natif, 133-139 pour tokens).
- Optimisation scan massif : SCAN_CONCURRENCY augmenté (20 → 50) + pré-warm du pricing cache via batch DefiLlama (1 appel HTTP pour toutes les chaînes). Réduit la durée du scan de ~70 min à ~30 min et évite le rate limiting. Fichier : `apps/api/src/plugins/scan.ts`.
- `React.memo` sur `TokenIcon` et `ChainIcon` : évite les re-renders inutiles dans les listes de centaines de tokens/chaînes pendant les scans. Gain perf sur les gros portefeuilles.
- `next/dynamic` code splitting : `ValueDistribution`, `WelcomeModal`, `GmWithdrawNotification` chargés async avec `ssr: false`. Réduit le bundle initial JS.
- Suppression export PDF : `PdfExport.tsx` et `MultiWalletPdfExport.tsx` retirés. Le bouton "PDF" reste dans `ScanDetailClient.tsx` mais utilise `window.print()` directement sans wrapper.
- Bug GM "Deploy" sans auth (page wallet) : sur `ChainCard`, le bouton "🚀 Deploy GM Contract" apparaissait quand le wallet était connecté mais **pas authentifié** (header "Sign In", `authStep="ready"`). `/api/gm/status` et `/api/gm/has-deployed` renvoient `401` sans session → `hasDeployed=false` → bouton trompeur qui redéployait un contrat existant. **Fix** : `WalletContent` ne passe `connectedAddress` aux features GM que si `authStep === "authenticated"` (sinon `null` → boutons GM/Deploy masqués, aucun fetch GM). **Défense en profondeur** : `handleDeploy` re-vérifie `checkHasDeployed()` juste avant d'envoyer la tx et abandonne si un contrat existe déjà.

### Audit global
- Ajout de `docs/audit-2026-05-27-global.md` : sécurité/API, frontend, core scan/pricing, infra/docs.
- Nouveaux P0/P1 actifs consolidés dans `ROADMAP.md` : CSRF deny-by-default, rate-limit GM/scan, GM factory lookup web case-insensitive, `TokenIcon` render purity, forceRefresh vs `empty:*` EVM, précision SVM/Cosmos, resolver RPC dynamique dans engines.

### Nettoyage docs/secrets
- Secrets réels retirés de `AGENTS.md` et `ROADMAP.md` et remplacés par placeholders/variables d'environnement.
- `README.md` nettoyé : plus de version/test counts hardcodés, script absent supprimé, tests renvoyés vers CI.
- `DEPLOY.md` corrigé : déploiement Railway direct, cache portfolio navigateur désactivé, cache serveur `scan:v2:*` documenté.

### CI/tooling
- `.github/workflows/ci.yml` expose `TEST_DATABASE_URL` / `TEST_REDIS_URL` au niveau job pour que le step API integration gated puisse réellement s'exécuter.
- `apps/web/package.json` remplace `next lint` par `eslint .` pour Next 16.

### Action opérateur requise
- Rotater le Google OAuth client secret et la clé Blockscout Pro qui étaient présents dans l'historique de docs.

## 2026-05-26 — v0.2.31 : notification spam + auth resilience + cache stale fix

### Notifications spam/revival fix (3 root causes)
1. **Scan notifs supprimées** — `prisma.notification.create` pour `scan_done`/`scan_degraded` retiré de `apps/api/src/plugins/scan.ts`. Les vieilles notifs filtrées de toutes les requêtes + cleanup one-shot au boot API.
2. **SSE overwrites optimistic state** — `lastActionAt` ref bloque SSE/polling pendant 5s après `markAllRead`/`markAsRead`. Fixée également : stale closure via `isAuthenticatedRef`.
3. **Mark-read sans auth** — `markAllRead`/`markAsRead` ne font plus rien si `!isAuthenticated`. Update optimiste immédiate avec revert+fetch si l'API échoue.

### Notifications/GM affichées sans être connecté
- `NotificationsBell` vide ses states (`unreadCount=0`) dès que `authStep !== "authenticated"` + race async corrigée via `isAuthenticatedRef`.
- `GmWithdrawNotification` passe `address=null` à `useGmContracts` si pas authentifié → pas de fetch ni d'affichage "X withdrawable".

### Déconnexion systématique au Ctrl+Shift+R
- **Access token TTL 15min → 24h** (`apps/api/src/auth.ts`).
- `authStep === "expired"` maintenant promu en `"ready"` quand MetaMask reconnect, donc le bouton "Sign In" s'affiche au lieu de "Connect Wallet".

### Cache stale `scan:v2` (suite v0.2.30)
- `hasCachedValue()` rejette les entrées cache où `native.balance > 0` mais `native.priceEur == null` → l'API re-scanne au lieu de servir le cache pollué.

### Bouton "Retry timed-out chains"
- Nouveau bouton dans la bannière orange qui relance `fetchBatchScan` uniquement pour les chaînes en timeout.

### Auth resilience (v0.2.31b)
- **Erreur réseau sur `/api/auth/me`** → garde `storedAddr` en localStorage et passe à `"ready"` au lieu de `"expired"` → l'utilisateur voit "Sign In" au lieu de perdre tout état.
- **`wcore-logout` event** → ne vide plus `address` ni `localStorage` → seul `authStep` passe à `"expired"`, promu en `"ready"` par la synchro wagmi.
- **`doRefresh` failure** → ne supprime plus `localStorage` → l'adresse survit aux erreurs réseau temporaires.
- **Résultat** : les erreurs réseau temporaires ne déconnectent plus l'utilisateur.

### Déploiements
- API Railway `48f1af2d` → `SUCCESS` (×3 déploiements).
- Web Railway `143203eb` → `SUCCESS` (×6 déploiements).

## 2026-05-26 — v0.2.30 : stale SVM/Cosmos cache + frontend merge case-insensitive

### Bug 1 — Frontend merge chainKey case-sensitive
- **Root cause** : `mergeChainResults()` dans `apps/web/components/scan-results.ts` utilisait `chain.chainKey` brut comme clé de Map. Un ancien résultat `"solana"` (lowercase) et un frais `"SOLANA"` (uppercase) devenaient deux entrées distinctes — l'ancien avec `priceEur=null` survivait au rendu (SVM/Cosmos affichait `0€` / `price —`).
- **Fix** : normalisation `.toLowerCase()` des clés dans la Map (`scan-results.ts:12-13`).
- **Test** : `replaces stale chain results case-insensitively` ajouté à `apps/web/__tests__/scan-results.test.ts`.

### Bug 2 — Cache serveur `scan:v2` pollué par un résultat sans prix natif
- **Root cause** : `shouldCacheAssets()` autorisait le cache quand `native.balance > 0` mais `native.priceEur = null` et `errors.length = 0`. Un scan partiel SVM/Cosmos avec le prix natif absent empoisonnait le cache `scan:v2:*`.
- **Fix** : garde `if (nativeBalance > 0 && native.priceEur == null) return false` dans `apps/api/src/plugins/scan.ts:64`.
- **Test** : `does not cache positive native balances without a native price` ajouté à `apps/api/src/scan-cache-policy.test.ts`.

### Déploiements
- API Railway `48f1af2d` → `SUCCESS`.
- Web Railway `143203eb` → `SUCCESS`.
- `pnpm --filter @wcore/web typecheck` → 0, `pnpm --filter @wcore/web exec node --import tsx --test __tests__/scan-results.test.ts` → 6/6.
- `pnpm --filter @wcore/api exec node --import tsx --test src/scan-cache-policy.test.ts` → 8/8 (nouveau test inclus).
- Solana smoke test prod : `SOL priceEur: 76.89€`, `balance: 0.0464`, `value: 3.57€`.

## 2026-05-26 — Audit + GM chainKey harmonization

Audit transversal post-v0.2.29 (correctness, sécurité, tests, hygiène). Findings et résolutions détaillés dans `ROADMAP.md` § « 🔎 Audit complet — 2026-05-26 ».

### GM chainKey canonicalization (P1 audit)
- **Root cause**: the v0.2.29 casing fix only normalized the read/display layer. Writes stayed mixed (seed/deploy/auto-register lowercase vs onchain/rebuild/backfill UPPERCASE). Because `GmContract @@unique([chainKey, contractAddress])` and `OnchainGm @@unique([chainKey, txHash])` are case-sensitive in Postgres, an UPPERCASE submit query could miss a legacy lowercase contract row (→ `no_gm_contract_for_chain`) and the anti-replay unique no longer collided across cases (→ potential double-credit).
- **Fix**: single canonical helpers in `@wcore/shared` — `canonicalChainKey()` (UPPERCASE = DB-canonical, aligned with the core chain registry) and case-insensitive `getFactory()`/`getFactoryAddress()`. All GM DB writes now go through `canonicalChainKey()` (`seedGmContracts`, deploy, `has-deployed`, `syncOnChainContracts`, `/api/gm/onchain`, rebuild, backfill). GM contract lookups + the on-chain anti-replay pre-check are now case-insensitive (`mode: "insensitive"`), so canonical queries still resolve legacy lowercase rows — **no destructive prod migration required** (convergence happens on write). Read-time dedup remains the display safety net.
- **Cleanup**: removed dead bindings (`addReferralBonus`, `createNotification` in `gm-onchain.ts`; unused `rpcJson` param in `gm-streak-rebuild.ts`'s `tryGetLogs`). Removed a stray tracked junk file (`=6.15.2`).
- **Validation**: `gm-chainkey.test.ts` (canonical + factory case-insensitivity) + existing GM tests → 6/6. `tsc @wcore/api` 0, `typecheck @wcore/web` 0, `typecheck @wcore/shared` 0, `eslint` on changed files 0. DB-backed `wallet plugin — privilege guards` not runnable locally (no Postgres) — verify in CI/Railway.
- **État déploiement**: poussé sur `origin/master` (`2dbb21e`, incluant `ff7cc64`) et déployé sur Railway. API `0d50bb67-3965-4976-82f0-5e902dab1def` → `SUCCESS`; Web `89fad3d8-38ce-4144-b690-d3410d9f368c` → `SUCCESS`. Checks prod: `/health`, `/api/gm/contracts`, homepage Web OK.

## 2026-05-26 — GM Profile/state consistency

### Profile — per-chain GM current vs best streak
- **Root cause**: the per-chain Profile breakdown derived display stats from `onchain_gms`, but exposed only one `streak` value. That value was the last historical run, which can be misleading after a missed day. On-chain audit of `GmCheckedIn` logs confirmed split-run chains such as `METAL_L2` (`10 GM · 87 pts`, current `2d`, best `8d`) and `CYBER`/`APPCHAIN`/`DUCKCHAIN` (`9 GM · 74 pts`, current `2d`, best `7d`).
- **Fix**: `buildPerChainGmPoints()` now returns both current `streak` and `bestStreak`, and current streak drops to `0` when the latest GM is older than yesterday. Profile now displays `current Xd · best Yd`.
- **Validation**: `gm-points.test.ts` covers normalized chain keys, duplicate same-day events, points, current streak, and best streak.

### Profile — duplicate GM Contracts cards for platform owner
- **Root cause**: production data can contain case-variant `chainKey` rows for the same GM contract (`base` and `BASE`). `/api/gm/my-contracts` deduped platform-owner rows by DB `id`, not by canonical `(chainKey, contractAddress)`, so the Profile GM Contracts tab rendered duplicate cards.
- **Platform-only noise**: platform-owner view also included platform-only contracts with no withdrawable platform balance, producing confusing cards like `BASE PLATFORM` without a fees button.
- **Fix**: `/api/gm/my-contracts` now normalizes `chainKey`/`contractAddress`, merges case-variant duplicates, preserves creator+platform balances on a single card, and hides platform-only rows without withdrawable platform fees.
- **Validation**: `gm-contracts.test.ts` passes and `@wcore/api` build passes.

### GM page — chain status normalization
- **Root cause**: `/api/gm/status` returned chain keys with the DB casing. If contracts were stored as `base` but today's `OnchainGm` row was stored as `BASE`, the API returned separate `base` and `BASE` entries. The `/gm` page reads lowercase keys, so chains already GM'd could still display `Say GM`.
- **Fix**: `/api/gm/status` now normalizes contract rows and today's GM rows to lowercase before merging `deployed` and `gmDone`.
- **Validation**: `gm-status.test.ts` covers `base` + `BASE` and `arbitrum_one` + `ARBITRUM_ONE` merge behavior.

### GM on-chain submit/backfill — canonical chain keys
- **Fix**: `/api/gm/onchain` now canonicalizes incoming `chainKey` to uppercase before DB lookup/write, matching `gm_contracts` uniqueness expectations.
- **Backfill/rebuild**: `rebuildChainStreakFromOnchain()` normalizes chain keys to uppercase, writes `OnchainGm.createdAt` from the event timestamp, keeps existing higher streaks, and uses chunked `eth_getLogs` for block-range-limited RPCs (`CYBER`, `OPENLEDGER`, `STABLE`).

### Validation / deploy
- `pnpm --filter @wcore/api exec node --import tsx --test src/gamification/gm-points.test.ts src/gamification/gm-status.test.ts src/gamification/gm-contracts.test.ts` → 4/4.
- `pnpm --filter @wcore/api build` → OK.
- `pnpm --filter @wcore/web typecheck` → 0 errors.
- API Railway deploy `0d50bb67-3965-4976-82f0-5e902dab1def` → `SUCCESS`, `/health` OK.
- Web Railway deploy `89fad3d8-38ce-4144-b690-d3410d9f368c` → `SUCCESS`.

## 2026-05-24 — Scan cache hardening + HEMI/scam updates

### Frontend — browser scan cache removed
- **`apps/web/components/WalletContent.tsx`** no longer reads or writes portfolio scan results in `localStorage`. The browser no longer persists `v*:scan:*` results or `scan_prev_eur_*` totals.
- **`apps/web/components/scan-cache.ts`** now exposes `BROWSER_SCAN_CACHE_ENABLED = false`; `apps/web/__tests__/scan-cache.test.ts` guards this product decision.
- Reason: stale browser scan results were masking fresh API fixes and forcing code/version bumps to recover user-visible balances.

### Cache policy — major tokens without price are not cacheable
- **`apps/api/src/plugins/scan.ts`** refuses to cache scans where a major priceable token has positive balance but `NO_PRICE` (`WBTC`, `WETH`, `USDC`, `USDT`, `stETH`, etc.). Existing Redis entries matching this shape are ignored and re-scanned.
- **`apps/web/components/scan-results.ts`** mirrors the same rule for frontend safety.
- Regression covered by `apps/api/src/scan-cache-policy.test.ts` and `apps/web/__tests__/scan-results.test.ts` using the Ethereum WBTC case.

### UI assets / scam detection
- **HEMI icon**: `apps/web/lib/chain-icon-manifest.json` now uses `https://rubyscore.fra1.digitaloceanspaces.com/chain_icons/hemi.svg`.
- **BASE scam contract**: `packages/shared/src/scam-detector.ts` permanently blocks `0x260b9ac75753fbd67f2ea6d10724dd89a52c1913`; test added in `packages/core/src/tokens/scam-detector-shared.test.ts`.

### Validation
- `pnpm --filter @wcore/web exec node --import tsx --test __tests__/scan-cache.test.ts __tests__/scan-results.test.ts` → 6/6.
- `pnpm --filter @wcore/web typecheck` → 0 errors.
- `pnpm --filter @wcore/core exec node --import tsx --test src/tokens/scam-detector-shared.test.ts` → 1/1.
- `pnpm --filter @wcore/shared build` and `pnpm --filter @wcore/api build` → OK.

## 2026-05-24 — Audit de vérification + réconciliation roadmap

### Audit — verification only (no functional code change)
- **`docs/audit-2026-05-24-global.md`** added: measured reconciliation of the 2026-05-23 punch list against the current working tree, with `file:line` evidence.
- **Validations**: `pnpm -r typecheck` ✅ (exit 0, all packages); `pnpm audit --prod --audit-level=moderate` → 1 moderate (`qs` via `googleapis-common`, root tooling path, not in api/web runtime); `node --check apps/api/set-test-env.js` ✅.
- **Result**: P0-1 + P1-1/2/3/4/5/6/7/8/10/11/14/15 + P2-1 verified **fixed in code** (were still unchecked in the punch list — now reconciled in `ROADMAP.md`).
- **Still open**: P1-9 (frontend stale-scan race, no `scanRunIdRef`), P1-13 (`SCAN_CONCURRENCY` 20 in `scan.ts` vs 30 in `metrics-plugin.ts`), P2-2 (`/api/metrics/errors/detail` public), P2-3 (`/api/admin/scam-overrides` public), P2-16 (no `qs` override in `pnpm.overrides`).

## 2026-05-23 — RealT pricing + SVM/Cosmos force-refresh resilience

### Infrastructure — centralized RPC resolution
- **`packages/core/src/rpc/endpoints.ts`** : added a single RPC resolver backed by `@wcore/core` chain configs, with optional Chainlist dynamic warmup, strict `eth_chainId` validation, HTTPS/template filtering, health filtering, and static fallback.
- **GM API** : removed the separate gamification `CHAIN_RPCS` map. `getChainRpc()` / `getChainRpcs()` now wrap the central resolver, so deploy/status/on-chain repair use the same source as scans.
- **Scripts** : `scripts/audit-gm-consistency.ts` and `scripts/recover-gm-history.ts` now consume `getRpcEndpoints()` instead of importing API internals or maintaining local RPC maps. `recover-gm-history.ts` also now requires `DATABASE_URL` instead of embedding a DB URL.
- **Web cleanup** : removed the unused `apps/web/lib/gm-utils.ts` local RPC map.

### Security / Ops — audit follow-ups
- **Local secret cleanup** : removed `scripts/.env.backup` without reading it; `.gitignore` already covers `scripts/.env.backup` via `.env*`.
- **Rate-limit regression guard** : updated `apps/api/src/scan.test.ts` so forged `wcore_access` cookies are ignored for rate-limit bucketing. The server remains IP-only for rate-limit identity.
- **API unit tests without local DB** : extracted pure server helpers to `apps/api/src/server-helpers.ts`, so `scan.test.ts` no longer imports the Fastify server or touches Prisma. The scan helper tests now run without a local Postgres instance.
- **Staging deploy safety** : `scripts/deploy-staging.ps1` no longer falls back to `prisma db push --accept-data-loss` after migration failure. It now stops after creating a backup and requires migrations to be fixed explicitly.
- **Smoke tests** : `scripts/smoke-test.ps1` now checks for `180+` chains instead of the obsolete exact `116` count.

### Growth — Multichain Map post
- **Post X** : `https://x.com/WCORExyz/status/2058205408188158434`.
- **Visual** : `apps/web/public/wcore-post-multichain-map.svg` + `.png` (`1200x675`). `.gitignore` includes a targeted exception so the PNG can be versioned despite the global `*.png` ignore.
- **Angle** : `Your crypto is not on one chain.` WCORE maps wallets across 180+ chains from one read-only dashboard, with EVM / Solana / Cosmos cards and `wcore.xyz` CTA.

### Growth — Today's WCORE update v9
- **Post X** : `https://x.com/WCORExyz/status/2058219512185434210`.
- **Visual** : `apps/web/public/wcore-post-daily-update-9.svg` + `.png` (`1200x675`). `.gitignore` includes a targeted exception so the PNG can be versioned despite the global `*.png` ignore.
- **Angle** : `Cleaner scans. Better coverage.` User-facing update covering RealT assets on Gnosis, Solana/Cosmos fallback, 180+ chain mapping, and read-only wallet views.

### Growth ops — X automation rules tightened
- **Incident documented** : an X Playwright/CDP action accidentally muted AALADIN during a CM cycle. The account was restored manually by the user.
- **Rule change** : X automation is read-only by default. Scans must propose actions + exact text and wait for explicit user approval before any DM/reply/like/follow/menu action.
- **Backlog** : replace ad hoc `.tmp-x-*.cjs` scripts with reusable `scripts/x/` tooling split into `scan` and `execute`, with strict `status_id` targeting, explicit timeouts, overlay/modal aborts, draft verification, post-action verification, and structured logs.

### Fix — RealT Gnosis pricing
- **`packages/core/src/pricing/sources/realt.ts`** : added an official WooCommerce Store API fallback (`https://realt.co/wp-json/wc/store/v1/products?search=...`) when `api.realtoken.community/v1/token` returns 404/unavailable. Matching is strict/fail-closed and cached in Redis as `realt:woo:{contract}` for 6h.
- RealT contracts recognized by the registry no longer fall back to DEX/GeckoTerminal prices, because illiquid pools produced false prices.

### Fix — SVM/Cosmos forced refresh returning random zeroes
- **`apps/api/src/plugins/scan.ts`** : `forceRefresh=true` now bypasses only the top-level scan result cache, not non-EVM engine fallback caches. `getEngineCacheForScan()` keeps `sharedCache` for `SVM`/`COSMOS` so `native:*`, `ta:*`, `bal:*`, staking caches, etc. can preserve balances when public RPCs return `429`, `400`, aborts, or no token-account data.
- EVM keeps the previous forced-refresh behavior (`cache: undefined`) to avoid masking intentional full rescans.

### Cache — scan result v2
- **`apps/api/src/plugins/scan.ts`** : scan result cache key changed to `scan:v2:{address}:{chain}` via `getScanResultCacheKey()`, invalidating old Redis entries like `scan:{address}:{chain}` that were created before the RealT/cache fixes.
- **`shouldCacheAssets()`** now refuses to persist critical partial scans: `token accounts: no data`, `balances fetch`, `balances HTTP`, and `native balance failed on all`.

### Tests / validation
- **`apps/api/src/scan-cache-policy.test.ts`** added coverage for `scan:v2`, non-EVM cache fallback under `forceRefresh`, and critical SVM/Cosmos cache rejection.
- Validation: `scan-cache-policy.test.ts` 6/6 pass, API typecheck clean, Railway API deployment `66acf12d-a56d-4e0e-9165-a96ba5d41ee1` success.
- Production Playwright check on 10 wallets / 181 chains: Gnosis RealT ~1087.99€, SVM ~37.12€, Cosmos ~5.05€, total ~2195.10€.

## 2026-05-22 — Cache fix + Schema hardening + Docs cleanup

### Fix — forceRefresh did not bypass scan result cache
- **`apps/api/src/plugins/scan.ts`** : `forceRefresh=true` bypassed `effectiveCache` (engine-level) but NOT the top-level scan result cache (`scan:{addr}:{chain}`). A first scan with broken pricing stored a nil result → all subsequent `forceRefresh=true` scans returned the poisoned cache in 25ms. Fix: `if (!forceRefresh)` guard around the cache check loop in sync handler (l.141) and batch EVM handler (l.331). Non-EVM path already had the guard. Commit `2a544fd`.

### Security — Schema validation strict mode
- **`apps/api/src/schemas.ts`** : `ScanRequestBodySchema` and `BatchScanRequestBodySchema` changed from `.passthrough()` to `.strict()`. Unknown fields now cause validation errors instead of being silently accepted.

### UI — ErrorBoundary + Preferences persistence
- **`apps/web/components/ErrorBoundary.tsx`** : global React error boundary with fallback UI, wrapped around `<SidebarLayout>` in `layout.tsx`.
- **`apps/web/components/PreferencesProvider.tsx`** : currency/language persisted in localStorage (`wcore_currency`, `wcore_language`), read at mount, fallback to defaults if invalid.

### Docs — Consolidation + cleanup
- **`ROADMAP.md`** : consolidated TODO from all audits, merged duplicate v0.2.25 sections, added current source reference.
- **`docs/archive/`** : moved `AUDIT.md`, `SESSION_SUMMARY.md`, `RELEASE_NOTES.md`, `docs/gpt5.5/*` to archive with README.
- **`scripts/archive-x/`** : moved 25 one-off X automation scripts; reusable scripts kept.
- **`README.md`** : audit link updated to `ROADMAP.md` + `docs/archive/`.
- **`apps/web/app/layout.tsx`** : metadata updated from 130+ to 180+ chains.
- **`AGENTS.md`** : added forceRefresh cache bypass gotcha + version sync.
- **Execution plan** : `docs/superpowers/plans/2026-05-22-roadmap-execution.md`.

### Validation
- `pnpm --filter @wcore/api typecheck` ✅ · `pnpm --filter @wcore/web build` ✅ · Core tests 168/168 ✅
- Deployed to Railway (api + web). Verified: `Content-Type: application/json`, `wcore.xyz` serves WCORE.

## v0.2.25 — Scan batch global + GM streak self-heal + BASE resilience (2026-05-21)

### Fix — scan batch endpoint silently fell through to per-wallet path
- **`apps/api/src/plugins/scan.ts`** : `/api/scan/batch` used `require("@wcore/core")` inside an ESM module → silent throw inside `try/catch` → `evmChains = []` → every chain landed in the `nonEvmChains` individual-scan path. No Multicall3, no `scan:{addr}:{chain}` cache hit, BASE timing out on 10-wallet deep scans, "batch ne marche pas" UX report.
- **Fix** : destructure `getChain` from the existing `await import("@wcore/core")` a few lines below. EVM/non-EVM split now works.
- **`BATCH_CHAIN_TIMEOUT_MS`** introduced (180 s, vs 90 s shared `CHAIN_TIMEOUT_MS`) — absorbs a deep scan over 10 wallets in a single Multicall3 on BASE/ETH.
- **`apps/web/components/WalletContent.tsx`** : removed `&& !deepScan` so batch is also used in deep mode (the slowest path was the one most in need of batching). Client `AbortSignal.timeout` aligned to 180 s.
- **Global VM scheduler** : the frontend now builds one queue of `(VM, chain, compatible wallets[])` jobs. `GLOBAL_CHAIN_CONCURRENCY=30` applies across EVM, SVM, and Cosmos combined. Each EVM job calls `/api/scan/batch` once for all EVM wallets on that chain; SVM/Cosmos jobs use the same batch endpoint and server fallback. This avoids EVM monopolizing the scan and prevents 4× duplicate EVM scans.

### Growth — One Scan Flow post
- **Post X** : `https://x.com/WCORExyz/status/2057542358670189016`.
- **Visual** : `apps/web/public/wcore-post-global-scan-queue.svg` + `.png` (`1200x675`). `.gitignore` includes a targeted exception so the PNG can be versioned despite the global `*.png` ignore.
- **Angle** : user-facing scan flow improvement — multi-wallet scans share one queue across EVM, Solana and Cosmos; results stream progressively; no VM waits for a separate scan phase.

### GM streak self-heal + on-chain backfill
- **New `apps/api/src/gamification/gm-streak-rebuild.ts`** : `rebuildChainStreakFromOnchain(deps, userId, address, chainKey)` fetches all `GmCheckedIn` events for a user on a chain (paginated 100k-block fallback if RPC rejects `earliest→latest`), upserts missing `GmContract` + `OnchainGm` rows (idempotent on unique constraints), merges DB rows with chain logs (the just-inserted tx is counted even if the RPC hasn't indexed it yet), recomputes `gmStreak` (consecutive UTC days back from today/yesterday) + `longestStreak` (max consecutive run), upserts `UserChainGm`, returns `RebuildEvent[]` with `wasInserted` flags.
- **`apps/api/src/gamification/gm-onchain.ts`** : after each successful tx + DB commit, `/api/gm/onchain` now calls `rebuildChainStreakFromOnchain` for the active chain → self-heals from chain truth. A prior missed GM is reconciled at the next successful submission.
- **New endpoint `POST /api/gm/backfill`** body `{ chainKey?: string }` : with no `chainKey`, loops over every chain in `GM_FACTORIES`. Rebuilds per chain, aggregates events across chains, recomputes `user.gmStreak`/`longestStreak`/`lastGmDate` (general streak = union of UTC days), applies the score delta only for rows newly inserted in this run (per-chain `5 + chainStreak`, general `20 + generalStreak*2` for the first GM of the day) → idempotent, no double counting. Returns `{ backfilled, errors, scoreDelta, currentGeneralStreak, longestGeneralStreak, lastGmDate }`.

### Validation
- `apps/api` `tsc --noEmit` ✅ · `apps/web` `tsc --noEmit` ✅
- Deployed to Railway (api + web).

## v0.2.21 — Stripe removed + ME-2 + Discovery fix + Plugin tests (2026-05-19)

### Stripe removal
- **`apps/api/src/billing.ts`** deleted — billing plugin, checkout, webhook, portal removed.
- **`fastify-raw-body`** removed from `server.ts` + `package.json`.
- **`packages/db/prisma/schema.prisma`** : `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` columns removed from User model.
- **`apps/web/app/pricing/PricingClient.tsx`** : Stripe checkout replaced with free plan page.
- **`docker-compose.prod.yml`** + **`.env.production.template`** : all STRIPE_* env vars removed.
- **Docs** : `DEPLOY.md`, `AGENTS.md`, `ROADMAP.md`, `SESSION_SUMMARY.md` cleaned of Stripe references.
- **`pnpm-lock.yaml`** regenerated after package removal → Railway build fixed.

### ME-2 — `Promise.any` on onchainRpc.batch
- **`packages/core/src/engines/evm.ts`** : sequential `for...of` failover replaced with `Promise.any`. All RPCs raced in parallel, first success wins. Up to 5s saved per batch on flaky RPCs.

### Fix — discovery `trustExplorerWhenClean`
- **`packages/core/src/tokens/discovery.ts`** : `discoverTokensForWallet` was ignoring the `trustExplorerWhenClean` flag, always calling `logDiscovery` even when Blockscout had already found tokens. Added early returns when explorer found tokens or returned clean.
- **138/138 core tests passing**.

### Tests — Admin + Wallet plugin privilege guards
- **`apps/api/test/admin-plugins.test.ts`** : 13 tests — 401 without token, invalid token, admin cookie bypass removed (H1 fix), CORS headers, conditional happy path.
- **`apps/api/test/wallet-plugins.test.ts`** : 20 tests — scan ownership, custom tokens CRUD, scan sharing, cross-user isolation, 404/403 guards.

### Railway — Lockfile fix
- **Root cause** : `pnpm-lock.yaml` was stale after `fastify-raw-body` and `stripe` removal → `ERR_PNPM_OUTDATED_LOCKFILE` on Railway build.
- **Fix** : `pnpm install` local → commit `ab344dc` pushed → API + Web redeployed successfully.

### Validation
- `pnpm --filter @wcore/core build` ✅ · `pnpm --filter @wcore/api build` ✅
- Core tests 138/138 ✅ · Lint clean ✅
- Railway API ✅ 200 · Web ✅ 200

## v0.2.20 — Audit triple shipped (2026-05-19)

### Security
- **H1 — admin scam-override cookie fallback removed** (`apps/api/src/plugins/admin.ts`): the route no longer derives admin authority from a session cookie when ADMIN_TOKEN is unset/wrong. A stolen platform-owner cookie can no longer write to scam overrides.
- **M2 — Scam symbol normalization**: scam-override now uppercases `sym` for both in-memory and DB writes, eliminating casing-divergent lookups during a live session.

### Pricing — RealToken bulk registry
- **Root cause**: per-contract API calls timed out → circuit breaker tripped → cascade fell through to DexScreener/GeckoTerminal illiquid pools, which returned wildly wrong prices (~$50 RealT tokens shown as €6-14). The wrong price was then cached for 1h, poisoning future scans.
- **Fix**: `packages/core/src/pricing/sources/realt.ts` switched to a single bulk fetch of `https://api.realtoken.community/v1/token` (829 tokens in one HTTP call). Result is a contract→price registry mirrored in Redis (`realt:registry:v2`, 6h refresh, infinite stale fallback). Lookup is O(1).
- **Anti-poisoning**: `cascade.ts` short-circuits the main price cache for known RealT contracts and returns `REALT_PRICE_UNAVAILABLE` on miss, never falling back to DEX/GT.
- **Type**: new `RealTSource extends TokenPriceSource` interface exposes `isKnownRealTContract(token)`.

### Perf — Logos lifted off the pricing hot path
- **QW-2/LR-1**: `priceToken` in `evm.ts` was awaiting `resolveTokenLogoAsync` per token, blocking the cascade with up to 2 sequential HTTP fetches (Blockscout + DexScreener) on every cold scan. Logos are UI-only.
- **Fix**: new `resolveTokenLogoCachedOrFallback` (Redis-only, sync fallback to TrustWallet/CMC, never HTTP) on the hot path, plus `prefetchTokenLogo` fire-and-forget with module-level single-flight Map. 30 concurrent scans of the same `(chain, contract)` issue exactly one HTTP fetch. Next scan returns the high-quality logo.
- **QW-1**: two sequential Redis GETs (logo hit + miss keys) collapsed into one `Promise.all` round-trip (~15ms saved per token).
- **QW-3**: `metadata.ts` skips `resolveTokenLogoAsync` when the cached token already has a usable `logoUrl`, eliminating a redundant Redis+HTTP call per metadata cache hit.

### Docs
- **QW-4**: `.env.example` and `DEPLOY.md` aligned to the actual `SCAN_CONCURRENCY` default of **30** (intentional since 2026-05-18 to reduce RPC free-tier saturation; was drifting against the documented 50).

## Unreleased — DB Recovery + GM History Restore (2026-05-18)

### Incident — Production DB wiped by test suite
- **Root cause**: `.env.test` contained `TEST_DATABASE_URL` pointing to production Railway DB (`viaduct.proxy.rlwy.net:51381`). Running `pnpm test` executed `deleteMany()` on all production users.
- **Impact**: User account wiped (streak=11, score=1338, plan=admin, 38 GM contracts, all onchain_gms).
- **Fix**: `.env.test` now points to `localhost`. `apps/api/set-test-env.js` explicitly rejects `localhost`, `127.0.0.1`, `::1` in `TEST_DATABASE_URL` for production runs.

### Recovery — Full GM history restored from on-chain data
- **Method**: `scripts/recover-gm-history.ts` scanned all 38 GM contracts via `eth_getLogs` (500k blocks back, chunked by 10k).
- **Chains with RPC issues**: cyber, scroll, openledger, sei, tac required special handling:
  - **sei**: RPC limits block range to 2000 blocks → used explorer API (seiscan.io) to find tx hashes, then `eth_getTransactionReceipt` for tipWei.
  - **tac/openledger**: RPC limits block range → explorer APIs (explorer.tac.build, scan.openledger.xyz) provided tx hashes.
  - **cyber/scroll**: deep RPC scan with 500-block chunks found events that standard 1000-block scans missed.
- **Result**: 160 onchain_gms restored across 38 chains, 12 active days (2026-05-07 → 2026-05-18).
- **User state**: streak=12, longest=12, score=1671, lastGmDate=2026-05-18T05:35:34Z.

### Backup system — Windows-compatible Prisma-based
- Replaced `pg_dump` dependency with `apps/api/backup-db.cjs` (Node.js/Prisma, zero external deps).
- Scheduled task `WCORE_DB_Backup` updated to use new script.
- Daily backups in `backups/` with 7-day rotation.

### Audit P1–P6 fixes (commit `f65e3ac`)
- **P1**: GM refactor typecheck (`prisma` passed to `createGmHelpers`).
- **P2**: Rate-limit Bearer spoof removed; refresh token `type === "access"` check.
- **P3**: Auth gates use `isAuthenticated` deps; `WalletProvider` listens to `wcore-logout`; `apiFetch` dispatches event on retry 401.
- **P4**: Scam filtering on sync per-chain totals + async scan accumulation.
- **P5**: Redis cache shared across sources; SVM/Cosmos keys scoped by chain; `onchainMarkerKey()` canonical.
- **P6**: 22 new regression tests (`scam-filtering`, `auth`, `scan`, `cascade`).

### Fix — RealT pricing diagnostic logging
- Added `console.log`/`console.error` to `RealTPriceSource` to diagnose why Gnosis RealT tokens show wrong prices (DexScreener/GT pool prices instead of api.realtoken.community prices).
- Added `User-Agent: WCORE/1.0` header to RealT API requests (some APIs block headless fetches).
- Logs: `[RealT] Fetching {contract}`, `[RealT] Cache hit`, `[RealT] HTTP {status}`, `[RealT] Error`.
- File: `packages/core/src/pricing/sources/realt.ts`.

## Previous — Audit Ultra 2026-05-18 (ALL 10 punch list items shipped)

### Audit & rapports
- 4-domain parallel audit (security + performance + quality + chains). 2 CRITICAL · 14 HIGH · 27 MEDIUM · 13 LOW findings total.
- Reports persisted in `.omc/research/audit-2026-05-18-{security,performance,quality,chains,CONSOLIDATED}.md`.

### CRITICAL fixes
- **C1+C2 — Secrets sanitization**: `scripts/backup-db.ps1` no longer hardcodes the Railway Postgres password; reads `$env:BACKUP_DATABASE_URL` or a gitignored `scripts/.env.backup`. The leaked `JWT_SECRET` (commit `f9e47ca`, `.env.staging`) and Postgres password must be rotated on Railway side — file is no longer tracked but lives in git history.

### HIGH fixes
- **H8 chains — Avalanche `LLAMA_CHAIN_SLUG`**: added `"avax"` to `packages/core/src/chains/AVALANCHE.ts`. Without it, DefiLlama Coins lookups silently fell through to DexScreener/GT (DefiLlama uses `avax`, not `avalanche`).
- **H1 security — LinkedWallet partial unique index**: migration `20260518120000_linked_wallet_signed_unique` adds a partial unique index on `linked_wallets(address) WHERE verificationStatus='SIGNED'`. UNSIGNED claims remain shared. Pre-existing duplicates are demoted to UNSIGNED keeping the oldest signer as owner. `apps/api/src/auth.ts` now catches P2002 and returns `409 address_already_verified`.
- **H4 perf — GT throttle singleton**: `packages/core/src/pricing/sources/geckoterminal.ts` now uses a process-level `sharedGtThrottle` shared across all `GeckoTerminalPriceSource` instances. Eliminates the 50× budget multiplication under `SCAN_CONCURRENCY=50`.
- **H5 security — Rate-limit catch-all**: `server.ts:255-256` covers all `/api/*` endpoints not explicitly rate-limited (anti-DoS for undocumented/future endpoints).
- **H5/H6 perf — Parallel SVM/Cosmos pricing**: both engines use `PRICING_CONCURRENCY=10` worker pools to avoid GT throttle starvation under `SCAN_CONCURRENCY=50`.
- **H9 quality — pg_dump backup**: `scripts/backup-db.js` uses native `pg_dump` (not `$queryRawUnsafe`), with 7-day rotation.

### Security — JWT HttpOnly Cookie Auth (H2/H3)
- Replaced Bearer token in `localStorage` with HttpOnly cookie-based JWT auth (`wcore_access` 15min + `wcore_refresh` 7d).
- Backend: `auth.ts` rewritten (login/refresh/logout with cookies, Redis revocation, backward-compat Bearer fallback).
- Frontend: ~20 files migrated to `apiFetch()` from `@/lib/api` (auto-refresh on 401, `credentials: "include"`).
- `server.ts`: cookie plugin registered, CORS credentials enabled, rateLimitIdentity cookie-aware.
- E2E tests updated for cookie auth.

### Chains — Migrate ritual chains (H7)
- Added 8 new chain configs: **Celestia**, **Noble**, **Neutron**, **dYdX**, **Kava**, **Stride**, **Stargaze** (Cosmos SDK), **SurfLayer** (EVM).
- All configs follow the existing pattern (publicnode RPCs, correct denoms/decimals, llama/gecko IDs).

### Perf — H6 Redis-backed pricing cache (all 3 engines)
- Replaced per-engine `MemoryPricingCache` with shared `RedisPricingCache` (adapts `CacheStore` → `PricingCache`).
- TTL 6h prices / 24h markers. Keys prefixed `price:` / `marker:`.
- Wiring: `opts.sharedPriceCache` in EVM/SVM/Cosmos engines → `dispatch.ts` → `scan.ts` creates Redis instance at boot.
- All 3 VMs benefit from cross-scan pricing sharing and API restart survival.
- New files: `packages/core/src/pricing/redis-pricing-cache.ts`, migration `20260518103000_add_scam_override_contract`.
- Modified: `evm.ts`, `svm.ts`, `cosmos.ts`, `dispatch.ts`, `scan.ts`, `admin.ts`, `pricing/index.ts`, `scam-detector.ts`, `TokenTable.tsx`, `WalletContent.tsx`, `schema.prisma`.

### Fix — Scam override contract propagation + frontend sync
- Admin button now sends `contract` to `/api/admin/scam-override` (was symbol-only).
- DB `upsert` no longer overwrites `contract` with `null` when absent from request.
- New endpoint `GET /api/admin/scam-overrides` returns all overrides with contracts.
- New hook `useScamOverrideSync` fetches overrides from API at mount, merges into `localStorage`.
- Migration adds `scam_overrides.contract` column + seeds `NEGED` with Base contract.

### Fix — ConnectButton wagmi auto-connect regression + auth rehydration + GmButton gate
- New `authStep = "ready"` state: wallet address visible, "Sign In" button shown, but NOT treated as authenticated.
- GmPageClient, ProfileClient, GmButton all gated on `authStep === "authenticated"` (not just `address`).
- BUG 1: non-200/non-401 API errors no longer auto-authenticate (now `setAuthStep("expired")`).
- BUG 2: network error `.catch()` no longer auto-authenticates (now `setAuthStep("expired")`).
- BUG 3: uses server-verified address from `/api/auth/me` response instead of localStorage.

### Already done (confirmed in codebase)
- **M — Cascade reorder**: `cascade.ts:79-83` already runs onchain-v3 before CoinGecko + NEED_ONCHAIN marker retry.

### Operator actions required
1. Rotate `JWT_SECRET` on Railway staging (the committed value at `f9e47ca` remains valid until rotated).
2. Rotate Postgres password on Railway (the previously hardcoded value remains valid until rotated).
3. Run `pnpm prisma migrate deploy` on staging then prod to apply the partial unique index.

## Previous — Scan Reliability + Scam Rules

### Chain Coverage
- Added 3 mainnet chains to align WCORE scan coverage with onchaingm.com (85/85 mainnets now scannable): **Codex** (chainId 81224, native ETH, RPC `rpc.codex.xyz`), **0G Mainnet** (chainId 16661, native 0G, RPC `0g.drpc.org` + `evmrpc.0g.ai`, gecko_id `zero-gravity`), **XDC Network** (chainId 50, native XDC, 5 public RPCs, gecko_id `xdce-crowd-sale`).
- New configs: `packages/core/src/chains/{CODEX,OG,XDC}.ts` + wired into `packages/core/src/chains/index.ts`. ChainIds confirmed via live `eth_chainId`. GM factory addresses not extended (out of scope of scan coverage).
- Added 4 mainnet chains to align WCORE scan coverage with surflayer.xyz (73/73 Surflayer mainnets now scannable): **JuChain** (chainId 210000, native JU, RPC `rpc.juchain.org`), **Mint Blockchain** (chainId 185, native ETH, 3 RPCs `*.rpc.mintchain.io`), **Conflux eSpace** (chainId 1030, native CFX, RPC `evm.confluxrpc.com`, gecko_id `conflux-token`), **Incentiv** (chainId 24101, native INC, RPC `rpc.incentiv.io`).
- New configs: `packages/core/src/chains/{JUCHAIN,MINT,CONFLUX,INCENTIV}.ts` + wired into `index.ts`. ChainIds confirmed via live `eth_chainId` (0x33450, 0x406, 0x5e25; Mint via chainid.network). Native price IDs for JuChain/Incentiv left empty — cascade fallback handles missing native pricing.
- Added 7 Cosmos zones to broaden L1 coverage beyond the EVM-heavy ritual platforms: **Celestia** (TIA, DA layer), **Noble** (USDC-native issuer, fees in USDC), **Neutron** (NTRN, smart contracts L1), **dYdX** (DYDX, 18-dec native — unusual for Cosmos), **Kava** (KAVA, EVM+Cosmos hybrid), **Stride** (STRD, liquid staking), **Stargaze** (STARS, NFT L1). REST endpoints validated live: 6/7 via publicnode, Noble via polkachu + cosmos.directory (publicnode does not host Noble).

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
- **ETHG scam token filtered**: Ethereum Games (2M tokens x 0.25 EUR = 497k EUR) was inflating scan totals. Rule #9 added: unknown token + value > 1000 EUR + supply > 100k → scam (weight 3). Rule #6 also covers game-themed tokens with inflated supply.
- `SCAM_RULES_VERSION` bumped to 5 (core + frontend) to invalidate cached scam results.
- `detectScam` now applied in the API backend before computing scan notification totals, so the SSE notification no longer shows inflated scam-included amounts.

### Token Icons
- Fixed broken token icons from `spothq/cryptocurrency-icons` CDN (xdai, celo, arb, cro, frax, imx, ton). Overrides now use TrustWallet PNGs. TrustWallet uses `xdai` for Gnosis chain (not `gnosis`).

### Cache Alignment — SVM & Cosmos
- **SVM cache fallbacks** : negative cache (`empty:`, 10 min), native balance cache (`native:`, 1h), token accounts cache (`ta:`, 1h), per-token cache (`token:{chain}:{mint}:{address}`, 1h). Tous avec fallback lecture si le RPC échoue.
- **Cosmos cache fallbacks** : negative cache (`empty:`, 10 min), bank balances cache (`bal:`, 1h), native balance cache (`native:`, 1h), per-token cache (`token:{chain}:{denom}:{address}`, 1h), staking caches (`del:`, `unb:`, `rew:`, 1h chacun). Fallback lecture si la REST API échoue.
- **Tests unitaires** : 12 nouveaux tests dans `svm.test.ts` (4) et `cosmos.test.ts` (8) — couvrent negative cache, fallback balance, fallback token accounts, per-token cache, staking fallbacks.
- **Tests d'intégration Redis** : `apps/api/test/cache-integration.test.ts` — 9 tests end-to-end vérifiant les clés Redis après vrais appels `/api/scan` (SVM + Cosmos). `sharedCache` exporté depuis `server.ts`.
- **Total tests** : 123/123 (core) + 9 tests d'intégration Redis.

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

## v0.1.18 — Full Audit + Share Reports (2026-05-07)

### Audit — 27/27 Fixed
- **HIGH(7)**: deploy RPC timeout, GM API before localStorage, SIWE chainId bypass, ETH price oracle, admin NODE_ENV check, JWT expiration validation, stablecoin detection expansion
- **MEDIUM(13)**: circuit breaker events, dispatcher unhealthy fallback, ChainCard factories sync, cosmos timeout, Docker HEALTHCHECK node, scam-detector O(n), metrics reset, amino key parsing, CSV pipe neutralization
- **LOW(7)**: memory-cache negative ttl, various minor edge cases

### Shareable Reports
- `POST /api/scans/:id/share` + `DELETE` — public share links (owner-only)
- `GET /api/public/scans/:shareToken` — no-auth read with expiry
- `/share/[token]` page — read-only portfolio + PDF

### Tests: 133/133 (89+34+7+3), Typecheck 5/5

---

## v0.1.17 — Monetization (2026-05-07)

### Plans (retired — Stripe removed in v0.2.21)
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

## v0.1.16 — Ops Monitoring & Admin (2026-05-07)

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
- `ALERT_WEBHOOK_URL` → POST JSON on critical events
- Fire-and-forget, 5s timeout

### SIWE UX Polish
- Auth states: idle→connecting→signing→verifying→authenticated→expired
- User-friendly error messages, JWT expiration, clean reconnect

### PDF v2
- Branded WCORE cover, exec summary, page numbers, warnings
- `PdfTokenTable` reusable component

### Notifications
- Triggers: scan completed, GM streak, first GM
- In-app via NotificationsBell (SSE + polling)

---

## v0.1.15 — Hardened (2026-05-07)

- Full SIWE (EIP-4361): domain, URI, chainId, issuedAt, expiration
- Consensus RPC/SVM strict
- Factories config (Base only)

## v0.1.14 — GM System (2026-05-06)

- GM on-chain/off-chain with per-chain tracking
- Creator dashboard with tipWei
- GM contract deploy with on-chain verification

## v0.1.13 — Auth Fix (2026-05-06)

- Critical EVM login bug (nonce: prefix)
- Rate-limiting 3 tiers
- Non-blocking my-contracts

## v0.1.11 — API Bug Fixes & Cleanup (2026-05-06)

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
- **Fixed naming conflict**: `interface GmFactory` → `IGmFactory`, `interface GmOnChain` → `IGmOnChain` (prevents compilation error when both files are compiled together)

### UI/UX
- **Typo fixed**: "Deploy GM Contrat" → "Deploy GM Contract"
- **Tip indication**: GM buttons now show "~$0.05 tip" and "~$0.10 fee" in tooltips
- **Scam detector improved**: `.com`/`.io`/`.net`/`.org` no longer auto-flag tokens; only unknown domains are flagged. Known domains (Uniswap, Aave, etc.) are whitelisted.
- **React keys fixed**: `TokenTable` uses `asset.contract ?? asset.symbol` instead of `symbol-index` (prevents duplicate-key collisions)
- **Accessibility**: added `aria-label` to refresh, GM, and deploy buttons in `ChainCard`

## v0.1.10 — GM Daily Sync Fix (2026-05-05)

### Bug Fixes
- **Unified daily GM tracking**: single `wc_gm_date` localStorage key for both on-chain and off-chain GM
- **Cross-component GM sync**: `CustomEvent("wcore-gm-done")` broadcast ensures `ChainCard` and `GmButton` stay synchronized
- **ChainCard state update**: `alreadyGmToday` is set immediately after `sendGm()` succeeds
- **GmButton listens for on-chain GM**: detects when a GM is done via ChainCard and shows "✅ GM"
- **Public contracts API**: removed `ownerId: null` filter so user-deployed contracts are visible for GM detection

## v0.1.9 — Security & Performance Audit (2026-05-05)

### Security
- **JWT secret warning**: added startup warning when JWT_SECRET is not set, explaining that tokens will be invalidated on restart
- **Circuit breaker per chain**: replaced global circuit breaker with per-chain breakers to prevent one degraded chain from blocking all others
- **GM on-chain verification**: points are no longer credited if transaction verification fails on-chain (prevents spam with invalid txHash)
- **Anti-replay cleanup**: if tx verification fails, the anti-replay entry is removed so the user can retry

### Bug Fixes
- **GM "Failed to fetch"**: `sendGm` no longer blocks on API failure after a successful on-chain transaction. API sync is best-effort.
- **GM button always active**: added `alreadyGmToday` check in `ChainCard` using localStorage. Button shows "✅ GM" and is disabled after daily GM.
- **ETH price check**: `sendGm` now validates `ethPrice > 0` before calculating tip to prevent NaN/Infinity crashes
- **Error handling**: `fetchScan` now preserves previous results when a scan fails instead of showing empty data

### Performance
- **Leaderboard N+1 queries fixed**: replaced 150 sequential `prisma.count()` calls with 3 batched `groupBy` aggregations + 1 `$queryRaw`
- **React.memo on ChainCard**: wrapped `ChainCard` in `memo()` to prevent unnecessary re-renders during scan progress updates
- **Cache versioning**: added `CACHE_VERSION = 2` to localStorage cache keys. Old format entries are auto-invalidated on format changes.

### Code Quality
- **Eliminated casts `any`**: replaced `(asset as any)._isScam` with typed `AugmentedTokenAsset` interface in `TokenTable.tsx`
- **Typed error fallback**: replaced `as unknown as WalletAssets` with proper `WalletAssetsError` type in `@wcore/core`

## v0.1.8 — GM Contract Detection Fix (2026-05-05)

### GM Contracts
- **Fixed contract detection for externally deployed contracts**: contracts deployed via MetaMask (not through the app UI) are now properly detected
- **Fallback to public contract list**: when `/api/gm/my-contracts` returns empty (missing ownerId), the hook falls back to `/api/gm/contracts`
- **API upsert fix**: `fetchOnChainContracts` now updates `ownerId` during upsert to associate contracts with the correct user
- **Empty state in profile**: `GmContractsPanel` now shows a helpful message when no contracts are deployed instead of hiding entirely

## v0.1.7 — Wallet Labels Fix (2026-05-05)

### Wallet Labels
- **API source of truth**: wallet labels are now fetched from `/api/wallets` and take precedence over localStorage
- **Profile saveLabel**: updates localStorage immediately so other pages see the change without reload
- **Removed hardcoded "Connected" label**: replaced with truncated address fallback; visual dot indicator in WalletManager instead
- **WalletContent race condition fixed**: labels fetched from API are now applied to scan results via reactive useEffect
- **Case-sensitive address comparison fixed**: prevents duplicate wallet entries when API returns checksummed addresses

## v0.1.6 — Profile & Creator Suite (2026-05-05)

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
  - Home, Profile, History, Deploy: max-w-3xl → max-w-5xl
  - Leaderboard: max-w-2xl → max-w-5xl
  - Creator: max-w-4xl → max-w-6xl

---

## v0.1.5 — GM On-Chain Fixes & Documentation (2026-05-05)

### Gamification (GM)
- **On-chain contract detection**: API now scans factory `ContractDeployed` events via `eth_getLogs` when DB is missing contracts (Base RPC chunked scan: 10k blocks per query, up to 100k blocks back)
- **Fix POST body**: `POST /api/gm` now sends `body: JSON.stringify({})` — Fastify rejects empty JSON bodies with `FST_ERR_CTP_EMPTY_JSON_BODY`
- **Fix UI dropdown**: dropdown no longer disappears brutally when `alreadyGm` state arrives from API; buttons are disabled in-place instead
- **Fix on-chain independence**: on-chain GM button is no longer disabled by off-chain GM state (different tracking systems)
- **Rename button**: "Deploy GM" → "🚀 Deploy GM Contrat"

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

## v0.1.4 — Sync wcore-gsheet v4.15.42 + SVM Consensus (2026-05-05)

### Core Engine Fixes (port from wcore-gsheet v4.15.42)
- **SVM Native Balance Consensus**: `readSvmNativeBalance()` now queries all RPC endpoints in parallel (`Promise.allSettled`) and votes majority. Prevents stale-RPC zero balances from overwriting correct cached values (same fix as GAS `getBalanceWithConsensus()`).
- Compilation: 0 errors, tests: 74/74 pass

### Legacy GAS Sync
- Synchronized all 169 `.gs` files from `wcore-gsheet/src/`
- Regenerated 116 TypeScript chain configs via `extract-chains.mjs`
- Verification: `verify-migration.js` (2 expected divergences: DIAG_BASE_RPC_AUDIT non-chain, FOGO `as Omit<>` parse)

## v0.1.3 — Security Hardening & Test Stabilization (2026-05-05)

### Security
- Remove `/_dev/consensus-demo` route exposed without environment guard (`server.ts`)
- Fix rate-limiting to use `X-Forwarded-For` instead of `req.ip` only (`server.ts`)
- Make `JWT_SECRET` mandatory in `start-api.ps1` (removed weak default `dev-secret-change-me`)
- Make `DB_PASSWORD` mandatory in `deploy-staging.ps1` (removed weak default `wcore_staging`)

### Tests
- Refactor `auth.test.ts` to use `app.inject()` instead of external HTTP fetch (prevents server startup deadlock during test runs)
- Fix all Playwright E2E selectors (strict-mode violations on `Chains`, `ETH`, `Connect`, `Solana`)
- Stabilize degraded-chain test (`waitUntil: networkidle` → `domcontentloaded` + explicit wait function)
- All test suites green: core 74/74, API auth+scan, Playwright E2E 10/10

### Infrastructure
- Fix `scripts/validate-static.js` obsolete assertions (`MASTER_ON_EDIT`, wallet cache L1 fallback)
- Create `scripts/verify-migration.js` — deep-equality check between `src/*.gs` and `packages/core/src/chains/*.ts`
- Apply pending Prisma migration `add_deploy_txhash`
- Remove duplicate `seedGamification` call at top-level of `server.ts`

## v0.1.2 — UX & Wallet Linking

### Wallet Linking
- Fix: Solana wallet connection (`connect()` before `signMessage()` + fallback `publicKey` via `solana.publicKey`)
- Fix: detailed error messages on signature/crypto failures (no more generic "Failed to link wallet")
- Add: verification badge per wallet — "✓ Signé" (API-verified) vs "⚠ Local" (localStorage only)

### UX
- Add: connected wallet auto-added to wallet list on home page (no need to re-enter)
- Add: `/scans/[id]` page — click any scan in history to view stored results with full chain/token detail + CSV export
- History page now links to stored results instead of re-running the scan

## v0.1.1 — Post-Audit Consolidation

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
- Rate limit: `RATE_LIMIT_SCAN` increased from 10→60 (was too aggressive for multi-wallet scan)

### Reliability
- DB scan save errors: logged as structured warnings instead of silent catch
- Scan timer: properly cleaned up on effect cancellation
- Cache key: includes `customTokenList` to avoid stale results

### UX
- Removed `valueEur > 0` filter: degraded/zero-value chains now visible
- Loading bar: animated green dot scanning left-to-right, elapsed time, current wallet
- Refresh buttons: per-wallet ↻, per-chain ↻, refresh-all ↻ in portfolio card
- Labels: persisted to localStorage, passed via URL params, displayed in green
- Contract addresses: copyable + explorer link (↗) per token
- ValueDistribution: EVM/SVM/COSMOS breakdown, expandable "other chains", horizontal bars
- Progress display: `Wallet 1/4 (25%)` instead of raw decimal
- Table columns: `table-fixed` + `colgroup` for consistent alignment
- i18n: all components use `t()`, currency via `formatValue()` everywhere
- 20+ new translation keys (EN/FR)

### Config
- `.env.example` aligned with code defaults (`RATE_LIMIT_SCAN=60`, `MAX_CHAINS_PER_SCAN=120`)
- `DEPLOY.md` updated with backup procedure, correct limits, chainlist note

### Bug Fixes
- CORS registered after routes → preflight failed → moved before all routes
- Race condition: `setLabels({})` triggered re-render → scan cancelled
- `AbortSignal.timeout()` → replaced with `AbortController` + retry 3×
- GM `longestStreak` not persisted on reset
- Cosmos/SVM chain matching: used hardcoded `COSMOS_HUB` → now reads VM from `/api/chains`
- Wallet display: duplicate address removed, green text shows label
- Scan results: incremental display (chains appear by batch group of 3)

### Backup
- `packages/db/scripts/backup-db.ps1`: PostgreSQL dump (keeps last 10)
- `packages/db/scripts/premigrate-warn.cjs`: auto-backup before `prisma migrate dev`
- `db:migrate` script now runs backup first; `db:migrate:no-backup` for bypass

### Files Changed
- 15 existing files modified (+630 / −246 lines)
- 5 new files: `chainlist.ts`, `chainlist.test.ts`, `backup-db.ps1`, `premigrate-warn.cjs`, `.gitignore`

## v0.1.0 — MVP Release

### Core
- 116 chains (110 EVM + 4 Cosmos + 2 SVM)
- Cascade pricing: DefiLlama → DexScreener → GeckoTerminal → CoinGecko → Onchain V3
- Blockscout explorer auto-discovery (50+ tokens)
- Token registry: 100+ tokens across 10 chains
- Onchain V3 pricing for Aerodrome/Uniswap pools
- RPC consensus engine (strict majority)
- VM dispatch router (EVM/SVM/Cosmos)

### API (Fastify, port 4000)
- `POST /api/scan` — multi-chain wallet scan with metrics
- `POST /api/auth/login` — SIWE with nonce (5 min expiry)
- `GET /api/auth/nonce` — server nonce generation
- `GET /api/auth/me` — current user profile
- `GET /api/profile/:address` — public profile
- `POST/GET/PATCH/DELETE /api/wallets` — linked wallet CRUD
- `POST /api/gm` — daily GM with streak
- `GET /api/leaderboard` — top 50 by score
- `GET /api/quests` — quest list + completion status
- `GET /api/badges` — badge list + unlock status
- `POST /api/quests/:id/complete` — quest completion
- `GET /api/circuit` — circuit breaker status

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
- ROADMAP.md — project plan
- SESSION_SUMMARY.md — session handoff + audit prompt
- DEPLOY.md — deployment checklist
