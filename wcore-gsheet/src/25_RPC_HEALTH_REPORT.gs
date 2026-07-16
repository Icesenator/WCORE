/************************************************************
 * 25_RPC_HEALTH_REPORT.gs - Global RPC Health Report (v4.12.0)
 * 
 * Fournit une vue d'ensemble de la sante de tous les RPCs
 * et des metriques de performance par chaine.
 * 
 * FONCTIONS PRINCIPALES:
 * - GET_ALL_RPC_HEALTH() - Tableau de tous les scores RPC
 * - GET_LOW_HEALTH_CHAINS() - Chaines avec score < 80
 * - GET_CACHE_VERSION_REPORT() - Verification des versions cache
 * - GET_CHAIN_PERFORMANCE_SUMMARY() - Resume des performances
 * 
 * v4.12.0 - Creation initiale
 ************************************************************/
var RPC_HEALTH_REPORT_VERSION = "4.12.0";

// ============================================================
// RPC HEALTH AGGREGATION
// ============================================================

/**
 * Get RPC health scores for all registered chains
 * Usage: =GET_ALL_RPC_HEALTH()
 * 
 * @returns {Array} Table with chain, score, primary RPC, endpoint count
 * @customfunction
 */
function GET_ALL_RPC_HEALTH() {
 var out = [["Chain", "VM", "RPC Score", "Health Score", "Primary RPC", "Endpoints", "Profile"]];
 
 // EVM Chains
 var evmChains = _getRpcHealthEvmChains();
 for (var i = 0; i < evmChains.length; i++) {
 var row = _getChainHealthRow(evmChains[i], "EVM");
 if (row) out.push(row);
 }
 
 // SVM Chains
 var svmChains = _getRpcHealthSvmChains();
 for (var j = 0; j < svmChains.length; j++) {
 var row2 = _getChainHealthRow(svmChains[j], "SVM");
 if (row2) out.push(row2);
 }
 
 // COSMOS Chains
 var cosmosChains = _getRpcHealthCosmosChains();
 for (var k = 0; k < cosmosChains.length; k++) {
 var row3 = _getChainHealthRow(cosmosChains[k], "COSMOS");
 if (row3) out.push(row3);
 }
 
 return out;
}

/**
 * Get chains with RPC health below threshold
 * Usage: =GET_LOW_HEALTH_CHAINS(80)
 * 
 * @param {number} threshold - Minimum acceptable score (default 80)
 * @returns {Array} Table of chains below threshold
 * @customfunction
 */
function GET_LOW_HEALTH_CHAINS(threshold) {
 threshold = threshold || 80;
 var all = GET_ALL_RPC_HEALTH();
 var out = [all[0]]; // Header
 
 for (var i = 1; i < all.length; i++) {
 var rpcScore = Number(all[i][2]) || 0;
 var healthScore = Number(all[i][3]) || 0;
 if (rpcScore < threshold || healthScore < threshold) {
 out.push(all[i]);
 }
 }
 
 return out;
}

// ============================================================
// CACHE VERSION VERIFICATION
// ============================================================

/**
 * Verify CACHE_VERSION consistency across all chains
 * Usage: =GET_CACHE_VERSION_REPORT()
 * 
 * @returns {Array} Table showing version consistency
 * @customfunction
 */
function GET_CACHE_VERSION_REPORT() {
 var out = [["Chain", "VM", "Declared Version", "Expected Version", "Status"]];
 
 var expected = {
 EVM: (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined' && WCORE_VM_CACHE_VERSIONS.EVM) ? WCORE_VM_CACHE_VERSIONS.EVM : 63,
 SVM: (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined' && WCORE_VM_CACHE_VERSIONS.SVM) ? WCORE_VM_CACHE_VERSIONS.SVM : 64,
 COSMOS: (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined' && WCORE_VM_CACHE_VERSIONS.COSMOS) ? WCORE_VM_CACHE_VERSIONS.COSMOS : 67
 };
 
 // Check all registered chains
 var chains = _getAllRegisteredChains();
 for (var i = 0; i < chains.length; i++) {
 var chain = chains[i];
 try {
 var cfg = chain.obj.getConfig ? chain.obj.getConfig() : null;
 var declared = cfg ? cfg.CACHE_VERSION : "N/A";
 var exp = expected[chain.vm] || 63;
 var status = (declared === exp) ? "OK" : (declared > exp ? "BUMPED" : "OUTDATED");
 out.push([chain.name, chain.vm, declared, exp, status]);
 } catch (e) {
 out.push([chain.name, chain.vm, "ERROR", expected[chain.vm], e.message.substring(0, 30)]);
 }
 }
 
 return out;
}

// ============================================================
// PERFORMANCE SUMMARY
// ============================================================

/**
 * Get performance summary across all chains
 * Usage: =GET_CHAIN_PERFORMANCE_SUMMARY()
 * 
 * @returns {Array} Summary statistics
 * @customfunction
 */
function GET_CHAIN_PERFORMANCE_SUMMARY() {
 var out = [
 ["Metric", "Value", "Details"],
 ["Report Date", Format.now(), ""],
 ["WCORE Version", typeof WCORE_VERSION !== 'undefined' ? WCORE_VERSION.toString() : "N/A", ""],
 ["", "", ""]
 ];
 
 // Count chains by VM
 var evmCount = _getRpcHealthEvmChains().length;
 var svmCount = _getRpcHealthSvmChains().length;
 var cosmosCount = _getRpcHealthCosmosChains().length;
 var total = evmCount + svmCount + cosmosCount;
 
 out.push(["Total Chains", total, ""]);
 out.push(["EVM Chains", evmCount, ""]);
 out.push(["SVM Chains", svmCount, ""]);
 out.push(["COSMOS Chains", cosmosCount, ""]);
 out.push(["", "", ""]);
 
 // Cache versions
 out.push(["Cache Versions", "", ""]);
 out.push(["EVM Default", (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined' && WCORE_VM_CACHE_VERSIONS.EVM) ? WCORE_VM_CACHE_VERSIONS.EVM : 63, ""]);
 out.push(["SVM Default", (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined' && WCORE_VM_CACHE_VERSIONS.SVM) ? WCORE_VM_CACHE_VERSIONS.SVM : 64, ""]);
 out.push(["COSMOS Default", (typeof WCORE_VM_CACHE_VERSIONS !== 'undefined' && WCORE_VM_CACHE_VERSIONS.COSMOS) ? WCORE_VM_CACHE_VERSIONS.COSMOS : 67, ""]);
 
 return out;
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Get health row for a single chain
 * @private
 */
function _getChainHealthRow(chainInfo, vmType) {
 try {
 var cfg = chainInfo.obj.getConfig ? chainInfo.obj.getConfig() : null;
 if (!cfg) return [chainInfo.name, vmType, "N/A", "N/A", "No config", 0, "N/A"];
 
 var rpcScore = 100;
 var healthScore = 100;
 var profile = "N/A";
 var primaryRpc = "N/A";
 var endpointCount = 0;
 
 // Get RPC endpoints
 if (cfg.RPC && cfg.RPC.ENDPOINTS) {
 endpointCount = cfg.RPC.ENDPOINTS.length;
 primaryRpc = cfg.RPC.ENDPOINTS[0] || "N/A";
 if (primaryRpc.length > 45) {
 primaryRpc = primaryRpc.substring(0, 42) + "...";
 }
 } else if (cfg.API && cfg.API.REST_URL) {
 // Cosmos
 primaryRpc = cfg.API.REST_URL;
 endpointCount = 1;
 }
 
 // Try to get actual health score from RpcHealth
 try {
 if (typeof RpcHealth !== 'undefined' && RpcHealth.getScore) {
 var score = RpcHealth.getScore(cfg);
 if (score != null) rpcScore = score;
 }
 } catch (e) {}
 
 // Get profile from budget system
 try {
 if (typeof DynamicBudget !== 'undefined' && DynamicBudget.getProfile) {
 profile = DynamicBudget.getProfile(cfg) || "DEFAULT";
 }
 } catch (e) {}
 
 return [chainInfo.name, vmType, rpcScore, healthScore, primaryRpc, endpointCount, profile];
 } catch (e) {
 return [chainInfo.name, vmType, "ERR", "ERR", e.message.substring(0, 30), 0, "ERR"];
 }
}

/**
 * Get list of EVM chain references
 * @private
 */
function _getRpcHealthEvmChains() {
 var chains = [];
 
 // List of known EVM chain variable names
 var evmNames = [
 "ABSTRACT", "ANCIENT8", "APECHAIN", "APPCHAIN", "ARBITRUM_NOVA", "ARBITRUM_ONE",
 "ASTAR", "AURORA", "AVALANCHE", "B2", "B3", "BASE", "BEAM", "BERACHAIN",
 "BITLAYER", "BLAST", "BOB", "BOBA", "BOTANIX", "BSC", "CAMP", "CELO", "CORN",
 "CRONOS", "CYBER", "DBK_CHAIN", "DOMA", "DUCKCHAIN", "ETHEREUM", "ETHERLINK",
 "FLARE", "FLOW", "FRAXTAL", "FUSE", "GEB", "GNOSIS", "GRAVITY", "HASHKEY",
 "HEMI", "IMMUTABLE", "INK", "INTUITION", "KAIA", "KATANA", "KCC", "LINEA",
 "LISK", "MANTA_PACIFIC", "MANTLE", "MATCHAIN", "MERLIN", "METAL_L2", "METIS",
 "MEZO", "MITOSIS", "MODE", "MONAD", "MOONBEAM", "MOONRIVER",
 "MORPH", "OPBNB", "OPENLEDGER", "OPTIMISM", "PLASMA", "PLUME", "POLYGON",
 "POLYGON_ZKEVM", "POLYNOMIAL", "PULSECHAIN", "RACE",
 "REYA", "RONIN", "ROOTSTOCK", "SCROLL", "SEI", "SHAPE", "SHIBARIUM",
 "SOMNIA", "SONEIUM", "SONIC", "STABLE", "STORY", "SUPERPOSITION", "SUPERSEED",
 "SWAN", "SWELLCHAIN", "SYNDICATE_COMMONS", "TAC", "TAIKO_ALETHIA", "UNICHAIN",
 "VANA", "WORLDCHAIN", "X_LAYER", "XRPLEVM", "ZETACHAIN", "ZIRCUIT",
 "ZKLINKNOVA", "ZKSYNC_ERA", "ZORA"
 ];
 
 for (var i = 0; i < evmNames.length; i++) {
 var varName = "_" + evmNames[i];
 try {
 var obj = eval(varName);
 if (obj && obj.getConfig) {
 chains.push({ name: evmNames[i], obj: obj });
 }
 } catch (e) {}
 }
 
 return chains;
}

/**
 * Get list of SVM chain references
 * @private
 */
function _getRpcHealthSvmChains() {
 var chains = [];
 var svmNames = ["SOLANA", "FOGO"];
 
 for (var i = 0; i < svmNames.length; i++) {
 var varName = "_" + svmNames[i];
 try {
 var obj = eval(varName);
 if (obj && obj.getConfig) {
 chains.push({ name: svmNames[i], obj: obj });
 }
 } catch (e) {}
 }
 
 return chains;
}

/**
 * Get list of COSMOS chain references
 * @private
 */
function _getRpcHealthCosmosChains() {
 var chains = [];
 var cosmosNames = ["TERRA", "OSMOSIS", "COSMOS_HUB", "INJECTIVE"];
 
 for (var i = 0; i < cosmosNames.length; i++) {
 var varName = "_" + cosmosNames[i];
 try {
 var obj = eval(varName);
 if (obj && obj.getConfig) {
 chains.push({ name: cosmosNames[i], obj: obj });
 }
 } catch (e) {}
 }
 
 return chains;
}

function _getRpcHealthTonChains() {
 var chains = [];
 try {
  if (typeof _TON !== "undefined" && _TON && _TON.getConfig) chains.push({ name: "TON", obj: _TON });
 } catch (e) {}
 return chains;
}

/**
 * Get all registered chains
 * @private
 */
function _getAllRegisteredChains() {
 var all = [];
 
 var evm = _getRpcHealthEvmChains();
 for (var i = 0; i < evm.length; i++) {
 all.push({ name: evm[i].name, obj: evm[i].obj, vm: "EVM" });
 }
 
 var svm = _getRpcHealthSvmChains();
 for (var j = 0; j < svm.length; j++) {
 all.push({ name: svm[j].name, obj: svm[j].obj, vm: "SVM" });
 }
 
  var cosmos = _getRpcHealthCosmosChains();
  for (var k = 0; k < cosmos.length; k++) {
  all.push({ name: cosmos[k].name, obj: cosmos[k].obj, vm: "COSMOS" });
  }

  var ton = _getRpcHealthTonChains();
  for (var t = 0; t < ton.length; t++) {
  all.push({ name: ton[t].name, obj: ton[t].obj, vm: "TON" });
  }
  
  return all;
}
