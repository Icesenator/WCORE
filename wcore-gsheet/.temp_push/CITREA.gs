/**
 * CITREA.gs - Citrea (v4.15.10) - added
 *
 * Citrea Mainnet is a Bitcoin zk-rollup EVM chain using cBTC as native asset.
 * cBTC pricing follows BTC 1:1 via coingecko:bitcoin.
 *
 * DEX_SLUG and GT_NETWORK are speculative values to verify when Citrea is
 * listed on DexScreener / GeckoTerminal. GeckoTerminal networks API did not
 * list Citrea at creation time.
 *
 * Only one public RPC is known from Citrea docs and Chainlist for chain 4114.
 * With a single endpoint there is no RPC consensus; batchWithConsensus falls
 * back to single-RPC behavior.
 */

var _CITREA = ChainFactory.createEvmChain("CITREA", {
 CACHE_VERSION: 1,
 RPC: {
 ENDPOINTS: [
 "https://rpc.mainnet.citrea.xyz"
 ]
 },
 CHAIN: {
 NAME: "Citrea",
 CHAIN_ID: 4114,
 NATIVE_SYMBOL: "cBTC",
 NATIVE_NAME: "Citrea Bitcoin",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:bitcoin",
 NATIVE_GECKO_ID: "bitcoin",
 DEX_SLUG: "citrea",
 GT_NETWORK: "citrea"
 },
 LLAMA_ID_MAP: { "cBTC":"coingecko:bitcoin", "WBTC":"coingecko:wrapped-bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_CITREA(a,r,t,f,g){return _CITREA.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_CITREA(a){return _CITREA.getCachedWalletAssets(a);}
function CITREA_REFRESH_STATUS(a,r,t,f,g){return _CITREA.getRefreshStatus(a,r,t,f,g);}
function CITREA_STATS(a,t){return _CITREA.getStats(a,t);}

// Diagnostic functions
function DIAG_CITREA_TOKEN(w,t,r){return _CITREA.diag.tokenBalance(w,t,r);}
function DIAG_CITREA_COMPARE_RPCS(w,t){return _CITREA.diag.compareRpcs(w,t);}
function DIAG_CITREA_CHECK_ERC20(t){return _CITREA.diag.checkErc20(t);}
function DIAG_CITREA_RPC_HEALTH(){return _CITREA.diag.rpcHealth();}
function DIAG_CITREA_NATIVE_BALANCE(w){return _CITREA.diag.nativeBalance(w);}
function DIAG_CITREA_CACHE(w){return _CITREA.diag.cacheInspect(w);}
function DIAG_CITREA_CACHE_TOKEN(w,t){return _CITREA.diag.cacheFindToken(w,t);}
function DIAG_CITREA_CACHE_ASSETS(w){return _CITREA.diag.cacheListAssets(w);}
function DIAG_CITREA_TOKEN_PRICE(t){return _CITREA.diag.tokenPrice(t);}
function DIAG_CITREA_NATIVE_PRICE(){return _CITREA.diag.nativePrice();}
function DIAG_CITREA_WALLET(w){return _CITREA.diag.walletFull(w);}
function DIAG_CITREA_CACHE_STATS(){return _CITREA.diag.cacheStats();}
function DIAG_CITREA_CLEAR_CACHE(w,c){return _CITREA.diag.clearCache(w,c);}
function DIAG_CITREA_DECIMALS(w){return DIAG_DECIMALS(w, _CITREA.getConfig());}
function REPAIR_CITREA_DECIMALS(w, dryRun){return REPAIR_DECIMALS(w, _CITREA.getConfig(), dryRun);}
function DIAG_CITREA_BALANCE_TIMESTAMPS(w){return DIAG_BALANCE_TIMESTAMPS(w, _CITREA.getConfig());}
