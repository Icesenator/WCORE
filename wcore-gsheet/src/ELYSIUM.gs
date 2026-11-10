/**
 * ELYSIUM.gs - Elysium Mainnet (Vulcan Forged, chainId 1339)
 * ChainFactory pattern with explicit function declarations
 *
 * Verifie le 2026-11-10 (RPC en direct) :
 *  - rpc.elysiumchain.tech et 1339.rpc.thirdweb.com repondent eth_chainId = 0x53b = 1339,
 *    blocs frais (~6 s). elysium-rpc.vulcanforged.com et explorer.elysiumchain.tech ne
 *    resolvent plus ; rpc.elysiumchain.us repond 503 : non retenus.
 *  - eth_getLogs : plage de 1 000 blocs acceptee, 5 000 blocs refusee (timeout 10 s du RPC).
 *    D'ou MAX_LOG_RANGE = 1000 (meme reglage que Somnia, TAC, B3, Citrea). LIMITE CONNUE : la
 *    decouverte de tokens par journaux ne couvre que les ~1 000 derniers blocs (~1 h 40) ; un
 *    transfert ERC-20 plus ancien que la fenetre et anterieur au premier scan n est pas
 *    decouvert. Le solde natif LAVA (eth_getBalance) reste exact. L explorateur Blockscout est
 *    auto-heberge (hors Blockscout Pro API) : il ne sert pas encore a la decouverte.
 *  - Explorateur Blockscout v2 : https://elysiumscan.com (blockscout.elysiumchain.tech y redirige).
 *  - Natif : LAVA, 18 decimales (registre chainlist, chainId 1339).
 *
 * PRIX : aucune source fiable. Ne PAS renseigner NATIVE_GECKO_ID / NATIVE_LLAMA_ID / DEX_SLUG /
 * GT_NETWORK : CoinGecko "lava-network" est un autre projet (Lava Network) ; le reseau
 * "elysium" de DexScreener est l Elysium de Kinetiq (chainId 99801, gaz HYPE) ; GeckoTerminal
 * "elysium" n a aucun pool. Le solde LAVA est donc affiche sans valeur (UNKNOWN), jamais
 * valorise a un prix emprunte.
 *
 * Ne pas confondre avec Elysium Testnet (1338) ni avec l Elysium de Kinetiq (99801).
 */

var _ELYSIUM = ChainFactory.createEvmChain("ELYSIUM", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.elysiumchain.tech", "https://1339.rpc.thirdweb.com"], MAX_LOG_RANGE: 1000 },
 CHAIN: {
 NAME: "Elysium",
 CHAIN_ID: 1339,
 NATIVE_SYMBOL: "LAVA",
 NATIVE_NAME: "LAVA",
 NATIVE_DECIMALS: 18
 }
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
