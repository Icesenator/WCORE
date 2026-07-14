/**
 * TEMPO.gs - Tempo Mainnet (v4.15.51)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.15.51 - CACHE_VERSION bump 71→72 + add "USDC.E" LLAMA_ID_MAP entry.
 *   The uppercase-E variant is needed because ERC-20 contracts may return
 *   "USDC.E" (uppercase E) while the map had only "USDC.e" (lowercase e).
 *   Without the uppercase variant, the CoinGecko fallback in the pricing
 *   cascade misses and USDC.e gets priceEur=null, which causes the web
 *   API's sanitizeGsheetScanResult to filter it as no-market.
 *
 * v4.15.43 - FIX: Bump CACHE_VERSION to invalidate E-12 cached balances.
 *   Despite TOKEN_DECIMALS being set correctly, the PREFER_CACHE_ON_DISAGREE
 *   fallback in getConsensusBalanceWithFallback kept re-applying the E-12
 *   cached value because: (1) cache voted the wrong balance, (2) single-RPC
 *   chains favour cache on disagreement. Fix in 09_SIMPLE_ROTATION.gs ensures
 *   microscopic balances never vote and suspect decimals never block TOKEN_DECIMALS.
 *
 * v4.15.24 - FIX: DISABLE_NATIVE_BALANCE + TOKEN_DECIMALS for known tokens.
 *   eth_getBalance returns a sentinel (424242...) on Tempo, polluting cache.
 *   Added FLAGS.DISABLE_NATIVE_BALANCE to skip it entirely. Also added
 *   RPC.TOKEN_DECIMALS for pathUSD and USDC.e (both 6 decimals) so that
 *   a missing metaMap decimals never falls back to 18, which previously
 *   produced balances like 2.83E-12 instead of 2.83.
 *
 * v4.15.23 - PRICING: enable DefiLlama Coins via LLAMA_CHAIN_SLUG="tempo".
 *   The TIP-20 token "pathUSD" (renamed from USD, contract 0x20c0…0000) is
 *   indexed by DefiLlama at coins.llama.fi/prices/current/tempo:{contract}.
 *   Without LLAMA_CHAIN_SLUG, _pxGetLlamaChainSlug() returned null (DEX_SLUG
 *   is null too) and the cascade never queried Llama → balance was scanned
 *   but price stayed empty. Also adds pathUSD → coingecko:pathusd in
 *   LLAMA_ID_MAP as a symbol-based fallback.
 *
 * Particularités:
 *  - Pas de native EVM classique : eth_getBalance retourne un sentinel (424242...)
 *  - pathUSD (0x20c0000000000000000000000000000000000000) est un token TIP-20
 *    standard (ex-"USD"), pas un natif — à ajouter dans la colonne I du sheet
 *  - NATIVE_SYMBOL="" → OUTPUT.gs skip la ligne native et INFO_NATIVE (v4.12.31)
 *  - Pas sur GeckoTerminal ni DexScreener (TVL ~$3M sur DefiLlama)
 *  - Un seul RPC public (tempo-mainnet.drpc.org) — FREE TIER limite les
 *    batchs JSON-RPC à 3 items maximum → RPC.MAX_BATCH_SIZE = 3
 *  - USDC.e bridged : 0x20c000000000000000000000b9537d11c60e8b50 (token ERC20)
 *  - Explorer: https://explore.mainnet.tempo.xyz
 */

var _TEMPO = ChainFactory.createEvmChain("TEMPO", {
  CACHE_VERSION: 72,
  RPC: {
    ENDPOINTS: ["https://tempo-mainnet.drpc.org"],
    MAX_BATCH_SIZE: 3,
    TOKEN_DECIMALS: {
      "0x20c0000000000000000000000000000000000000": 6,
      "0x20c000000000000000000000b9537d11c60e8b50": 6
    }
  },
  CHAIN: {
    NAME: "Tempo",
    CHAIN_ID: 4217,
    NATIVE_SYMBOL: "",
    NATIVE_NAME: "",
    NATIVE_DECIMALS: 0,
    NATIVE_LLAMA_ID: "",
    NATIVE_GECKO_ID: "",
    DEX_SLUG: null,
    GT_NETWORK: null,
    LLAMA_CHAIN_SLUG: "tempo"
  },
  FLAGS: {
    DISABLE_NATIVE_BALANCE: true,
    NATIVE_BALANCE_DISABLED_REASON: "sentinel"
  },
  LLAMA_ID_MAP: { "USD":"coingecko:usd-coin", "USDC":"coingecko:usd-coin", "USDC.e":"coingecko:usd-coin", "USDC.E":"coingecko:usd-coin", "USDT":"coingecko:tether", "DAI":"coingecko:dai", "pathUSD":"coingecko:pathusd", "PATHUSD":"coingecko:pathusd" }
});

// Main functions
function GET_WALLET_ASSETS_TEMPO(a,r,t,f,g){return _TEMPO.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_TEMPO(a){return _TEMPO.getCachedWalletAssets(a);}
function TEMPO_REFRESH_STATUS(a,r,t,f,g){return _TEMPO.getRefreshStatus(a,r,t,f,g);}
function TEMPO_STATS(a,t){return _TEMPO.getStats(a,t);}

// Diagnostic functions
function DIAG_TEMPO_TOKEN(w,t,r){return _TEMPO.diag.tokenBalance(w,t,r);}
function DIAG_TEMPO_COMPARE_RPCS(w,t){return _TEMPO.diag.compareRpcs(w,t);}
function DIAG_TEMPO_CHECK_ERC20(t){return _TEMPO.diag.checkErc20(t);}
function DIAG_TEMPO_RPC_HEALTH(){return _TEMPO.diag.rpcHealth();}
function DIAG_TEMPO_NATIVE_BALANCE(w){return _TEMPO.diag.nativeBalance(w);}
function DIAG_TEMPO_CACHE(w){return _TEMPO.diag.cacheInspect(w);}
function DIAG_TEMPO_CACHE_TOKEN(w,t){return _TEMPO.diag.cacheFindToken(w,t);}
function DIAG_TEMPO_CACHE_ASSETS(w){return _TEMPO.diag.cacheListAssets(w);}
function DIAG_TEMPO_TOKEN_PRICE(t){return _TEMPO.diag.tokenPrice(t);}
function DIAG_TEMPO_NATIVE_PRICE(){return _TEMPO.diag.nativePrice();}
function DIAG_TEMPO_WALLET(w){return _TEMPO.diag.walletFull(w);}
function DIAG_TEMPO_CACHE_STATS(){return _TEMPO.diag.cacheStats();}
function DIAG_TEMPO_CLEAR_CACHE(w,c){return _TEMPO.diag.clearCache(w,c);}
