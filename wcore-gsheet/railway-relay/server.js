// Relais CEX signe pour WCORE (Apps Script).
// Binance bloque les IP datacenter Google (HTTP 451). Ce service, heberge sur
// Railway (IP non bloquee), signe les requetes CEX et renvoie les soldes.
//
// Variables d'environnement (Railway):
//   BINANCE_API_KEY     - cle API Binance (lecture seule) [legacy GET /binance]
//   BINANCE_API_SECRET  - secret HMAC Binance              [legacy GET /binance]
//   COINBASE_API_KEY_NAME - nom complet de la cle CDP Coinbase
//   COINBASE_PRIVATE_KEY  - cle EC privee PEM Coinbase (\n acceptes)
//   OKX_API_KEY        - cle API OKX lecture seule
//   OKX_API_SECRET     - secret HMAC OKX
//   OKX_API_PASSPHRASE - passphrase OKX
//   RELAY_TOKEN         - jeton partage exige par les endpoints authentifies
//   PORT                - fourni par Railway
//
// Endpoints:
//   GET  /coinbase?token=...          Legacy (wcore-gsheet / Apps Script). Cles
//                                     serveur fixes, symboles FUSIONNES.
//   GET  /okx?token=...               Legacy (wcore-gsheet / Apps Script). Cles
//                                     serveur fixes, symboles FUSIONNES.
//   GET  /binance?token=...           Legacy (wcore-gsheet / Apps Script). Cles
//                                     serveur fixes, symboles FUSIONNES
//                                     (USDC/TUSD->USDT, EUR/EURI->EURC).
//   POST /binance/account             Multi-user (WCORE web). L'API WCORE envoie
//                                     {token, apiKey, apiSecret} du user. Cles
//                                     signees ici, symboles NON fusionnes.
//   POST /coinbase/account            Multi-user (WCORE web). Cles Coinbase CDP
//                                     du user, symboles NON fusionnes.
//   POST /okx/account                 Multi-user (WCORE web). Cles OKX du user,
//                                     symboles NON fusionnes.

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "16kb" }));

const BASE_URL = "https://api.binance.com";
const COINBASE_BASE_URL = "https://api.coinbase.com";
const OKX_BASE_URL = process.env.OKX_BASE_URL || "https://my.okx.com";
const OKX_EARN_FETCH_TIMEOUT_MS = 8000;
const RECV_WINDOW = 60000;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error("Missing env " + name);
  return v;
}

function sign(queryString, secret) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

function toQuery(params) {
  return Object.keys(params)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");
}

async function signedGet(path, params, creds) {
  const p = Object.assign({}, params, {
    timestamp: Date.now(),
    recvWindow: RECV_WINDOW,
  });
  const qs = toQuery(p);
  const signature = sign(qs, creds.secret);
  const url = BASE_URL + path + "?" + qs + "&signature=" + signature;
  const resp = await fetch(url, {
    method: "GET",
    headers: { "X-MBX-APIKEY": creds.key },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error("Binance " + path + " HTTP " + resp.status + ": " + text.slice(0, 300));
  }
  return JSON.parse(text);
}

async function publicGet(path, params) {
  const qs = params ? "?" + toQuery(params) : "";
  const resp = await fetch(BASE_URL + path + qs, { method: "GET" });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error("Binance " + path + " HTTP " + resp.status + ": " + text.slice(0, 300));
  }
  return text ? JSON.parse(text) : null;
}

function parseAmount(value) {
  const n = Number(String(value == null ? "0" : value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function derToJose(signature, outputLength) {
  const buf = Buffer.from(signature);
  if (buf[0] !== 0x30) throw new Error("Invalid DER ECDSA signature");
  let offset = 2;
  if (buf[1] & 0x80) offset = 2 + (buf[1] & 0x7f);
  if (buf[offset] !== 0x02) throw new Error("Invalid DER ECDSA signature r");
  const rLen = buf[offset + 1];
  let r = buf.slice(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (buf[offset] !== 0x02) throw new Error("Invalid DER ECDSA signature s");
  const sLen = buf[offset + 1];
  let s = buf.slice(offset + 2, offset + 2 + sLen);
  const partLen = outputLength / 2;
  if (r.length > partLen) r = r.slice(r.length - partLen);
  if (s.length > partLen) s = s.slice(s.length - partLen);
  if (r.length < partLen) r = Buffer.concat([Buffer.alloc(partLen - r.length), r]);
  if (s.length < partLen) s = Buffer.concat([Buffer.alloc(partLen - s.length), s]);
  return Buffer.concat([r, s]).toString("base64url");
}

const COINBASE_SYMBOL_ALIASES = {
  USD: "USDT",
  USDC: "USDT",
  TUSD: "USDT",
  EUR: "EURC",
  EURC: "EURC",
  EURI: "EURC",
  EURS: "EURC",
  RONIN: "RON",
};

function coinbaseCanonical(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return COINBASE_SYMBOL_ALIASES[s] || s;
}

function cexMergeRowUsdMetadata(row, meta) {
  if (!row || !meta) return;
  const amount = parseAmount(row[1]);
  const valueUsd = parseAmount(meta.valueUsd);
  const priceUsdInput = parseAmount(meta.priceUsd);
  const derivedValueUsd = valueUsd > 0 ? valueUsd : (priceUsdInput > 0 && amount > 0 ? amount * priceUsdInput : 0);
  if (derivedValueUsd > 0) row[3] = parseAmount(row[3]) + derivedValueUsd;
  const totalValueUsd = parseAmount(row[3]);
  const priceUsd = totalValueUsd > 0 && amount > 0 ? totalValueUsd / amount : priceUsdInput;
  if (priceUsd > 0) row[4] = priceUsd;
}

async function enrichRowsWithUsdPrices(rows, fetchPricesUsd) {
  const out = (rows || []).map((row) => row.slice());
  const missing = out.filter((row) => parseAmount(row[1]) > 0 && parseAmount(row[3]) <= 0 && parseAmount(row[4]) <= 0).map((row) => row[0]);
  if (missing.length === 0) return out;
  const prices = await fetchPricesUsd(missing);
  for (const row of out) {
    if (parseAmount(row[3]) > 0 || parseAmount(row[4]) > 0) continue;
    const priceUsd = parseAmount(prices && prices[String(row[0] || "").toUpperCase()]);
    if (priceUsd > 0) cexMergeRowUsdMetadata(row, { priceUsd: priceUsd });
  }
  return out;
}

async function enrichRowsWithUsdPricesSafe(rows, fetchPricesUsd, label) {
  try {
    return await enrichRowsWithUsdPrices(rows, fetchPricesUsd);
  } catch (err) {
    console.log(String(label || "cex") + " USD price enrichment skipped: " + (err && err.message ? err.message : err));
    return rows;
  }
}

function coinbasePushRow(rows, seen, symbol, amount) {
  const s = coinbaseCanonical(symbol);
  if (!s) return;
  const amt = parseAmount(amount);
  if (amt <= 0) return;
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = parseAmount(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}

function extractCoinbasePrivateKey(value) {
  if (value && typeof value === "object") {
    return value.privateKey || value.private_key || value.pem || value.key || "";
  }
  let raw = String(value || "").trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      return extractCoinbasePrivateKey(parsed);
    } catch (_) {
      return raw;
    }
  }
  return raw;
}

function normalizeCoinbasePrivateKeyPem(value) {
  let pem = String(extractCoinbasePrivateKey(value) || "").trim();
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
    pem = pem.slice(1, -1).trim();
  }
  pem = pem.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const singleLine = pem.match(/^(-----BEGIN [^-]+-----)\s+([A-Za-z0-9+/=\s]+?)\s+(-----END [^-]+-----)$/);
  if (singleLine && !pem.includes("\n")) {
    const body = singleLine[2].replace(/\s+/g, "");
    const chunks = body.match(/.{1,64}/g) || [];
    pem = [singleLine[1]].concat(chunks, [singleLine[3]]).join("\n");
  }
  return pem;
}

function coinbasePrivateKeyPem() {
  return normalizeCoinbasePrivateKeyPem(getEnv("COINBASE_PRIVATE_KEY"));
}

function coinbasePrivateKeyPemFromCreds(creds) {
  return normalizeCoinbasePrivateKeyPem(creds && creds.privateKey);
}

function signCoinbaseJwtInput(signingInput, privateKeyPem) {
  try {
    return crypto.sign("sha256", Buffer.from(signingInput), privateKeyPem);
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    if (msg.includes("DECODER routines") || msg.includes("unsupported") || msg.includes("PEM")) {
      throw new Error("Invalid Coinbase private key format. Paste the EC private key PEM, or the full Coinbase CDP JSON containing privateKey.");
    }
    throw err;
  }
}

function coinbaseJwt(method, requestPath) {
  const keyName = getEnv("COINBASE_API_KEY_NAME");
  const now = Math.floor(Date.now() / 1000);
  const uri = String(method || "GET").toUpperCase() + " api.coinbase.com" + requestPath;
  const header = {
    alg: "ES256",
    typ: "JWT",
    kid: keyName,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const payload = {
    iss: "cdp",
    sub: keyName,
    nbf: now,
    exp: now + 120,
    uri: uri,
  };
  const signingInput = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(payload));
  const derSig = signCoinbaseJwtInput(signingInput, coinbasePrivateKeyPem());
  return signingInput + "." + derToJose(derSig, 64);
}

function coinbaseJwtWithCreds(method, requestPath, creds) {
  const keyName = String(creds && creds.keyName ? creds.keyName : "").trim();
  if (!keyName) throw new Error("Missing Coinbase key name");
  const now = Math.floor(Date.now() / 1000);
  const uri = String(method || "GET").toUpperCase() + " api.coinbase.com" + requestPath;
  const header = {
    alg: "ES256",
    typ: "JWT",
    kid: keyName,
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const payload = {
    iss: "cdp",
    sub: keyName,
    nbf: now,
    exp: now + 120,
    uri: uri,
  };
  const signingInput = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(payload));
  const derSig = signCoinbaseJwtInput(signingInput, coinbasePrivateKeyPemFromCreds(creds));
  return signingInput + "." + derToJose(derSig, 64);
}

async function coinbaseAuthGet(path, params) {
  const query = params && Object.keys(params).length ? "?" + toQuery(params) : "";
  const requestPath = path + query;
  const resp = await fetch(COINBASE_BASE_URL + requestPath, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + coinbaseJwt("GET", path),
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error("Coinbase " + path + " HTTP " + resp.status + ": " + text.slice(0, 300));
  }
  return text ? JSON.parse(text) : null;
}

async function coinbaseAuthGetWithCreds(path, params, creds) {
  const query = params && Object.keys(params).length ? "?" + toQuery(params) : "";
  const requestPath = path + query;
  const resp = await fetch(COINBASE_BASE_URL + requestPath, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + coinbaseJwtWithCreds("GET", path, creds),
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error("Coinbase " + path + " HTTP " + resp.status + ": " + text.slice(0, 300));
  }
  return text ? JSON.parse(text) : null;
}

async function coinbaseFetchAccounts() {
  const rows = [], seen = {};
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const params = { limit: 250 };
    if (cursor) params.cursor = cursor;
    const data = await coinbaseAuthGet("/api/v3/brokerage/accounts", params);
    const accounts = (data && data.accounts) || [];
    for (const account of accounts) {
      const currency = account && (account.currency || account.currency_code);
      const available = account && account.available_balance && account.available_balance.value;
      const hold = account && account.hold && account.hold.value;
      coinbasePushRow(rows, seen, currency, parseAmount(available) + parseAmount(hold));
    }
    if (!data || !data.has_next || !data.cursor) break;
    cursor = data.cursor;
  }
  return rows;
}

async function coinbaseFetchAccountsExact(creds) {
  const rows = [], seen = {};
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const params = { limit: 250 };
    if (cursor) params.cursor = cursor;
    const data = await coinbaseAuthGetWithCreds("/api/v3/brokerage/accounts", params, creds);
    const accounts = (data && data.accounts) || [];
    for (const account of accounts) {
      const currency = account && (account.currency || account.currency_code);
      const available = account && account.available_balance && account.available_balance.value;
      const hold = account && account.hold && account.hold.value;
      pushRowExact(rows, seen, currency, parseAmount(available) + parseAmount(hold));
    }
    if (!data || !data.has_next || !data.cursor) break;
    cursor = data.cursor;
  }
  return rows;
}

const OKX_SYMBOL_ALIASES = {
  USD: "USDT",
  USDC: "USDT",
  TUSD: "USDT",
  DAI: "USDT",
  EUR: "EURC",
  EURC: "EURC",
  EURI: "EURC",
  EURT: "EURC",
};

function okxCanonical(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return OKX_SYMBOL_ALIASES[s] || s;
}

function okxMergeRowMetadata(row, meta) {
  cexMergeRowUsdMetadata(row, meta);
}

function okxPushRow(rows, seen, symbol, amount, source, meta) {
  const s = okxCanonical(symbol);
  if (!s) return;
  const amt = parseAmount(amount);
  if (amt <= 0) return;
  const src = String(source || "spot").trim().toLowerCase() || "spot";
  const key = s + "|" + src;
  if (Object.prototype.hasOwnProperty.call(seen, key)) {
    const row = rows[seen[key]];
    row[1] = Math.round((parseAmount(row[1]) + amt) * 1e12) / 1e12;
    okxMergeRowMetadata(row, meta);
    return;
  }
  seen[key] = rows.length;
  const row = [s, amt, src];
  okxMergeRowMetadata(row, meta);
  rows.push(row);
}

function okxFirstPositive(obj, keys) {
  for (const key of keys) {
    if (!obj || obj[key] == null || obj[key] === "") continue;
    const n = parseAmount(obj[key]);
    if (n > 0) return n;
  }
  return 0;
}

function mergeOkxEarnBalances(rows, seen, earn, options) {
  const push = options && options.pushRow ? options.pushRow : okxPushRow;
  const savings = (earn && earn.savings) || [];
  for (const item of savings) {
    const amount = okxFirstPositive(item, ["amt", "redemptAmt", "earningAmt", "bal", "availBal"]);
    if (amount > 0) push(rows, seen, item.ccy, amount, "earn");
  }
  const stakingDefi = (earn && earn.stakingDefi) || [];
  for (const item of stakingDefi) {
    const investData = Array.isArray(item && item.investData) ? item.investData : [];
    if (investData.length) {
      for (const inv of investData) {
        const amount = okxFirstPositive(inv, ["amt", "investAmt", "bal"]);
        if (amount > 0) push(rows, seen, inv.ccy || item.ccy, amount, "earn");
      }
      continue;
    }
    const amount = okxFirstPositive(item, ["amt", "investAmt", "bal"]);
    if (amount > 0) push(rows, seen, item.ccy, amount, "earn");
  }
}

function okxSign(timestamp, method, requestPath, body, secret) {
  const payload = String(timestamp) + String(method || "GET").toUpperCase() + String(requestPath) + String(body || "");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

async function okxAuthGet(path, params, options) {
  const query = params && Object.keys(params).length ? "?" + toQuery(params) : "";
  const requestPath = path + query;
  const ts = new Date().toISOString();
  const secret = getEnv("OKX_API_SECRET");
  const resp = await fetch(OKX_BASE_URL + requestPath, {
    method: "GET",
    signal: options && options.signal,
    headers: {
      "OK-ACCESS-KEY": getEnv("OKX_API_KEY"),
      "OK-ACCESS-SIGN": okxSign(ts, "GET", requestPath, "", secret),
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": getEnv("OKX_API_PASSPHRASE"),
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error("OKX " + path + " HTTP " + resp.status + ": " + text.slice(0, 300));
  }
  const json = text ? JSON.parse(text) : null;
  if (json && json.code && String(json.code) !== "0") {
    throw new Error("OKX code " + json.code + ": " + (json.msg || text.slice(0, 250)));
  }
  return json;
}

async function okxAuthGetWithCreds(path, params, creds, options) {
  const query = params && Object.keys(params).length ? "?" + toQuery(params) : "";
  const requestPath = path + query;
  const ts = new Date().toISOString();
  const resp = await fetch(OKX_BASE_URL + requestPath, {
    method: "GET",
    signal: options && options.signal,
    headers: {
      "OK-ACCESS-KEY": creds.key,
      "OK-ACCESS-SIGN": okxSign(ts, "GET", requestPath, "", creds.secret),
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": creds.passphrase,
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error("OKX " + path + " HTTP " + resp.status + ": " + text.slice(0, 300));
  }
  const json = text ? JSON.parse(text) : null;
  if (json && json.code && String(json.code) !== "0") {
    throw new Error("OKX code " + json.code + ": " + (json.msg || text.slice(0, 250)));
  }
  return json;
}

async function okxFetchEarnBalances(authGet) {
  const earn = { savings: [], stakingDefi: [] };
  async function okxEarnAuthGet(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("OKX earn timeout")), OKX_EARN_FETCH_TIMEOUT_MS);
    try {
      return await authGet(path, null, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
  const results = await Promise.allSettled([
    okxEarnAuthGet("/api/v5/finance/savings/balance"),
    okxEarnAuthGet("/api/v5/finance/staking-defi/orders-active"),
  ]);
  if (results[0].status === "fulfilled") {
    earn.savings = (results[0].value && results[0].value.data) || [];
  } else {
    var errSavings = results[0].reason;
    console.log("okx savings balance skipped: " + (errSavings && errSavings.message ? errSavings.message : errSavings));
  }
  if (results[1].status === "fulfilled") {
    earn.stakingDefi = (results[1].value && results[1].value.data) || [];
  } else {
    var errStakingDefi = results[1].reason;
    console.log("okx staking/defi active orders skipped: " + (errStakingDefi && errStakingDefi.message ? errStakingDefi.message : errStakingDefi));
  }
  return earn;
}

async function okxFetchBalances() {
  const rows = [], seen = {};
  try {
    const trading = await okxAuthGet("/api/v5/account/balance", null);
    const data = trading && trading.data && trading.data[0];
    const details = (data && data.details) || [];
    for (const d of details) {
      const amount = d.cashBal != null && d.cashBal !== "" ? d.cashBal : d.eq;
      okxPushRow(rows, seen, d.ccy, amount, "trading", { valueUsd: d.eqUsd });
    }
  } catch (errTrading) {
    console.log("okx trading balance skipped: " + (errTrading && errTrading.message ? errTrading.message : errTrading));
  }
  try {
    const funding = await okxAuthGet("/api/v5/asset/balances", null);
    const balances = (funding && funding.data) || [];
    for (const b of balances) {
      const amount = b.bal != null && b.bal !== "" ? b.bal : b.availBal;
      okxPushRow(rows, seen, b.ccy, amount, "funding");
    }
  } catch (errFunding) {
    console.log("okx funding balance skipped: " + (errFunding && errFunding.message ? errFunding.message : errFunding));
  }
  const earn = await okxFetchEarnBalances((path, params, options) => okxAuthGet(path, params, options));
  mergeOkxEarnBalances(rows, seen, earn);
  return rows;
}

async function okxFetchBalancesExact(creds) {
  const rows = [], seen = {};
  try {
    const trading = await okxAuthGetWithCreds("/api/v5/account/balance", null, creds);
    const data = trading && trading.data && trading.data[0];
    const details = (data && data.details) || [];
    for (const d of details) {
      const amount = d.cashBal != null && d.cashBal !== "" ? d.cashBal : d.eq;
      pushRowExact(rows, seen, d.ccy, amount);
    }
  } catch (errTrading) {
    console.log("okx trading balance skipped: " + (errTrading && errTrading.message ? errTrading.message : errTrading));
  }
  try {
    const funding = await okxAuthGetWithCreds("/api/v5/asset/balances", null, creds);
    const balances = (funding && funding.data) || [];
    for (const b of balances) {
      const amount = b.bal != null && b.bal !== "" ? b.bal : b.availBal;
      pushRowExact(rows, seen, b.ccy, amount);
    }
  } catch (errFunding) {
    console.log("okx funding balance skipped: " + (errFunding && errFunding.message ? errFunding.message : errFunding));
  }
  const earn = await okxFetchEarnBalances((path, params, options) => okxAuthGetWithCreds(path, params, creds, options));
  mergeOkxEarnBalances(rows, seen, earn, { pushRow: pushRowExact });
  return rows;
}

// Stablecoins normalises et cumules sur un symbole canonique.
const SYMBOL_ALIASES = {
  USDC: "USDT",
  TUSD: "USDT",
  EUR: "EURC",
  EURI: "EURC",
};

function canonicalSymbol(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return SYMBOL_ALIASES[s] || s;
}

function pushRow(rows, seen, symbol, amount) {
  const s = canonicalSymbol(symbol);
  if (!s) return;
  const amt = parseAmount(amount);
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = parseAmount(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}

// flexibleAssets = Set des symboles canoniques presents dans Simple Earn flexible.
// Les assets Spot prefixes "LD" (ex LDBTC) sont le reflet des positions flexible
// dans le wallet Spot. On ne les exclut que si le symbole sans prefixe existe
// reellement dans earn-flexible -> evite de masquer un vrai token nomme LDO/LDG.
async function fetchSpot(creds, flexibleAssets) {
  const rows = [], seen = {};
  const acc = await signedGet("/api/v3/account", {}, creds);
  const balances = (acc && acc.balances) || [];
  for (const b of balances) {
    const asset = String(b.asset || "");
    if (/^LD[0-9A-Z]/.test(asset)) {
      const base = asset.slice(2).toUpperCase();
      // Cas 1: correspondance exacte avec un asset Earn flexible -> doublon sur.
      // Cas 2: les "Lending Daily" tokens Binance ont une base >= 2 caracteres
      //   (LDBTC, LDSHIB2, LD1MBBDOGE...). Les vrais tokens LDO/LDG ont une base
      //   d'1 seul caractere -> on les conserve.
      if ((flexibleAssets && flexibleAssets.has(base)) || base.length >= 2) {
        continue; // reflet Earn flexible dans le wallet Spot
      }
    }
    const total = parseAmount(b.free) + parseAmount(b.locked);
    if (total > 0) pushRow(rows, seen, b.asset, total);
  }
  return rows;
}

async function fetchEarn(creds, kind, amountKey) {
  const rows = [], seen = {};
  let page = 1;
  while (page <= MAX_PAGES) {
    const data = await signedGet(
      "/sapi/v1/simple-earn/" + kind + "/position",
      { current: page, size: PAGE_SIZE },
      creds
    );
    const list = (data && data.rows) || [];
    for (const r of list) {
      const amt = parseAmount(r[amountKey]);
      if (amt > 0) pushRow(rows, seen, r.asset, amt);
    }
    const total = data && typeof data.total !== "undefined" ? Number(data.total) : list.length;
    if (list.length < PAGE_SIZE) break;
    if (page * PAGE_SIZE >= total) break;
    page++;
  }
  return rows;
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// --- Multi-user (WCORE web) ---------------------------------------------------
// Contrairement au flux legacy /binance (wcore-gsheet), le flux web NE FUSIONNE
// PAS les symboles: USDC/TUSD restent distincts de USDT, EUR/EURI distincts de
// EURC. Chaque utilisateur passe ses propres cles API Binance (signees ici).

function pushRowExact(rows, seen, symbol, amount, source) {
  const s = String(symbol || "").trim().toUpperCase();
  if (!s) return;
  const amt = parseAmount(amount);
  const src = String(source || "spot").trim().toLowerCase() || "spot";
  const key = s + "|" + src;
  if (Object.prototype.hasOwnProperty.call(seen, key)) {
    rows[seen[key]][1] = parseAmount(rows[seen[key]][1]) + amt;
    return;
  }
  seen[key] = rows.length;
  rows.push([s, amt, src]);
}

async function fetchSpotExact(creds, flexibleAssets) {
  const rows = [], seen = {};
  const acc = await signedGet("/api/v3/account", {}, creds);
  const balances = (acc && acc.balances) || [];
  for (const b of balances) {
    const asset = String(b.asset || "");
    if (/^LD[0-9A-Z]/.test(asset)) {
      const base = asset.slice(2).toUpperCase();
      if ((flexibleAssets && flexibleAssets.has(base)) || base.length >= 2) {
        continue; // reflet Earn flexible dans le wallet Spot
      }
    }
    const total = parseAmount(b.free) + parseAmount(b.locked);
    if (total > 0) pushRowExact(rows, seen, b.asset, total);
  }
  return rows;
}

async function fetchEarnExact(creds, kind, amountKey) {
  const rows = [], seen = {};
  let page = 1;
  while (page <= MAX_PAGES) {
    const data = await signedGet(
      "/sapi/v1/simple-earn/" + kind + "/position",
      { current: page, size: PAGE_SIZE },
      creds
    );
    const list = (data && data.rows) || [];
    for (const r of list) {
      const amt = parseAmount(r[amountKey]);
      if (amt > 0) pushRowExact(rows, seen, r.asset, amt);
    }
    const total = data && typeof data.total !== "undefined" ? Number(data.total) : list.length;
    if (list.length < PAGE_SIZE) break;
    if (page * PAGE_SIZE >= total) break;
    page++;
  }
  return rows;
}

async function fetchPricesEur(symbols) {
  const unique = Array.from(new Set(symbols.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const prices = {};
  if (unique.length === 0) return prices;

  const allTickers = await publicGet("/api/v3/ticker/price", null).catch(() => []);
  const tickerMap = new Map();
  if (Array.isArray(allTickers)) {
    for (const row of allTickers) {
      if (row && row.symbol) tickerMap.set(String(row.symbol).toUpperCase(), parseAmount(row.price));
    }
  }
  const eurUsd = tickerMap.get("EURUSDT") || tickerMap.get("EURUSDC") || 0;
  const eurPerUsd = eurUsd > 0 ? eurUsd : 1.08;

  for (const s of unique) {
    if (s === "EUR" || s === "EURI" || s === "EURC" || s === "BCPEUR") {
      prices[s] = { priceEur: 1, source: "binance:fiat-eur" };
      continue;
    }
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = { priceEur: 1 / eurPerUsd, source: "binance:stable-usd" };
      continue;
    }
    const directPrice = tickerMap.get(s + "EUR") || 0;
    if (directPrice > 0) {
      prices[s] = { priceEur: directPrice, source: "binance:" + s + "EUR" };
      continue;
    }
    const usdPrice = tickerMap.get(s + "USDT") || tickerMap.get(s + "USDC") || 0;
    if (usdPrice > 0) {
      prices[s] = { priceEur: usdPrice / eurPerUsd, source: "binance:" + s + "USDT" };
    }
  }
  return prices;
}

async function fetchBinancePricesUsd(symbols) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const prices = {};
  if (unique.length === 0) return prices;
  const allTickers = await publicGet("/api/v3/ticker/price", null).catch(() => []);
  const tickerMap = new Map();
  if (Array.isArray(allTickers)) {
    for (const row of allTickers) {
      if (row && row.symbol) tickerMap.set(String(row.symbol).toUpperCase(), parseAmount(row.price));
    }
  }
  for (const s of unique) {
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = 1;
      continue;
    }
    const usdPrice = tickerMap.get(s + "USDT") || tickerMap.get(s + "USDC") || 0;
    if (usdPrice > 0) prices[s] = usdPrice;
  }
  return prices;
}

function mapBybitTickerPricesEur(symbols, tickers, eurPerUsd) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const tickerMap = new Map();
  for (const row of Array.isArray(tickers) ? tickers : []) {
    if (row && row.symbol) tickerMap.set(String(row.symbol).toUpperCase(), parseAmount(row.lastPrice));
  }
  const prices = {};
  for (const s of unique) {
    if (s === "EUR" || s === "EURI" || s === "EURC" || s === "BCPEUR") {
      prices[s] = { priceEur: 1, source: "bybit:fiat-eur" };
      continue;
    }
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = { priceEur: 1 / eurPerUsd, source: "bybit:stable-usd" };
      continue;
    }
    const directPrice = tickerMap.get(s + "EUR") || 0;
    if (directPrice > 0) {
      prices[s] = { priceEur: directPrice, source: "bybit:" + s + "EUR" };
      continue;
    }
    const usdPrice = tickerMap.get(s + "USDT") || tickerMap.get(s + "USDC") || 0;
    if (usdPrice > 0) prices[s] = { priceEur: usdPrice / eurPerUsd, source: "bybit:" + s + "USDT" };
  }
  return prices;
}

function mapCoinbaseTickerPricesEur(symbols, rates, eurPerUsd) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const prices = {};
  for (const s of unique) {
    if (s === "EUR" || s === "EURI" || s === "EURC" || s === "BCPEUR") {
      prices[s] = { priceEur: 1, source: "coinbase:fiat-eur" };
      continue;
    }
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = { priceEur: 1 / eurPerUsd, source: "coinbase:stable-usd" };
      continue;
    }
    const quote = rates && rates[s];
    const usdPrice = parseAmount(quote && quote.amount);
    if (usdPrice > 0) prices[s] = { priceEur: usdPrice / eurPerUsd, source: "coinbase:" + s + "-USD" };
  }
  return prices;
}

function mapOkxTickerPricesEur(symbols, tickers, eurPerUsd) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const tickerMap = new Map();
  for (const row of Array.isArray(tickers) ? tickers : []) {
    if (row && row.instId) tickerMap.set(String(row.instId).toUpperCase(), parseAmount(row.last));
  }
  const prices = {};
  for (const s of unique) {
    if (s === "EUR" || s === "EURI" || s === "EURC" || s === "BCPEUR") {
      prices[s] = { priceEur: 1, source: "okx:fiat-eur" };
      continue;
    }
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = { priceEur: 1 / eurPerUsd, source: "okx:stable-usd" };
      continue;
    }
    const directPrice = tickerMap.get(s + "-EUR") || 0;
    if (directPrice > 0) {
      prices[s] = { priceEur: directPrice, source: "okx:" + s + "-EUR" };
      continue;
    }
    const usdPrice = tickerMap.get(s + "-USDT") || tickerMap.get(s + "-USDC") || 0;
    if (usdPrice > 0) prices[s] = { priceEur: usdPrice / eurPerUsd, source: "okx:" + s + "-USDT" };
  }
  return prices;
}

async function fetchBybitPricesEur(symbols) {
  const resp = await fetch(BYBIT_BASE_URL + "/v5/market/tickers?category=spot");
  const text = await resp.text();
  if (!resp.ok) throw new Error("ByBit public tickers HTTP " + resp.status + ": " + text.slice(0, 300));
  const json = JSON.parse(text);
  const list = json && json.result && json.result.list;
  const eurUsdt = Array.isArray(list) ? list.find((r) => String(r && r.symbol).toUpperCase() === "EURUSDT") : null;
  const eurPerUsd = parseAmount(eurUsdt && eurUsdt.lastPrice) || 1.08;
  return mapBybitTickerPricesEur(symbols, list, eurPerUsd);
}

function mapBybitTickerPricesUsd(symbols, tickers) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const tickerMap = new Map();
  for (const row of Array.isArray(tickers) ? tickers : []) {
    if (row && row.symbol) tickerMap.set(String(row.symbol).toUpperCase(), parseAmount(row.lastPrice));
  }
  const prices = {};
  for (const s of unique) {
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = 1;
      continue;
    }
    const usdPrice = tickerMap.get(s + "USDT") || tickerMap.get(s + "USDC") || 0;
    if (usdPrice > 0) prices[s] = usdPrice;
  }
  return prices;
}

async function fetchBybitPricesUsd(symbols) {
  const resp = await fetch(BYBIT_BASE_URL + "/v5/market/tickers?category=spot");
  const text = await resp.text();
  if (!resp.ok) throw new Error("ByBit public tickers HTTP " + resp.status + ": " + text.slice(0, 300));
  const json = JSON.parse(text);
  const list = json && json.result && json.result.list;
  return mapBybitTickerPricesUsd(symbols, list);
}

async function fetchCoinbasePricesEur(symbols) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const wanted = unique.filter((s) => !["EUR", "EURI", "EURC", "BCPEUR", "USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s));
  const out = {};
  if (unique.length === 0) return out;

  const eurResp = await fetch(COINBASE_BASE_URL + "/v2/exchange-rates?currency=EUR");
  const eurText = await eurResp.text();
  if (!eurResp.ok) throw new Error("Coinbase EUR rates HTTP " + eurResp.status + ": " + eurText.slice(0, 300));
  const eurJson = JSON.parse(eurText);
  const eurUsd = parseAmount(eurJson && eurJson.data && eurJson.data.rates && eurJson.data.rates.USD) || 1.08;

  const rates = {};
  await Promise.all(wanted.map(async (s) => {
    const resp = await fetch(COINBASE_BASE_URL + "/v2/prices/" + encodeURIComponent(s + "-USD") + "/spot");
    const text = await resp.text();
    if (!resp.ok) return;
    const json = text ? JSON.parse(text) : null;
    if (json && json.data) rates[s] = json.data;
  }));
  Object.assign(out, mapCoinbaseTickerPricesEur(unique, rates, eurUsd));
  return out;
}

async function fetchCoinbasePricesUsd(symbols) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const prices = {};
  await Promise.all(unique.map(async (s) => {
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = 1;
      return;
    }
    const resp = await fetch(COINBASE_BASE_URL + "/v2/prices/" + encodeURIComponent(s + "-USD") + "/spot");
    const text = await resp.text();
    if (!resp.ok) return;
    const json = text ? JSON.parse(text) : null;
    const price = parseAmount(json && json.data && json.data.amount);
    if (price > 0) prices[s] = price;
  }));
  return prices;
}

async function fetchOkxPricesEur(symbols) {
  const resp = await fetch(OKX_BASE_URL + "/api/v5/market/tickers?instType=SPOT");
  const text = await resp.text();
  if (!resp.ok) throw new Error("OKX public tickers HTTP " + resp.status + ": " + text.slice(0, 300));
  const json = JSON.parse(text);
  const list = json && json.data;
  const eurUsdt = Array.isArray(list) ? list.find((r) => String(r && r.instId).toUpperCase() === "EUR-USDT") : null;
  const eurPerUsd = parseAmount(eurUsdt && eurUsdt.last) || 1.08;
  return mapOkxTickerPricesEur(symbols, list, eurPerUsd);
}

function mapOkxTickerPricesUsd(symbols, tickers) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const tickerMap = new Map();
  for (const row of Array.isArray(tickers) ? tickers : []) {
    if (row && row.instId) tickerMap.set(String(row.instId).toUpperCase(), parseAmount(row.last));
  }
  const prices = {};
  for (const s of unique) {
    if (["USD", "USDT", "USDC", "TUSD", "FDUSD", "BUSD", "DAI"].includes(s)) {
      prices[s] = 1;
      continue;
    }
    const usdPrice = tickerMap.get(s + "-USDT") || tickerMap.get(s + "-USDC") || 0;
    if (usdPrice > 0) prices[s] = usdPrice;
  }
  return prices;
}

async function fetchOkxPricesUsd(symbols) {
  const resp = await fetch(OKX_BASE_URL + "/api/v5/market/tickers?instType=SPOT");
  const text = await resp.text();
  if (!resp.ok) throw new Error("OKX public tickers HTTP " + resp.status + ": " + text.slice(0, 300));
  const json = JSON.parse(text);
  return mapOkxTickerPricesUsd(symbols, json && json.data);
}

async function enrichOkxRowsWithUsdPrices(rows, fetchPricesUsd) {
  return enrichRowsWithUsdPrices(rows, fetchPricesUsd);
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// --- Stock prices (Yahoo blocks Apps Script + WCORE API datacenter IPs) -------
// Yahoo Finance refuses connections from many datacenter IPs (`fetch failed`),
// exactly like Binance HTTP 451. This relay (Railway IP) reaches Yahoo, prices
// Bitpanda stock/ETF symbols, converts to EUR, and returns a {SYMBOL:{...}} map.
// Multi-user safe: no secrets, just symbol -> price. Protected by RELAY_TOKEN.

const STOCK_YAHOO_SYMBOLS = {
  "AMD-US": ["AMD"], "JPM-US": ["JPM"], "LLYC-US": ["LLY"], "WMT-US": ["WMT"],
  BRKB: ["BRK-B"], "BRK.B": ["BRK-B"], "BRK-B": ["BRK-B"],
  FB: ["META"], MRKUS: ["MRK"], RDSA: ["SHEL"], TSFA: ["TSM"],
  TCTZF: ["TCEHY", "TCTZF"], NOVO: ["NVO", "NOVO-B.CO"], SPCX: ["SPCX"],
  BROA: ["AVGO"],
  // Toyota: Bitpanda unit tracks the Tokyo ordinary share (7203.T), NOT the US ADR
  // (TM ADR = 10 ordinary shares). Yahoo "TM" would misprice by ~10x.
  TM: ["7203.T"],
  // Korean tickers (Yahoo .KS, priced in KRW). SSU/SMSN = Samsung receipt.
  SSU: ["005930.KS"], SMSN: ["005930.KS"], HYXS: ["000660.KS"],
  ADS: ["ADS.DE"], AIR: ["AIR.PA"], ALV: ["ALV.DE"], BAS: ["BAS.DE"],
  BAYN: ["BAYN.DE"], BMW: ["BMW.DE"], CBK: ["CBK.DE"], DBK: ["DBK.DE"],
  DTE: ["DTE.DE"], ENR: ["ENR.DE"], HEN3: ["HEN3.DE"], IFX: ["IFX.DE"],
  RHM: ["RHM.DE"], SAP: ["SAP.DE", "SAP"], SIE: ["SIE.DE"], VOW3: ["VOW3.DE"],
  ASML: ["ASML.AS", "ASML"], MC: ["MC.PA"], OR: ["OR.PA"], RMS: ["RMS.PA"],
  SAN: ["SAN.MC", "SAN"], TTE: ["TTE.PA", "TTE"], IBE: ["IBE.MC"],
  NESN: ["NESN.SW"], NOVN: ["NOVN.SW"], ROG: ["RO.SW"],
  SHEL: ["SHEL.L", "SHEL"], EUNL: ["EUNL.DE"], IS3N: ["IS3N.DE"],
  QDVE: ["QDVE.DE"], SXR8: ["SXR8.DE"], VUSA: ["VUSA.DE", "VUSA.L"],
  VWCE: ["VWCE.DE"], VWRL: ["VWRL.AS", "VWRL.L"],
};

function stockYahooCandidates(symbol) {
  const s = String(symbol || "").trim().toUpperCase();
  if (!s) return [];
  const explicit = STOCK_YAHOO_SYMBOLS[s];
  if (explicit && explicit.length > 0) {
    // Explicit mappings are exhaustive: do NOT append the raw symbol as fallback.
    // Example: ROG maps to ROG.SW (Roche); falling back to Yahoo "ROG" would hit
    // Rogers Corp (US) and silently misprice. Entries that want the US listing as
    // fallback list it explicitly (SAP, ASML, SHEL, TCTZF...).
    return Array.from(new Set(explicit));
  }
  const withoutUs = s.endsWith("-US") ? s.slice(0, -3) : "";
  const normalized = s.indexOf(".") >= 0 ? s.replace(/\./g, "-") : "";
  return Array.from(new Set([s, withoutUs, normalized].filter(Boolean)));
}

async function yahooChartPrice(candidate, options) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(candidate) + "?range=1d&interval=1d";
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (WCORE relay)" },
    signal: options && options.signal,
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
  const price = meta && meta.regularMarketPrice;
  if (!price || price <= 0) return null;
  const rawCcy = meta && typeof meta.currency === "string" ? meta.currency.trim() : "";
  if (!rawCcy) return null;
  return { price: price, currency: stockQuoteCurrency(rawCcy), currencyRaw: rawCcy };
}

const STOCK_QUOTE_MAX_SYMBOLS = 300;
const STOCK_QUOTE_CONCURRENCY = 8;
const STOCK_QUOTE_TIMEOUT_MS = 8000;
const STOCK_QUOTE_REQUEST_TIMEOUT_MS = 30000;
const STOCK_SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,31}$/;
const STOCK_FX_MAX_CURRENCIES = 20;
const STOCK_FX_CONCURRENCY = 4;
const STOCK_FX_TIMEOUT_MS = 5000;
const STOCK_FX_REQUEST_TIMEOUT_MS = 15000;
const STOCK_FX_CURRENCIES = new Set([
  "CNY", "HKD", "CHF", "JPY", "TWD", "GBP", "SEK", "DKK", "NOK",
  "AUD", "CAD", "KRW", "SAR", "AED", "EUR",
]);

function stockQuoteCurrency(value) {
  const currency = String(value || "").trim();
  return currency === "GBp" ? "GBX" : currency.toUpperCase();
}

function combineAbortSignals(signals) {
  const active = (signals || []).filter(Boolean);
  if (active.length === 1) return { signal: active[0], cleanup: function () {} };
  const controller = new AbortController();
  const listeners = [];
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    const onAbort = function () {
      if (!controller.signal.aborted) controller.abort(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    listeners.push([signal, onAbort]);
  }
  return {
    signal: controller.signal,
    cleanup: function () {
      for (const entry of listeners) entry[0].removeEventListener("abort", entry[1]);
    },
  };
}

function stockRequestAbort(req, res, timeoutMs) {
  const disconnected = new AbortController();
  const abortDisconnected = function () {
    if (!disconnected.signal.aborted) disconnected.abort(new Error("client disconnected"));
  };
  const abortPrematureClose = function () {
    if (!res.writableEnded) abortDisconnected();
  };
  req.once("aborted", abortDisconnected);
  res.once("close", abortPrematureClose);
  const combined = combineAbortSignals([disconnected.signal, AbortSignal.timeout(timeoutMs)]);
  return {
    signal: combined.signal,
    cleanup: function () {
      req.removeListener("aborted", abortDisconnected);
      res.removeListener("close", abortPrematureClose);
      combined.cleanup();
    },
  };
}

function normalizeStockQuoteSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length > STOCK_QUOTE_MAX_SYMBOLS) return null;
  const unique = [];
  const seen = new Set();
  for (const value of symbols) {
    if (typeof value !== "string") return null;
    const symbol = value.trim().toUpperCase();
    if (!STOCK_SYMBOL_PATTERN.test(symbol)) return null;
    if (!seen.has(symbol)) {
      seen.add(symbol);
      unique.push(symbol);
    }
  }
  return unique;
}

const STOCK_NATIVE_YAHOO_SYMBOLS = {
  TSFA: ["2330.TW"],
};

function stockNativeYahooCandidates(symbol) {
  const nativeOverride = STOCK_NATIVE_YAHOO_SYMBOLS[symbol];
  if (nativeOverride && nativeOverride.length > 0) return Array.from(new Set(nativeOverride));
  const explicit = STOCK_YAHOO_SYMBOLS[symbol];
  return explicit && explicit.length > 0 ? Array.from(new Set(explicit)) : [symbol];
}

function normalizeStockFxCurrencies(currencies) {
  if (!Array.isArray(currencies) || currencies.length > STOCK_FX_MAX_CURRENCIES) return null;
  const unique = [];
  const seen = new Set();
  for (const value of currencies) {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    const currency = raw.toUpperCase() === "GBX" || raw === "GBp" ? "GBP" : raw.toUpperCase();
    if (!STOCK_FX_CURRENCIES.has(currency)) return null;
    if (!seen.has(currency)) {
      seen.add(currency);
      unique.push(currency);
    }
  }
  return unique;
}

async function collectStockNativeQuotes(symbols, options) {
  const unique = normalizeStockQuoteSymbols(symbols);
  if (!unique || unique.length === 0) return {};
  const opts = options || {};
  const fetchQuote = opts.fetchQuote || yahooChartPrice;
  const concurrency = Math.max(1, Math.floor(opts.concurrency || STOCK_QUOTE_CONCURRENCY));
  const timeoutMs = Math.max(1, Math.floor(opts.timeoutMs || STOCK_QUOTE_TIMEOUT_MS));
  const requestSignal = opts.signal;
  const quotes = {};
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < unique.length && !(requestSignal && requestSignal.aborted)) {
      const symbol = unique[nextIndex++];
      for (const candidate of stockNativeYahooCandidates(symbol)) {
        if (requestSignal && requestSignal.aborted) break;
        const combined = combineAbortSignals([requestSignal, AbortSignal.timeout(timeoutMs)]);
        try {
          const hit = await fetchQuote(candidate, { signal: combined.signal });
          if (!hit || !Number.isFinite(hit.price) || hit.price <= 0 || !hit.currency) continue;
          quotes[symbol] = {
            priceNative: hit.price,
            currency: stockQuoteCurrency(hit.currency),
            yahooTicker: candidate,
            source: "yahoo:relay",
          };
          break;
        } catch (_e) { /* try next candidate */ }
        finally { combined.cleanup(); }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
  return quotes;
}

async function collectStockFxQuotes(currencies, options) {
  const unique = normalizeStockFxCurrencies(currencies);
  if (!unique || unique.length === 0) return {};
  const opts = options || {};
  const fetchQuote = opts.fetchQuote || yahooChartPrice;
  const concurrency = Math.max(1, Math.floor(opts.concurrency || STOCK_FX_CONCURRENCY));
  const timeoutMs = Math.max(1, Math.floor(opts.timeoutMs || STOCK_FX_TIMEOUT_MS));
  const requestSignal = opts.signal;
  const quotes = {};
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < unique.length && !(requestSignal && requestSignal.aborted)) {
      const currency = unique[nextIndex++];
      if (currency === "EUR") {
        quotes.EUR = { unitsPerEur: 1, currency: "EUR", yahooTicker: "EUR", source: "identity:eur" };
        continue;
      }
      const yahooTicker = "EUR" + currency + "=X";
      const combined = combineAbortSignals([requestSignal, AbortSignal.timeout(timeoutMs)]);
      try {
        const hit = await fetchQuote(yahooTicker, { signal: combined.signal });
        if (!hit || !Number.isFinite(hit.price) || hit.price <= 0) continue;
        quotes[currency] = { unitsPerEur: hit.price, currency: currency, yahooTicker: yahooTicker, source: "yahoo:relay" };
      } catch (_e) { /* omit unavailable rates */ }
      finally { combined.cleanup(); }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
  return quotes;
}

// Bitpanda receipt factors: SSU/SMSN is a Samsung receipt ~= 1/25 of the
// ordinary KRX:005930 share (mirrors wcore-gsheet's x25 quantity factor).
// Samsung receipts: 1 Bitpanda SSU/SMSN unit represents ~25 ordinary KRX:005930
// shares (mirrors wcore-gsheet's x25 factor). Verified against the Bitpanda app:
// 0.00991373 SSU = 43.77 EUR -> unit price ~4415 EUR = 25 x ordinary share.
const STOCK_RECEIPT_MULTIPLIER = { SSU: 25, SMSN: 25 };

// Per-EUR rate for non-USD currencies. e.g. EURCHF=X price = CHF per 1 EUR,
// so priceEur = priceCcy / rate. GBp = pence (1/100 GBP).
async function yahooEurRate(pair) {
  const hit = await yahooChartPrice(pair).catch(() => null);
  return hit && hit.price > 0 ? hit.price : 0;
}

async function fetchStockPricesEur(symbols) {
  const unique = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const out = {};
  if (unique.length === 0) return out;

  // EUR/USD from Binance ticker (reachable from relay), fallback 1.08.
  let eurPerUsd = 1.08;
  try {
    const tickers = await publicGet("/api/v3/ticker/price", null).catch(() => []);
    if (Array.isArray(tickers)) {
      for (const row of tickers) {
        if (row && (String(row.symbol).toUpperCase() === "EURUSDT" || String(row.symbol).toUpperCase() === "EURUSDC")) {
          const v = parseAmount(row.price);
          if (v > 0) { eurPerUsd = v; break; }
        }
      }
    }
  } catch (_e) { /* keep fallback */ }

  // Lazy-loaded non-USD EUR rates (per 1 EUR), cached for this request.
  const rates = {};
  async function rateFor(ccy) {
    if (rates[ccy] != null) return rates[ccy];
    const pair = "EUR" + ccy + "=X";
    rates[ccy] = await yahooEurRate(pair);
    return rates[ccy];
  }

  async function toEur(price, currency, currencyRaw) {
    const ccy = String(currency || "USD").toUpperCase();
    // Yahoo reports London pence as "GBp" (lowercase p): 1 GBP = 100 GBp.
    if (String(currencyRaw || "") === "GBp") {
      const r = await rateFor("GBP");
      return r > 0 ? { eur: (price / 100) / r, tag: "gbx" } : null;
    }
    if (ccy === "EUR") return { eur: price, tag: "eur" };
    if (ccy === "USD") return { eur: price / eurPerUsd, tag: "usd" };
    // GBP, CHF, KRW, JPY, etc. via EUR{CCY}=X (CCY per 1 EUR).
    const r = await rateFor(ccy);
    if (r > 0) return { eur: price / r, tag: ccy.toLowerCase() };
    return null;
  }

  for (const sym of unique) {
    let result = null;
    for (const candidate of stockYahooCandidates(sym)) {
      try {
        const hit = await yahooChartPrice(candidate);
        if (!hit) continue;
        const conv = await toEur(hit.price, hit.currency, hit.currencyRaw);
        if (!conv) continue;
        let priceEur = conv.eur;
        const multiplier = STOCK_RECEIPT_MULTIPLIER[sym];
        if (multiplier && multiplier > 0) priceEur = priceEur * multiplier;
        result = { priceEur: priceEur, source: "yahoo:" + conv.tag + ":" + candidate + (multiplier ? ":x" + multiplier : "") };
        break;
      } catch (_e) { /* try next candidate */ }
    }
    if (result) out[sym] = result;
  }
  return out;
}

app.post("/stock/prices", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const body = req.body || {};
    const token = body.token || req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const symbols = Array.isArray(body.symbols) ? body.symbols.slice(0, 300) : [];
    const prices = await fetchStockPricesEur(symbols);
    res.json({ ok: true, ts: new Date().toISOString(), prices: prices });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.post("/stock/quotes", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const body = req.body || {};
    const token = body.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const symbols = normalizeStockQuoteSymbols(body.symbols);
    if (!symbols) {
      return res.status(400).json({ ok: false, error: "invalid_symbols" });
    }
    const requestAbort = stockRequestAbort(req, res, STOCK_QUOTE_REQUEST_TIMEOUT_MS);
    try {
      const quotes = await collectStockNativeQuotes(symbols, { signal: requestAbort.signal });
      if (!res.destroyed && !res.writableEnded) res.json({ ok: true, quotes: quotes });
    } finally {
      requestAbort.cleanup();
    }
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.post("/stock/fx-quotes", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const body = req.body || {};
    const token = body.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const currencies = normalizeStockFxCurrencies(body.currencies);
    if (!currencies) {
      return res.status(400).json({ ok: false, error: "invalid_currencies" });
    }
    const configuredTimeoutMs = process.env.NODE_ENV === "test" ? Number(app.locals.stockFxRequestTimeoutMs) : NaN;
    const requestTimeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0
      ? configuredTimeoutMs
      : STOCK_FX_REQUEST_TIMEOUT_MS;
    const requestAbort = stockRequestAbort(req, res, requestTimeoutMs);
    try {
      const quotes = await collectStockFxQuotes(currencies, { signal: requestAbort.signal });
      if (!res.destroyed && !res.writableEnded) res.json({ ok: true, quotes: quotes });
    } finally {
      requestAbort.cleanup();
    }
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.get("/coinbase", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const token = req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const spotRaw = await coinbaseFetchAccounts();
    const spot = await enrichRowsWithUsdPricesSafe(spotRaw, app.locals.fetchCoinbasePricesUsd || fetchCoinbasePricesUsd, "coinbase");
    res.json({ ok: true, ts: new Date().toISOString(), spot: spot });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.get("/okx", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const token = req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const fetchBalances = app.locals.okxFetchBalances || okxFetchBalances;
    const fetchPricesUsd = app.locals.fetchOkxPricesUsd || fetchOkxPricesUsd;
    const spot = await enrichRowsWithUsdPricesSafe(await fetchBalances(), fetchPricesUsd, "okx");
    res.json({ ok: true, ts: new Date().toISOString(), spot: spot });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.post("/coinbase/account", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const body = req.body || {};
    const token = body.token || req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const keyName = String(body.apiKey || "").trim();
    const privateKey = String(body.apiSecret || "").trim();
    if (keyName.length < 10 || privateKey.length < 10) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }
    const spot = await coinbaseFetchAccountsExact({ keyName: keyName, privateKey: privateKey });
    const prices = await fetchCoinbasePricesEur(spot.map((r) => r[0])).catch((errPrices) => {
      console.log("coinbase price fetch skipped: " + (errPrices && errPrices.message ? errPrices.message : errPrices));
      return {};
    });
    res.json({ ok: true, ts: new Date().toISOString(), spot: spot, prices: prices });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.post("/okx/account", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const body = req.body || {};
    const token = body.token || req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const key = String(body.apiKey || "").trim();
    const secret = String(body.apiSecret || "").trim();
    const passphrase = String(body.apiPassphrase || "").trim();
    if (key.length < 10 || secret.length < 10 || passphrase.length < 1) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }
    const spotRaw = await okxFetchBalancesExact({ key: key, secret: secret, passphrase: passphrase });
    const spot = await enrichOkxRowsWithUsdPrices(spotRaw, fetchOkxPricesUsd).catch((errUsd) => {
      console.log("okx USD price enrichment skipped: " + (errUsd && errUsd.message ? errUsd.message : errUsd));
      return spotRaw;
    });
    const prices = await fetchOkxPricesEur(spot.map((r) => r[0])).catch((errPrices) => {
      console.log("okx price fetch skipped: " + (errPrices && errPrices.message ? errPrices.message : errPrices));
      return {};
    });
    res.json({ ok: true, ts: new Date().toISOString(), spot: spot, prices: prices });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});


// --- ByBit EU (api.bybit.eu geo-blocks Apps Script IPs; Railway EU West passes) -
// Replique src/38_BYBIT_SYNC.gs: UNIFIED wallet-balance + FUND coins-balance,
// signature HMAC-SHA256, aliases stablecoins, buckets fusionnes.

const BYBIT_BASE_URL = "https://api.bybit.eu";
const BYBIT_RECV_WINDOW = "20000";
const BYBIT_API_ID_EU = "Cg000971";

const BYBIT_SYMBOL_ALIASES = {
  USDC: "USDT", TUSD: "USDT", USD: "USDT",
  EUR: "EURC", EURI: "EURC", EURT: "EURC",
};

function bybitCanonical(sym) {
  const s = String(sym || "").trim().toUpperCase();
  return BYBIT_SYMBOL_ALIASES[s] || s;
}

function bybitPushRow(rows, seen, symbol, amount) {
  const s = bybitCanonical(symbol);
  if (!s) return;
  const amt = parseAmount(amount);
  if (amt <= 0) return;
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = parseAmount(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}

function bybitPushRowExact(rows, seen, symbol, amount) {
  const s = String(symbol || "").trim().toUpperCase();
  if (!s) return;
  const amt = parseAmount(amount);
  if (amt <= 0) return;
  if (Object.prototype.hasOwnProperty.call(seen, s)) {
    rows[seen[s]][1] = parseAmount(rows[seen[s]][1]) + amt;
    return;
  }
  seen[s] = rows.length;
  rows.push([s, amt]);
}

function bybitSign(ts, apiKey, query, secret) {
  return crypto.createHmac("sha256", secret)
    .update(String(ts) + String(apiKey) + BYBIT_RECV_WINDOW + String(query || ""))
    .digest("hex");
}

async function bybitAuthGet(path, queryObj, creds) {
  const parts = [];
  for (const k in (queryObj || {})) {
    if (Object.prototype.hasOwnProperty.call(queryObj, k)) {
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(queryObj[k])));
    }
  }
  parts.sort();
  const query = parts.join("&");
  const ts = String(Date.now());
  const sig = bybitSign(ts, creds.key, query, creds.secret);
  const url = BYBIT_BASE_URL + path + (query ? "?" + query : "");
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": creds.key,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": BYBIT_RECV_WINDOW,
      "X-BAPI-SIGN": sig,
      "X-BAPI-SIGN-TYPE": "2",
      "x-referer": BYBIT_API_ID_EU,
    },
  });
  const text = await resp.text();
  if (resp.status === 403 || resp.status === 451) {
    throw new Error("ByBit IP/geo blocked (HTTP " + resp.status + "): " + text.slice(0, 200));
  }
  if (!resp.ok) {
    throw new Error("ByBit " + path + " HTTP " + resp.status + ": " + text.slice(0, 300));
  }
  const json = JSON.parse(text);
  if (json && json.retCode && Number(json.retCode) !== 0) {
    throw new Error("ByBit retCode " + json.retCode + ": " + (json.retMsg || text.slice(0, 250)));
  }
  return json;
}

async function bybitFetchUnified(rows, seen, creds) {
  const data = await bybitAuthGet("/v5/account/wallet-balance", { accountType: "UNIFIED" }, creds);
  const list = data && data.result && data.result.list;
  if (!Array.isArray(list)) return;
  for (const acct of list) {
    const coins = acct && acct.coin;
    if (!Array.isArray(coins)) continue;
    for (const c of coins) {
      let total = c.walletBalance;
      if (total == null || total === "") total = c.equity;
      bybitPushRow(rows, seen, c.coin, total);
      cexMergeRowUsdMetadata(rows[seen[bybitCanonical(c.coin)]], { valueUsd: c.usdValue });
    }
  }
}

async function bybitFetchFund(rows, seen, creds) {
  const data = await bybitAuthGet("/v5/asset/transfer/query-account-coins-balance", { accountType: "FUND" }, creds);
  const bal = data && data.result && data.result.balance;
  if (!Array.isArray(bal)) return;
  for (const c of bal) {
    let total = c.walletBalance;
    if (total == null || total === "") total = c.transferBalance;
    bybitPushRow(rows, seen, c.coin, total);
  }
}

async function bybitFetchUnifiedExact(rows, seen, creds) {
  const data = await bybitAuthGet("/v5/account/wallet-balance", { accountType: "UNIFIED" }, creds);
  const list = data && data.result && data.result.list;
  if (!Array.isArray(list)) return;
  for (const acct of list) {
    const coins = acct && acct.coin;
    if (!Array.isArray(coins)) continue;
    for (const c of coins) {
      let total = c.walletBalance;
      if (total == null || total === "") total = c.equity;
      bybitPushRowExact(rows, seen, c.coin, total);
    }
  }
}

async function bybitFetchFundExact(rows, seen, creds) {
  const data = await bybitAuthGet("/v5/asset/transfer/query-account-coins-balance", { accountType: "FUND" }, creds);
  const bal = data && data.result && data.result.balance;
  if (!Array.isArray(bal)) return;
  for (const c of bal) {
    let total = c.walletBalance;
    if (total == null || total === "") total = c.transferBalance;
    bybitPushRowExact(rows, seen, c.coin, total);
  }
}

app.get("/bybit", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const token = req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const creds = { key: getEnv("BYBIT_API_KEY"), secret: getEnv("BYBIT_API_SECRET") };
    const rows = [], seen = {};
    await bybitFetchUnified(rows, seen, creds);
    try {
      await bybitFetchFund(rows, seen, creds);
    } catch (errFund) {
      // FUND optional: keep UNIFIED rows if FUND fails
      console.log("bybit FUND fetch skipped: " + (errFund && errFund.message ? errFund.message : errFund));
    }
    const spot = await enrichRowsWithUsdPricesSafe(rows, app.locals.fetchBybitPricesUsd || fetchBybitPricesUsd, "bybit");
    res.json({ ok: true, ts: new Date().toISOString(), spot: spot });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.post("/bybit/account", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const body = req.body || {};
    const token = body.token || req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const key = String(body.apiKey || "").trim();
    const secret = String(body.apiSecret || "").trim();
    if (key.length < 10 || secret.length < 10) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }
    const creds = { key: key, secret: secret };
    const rows = [], seen = {};
    await bybitFetchUnifiedExact(rows, seen, creds);
    try {
      await bybitFetchFundExact(rows, seen, creds);
    } catch (errFund) {
      console.log("bybit FUND fetch skipped: " + (errFund && errFund.message ? errFund.message : errFund));
    }
    const prices = await fetchBybitPricesEur(rows.map((r) => r[0])).catch((errPrices) => {
      console.log("bybit price fetch skipped: " + (errPrices && errPrices.message ? errPrices.message : errPrices));
      return {};
    });
    res.json({ ok: true, ts: new Date().toISOString(), spot: rows, prices: prices });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

app.get("/binance", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const token = req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const creds = { key: getEnv("BINANCE_API_KEY"), secret: getEnv("BINANCE_API_SECRET") };
    const flexible = await fetchEarn(creds, "flexible", "totalAmount");
    const locked = await fetchEarn(creds, "locked", "amount");
    const flexibleAssets = new Set(flexible.map((r) => String(r[0]).toUpperCase()));
    const fetchBinanceUsd = app.locals.fetchBinancePricesUsd || fetchBinancePricesUsd;
    const spot = await enrichRowsWithUsdPricesSafe(await fetchSpot(creds, flexibleAssets), fetchBinanceUsd, "binance spot");
    const flexibleValued = await enrichRowsWithUsdPricesSafe(flexible, fetchBinanceUsd, "binance earn-flexible");
    const lockedValued = await enrichRowsWithUsdPricesSafe(locked, fetchBinanceUsd, "binance earn-locked");
    res.json({
      ok: true,
      ts: new Date().toISOString(),
      spot: spot,
      "earn-flexible": flexibleValued,
      "earn-locked": lockedValued,
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

// Multi-user (WCORE web): l'API WCORE envoie les cles API du user (jamais le
// navigateur). Protege par RELAY_TOKEN. Symboles NON fusionnes.
app.post("/binance/account", async (req, res) => {
  try {
    const expected = getEnv("RELAY_TOKEN");
    const body = req.body || {};
    const token = body.token || req.query.token || "";
    if (!timingSafeEqual(token, expected)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const key = String(body.apiKey || "").trim();
    const secret = String(body.apiSecret || "").trim();
    if (key.length < 10 || secret.length < 10) {
      return res.status(400).json({ ok: false, error: "missing_credentials" });
    }
    const creds = { key: key, secret: secret };
    const flexible = await fetchEarnExact(creds, "flexible", "totalAmount");
    const locked = await fetchEarnExact(creds, "locked", "amount");
    const flexibleAssets = new Set(flexible.map((r) => String(r[0]).toUpperCase()));
    const spot = await fetchSpotExact(creds, flexibleAssets);
    const allSymbols = spot.concat(flexible, locked).map((r) => r[0]);
    const prices = await fetchPricesEur(allSymbols);
    res.json({
      ok: true,
      ts: new Date().toISOString(),
      spot: spot,
      "earn-flexible": flexible,
      "earn-locked": locked,
      prices: prices,
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log("wcore-cex-relay listening on " + PORT);
  });
}

module.exports = {
  app,
  coinbaseCanonical,
  normalizeCoinbasePrivateKeyPem,
  derToJose,
  okxCanonical,
  okxSign,
  okxPushRow,
  mergeOkxEarnBalances,
  mapBybitTickerPricesEur,
  mapCoinbaseTickerPricesEur,
  mapOkxTickerPricesEur,
  mapBybitTickerPricesUsd,
  cexMergeRowUsdMetadata,
  enrichRowsWithUsdPrices,
  enrichRowsWithUsdPricesSafe,
  mapOkxTickerPricesUsd,
  enrichOkxRowsWithUsdPrices,
  collectStockFxQuotes,
  collectStockNativeQuotes,
  normalizeStockFxCurrencies,
  normalizeStockQuoteSymbols,
};
