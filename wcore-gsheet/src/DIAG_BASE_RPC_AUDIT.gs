/************************************************************
 * DIAG_BASE_RPC_AUDIT.gs - Audit complet des RPCs Base
 * 
 * v1.0.0 - Diagnostic USDC/cbBTC avec tous les 5 RPCs actuels
 * 
 * Identifie les RPCs défectueux en comparant les balances
 * retournées par chaque endpoint.
 * 
 * Usage dans Google Sheets:
 * =DIAG_BASE_RPC_AUDIT("0x17d518736ee9341dcdc0a2498e013d33cfcdd080")
 * =DIAG_BASE_USDC_AUDIT("0x17d518736ee9341dcdc0a2498e013d33cfcdd080")
 * =DIAG_BASE_CBBTC_AUDIT("0x17d518736ee9341dcdc0a2498e013d33cfcdd080")
 ************************************************************/

// RPCs Base ACTUELS (v4.12.5 - sans llamarpc qui est stale)
var BASE_RPC_LIST = [
  "https://base.drpc.org",
  "https://base-rpc.publicnode.com",
  "https://mainnet.base.org",
  "https://1rpc.io/base",
  "https://base.meowrpc.com"
];

// Tokens clés sur Base
var BASE_KEY_TOKENS = {
  USDC: { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", decimals: 6 },
  cbBTC: { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", decimals: 8 },
  WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  cbETH: { address: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", decimals: 18 }
};

/**
 * Audit complet des RPCs Base pour un wallet
 * Compare les 5 RPCs sur USDC, cbBTC, WETH
 * @param {string} wallet - Adresse du wallet
 * @customfunction
 */
function DIAG_BASE_RPC_AUDIT(wallet) {
  var out = [["RPC", "USDC", "cbBTC", "WETH", "Latency", "Status"]];
  
  wallet = String(wallet || "").toLowerCase();
  if (!wallet || wallet.length < 40) {
    return [["ERROR", "Adresse wallet invalide", "", "", "", ""]];
  }
  
  var results = {};
  var tokenNames = ["USDC", "cbBTC", "WETH"];
  
  // Tester chaque RPC
  for (var i = 0; i < BASE_RPC_LIST.length; i++) {
    var rpc = BASE_RPC_LIST[i];
    var rpcName = rpc.replace("https://", "").split("/")[0];
    results[rpcName] = { balances: {}, latency: 0, errors: 0 };
    
    var startTime = Date.now();
    
    for (var j = 0; j < tokenNames.length; j++) {
      var tokenName = tokenNames[j];
      var token = BASE_KEY_TOKENS[tokenName];
      
      try {
        var balance = _rpcFetchBalance(rpc, wallet, token.address, token.decimals);
        results[rpcName].balances[tokenName] = balance;
      } catch (e) {
        results[rpcName].balances[tokenName] = "ERR:" + e.message.substring(0, 15);
        results[rpcName].errors++;
      }
    }
    
    results[rpcName].latency = Date.now() - startTime;
  }
  
  // Calculer le consensus pour chaque token
  var consensus = {};
  for (var k = 0; k < tokenNames.length; k++) {
    var tn = tokenNames[k];
    var values = [];
    var rpcNames = Object.keys(results);
    
    for (var l = 0; l < rpcNames.length; l++) {
      var v = results[rpcNames[l]].balances[tn];
      if (typeof v === "number") {
        values.push(v);
      }
    }
    
    if (values.length >= 2) {
      // Trouver la valeur majoritaire
      var votes = {};
      for (var m = 0; m < values.length; m++) {
        var key = values[m].toFixed(8);
        votes[key] = (votes[key] || 0) + 1;
      }
      
      var maxCount = 0;
      var consensusVal = null;
      for (var vk in votes) {
        if (votes[vk] > maxCount) {
          maxCount = votes[vk];
          consensusVal = parseFloat(vk);
        }
      }
      consensus[tn] = { value: consensusVal, votes: maxCount, total: values.length };
    }
  }
  
  // Générer le tableau de résultats
  var rpcNamesList = Object.keys(results);
  for (var n = 0; n < rpcNamesList.length; n++) {
    var rn = rpcNamesList[n];
    var r = results[rn];
    
    var status = "✓ OK";
    var divergences = [];
    
    for (var o = 0; o < tokenNames.length; o++) {
      var tkn = tokenNames[o];
      var bal = r.balances[tkn];
      
      if (typeof bal === "number" && consensus[tkn]) {
        var diff = Math.abs(bal - consensus[tkn].value);
        var pct = consensus[tkn].value !== 0 ? (diff / consensus[tkn].value * 100) : (bal !== 0 ? 100 : 0);
        
        if (pct > 1) {  // Plus de 1% de différence
          divergences.push(tkn);
        }
      } else if (typeof bal === "string" && bal.startsWith("ERR")) {
        divergences.push(tkn + "(err)");
      }
    }
    
    if (divergences.length > 0) {
      status = "⚠️ DIVERGENT: " + divergences.join(",");
    } else if (r.errors > 0) {
      status = "⚠️ ERREURS";
    }
    
    out.push([
      rn,
      _formatBal(r.balances.USDC),
      _formatBal(r.balances.cbBTC),
      _formatBal(r.balances.WETH),
      r.latency + "ms",
      status
    ]);
  }
  
  // Ajouter les lignes de consensus
  out.push(["", "", "", "", "", ""]);
  out.push(["=== CONSENSUS ===", "", "", "", "", ""]);
  
  for (var p = 0; p < tokenNames.length; p++) {
    var tknName = tokenNames[p];
    if (consensus[tknName]) {
      var c = consensus[tknName];
      out.push([
        tknName,
        c.value.toFixed(6),
        c.votes + "/" + c.total + " RPCs",
        c.votes >= 2 ? "✓" : "⚠️",
        "",
        ""
      ]);
    } else {
      out.push([tknName, "NO CONSENSUS", "", "❌", "", ""]);
    }
  }
  
  // Vérifier le cache
  out.push(["", "", "", "", "", ""]);
  out.push(["=== CACHE ===", "", "", "", "", ""]);
  
  try {
    var config = _BASE.getConfig();
    var cache = WalletCache.load(wallet, null, config);
    
    if (cache && cache.assets) {
      for (var q = 0; q < tokenNames.length; q++) {
        var tkName = tokenNames[q];
        var tkAddr = BASE_KEY_TOKENS[tkName].address.toLowerCase();
        var found = false;
        
        for (var r = 0; r < cache.assets.length; r++) {
          var asset = cache.assets[r];
          if (asset && Addr.normalize(asset.contract) === tkAddr) {
            found = true;
            var cachedBal = asset.balance;
            var consVal = consensus[tkName] ? consensus[tkName].value : null;
            var match = "?";
            
            if (consVal !== null && typeof cachedBal === "number") {
              var cacheDiff = Math.abs(cachedBal - consVal);
              var cachePct = consVal !== 0 ? (cacheDiff / consVal * 100) : 0;
              match = cachePct < 1 ? "✓ MATCH" : "❌ STALE (" + cachePct.toFixed(1) + "% diff)";
            }
            
            out.push([tkName, "Cache: " + cachedBal, "Consensus: " + (consVal || "?"), match, "", ""]);
            break;
          }
        }
        
        if (!found) {
          out.push([tkName, "❌ PAS DANS CACHE", "", "", "", ""]);
        }
      }
    } else {
      out.push(["Cache", "VIDE ou ABSENT", "", "", "", ""]);
    }
  } catch (e) {
    out.push(["Cache", "ERREUR: " + e.message.substring(0, 30), "", "", "", ""]);
  }
  
  return out;
}

/**
 * Audit USDC spécifiquement - tous les RPCs
 * @customfunction
 */
function DIAG_BASE_USDC_AUDIT(wallet) {
  return _auditSingleToken(wallet, "USDC");
}

/**
 * Audit cbBTC spécifiquement - tous les RPCs
 * @customfunction
 */
function DIAG_BASE_CBBTC_AUDIT(wallet) {
  return _auditSingleToken(wallet, "cbBTC");
}

/**
 * Vérifier si cbBTC est dans la tokenRange du wallet
 * @customfunction
 */
function DIAG_BASE_CBBTC_IN_RANGE(wallet) {
  var out = [["Check", "Result", "Details"]];
  wallet = String(wallet || "").toLowerCase();
  var cbbtcAddr = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
  
  // 1. Vérifier dans la feuille Tokens
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tokensSheet = ss.getSheetByName("Tokens");
    
    if (tokensSheet) {
      var data = tokensSheet.getDataRange().getValues();
      var foundInTokens = false;
      
      for (var i = 1; i < data.length; i++) {  // Skip header
        var row = data[i];
        var chain = String(row[0] || "").toUpperCase();
        var contract = String(row[1] || "").toLowerCase();
        
        if (chain === "BASE" && contract === cbbtcAddr) {
          foundInTokens = true;
          out.push(["Feuille Tokens", "✓ PRÉSENT", "Ligne " + (i+1)]);
          break;
        }
      }
      
      if (!foundInTokens) {
        out.push(["Feuille Tokens", "❌ ABSENT", "Ajouter: Base | " + cbbtcAddr + " | cbBTC | 8"]);
      }
    } else {
      out.push(["Feuille Tokens", "❌ FEUILLE INTROUVABLE", ""]);
    }
  } catch (e) {
    out.push(["Feuille Tokens", "ERREUR", e.message]);
  }
  
  // 2. Vérifier le cache
  try {
    var config = _BASE.getConfig();
    var cache = WalletCache.load(wallet, null, config);
    
    if (cache && cache.assets) {
      var foundInCache = false;
      for (var j = 0; j < cache.assets.length; j++) {
        if (Addr.normalize(cache.assets[j].contract) === cbbtcAddr) {
          foundInCache = true;
          out.push(["Cache wallet", "✓ PRÉSENT", "balance=" + cache.assets[j].balance]);
          break;
        }
      }
      if (!foundInCache) {
        out.push(["Cache wallet", "❌ ABSENT", "Token jamais scanné ou balance=0"]);
      }
    } else {
      out.push(["Cache wallet", "❌ VIDE", ""]);
    }
    
    // Vérifier balanceTsMap
    var tsMap = cache ? (cache.balanceTsMap || cache.bt || {}) : {};
    if (tsMap[cbbtcAddr]) {
      var lastScan = new Date(tsMap[cbbtcAddr]);
      var ageMin = Math.round((Date.now() - tsMap[cbbtcAddr]) / 60000);
      out.push(["Dernier scan", lastScan.toISOString(), "Il y a " + ageMin + " min"]);
    } else {
      out.push(["Dernier scan", "❌ JAMAIS", "Token pas dans la rotation"]);
    }
  } catch (e) {
    out.push(["Cache", "ERREUR", e.message]);
  }
  
  // 3. Test RPC direct
  out.push(["", "", ""]);
  out.push(["=== TEST RPC DIRECT ===", "", ""]);
  
  for (var k = 0; k < Math.min(3, BASE_RPC_LIST.length); k++) {
    var rpc = BASE_RPC_LIST[k];
    var rpcName = rpc.replace("https://", "").split("/")[0];
    
    try {
      var bal = _rpcFetchBalance(rpc, wallet, cbbtcAddr, 8);
      out.push([rpcName, bal > 0 ? "✓ " + bal + " cbBTC" : "0", bal > 0 ? "Token détecté!" : ""]);
    } catch (e) {
      out.push([rpcName, "ERREUR", e.message.substring(0, 30)]);
    }
  }
  
  return out;
}

/**
 * Force un refresh avec priorité sur cbBTC et USDC
 * @customfunction
 */
function FORCE_BASE_PRIORITY_REFRESH(wallet) {
  wallet = String(wallet || "").toLowerCase();
  
  var out = [["Action", "Result"]];
  out.push(["Wallet", wallet]);
  
  try {
    // Clear le cache pour forcer un full refresh
    var config = _BASE.getConfig();
    
    // Appeler GET_WALLET_ASSETS avec force=true
    var result = GET_WALLET_ASSETS_BASE(wallet, "", "", true, true);
    
    out.push(["Refresh", "Terminé"]);
    out.push(["Lignes", result.length]);
    
    // Chercher USDC et cbBTC dans le résultat
    var foundUsdc = false;
    var foundCbbtc = false;
    
    for (var i = 0; i < result.length; i++) {
      var row = result[i];
      if (row[1] === "USDC") {
        foundUsdc = true;
        out.push(["USDC", row[4], "✓"]);
      }
      if (row[1] === "cbBTC") {
        foundCbbtc = true;
        out.push(["cbBTC", row[4], "✓"]);
      }
    }
    
    if (!foundUsdc) out.push(["USDC", "❌ ABSENT", ""]);
    if (!foundCbbtc) out.push(["cbBTC", "❌ ABSENT", ""]);
    
  } catch (e) {
    out.push(["ERREUR", e.message, ""]);
  }
  
  return out;
}

// ============================================================
// HELPERS
// ============================================================

function _auditSingleToken(wallet, tokenName) {
  var out = [["RPC", "Raw Hex", "Balance", "Latency", "Status"]];
  
  wallet = String(wallet || "").toLowerCase();
  var token = BASE_KEY_TOKENS[tokenName];
  
  if (!token) {
    return [["ERROR", "Token inconnu: " + tokenName]];
  }
  
  out.push(["Token", tokenName, token.address, "decimals=" + token.decimals, ""]);
  out.push(["", "", "", "", ""]);
  
  var balances = [];
  
  for (var i = 0; i < BASE_RPC_LIST.length; i++) {
    var rpc = BASE_RPC_LIST[i];
    var rpcName = rpc.replace("https://", "").split("/")[0];
    var startTime = Date.now();
    
    try {
      var result = _rpcFetchBalanceWithHex(rpc, wallet, token.address, token.decimals);
      var latency = Date.now() - startTime;
      
      balances.push(result.balance);
      
      out.push([
        rpcName,
        result.rawHex ? result.rawHex.substring(0, 20) + "..." : "0x0",
        result.balance,
        latency + "ms",
        "✓"
      ]);
    } catch (e) {
      out.push([rpcName, "ERROR", e.message.substring(0, 25), "", "❌"]);
    }
  }
  
  // Consensus
  out.push(["", "", "", "", ""]);
  
  if (balances.length >= 2) {
    var votes = {};
    for (var j = 0; j < balances.length; j++) {
      var key = balances[j].toFixed(8);
      votes[key] = (votes[key] || 0) + 1;
    }
    
    var maxCount = 0;
    var consensusVal = null;
    for (var k in votes) {
      if (votes[k] > maxCount) {
        maxCount = votes[k];
        consensusVal = k;
      }
    }
    
    out.push(["CONSENSUS", maxCount + "/" + balances.length + " RPCs", consensusVal, maxCount >= 2 ? "✓" : "⚠️", ""]);
    
    // Identifier les divergents
    for (var l = 0; l < BASE_RPC_LIST.length; l++) {
      if (balances[l] !== undefined && balances[l].toFixed(8) !== consensusVal) {
        var divRpc = BASE_RPC_LIST[l].replace("https://", "").split("/")[0];
        out.push(["⚠️ DIVERGENT", divRpc, balances[l], "≠ consensus", ""]);
      }
    }
  }
  
  return out;
}

function _rpcFetchBalance(rpc, wallet, contract, decimals) {
  var data = "0x70a08231000000000000000000000000" + wallet.substring(2).toLowerCase();
  
  var payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: contract, data: data }, "latest"]
  };
  
  var response = UrlFetchApp.fetch(rpc, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 10000
  });
  
  var json = JSON.parse(response.getContentText());
  
  if (json.error) {
    throw new Error(json.error.message || "RPC error");
  }
  
  if (!json.result || json.result === "0x" || json.result === "0x0") {
    return 0;
  }
  
  var rawBal = parseInt(json.result, 16);
  return rawBal / Math.pow(10, decimals);
}

function _rpcFetchBalanceWithHex(rpc, wallet, contract, decimals) {
  var data = "0x70a08231000000000000000000000000" + wallet.substring(2).toLowerCase();
  
  var payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: contract, data: data }, "latest"]
  };
  
  var response = UrlFetchApp.fetch(rpc, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: 10000
  });
  
  var json = JSON.parse(response.getContentText());
  
  if (json.error) {
    throw new Error(json.error.message || "RPC error");
  }
  
  var rawHex = json.result || "0x0";
  var rawBal = 0;
  
  if (rawHex && rawHex !== "0x" && rawHex !== "0x0") {
    rawBal = parseInt(rawHex, 16);
  }
  
  return {
    rawHex: rawHex,
    balance: rawBal / Math.pow(10, decimals)
  };
}

function _formatBal(bal) {
  if (typeof bal === "number") {
    if (bal === 0) return "0";
    if (bal < 0.000001) return bal.toExponential(2);
    if (bal < 1) return bal.toFixed(6);
    if (bal < 1000) return bal.toFixed(4);
    return bal.toFixed(2);
  }
  return String(bal);
}
