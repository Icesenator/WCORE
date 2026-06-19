/************************************************************
 * 16_COSMOS_DIAG_STUBS.gs - Cosmos Diagnostic Stubs Factory (v4.11.2)
 * 
 * Centralise les fonctions diagnostic placeholder pour les chaines Cosmos.
 * Ces fonctions retournent des messages explicatifs car Cosmos n'utilise
 * pas les memes diagnostics que EVM.
 * 
 * Usage dans les fichiers chaine (ex: TERRA.gs):
 * function DIAG_TERRA_TOKEN(w,t,r){return CosmosDiagStubs.token();}
 * function DIAG_TERRA_RPC_HEALTH(){return CosmosDiagStubs.rpcHealth();}
 * 
 * v4.11.2 - Creation du fichier pour factoriser le code mort
 ************************************************************/

var CosmosDiagStubs = {
 
 /**
 * Header standard pour toutes les reponses diagnostic
 */
 _header: function() {
 return ["Metric", "Value", "Details"];
 },
 
 /**
 * Reponse standard "Not supported"
 */
 _notSupported: function(reason) {
 return [this._header(), ["Info", "Not supported", reason || ""]];
 },
 
 /**
 * Reponse standard "Not applicable"
 */
 _notApplicable: function(reason) {
 return [this._header(), ["Info", "Not applicable", reason || ""]];
 },
 
 /**
 * Reponse standard "Use function X"
 */
 _useFunction: function(funcName) {
 return [this._header(), ["Info", "Use " + funcName, ""]];
 },
 
 // ============================================================
 // STUB FUNCTIONS
 // ============================================================
 
 /**
 * DIAG_*_TOKEN - Token diagnostic
 */
 token: function() {
 return this._notSupported("No Cosmos Diagnostic module");
 },
 
 /**
 * DIAG_*_COMPARE_RPCS - RPC comparison
 */
 compareRpcs: function() {
 return this._notSupported("");
 },
 
 /**
 * DIAG_*_CHECK_ERC20 - ERC20 check (N/A for Cosmos)
 */
 checkErc20: function() {
 return this._notApplicable("Cosmos uses denoms");
 },
 
 /**
 * DIAG_*_RPC_HEALTH - RPC health check
 */
 rpcHealth: function() {
 return this._notSupported("");
 },
 
 /**
 * DIAG_*_NATIVE_BALANCE - Native balance check
 * @param {string} chainName - Name of the chain for function reference
 */
 nativeBalance: function(chainName) {
 return this._useFunction("GET_WALLET_ASSETS_" + chainName);
 },
 
 /**
 * DIAG_*_CACHE - Cache diagnostic
 * @param {string} chainName - Name of the chain for function reference
 */
 cache: function(chainName) {
 return this._useFunction("CACHED_WALLET_ASSETS_" + chainName);
 },
 
 /**
 * DIAG_*_CACHE_TOKEN - Cache token diagnostic
 */
 cacheToken: function() {
 return this._notSupported("");
 },
 
 /**
 * DIAG_*_CACHE_ASSETS - Cache assets diagnostic
 * @param {string} chainName - Name of the chain for function reference
 */
 cacheAssets: function(chainName) {
 return this._useFunction("CACHED_WALLET_ASSETS_" + chainName);
 },
 
 /**
 * DIAG_*_TOKEN_PRICE - Token price diagnostic
 */
 tokenPrice: function() {
 return this._notSupported("");
 },
 
 /**
 * DIAG_*_NATIVE_PRICE - Native price diagnostic
 * Delegates to Diagnostic.nativePrice if available
 * @param {Object} config - Chain config from _CHAIN.getConfig()
 */
 nativePrice: function(config) {
 if (typeof Diagnostic !== "undefined" && Diagnostic.nativePrice) {
 return Diagnostic.nativePrice(config);
 }
 return this._notSupported("");
 },
 
 /**
 * DIAG_*_WALLET - Wallet diagnostic
 */
 wallet: function() {
 return this._notSupported("");
 },
 
 /**
 * DIAG_*_CACHE_STATS - Cache stats diagnostic
 * @param {string} chainName - Name of the chain for function reference
 */
 cacheStats: function(chainName) {
 return this._useFunction(chainName + "_STATS");
 },
 
 /**
 * DIAG_*_CLEAR_CACHE - Clear cache diagnostic
 */
 clearCache: function() {
 return [this._header(), ["Info", "Not supported", "Clear manually"]];
 },
 
 // ============================================================
 // BATCH GENERATOR (for documentation purposes)
 // ============================================================
 
 /**
 * Returns the list of all stub function names
 * Useful for generating documentation or tests
 */
 listStubNames: function() {
 return [
 "token",
 "compareRpcs",
 "checkErc20",
 "rpcHealth",
 "nativeBalance",
 "cache",
 "cacheToken",
 "cacheAssets",
 "tokenPrice",
 "nativePrice",
 "wallet",
 "cacheStats",
 "clearCache"
 ];
 }
};
