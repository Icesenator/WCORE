/************************************************************
 * 31_MISSING_FUNCTIONS.gs
 * 
 * GET_MISSING_WALLET_ASSETS_* functions for Blockscout-supported chains.
 * 
 * Version: v2.0.0 - Using Blockscout API (free, no API key)
 * 
 * Usage:
 * =GET_MISSING_WALLET_ASSETS_BASE("0x...")
 * =GET_MISSING_WALLET_ASSETS_ETHEREUM("0x...")
 * 
 * Compares Blockscout results with existing cache to find missing tokens.
 * 
 * Supported: BASE, ETHEREUM, OPTIMISM, ARBITRUM_ONE, POLYGON,
 * GNOSIS, SCROLL, ZKSYNC_ERA, LINEA, CELO, AVALANCHE, BLAST
 ************************************************************/

// ============================================================
// BASE
// ============================================================
function GET_MISSING_WALLET_ASSETS_BASE(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _BASE.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Base", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// ETHEREUM
// ============================================================
function GET_MISSING_WALLET_ASSETS_ETHEREUM(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _ETHEREUM.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Ethereum", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// OPTIMISM
// ============================================================
function GET_MISSING_WALLET_ASSETS_OPTIMISM(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _OPTIMISM.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Optimism", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// ARBITRUM_ONE
// ============================================================
function GET_MISSING_WALLET_ASSETS_ARBITRUM_ONE(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _ARBITRUM_ONE.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Arbitrum One", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// POLYGON
// ============================================================
function GET_MISSING_WALLET_ASSETS_POLYGON(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _POLYGON.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Polygon", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// GNOSIS
// ============================================================
function GET_MISSING_WALLET_ASSETS_GNOSIS(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _GNOSIS.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Gnosis", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// SCROLL
// ============================================================
function GET_MISSING_WALLET_ASSETS_SCROLL(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _SCROLL.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Scroll", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// ZKSYNC_ERA
// ============================================================
function GET_MISSING_WALLET_ASSETS_ZKSYNC_ERA(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _ZKSYNC_ERA.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["zkSync Era", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// LINEA
// ============================================================
function GET_MISSING_WALLET_ASSETS_LINEA(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _LINEA.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Linea", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// CELO
// ============================================================
function GET_MISSING_WALLET_ASSETS_CELO(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _CELO.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Celo", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// AVALANCHE
// ============================================================
function GET_MISSING_WALLET_ASSETS_AVALANCHE(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _AVALANCHE.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Avalanche", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}

// ============================================================
// BLAST
// ============================================================
function GET_MISSING_WALLET_ASSETS_BLAST(wallet) {
 if (typeof MissingTokensEngine !== 'undefined' && MissingTokensEngine.getMissingWalletAssets) {
 return MissingTokensEngine.getMissingWalletAssets(wallet, null, _BLAST.getConfig(), WalletNames);
 }
 return [["chain_name", "token_ticker", "token_name", "contract_address", "balance", "price_eur", "value_eur"],
 ["Blast", "ERROR", "MissingTokensEngine not loaded", "", "", "", ""]];
}
