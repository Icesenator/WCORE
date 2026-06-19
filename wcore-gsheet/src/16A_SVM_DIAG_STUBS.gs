/************************************************************
 * 16A_SVM_DIAG_STUBS.gs - SVM Diagnostic Stubs Factory (v4.12.0)
 * 
 * Centralise les fonctions diagnostic placeholder pour les chaines SVM.
 * Ces fonctions retournent des messages explicatifs car SVM n'utilise
 * pas les memes diagnostics que EVM.
 * 
 * Usage dans les fichiers chaine (ex: SOLANA.gs):
 * function DIAG_SOLANA_COMPARE_RPCS(w,t){return SvmDiagStubs.compareRpcs("SOLANA");}
 * function DIAG_SOLANA_CHECK_ERC20(t){return SvmDiagStubs.checkErc20();}
 * 
 * v4.12.0 - Creation du fichier pour factoriser le code duplique
 * - Reduit ~50 lignes par fichier SVM
 * - Pattern identique a CosmosDiagStubs
 ************************************************************/

var SvmDiagStubs = SvmDiagStubs || {};

// ============================================================
// HELPERS
// ============================================================

/**
 * Header standard pour toutes les reponses diagnostic
 */
SvmDiagStubs._header = function() {
 return ["Metric", "Value", "Details"];
};

/**
 * Reponse standard "Not supported"
 */
SvmDiagStubs._notSupported = function(reason) {
 return [this._header(), ["Info", "Not supported", reason || ""]];
};

/**
 * Reponse standard "Not applicable"
 */
SvmDiagStubs._notApplicable = function(reason) {
 return [this._header(), ["Info", "Not applicable", reason || ""]];
};

/**
 * Reponse standard "Use function X"
 */
SvmDiagStubs._useFunction = function(funcName) {
 return [this._header(), ["Info", "Use " + funcName, ""]];
};

// ============================================================
// STUB FUNCTIONS
// ============================================================

/**
 * DIAG_*_COMPARE_RPCS - RPC comparison (not supported for SVM)
 * @param {string} chainName - Optional chain name for context
 */
SvmDiagStubs.compareRpcs = function(chainName) {
 var msg = chainName ? "Use DIAG_" + chainName + "_WALLET" : "Use DIAG_*_WALLET";
 return [this._header(), ["Info", "Not supported for SVM", msg]];
};

/**
 * DIAG_*_CHECK_ERC20 - ERC20 check (N/A for SVM - uses SPL tokens)
 */
SvmDiagStubs.checkErc20 = function() {
 return this._notApplicable("SPL tokens use mint addresses");
};

/**
 * DIAG_*_CACHE - Cache diagnostic
 * @param {string} chainName - Name of the chain for function reference
 */
SvmDiagStubs.cache = function(chainName) {
 return this._useFunction("CACHED_WALLET_ASSETS_" + chainName);
};

/**
 * DIAG_*_CACHE_TOKEN - Cache token diagnostic (not supported for SVM)
 */
SvmDiagStubs.cacheToken = function() {
 return this._notSupported("SVM stores full assets");
};

/**
 * DIAG_*_CACHE_ASSETS - Cache assets diagnostic
 * @param {string} chainName - Name of the chain for function reference
 */
SvmDiagStubs.cacheAssets = function(chainName) {
 return this._useFunction("CACHED_WALLET_ASSETS_" + chainName);
};

/**
 * DIAG_*_CLEAR_CACHE - Clear cache (not supported via function)
 */
SvmDiagStubs.clearCache = function() {
 return [this._header(), ["Info", "Not supported", "Clear manually via Properties"]];
};

// ============================================================
// BATCH GENERATOR
// ============================================================

/**
 * Returns the list of all stub function names
 * Useful for generating documentation or tests
 */
SvmDiagStubs.listStubNames = function() {
 return [
 "compareRpcs",
 "checkErc20",
 "cache",
 "cacheToken",
 "cacheAssets",
 "clearCache"
 ];
};

/**
 * Generate all DIAG function declarations for a chain
 * @param {string} chainName - Upper case chain name (e.g., "SOLANA")
 * @param {string} varName - Variable name (e.g., "_SOLANA")
 * @returns {string} Code snippet for DIAG functions
 */
SvmDiagStubs.generateDiagCode = function(chainName, varName) {
 var lines = [
 "// Diagnostic functions (using SvmDiagStubs)",
 "function DIAG_" + chainName + "_TOKEN(w,t,r){return " + varName + ".diag.tokenMeta(t);}",
 "function DIAG_" + chainName + "_COMPARE_RPCS(w,t){return SvmDiagStubs.compareRpcs('" + chainName + "');}",
 "function DIAG_" + chainName + "_CHECK_ERC20(t){return SvmDiagStubs.checkErc20();}",
 "function DIAG_" + chainName + "_RPC_HEALTH(){return " + varName + ".diag.rpcHealth();}",
 "function DIAG_" + chainName + "_NATIVE_BALANCE(w,r){return " + varName + ".diag.nativeBalance(w,r);}",
 "function DIAG_" + chainName + "_CACHE(w){return SvmDiagStubs.cache('" + chainName + "');}",
 "function DIAG_" + chainName + "_CACHE_TOKEN(w,t){return SvmDiagStubs.cacheToken();}",
 "function DIAG_" + chainName + "_CACHE_ASSETS(w){return SvmDiagStubs.cacheAssets('" + chainName + "');}",
 "function DIAG_" + chainName + "_TOKEN_PRICE(t){return " + varName + ".diag.tokenPrice(t);}",
 "function DIAG_" + chainName + "_NATIVE_PRICE(){return " + varName + ".diag.nativePrice();}",
 "function DIAG_" + chainName + "_WALLET(w,r){return " + varName + ".diag.wallet(w,r);}",
 "function DIAG_" + chainName + "_CACHE_STATS(){return " + varName + ".diag.cacheStats();}",
 "function DIAG_" + chainName + "_CLEAR_CACHE(w,c){return SvmDiagStubs.clearCache();}"
 ];
 return lines.join("\n");
};
