#!/usr/bin/env node
// defillama-mcp - MCP stdio server for DefiLlama cascade pricing validation (WCORE debug helper)
"use strict";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

const PROTOCOL_VERSION = "2024-11-05";
const QUOTA_FILE = path.resolve(__dirname, "llama-quota.json");

const COINS_BASE = "https://coins.llama.fi";
const API_BASE = "https://api.llama.fi";
const STABLE_BASE = "https://stablecoins.llama.fi";
const DEXS_BASE = "https://api.dexscreener.com";
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const CG_BASE = "https://api.coingecko.com/api/v3";

// --- quota tracking ---
function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadQuota() {
  try {
    const j = JSON.parse(fs.readFileSync(QUOTA_FILE, "utf8"));
    if (j.date !== todayStr()) return { date: todayStr(), count: 0, byHost: {} };
    if (!j.byHost) j.byHost = {};
    return j;
  } catch (_) {
    return { date: todayStr(), count: 0, byHost: {} };
  }
}
function saveQuota(q) {
  try { fs.writeFileSync(QUOTA_FILE, JSON.stringify(q, null, 2)); } catch (_) {}
}
function bumpQuota(url) {
  const q = loadQuota();
  q.count += 1;
  try {
    const host = new URL(url).host;
    q.byHost[host] = (q.byHost[host] || 0) + 1;
  } catch (_) {}
  saveQuota(q);
}

// --- http helper ---
async function httpGet(url, { timeoutMs = 15000 } = {}) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  bumpQuota(url);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { "user-agent": "wcore-defillama-mcp/1.0" } });
    const text = await res.text();
    const latency = Date.now() - t0;
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: res.ok, status: res.status, latency, json, text };
  } catch (e) {
    return { ok: false, status: 0, latency: Date.now() - t0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function textResult(payload, isError = false) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { content: [{ type: "text", text }], isError: !!isError };
}

// --- tool schemas ---
const TOOLS = [
  {
    name: "llama_get_price",
    description: "DefiLlama current price for one or more coins. Coin format: 'ethereum:0xADDR' or 'coingecko:bitcoin'.",
    inputSchema: {
      type: "object",
      properties: {
        coins: { type: "array", items: { type: "string" }, description: "Coin identifiers, e.g. ['ethereum:0x...','coingecko:bitcoin']" },
        searchWidth: { type: "string", description: "Optional searchWidth param (e.g. '4h')" },
      },
      required: ["coins"],
      additionalProperties: false,
    },
  },
  {
    name: "llama_get_price_historical",
    description: "DefiLlama historical price at a unix timestamp (seconds).",
    inputSchema: {
      type: "object",
      properties: {
        coins: { type: "array", items: { type: "string" } },
        timestamp: { type: "number", description: "Unix timestamp in seconds" },
      },
      required: ["coins", "timestamp"],
      additionalProperties: false,
    },
  },
  {
    name: "llama_search_token",
    description: "Search DefiLlama coin index by name or symbol (finds contract addresses).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "llama_get_tvl",
    description: "Current TVL for a DefiLlama protocol slug (e.g. 'uniswap').",
    inputSchema: {
      type: "object",
      properties: { protocol: { type: "string" } },
      required: ["protocol"],
      additionalProperties: false,
    },
  },
  {
    name: "llama_list_protocols",
    description: "List DefiLlama protocols (compact: name, slug, tvl, chain, category). Large response.",
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", description: "Filter by chain name (case-insensitive)" },
        minTvl: { type: "number", description: "Minimum TVL in USD" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "llama_get_chains",
    description: "All chains known to DefiLlama with TVL. Useful to cross-check WCORE's 117 chains.",
    inputSchema: {
      type: "object",
      properties: {
        minTvl: { type: "number", description: "Minimum TVL in USD (default 0)" },
        nameContains: { type: "string", description: "Substring filter (case-insensitive)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "llama_get_stablecoins",
    description: "DefiLlama stablecoin peg registry. Mirrors WCORE stablecoin detection logic.",
    inputSchema: {
      type: "object",
      properties: {
        includePrices: { type: "boolean", description: "Include current prices (default true)" },
        symbol: { type: "string", description: "Filter by symbol (case-insensitive)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "llama_validate_cascade",
    description: "Simulate WCORE cascade: DefiLlama -> DexScreener -> GeckoTerminal. Returns first source that yields a price + latency.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token contract address (EVM 0x... or Solana mint)" },
        chain: { type: "string", description: "Chain slug as used by DefiLlama (e.g. 'ethereum', 'base', 'solana')" },
        gtNetwork: { type: "string", description: "Optional GeckoTerminal network slug (defaults to chain)" },
      },
      required: ["token", "chain"],
      additionalProperties: false,
    },
  },
  {
    name: "llama_batch_prices",
    description: "Batch lookup via DefiLlama /prices/current (single HTTP call). Respects WCORE's 20K HTTP/day quota.",
    inputSchema: {
      type: "object",
      properties: {
        tokens: {
          type: "array",
          items: {
            type: "object",
            properties: { chain: { type: "string" }, address: { type: "string" } },
            required: ["chain", "address"],
            additionalProperties: false,
          },
        },
      },
      required: ["tokens"],
      additionalProperties: false,
    },
  },
  {
    name: "llama_quota_status",
    description: "Return today's DefiLlama/DexScreener/GT call counts tracked by this MCP (llama-quota.json).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// --- tool implementations ---
function encCoinList(coins) {
  return coins.map(encodeURIComponent).join(",");
}

async function tGetPrice(args) {
  const coins = (args.coins || []).filter(Boolean);
  if (coins.length === 0) return textResult("coins[] is required", true);
  const qs = args.searchWidth ? `?searchWidth=${encodeURIComponent(args.searchWidth)}` : "";
  const url = `${COINS_BASE}/prices/current/${encCoinList(coins)}${qs}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  return textResult({ url, latency_ms: r.latency, coins: r.json?.coins || {} });
}

async function tGetPriceHistorical(args) {
  const coins = (args.coins || []).filter(Boolean);
  const ts = Number(args.timestamp);
  if (!coins.length || !Number.isFinite(ts)) return textResult("coins[] and timestamp required", true);
  const url = `${COINS_BASE}/prices/historical/${ts}/${encCoinList(coins)}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  return textResult({ url, latency_ms: r.latency, coins: r.json?.coins || {} });
}

async function tSearchToken(args) {
  const q = String(args.query || "").trim();
  if (!q) return textResult("query required", true);
  const url = `${COINS_BASE}/search?query=${encodeURIComponent(q)}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  const coins = r.json?.coins || r.json || [];
  return textResult({ url, latency_ms: r.latency, count: Array.isArray(coins) ? coins.length : undefined, coins });
}

async function tGetTvl(args) {
  const p = String(args.protocol || "").trim();
  if (!p) return textResult("protocol required", true);
  const url = `${API_BASE}/tvl/${encodeURIComponent(p)}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  return textResult({ url, protocol: p, tvl: r.json, latency_ms: r.latency });
}

async function tListProtocols(args) {
  const url = `${API_BASE}/protocols`;
  const r = await httpGet(url, { timeoutMs: 30000 });
  if (!r.ok || !Array.isArray(r.json)) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  let items = r.json;
  if (args.chain) {
    const c = String(args.chain).toLowerCase();
    items = items.filter((p) => (p.chain || "").toLowerCase() === c || (p.chains || []).map((s) => String(s).toLowerCase()).includes(c));
  }
  if (Number.isFinite(args.minTvl)) items = items.filter((p) => (p.tvl || 0) >= args.minTvl);
  items.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
  const limit = Number.isFinite(args.limit) ? args.limit : 50;
  const compact = items.slice(0, limit).map((p) => ({
    name: p.name, slug: p.slug, tvl: p.tvl, chain: p.chain, chains: p.chains, category: p.category,
  }));
  return textResult({ url, total: items.length, returned: compact.length, latency_ms: r.latency, protocols: compact });
}

async function tGetChains(args) {
  const url = `${API_BASE}/v2/chains`;
  const r = await httpGet(url, { timeoutMs: 30000 });
  if (!r.ok || !Array.isArray(r.json)) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  let items = r.json.map((c) => ({ name: c.name, gecko_id: c.gecko_id, tvl: c.tvl, tokenSymbol: c.tokenSymbol, cmcId: c.cmcId }));
  if (args.nameContains) {
    const s = String(args.nameContains).toLowerCase();
    items = items.filter((c) => (c.name || "").toLowerCase().includes(s));
  }
  if (Number.isFinite(args.minTvl)) items = items.filter((c) => (c.tvl || 0) >= args.minTvl);
  items.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
  return textResult({ url, total: items.length, latency_ms: r.latency, chains: items });
}

async function tGetStablecoins(args) {
  const include = args.includePrices !== false;
  const url = `${STABLE_BASE}/stablecoins?includePrices=${include ? "true" : "false"}`;
  const r = await httpGet(url, { timeoutMs: 30000 });
  if (!r.ok || !r.json) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  let list = r.json.peggedAssets || r.json || [];
  if (args.symbol) {
    const s = String(args.symbol).toLowerCase();
    list = list.filter((p) => (p.symbol || "").toLowerCase() === s);
  }
  const compact = list.map((p) => ({
    symbol: p.symbol, name: p.name, peggedTo: p.pegType, price: p.price, circulating: p.circulating?.peggedUSD ?? p.circulating,
  }));
  return textResult({ url, total: compact.length, latency_ms: r.latency, stablecoins: compact });
}

async function tValidateCascade(args) {
  const token = String(args.token || "").trim();
  const chain = String(args.chain || "").trim().toLowerCase();
  const gtNet = String(args.gtNetwork || chain).trim().toLowerCase();
  if (!token || !chain) return textResult("token and chain required", true);
  const trail = [];

  // 1. DefiLlama
  const llamaUrl = `${COINS_BASE}/prices/current/${encodeURIComponent(chain + ":" + token)}`;
  let r = await httpGet(llamaUrl);
  let coin = r.json?.coins?.[`${chain}:${token}`];
  trail.push({ source: "defillama", url: llamaUrl, status: r.status, latency_ms: r.latency, price: coin?.price ?? null, confidence: coin?.confidence ?? null });
  if (coin?.price != null) return textResult({ token, chain, winner: "defillama", price: coin.price, confidence: coin.confidence, trail });

  // 2. DexScreener
  const dexsUrl = `${DEXS_BASE}/latest/dex/tokens/${encodeURIComponent(token)}`;
  r = await httpGet(dexsUrl);
  let dexPrice = null;
  if (r.ok && Array.isArray(r.json?.pairs)) {
    const pairs = r.json.pairs.filter((p) => !chain || (p.chainId || "").toLowerCase() === chain);
    if (pairs.length) {
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      dexPrice = parseFloat(pairs[0].priceUsd);
    }
  }
  trail.push({ source: "dexscreener", url: dexsUrl, status: r.status, latency_ms: r.latency, price: dexPrice });
  if (dexPrice != null && Number.isFinite(dexPrice)) return textResult({ token, chain, winner: "dexscreener", price: dexPrice, trail });

  // 3. GeckoTerminal (Try 1 batch /token_price/ then Try 2 /tokens/)
  const gtUrl1 = `${GT_BASE}/simple/networks/${encodeURIComponent(gtNet)}/token_price/${encodeURIComponent(token)}`;
  r = await httpGet(gtUrl1);
  let gtPrice = null;
  if (r.ok && r.json?.data?.attributes?.token_prices) {
    const prices = r.json.data.attributes.token_prices;
    const v = prices[token] ?? prices[token.toLowerCase()];
    if (v != null) gtPrice = parseFloat(v);
  }
  trail.push({ source: "geckoterminal_simple", url: gtUrl1, status: r.status, latency_ms: r.latency, price: gtPrice });
  if (gtPrice != null && Number.isFinite(gtPrice) && gtPrice > 0) return textResult({ token, chain, winner: "geckoterminal", price: gtPrice, trail });

  return textResult({ token, chain, winner: null, price: null, trail, note: "no source returned a price" });
}

async function tBatchPrices(args) {
  const tokens = Array.isArray(args.tokens) ? args.tokens : [];
  if (!tokens.length) return textResult("tokens[] required", true);
  const coinIds = tokens.map((t) => `${String(t.chain).toLowerCase()}:${t.address}`);
  const url = `${COINS_BASE}/prices/current/${encCoinList(coinIds)}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  const result = {};
  for (const id of coinIds) {
    const c = r.json?.coins?.[id];
    result[id] = c ? { price: c.price, confidence: c.confidence, decimals: c.decimals, symbol: c.symbol, timestamp: c.timestamp } : null;
  }
  const found = Object.values(result).filter((v) => v && v.price != null).length;
  return textResult({ url, latency_ms: r.latency, requested: coinIds.length, found, missing: coinIds.length - found, prices: result });
}

function tQuotaStatus() {
  return textResult({ quotaFile: QUOTA_FILE, ...loadQuota() });
}

async function handleToolCall(name, args = {}) {
  try {
    switch (name) {
      case "llama_get_price": return await tGetPrice(args);
      case "llama_get_price_historical": return await tGetPriceHistorical(args);
      case "llama_search_token": return await tSearchToken(args);
      case "llama_get_tvl": return await tGetTvl(args);
      case "llama_list_protocols": return await tListProtocols(args);
      case "llama_get_chains": return await tGetChains(args);
      case "llama_get_stablecoins": return await tGetStablecoins(args);
      case "llama_validate_cascade": return await tValidateCascade(args);
      case "llama_batch_prices": return await tBatchPrices(args);
      case "llama_quota_status": return tQuotaStatus();
      default: return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (e) {
    return textResult({ error: e.message, stack: e.stack }, true);
  }
}

// --- JSON-RPC dispatch ---
function jsonRpcResult(id, result) { return JSON.stringify({ jsonrpc: "2.0", id, result }); }
function jsonRpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return JSON.stringify({ jsonrpc: "2.0", id, error: err });
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "defillama-mcp", version: "1.0.0" },
      });
    }
    if (method === "notifications/initialized") return null;
    if (method === "tools/list") return jsonRpcResult(id, { tools: TOOLS });
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      return jsonRpcResult(id, await handleToolCall(name, args || {}));
    }
    if (method === "ping") return jsonRpcResult(id, {});
    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return jsonRpcError(id, -32603, `Internal error: ${err.message}`, { stack: err.stack });
  }
}

function log(...a) { process.stderr.write("[defillama-mcp] " + a.join(" ") + "\n"); }

async function main() {
  if (process.argv.includes("--test")) {
    log("testing DefiLlama connectivity...");
    const r = await tGetPrice({ coins: ["coingecko:ethereum"] });
    process.stdout.write(r.content[0].text + "\n");
    log("tools:", TOOLS.map((t) => t.name).join(", "));
    process.exit(r.isError ? 1 : 0);
  }
  const rl = readline.createInterface({ input: process.stdin, output: undefined, terminal: false });
  rl.on("line", async (line) => {
    const s = line.trim();
    if (!s) return;
    let msg;
    try { msg = JSON.parse(s); } catch (_) {
      process.stdout.write(jsonRpcError(null, -32700, "Parse error") + "\n");
      return;
    }
    const resp = await dispatch(msg);
    if (resp !== null) process.stdout.write(resp + "\n");
  });
  rl.on("close", () => process.exit(0));
  log("defillama-mcp started, quota=", QUOTA_FILE);
}

main().catch((e) => { log("fatal:", e.stack || e.message); process.exit(1); });
