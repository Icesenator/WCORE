/**
 * HYPEREVM.gs - HyperEVM / Hyperliquid (v4.11.2)
 * ChainFactory pattern with explicit function declarations
 * 
 * HyperEVM is the EVM-compatible layer of the Hyperliquid L1
 * Chain ID: 999
 * Native Token: HYPE (18 decimals)
 * 
 * RPC Sources:
 * - Official: https://rpc.hyperliquid.xyz/evm
 * - 1RPC: https://1rpc.io/hyperliquid
 * 
 * Block Explorers:
 * - https://purrsec.com/
 * - https://hyperliquid.cloud.blockscout.com
 * - https://hyperevmscan.io/
 */

var _HYPEREVM = ChainFactory.createEvmChain("HYPEREVM", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.hyperliquid.xyz/evm", "https://1rpc.io/hyperliquid", "https://hyperliquid.drpc.org", "https://rpc.hypurrscan.io"] }, // dRPC, Hypurrscan
 CHAIN: {
 NAME: "HyperEVM",
 CHAIN_ID: 999,
 NATIVE_SYMBOL: "HYPE",
 NATIVE_NAME: "Hyperliquid",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:hyperliquid",
 NATIVE_GECKO_ID: "hyperliquid",
 DEX_SLUG: "hyperevm",
 GT_NETWORK: "hyperliquid"
 },
 LLAMA_ID_MAP: { "HYPE":"coingecko:hyperliquid", "WHYPE":"coingecko:hyperliquid", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "WETH":"coingecko:weth", "WBTC":"coingecko:wrapped-bitcoin" }
});

// Main functions
function GET_WALLET_ASSETS_HYPEREVM(a,r,t,f,g){return _HYPEREVM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_HYPEREVM(a){return _HYPEREVM.getCachedWalletAssets(a);}
function HYPEREVM_REFRESH_STATUS(a,r,t,f,g){return _HYPEREVM.getRefreshStatus(a,r,t,f,g);}
function HYPEREVM_STATS(a,t){return _HYPEREVM.getStats(a,t);}

// Diagnostic functions
function DIAG_HYPEREVM_TOKEN(w,t,r){return _HYPEREVM.diag.tokenBalance(w,t,r);}
function DIAG_HYPEREVM_COMPARE_RPCS(w,t){return _HYPEREVM.diag.compareRpcs(w,t);}
function DIAG_HYPEREVM_CHECK_ERC20(t){return _HYPEREVM.diag.checkErc20(t);}
function DIAG_HYPEREVM_RPC_HEALTH(){return _HYPEREVM.diag.rpcHealth();}
function DIAG_HYPEREVM_NATIVE_BALANCE(w){return _HYPEREVM.diag.nativeBalance(w);}
function DIAG_HYPEREVM_CACHE(w){return _HYPEREVM.diag.cacheInspect(w);}
function DIAG_HYPEREVM_CACHE_TOKEN(w,t){return _HYPEREVM.diag.cacheFindToken(w,t);}
function DIAG_HYPEREVM_CACHE_ASSETS(w){return _HYPEREVM.diag.cacheListAssets(w);}
function DIAG_HYPEREVM_TOKEN_PRICE(t){return _HYPEREVM.diag.tokenPrice(t);}
function DIAG_HYPEREVM_NATIVE_PRICE(){return _HYPEREVM.diag.nativePrice();}
function DIAG_HYPEREVM_WALLET(w){return _HYPEREVM.diag.walletFull(w);}
function DIAG_HYPEREVM_CACHE_STATS(){return _HYPEREVM.diag.cacheStats();}
function DIAG_HYPEREVM_CLEAR_CACHE(w,c){return _HYPEREVM.diag.clearCache(w,c);}
