/************************************************************
 * 13_DIAGNOSTIC.gs - Fonctions de diagnostic (Multi-chain)
 * 
 * Version: v4.15.73
 * 
 * Integre Multi-chain - utilise les helpers existants
 * Fonctions generiques qui prennent CONFIG en parametre
 * 
 * v4.15.73 - Added WCORE_EMERGENCY_PURGE_NOW admin purge diagnostic
 * v4.15.31 - Added DIAG_CACHE_INTEGRITY packed wallet cache audit
 * v4.15.30 - Added QUOTA_RESET_READINESS_CHECK dashboard
 * v4.12.3 - Added DIAG_DECIMALS and REPAIR_DECIMALS functions
 * - Detect balances corrupted by incorrect decimal conversion
 * - Auto-repair by fetching fresh balances with correct decimals
 * v4.9.1 - Added GET_SYSTEM_HEALTH dashboard
 * v4.4.0 - Initial multi-chain support
 * 
 * Usage dans les fichiers chain:
 * function DIAG_BASE_TOKEN(wallet, token) {
 * return Diagnostic.tokenBalance(CONFIG_BASE, wallet, token);
 * }
 ************************************************************/
var DIAGNOSTIC_VERSION = "4.15.73";

// ============================================================
// DIAGNOSTIC - Module principal
// ============================================================

var Diagnostic = {
 
 // Version du module
 VERSION: "4.9.1",
 
 // ============================================================
 // SYSTEM HEALTH DASHBOARD (v4.9.1)
 // ============================================================
 
 /**
 * Vue d'ensemble de la sante du systeme WCORE
 * Combine toutes les metriques importantes en un seul dashboard
 * 
 * @returns {Array} Tableau 2D pour Google Sheets
 */
 systemHealth: function() {
 var output = [
 ['Category', 'Metric', 'Value', 'Status', 'Details']
 ];
 
 var now = new Date();
 output.push(['System', 'Timestamp', Utilities.formatDate(now, 'GMT', 'yyyy-MM-dd HH:mm:ss'), '', '']);
 output.push(['System', 'Version', WCORE_VERSION.toString(), '', '']);
 output.push(['', '', '', '', '']);
 
 // ============================================================
 // CACHE METRICS
 // ============================================================
 
 try {
 var cacheSize = this._getCacheSize();
 var cacheKeys = this._countCacheKeys();
 var cacheStatus = cacheSize < 400 ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢EURÃ…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ OK' : (cacheSize < 480 ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ WARNING' : 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦aEURÃƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ CRITICAL');
 
 output.push(['Cache', 'Total Size', cacheSize.toFixed(2) + ' KB', cacheStatus, '500 KB limit']);
 output.push(['Cache', 'Total Keys', cacheKeys, '', '']);
 output.push(['Cache', 'Usage %', ((cacheSize / 500) * 100).toFixed(1) + '%', '', '']);
 
 // Cache hit rate (si disponible)
 if (typeof CacheManager !== 'undefined' && CacheManager.getHitRate) {
 try {
 var hitRate = CacheManager.getHitRate();
 output.push(['Cache', 'Hit Rate', hitRate.toFixed(1) + '%', '', 'Last 100 requests']);
 } catch(e) {}
 }
 
 } catch(e) {
 output.push(['Cache', 'Error', e.message, 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº" ERROR', '']);
 }
 
 output.push(['', '', '', '', '']);
 
 // ============================================================
 // HTTP BUDGET METRICS
 // ============================================================
 
 try {
 if (typeof HttpBudget !== 'undefined' && HttpBudget.getStats) {
 var httpStats = HttpBudget.getStats();
 var httpStatus = httpStats.usagePercent < 80 ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢EURÃ…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ OK' : (httpStats.usagePercent < 95 ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ WARNING' : 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦aEURÃƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ CRITICAL');
 
 output.push(['HTTP', 'Daily Usage', httpStats.dailyCount, httpStatus, httpStats.remaining + ' remaining']);
 output.push(['HTTP', 'Usage %', httpStats.usagePercent.toFixed(1) + '%', '', '']);
 output.push(['HTTP', 'Daily Limit', httpStats.dailyLimit || 18000, '', 'Conservative limit']);
 
 if (httpStats.errorCount) {
 output.push(['HTTP', 'Errors 24h', httpStats.errorCount, '', '']);
 }
 } else {
 output.push(['HTTP', 'Status', 'Not tracked', '', 'HttpBudget not loaded']);
 }
 } catch(e) {
 output.push(['HTTP', 'Error', e.message, 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº" ERROR', '']);
 }
 
 output.push(['', '', '', '', '']);
 
 // ============================================================
 // RPC HEALTH
 // ============================================================
 
 try {
 var rpcStats = this._getRpcHealth();
 output.push(['RPC', 'Total Endpoints', rpcStats.total, '', '']);
 output.push(['RPC', 'Healthy', rpcStats.healthy, rpcStats.healthy > 0 ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢EURÃ…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ OK' : 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦aEURÃƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ CRITICAL', '']);
 output.push(['RPC', 'Degraded', rpcStats.degraded, rpcStats.degraded > 3 ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ WARNING' : '', '']);
 output.push(['RPC', 'Failed', rpcStats.failed, rpcStats.failed > 5 ? 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â¹ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦aEURÃƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ CRITICAL' : '', '']);
 } catch(e) {
 output.push(['RPC', 'Error', e.message, 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº" ERROR', '']);
 }
 
 output.push(['', '', '', '', '']);
 
 // ============================================================
 // PRICING SOURCES
 // ============================================================
 
 try {
 var priceStats = this._getPriceSourceStats();
 output.push(['Pricing', 'DexScreener', priceStats.dex + ' cached', '', 'Primary source']);
 output.push(['Pricing', 'DefiLlama', priceStats.llama + ' cached', '', 'Native tokens']);
 output.push(['Pricing', 'GeckoTerminal', priceStats.gecko + ' cached', '', 'Fallback']);
 output.push(['Pricing', 'Total Cached', priceStats.total + ' prices', '', '']);
 } catch(e) {
 output.push(['Pricing', 'Error', e.message, 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âº" ERROR', '']);
 }
 
 output.push(['', '', '', '', '']);
 
 // ============================================================
 // PERFORMANCE METRICS
 // ============================================================
 
 try {
 var perfStats = this._getPerformanceStats();
 output.push(['Performance', 'Avg Exec Time', perfStats.avgExecTime + ' ms', '', 'Last 10 calls']);
 output.push(['Performance', 'Slowest Chain', perfStats.slowestChain, '', perfStats.slowestTime + ' ms']);
 output.push(['Performance', 'Fastest Chain', perfStats.fastestChain, '', perfStats.fastestTime + ' ms']);
 } catch(e) {
 output.push(['Performance', 'Error', e.message, '', '']);
 }
 
 return output;
 },
 
 // ============================================================
 // HELPER FUNCTIONS FOR SYSTEM HEALTH
 // ============================================================
 
 _getCacheSize: function() {
 var props = PropertiesService.getScriptProperties();
 var keys = props.getKeys();
 var totalSize = 0;
 
 keys.forEach(function(key) {
 try {
 var value = props.getProperty(key);
 totalSize += new Blob([value]).size;
 } catch(e) {}
 });
 
 return totalSize / 1024; // KB
 },
 
 _countCacheKeys: function() {
 try {
 return PropertiesService.getScriptProperties().getKeys().length;
 } catch(e) {
 return 0;
 }
 },
 
 _getRpcHealth: function() {
 var stats = { total: 0, healthy: 0, degraded: 0, failed: 0 };
 
 // Compter les RPC de toutes les chaÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â®nes configurees
 // (simplifie - pourrait ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªtre ameliore avec un registre global)
 try {
 var props = PropertiesService.getScriptProperties();
 var keys = props.getKeys();
 
 keys.forEach(function(key) {
 if (key.indexOf('_RPC_HEALTH_') !== -1 || key.indexOf('rpc_health_') !== -1) {
 try {
 var data = JSON.parse(props.getProperty(key));
 stats.total++;
 
 if (data.status === 'healthy') stats.healthy++;
 else if (data.status === 'degraded') stats.degraded++;
 else stats.failed++;
 } catch(e) {}
 }
 });
 } catch(e) {}
 
 return stats;
 },
 
 _getPriceSourceStats: function() {
 var stats = { dex: 0, llama: 0, gecko: 0, total: 0 };
 
 try {
 var props = PropertiesService.getScriptProperties();
 var keys = props.getKeys();
 
 keys.forEach(function(key) {
 if (key.indexOf('price_dex_') !== -1) stats.dex++;
 else if (key.indexOf('price_llama_') !== -1) stats.llama++;
 else if (key.indexOf('price_gecko') !== -1) stats.gecko++;
 });
 
 stats.total = stats.dex + stats.llama + stats.gecko;
 } catch(e) {}
 
 return stats;
 },
 
 _getPerformanceStats: function() {
 // Statistiques simplifiees - pourrait ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ‚Â aEURÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬aÃƒÂ¢EURÃ…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢EURÃ¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢aÃƒÂ¢EURÃ…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢aEURÃƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢EURÃ…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªtre ameliore avec un systeme de tracking
 var stats = {
 avgExecTime: 'N/A',
 slowestChain: 'N/A',
 slowestTime: 'N/A',
 fastestChain: 'N/A',
 fastestTime: 'N/A'
 };
 
 try {
 var props = PropertiesService.getScriptProperties();
 var perfData = props.getProperty('wcore_perf_stats');
 
 if (perfData) {
 var data = JSON.parse(perfData);
 stats.avgExecTime = data.avgExecTime || 'N/A';
 stats.slowestChain = data.slowestChain || 'N/A';
 stats.slowestTime = data.slowestTime || 'N/A';
 stats.fastestChain = data.fastestChain || 'N/A';
 stats.fastestTime = data.fastestTime || 'N/A';
 }
 } catch(e) {}
 
 return stats;
 },
 
 // ============================================================
 // TOKEN BALANCE
 // ============================================================
 
 /**
 * Diagnostic complet de la balance d'un token
 * 
 * @param {Object} config - Configuration de la chain
 * @param {string} wallet - Adresse du wallet
 * @param {string} token - Adresse du contrat token
 * @param {string} customRpc - RPC personnalise (optionnel)
 * @returns {Array} Table de diagnostic
 */
 tokenBalance: function(config, wallet, token, customRpc) {
 var out = [["Step", "Result", "Details"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 
 try {
 out.push(["Chain", chainName, "ID: " + (config.CHAIN.CHAIN_ID || "?")]);
 
 // Normalisation
 var walletAddr = Addr.normalize(wallet);
 var tokenAddr = Addr.normalize(token);
 
 out.push(["Wallet", this._shorten(walletAddr), Addr.isValid(walletAddr) ? "[OK] Valid" : "[X] Invalid"]);
 out.push(["Token", this._shorten(tokenAddr), Addr.isValid(tokenAddr) ? "[OK] Valid" : "[X] Invalid"]);
 
 if (!Addr.isValid(walletAddr) || !Addr.isValid(tokenAddr)) {
 out.push(["STOPPED", "Invalid address(es)", ""]);
 return out;
 }
 
 // Preparer les RPCs
 var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
 var rpcs = endpoints.slice();
 if (customRpc && String(customRpc).trim()) {
 rpcs.unshift(String(customRpc).trim());
 }
 
 if (!rpcs.length) {
 out.push(["ERROR", "No RPCs configured", ""]);
 return out;
 }
 
 // balanceOf(address) selector is owned by BalanceFetcher
 var callData = BalanceFetcher.SELECTOR_BALANCE_OF + Addr.pad32(walletAddr);
 out.push(["Call Data", callData.substring(0, 30) + "...", "balanceOf(wallet)"]);
 out.push(["", "", ""]);
 
 // Tester chaque RPC
 for (var i = 0; i < Math.min(rpcs.length, 4); i++) {
 var rpcUrl = rpcs[i];
 var rpcName = this._rpcName(rpcUrl);
 
 out.push(["=== RPC " + (i + 1) + " ===", rpcName, ""]);
 
 try {
 var t0 = Date.now();
 
 // 1. Test balanceOf
 var balanceResult = this._rpcCall(rpcUrl, "eth_call", [{ to: tokenAddr, data: callData }, "latest"], config);
 var latency = Date.now() - t0;
 
 if (balanceResult.error) {
 out.push(["balanceOf()", "[X] ERROR", String(balanceResult.error).substring(0, 40)]);
 out.push(["Latency", latency + "ms", ""]);
 continue;
 }
 
 var rawHex = balanceResult.result;
 out.push(["Latency", latency + "ms", ""]);
 out.push(["Raw Hex", rawHex ? rawHex.substring(0, 20) + "..." : "(null)", rawHex ? "len=" + rawHex.length : ""]);
 
 // Verifier si vide ou zero
 if (!rawHex || rawHex === "0x" || rawHex === "0x0" || /^0x0+$/.test(rawHex)) {
 out.push(["Balance", "0", "[!] Empty/Zero"]);
 continue;
 }
 
 // 2. Convertir en BigInt
 var rawBigInt;
 try {
 rawBigInt = BigInt(rawHex);
 var bigStr = rawBigInt.toString();
 out.push(["BigInt", bigStr.substring(0, 20) + (bigStr.length > 20 ? "..." : ""), "[OK] OK"]);
 } catch (e) {
 out.push(["BigInt", "[X] FAILED", e.message]);
 continue;
 }
 
 // 3. Recuperer decimals
 var decimals = (config.LIMITS && config.LIMITS.DECIMALS_FALLBACK) || 18;
 try {
 var decResult = this._rpcCall(rpcUrl, "eth_call", [{ to: tokenAddr, data: TokenMeta.SELECTOR_DECIMALS }, "latest"], config);
 if (decResult.result && decResult.result !== "0x" && !/^0x0+$/.test(decResult.result)) {
 var d = parseInt(decResult.result, 16);
 var maxDec = (config.LIMITS && config.LIMITS.DECIMALS_SANITY_MAX) || 36;
 if (!isNaN(d) && d >= 0 && d <= maxDec) decimals = d;
 }
 out.push(["Decimals", decimals, decResult.error ? "error" : "[OK]"]);
 } catch (e) {
 out.push(["Decimals", decimals + " (default)", "Exception"]);
 }
 
 // 4. Calculer la balance
 var balance = BigNum.toDecimal(rawBigInt, decimals);
 out.push(["BALANCE", balance, "[OK] SUCCESS"]);
 
 // 5. Recuperer symbol & name
 try {
 var symResult = this._rpcCall(rpcUrl, "eth_call", [{ to: tokenAddr, data: TokenMeta.SELECTOR_SYMBOL }, "latest"], config);
 if (symResult.result && symResult.result !== "0x") {
 var symbol = AbiDecode.decodeStringOrBytes32(symResult.result);
 out.push(["Symbol", symbol || "(decode failed)", ""]);
 }
 } catch (e) {}
 
 try {
 var nameResult = this._rpcCall(rpcUrl, "eth_call", [{ to: tokenAddr, data: TokenMeta.SELECTOR_NAME }, "latest"], config);
 if (nameResult.result && nameResult.result !== "0x") {
 var name = AbiDecode.decodeStringOrBytes32(nameResult.result);
 out.push(["Name", name || "(decode failed)", ""]);
 }
 } catch (e) {}
 
 if (balance > 0) {
 out.push(["STATUS", "[OK] TOKEN OK", "Balance = " + balance]);
 }
 
 } catch (e) {
 out.push(["EXCEPTION", "[X] " + e.message, ""]);
 }
 
 out.push(["", "", ""]);
 }
 
 } catch (e) {
 out.push(["FATAL ERROR", e.message, e.stack ? e.stack.substring(0, 100) : ""]);
 }
 
 return out;
 },
 
 /**
 * Compare la balance d'un token entre tous les RPCs
 */
 compareRpcs: function(config, wallet, token) {
 var out = [["RPC", "Latency", "Raw Hex", "Balance", "Status"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 
 var walletAddr = Addr.normalize(wallet);
 var tokenAddr = Addr.normalize(token);
 
 if (!Addr.isValid(walletAddr) || !Addr.isValid(tokenAddr)) {
 return [["ERROR", "", "Invalid address", "", ""]];
 }
 
 var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
 if (!endpoints.length) {
 return [["ERROR", "", "No RPCs configured", "", ""]];
 }
 
 var callData = BalanceFetcher.SELECTOR_BALANCE_OF + Addr.pad32(walletAddr);
 var decimals = (config.LIMITS && config.LIMITS.DECIMALS_FALLBACK) || 18;
 
 for (var i = 0; i < endpoints.length; i++) {
 var rpcUrl = endpoints[i];
 var rpcName = this._rpcName(rpcUrl);
 
 try {
 var t0 = Date.now();
 var result = this._rpcCall(rpcUrl, "eth_call", [{ to: tokenAddr, data: callData }, "latest"], config);
 var latency = Date.now() - t0;
 
 if (result.error) {
 out.push([rpcName, latency + "ms", "ERROR", "", String(result.error).substring(0, 20)]);
 continue;
 }
 
 var rawHex = result.result || "0x0";
 var balance = 0;
 var status = "?";
 
 if (!rawHex || rawHex === "0x" || /^0x0+$/.test(rawHex)) {
 status = "[!] Zero";
 } else {
 try {
 var big = BigInt(rawHex);
 balance = BigNum.toDecimal(big, decimals);
 status = balance > 0 ? "[OK] OK" : "[!] Zero";
 } catch (e) {
 status = "[X] Parse error";
 }
 }
 
 out.push([rpcName, latency + "ms", rawHex.substring(0, 18) + "...", balance, status]);
 
 } catch (e) {
 out.push([rpcName, "N/A", "EXCEPTION", "", e.message.substring(0, 20)]);
 }
 }
 
 return out;
 },
 
 // ============================================================
 // ERC20 CHECK
 // ============================================================
 
 /**
 * Verifie si un contrat est un ERC20 valide
 */
 checkErc20: function(config, token) {
 var out = [["Check", "Result", "Details"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 
 var tokenAddr = Addr.normalize(token);
 out.push(["Chain", chainName, "ID: " + (config.CHAIN.CHAIN_ID || "?")]);
 out.push(["Contract", this._shorten(tokenAddr), Addr.isValid(tokenAddr) ? "[OK] Valid format" : "[X] Invalid"]);
 
 if (!Addr.isValid(tokenAddr)) return out;
 
 var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
 if (!endpoints.length) {
 out.push(["ERROR", "No RPCs configured", ""]);
 return out;
 }
 
 var rpc = endpoints[0];
 
 // Check if contract exists
 try {
 var codeResult = this._rpcCall(rpc, "eth_getCode", [tokenAddr, "latest"], config);
 var code = codeResult.result || "0x";
 var hasCode = code && code !== "0x" && code.length > 2;
 out.push(["Has Code", hasCode ? "[OK] Yes (" + code.length + " chars)" : "[X] No (EOA or empty)", ""]);
 
 if (!hasCode) {
 out.push(["CONCLUSION", "[X] NOT A CONTRACT", "Address has no code deployed"]);
 return out;
 }
 } catch (e) {
 out.push(["Has Code", "Error", e.message]);
 }
 
 // Check ERC20 methods
 var checks = [
 { name: "decimals()", selector: TokenMeta.SELECTOR_DECIMALS, decode: "uint" },
 { name: "symbol()", selector: TokenMeta.SELECTOR_SYMBOL, decode: "string" },
 { name: "name()", selector: TokenMeta.SELECTOR_NAME, decode: "string" },
 { name: "totalSupply()", selector: "0x18160ddd", decode: "uint" }
 ];
 
 var passCount = 0;
 
 for (var i = 0; i < checks.length; i++) {
 var check = checks[i];
 try {
 var result = this._rpcCall(rpc, "eth_call", [{ to: tokenAddr, data: check.selector }, "latest"], config);
 
 if (result.error) {
 out.push([check.name, "[X] Failed", String(result.error).substring(0, 30)]);
 } else if (!result.result || result.result === "0x") {
 out.push([check.name, "[!] No response", ""]);
 } else {
 var decoded = "";
 if (check.decode === "uint") {
 var n = parseInt(result.result, 16);
 decoded = isNaN(n) ? "?" : String(n);
 if (check.name === "totalSupply()") {
 decoded = decoded.substring(0, 15) + (decoded.length > 15 ? "..." : "");
 }
 } else {
 decoded = AbiDecode.decodeStringOrBytes32(result.result) || "(decode failed)";
 }
 out.push([check.name, decoded, "[OK] OK"]);
 passCount++;
 }
 } catch (e) {
 out.push([check.name, "Exception", e.message.substring(0, 30)]);
 }
 }
 
 out.push(["", "", ""]);
 out.push(["CONCLUSION", passCount >= 3 ? "[OK] Appears to be ERC20" : "[!] May not be standard ERC20", passCount + "/4 checks passed"]);
 
 return out;
 },
 
 // ============================================================
 // RPC HEALTH
 // ============================================================
 
 /**
 * Teste la sante de tous les RPCs d'une chain
 */
 rpcHealth: function(config) {
 var out = [["RPC", "Status", "Latency", "Block #", "Chain ID"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 var expectedChainId = (config && config.CHAIN && config.CHAIN.CHAIN_ID) || 0;
 
 out.push(["=== " + chainName + " ===", "Expected ID: " + expectedChainId, "", "", ""]);
 
 var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
 
 for (var i = 0; i < endpoints.length; i++) {
 var rpcUrl = endpoints[i];
 var rpcName = this._rpcName(rpcUrl);
 
 var status = "?";
 var latency = "N/A";
 var blockNum = "N/A";
 var chainId = "N/A";
 
 try {
 // Test 1: eth_chainId
 var t0 = Date.now();
 var chainResult = this._rpcCall(rpcUrl, "eth_chainId", [], config);
 var t1 = Date.now();
 
 if (chainResult.error) {
 status = "[X] " + String(chainResult.error).substring(0, 15);
 out.push([rpcName, status, latency, blockNum, chainId]);
 continue;
 }
 
 chainId = parseInt(chainResult.result, 16);
 latency = (t1 - t0) + "ms";
 
 // Verifier que le chain ID correspond
 if (chainId !== expectedChainId) {
 status = "[!] Wrong chain";
 out.push([rpcName, status, latency, blockNum, chainId]);
 continue;
 }
 
 // Test 2: eth_blockNumber
 var blockResult = this._rpcCall(rpcUrl, "eth_blockNumber", [], config);
 if (blockResult.result) {
 blockNum = parseInt(blockResult.result, 16);
 }
 
 status = "[OK] OK";
 
 } catch (e) {
 status = "[X] " + e.message.substring(0, 15);
 }
 
 out.push([rpcName, status, latency, blockNum, chainId]);
 }
 
 // Ajouter le statut du RpcHealth tracker si disponible
 if (typeof RpcHealth !== "undefined" && RpcHealth._state) {
 out.push(["", "", "", "", ""]);
 out.push(["=== RPC Health Tracker ===", "", "", "", ""]);
 
 var blockedCount = 0;
 Obj.forEach(RpcHealth._state, function(rpc, data) {
 if (data && data.blocked) {
 blockedCount++;
 var rpcShort = rpc.replace("https://", "").split("/")[0].substring(0, 20);
 out.push([rpcShort, "BLOCKED", "", "failures=" + data.failures, ""]);
 }
 });
 
 if (blockedCount === 0) {
 out.push(["(none blocked)", "", "", "", ""]);
 }
 }
 
 return out;
 },
 
 // ============================================================
 // NATIVE BALANCE
 // ============================================================
 
 /**
 * Recupe?re la balance native d'un wallet
 */
 nativeBalance: function(config, wallet) {
 var out = [["RPC", "Balance", "Status"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "ETH";
 var nativeDecimals = (config && config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 18;
 
 var walletAddr = Addr.normalize(wallet);
 if (!Addr.isValid(walletAddr)) {
 return [["ERROR", "", "Invalid wallet address"]];
 }
 
 out.push(["Chain", chainName, nativeSymbol]);
 out.push(["Wallet", this._shorten(walletAddr), ""]);
 out.push(["", "", ""]);
 
 var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
 
 for (var i = 0; i < endpoints.length; i++) {
 var rpcUrl = endpoints[i];
 var rpcName = this._rpcName(rpcUrl);
 
 try {
 var result = this._rpcCall(rpcUrl, "eth_getBalance", [walletAddr, "latest"], config);
 
 if (result.error) {
 out.push([rpcName, "[X] Error", String(result.error).substring(0, 20)]);
 continue;
 }
 
 var rawBig = BigInt(result.result || "0x0");
 var balance = BigNum.toDecimal(rawBig, nativeDecimals);
 
 out.push([rpcName, balance + " " + nativeSymbol, "[OK] OK"]);
 
 } catch (e) {
 out.push([rpcName, "[X] Exception", e.message.substring(0, 20)]);
 }
 }
 
 return out;
 },
 
 // ============================================================
 // CACHE INSPECTION
 // ============================================================
 
 /**
 * Inspecte le cache d'un wallet
 */
 cacheInspect: function(config, wallet) {
 var out = [["Key", "Value", "Details"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 
 var walletAddr = Addr.normalize(wallet);
 out.push(["Chain", chainName, ""]);
 out.push(["Wallet", this._shorten(walletAddr), ""]);
 
 try {
 CacheManager.init();
 var cacheKey = CacheManager.walletKey(walletAddr, config);
 out.push(["Cache Key", cacheKey, ""]);
 
 var cache = WalletCache.load(walletAddr, null, config);
 
 if (!cache) {
 out.push(["Status", "NOT FOUND", "No cache exists for this wallet"]);
 return out;
 }
 
 out.push(["Status", "[OK] Found", ""]);
 out.push(["Version", cache.version || "?", ""]);
 
 var updatedAt = cache.updatedAt || 0;
 var ageMin = updatedAt ? Math.round((Date.now() - updatedAt) / 60000) : null;
 out.push(["Updated At", Format.datetime(updatedAt), ageMin ? "~" + ageMin + " min ago" : ""]);
 
 var assets = cache.assets || [];
 out.push(["Assets Count", assets.length, ""]);
 
 out.push(["rrCursor", cache.rrCursor || 0, ""]);
 out.push(["FX Rate", Num.isValidPositive(cache.usd_to_eur_rate) ? cache.usd_to_eur_rate.toFixed(4) : "N/A", ""]);
 
 out.push(["Last Full Scan", cache.last_full_scan_ms ? Format.datetime(cache.last_full_scan_ms) : "N/A", ""]);
 out.push(["Last Full Price", cache.last_full_price_ms ? Format.datetime(cache.last_full_price_ms) : "N/A", ""]);
 
 // Maps sizes
 out.push(["", "", ""]);
 out.push(["=== Maps ===", "", ""]);
 out.push(["priceMap", Obj.keyCount(cache.priceMap), "keys"]);
 out.push(["priceTsMap", Obj.keyCount(cache.priceTsMap), "keys"]);
 out.push(["balanceTsMap", Obj.keyCount(cache.balanceTsMap), "keys"]);
 out.push(["attemptTsMap", Obj.keyCount(cache.attemptTsMap), "keys"]);
 out.push(["purgedTsMap", Obj.keyCount(cache.purgedTsMap), "keys"]);
 
 // First 5 assets
 out.push(["", "", ""]);
 out.push(["=== First 5 Assets ===", "", ""]);
 
 for (var i = 0; i < Math.min(5, assets.length); i++) {
 var a = assets[i];
 out.push([
 "#" + (i + 1),
 a.symbol || this._shorten(a.contract),
 "bal=" + (a.balance || 0)
 ]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, ""]);
 }
 
 return out;
 },
 
 /**
 * Recherche un token dans le cache d'un wallet
 */
 cacheFindToken: function(config, wallet, token) {
 var out = [["Key", "Value"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 
 var walletAddr = Addr.normalize(wallet);
 var tokenAddr = Addr.normalize(token);
 
 out.push(["Chain", chainName]);
 out.push(["Token", this._shorten(tokenAddr)]);
 
 try {
 CacheManager.init();
 var cache = WalletCache.load(walletAddr, null, config);
 
 if (!cache) {
 out.push(["Cache", "NOT FOUND"]);
 return out;
 }
 
 var assets = cache.assets || [];
 
 // Search in assets
 var found = false;
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 var contract = Addr.normalize(a.contract || "");
 if (contract === tokenAddr) {
 found = true;
 out.push(["", ""]);
 out.push(["=== FOUND in assets[] ===", ""]);
 out.push(["Index", i]);
 out.push(["Contract", contract]);
 out.push(["Symbol", a.symbol || "(none)"]);
 out.push(["Name", a.name || "(none)"]);
 out.push(["Balance", a.balance || 0]);
 out.push(["Price EUR", Num.isValidPositive(a.price_eur) ? a.price_eur : "N/A"]);
 break;
 }
 }
 
 if (!found) {
 out.push(["In assets[]", "NO - Token not in cache"]);
 }
 
 // Check timestamps
 var balanceTsMap = cache.balanceTsMap || {};
 var attemptTsMap = cache.attemptTsMap || {};
 var purgedTsMap = cache.purgedTsMap || {};
 var priceMap = cache.priceMap || {};
 var priceTsMap = cache.priceTsMap || {};
 
 out.push(["", ""]);
 out.push(["=== Timestamps ===", ""]);
 out.push(["balanceTsMap", balanceTsMap[tokenAddr] ? Format.datetime(balanceTsMap[tokenAddr]) : "N/A"]);
 out.push(["attemptTsMap", attemptTsMap[tokenAddr] ? Format.datetime(attemptTsMap[tokenAddr]) : "N/A"]);
 out.push(["purgedTsMap", purgedTsMap[tokenAddr] ? Format.datetime(purgedTsMap[tokenAddr]) : "N/A"]);
 out.push(["priceTsMap", priceTsMap[tokenAddr] ? Format.datetime(priceTsMap[tokenAddr]) : "N/A"]);
 out.push(["Cached Price", Num.isValidPositive(priceMap[tokenAddr]) ? priceMap[tokenAddr] : "N/A"]);
 
 } catch (e) {
 out.push(["ERROR", e.message]);
 }
 
 return out;
 },
 
 /**
 * Liste tous les assets du cache
 */
 cacheListAssets: function(config, wallet) {
 var out = [["#", "Contract", "Symbol", "Balance", "Price EUR", "Value EUR"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 
 var walletAddr = Addr.normalize(wallet);
 
 try {
 CacheManager.init();
 var cache = WalletCache.load(walletAddr, null, config);
 
 if (!cache) {
 return [["Cache NOT FOUND for " + chainName, "", "", "", "", ""]];
 }
 
 var assets = cache.assets || [];
 out.push(["Chain: " + chainName, "Total: " + assets.length, "", "", "", ""]);
 out.push(["", "", "", "", "", ""]);
 
 for (var i = 0; i < assets.length; i++) {
 var a = assets[i];
 var balance = Num.parseOr(a.balance, 0);
 var price = Num.isValidPositive(a.price_eur) ? a.price_eur : null;
 var value = (price && balance > 0) ? (balance * price) : "";
 
 out.push([
 i + 1,
 a.contract === "native" ? "native" : this._shorten(a.contract),
 a.symbol || "",
 balance,
 price ? price.toFixed(4) : "",
 value ? value.toFixed(2) : ""
 ]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message, "", "", "", ""]);
 }
 
 return out;
 },
 
 // ============================================================
 // PRICE DIAGNOSTIC
 // ============================================================
 
 /**
 * Teste la recuperation du prix d'un token via les APIs
 */
 tokenPrice: function(config, token) {
 var out = [["Source", "Price USD", "Symbol", "Details"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 var dexSlug = (config && config.CHAIN && config.CHAIN.DEX_SLUG) || "ethereum";
 var gtNetwork = (config && config.CHAIN && config.CHAIN.GT_NETWORK) || "eth";
 
 var tokenAddr = Addr.normalize(token);
 out.push(["Chain", "", chainName, "Token: " + this._shorten(tokenAddr)]);
 out.push(["", "", "", ""]);
 
 // 1. DexScreener
 try {
 var dexUrl = "https://api.dexscreener.com/tokens/v1/" + dexSlug + "/" + tokenAddr;
 var dexResult = this._httpGet(dexUrl);
 
 if (dexResult.error) {
 out.push(["DexScreener", "[X] Error", "", String(dexResult.error).substring(0, 30)]);
 } else if (dexResult.data && Array.isArray(dexResult.data) && dexResult.data.length > 0) {
 var pair = dexResult.data[0];
 var price = pair.priceUsd || (pair.price && pair.price.usd);
 var symbol = (pair.baseToken && pair.baseToken.symbol) || "";
 out.push(["DexScreener", price || "N/A", symbol, "[OK] Found " + dexResult.data.length + " pair(s)"]);
 } else {
 out.push(["DexScreener", "N/A", "", "No pairs found"]);
 }
 } catch (e) {
 out.push(["DexScreener", "[X] Exception", "", e.message.substring(0, 30)]);
 }
 
 // 2. GeckoTerminal - Token endpoint
 try {
 var gtUrl = "https://api.geckoterminal.com/api/v2/networks/" + gtNetwork + "/tokens/" + tokenAddr;
 var gtResult = this._httpGet(gtUrl);
 
 if (gtResult.error) {
 out.push(["GeckoTerminal", "[X] Error", "", String(gtResult.error).substring(0, 30)]);
 } else if (gtResult.data && gtResult.data.data && gtResult.data.data.attributes) {
 var attr = gtResult.data.data.attributes;
 var price = attr.price_usd || attr.token_price_usd;
 var symbol = attr.symbol || "";
 out.push(["GeckoTerminal", price || "N/A", symbol, "[OK] Token found"]);
 } else {
 out.push(["GeckoTerminal", "N/A", "", "Token not found"]);
 }
 } catch (e) {
 out.push(["GeckoTerminal", "[X] Exception", "", e.message.substring(0, 30)]);
 }
 
 // 3. GeckoTerminal - Pools endpoint
 try {
 var gtPoolsUrl = "https://api.geckoterminal.com/api/v2/networks/" + gtNetwork + "/tokens/" + tokenAddr + "/pools";
 var gtPoolsResult = this._httpGet(gtPoolsUrl);
 
 if (gtPoolsResult.error) {
 out.push(["GT Pools", "[X] Error", "", String(gtPoolsResult.error).substring(0, 30)]);
 } else if (gtPoolsResult.data && gtPoolsResult.data.data && gtPoolsResult.data.data.length > 0) {
 var pool = gtPoolsResult.data.data[0];
 var poolAttr = pool.attributes || {};
 var price = poolAttr.token_price_usd || poolAttr.base_token_price_usd || poolAttr.quote_token_price_usd;
 out.push(["GT Pools", price || "N/A", "", "[OK] Found " + gtPoolsResult.data.data.length + " pool(s)"]);
 } else {
 out.push(["GT Pools", "N/A", "", "No pools found"]);
 }
 } catch (e) {
 out.push(["GT Pools", "[X] Exception", "", e.message.substring(0, 30)]);
 }
 
 return out;
 },
 
 /**
 * Recupe?re le prix du token natif d'une chain
 */
 nativePrice: function(config) {
 var out = [["Source", "Price USD", "Details"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "ETH";
 var nativeLlamaId = (config && config.CHAIN && config.CHAIN.NATIVE_LLAMA_ID) || "coingecko:ethereum";
 var nativeGeckoId = (config && config.CHAIN && config.CHAIN.NATIVE_GECKO_ID) || "ethereum";
 
 out.push(["Chain", "", chainName + " (" + nativeSymbol + ")"]);
 out.push(["", "", ""]);
 
 // 1. DefiLlama
 try {
 var llamaUrl = "https://coins.llama.fi/prices/current/" + encodeURIComponent(nativeLlamaId);
 var llamaResult = this._httpGet(llamaUrl);
 
 if (llamaResult.error) {
 out.push(["DefiLlama", "[X] Error", String(llamaResult.error).substring(0, 30)]);
 } else if (llamaResult.data && llamaResult.data.coins && llamaResult.data.coins[nativeLlamaId]) {
 var price = llamaResult.data.coins[nativeLlamaId].price;
 out.push(["DefiLlama", "$" + price, "[OK] OK"]);
 } else {
 out.push(["DefiLlama", "N/A", "Not found"]);
 }
 } catch (e) {
 out.push(["DefiLlama", "[X] Exception", e.message.substring(0, 30)]);
 }
 
 // 2. CoinGecko
 try {
 var geckoUrl = "https://api.coingecko.com/api/v3/simple/price?ids=" + encodeURIComponent(nativeGeckoId) + "&vs_currencies=usd";
 var geckoResult = this._httpGet(geckoUrl);
 
 if (geckoResult.error) {
 out.push(["CoinGecko", "[X] Error", String(geckoResult.error).substring(0, 30)]);
 } else if (geckoResult.data && geckoResult.data[nativeGeckoId]) {
 var price = geckoResult.data[nativeGeckoId].usd;
 out.push(["CoinGecko", "$" + price, "[OK] OK"]);
 } else {
 out.push(["CoinGecko", "N/A", "Not found"]);
 }
 } catch (e) {
 out.push(["CoinGecko", "[X] Exception", e.message.substring(0, 30)]);
 }
 
 return out;
 },
 
 // ============================================================
 // WALLET FULL DIAGNOSTIC
 // ============================================================
 
 /**
 * Diagnostic complet d'un wallet
 */
 walletFull: function(config, wallet) {
 var out = [["Category", "Key", "Value"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 var nativeSymbol = (config && config.CHAIN && config.CHAIN.NATIVE_SYMBOL) || "ETH";
 var nativeDecimals = (config && config.CHAIN && config.CHAIN.NATIVE_DECIMALS) || 18;
 
 var walletAddr = Addr.normalize(wallet);
 
 // === Chain Info ===
 out.push(["Chain", "Name", chainName]);
 out.push(["Chain", "ID", config.CHAIN.CHAIN_ID || "?"]);
 out.push(["Chain", "Native", nativeSymbol]);
 out.push(["Chain", "Version", config.VERSION || "?"]);
 out.push(["", "", ""]);
 
 // === Wallet Info ===
 out.push(["Wallet", "Address", walletAddr]);
 out.push(["Wallet", "Valid", Addr.isValid(walletAddr) ? "[OK] Yes" : "[X] No"]);
 
 if (!Addr.isValid(walletAddr)) {
 out.push(["ERROR", "", "Invalid wallet address"]);
 return out;
 }
 
 // === Native Balance ===
 out.push(["", "", ""]);
 out.push(["Native", "Symbol", nativeSymbol]);
 
 var endpoints = (config.RPC && config.RPC.ENDPOINTS) || [];
 if (endpoints.length > 0) {
 try {
 var balResult = this._rpcCall(endpoints[0], "eth_getBalance", [walletAddr, "latest"], config);
 if (balResult.result) {
 var rawBig = BigInt(balResult.result);
 var balance = BigNum.toDecimal(rawBig, nativeDecimals);
 out.push(["Native", "Balance", balance + " " + nativeSymbol]);
 } else {
 out.push(["Native", "Balance", "Error: " + (balResult.error || "unknown")]);
 }
 } catch (e) {
 out.push(["Native", "Balance", "Exception: " + e.message]);
 }
 } else {
 out.push(["Native", "Balance", "No RPCs configured"]);
 }
 
 // === Cache Info ===
 out.push(["", "", ""]);
 
 try {
 CacheManager.init();
 var cache = WalletCache.load(walletAddr, null, config);
 
 if (!cache) {
 out.push(["Cache", "Status", "NOT FOUND"]);
 } else {
 var assets = cache.assets || [];
 var updatedAt = cache.updatedAt || 0;
 var ageMin = updatedAt ? Math.round((Date.now() - updatedAt) / 60000) : null;
 
 out.push(["Cache", "Status", "[OK] Found"]);
 out.push(["Cache", "Assets", assets.length]);
 out.push(["Cache", "Age", ageMin ? ageMin + " min" : "N/A"]);
 out.push(["Cache", "Updated", Format.datetime(updatedAt)]);
 out.push(["Cache", "rrCursor", cache.rrCursor || 0]);
 }
 } catch (e) {
 out.push(["Cache", "Error", e.message]);
 }
 
 // === RPC Health ===
 out.push(["", "", ""]);
 
 var healthyRpcs = 0;
 var expectedChainId = config.CHAIN.CHAIN_ID || 0;
 
 for (var i = 0; i < endpoints.length; i++) {
 try {
 var chainResult = this._rpcCall(endpoints[i], "eth_chainId", [], config);
 if (!chainResult.error && parseInt(chainResult.result, 16) === expectedChainId) {
 healthyRpcs++;
 }
 } catch (e) {}
 }
 
 out.push(["RPCs", "Total", endpoints.length]);
 out.push(["RPCs", "Healthy", healthyRpcs + "/" + endpoints.length]);
 
 // === Budget Stats ===
 out.push(["", "", ""]);
 
 try {
 var budgetStats = BudgetStats.load(walletAddr, null, config);
 if (budgetStats && budgetStats.history) {
 out.push(["Budget", "History", budgetStats.history.length + " executions"]);
 if (budgetStats.history.length > 0) {
 var last = budgetStats.history[budgetStats.history.length - 1];
 out.push(["Budget", "Last Profile", last.profile || "?"]);
 out.push(["Budget", "Last Exec", last.execMs + "ms"]);
 }
 } else {
 out.push(["Budget", "Status", "No history"]);
 }
 } catch (e) {
 out.push(["Budget", "Error", e.message]);
 }
 
 return out;
 },
 
 // ============================================================
 // CACHE UTILITIES
 // ============================================================
 
 /**
 * Efface le cache d'un wallet
 */
 clearCache: function(config, wallet, confirm) {
 if (confirm !== true) {
 return [["WARNING", "Set confirm=TRUE to actually clear the cache"]];
 }

 var walletAddr = Addr.normalize(wallet);

 try {
 CacheManager.init();
 var cacheKey = CacheManager.walletKey(walletAddr, config);
 var results = [];

 // v4.14.5: Clear from ALL cache layers (packed + raw + SheetCache)
 // Layer 1: Packed wallet cache (GLOBAL_WALLET_CACHE_V1)
 var packedCleared = false;
 try {
 if (typeof CacheManager._packedDel_ === 'function') {
 packedCleared = CacheManager._packedDel_(cacheKey);
 results.push("packed=" + (packedCleared ? "CLEARED" : "NOT_FOUND"));
 }
 } catch (ePacked) {
 results.push("packed=ERROR:" + ePacked.message);
 }

 // Layer 2: Raw ScriptProperties (legacy)
 var props = CacheManager.getProps();
 var rawExisted = props.getProperty(cacheKey) !== null;
 if (rawExisted) props.deleteProperty(cacheKey);
 results.push("raw=" + (rawExisted ? "CLEARED" : "NOT_FOUND"));

 // Layer 3: SheetCache (virtualized)
 try {
 if (typeof SheetCache !== 'undefined' && SheetCache && typeof SheetCache.deleteRaw === 'function') {
 SheetCache.deleteRaw(cacheKey);
 results.push("sheet=CLEARED");
 }
 } catch (eSheet) {
 results.push("sheet=N/A");
 }

 return [["SUCCESS", "Cache cleared: " + cacheKey + " [" + results.join(", ") + "]"]];
 } catch (e) {
 return [["ERROR", e.message]];
 }
 },
 
 /**
 * Statistiques globales du cache
 */
 cacheStats: function(config) {
 var out = [["Metric", "Value"]];
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Unknown";
 var prefix = (config && config.KEYS && config.KEYS.PREFIX) || "";
 
 out.push(["Chain", chainName]);
 out.push(["Prefix", prefix]);
 out.push(["", ""]);
 
 try {
 CacheManager.init();
 var props = CacheManager.getProps();
 var allProps = props.getProperties();
 var keys = Object.keys(allProps);
 
 var totalSize = 0;
 var chainCaches = 0;
 var totalKeys = keys.length;
 
 for (var i = 0; i < keys.length; i++) {
 var key = keys[i];
 var size = allProps[key].length;
 totalSize += size;
 
 if (prefix && key.indexOf(prefix) === 0) {
 chainCaches++;
 }
 }
 
 out.push(["Total Keys (all chains)", totalKeys]);
 out.push(["Total Size", Math.round(totalSize / 1024) + " KB"]);
 out.push(["This Chain Caches", chainCaches]);
 
 // PropertiesService limit is 500KB total
 var usagePercent = Math.round((totalSize / (500 * 1024)) * 100);
 out.push(["", ""]);
 out.push(["Storage Usage", usagePercent + "% of 500KB limit"]);
 
 if (usagePercent > 80) {
 out.push(["WARNING", "Storage usage is high!"]);
 }
 
 } catch (e) {
 out.push(["ERROR", e.message]);
 }
 
 return out;
 },
 
 // ============================================================
 // HELPERS PRIVee"e?,?S
 // ============================================================
 
 _shorten: function(addr) {
 var n = Addr.normalize(addr);
 if (!n || n.length < 12) return n || "";
 return n.substring(0, 6) + "..." + n.substring(n.length - 4);
 },
 
 _rpcName: function(url) {
 return String(url || "").replace("https://", "").split("/")[0].substring(0, 25);
 },
 
 _rpcCall: function(url, method, params, config) {
 try {
 var timeout = (config && config.TIMEOUTS && config.TIMEOUTS.HTTP_MS) || 5000;
 var response = UrlFetchApp.fetch(url, {
 method: "post",
 contentType: "application/json",
 payload: JSON.stringify({
 jsonrpc: "2.0",
 id: 1,
 method: method,
 params: params || []
 }),
 muteHttpExceptions: true,
 timeout: timeout
 });
 
 if (response.getResponseCode() !== 200) {
 return { error: "HTTP " + response.getResponseCode() };
 }
 
 var json = JSON.parse(response.getContentText());
 if (json.error) {
 return { error: json.error.message || JSON.stringify(json.error) };
 }
 
 return { result: json.result };
 } catch (e) {
 return { error: e.message };
 }
 },
 
 _httpGet: function(url) {
 try {
 var response = UrlFetchApp.fetch(url, {
 method: "get",
 muteHttpExceptions: true,
 headers: {
 "accept": "application/json",
 "user-agent": "Mozilla/5.0 (Multi-chain Diagnostic)"
 },
 timeout: 10000
 });
 
 if (response.getResponseCode() !== 200) {
 return { error: "HTTP " + response.getResponseCode() };
 }
 
 return { data: JSON.parse(response.getContentText()) };
 } catch (e) {
 return { error: e.message };
 }
 }
};

// ============================================================
// SVM (SOLANA) DIAGNOSTICS - EVM-like helpers
// ============================================================

/**
 * Diagnostic: Solana native balance (lamports -> SOL)
 */
Diagnostic.svmNativeBalance = function(config, wallet, customRpc) {
 var out = [["Metric", "Value", "Details"]];
 try {
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Solana";
 var addr = String(wallet || "").trim();
 out.push(["Chain", chainName, "VM=SVM"]);
 out.push(["Wallet", addr, ""]);
 if (!addr || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
 out.push(["Error", "Invalid Solana address", ""]);
 return out;
 }

 var rpcUrl = (customRpc && String(customRpc).trim()) || (config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || "";
 out.push(["RPC", rpcUrl ? rpcUrl : "N/A", ""]);
 if (!rpcUrl) {
 out.push(["Error", "No RPC configured", ""]);
 return out;
 }

 var commitment = (config && config.RPC && config.RPC.COMMITMENT) || "confirmed";
 var res = SvmRpcClient.getBalance(rpcUrl, addr, commitment);
 if (res && res.error) {
 out.push(["RPC.getBalance", "ERROR", String(res.error)]);
 return out;
 }

 var lamports = (res && res.result && res.result.value != null) ? Number(res.result.value || 0) : 0;
 var sol = lamports / 1e9;
 out.push(["Lamports", lamports, ""]);
 out.push(["SOL", sol, ""]);
 return out;
 } catch (e) {
 out.push(["Error", "Exception", String(e && (e.message || e) || e)]);
 return out;
 }
};

/**
 * Diagnostic: Solana token metadata resolution (what is used for ticker/name)
 */
Diagnostic.svmTokenMeta = function(config, mint) {
 var out = [["Metric", "Value", "Details"]];
 try {
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Solana";
 var m = String(mint || "").trim();
 out.push(["Chain", chainName, "VM=SVM"]);
 if (!m || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)) {
 out.push(["Mint", m, "[X] Invalid base58"]);
 return out;
 }

 var timer = createTimer(8000);
 try {
 var dump = SvmTokenMeta.debugDump(m, timer, config);
 for (var i = 0; i < dump.length; i++) out.push(dump[i]);
 } catch (e1) {
 out.push(["Meta.debugDump", "ERROR", String(e1 && (e1.message || e1) || e1)]);
 }

 try {
 var r = SvmTokenMeta.resolve(m, null, timer, config);
 out.push(["Resolved.symbol", r && r.symbol ? r.symbol : "(empty)", ""]);
 out.push(["Resolved.name", r && r.name ? r.name : "(empty)", ""]);
 out.push(["Resolved.decimals", (r && r.decimals != null) ? r.decimals : "(null)", ""]);
 } catch (e2) {
 out.push(["Meta.resolve", "ERROR", String(e2 && (e2.message || e2) || e2)]);
 }

 return out;
 } catch (e) {
 out.push(["Error", "Exception", String(e && (e.message || e) || e)]);
 return out;
 }
};

/**
 * Diagnostic: Solana token price (via BulkPriceFetch + FX)
 */
Diagnostic.svmTokenPrice = function(config, mint) {
 var out = [["Metric", "Value", "Details"]];
 try {
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Solana";
 var m = String(mint || "").trim();
 out.push(["Chain", chainName, "VM=SVM"]);
 out.push(["Mint", m, ""]);
 if (!m || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)) {
 out.push(["Error", "Invalid mint", ""]);
 return out;
 }

 var timer = createTimer(10000);
 var fx = null;
 try { fx = FxRate.getUsdToEur(); } catch (eFx) { fx = null; }
 out.push(["FX USD->EUR", fx != null ? fx : "N/A", ""]);

 var map = BulkPriceFetch.fetch([m], { dex: true, gt: true }, timer, config) || {};
 // v4.5.8 FIX: BulkPriceFetch returns lowercase keys, so we must lookup with lowercase
 var k = m.toLowerCase();
 var px = map[k] || null;
 if (!px || !Num.isValidPositive(px.priceUsd)) {
 out.push(["Price", "N/A", "No price found"]);
 out.push(["Debug.mapKeys", Object.keys(map).join(", ") || "(empty)", ""]);
 return out;
 }

 out.push(["USD", px.priceUsd, px.source || ""]);
 if (Num.isValidPositive(fx)) out.push(["EUR", px.priceUsd * fx, ""]);
 if (px.symbol) out.push(["Dex/GT.symbol", px.symbol, ""]);
 if (px.name) out.push(["Dex/GT.name", px.name, ""]);

 return out;
 } catch (e) {
 out.push(["Error", "Exception", String(e && (e.message || e) || e)]);
 return out;
 }
};

/**
 * Diagnostic: Solana wallet quick summary (native + token count)
 */
Diagnostic.svmWallet = function(config, wallet, customRpc) {
 var out = [["Metric", "Value", "Details"]];
 try {
 var chainName = (config && config.CHAIN && config.CHAIN.NAME) || "Solana";
 var addr = String(wallet || "").trim();
 out.push(["Chain", chainName, "VM=SVM"]);
 out.push(["Wallet", addr, ""]);
 if (!addr || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
 out.push(["Error", "Invalid Solana address", ""]);
 return out;
 }

 var rpcUrl = (customRpc && String(customRpc).trim()) || (config && config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || "";
 out.push(["RPC", rpcUrl ? rpcUrl : "N/A", ""]);
 if (!rpcUrl) {
 out.push(["Error", "No RPC configured", ""]);
 return out;
 }

 var commitment = (config && config.RPC && config.RPC.COMMITMENT) || "confirmed";
 var b = SvmRpcClient.getBalance(rpcUrl, addr, commitment);
 var lamports = (b && !b.error && b.result && b.result.value != null) ? Number(b.result.value || 0) : 0;
 out.push(["SOL", lamports / 1e9, b && b.error ? String(b.error) : ""]);

 var t = SvmRpcClient.getTokenAccountsByOwner(rpcUrl, addr, commitment);
 if (t && t.error) {
 out.push(["SPL accounts", "ERROR", String(t.error)]);
 return out;
 }

 var list = (t && t.result && t.result.value) ? t.result.value : [];
 var nonZero = 0;
 for (var i = 0; i < list.length; i++) {
 var acc = list[i];
 var parsed = acc && acc.account && acc.account.data && acc.account.data.parsed;
 var info = parsed && parsed.info;
 var ta = info && info.tokenAmount;
 var ui = ta ? parseFloat(ta.uiAmount || 0) : 0;
 if (Num.isPositive(ui)) nonZero++;
 }
 out.push(["SPL accounts", list.length, "jsonParsed"]);
 out.push(["SPL non-zero", nonZero, ""]);
 return out;
 } catch (e) {
 out.push(["Error", "Exception", String(e && (e.message || e) || e)]);
 return out;
 }
};


/************************************************************
 * DIAG - LIST SCRIPT PROPERTIES KEYS (Sheets helpers)
 *
 * NOTE:
 * - Apps Script does NOT let us enumerate CacheService keys.
 * - This helper lists ScriptProperties keys, where legacy wallet caches
 * and some packed-store entries/metadata can still live.
 ************************************************************/

/**
 * List ScriptProperties keys and approximate value sizes.
 *
 * Usage:
 * =LIST_SCRIPT_PROPERTIES_KEYS()
 * =LIST_SCRIPT_PROPERTIES_KEYS("INJECTIVE")
 * =LIST_SCRIPT_PROPERTIES_KEYS("_COSMOS_CACHE_")
 *
 * @param {string} filter optional substring (case-insensitive)
 * @return {Array<Array<any>>}
 */
function LIST_SCRIPT_PROPERTIES_KEYS(filter) {
 var props = PropertiesService.getScriptProperties();
 var keys = [];
 try {
 keys = props.getKeys();
 } catch (e) {
 return [["error", String(e)]];
 }

 var f = (filter === undefined || filter === null) ? "" : String(filter).trim();
 var fUp = f ? f.toUpperCase() : "";

 var out = [["key", "size", "preview" ]];
 for (var i = 0; i < keys.length; i++) {
 var k = keys[i];
 if (!k) continue;
 if (fUp && String(k).toUpperCase().indexOf(fUp) < 0) continue;

 var v = "";
 try { v = props.getProperty(k) || ""; } catch (e2) { v = ""; }

 var size = v ? v.length : 0;
 var preview = "";
 if (v) {
 preview = v.substring(0, 80);
 if (v.length > 80) preview += "...";
 }
 out.push([k, size, preview]);
 }

 // Deterministic sort: biggest first
 out = [out[0]].concat(out.slice(1).sort(function(a, b) {
 return (b[1] || 0) - (a[1] || 0);
 }));

 return out;
}

/**
 * v4.15.30 - Dashboard de readiness apres reset UrlFetchApp.
 * A executer depuis l'editeur Apps Script pour voir les console.log.
 */
function QUOTA_RESET_READINESS_CHECK() {
  var lines = [];
  var reasons = [];

  function dayKey_() {
    var d = new Date(Date.now() - 9 * 3600000);
    return d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
  }

  function safeJson_(raw) {
    try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
  }

  function topEntries_(map, limit) {
    var keys = Object.keys(map || {});
    keys.sort(function(a, b) { return Number(map[b] || 0) - Number(map[a] || 0); });
    var out = [];
    for (var i = 0; i < keys.length && i < limit; i++) {
      out.push(keys[i] + "=" + map[keys[i]]);
    }
    return out.length ? out.join(", ") : "(aucune donnee)";
  }

  function normalizeTriggerMin_(intervalMin) {
    if (intervalMin <= 1) return 1;
    if (intervalMin <= 5) return 5;
    if (intervalMin <= 10) return 10;
    if (intervalMin <= 15) return 15;
    return 30;
  }

  function knownInterval_(handler) {
    if (handler === "WATCHDOG_FROM_RECAP") return "5";
    if (handler === "ACTIVITY_WATCHDOG") return "10";
    if (handler === "QUOTA_RECOVERY_SWEEP") return "30";
    if (handler === "QUOTA_RECOVERY_SWEEP_FOLLOWUP") return "one-shot after(30m)";
    if (handler === "_runPricingWorker") return "DISABLED_v4.15.34";
    return "non expose par ScriptApp";
  }

  function moduleVersion_(name) {
    try {
      if (typeof ModuleRegistry !== "undefined" && ModuleRegistry.get) {
        return ModuleRegistry.get(name);
      }
    } catch (e) {}
    return "N/A";
  }

  lines.push("=== QUOTA_RESET_READINESS_CHECK ===");
  lines.push("Generated: " + new Date().toISOString());

  var probeOk = false;
  var probeMsg = "";
  try {
    if (typeof _originalUrlFetch !== "function") {
      probeMsg = "_originalUrlFetch indisponible";
    } else {
      var resp = _originalUrlFetch.call(UrlFetchApp, "https://httpbin.org/get", {
        method: "get",
        muteHttpExceptions: true
      });
      var code = resp.getResponseCode();
      probeOk = (code === 200);
      probeMsg = probeOk ? "OK (code 200)" : ("KO (HTTP " + code + ")");
    }
  } catch (eProbe) {
    probeMsg = "KO (" + String(eProbe && (eProbe.message || eProbe) || "erreur probe") + ")";
  }
  if (!probeOk) reasons.push("probe quota KO: " + probeMsg);
  lines.push("");
  lines.push("1. Probe quota (_originalUrlFetch httpbin.org/get): " + probeMsg);

  var day = dayKey_();
  var props = PropertiesService.getScriptProperties();
  try { if (typeof HttpCallCounter !== "undefined" && HttpCallCounter.flush) HttpCallCounter.flush(); } catch (eFlush) {}

  var t0Key = "WCORE_HTTP_T0_" + day;
  var t0Raw = props.getProperty(t0Key);
  if (!t0Raw) reasons.push("T0 HttpCounter non logge");
  lines.push("");
  lines.push("2. T0 HttpCounter: " + (t0Raw ? (t0Key + "=" + new Date(Number(t0Raw)).toISOString()) : "non logge encore (" + t0Key + ")"));

  var total = -1;
  var quota = -1;
  try {
    total = (typeof HttpCallCounter !== "undefined" && HttpCallCounter.getToday) ? HttpCallCounter.getToday() : -1;
    quota = (typeof HttpCallCounter !== "undefined" && HttpCallCounter.getQuota) ? HttpCallCounter.getQuota() : -1;
  } catch (eCount) {}
  var hostMap = safeJson_(props.getProperty("WCORE_HTTP_HOST_" + day));
  var triggerMap = safeJson_(props.getProperty("WCORE_HTTP_TRIGGER_" + day));
  lines.push("");
  lines.push("3. Compteurs HttpCounter:");
  lines.push("   Total jour: " + total + (quota > 0 ? "/" + quota + " (" + Math.round(total / quota * 1000) / 10 + "%)" : ""));
  lines.push("   Top 5 hosts: " + topEntries_(hostMap, 5));
  lines.push("   Top 5 triggers: " + topEntries_(triggerMap, 5));

  var triggerCounts = {};
  var triggerLines = [];
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var tr = triggers[i];
      var handler = "";
      var eventType = "";
      try { handler = tr.getHandlerFunction ? tr.getHandlerFunction() : "(unknown)"; } catch (eH) { handler = "(handler error)"; }
      try { eventType = tr.getEventType ? String(tr.getEventType()) : "(event unknown)"; } catch (eE) { eventType = "(event error)"; }
      triggerCounts[handler] = (triggerCounts[handler] || 0) + 1;
      var interval = (String(eventType).indexOf("CLOCK") >= 0) ? knownInterval_(handler) : "";
      triggerLines.push("   - " + handler + " | event=" + eventType + (interval ? " | intervalMin=" + interval : ""));
    }
    if (!triggerLines.length) triggerLines.push("   (aucun trigger installe)");
  } catch (eTrig) {
    triggerLines.push("   ERROR: " + String(eTrig && (eTrig.message || eTrig) || eTrig));
    reasons.push("inventaire triggers KO");
  }

  var dupes = [];
  var triggerNames = Object.keys(triggerCounts).sort();
  for (var d = 0; d < triggerNames.length; d++) {
    if (triggerCounts[triggerNames[d]] > 1) dupes.push(triggerNames[d] + " x" + triggerCounts[triggerNames[d]]);
  }
  if (dupes.length) reasons.push("doublon trigger: " + dupes.join(", "));
  lines.push("");
  lines.push("4. Triggers installes:");
  for (var tl = 0; tl < triggerLines.length; tl++) lines.push(triggerLines[tl]);
  lines.push("   Doublons: " + (dupes.length ? dupes.join(", ") : "aucun"));

  var modules = ["WCORE", "BASE_ENGINE", "EVM_ENGINE", "SVM_ENGINE", "COSMOS_ENGINE", "HTTP_SAVINGS", "REFRESH", "ACTIVITY_REFRESH"];
  var moduleBits = [];
  for (var m = 0; m < modules.length; m++) {
    moduleBits.push(modules[m] + "=" + moduleVersion_(modules[m]));
  }
  lines.push("");
  lines.push("5. Module versions:");
  lines.push("   " + moduleBits.join(" | "));

  var verdict = (probeOk && !!t0Raw && dupes.length === 0)
    ? "✅ READY — run INSTALL_QUOTA_RECOVERY() puis laisser tourner"
    : "⚠️ NOT READY — " + (reasons.length ? reasons.join("; ") : "raison inconnue");
  lines.push("");
  lines.push("6. Verdict final: " + verdict);

  console.log(lines.join("\n"));
  return verdict;
}

/**
 * Convenience helper: lists likely Cosmos legacy cache keys for a chain.
 * Usage: =LIST_COSMOS_CACHE_KEYS("INJECTIVE")
 */
function LIST_COSMOS_CACHE_KEYS(chainCode) {
 var c = String(chainCode || "").trim();
 if (!c) return [["error", "chainCode required"]];
 // Cosmos keys usually contain these markers
 return LIST_SCRIPT_PROPERTIES_KEYS(c);
}


// ============================================================
// GLOBAL SNAPSHOT (storage + watchdog + FX + RPC health)
// ============================================================

/**
 * DIAG_SNAPSHOT - vue d'ensemble rapide pour debug.
 * Retourne une table facile a lire dans Sheets.
 *
 * @param {number} topN - topN pour GET_STORAGE_STATS_V2 (defaut 15)
 * @return {Array}
 */
function DIAG_SNAPSHOT(topN) {
 var out = [['Section', 'Key', 'Value', 'Note']];
 topN = (topN && topN > 0) ? (topN | 0) : 15;

 // 1) Storage
 try {
 if (typeof GET_STORAGE_STATS_V2 === 'function') {
 var t = GET_STORAGE_STATS_V2(topN);
 out.push(['Storage', 'GET_STORAGE_STATS_V2', '', '']);
 // flatten some rows (keep first ~topN+15 lines)
 for (var i = 0; i < Math.min(t.length, topN + 30); i++) {
 var r = t[i];
 if (!r || !r.length) continue;
 out.push(['Storage', String(r[0] || ''), String(r[1] || ''), String(r[2] || '')]);
 }
 }
 } catch (e1) {
 out.push(['Storage', 'ERROR', String(e1), '']);
 }

 // 2) Index keys (best effort)
 try {
 if (typeof CacheManager !== 'undefined' && CacheManager && typeof CacheManager.indexList === 'function') {
 var idx = CacheManager.indexList();
 out.push(['Index', 'WCORE_CACHE_INDEX_V1', String((idx || []).length), 'keys tracked']);
 }
 } catch (e2) {}

 // 3) Watchdog last stats / error map
 try {
 var props = PropertiesService.getScriptProperties();
 var wd = props.getProperty('WD_LAST_STATS_v1');
 if (wd) out.push(['Watchdog', 'WD_LAST_STATS_v1', wd.substring(0, 200), 'preview']);
 var err = props.getProperty('WD_ERRMAP_v2');
 if (err) out.push(['Watchdog', 'WD_ERRMAP_v2', err.substring(0, 200), 'preview']);
 } catch (e3) {}

 // 4) FX
 try {
 if (typeof FxRate !== 'undefined' && FxRate && typeof FxRate.getUsdToEur === 'function') {
 var fx = FxRate.getUsdToEur();
 out.push(['FX', 'USD->EUR', String(fx), 'FxRate.getUsdToEur()']);
 }
 } catch (e4) {}

 return out;
}


// ============================================================
// SheetCache quick diagnostics (wrappers)
// ============================================================

function DIAG_SHEETCACHE_STATS() {
 try {
 if (typeof SHEETCACHE_STATS === 'function') return SHEETCACHE_STATS();
 return [["ERROR", "SHEETCACHE_STATS not found", ""]];
 } catch (e) {
 return [["ERROR", "DIAG_SHEETCACHE_STATS", String((e && e.message) || e)]];
 }
}

function DIAG_SHEETCACHE_TOP(n) {
 try {
 if (typeof SHEETCACHE_TOP === 'function') return SHEETCACHE_TOP(n);
 return [["ERROR", "SHEETCACHE_TOP not found", ""]];
 } catch (e) {
 return [["ERROR", "DIAG_SHEETCACHE_TOP", String((e && e.message) || e)]];
 }
}

function DIAG_SHEETCACHE_FIND(prefix) {
 try {
 if (typeof SHEETCACHE_FIND === 'function') return SHEETCACHE_FIND(prefix);
 return [["ERROR", "SHEETCACHE_FIND not found", ""]];
 } catch (e) {
 return [["ERROR", "DIAG_SHEETCACHE_FIND", String((e && e.message) || e)]];
 }
}


/************************************************************
 * DASHBOARD-FRIENDLY DIAGNOSTICS
 *
 * These helpers are designed to be used directly in a Sheet dashboard
 * (one row per chain / key), without touching chain files.
 ************************************************************/

/**
 * Lists dynamic budget execution stats stored per chain in SheetCache.
 *
 * @param {string} contains Optional filter (case-insensitive) on cache key.
 * @returns {Array} Table: key, updated, ema_exec_ms, p90_exec_ms, last_exec_ms, ema_bal_ms, ema_price_ms
 */
function DIAG_CHAIN_EXEC_STATS(contains) {
 var out = [["key", "updated", "ema_exec_ms", "p90_exec_ms", "last_exec_ms", "ema_bal_ms", "ema_price_ms"]];
 try {
 if (typeof SheetCache === "undefined" || !SheetCache || typeof SheetCache.listKeys !== "function") {
 out.push(["ERROR", "SheetCache unavailable", "", "", "", "", ""]);
 return out;
 }

 var filter = String(contains || "").trim().toLowerCase();
 var keys = SheetCache.listKeys("_DYNAMIC_BUDGET_STATS_") || [];
 for (var i = 0; i < keys.length; i++) {
 var k = String(keys[i] || "");
 if (!k) continue;
 if (k.toUpperCase().indexOf("CHAIN") < 0) continue;
 if (filter && k.toLowerCase().indexOf(filter) < 0) continue;

 var raw = SheetCache.getRaw(k);
 if (!raw) continue;
 var obj = null;
 try { obj = JSON.parse(String(raw)); } catch (eJ) { obj = null; }
 if (!obj || typeof obj !== "object") continue;

 var arr = obj.arr || [];
 var last = (arr && arr.length) ? (arr[arr.length-1] | 0) : 0;
 var p90 = 0;
 try {
 var a2 = arr.slice().sort(function(a,b){return a-b;});
 var idx = Math.max(0, Math.min(a2.length-1, Math.floor(0.9*(a2.length-1))));
 p90 = a2.length ? (a2[idx] | 0) : 0;
 } catch (eP) { p90 = 0; }

 out.push([
 k,
 obj.ts ? Format.datetime(obj.ts) : "",
 obj.ema | 0,
 p90 | 0,
 last | 0,
 obj.emaBal | 0,
 obj.emaPrice | 0
 ]);
 }

 // Sort by ema_exec desc
 out.splice(1, out.length-1, ...out.slice(1).sort(function(a,b){return (b[2]|0)-(a[2]|0);}));
 } catch (e) {
 out.push(["ERROR", String((e && e.message) || e), "", "", "", "", ""]);
 }
 return out;
}


// ============================================================
// SYSTEM HEALTH - Custom Function (v4.9.1)
// ============================================================

/**
 * Vue d'ensemble de la sante du systeme WCORE
 * Dashboard unifie combinant cache, HTTP, RPC, pricing et performance
 * 
 * @return {Array} Tableau 2D pour Google Sheets
 * @customfunction
 */
function GET_SYSTEM_HEALTH() {
 return Diagnostic.systemHealth();
}

// ============================================================
// DECIMALS DIAGNOSTIC & REPAIR (v4.12.3)
// ============================================================

/**
 * Diagnose token decimals for a wallet - shows actual vs cached decimals
 * Helps identify balances corrupted by incorrect decimal conversion
 * 
 * @param {string} wallet - Wallet address
 * @param {Object} config - Chain config
 * @return {Array} Diagnostic output
 */
function DIAG_DECIMALS(wallet, config) {
 var out = [["Contract", "Symbol", "Cached Balance", "Cached Decimals", "Actual Decimals", "Corrected Balance", "Status"]];
 
 try {
 if (!wallet) return [["Error", "Missing wallet address"]];
 if (!config) return [["Error", "Missing config"]];
 
 var addrLower = Addr.normalize(wallet);
 CacheManager.init();
 
 var timer = createTimer(25000);
 var cache = WalletCache.load(addrLower, timer, config);
 
 if (!cache || !cache.assets || !cache.assets.length) {
 return [["Info", "No cached assets found for this wallet"]];
 }
 
 var rpc = (config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || null;
 
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (!asset || !asset.contract) continue;
 if (asset.contract === "native") {
 out.push([asset.contract, asset.symbol || "NATIVE", asset.balance, "-", "-", asset.balance, "OK (native)"]);
 continue;
 }
 
 var contract = Addr.normalize(asset.contract);
 var cachedDecimals = asset.decimals || 18;
 var cachedBalance = asset.balance || 0;
 
 // Fetch actual decimals from RPC
 var actualDecimals = cachedDecimals;
 try {
 if (rpc && timer.remaining() > 2000) {
 var result = RpcClient.call(rpc, "eth_call", [{ to: contract, data: "0x313ce567" }, "latest"], timer, 1, config);
 if (result) {
 var d = parseInt(result, 16);
 if (!isNaN(d) && d >= 0 && d <= 36) actualDecimals = d;
 }
 }
 } catch (e) {}
 
 var status = "OK";
 var correctedBalance = cachedBalance;
 
 if (actualDecimals !== cachedDecimals) {
 // Balance was converted with wrong decimals
 // Need to "unconvert" and reconvert
 // cachedBalance = raw / 10^cachedDecimals
 // raw = cachedBalance * 10^cachedDecimals
 // correctedBalance = raw / 10^actualDecimals
 // correctedBalance = cachedBalance * 10^(cachedDecimals - actualDecimals)
 var decimalDiff = cachedDecimals - actualDecimals;
 correctedBalance = cachedBalance * Math.pow(10, decimalDiff);
 status = "CORRUPTED - needs repair";
 }
 
 out.push([
 contract.substring(0, 10) + "...",
 asset.symbol || "",
 cachedBalance,
 cachedDecimals,
 actualDecimals,
 correctedBalance,
 status
 ]);
 }
 
 } catch (e) {
 out.push(["Error", String(e.message || e)]);
 }
 
 return out;
}

/**
 * Repair corrupted balances for a specific wallet
 * Fetches fresh balances from RPC with correct decimals
 * 
 * @param {string} wallet - Wallet address
 * @param {Object} config - Chain config
 * @param {boolean} dryRun - If true, only shows what would be changed (default: true)
 * @return {Array} Repair results
 */
function REPAIR_DECIMALS(wallet, config, dryRun) {
 var out = [["Contract", "Symbol", "Old Balance", "Old Decimals", "New Decimals", "New Balance", "Action"]];
 
 if (dryRun === undefined || dryRun === null) dryRun = true;
 
 try {
 if (!wallet) return [["Error", "Missing wallet address"]];
 if (!config) return [["Error", "Missing config"]];
 
 var addrLower = Addr.normalize(wallet);
 CacheManager.init();
 
 var timer = createTimer(25000);
 var cache = WalletCache.load(addrLower, timer, config);
 
 if (!cache || !cache.assets || !cache.assets.length) {
 return [["Info", "No cached assets found for this wallet"]];
 }
 
 var rpc = (config.RPC && config.RPC.ENDPOINTS && config.RPC.ENDPOINTS[0]) || null;
 if (!rpc) return [["Error", "No RPC endpoint configured"]];
 
 var repaired = 0;
 var newAssets = [];
 
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (!asset || !asset.contract) continue;
 
 if (asset.contract === "native") {
 newAssets.push(asset);
 out.push([asset.contract, asset.symbol || "NATIVE", asset.balance, "-", "-", asset.balance, "SKIP (native)"]);
 continue;
 }
 
 var contract = Addr.normalize(asset.contract);
 var oldDecimals = asset.decimals || 18;
 var oldBalance = asset.balance || 0;
 
 // Fetch actual decimals from RPC
 var newDecimals = oldDecimals;
 try {
 if (timer.remaining() > 2000) {
 var decResult = RpcClient.call(rpc, "eth_call", [{ to: contract, data: "0x313ce567" }, "latest"], timer, 1, config);
 if (decResult) {
 var d = parseInt(decResult, 16);
 if (!isNaN(d) && d >= 0 && d <= 36) newDecimals = d;
 }
 }
 } catch (e) {}
 
 // Fetch fresh balance from RPC
 var newBalance = oldBalance;
 var action = "UNCHANGED";
 
 try {
 if (timer.remaining() > 2000) {
 var callData = "0x70a08231" + Addr.pad32(addrLower);
 var balResult = RpcClient.call(rpc, "eth_call", [{ to: contract, data: callData }, "latest"], timer, 1, config);
 if (balResult) {
 var raw = BigInt(balResult || "0x0");
 newBalance = BigNum.toDecimal(raw, newDecimals);
 
 if (newBalance !== oldBalance || newDecimals !== oldDecimals) {
 action = "REPAIRED";
 repaired++;
 }
 }
 }
 } catch (e) {
 action = "ERROR: " + String(e.message || e).substring(0, 30);
 }
 
 // Update asset
 var repairedAsset = {
 contract: contract,
 symbol: asset.symbol || "",
 name: asset.name || "",
 balance: newBalance,
 decimals: newDecimals
 };
 newAssets.push(repairedAsset);
 
 out.push([
 contract.substring(0, 10) + "...",
 asset.symbol || "",
 oldBalance,
 oldDecimals,
 newDecimals,
 newBalance,
 action
 ]);
 }
 
 // Save repaired cache if not dry run
 if (!dryRun && repaired > 0) {
 cache.assets = newAssets;
 cache.updatedAt = Date.now();
 WalletCache.save(addrLower, cache, config);
 out.push(["", "", "", "", "", "", ""]);
 out.push(["SAVED", repaired + " tokens repaired", "", "", "", "", ""]);
 } else if (dryRun && repaired > 0) {
 out.push(["", "", "", "", "", "", ""]);
 out.push(["DRY RUN", repaired + " tokens would be repaired", "", "", "", "", "Run with dryRun=FALSE to apply"]);
 } else {
 out.push(["", "", "", "", "", "", ""]);
 out.push(["OK", "No repairs needed", "", "", "", "", ""]);
 }
 
 } catch (e) {
 out.push(["Error", String(e.message || e)]);
 }
 
 return out;
}

/**
 * Diagnose balance timestamps - shows when each token was last scanned
 * Helps identify tokens that are never being rescanned (stuck in round-robin)
 * 
 * @param {string} wallet - Wallet address
 * @param {Object} config - Chain config
 * @return {Array} Diagnostic output sorted by age (oldest first)
 */
function DIAG_BALANCE_TIMESTAMPS(wallet, config) {
 var out = [["Contract", "Symbol", "Balance", "Last Scan", "Age (hours)", "Priority", "Status"]];
 
 try {
 if (!wallet) return [["Error", "Missing wallet address"]];
 if (!config) return [["Error", "Missing config"]];
 
 var addrLower = Addr.normalize(wallet);
 CacheManager.init();
 
 var timer = createTimer(10000);
 var cache = WalletCache.load(addrLower, timer, config);
 
 if (!cache) {
 return [["Info", "No cache found for this wallet"]];
 }
 
 var nowMs = Date.now();
 var balanceTsMap = cache.balanceTsMap || {};
 var assets = cache.assets || [];
 
 // Build list of all tokens with their timestamps
 var tokenList = [];
 
 for (var i = 0; i < assets.length; i++) {
 var asset = assets[i];
 if (!asset || !asset.contract) continue;
 
 var contract = asset.contract;
 var ts = balanceTsMap[contract] || 0;
 var ageMs = ts > 0 ? (nowMs - ts) : nowMs;
 var ageHours = ageMs / (3600 * 1000);
 
 var hasBalance = Num.isPositive(asset.balance);
 var isStale = ageHours > 1; // More than 1 hour old
 
 var priority = "LOW";
 var status = "OK";
 
 if (hasBalance && isStale) {
 priority = "HIGH";
 status = "STALE - needs rescan";
 } else if (hasBalance) {
 priority = "MEDIUM";
 status = "OK - recently scanned";
 } else if (ts === 0) {
 priority = "UNKNOWN";
 status = "NEVER SCANNED";
 }
 
 tokenList.push({
 contract: contract,
 symbol: asset.symbol || "",
 balance: asset.balance || 0,
 ts: ts,
 ageHours: ageHours,
 priority: priority,
 status: status
 });
 }
 
 // Sort by age (oldest first = highest priority)
 tokenList.sort(function(a, b) {
 // Sort by priority first (HIGH > MEDIUM > LOW > UNKNOWN)
 var priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2, UNKNOWN: 3 };
 var pa = priorityOrder[a.priority] || 9;
 var pb = priorityOrder[b.priority] || 9;
 if (pa !== pb) return pa - pb;
 // Then by age (oldest first)
 return b.ageHours - a.ageHours;
 });
 
 // Add to output
 for (var j = 0; j < tokenList.length; j++) {
 var t = tokenList[j];
 var contractDisplay = t.contract === "native" ? "native" : t.contract.substring(0, 10) + "...";
 var lastScan = t.ts > 0 ? Format.datetime(t.ts) : "NEVER";
 
 out.push([
 contractDisplay,
 t.symbol,
 t.balance,
 lastScan,
 t.ageHours.toFixed(1),
 t.priority,
 t.status
 ]);
 }
 
 // Add summary
 out.push(["", "", "", "", "", "", ""]);
 var staleCount = tokenList.filter(function(t) { return t.priority === "HIGH"; }).length;
 var neverCount = tokenList.filter(function(t) { return t.priority === "UNKNOWN"; }).length;
 out.push(["SUMMARY", "Total: " + tokenList.length, "Stale: " + staleCount, "Never: " + neverCount, "", "", ""]);
 out.push(["rrCursor", cache.rrCursor || 0, "", "", "", "", ""]);
 
 } catch (e) {
 out.push(["Error", String(e.message || e)]);
 }
 
 return out;
}

/**
 * v4.15.31 - Audit packed WalletCache integrity without HTTP calls.
 *
 * @return {Array} [[chain, wallet_short, assets_count, cache_age_hours, status]]
 * @customfunction
 */
function DIAG_CACHE_INTEGRITY() {
 var out = [["chain", "wallet_short", "assets_count", "cache_age_hours", "status"]];
 try {
   if (typeof CacheManager === "undefined" || !CacheManager._loadPackedWalletCache_) {
     return [["ERROR", "WalletCache packed reader unavailable", "", "", ""]];
   }

   CacheManager.init();
   var packed = CacheManager._loadPackedWalletCache_();
   if (!packed || !packed.m) {
     out.push(["SUMMARY", "entries=0", 0, 0, "EMPTY"]);
     return out;
   }

   var nowSec = Math.floor(Date.now() / 1000);
   var entries = [];
   var emptyWithTs = 0;
   var stale = 0;
   var total = 0;

   function addEntry_(ent) {
     if (!ent || !ent.k) return;
     total++;
     var key = String(ent.k || "");
     var payload = ent.v || null;
     if (!payload && ent.s) {
       try { payload = JSON.parse(ent.s); } catch (eS) { payload = null; }
     }
     if (payload && CacheManager._inflateWalletPayload_) {
       payload = CacheManager._inflateWalletPayload_(payload);
     }

     var assets = (payload && payload.assets && Array.isArray(payload.assets)) ? payload.assets : [];
     var tsSec = ent.ts || ent.t || 0;
     var ageHours = tsSec > 0 ? ((nowSec - tsSec) / 3600) : -1;
     var status = "OK";
     if (tsSec > 0 && assets.length === 0) {
       status = "ANOMALY_EMPTY_WITH_TS";
       emptyWithTs++;
     } else if (ageHours > 24) {
       status = "STALE_GT_24H";
       stale++;
     } else if (tsSec <= 0) {
       status = "NO_TIMESTAMP";
     }

     if (status !== "OK") {
       var chain = key;
       var wallet = key;
       var idx = key.indexOf("WALLET_");
       if (idx >= 0) {
         chain = key.substring(0, idx).replace(/_?CACHE_?$/i, "").replace(/_+$/g, "");
         wallet = key.substring(idx + 7);
       }
       if (!chain) chain = "UNKNOWN";
       var walletShort = wallet.length > 12 ? (wallet.substring(0, 6) + "..." + wallet.substring(wallet.length - 4)) : wallet;
       entries.push([chain, walletShort, assets.length, ageHours < 0 ? "" : Math.round(ageHours * 10) / 10, status]);
     }
   }

   for (var h in packed.m) {
     if (!packed.m.hasOwnProperty(h)) continue;
     var ent = packed.m[h];
     if (Array.isArray(ent)) {
       for (var i = 0; i < ent.length; i++) addEntry_(ent[i]);
     } else {
       addEntry_(ent);
     }
   }

   entries.sort(function(a, b) {
     var av = (typeof a[3] === "number") ? a[3] : -1;
     var bv = (typeof b[3] === "number") ? b[3] : -1;
     return bv - av;
   });

   out.push(["SUMMARY", "entries=" + total, "empty_with_ts=" + emptyWithTs, "stale_gt_24h=" + stale, "NO_HTTP"]);
   for (var j = 0; j < entries.length; j++) out.push(entries[j]);
   return out;
  } catch (e) {
    return [["ERROR", "DIAG_CACHE_INTEGRITY", String((e && e.message) || e), "", ""]];
  }
}

/**
 * Force one ScriptProperties emergency purge and report storage before/after.
 * @customfunction
 */
function WCORE_EMERGENCY_PURGE_NOW(targetKb) {
  var out = [["metric", "value"]];
  try {
    CacheManager.init();
    function size_() {
      var all = PropertiesService.getScriptProperties().getProperties();
      var keys = Object.keys(all);
      var total = 0;
      for (var i = 0; i < keys.length; i++) total += keys[i].length + String(all[keys[i]] || "").length;
      return { keys: keys.length, bytes: total };
    }
    var before = size_();
    var target = Math.max(16384, (Number(targetKb || 96) || 96) * 1024);
    var ok = !!(CacheManager._emergencyPurge_ && CacheManager._emergencyPurge_(target));
    var after = size_();
    out.push(["ok", ok ? "YES" : "NO"]);
    out.push(["before_kb", Math.round(before.bytes / 102.4) / 10]);
    out.push(["after_kb", Math.round(after.bytes / 102.4) / 10]);
    out.push(["freed_kb", Math.round((before.bytes - after.bytes) / 102.4) / 10]);
    out.push(["keys_before", before.keys]);
    out.push(["keys_after", after.keys]);
    return out;
  } catch (e) {
    return [["ERROR", "WCORE_EMERGENCY_PURGE_NOW", String((e && e.message) || e)]];
  }
}

// v4.15.43 - Count NO_CACHE_WAITING_REFRESH wallets (fast: formulas only, no getValue)
function DIAG_NO_CACHE_COUNT() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var emptyA1 = [];
  var hasFormula = [];
  var emptyI1 = [];
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name.indexOf("Ledger - ") !== 0) continue;
    var a1 = sheets[i].getRange("A1").getFormula();
    var i1 = sheets[i].getRange("I1").getFormula();
    if (!a1 || a1 === "") emptyA1.push(name);
    else hasFormula.push(name);
    if (!i1 || i1 === "") emptyI1.push(name);
  }
  var out = [["Metric", "Count"]];
  out.push(["A1 formula MISSING", emptyA1.length]);
  out.push(["A1 formula PRESENT", hasFormula.length]);
  out.push(["I1 formula MISSING", emptyI1.length]);
  out.push(["Total Ledger tabs", emptyA1.length + hasFormula.length]);
  out.push(["", ""]);
  out.push(["--- A1 EMPTY ---", ""]);
  for (var j = 0; j < emptyA1.length; j++) out.push([emptyA1[j], ""]);
  return out;
}
