#!/usr/bin/env node
// coingecko-mcp - MCP stdio server for CoinGecko cascade fallback debug (WCORE)
"use strict";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

const PROTOCOL_VERSION = "2024-11-05";
const QUOTA_FILE = path.resolve(__dirname, "gecko-quota.json");

const CG_KEY = process.env.COINGECKO_API_KEY || "";
const CG_BASE = CG_KEY ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
const GT_BASE = "https://api.geckoterminal.com/api/v2";
const JUP_BASE = "https://price.jup.ag/v6";

// --- quota tracking ---
function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadQuota() {
  try {
    const j = JSON.parse(fs.readFileSync(QUOTA_FILE, "utf8"));
    if (j.date !== todayStr()) return { date: todayStr(), count: 0, byHost: {}, perMinute: {} };
    if (!j.byHost) j.byHost = {};
    if (!j.perMinute) j.perMinute = {};
    return j;
  } catch (_) {
    return { date: todayStr(), count: 0, byHost: {}, perMinute: {} };
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
    const min = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    q.perMinute[min] = (q.perMinute[min] || 0) + 1;
    // keep only last 10 minutes
    const keys = Object.keys(q.perMinute).sort();
    while (keys.length > 10) delete q.perMinute[keys.shift()];
  } catch (_) {}
  saveQuota(q);
}

// --- http helper ---
async function httpGet(url, { timeoutMs = 15000, headers = {} } = {}) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  bumpQuota(url);
  const h = { "user-agent": "wcore-coingecko-mcp/1.0", ...headers };
  if (CG_KEY && url.includes("coingecko.com")) h["x-cg-pro-api-key"] = CG_KEY;
  try {
    const res = await fetch(url, { signal: ac.signal, headers: h });
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
    name: "gecko_ping",
    description: "CoinGecko API health check. Returns gecko_says message if reachable.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "gecko_get_price",
    description: "CoinGecko /simple/price — multi-coin lookup by CG id (e.g. 'bitcoin', 'ethereum').",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "CoinGecko IDs (bitcoin, ethereum, etc.)" },
        vs_currencies: { type: "array", items: { type: "string" }, description: "Quote currencies (default ['usd','eur'])" },
        include_market_cap: { type: "boolean" },
        include_24hr_change: { type: "boolean" },
      },
      required: ["ids"],
      additionalProperties: false,
    },
  },
  {
    name: "gecko_search_coin",
    description: "Search CoinGecko index by symbol/name. Returns candidate IDs (never guess a CG id — always search first).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "gecko_get_coin",
    description: "Full coin data (price, market cap, platforms/contracts). Compact view returned.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "CoinGecko id (e.g. 'bitcoin')" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "gecko_get_contract_price",
    description: "Price by contract address via /simple/token_price/{platform}. Mirrors WCORE's final CG fallback.",
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", description: "CG asset_platform id (e.g. 'ethereum', 'base', 'arbitrum-one')" },
        contract_address: { type: "string" },
        vs_currencies: { type: "array", items: { type: "string" } },
      },
      required: ["chain", "contract_address"],
      additionalProperties: false,
    },
  },
  {
    name: "gecko_validate_cascade_fallback",
    description: "Simulate WCORE's GT -> Jupiter -> CoinGecko fallback chain. Returns winning source + trail.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token symbol or id (optional, used for logging)" },
        chain: { type: "string", description: "Chain slug for GT/CG (e.g. 'ethereum','base','solana')" },
        address: { type: "string", description: "Token contract or mint address" },
      },
      required: ["chain", "address"],
      additionalProperties: false,
    },
  },
  {
    name: "gecko_get_trending",
    description: "Top trending coins on CoinGecko (24h).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "gecko_batch_prices",
    description: "Batch lookup by {chain, address} pairs, grouped by platform (1 HTTP call per platform).",
    inputSchema: {
      type: "object",
      properties: {
        tokens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              chain: { type: "string" },
              address: { type: "string" },
              id: { type: "string", description: "Optional CG id (bypasses contract lookup)" },
            },
            required: ["chain", "address"],
            additionalProperties: false,
          },
        },
        vs_currencies: { type: "array", items: { type: "string" } },
      },
      required: ["tokens"],
      additionalProperties: false,
    },
  },
  {
    name: "gecko_get_platforms",
    description: "All CG asset platforms (chain slugs). Use to cross-check WCORE's 117 chains mapping.",
    inputSchema: {
      type: "object",
      properties: { filter: { type: "string", description: "Substring filter on id/name (case-insensitive)" } },
      additionalProperties: false,
    },
  },
  {
    name: "gecko_quota_status",
    description: "Today's CoinGecko/GT/Jupiter call counts + per-minute buckets (gecko-quota.json).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// --- tool implementations ---
async function tPing() {
  const url = `${CG_BASE}/ping`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text, tier: CG_KEY ? "pro" : "free" }, true);
  return textResult({ url, latency_ms: r.latency, tier: CG_KEY ? "pro" : "free", response: r.json });
}

async function tGetPrice(args) {
  const ids = (args.ids || []).filter(Boolean);
  if (!ids.length) return textResult("ids[] required", true);
  const vs = (args.vs_currencies && args.vs_currencies.length ? args.vs_currencies : ["usd", "eur"]).join(",");
  const qs = new URLSearchParams({ ids: ids.join(","), vs_currencies: vs });
  if (args.include_market_cap) qs.set("include_market_cap", "true");
  if (args.include_24hr_change) qs.set("include_24hr_change", "true");
  const url = `${CG_BASE}/simple/price?${qs.toString()}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  return textResult({ url, latency_ms: r.latency, prices: r.json });
}

async function tSearchCoin(args) {
  const q = String(args.query || "").trim();
  if (!q) return textResult("query required", true);
  const url = `${CG_BASE}/search?query=${encodeURIComponent(q)}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  const coins = (r.json?.coins || []).slice(0, 25).map((c) => ({
    id: c.id, symbol: c.symbol, name: c.name, market_cap_rank: c.market_cap_rank, api_symbol: c.api_symbol,
  }));
  return textResult({ url, latency_ms: r.latency, count: coins.length, coins });
}

async function tGetCoin(args) {
  const id = String(args.id || "").trim();
  if (!id) return textResult("id required", true);
  const url = `${CG_BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  const r = await httpGet(url, { timeoutMs: 20000 });
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  const c = r.json || {};
  const compact = {
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    asset_platform_id: c.asset_platform_id,
    platforms: c.platforms,
    price_usd: c.market_data?.current_price?.usd,
    price_eur: c.market_data?.current_price?.eur,
    market_cap_usd: c.market_data?.market_cap?.usd,
    total_volume_usd: c.market_data?.total_volume?.usd,
    price_change_24h_pct: c.market_data?.price_change_percentage_24h,
    last_updated: c.last_updated,
  };
  return textResult({ url, latency_ms: r.latency, coin: compact });
}

async function tGetContractPrice(args) {
  const chain = String(args.chain || "").trim();
  const addr = String(args.contract_address || "").trim();
  if (!chain || !addr) return textResult("chain and contract_address required", true);
  const vs = (args.vs_currencies && args.vs_currencies.length ? args.vs_currencies : ["usd", "eur"]).join(",");
  const qs = new URLSearchParams({ contract_addresses: addr, vs_currencies: vs });
  const url = `${CG_BASE}/simple/token_price/${encodeURIComponent(chain)}?${qs.toString()}`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  return textResult({ url, latency_ms: r.latency, chain, prices: r.json });
}

async function tCascadeFallback(args) {
  const chain = String(args.chain || "").trim().toLowerCase();
  const addr = String(args.address || "").trim();
  if (!chain || !addr) return textResult("chain and address required", true);
  const trail = [];

  // 1. GeckoTerminal batch /token_price/
  const gtUrl = `${GT_BASE}/simple/networks/${encodeURIComponent(chain)}/token_price/${encodeURIComponent(addr)}`;
  let r = await httpGet(gtUrl);
  let gtPrice = null;
  if (r.ok && r.json?.data?.attributes?.token_prices) {
    const prices = r.json.data.attributes.token_prices;
    const v = prices[addr] ?? prices[addr.toLowerCase()];
    if (v != null && Number.isFinite(parseFloat(v)) && parseFloat(v) > 0) gtPrice = parseFloat(v);
  }
  trail.push({ source: "geckoterminal", url: gtUrl, status: r.status, latency_ms: r.latency, price: gtPrice });
  if (gtPrice != null) return textResult({ chain, address: addr, winner: "geckoterminal", price: gtPrice, trail });

  // 2. Jupiter (Solana only)
  if (chain === "solana") {
    const jupUrl = `${JUP_BASE}/price?ids=${encodeURIComponent(addr)}`;
    r = await httpGet(jupUrl);
    let jupPrice = null;
    if (r.ok && r.json?.data?.[addr]?.price != null) jupPrice = parseFloat(r.json.data[addr].price);
    trail.push({ source: "jupiter", url: jupUrl, status: r.status, latency_ms: r.latency, price: jupPrice });
    if (jupPrice != null && Number.isFinite(jupPrice)) return textResult({ chain, address: addr, winner: "jupiter", price: jupPrice, trail });
  } else {
    trail.push({ source: "jupiter", skipped: "non-Solana chain" });
  }

  // 3. CoinGecko /simple/token_price/{chain}
  const cgUrl = `${CG_BASE}/simple/token_price/${encodeURIComponent(chain)}?contract_addresses=${encodeURIComponent(addr)}&vs_currencies=usd,eur`;
  r = await httpGet(cgUrl);
  let cgPrice = null;
  if (r.ok && r.json) {
    const key = Object.keys(r.json).find((k) => k.toLowerCase() === addr.toLowerCase());
    if (key && r.json[key]?.usd != null) cgPrice = r.json[key].usd;
  }
  trail.push({ source: "coingecko", url: cgUrl, status: r.status, latency_ms: r.latency, price: cgPrice });
  if (cgPrice != null && Number.isFinite(cgPrice)) return textResult({ chain, address: addr, winner: "coingecko", price: cgPrice, trail });

  return textResult({ chain, address: addr, winner: null, price: null, trail, failure_reason: "all sources returned no usable price" });
}

async function tGetTrending() {
  const url = `${CG_BASE}/search/trending`;
  const r = await httpGet(url);
  if (!r.ok) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  const coins = (r.json?.coins || []).map((c) => ({
    id: c.item?.id, symbol: c.item?.symbol, name: c.item?.name, market_cap_rank: c.item?.market_cap_rank, price_btc: c.item?.price_btc,
  }));
  return textResult({ url, latency_ms: r.latency, coins });
}

async function tBatchPrices(args) {
  const tokens = Array.isArray(args.tokens) ? args.tokens : [];
  if (!tokens.length) return textResult("tokens[] required", true);
  const vs = (args.vs_currencies && args.vs_currencies.length ? args.vs_currencies : ["usd", "eur"]).join(",");

  // Split: tokens with id → /simple/price; tokens without → /simple/token_price/{chain}
  const byId = tokens.filter((t) => t.id);
  const byChain = {};
  for (const t of tokens) {
    if (t.id) continue;
    const c = String(t.chain).toLowerCase();
    if (!byChain[c]) byChain[c] = [];
    byChain[c].push(t.address);
  }

  const out = { requested: tokens.length, results: {}, calls: 0 };

  if (byId.length) {
    const ids = byId.map((t) => t.id).join(",");
    const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${vs}`;
    const r = await httpGet(url);
    out.calls += 1;
    if (r.ok && r.json) {
      for (const t of byId) out.results[`id:${t.id}`] = r.json[t.id] || null;
    }
  }

  for (const chain of Object.keys(byChain)) {
    const addrs = byChain[chain].join(",");
    const url = `${CG_BASE}/simple/token_price/${encodeURIComponent(chain)}?contract_addresses=${encodeURIComponent(addrs)}&vs_currencies=${vs}`;
    const r = await httpGet(url);
    out.calls += 1;
    if (r.ok && r.json) {
      for (const addr of byChain[chain]) {
        const key = Object.keys(r.json).find((k) => k.toLowerCase() === addr.toLowerCase());
        out.results[`${chain}:${addr}`] = key ? r.json[key] : null;
      }
    } else {
      for (const addr of byChain[chain]) out.results[`${chain}:${addr}`] = { error: r.error || r.status };
    }
  }

  const found = Object.values(out.results).filter((v) => v && !v.error && Object.keys(v).length > 0).length;
  return textResult({ ...out, found, missing: tokens.length - found });
}

async function tGetPlatforms(args) {
  const url = `${CG_BASE}/asset_platforms`;
  const r = await httpGet(url, { timeoutMs: 20000 });
  if (!r.ok || !Array.isArray(r.json)) return textResult({ url, status: r.status, error: r.error || r.text }, true);
  let items = r.json.map((p) => ({ id: p.id, chain_identifier: p.chain_identifier, name: p.name, shortname: p.shortname, native_coin_id: p.native_coin_id }));
  if (args.filter) {
    const s = String(args.filter).toLowerCase();
    items = items.filter((p) => (p.id || "").toLowerCase().includes(s) || (p.name || "").toLowerCase().includes(s));
  }
  return textResult({ url, latency_ms: r.latency, total: items.length, platforms: items });
}

function tQuotaStatus() {
  return textResult({ quotaFile: QUOTA_FILE, tier: CG_KEY ? "pro" : "free (30/min)", ...loadQuota() });
}

async function handleToolCall(name, args = {}) {
  try {
    switch (name) {
      case "gecko_ping": return await tPing();
      case "gecko_get_price": return await tGetPrice(args);
      case "gecko_search_coin": return await tSearchCoin(args);
      case "gecko_get_coin": return await tGetCoin(args);
      case "gecko_get_contract_price": return await tGetContractPrice(args);
      case "gecko_validate_cascade_fallback": return await tCascadeFallback(args);
      case "gecko_get_trending": return await tGetTrending();
      case "gecko_batch_prices": return await tBatchPrices(args);
      case "gecko_get_platforms": return await tGetPlatforms(args);
      case "gecko_quota_status": return tQuotaStatus();
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
        serverInfo: { name: "coingecko-mcp", version: "1.0.0" },
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

function log(...a) { process.stderr.write("[coingecko-mcp] " + a.join(" ") + "\n"); }

async function main() {
  if (process.argv.includes("--test")) {
    log("testing CoinGecko connectivity, tier=", CG_KEY ? "pro" : "free");
    const r = await tPing();
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
  log("coingecko-mcp started, tier=", CG_KEY ? "pro" : "free (30/min)", "quota=", QUOTA_FILE);
}

main().catch((e) => { log("fatal:", e.stack || e.message); process.exit(1); });
