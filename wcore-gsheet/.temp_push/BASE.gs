/**
 * BASE.gs - Base (v4.12.8)
 * ChainFactory pattern with explicit function declarations
 *
 * v4.12.8 - Added VISION ai by Virtuals to LLAMA_CONTRACT_MAP (missing from DexScreener/GT)
 * v4.12.7 - Added LLAMA_CONTRACT_MAP for Chainbase Token (C) - low DEX liquidity on Base
 * v4.12.6 - REMOVED base.meowrpc.com (returns "method not supported" errors)
 * v4.12.5 - REMOVED base.llamarpc.com (returns stale/incorrect balances - causes zombie tokens)
 * v4.12.4 - Uses global DEFAULT_TIMEOUTS from ChainFactory (HTTP_MS, FAST_FAIL_MS)
 * v4.12.3 - Added DIAG_BASE_DECIMALS and REPAIR_BASE_DECIMALS functions
 * v4.9.6 - Added more RPC endpoints for redundancy
 */

var _BASE = ChainFactory.createEvmChain("BASE", {
 CACHE_VERSION: 64,
  RPC: { 
  ENDPOINTS: [
  "https://base.drpc.org",
  "https://base-rpc.publicnode.com",
  "https://mainnet.base.org",
  "https://1rpc.io/base"
  // REMOVED v4.12.6: "https://base.meowrpc.com" - returns "method not supported" errors
  // REMOVED v4.12.5: "https://base.llamarpc.com" - returns stale data (zombie tokens)
  ]
  },
 CHAIN: {
 NAME: "Base",
 CHAIN_ID: 8453,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "base",
 GT_NETWORK: "base"
 },
 LLAMA_ID_MAP: { "DAI":"coingecko:dai", "ETH":"coingecko:ethereum", "USDC":"coingecko:usd-coin", "USDT":"coingecko:tether", "USDbC":"coingecko:bridged-usd-coin-base", "WBTC":"coingecko:wrapped-bitcoin", "WETH":"coingecko:weth", "cbETH":"coingecko:coinbase-wrapped-staked-eth" },
 LLAMA_CONTRACT_MAP: {
   "0xba12bc7b210e61e5d3110b997a63ea216e0e18f7": "coingecko:chainbase",
   "0x5b2193fdc451c1f847be09ca9d13a4bf60f8c86b": "coingecko:superform",
   "0x50d7a818e5e339ebe13b17e130b5b608fac354dc": "coingecko:vision-ai-by-virtuals"
 }
});

// Main functions
function GET_WALLET_ASSETS_BASE(a,r,t,f,g){return _BASE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_BASE(a){return _BASE.getCachedWalletAssets(a);}
function BASE_REFRESH_STATUS(a,r,t,f,g){return _BASE.getRefreshStatus(a,r,t,f,g);}
function BASE_STATS(a,t){return _BASE.getStats(a,t);}

// Diagnostic functions
function DIAG_BASE_TOKEN(w,t,r){return _BASE.diag.tokenBalance(w,t,r);}
function DIAG_BASE_COMPARE_RPCS(w,t){return _BASE.diag.compareRpcs(w,t);}
function DIAG_BASE_CHECK_ERC20(t){return _BASE.diag.checkErc20(t);}
function DIAG_BASE_RPC_HEALTH(){return _BASE.diag.rpcHealth();}
function DIAG_BASE_NATIVE_BALANCE(w){return _BASE.diag.nativeBalance(w);}
function DIAG_BASE_CACHE(w){return _BASE.diag.cacheInspect(w);}
function DIAG_BASE_CACHE_TOKEN(w,t){return _BASE.diag.cacheFindToken(w,t);}
function DIAG_BASE_CACHE_ASSETS(w){return _BASE.diag.cacheListAssets(w);}
function DIAG_BASE_TOKEN_PRICE(t){return _BASE.diag.tokenPrice(t);}
function DIAG_BASE_NATIVE_PRICE(){return _BASE.diag.nativePrice();}
function DIAG_BASE_WALLET(w){return _BASE.diag.walletFull(w);}
function DIAG_BASE_CACHE_STATS(){return _BASE.diag.cacheStats();}
function DIAG_BASE_CLEAR_CACHE(w,c){return _BASE.diag.clearCache(w,c);}

// v4.12.3: Decimals diagnostic and repair functions
function DIAG_BASE_DECIMALS(w){return DIAG_DECIMALS(w, _BASE.getConfig());}
function REPAIR_BASE_DECIMALS(w, dryRun){return REPAIR_DECIMALS(w, _BASE.getConfig(), dryRun);}

// v4.12.3: Balance timestamp diagnostic - shows when each token was last scanned
function DIAG_BASE_BALANCE_TIMESTAMPS(w){return DIAG_BALANCE_TIMESTAMPS(w, _BASE.getConfig());}

// v4.12.3: Priority scan diagnostic
function DIAG_BASE_PRIORITY_SCAN(wallet) {
 var config = _BASE.getConfig();
 var addrLower = Addr.normalize(wallet);
 
 var cache = WalletCache.load(addrLower, null, config);
 if (!cache || !cache.assets) {
 return [["Error", "No cache found for wallet"]];
 }
 
 // v4.12.3 FIX: Also load priceMap for accurate value calculation
 var priceMap = cache.priceMap || {};
 
 var assetByKey = {};
 for (var i = 0; i < cache.assets.length; i++) {
 var asset = cache.assets[i];
 if (asset && asset.contract) {
 var key = (asset.contract === "native") ? "native" : Addr.normalize(asset.contract);
 assetByKey[key] = asset;
 }
 }
 
 var allContracts = ContractListBuilder.build("", assetByKey, config);
 
 var priorityContracts = [];
 for (var i = 0; i < allContracts.length; i++) {
 var addr = Addr.normalize(allContracts[i]);
 if (!addr) continue;
 
 var hasBalance = assetByKey && assetByKey[addr] && Num.isPositive(assetByKey[addr].balance);
 
 if (hasBalance) {
 var asset = assetByKey[addr];
 var bal = Num.parse(asset.balance) || 0;
 // v4.12.3 FIX: Get price from asset OR from priceMap
 var price = Num.parse(asset.price_eur) || Num.parse(priceMap[addr]) || 0;
 var value = bal * price;
 priorityContracts.push({ addr: addr, value: value, balance: bal, price: price, symbol: asset.symbol || "?" });
 }
 }
 
 priorityContracts.sort(function(a, b) { return b.value - a.value; });
 
 var rows = [["Rank", "Contract", "Symbol", "CacheBalance", "Price", "Value", "ScanType"]];
 
 for (var i = 0; i < priorityContracts.length; i++) {
 var p = priorityContracts[i];
 rows.push([
 i + 1,
 p.addr,
 p.symbol,
 p.balance,
 p.price,
 p.value.toFixed(2) + " EUR",
 i < 15 ? "INDIVIDUAL" : "BATCH"
 ]);
 }
 
 return rows;
}

// v4.12.3: Scan token diagnostic
function DIAG_BASE_SCAN_TOKEN(wallet, tokenContract) {
 var config = _BASE.getConfig();
 var addrLower = Addr.normalize(wallet);
 var tokenLower = Addr.normalize(tokenContract);
 
 // v4.12.3 FIX: Use direct endpoint, not RpcSelector.pickBest (may return stale RPC)
 var endpoints = (config && config.RPC && config.RPC.ENDPOINTS) || [];
 var rpc = endpoints[0]; // Use first healthy endpoint
 for (var e = 0; e < endpoints.length; e++) {
 if (RpcHealth.isHealthy(endpoints[e], config)) {
 rpc = endpoints[e];
 break;
 }
 }
 
 var rows = [["Step", "Result", "Details"]];
 rows.push(["RPC Used", rpc, "Direct endpoint (not pickBest)"]);
 
 var cache = WalletCache.load(addrLower, null, config);
 var cachedBalance = "NOT FOUND";
 if (cache && cache.assets) {
 for (var i = 0; i < cache.assets.length; i++) {
 var a = cache.assets[i];
 var k = Addr.normalize(a.contract);
 if (k === tokenLower) {
 cachedBalance = a.balance;
 break;
 }
 }
 }
 rows.push(["Cache Balance", cachedBalance, "Current value in cache"]);
 
 var callData = "0x70a08231" + Addr.pad32(addrLower);
 var hex = null;
 try {
 hex = RpcClient.call(rpc, "eth_call", [{ to: tokenLower, data: callData }, "latest"], null, 1, config);
 } catch (e) {
 rows.push(["RPC Call", "ERROR", String(e.message || e)]);
 return rows;
 }
 rows.push(["RPC Hex", hex || "null", "Raw response"]);
 
 if (!hex || hex === "0x") hex = "0x0";
 var raw;
 try {
 raw = BigInt(hex);
 rows.push(["BigInt", String(raw), "Parsed value"]);
 } catch (e) {
 rows.push(["BigInt", "PARSE ERROR", String(e)]);
 return rows;
 }
 
 var meta = TokenMeta.get(rpc, tokenLower, {}, Date.now(), null, {}, config);
 var decimals = (meta && Num.isValid(meta.decimals)) ? meta.decimals : 18;
 rows.push(["Decimals", decimals, "From TokenMeta"]);
 
 var balance = BigNum.toDecimal(raw, decimals);
 rows.push(["RPC Balance", balance, "Converted from BigInt"]);
 
 var isPos = Num.isPositive(balance);
 rows.push(["Num.isPositive", isPos ? "TRUE" : "FALSE", "Would be saved?"]);
 
 var prevBal = Num.parse(cachedBalance);
 var newBal = Num.parse(balance);
 var wouldUpdate = (newBal != null && newBal >= 0 && (prevBal == null || newBal !== prevBal));
 rows.push(["Would Upsert", wouldUpdate ? "YES" : "NO", "prev=" + prevBal + " new=" + newBal]);
 
 rows.push(["---", "---", "---"]);
 rows.push(["Expected", balance, "Should be saved"]);
 rows.push(["Current", cachedBalance, "In cache now"]);
 rows.push(["Match?", String(balance) === String(cachedBalance) ? "YES Ã¢Å“â€œ" : "NO Ã¢Å¡Â  BUG!", ""]);
 
 return rows;
}

// v4.12.6 - Diagnostic BASE cbBTC/USDC balances - Updated with valid RPCs only
/**
 * Diagnostic balances USDC et cbBTC sur BASE
 * v4.12.6: Uses only valid RPCs (removed llamarpc and meowrpc)
 */
function DIAG_BASE_USDC_CBBTC_BALANCE() {
  try {
    const wallet = '0x17d518736ee9341dcdc0a2498e013d33cfcdd080';
    const tokens = [
      { symbol: 'USDC', addr: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
      { symbol: 'cbBTC', addr: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', decimals: 8 }
    ];
    
    // v4.12.6: RPCs BASE - Only working endpoints
    const rpcs = [
      'https://mainnet.base.org',
      'https://base.drpc.org',
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base'
    ];
    
    const results = [];
    results.push(['Token', 'Contract', 'RPC1', 'RPC2', 'RPC3', 'RPC4', 'Consensus', 'Status']);
    
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t];
      const rpcBalances = [];
      
      // Interroger les RPCs avec timeout et error handling
      for (let i = 0; i < rpcs.length; i++) {
        const rpc = rpcs[i];
        let balanceResult = 'PENDING';
        
        try {
          // Construire le data pour balanceOf(address)
          const paddedAddress = wallet.slice(2).toLowerCase().padStart(64, '0');
          const data = '0x70a08231' + paddedAddress;
          
          const payload = {
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{
              to: token.addr,
              data: data
            }, 'latest'],
            id: 1
          };
          
          const options = {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true,
            timeout: 8
          };
          
          const resp = UrlFetchApp.fetch(rpc, options);
          const code = resp.getResponseCode();
          
          if (code !== 200) {
            balanceResult = 'HTTP_' + code;
          } else {
            const text = resp.getContentText();
            const respData = JSON.parse(text);
            
            if (respData.result && respData.result.startsWith('0x')) {
              const rawBalance = parseInt(respData.result, 16);
              const balance = rawBalance / Math.pow(10, token.decimals);
              balanceResult = balance;
            } else if (respData.error) {
              balanceResult = 'ERR: ' + (respData.error.message || 'Unknown').substring(0, 15);
            } else {
              balanceResult = 'NO_RESULT';
            }
          }
        } catch (e) {
          balanceResult = 'EXC: ' + e.message.substring(0, 15);
        }
        
        rpcBalances.push(balanceResult);
        
        // Petit dÃƒÂ©lai entre RPCs
        if (i < rpcs.length - 1) {
          Utilities.sleep(50);
        }
      }
      
      // Calculer consensus
      const numericBalances = rpcBalances.filter(b => typeof b === 'number');
      let consensus = 'NO_CONSENSUS';
      let consensusCount = 0;
      
      if (numericBalances.length >= 2) {
        // Trouver la valeur majoritaire
        const votes = {};
        for (let i = 0; i < numericBalances.length; i++) {
          const key = numericBalances[i].toFixed(8);
          votes[key] = (votes[key] || 0) + 1;
        }
        
        let maxCount = 0;
        for (const key in votes) {
          if (votes[key] > maxCount) {
            maxCount = votes[key];
            consensus = parseFloat(key);
            consensusCount = maxCount;
          }
        }
      } else if (numericBalances.length === 1) {
        consensus = 'SINGLE: ' + numericBalances[0].toFixed(6);
      }
      
      // DÃƒÂ©terminer status
      let status = '?';
      if (typeof consensus === 'number') {
        status = consensusCount >= 2 ? 'Ã¢Å“â€œ ' + consensusCount + '/4' : 'Ã¢Å¡Â Ã¯Â¸Â weak';
      } else {
        status = 'Ã¢ÂÅ’ NO_CONSENSUS';
      }
      
      // Formater les rÃƒÂ©sultats
      const row = [
        token.symbol,
        token.addr.substring(0, 10) + '...',
        typeof rpcBalances[0] === 'number' ? rpcBalances[0].toFixed(6) : String(rpcBalances[0]),
        typeof rpcBalances[1] === 'number' ? rpcBalances[1].toFixed(6) : String(rpcBalances[1]),
        typeof rpcBalances[2] === 'number' ? rpcBalances[2].toFixed(6) : String(rpcBalances[2]),
        typeof rpcBalances[3] === 'number' ? rpcBalances[3].toFixed(6) : String(rpcBalances[3]),
        typeof consensus === 'number' ? consensus.toFixed(6) : String(consensus),
        status
      ];
      
      results.push(row);
    }
    
    return results;
    
  } catch (globalError) {
    return [
      ['ERROR', 'DIAG_BASE_USDC_CBBTC_BALANCE failed'],
      ['Message', globalError.message],
      ['Stack', (globalError.stack || 'No stack').substring(0, 100)]
    ];
  }
}

/**
 * Version simplifiÃƒÂ©e - Test RPC basique
 */
function DIAG_BASE_SIMPLE_RPC_TEST() {
  try {
    const rpc = 'https://mainnet.base.org';
    const wallet = '0x17d518736ee9341dcdc0a2498e013d33cfcdd080';
    const usdcAddr = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
    
    // Test 1: eth_blockNumber
    const blockPayload = {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    };
    
    const blockResp = UrlFetchApp.fetch(rpc, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(blockPayload),
      muteHttpExceptions: true
    });
    
    const blockData = JSON.parse(blockResp.getContentText());
    const blockNumber = blockData.result ? parseInt(blockData.result, 16) : 'ERROR';
    
    // Test 2: USDC balance
    const paddedAddress = wallet.slice(2).toLowerCase().padStart(64, '0');
    const data = '0x70a08231' + paddedAddress;
    
    const balPayload = {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{
        to: usdcAddr,
        data: data
      }, 'latest'],
      id: 2
    };
    
    const balResp = UrlFetchApp.fetch(rpc, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(balPayload),
      muteHttpExceptions: true
    });
    
    const balData = JSON.parse(balResp.getContentText());
    let usdcBalance = 'ERROR';
    
    if (balData.result && balData.result.startsWith('0x')) {
      const raw = parseInt(balData.result, 16);
      usdcBalance = raw / 1e6;
    }
    
    return [
      ['Test', 'Result'],
      ['RPC', rpc],
      ['Block Number', blockNumber],
      ['USDC Balance', usdcBalance],
      ['HTTP Status Block', blockResp.getResponseCode()],
      ['HTTP Status Balance', balResp.getResponseCode()]
    ];
    
  } catch (e) {
    return [
      ['ERROR', e.message],
      ['Line', e.lineNumber || 'Unknown']
    ];
  }
}

/**
 * Purge cache USDC/cbBTC - Version sÃƒÂ©curisÃƒÂ©e
 */
function DIAG_BASE_PURGE_USDC_CBBTC() {
  try {
    const wallet = '0x17d518736ee9341dcdc0a2498e013d33cfcdd080';
    const contracts = [
      { addr: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC' },
      { addr: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', symbol: 'cbBTC' }
    ];
    
    const results = [];
    results.push(['Token', 'Contract', 'Balance', 'Timestamp', 'Status']);
    
    for (let i = 0; i < contracts.length; i++) {
      const contract = contracts[i];
      const balKey = 'BASE_' + wallet + '_bal_' + contract.addr;
      const tsKey = 'BASE_' + wallet + '_balTs_' + contract.addr;
      
      let hadBalance = false;
      let hadTimestamp = false;
      
      try {
        hadBalance = CACHE_WALLET.get(balKey) !== null;
        CACHE_WALLET.remove(balKey);
      } catch (e) {
        hadBalance = 'ERR: ' + e.message.substring(0, 20);
      }
      
      try {
        hadTimestamp = CACHE_WALLET.get(tsKey) !== null;
        CACHE_WALLET.remove(tsKey);
      } catch (e) {
        hadTimestamp = 'ERR: ' + e.message.substring(0, 20);
      }
      
      results.push([
        contract.symbol,
        contract.addr,
        hadBalance === true ? 'Ã¢Å“â€œ Removed' : (hadBalance === false ? 'Ã¢Å¡Â Ã¯Â¸Â Empty' : hadBalance),
        hadTimestamp === true ? 'Ã¢Å“â€œ Removed' : (hadTimestamp === false ? 'Ã¢Å¡Â Ã¯Â¸Â Empty' : hadTimestamp),
        'Ã°Å¸â€â€ž Ready'
      ]);
    }
    
    return results;
    
  } catch (e) {
    return [
      ['ERROR', e.message],
      ['Line', e.lineNumber || 'Unknown']
    ];
  }
}