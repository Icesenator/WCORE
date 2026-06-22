/**
 * BEAM.gs - Beam (v4.9.5)
 * ChainFactory pattern with explicit function declarations
 */

var _BEAM = ChainFactory.createEvmChain("BEAM", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://build.onbeam.com/rpc", "https://subnets.avax.network/beam/mainnet/rpc", "https://4337.rpc.thirdweb.com"] },
 CHAIN: {
 NAME: "Beam",
 CHAIN_ID: 4337,
 NATIVE_SYMBOL: "BEAM",
 NATIVE_NAME: "Beam",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:beam-2",
 NATIVE_GECKO_ID: "beam-2",
 DEX_SLUG: "beam",
 GT_NETWORK: "beam"
 },
 LLAMA_ID_MAP: { "BEAM":"coingecko:beam-2", "DAI":"coingecko:dai", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WBEAM":"coingecko:beam-2", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth" }
});

// Main functions
function GET_WALLET_ASSETS_BEAM(a,r,t,f,g){return _BEAM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BEAM(a){return _BEAM.getCachedWalletAssets(a);}
function BEAM_REFRESH_STATUS(a,r,t,f,g){return _BEAM.getRefreshStatus(a,r,t,f,g);}
function BEAM_STATS(a,t){return _BEAM.getStats(a,t);}

// Diagnostic functions
function DIAG_BEAM_TOKEN(w,t,r){return _BEAM.diag.tokenBalance(w,t,r);}
function DIAG_BEAM_COMPARE_RPCS(w,t){return _BEAM.diag.compareRpcs(w,t);}
function DIAG_BEAM_CHECK_ERC20(t){return _BEAM.diag.checkErc20(t);}
function DIAG_BEAM_RPC_HEALTH(){return _BEAM.diag.rpcHealth();}
function DIAG_BEAM_NATIVE_BALANCE(w){return _BEAM.diag.nativeBalance(w);}
function DIAG_BEAM_CACHE(w){return _BEAM.diag.cacheInspect(w);}
function DIAG_BEAM_CACHE_TOKEN(w,t){return _BEAM.diag.cacheFindToken(w,t);}
function DIAG_BEAM_CACHE_ASSETS(w){return _BEAM.diag.cacheListAssets(w);}
function DIAG_BEAM_TOKEN_PRICE(t){return _BEAM.diag.tokenPrice(t);}
function DIAG_BEAM_NATIVE_PRICE(){return _BEAM.diag.nativePrice();}
function DIAG_BEAM_WALLET(w){return _BEAM.diag.walletFull(w);}
function DIAG_BEAM_CACHE_STATS(){return _BEAM.diag.cacheStats();}
function DIAG_BEAM_CLEAR_CACHE(w,c){return _BEAM.diag.clearCache(w,c);}
