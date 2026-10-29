// v4.16.42 - WC-15: ForceRefreshManager + calculateRefreshInterval extraits tels quels de 27_ACTIVITY_REFRESH.gs
// Dependances a l appel: ACTIVITY_CONFIG, ActivityTracker, PropertiesService, Logger, Date.
// Aucun appel de service a l evaluation du fichier.
// ============================================================
// FORCE REFRESH FLAGS
// ============================================================

var ForceRefreshManager = {
  /**
   * Normalize chain key: ALWAYS uppercase + underscores (matches ActivityTracker._normalizeKey)
   * "Arbitrum One" → "ARBITRUM_ONE", "ARBITRUM_ONE" → "ARBITRUM_ONE"
   */
  _normalizeChain: function(chain) {
    return String(chain || "").toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  },

  /**
   * Marquer un wallet pour force refresh
   */
  set: function(chain, wallet, reason) {
    try {
      var key = ACTIVITY_CONFIG.STORAGE.FORCE_REFRESH_PREFIX +
                this._normalizeChain(chain) + "_" +
                String(wallet).toLowerCase().substring(0, 20);

      var data = {
        chain: this._normalizeChain(chain),
        wallet: String(wallet).toLowerCase(),
        requestedAt: Date.now(),
        reason: reason || "TX detected"
      };

      PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(data));
      Logger.log("[FORCE_REFRESH] SET " + key + " reason=" + (reason || "TX") + " requestedAt=" + data.requestedAt);
      return true;
    } catch (e) {
      Logger.log("[FORCE_REFRESH] SET FAILED " + String(chain) + "/" + String(wallet).substring(0,10) + ": " + e);
      return false;
    }
  },

  /**
   * Vérifier si force refresh demandé
   */
  check: function(chain, wallet) {
    try {
      var key = ACTIVITY_CONFIG.STORAGE.FORCE_REFRESH_PREFIX +
                this._normalizeChain(chain) + "_" +
                String(wallet).toLowerCase().substring(0, 20);

      var raw = PropertiesService.getScriptProperties().getProperty(key);
      if (!raw) {
        Logger.log("[FORCE_REFRESH] CHECK " + key + " — NOT FOUND");
        return null;
      }

      var data = JSON.parse(raw);
      // v4.15.2: Safety TTL only (2h) — real expiry is in BaseEngine when last_full_scan_ms > requestedAt
      if (Date.now() - data.requestedAt > 7200000) {
        PropertiesService.getScriptProperties().deleteProperty(key);
        Logger.log("[FORCE_REFRESH] EXPIRED " + key + " age=" + (Date.now() - data.requestedAt) + "ms");
        return null;
      }
      Logger.log("[FORCE_REFRESH] FOUND " + key + " age=" + (Date.now() - data.requestedAt) + "ms reason=" + (data.reason || "?"));
      return data;
    } catch (e) {
      Logger.log("[FORCE_REFRESH] CHECK FAILED " + String(chain) + "/" + String(wallet).substring(0,10) + ": " + e);
      return null;
    }
  },

  /**
   * Effacer le flag après refresh
   */
  clear: function(chain, wallet) {
    try {
      var key = ACTIVITY_CONFIG.STORAGE.FORCE_REFRESH_PREFIX +
                this._normalizeChain(chain) + "_" +
                String(wallet).toLowerCase().substring(0, 20);
      PropertiesService.getScriptProperties().deleteProperty(key);
      Logger.log("[FORCE_REFRESH] CLEAR " + key);
    } catch (e) {
      Logger.log("[FORCE_REFRESH] CLEAR FAILED " + String(chain) + "/" + String(wallet).substring(0,10) + ": " + e);
    }
  }
};

// ============================================================
// REFRESH INTERVAL CALCULATOR
// ============================================================

/**
 * Calculer l'intervalle de refresh optimal
 * @param {string} chainName - Nom de la chaÃ®ne
 * @param {string} wallet - Adresse wallet
 * @param {number} valueEur - Valeur totale en EUR
 * @param {number} cacheAgeMs - Age du cache en ms
 * @returns {Object} { name, reason, interval }
 */
function calculateRefreshInterval(chainName, wallet, valueEur, cacheAgeMs) {
  var interval = ACTIVITY_CONFIG.INTERVALS.LOW;
  var name = "LOW";
  var reason = "";
  
  // 1. Force refresh demandÃ©?
  var forceRefresh = ForceRefreshManager.check(chainName, wallet);
  if (forceRefresh) {
    return { 
      name: "FORCE", 
      reason: forceRefresh.reason || "Force refresh", 
      interval: 0 
    };
  }
  
  // 2. ActivitÃ© rÃ©cente dÃ©tectÃ©e?
  if (ActivityTracker.hasRecentActivity(chainName, wallet)) {
    return { 
      name: "ACTIVE", 
      reason: "Recent transaction", 
      interval: ACTIVITY_CONFIG.INTERVALS.ACTIVE 
    };
  }
  
  // 3. BasÃ© sur la valeur
  if (valueEur >= ACTIVITY_CONFIG.THRESHOLDS.HIGH) {
    interval = ACTIVITY_CONFIG.INTERVALS.HIGH_VALUE;
    name = "HIGH";
    reason = "High value wallet";
  } else if (valueEur >= ACTIVITY_CONFIG.THRESHOLDS.MEDIUM) {
    interval = ACTIVITY_CONFIG.INTERVALS.MEDIUM;
    name = "MEDIUM";
    reason = "Medium value wallet";
  } else if (valueEur >= ACTIVITY_CONFIG.THRESHOLDS.LOW) {
    interval = ACTIVITY_CONFIG.INTERVALS.LOW;
    name = "LOW";
    reason = "Low value wallet";
  } else {
    interval = ACTIVITY_CONFIG.INTERVALS.HIBERNATED;
    name = "HIBERNATED";
    reason = "Dust wallet";
  }
  
  // 4. VÃ©rifier si refresh nÃ©cessaire
  if (cacheAgeMs === null || cacheAgeMs === undefined) {
    return { name: "NORMAL", reason: "Refresh due", interval: interval };
  }
  if (cacheAgeMs < interval) {
    return { name: "SKIP", reason: "Fresh cache", interval: interval };
  }
  
  return { name: name, reason: reason, interval: interval };
}

