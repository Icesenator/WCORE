/**
 * ELYSIUM.gs - Elysium Mainnet de Kinetiq (chainId 99901 = 0x1863d), gaz HYPE
 * ChainFactory pattern with explicit function declarations
 *
 * Reseau retenu (decision operateur du 2026-11-10) : Elysium de KINETIQ, mainnet 99901.
 * NE PAS confondre avec :
 *  - Elysium Testnet de Kinetiq (99801) ;
 *  - Elysium de Vulcan Forged (1339, natif LAVA) et son testnet (1338).
 * Le controle eth_chainId de chaque endpoint (99901) rejette tout RPC d un autre reseau.
 *
 * Verifie le 2026-11-10 au RPC https://rpc.elysium.kinetiq.xyz :
 *  - eth_chainId = 0x1863d = 99901, blocs frais, temps de bloc moyen ~0,49 s ;
 *  - eth_getBalance et eth_getTransactionCount repondent ;
 *  - eth_getLogs filtre par portefeuille : toute la chaine (~3,8 M blocs) en un appel (~0,4 s),
 *    aucun plafond de plage observe, d ou l absence de MAX_LOG_RANGE.
 *  - MIN_LOG_SCAN_BLOCKS = 500 000 (~68 h) : la fenetre par defaut du Web (5 000 blocs) ne
 *    couvre que ~41 min sur cette chaine ; sans plancher, un token recu entre deux scans
 *    espaces de plusieurs heures ne serait jamais decouvert.
 *  - LOG_CHUNK_BLOCKS = 600 000 : un seul eth_getLogs par sens de transfert. Avec le decoupage
 *    par defaut (10 000 blocs), la fenetre de 500 000 blocs faisait 100 appels et le RPC
 *    repondait HTTP 429 (mesure le 2026-11-10) : la decouverte echouait.
 *  - Explorateur : https://elysium.kinetiq.xyz/explorer.
 *
 * Prix : HYPE comme sur HyperEVM (DefiLlama coingecko:hyperliquid, puis CoinGecko), verifie
 * date le 2026-11-10. DEX_SLUG "elysium" = reseau DexScreener de Kinetiq (paires HYPE natives et
 * USDC 0xb47c...0b65). GeckoTerminal non renseigne (aucun pool, reseau non identifie).
 */

var _ELYSIUM = ChainFactory.createEvmChain("ELYSIUM", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.elysium.kinetiq.xyz"], MIN_LOG_SCAN_BLOCKS: 500000, LOG_CHUNK_BLOCKS: 600000 },
 CHAIN: {
 NAME: "Elysium",
 CHAIN_ID: 99901,
 NATIVE_SYMBOL: "HYPE",
 NATIVE_NAME: "Hyperliquid",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:hyperliquid",
 NATIVE_GECKO_ID: "hyperliquid",
 DEX_SLUG: "elysium"
 },
 LLAMA_ID_MAP: { "HYPE":"coingecko:hyperliquid", "WHYPE":"coingecko:hyperliquid", "USDC":"coingecko:usd-coin" }
});

// Main functions
function GET_WALLET_ASSETS_ELYSIUM(a,r,t,f,g){return _ELYSIUM.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_ELYSIUM(a){return _ELYSIUM.getCachedWalletAssets(a);}
function ELYSIUM_REFRESH_STATUS(a,r,t,f,g){return _ELYSIUM.getRefreshStatus(a,r,t,f,g);}
function ELYSIUM_STATS(a,t){return _ELYSIUM.getStats(a,t);}

// Diagnostic functions
function DIAG_ELYSIUM_TOKEN(w,t,r){return _ELYSIUM.diag.tokenBalance(w,t,r);}
function DIAG_ELYSIUM_COMPARE_RPCS(w,t){return _ELYSIUM.diag.compareRpcs(w,t);}
function DIAG_ELYSIUM_CHECK_ERC20(t){return _ELYSIUM.diag.checkErc20(t);}
function DIAG_ELYSIUM_RPC_HEALTH(){return _ELYSIUM.diag.rpcHealth();}
function DIAG_ELYSIUM_NATIVE_BALANCE(w){return _ELYSIUM.diag.nativeBalance(w);}
function DIAG_ELYSIUM_CACHE(w){return _ELYSIUM.diag.cacheInspect(w);}
function DIAG_ELYSIUM_CACHE_TOKEN(w,t){return _ELYSIUM.diag.cacheFindToken(w,t);}
function DIAG_ELYSIUM_CACHE_ASSETS(w){return _ELYSIUM.diag.cacheListAssets(w);}
function DIAG_ELYSIUM_TOKEN_PRICE(t){return _ELYSIUM.diag.tokenPrice(t);}
function DIAG_ELYSIUM_NATIVE_PRICE(){return _ELYSIUM.diag.nativePrice();}
function DIAG_ELYSIUM_WALLET(w){return _ELYSIUM.diag.walletFull(w);}
function DIAG_ELYSIUM_CACHE_STATS(){return _ELYSIUM.diag.cacheStats();}
function DIAG_ELYSIUM_CLEAR_CACHE(w,c){return _ELYSIUM.diag.clearCache(w,c);}
