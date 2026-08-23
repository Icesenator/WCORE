# Graph Report - graphify-input  (2026-08-10)

## Corpus Check
- 349 files · ~381,633 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4366 nodes · 5933 edges · 305 communities (286 shown, 19 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- cex.ts
- 16_REFRESH.js
- 27_ACTIVITY_REFRESH.js
- 28_PRICING_WORKER.js
- 07_PRICES.js
- 03E_QUOTA_CIRCUIT_BREAKER.js
- 41_GSHEET_WEB_SCAN.js
- gsheet.ts
- 42_STOCK_PORTFOLIO.js
- server.ts
- scan-utils.ts
- crypto-listing-service.ts
- auth.ts
- 43_CRYPTO_PORTFOLIO.js
- 38_BYBIT_SYNC.js
- stock-service.ts
- index.ts
- schemas.ts
- 26B_HTTP_SAVINGS.js
- 36_BINANCE_SYNC.js
- 13C_DIAG_TOKEN.js
- 18_CLEANUP.js
- 35_BITPANDA_SYNC.js
- 37_BITFINEX_SYNC.js
- mapping.test.ts
- 13A_DIAG_CACHE.js
- zerion.ts
- wallet-hints.ts
- 16B_AUTO_HEAL.js
- FOGO.js
- SOLANA.js
- stock-portfolio.ts
- gm-contracts.ts
- 41_KRAKEN_SYNC.js
- LENS.js
- SYNDICATE_COMMONS.js
- TON.js
- 13B_DIAG_RPC.js
- chainbase-staking.ts
- chainbase-staking.ts
- 40_OKX_SYNC.js
- dependencies
- 04C_CACHE_GLOBAL.js
- 13_DIAGNOSTIC.js
- 23_CACHE_OPTIMIZER.js
- 26_OPTIMIZATIONS.js
- 34_TOP_MARKETCAP.js
- stock-pricing.ts
- _bpUpdateSelectedBuckets_
- 39_COINBASE_SYNC.js
- gm-streak-rebuild.ts
- 14_SVM_ENGINE.js
- 17_LISTING.js
- 21_DASHBOARD.js
- oauthScopes
- stock-relay.ts
- config.ts
- zerion.test.ts
- mappings.ts
- devDependencies
- 03B_HTTP_GUARD.js
- 33_DYNAMIC_RPC.js
- BITPANDA_ON_EDIT
- gm-onchain.ts
- server-helpers.ts
- stock-service.test.ts
- scan-plugin-routes.test.ts
- 01_INIT.js
- 25_RPC_HEALTH_REPORT.js
- _bpFetchBuckets_
- gm-helpers.ts
- 04B_CACHE_WALLET.js
- _bpRunManualCexUpdate_
- DIAG_BASE_RPC_AUDIT.js
- compilerOptions
- safe-http.ts
- 28_DIAG_ACTIVITY.js
- _cexComputeAndAppendTotal_
- 44_CEX_BULK.js
- 29_DIAG_BALANCE_TRACE.js
- 29B_DIAG_BALANCE_LITE.js
- backup-db.cjs
- support.ts
- 30_SCAN_PRICING.js
- @fastify/cookie
- 04A_CACHE_CORE.js
- _SETUP_WCORE.js
- restore-db.cjs
- 32_MODULE_AUTOREGISTER.js
- presentation.ts
- bs58
- CHAIN_CONFIG_SCHEMA.js
- 09_BUDGET.js
- set-test-env.js
- TestCache
- CEX_MANUAL_REFRESH_WORKER
- fastify
- @fastify/cors
- @fastify/helmet
- fastify-type-provider-zod
- 08_ASSETS.js
- @noble/curves
- p-limit
- @wcore/core
- p-limit
- @wcore/core
- zod
- @wcore/db
- @wcore/shared
- server.ts
- stock-pricing.ts

## God Nodes (most connected - your core abstractions)
1. `scanPlugin()` - 27 edges
2. `_webScanWallet_()` - 26 edges
3. `cexPlugin()` - 22 edges
4. `_wd_collectGlobalRefreshActions_()` - 21 edges
5. `authPlugin()` - 19 edges
6. `_pricingWorkerMergeSheetContracts_()` - 18 edges
7. `_runPricingWorker()` - 18 edges
8. `ACTIVITY_WATCHDOG()` - 17 edges
9. `CanonicalStockService` - 17 edges
10. `gamificationPlugin()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `waitForDone()` --indirect_call--> `resolve()`  [INFERRED]
  web-api/src/plugins/scan-job.postgres.test.ts → gsheet/14_SVM_ENGINE.js
- `scanPlugin()` --indirect_call--> `scanCacheKey()`  [INFERRED]
  web-api/src/plugins/scan.ts → web-api/test/scan-plugin-routes.test.ts
- `buildApp()` --indirect_call--> `healthPlugin()`  [INFERRED]
  web-api/src/plugins/health.test.ts → web-api/src/plugins/health.ts
- `makeDeps()` --indirect_call--> `buildChainScan()`  [INFERRED]
  web-api/test/scan-plugin-routes.test.ts → web-api/src/server-helpers.ts
- `cexPlugin()` --calls--> `safeEq()`  [EXTRACTED]
  web-api/src/plugins/cex.ts → web-api/src/admin-auth.ts

## Import Cycles
- None detected.

## Communities (305 total, 19 thin omitted)

### Community 0 - "cex.ts"
Cohesion: 0.11
Nodes (34): resolveRelayToken(), BinanceCredentials, bitfinexAuthPost(), BitfinexCredentials, BitpandaCredentials, bitpandaWalletRow(), BybitCredentials, CEX_PRICE_IDS (+26 more)

### Community 1 - "16_REFRESH.js"
Cohesion: 0.07
Nodes (70): DIAG_RUN_WATCHDOG_SHEETS_API_FALLBACK(), DIAG_WATCHDOG_PARTIAL_CYCLES(), FORCE_RESCAN_LEDGERS(), FORCE_WATCHDOG_PARTIAL_CHECK(), INSTALL_QUOTA_RECOVERY(), MASTER_ON_EDIT(), PORTFOLIO_RECOVERY_REFRESH(), QUOTA_RECOVERY_SWEEP() (+62 more)

### Community 2 - "27_ACTIVITY_REFRESH.js"
Cohesion: 0.07
Nodes (48): _activity_pulseB1ForChain_(), ACTIVITY_WATCHDOG(), _activityApplySignalResult_(), _activityCanFetch_(), _activityGetActiveLedgerChainSet_(), _activityGetChainConfig_(), _activityMergeMap_(), _activityNormalizeChainKey_() (+40 more)

### Community 3 - "28_PRICING_WORKER.js"
Cohesion: 0.10
Nodes (53): DIAG_PRICING_WORKER_BASE_MICROCAPS(), DIAG_PRICING_WORKER_BLOCKERS(), DIAG_PRICING_WORKER_FIRST_CHAIN_FLOW(), DIAG_PRICING_WORKER_QUEUE(), DIAG_PRICING_WORKER_QUEUE_TOP(), DIAG_PRICING_WORKER_SPREADSHEET_ACCESS(), INSTALL_PRICING_WORKER_TRIGGER(), PRICING_WORKER_STATS() (+45 more)

### Community 4 - "07_PRICES.js"
Cohesion: 0.07
Nodes (35): consider(), DIAG_BASE_ONCHAIN_V3(), DIAG_CMC_DEX_BASE_MISSING(), DIAG_CMC_DEX_TOKEN_BASE(), _dispatchGlobal(), _fetchJson(), _flushChunk(), _l1Key() (+27 more)

### Community 5 - "03E_QUOTA_CIRCUIT_BREAKER.js"
Cohesion: 0.06
Nodes (23): _autoMode(), _category(), checkQuotaAndReturnCache(), _claimAutomaticProbeLease(), _currentTrigger(), _fallbackCount(), _getEffectiveMode(), _getManualMode() (+15 more)

### Community 6 - "41_GSHEET_WEB_SCAN.js"
Cohesion: 0.11
Nodes (47): DIAG_WEB_SCAN_LAST_ERROR(), DIAG_WEB_SCAN_STATUS(), LIVE_PROBE_WEB_SCAN_CHAIN(), _webScanAcquireAdmission_(), _webScanAcquireAdmissionV2_(), _webScanAllowed_(), _webScanAssetFromNative_(), _webScanAssetFromToken_() (+39 more)

### Community 7 - "gsheet.ts"
Cohesion: 0.09
Nodes (41): applyDeFiPositionMirrorsToWalletAssets(), applyStakedPriceMirrors(), DefaultChainbaseData, defaultChainbaseProvider(), defaultPriceBatcher(), defaultScanRunner(), getOptimismRpcEndpoints(), GSHEET_WALLET_LABELS (+33 more)

### Community 8 - "42_STOCK_PORTFOLIO.js"
Cohesion: 0.10
Nodes (38): COMPARE_STOCK_PORTFOLIO_SHADOW(), DIAG_PORTFOLIO_CHART_RESIZE(), _portfolioReapplyFilter_(), _portfolioSyncBothViews_(), REPAIR_STOCK_PORTFOLIO_FORMATS(), REPAIR_STOCK_PORTFOLIO_FORMULAS(), SETUP_STOCK_PORTFOLIO(), STOCK_PORTFOLIO_HOURLY_REFRESH() (+30 more)

### Community 9 - "server.ts"
Cohesion: 0.23
Nodes (12): clampLimit(), ColumnIndexes, HEADER_NAMES, HeaderResolution, normalizeHeader(), parseCsv(), parsePositiveNumber(), parseTopMarketCapCsv() (+4 more)

### Community 10 - "scan-utils.ts"
Cohesion: 0.15
Nodes (16): BalanceCacheEntry, BYPASS_PREFIXES, errorMessage(), getBalanceCacheKey(), getEngineCacheForScan(), getScanResultCacheKey(), hasCachedValue(), hasMajorPriceableTokenWithoutPrice() (+8 more)

### Community 11 - "crypto-listing-service.ts"
Cohesion: 0.10
Nodes (26): CanonicalCryptoService, CanonicalCryptoServiceDeps, CmcListingsPayload, CryptoListingSnapshot, CryptoServiceUnavailableError, hasContiguousRanks(), isCompleteSnapshot(), isNonemptyString() (+18 more)

### Community 12 - "auth.ts"
Cohesion: 0.10
Nodes (28): ADR-0036, authPlugin(), AuthUser, claimAndRevokeToken(), clearAuthCookies(), COOKIE_OPTS, fastify, FastifyRequest (+20 more)

### Community 13 - "43_CRYPTO_PORTFOLIO.js"
Cohesion: 0.13
Nodes (28): CRYPTO_PORTFOLIO_V2_HOURLY_REFRESH(), _cryptoPortfolioApplyFormulasToRow_(), _cryptoPortfolioBuildFormulaMatrixForRows_(), _cryptoPortfolioBuildMatrix_(), _cryptoPortfolioBuildRow1_(), _cryptoPortfolioBuildSourceRows_(), _cryptoPortfolioClearSourceTail_(), _cryptoPortfolioCountSourceRows_() (+20 more)

### Community 14 - "38_BYBIT_SYNC.js"
Cohesion: 0.13
Nodes (21): BYBIT_ON_EDIT(), _bybitAuthGet_(), _bybitBuildValues_(), _bybitCanonicalSymbol_(), _bybitCredsOrNull_(), _bybitFetchBuckets_(), _bybitFetchBucketsViaRelay_(), _bybitFetchFund_() (+13 more)

### Community 15 - "stock-service.ts"
Cohesion: 0.17
Nodes (18): StockFxQuoteMap, StockNativeQuoteMap, CanonicalStockService, CanonicalStockServiceDeps, distinctFxCurrencies(), isCompleteSnapshot(), isNonemptyString(), isRecentIso() (+10 more)

### Community 16 - "index.ts"
Cohesion: 0.09
Nodes (28): RFC-1918, registerCreatorRoutes(), checkStreakBadges(), CREATOR_BALANCE_SELECTOR, extractDeployedContractAddresses(), gamificationPlugin(), getChainRpc(), getChainRpcs() (+20 more)

### Community 17 - "schemas.ts"
Cohesion: 0.14
Nodes (24): registerGmContractsRoutes(), walletPlugin(), WalletPluginDeps, AnyWalletAddress, CexProviderSchema, ChainKey, ChainQuerySchema, CuidId (+16 more)

### Community 18 - "26B_HTTP_SAVINGS.js"
Cohesion: 0.13
Nodes (14): _dayKey(), flush(), _forceFullAllowed_(), _hostDayKey(), increment(), _mileDayKey(), _normalizeForceWithBudgetGuard_(), _parseHost() (+6 more)

### Community 19 - "36_BINANCE_SYNC.js"
Cohesion: 0.13
Nodes (16): BINANCE_ON_EDIT(), _binBuildValues_(), _binFetchBuckets_(), _binFetchBucketsViaRelay_(), _binFetchEarn_(), _binFetchSpot_(), _binGetRelay_(), _binParseAmount_() (+8 more)

### Community 20 - "13C_DIAG_TOKEN.js"
Cohesion: 0.10
Nodes (12): DIAG_FLIPIT_META(), DIAG_FLIPIT_POSITION(), DIAG_TOKEN_META(), DIAG_TOKEN_META_BASE(), DIAG_TOKEN_POSITION_ARBITRUM_ONE(), DIAG_TOKEN_POSITION_BASE(), DIAG_TOKEN_POSITION_ETHEREUM(), DIAG_TOKEN_POSITION_POLYGON() (+4 more)

### Community 21 - "18_CLEANUP.js"
Cohesion: 0.10
Nodes (7): analyze(), emergencyPurge(), extractTimestamp(), forceClean(), getCategoryFromKey(), getDetailedStats(), purgeCategory()

### Community 22 - "35_BITPANDA_SYNC.js"
Cohesion: 0.10
Nodes (11): BITPANDA_REFRESH_WATCHDOG(), BP_REINSTALL_CEX_TRIGGERS(), _bpEnsureCexTriggers_(), _bpGetRefreshFlag_(), _bpSheetHasRequest_(), CEX_HAS_MANUAL_REQUEST(), CEX_REFRESH_WATCHDOG(), _cexFetchWebPrices_() (+3 more)

### Community 23 - "37_BITFINEX_SYNC.js"
Cohesion: 0.13
Nodes (16): _bfxAuthPost_(), _bfxBuildValues_(), _bfxCanonicalSymbol_(), _bfxFetchBuckets_(), _bfxFetchSpot_(), _bfxGetCreds_(), _bfxParseAmount_(), _bfxPushRow_() (+8 more)

### Community 25 - "mapping.test.ts"
Cohesion: 0.15
Nodes (9): EnrichmentPurpose, NormalizedPositionType, PortfolioEnrichmentInput, PortfolioEnrichmentProvider, PortfolioEnrichmentResult, PortfolioEnrichmentService, ProviderCapabilities, ProviderPortfolioSnapshot (+1 more)

### Community 26 - "13A_DIAG_CACHE.js"
Cohesion: 0.09
Nodes (7): DIAG_CACHE_L1_DIRECT(), DIAG_CACHE_QUICK(), DIAG_CACHE_SOURCE(), _extractEntryData(), _hashKey(), _hashKeySimple(), _simpleHash()

### Community 27 - "zerion.ts"
Cohesion: 0.11
Nodes (18): ZerionEnrichmentConfig, NormalizedProviderPosition, AdaptedPosition, adaptEnvelope(), adaptPosition(), envelopeSchema, finiteNumber(), fungibleInfoSchema (+10 more)

### Community 28 - "wallet-hints.ts"
Cohesion: 0.15
Nodes (13): ProviderWalletHint, createWalletHintVerifierDeps(), HintGroup, HintVm, normalizeContract(), normalizeHints(), tokenIdentity(), tokenRecords() (+5 more)

### Community 29 - "16B_AUTO_HEAL.js"
Cohesion: 0.20
Nodes (20): WCORE_AUTO_HEAL(), WCORE_AUTO_HEAL_FORCE(), WCORE_AUTO_HEAL_STATUS(), WCORE_AUTO_HEAL_TIMER(), WCORE_TRIGGER_REINSTALL_FORCE_ONLY(), _wcoreAutoHealBackgroundMaintenance_(), _wcoreAutoHealBootstrapState_(), _wcoreAutoHealCexQueueStaleness_() (+12 more)

### Community 31 - "FOGO.js"
Cohesion: 0.11
Nodes (4): CACHED_WALLET_ASSETS_FOGO(), _FOGO_applyKnownTokens(), _FOGO_recalculateTotal(), GET_WALLET_ASSETS_FOGO()

### Community 33 - "stock-portfolio.ts"
Cohesion: 0.16
Nodes (16): CryptoListingRow, toCryptoMarketCapRow(), toStockMarketCapRow(), GsheetStockPortfolioRow, GsheetStockPortfolioSnapshot, buildGsheetStockPortfolioSnapshot(), BuildGsheetStockPortfolioSnapshotInput, holdingForRankedRow() (+8 more)

### Community 34 - "gm-contracts.ts"
Cohesion: 0.20
Nodes (13): addressFromTopic(), DeployReceipt, DISABLED_GM_CONTRACTS, filterDisabledGmContracts(), filterUnusedGmContracts(), findVerifiedDeployedContract(), GmContractAddress, GmContractResponse (+5 more)

### Community 35 - "41_KRAKEN_SYNC.js"
Cohesion: 0.17
Nodes (14): DIAG_KRAKEN_API(), KRAKEN_ON_EDIT(), _krakenBuildValues_(), _krakenBytesConcat_(), _krakenCanonicalSymbol_(), _krakenFetchBuckets_(), _krakenGetCreds_(), _krakenParseAmount_() (+6 more)

### Community 37 - "SYNDICATE_COMMONS.js"
Cohesion: 0.19
Nodes (17): CHAINBASE_RPC_TIMEOUT_MS, ChainbaseLiquidityStatus, ChainbaseStaking, CONFIG_PATHS, decodeUint256At(), encodeAddress(), encodeUint256(), getChainbaseDelegationLiquidityStatus() (+9 more)

### Community 38 - "TON.js"
Cohesion: 0.25
Nodes (20): CACHED_WALLET_ASSETS_TON(), DIAG_TON_API(), DIAG_TON_CACHE(), DIAG_TON_WALLET(), GET_WALLET_ASSETS_TON(), TON_REFRESH_STATUS(), TON_STATS(), _tonBalanceFromNano_() (+12 more)

### Community 39 - "13B_DIAG_RPC.js"
Cohesion: 0.15
Nodes (8): DIAG_ANKR_TEST(), DIAG_ANKR_TEST_BASE(), DIAG_BLOCKSCOUT_TEST(), DIAG_BLOCKSCOUT_TEST_BASE(), DIAG_WATCHDOG(), DIAG_WATCHDOG_SHEET(), _isValidDateFormat(), _parseDate()

### Community 43 - "chainbase-staking.ts"
Cohesion: 0.15
Nodes (26): BITFINEX_STABLE_MAP, BITFINEX_SYMBOL_ALIASES, BitfinexBuckets, bitfinexCanonicalSymbol(), BitpandaBuckets, BybitBuckets, canonicalCexSymbol(), CexProvider (+18 more)

### Community 44 - "chainbase-staking.ts"
Cohesion: 0.47
Nodes (5): convertUsdPriceToEur(), priceCexRowsForTest(), pricedRows(), priceStockSymbolEur(), priceSymbolEur()

### Community 45 - "40_OKX_SYNC.js"
Cohesion: 0.19
Nodes (12): DIAG_OKX_API(), DIAG_OKX_RELAY_CONFIG(), OKX_ON_EDIT(), _okxBuildValues_(), _okxCanonicalSymbol_(), _okxFetchBucketsViaRelay_(), _okxGetRelay_(), _okxParseAmount_() (+4 more)

### Community 149 - "dependencies"
Cohesion: 0.13
Nodes (15): bs58, @cosmjs/crypto, @fastify/cookie, jsonwebtoken, @noble/curves, @noble/hashes, p-limit, dependencies (+7 more)

### Community 150 - "04C_CACHE_GLOBAL.js"
Cohesion: 0.18
Nodes (11): _assetCount(), _budgetWriteBlocked(), _compactAsset(), _expand(), _expandAsset(), _hasHttpErrorSignal(), _mergeAssetsPreservingCached(), _migrate() (+3 more)

### Community 151 - "13_DIAGNOSTIC.js"
Cohesion: 0.12
Nodes (3): LIST_COSMOS_CACHE_KEYS(), LIST_SCRIPT_PROPERTIES_KEYS(), NOTE:

### Community 152 - "23_CACHE_OPTIMIZER.js"
Cohesion: 0.24
Nodes (16): CACHE_ANALYZE(), CACHE_COMPACT_ALL(), CACHE_OPTIMIZE(), CACHE_PURGE_STALE(), CACHE_STATS_DETAILED(), _cacheOpt_categorizeKeys(), _cacheOpt_compactNumber(), _cacheOpt_compactWalletCache() (+8 more)

### Community 153 - "26_OPTIMIZATIONS.js"
Cohesion: 0.15
Nodes (8): DIAG_DEAD_CONTRACTS(), DIAG_STALE_PRICES(), DIAG_SYSTEM_ALERTS(), _generateSystemAlerts(), _opt_extractWalletFromKey(), _warmupPriceCache(), WCORE_PRUNE_CONTRACTS(), WCORE_WARMUP_PRICES()

### Community 154 - "34_TOP_MARKETCAP.js"
Cohesion: 0.23
Nodes (15): DIAG_TOP_MARKETCAP(), REPAIR_ACTION_REBALANCING_SPOT(), _topMcActionFormulaRow_(), _topMcActionSpotFormula_(), _topMcBitpandaAlias1Formula_(), _topMcBitpandaAlias2Formula_(), _topMcBitpandaLookupFormula_(), _topMcCurrencyFallbackFormula_() (+7 more)

### Community 155 - "stock-pricing.ts"
Cohesion: 0.21
Nodes (15): StockNativeQuote, decimalInteger(), DRIFT_ERROR, isDriftAboveLimit(), isPositiveFinite(), normalizeCurrency(), quotePriceEur(), resolveStockPrice() (+7 more)

### Community 156 - "_bpUpdateSelectedBuckets_"
Cohesion: 0.19
Nodes (15): _bpDeleteRefreshFlag_(), _bpGetManagedSheetRefreshPlan_(), _bpMergeBuckets_(), _bpRunCryptoCexRefreshDirect_(), _bpSetStatus_(), _bpUpdateSelectedBuckets_(), CEX_ACQUIRE_LOCK(), CEX_CLEAR_MANUAL_REQUEST() (+7 more)

### Community 157 - "39_COINBASE_SYNC.js"
Cohesion: 0.21
Nodes (10): _cbBuildValues_(), _cbFetchBucketsViaRelay_(), _cbGetRelay_(), _cbParseAmount_(), _cbSetRefreshFlag_(), _cbSetStatus_(), _cbWriteSheet_(), COINBASE_ON_EDIT() (+2 more)

### Community 158 - "gm-streak-rebuild.ts"
Cohesion: 0.11
Nodes (21): CHAIN_STEP_SIZES, fetchAllUserGmLogs(), GmLog, rebuildChainStreakFromOnchain(), RebuildDeps, RebuildEvent, RebuildResult, makeGmLog() (+13 more)

### Community 159 - "14_SVM_ENGINE.js"
Cohesion: 0.28
Nodes (12): learn(), _load(), _mg(), _ph(), _pn(), resolve(), _save(), _svmHex() (+4 more)

### Community 160 - "17_LISTING.js"
Cohesion: 0.23
Nodes (9): _ensureLedgerCache_(), _ensureLedgerOnChangeTrigger_(), _filterLedgerNames_(), _isLedgerLike_(), LEDGER_ON_CHANGE(), LIST_SHEETS_LEDGER(), REFRESH_LEDGER_CACHE(), _setDetailsChainHyperlinks_() (+1 more)

### Community 161 - "21_DASHBOARD.js"
Cohesion: 0.32
Nodes (13): _dashboard_getAlerts(), _dashboard_getAllChainNames(), _dashboard_getCacheStats(), _dashboard_getChainHealth(), _dashboard_getHttpStats(), _dashboard_getPortfolioSummary(), WCORE_ALERTS(), WCORE_CHAIN_HEALTH() (+5 more)

### Community 162 - "oauthScopes"
Cohesion: 0.13
Nodes (14): dependencies, enabledAdvancedServices, exceptionLogging, executionApi, access, oauthScopes, runtimeVersion, timeZone (+6 more)

### Community 163 - "stock-relay.ts"
Cohesion: 0.24
Nodes (12): fetchStockFxQuotesViaRelay(), fetchStockPricesViaRelay(), fetchStockQuotesViaRelay(), hasRelayCredentials(), normalizeStockCurrency(), normalizeStockFxCurrencies(), STOCK_FX_CURRENCIES, STOCK_QUOTE_CURRENCIES (+4 more)

### Community 164 - "config.ts"
Cohesion: 0.16
Nodes (18): ApiEnv, DEV_ENVS, getApiConfig(), parseRedisConfig(), parseTrustProxy(), readBoolean(), readCsv(), readJwtSecret() (+10 more)

### Community 165 - "zerion.test.ts"
Cohesion: 0.13
Nodes (8): createZerionProvider(), CreateZerionProviderOptions, isSupportedAddress(), NOW, provider(), ZerionErrorKind, ZerionProviderError, EvmAddress

### Community 166 - "mappings.ts"
Cohesion: 0.26
Nodes (12): BITPANDA_SECURITIES, CANONICAL_ALIASES, CanonicalStockMapping, copyMapping(), ExchangeMapping, EXCHANGES, getBitpandaAliases(), getBitpandaSecurity() (+4 more)

### Community 167 - "devDependencies"
Cohesion: 0.15
Nodes (13): ethers, pino-pretty, tsx, @types/jsonwebtoken, @types/node, typescript, devDependencies, ethers (+5 more)

### Community 168 - "03B_HTTP_GUARD.js"
Cohesion: 0.23
Nodes (7): _classifyError(), _detectSilentQuotaExhaustion(), getErrorWeight(), _hasValidData(), _isQuotaError(), _recordError(), _shouldAllowSave()

### Community 170 - "33_DYNAMIC_RPC.js"
Cohesion: 0.19
Nodes (5): _dynamicRpcCanFetch_(), _dynamicRpcGetOurChainIds(), IMPORTANT: Chainlist RPCs are PRIMARY (community-maintained, up-to-date)., _testRpcLatency(), UPDATE_DYNAMIC_RPCS()

### Community 171 - "BITPANDA_ON_EDIT"
Cohesion: 0.27
Nodes (10): BITPANDA_ON_EDIT(), _bpFmtStamp_(), _bpIsManagedSheet_(), _bpSetExternalRefreshStatus_(), _bpSetRefreshFlag_(), _bpSetSheetRequestFlag_(), CEX_QUEUE_OR_MARK_MANUAL_JOB(), CEX_RUN_DIRECT_OR_QUEUE() (+2 more)

### Community 172 - "gm-onchain.ts"
Cohesion: 0.13
Nodes (15): RFC-5737, createGmHelpers(), GmHelpersDeps, getStatusOnchainCache(), registerGmOnchainRoutes(), setStatusOnchainCache(), MockUser, registerRoutes() (+7 more)

### Community 173 - "server-helpers.ts"
Cohesion: 0.10
Nodes (21): baseDeps, ApiRateLimitBucket, applyPostAuthRateLimit(), buildChainScan(), ChainScanMetrics, classifyScanError(), consumeScanBudget(), extractPhases() (+13 more)

### Community 174 - "stock-service.test.ts"
Cohesion: 0.18
Nodes (6): StockServiceUnavailableError, BatchRecordingCache, csv(), csvWithRankGap(), deps(), RecordingCache

### Community 175 - "scan-plugin-routes.test.ts"
Cohesion: 0.10
Nodes (17): EnqueueScanJobInput, ScanJobHandler, ScanJobPollResult, ScanJobQueue, ScanPluginDeps, breakers, FakeBreaker, getFakeBreaker() (+9 more)

### Community 176 - "01_INIT.js"
Cohesion: 0.20
Nodes (3): IS_WCORE_SAFE(), NOTE: Three separate systems coexist (by design):, WCORE_IS_SAFE()

### Community 178 - "25_RPC_HEALTH_REPORT.js"
Cohesion: 0.42
Nodes (10): GET_ALL_RPC_HEALTH(), GET_CACHE_VERSION_REPORT(), GET_CHAIN_PERFORMANCE_SUMMARY(), GET_LOW_HEALTH_CHAINS(), _getAllRegisteredChains(), _getChainHealthRow(), _getRpcHealthCosmosChains(), _getRpcHealthEvmChains() (+2 more)

### Community 179 - "_bpFetchBuckets_"
Cohesion: 0.25
Nodes (11): _bpCanonicalSymbol_(), _bpFetch_(), _bpFetchBuckets_(), _bpGetApiKey_(), _bpParseBalance_(), _bpPushUniqueRow_(), _bpReclassifyCashLike_(), _bpWalkAssetWallets_() (+3 more)

### Community 180 - "gm-helpers.ts"
Cohesion: 0.11
Nodes (21): asProgress(), asRequest(), ClaimedScanJob, createLeaseToken(), fencedLeaseWhere(), JobAdmission, ownsScanJob(), progress (+13 more)

### Community 182 - "_bpRunManualCexUpdate_"
Cohesion: 0.27
Nodes (10): _bpExtractStampText_(), _bpGetSheetCellText_(), _bpGetSpreadsheet_(), _bpRunManualCexUpdate_(), _bpSetSheetStatus_(), CEX_GET_SPREADSHEET(), CEX_RUN_MANUAL_UPDATE(), _cexWriteManualJobRetryStatus_() (+2 more)

### Community 183 - "DIAG_BASE_RPC_AUDIT.js"
Cohesion: 0.33
Nodes (8): _auditSingleToken(), DIAG_BASE_CBBTC_AUDIT(), DIAG_BASE_CBBTC_IN_RANGE(), DIAG_BASE_RPC_AUDIT(), DIAG_BASE_USDC_AUDIT(), _formatBal(), _rpcFetchBalance(), _rpcFetchBalanceWithHex()

### Community 184 - "compilerOptions"
Cohesion: 0.20
Nodes (9): compilerOptions, outDir, rootDir, useUnknownInCatchVariables, verbatimModuleSyntax, extends, include, src/**/* (+1 more)

### Community 186 - "28_DIAG_ACTIVITY.js"
Cohesion: 0.28
Nodes (3): _diag_directUpdateNonce(), _diag_fetchEvmNonce(), FIX_INIT_ALL_NONCES()

### Community 187 - "_cexComputeAndAppendTotal_"
Cohesion: 0.25
Nodes (9): _bpWriteRows_(), _cexBuildVerifFormula_(), _cexComputeAndAppendTotal_(), _cexGetPriceMap_(), _cexRepairSheetStructure_(), _cexStockAliasSwitch_(), _cexSymbolToGeckoId_(), _cexWriteVerifMap_() (+1 more)

### Community 188 - "44_CEX_BULK.js"
Cohesion: 0.27
Nodes (8): _cexBulkCanonicalSymbol_(), _cexBulkFetchAll_(), _cexBulkGetRelayToken_(), _cexBulkGetRelayUrl_(), _cexBulkMergeRows_(), _cexBulkWriteOne_(), _cexRelayRotationClaim_(), UPDATE_CEX_RELAY_ROTATION()

### Community 189 - "29_DIAG_BALANCE_TRACE.js"
Cohesion: 0.54
Nodes (6): TRACE_BALANCE(), _trace_fetchBalanceRaw(), TRACE_FULL_REFRESH(), _trace_getChainConfig(), _trace_readCache(), TRACE_RPC_RAW()

### Community 190 - "29B_DIAG_BALANCE_LITE.js"
Cohesion: 0.57
Nodes (7): _lite_hashKey(), _lite_hexToDecimal(), _lite_inflatePayload(), _lite_readEntry(), TRACE_BALANCE_LITE(), TRACE_CACHE_ONLY(), TRACE_RPC_SINGLE()

### Community 191 - "backup-db.cjs"
Cohesion: 0.33
Nodes (6): BACKUP_MODELS, collectBackup(), fs, main(), path, { PrismaClient }

### Community 192 - "support.ts"
Cohesion: 0.43
Nodes (5): isAdminAuthorized(), safeEq(), chainsPlugin(), ChainsPluginDeps, NativePriceQuerySchema

### Community 194 - "30_SCAN_PRICING.js"
Cohesion: 0.62
Nodes (6): _scanDetectDegraded(), _scanDetectError(), _scanFindColumns(), _scanParseNum(), WCORE_SCAN_ERRORS(), WCORE_SCAN_PRICING_GAPS()

### Community 196 - "@fastify/cookie"
Cohesion: 0.19
Nodes (15): fetchFxRate(), finalizeDeFiAssets(), hasUnfinalizedDeFiAssets(), getPostgresScanJobQueue(), jobPrincipal(), ScanJobContext, resolveScanChainLimit(), scanPlugin() (+7 more)

### Community 199 - "restore-db.cjs"
Cohesion: 0.40
Nodes (5): fs, p, parseInsertLine(), parseSqlValue(), { PrismaClient }

### Community 201 - "32_MODULE_AUTOREGISTER.js"
Cohesion: 0.50
Nodes (3): _forceRegisterAllModules(), NOTE: eval() in _forceRegisterAllModules() works at runtime but NOT in, TEST_MODULE_AUTOREGISTER()

### Community 270 - "presentation.ts"
Cohesion: 0.20
Nodes (12): adminPlugin(), AdminPluginDeps, AlertSeverity, auditEvmRpcChains(), dependencyHealthStatus(), DependencyName, DependencyTransitionTracker, RpcAuditChain (+4 more)

### Community 272 - "bs58"
Cohesion: 0.31
Nodes (6): toWcoreChain(), ZERION_CHAIN_MAP, canonicalProtocol(), normalizeProviderProtocolId(), ZERION_PROTOCOL_ALIASES, ProviderId

### Community 273 - "CHAIN_CONFIG_SCHEMA.js"
Cohesion: 0.83
Nodes (3): _isNonEmptyString(), _isUrl(), _validate()

### Community 280 - "TestCache"
Cohesion: 0.33
Nodes (6): scripts, build, dev, start, test, typecheck

### Community 281 - "CEX_MANUAL_REFRESH_WORKER"
Cohesion: 0.25
Nodes (9): CEX_MANUAL_REFRESH_WORKER(), CEX_MANUAL_REFRESH_WORKER_FORCE(), CEX_QUEUE_MANUAL_JOB(), _cexEnqueueManualJobs_(), _cexEnsureManualWorkerTrigger_(), _cexQueueMutate_(), _cexRequeueManualJob_(), _cexWorkerAcquireLease_() (+1 more)

### Community 285 - "fastify-type-provider-zod"
Cohesion: 0.33
Nodes (3): endpoints, here, server

### Community 293 - "@noble/curves"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 311 - "server.ts"
Cohesion: 0.08
Nodes (24): TEST_ACCOUNT, ApiConfig, healthPlugin(), HealthPluginOptions, buildApp(), metricsPlugin(), MetricsPluginDeps, app (+16 more)

### Community 313 - "stock-pricing.ts"
Cohesion: 0.27
Nodes (7): BITPANDA_YAHOO_SYMBOLS, CachedStockPrice, priceYahooStockSymbolEur(), StockPriceCache, YahooChartResponse, YahooStockPricingDeps, yahooStockSymbolCandidates()

## Knowledge Gaps
- **222 isolated node(s):** `timeZone`, `enabledAdvancedServices`, `access`, `https://www.googleapis.com/auth/script.projects`, `https://www.googleapis.com/auth/script.scriptapp` (+217 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `gamificationPlugin()` connect `index.ts` to `schemas.ts`, `gm-onchain.ts`, `server.ts`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `CanonicalCryptoService` connect `crypto-listing-service.ts` to `server.ts`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **What connects `timeZone`, `enabledAdvancedServices`, `access` to the rest of the system?**
  _222 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cex.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `16_REFRESH.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07441688263606072 - nodes in this community are weakly interconnected._
- **Should `27_ACTIVITY_REFRESH.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06892655367231638 - nodes in this community are weakly interconnected._
- **Should `28_PRICING_WORKER.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09696969696969697 - nodes in this community are weakly interconnected._