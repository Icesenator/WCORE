/**
 * DEGEN.gs - Degen Chain (v4.12.7)
 * ChainFactory pattern with explicit function declarations
 * 
 * Degen Chain is a Layer 3 built on Arbitrum Orbit with Base for settlement.
 * Native gas token is DEGEN (Farcaster community token).
 * Chain ID: 666666666
 * Explorer: https://explorer.degen.tips
 */

var _DEGEN = ChainFactory.createEvmChain("DEGEN", {
 CACHE_VERSION: 63,
 // Endpoints retires le 2026-08-06 apres mesure depuis DEUX IP distinctes
 // (poste local et API Railway), sur eth_chainId, eth_blockNumber et
 // eth_getBalance — pas seulement sur eth_chainId :
 //   - degen.drpc.org           : HTTP 404 partout, la route n'existe plus.
 //   - 666666666.rpc.thirdweb.com : sert le bon chainId (0x27bc86aa) mais
 //     repond -32603 "not able to process your request" en local et HTTP 429
 //     depuis Railway. Inutilisable sur les deux IP, donc pas un blocage
 //     dependant de l'IP: il ne peut servir de repli a personne.
 // rpc.degen.tips est conserve bien qu'il renvoie 429 en permanence: c'est le
 // seul endpoint que le registre officiel declare (chainid.network, chaine
 // "incubating"), il repond donc toujours et peut se debloquer. La chaine
 // reste active, son cache est preserve par _webScanShouldPreserveExistingCache_.
 RPC: { ENDPOINTS: [
   "https://rpc.degen.tips"
 ]},
 CHAIN: {
   NAME: "Degen",
   CHAIN_ID: 666666666,
   NATIVE_SYMBOL: "DEGEN",
   NATIVE_NAME: "Degen",
   NATIVE_DECIMALS: 18,
   NATIVE_LLAMA_ID: "coingecko:degen-base",
   NATIVE_GECKO_ID: "degen-base",
   DEX_SLUG: "degenchain",
   GT_NETWORK: "degenchain"
 },
 LLAMA_ID_MAP: { "DEGEN":"coingecko:degen-base", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth", "WBTC":"coingecko:wrapped-bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_DEGEN(a,r,t,f,g){return _DEGEN.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_DEGEN(a){return _DEGEN.getCachedWalletAssets(a);}
function DEGEN_REFRESH_STATUS(a,r,t,f,g){return _DEGEN.getRefreshStatus(a,r,t,f,g);}
function DEGEN_STATS(a,t){return _DEGEN.getStats(a,t);}

// Diagnostic functions
function DIAG_DEGEN_TOKEN(w,t,r){return _DEGEN.diag.tokenBalance(w,t,r);}
function DIAG_DEGEN_COMPARE_RPCS(w,t){return _DEGEN.diag.compareRpcs(w,t);}
function DIAG_DEGEN_CHECK_ERC20(t){return _DEGEN.diag.checkErc20(t);}
function DIAG_DEGEN_RPC_HEALTH(){return _DEGEN.diag.rpcHealth();}
function DIAG_DEGEN_NATIVE_BALANCE(w){return _DEGEN.diag.nativeBalance(w);}
function DIAG_DEGEN_CACHE(w){return _DEGEN.diag.cacheInspect(w);}
function DIAG_DEGEN_CACHE_TOKEN(w,t){return _DEGEN.diag.cacheFindToken(w,t);}
function DIAG_DEGEN_CACHE_ASSETS(w){return _DEGEN.diag.cacheListAssets(w);}
function DIAG_DEGEN_TOKEN_PRICE(t){return _DEGEN.diag.tokenPrice(t);}
function DIAG_DEGEN_NATIVE_PRICE(){return _DEGEN.diag.nativePrice();}
function DIAG_DEGEN_WALLET(w){return _DEGEN.diag.walletFull(w);}
function DIAG_DEGEN_CACHE_STATS(){return _DEGEN.diag.cacheStats();}
function DIAG_DEGEN_CLEAR_CACHE(w,c){return _DEGEN.diag.clearCache(w,c);}
