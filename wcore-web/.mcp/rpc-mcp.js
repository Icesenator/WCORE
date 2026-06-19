#!/usr/bin/env node
// rpc-mcp - Minimal MCP stdio server for multi-chain blockchain RPC queries (WCORE debug helper)
"use strict";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

const PROTOCOL_VERSION = "2024-11-05";
const SRC_DIR = path.resolve(__dirname, "..", "..", "..", "wcore-gsheet", "src");

const DEFAULT_CHAINS = {
  ETHEREUM: { type: "evm", chainId: 1,     rpc: "https://eth.llamarpc.com",        nativeSymbol: "ETH", nativeDecimals: 18 },
  BASE:     { type: "evm", chainId: 8453,  rpc: "https://mainnet.base.org",        nativeSymbol: "ETH", nativeDecimals: 18 },
  ARBITRUM: { type: "evm", chainId: 42161, rpc: "https://arb1.arbitrum.io/rpc",    nativeSymbol: "ETH", nativeDecimals: 18 },
  OPTIMISM: { type: "evm", chainId: 10,    rpc: "https://mainnet.optimism.io",     nativeSymbol: "ETH", nativeDecimals: 18 },
  GNOSIS:   { type: "evm", chainId: 100,   rpc: "https://rpc.gnosischain.com",     nativeSymbol: "xDAI",nativeDecimals: 18 },
  SOLANA:   { type: "svm",                 rpc: "https://api.mainnet-beta.solana.com", nativeSymbol: "SOL", nativeDecimals: 9 },
};

let CHAINS = { ...DEFAULT_CHAINS };

// Fallbacks for Cosmos chains whose .gs files omit CHAIN_ID / BECH32_PREFIX / RPC_URL
const COSMOS_FALLBACKS = {
  INJECTIVE: { chainId: "injective-1", bech32Prefix: "inj", rpcUrl: "https://sentry.tm.injective.network" },
};

// --- WCORE chain auto-discovery from src/*.gs ---
function reStringArray(key) {
  return new RegExp(key + "\\s*:\\s*\\[([\\s\\S]*?)\\]");
}
function reString(key) {
  return new RegExp(key + "\\s*:\\s*[\"']([^\"']+)[\"']");
}
function reNumber(key) {
  return new RegExp(key + "\\s*:\\s*(\\d+)");
}

function extractStrings(block) {
  const out = [];
  const re = /["']([^"'\n]+)["']/g;
  let m;
  while ((m = re.exec(block))) {
    const v = m[1].trim();
    if (/^https?:\/\//i.test(v)) out.push(v);
  }
  return out;
}

function parseChainGs(content) {
  const factoryMatch = content.match(/ChainFactory\.create(Evm|Svm|Cosmos)Chain\s*\(\s*["']([^"']+)["']/);
  if (!factoryMatch) return null;
  const kind = factoryMatch[1].toLowerCase(); // evm | svm | cosmos
  const key = factoryMatch[2].toUpperCase();

  const nativeSym = (content.match(reString("NATIVE_SYMBOL")) || [])[1] || null;
  const nativeDecMatch = content.match(reNumber("NATIVE_DECIMALS"));
  const nativeDecimals = nativeDecMatch ? parseInt(nativeDecMatch[1], 10) : null;

  if (kind === "cosmos") {
    const restUrl = (content.match(reString("REST_URL")) || [])[1] || null;
    let rpcUrl = (content.match(reString("RPC_URL")) || [])[1] || null;
    let chainIdStr = (content.match(reString("CHAIN_ID")) || [])[1] || null;
    let bech32 = (content.match(reString("BECH32_PREFIX")) || [])[1] || null;
    if (!restUrl) return null;
    const fb = COSMOS_FALLBACKS[key];
    if (fb) {
      if (!chainIdStr) chainIdStr = fb.chainId || null;
      if (!bech32) bech32 = fb.bech32Prefix || null;
      if (!rpcUrl) rpcUrl = fb.rpcUrl || null;
    }
    return {
      key,
      data: {
        type: "cosmos",
        rpc: restUrl,
        restUrl,
        rpcUrl,
        chainId: chainIdStr,
        bech32Prefix: bech32,
        nativeSymbol: nativeSym,
        nativeDecimals,
      },
    };
  }

  // evm / svm: ENDPOINTS array
  const endpointsBlock = (content.match(reStringArray("ENDPOINTS")) || [])[1] || "";
  const endpoints = extractStrings(endpointsBlock);
  if (endpoints.length === 0) return null;

  if (kind === "evm") {
    const chainIdMatch = content.match(reNumber("CHAIN_ID"));
    return {
      key,
      data: {
        type: "evm",
        rpc: endpoints[0],
        endpoints,
        chainId: chainIdMatch ? parseInt(chainIdMatch[1], 10) : null,
        nativeSymbol: nativeSym,
        nativeDecimals,
      },
    };
  }
  // svm
  return {
    key,
    data: {
      type: "svm",
      rpc: endpoints[0],
      endpoints,
      nativeSymbol: nativeSym,
      nativeDecimals,
    },
  };
}

function loadWcoreChains() {
  if (!fs.existsSync(SRC_DIR)) return { added: 0, total: Object.keys(CHAINS).length };
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".gs"));
  let added = 0;
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(SRC_DIR, f), "utf8");
      const parsed = parseChainGs(content);
      if (parsed) {
        CHAINS[parsed.key] = { ...CHAINS[parsed.key], ...parsed.data };
        added++;
      }
    } catch (_) { /* ignore per-file errors */ }
  }
  return { added, total: Object.keys(CHAINS).length };
}

function log(...args) {
  process.stderr.write("[rpc-mcp] " + args.join(" ") + "\n");
}

function resolveChain(chain) {
  if (!chain) throw new Error("chain is required");
  const key = String(chain).toUpperCase();
  if (!CHAINS[key]) throw new Error(`Unknown chain: ${chain}. Known: ${Object.keys(CHAINS).join(", ")}`);
  return { key, ...CHAINS[key] };
}

// SSRF guard — block private / loopback / link-local / reserved hosts (WCORE rpc-mcp audit 2026-04-19)
function assertSafeEndpoint(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error(`invalid url: ${raw}`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`scheme not allowed: ${u.protocol}`);
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "ip6-localhost" || host.endsWith(".localhost") ||
      host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error(`blocked host: ${host}`);
  }
  // IPv4 literal
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1, 5).map(Number);
    if (o.some((x) => x > 255)) throw new Error(`invalid ipv4: ${host}`);
    if (o[0] === 127 || o[0] === 0 || o[0] === 10) throw new Error(`blocked private ipv4: ${host}`);
    if (o[0] === 169 && o[1] === 254) throw new Error(`blocked link-local ipv4: ${host}`);
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) throw new Error(`blocked private ipv4: ${host}`);
    if (o[0] === 192 && o[1] === 168) throw new Error(`blocked private ipv4: ${host}`);
    if (o[0] >= 224) throw new Error(`blocked multicast/reserved ipv4: ${host}`);
  }
  // IPv6 literal (URL.hostname strips brackets)
  if (host.includes(":")) {
    // B1 fix: normalize v4-mapped hex form (e.g. ::ffff:7f00:1 = 127.0.0.1) — re-run as IPv4
    const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
      const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return assertSafeEndpoint(raw.replace(host, dotted));
    }
    if (host === "::" || host === "::1") throw new Error(`blocked loopback ipv6: ${host}`);
    if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) throw new Error(`blocked private ipv6: ${host}`);
    if (host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.") || host.startsWith("::ffff:169.254.") ||
        host.startsWith("::ffff:192.168.") || /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      throw new Error(`blocked v4-mapped private ipv6: ${host}`);
    }
  }
}

// Post-DNS SSRF check (B3 fix: nip.io / rebinding bypass) + redirect block (B4 fix)
const { lookup: _dnsLookup } = require("dns").promises;
async function assertSafeEndpointWithDns(raw) {
  assertSafeEndpoint(raw); // sync pre-check first
  let u;
  try { u = new URL(raw); } catch { return; }
  // Skip DNS lookup for bare IPv4/IPv6 literals — already checked above
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) || u.hostname.startsWith("[")) return;
  try {
    const { address } = await _dnsLookup(u.hostname);
    assertSafeEndpoint(`${u.protocol}//${address}`); // re-check resolved IP
  } catch (e) {
    if (e.code === "ENOTFOUND" || e.code === "ENODATA") return; // DNS failure is fine — fetch will fail anyway
    throw e; // re-throw SSRF block errors
  }
}

async function jsonRpcPost(url, method, params = [], { timeoutMs = 8000, id = 1 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    await assertSafeEndpointWithDns(url); // B3: post-DNS check
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: ctrl.signal,
      redirect: "manual", // B4: block redirects
    });
    // B4: block redirect responses
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`redirect blocked: ${res.headers.get("location")}`);
    }
    const latency = Date.now() - t0;
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { ok: res.ok, status: res.status, latencyMs: latency, body };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - t0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

async function httpGetJson(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    await assertSafeEndpointWithDns(url); // B3: post-DNS check
    const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" }); // B4: block redirects
    // B4: block redirect responses
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`redirect blocked: ${res.headers.get("location")}`);
    }
    const latency = Date.now() - t0;
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 2000) }; }
    return { ok: res.ok, status: res.status, latencyMs: latency, body };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - t0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function hexPadAddress(addr) {
  const h = String(addr).replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(h)) throw new Error("bad EVM address");
  return "0x" + h.padStart(64, "0");
}

function hexToBigInt(hex) {
  if (!hex || typeof hex !== "string") return 0n;
  return BigInt(hex);
}

function textResult(obj, isError = false) {
  const text = typeof obj === "string" ? obj : JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return { content: [{ type: "text", text }], isError: !!isError };
}

// ---------- Tool implementations ----------

async function toolRpcCall({ chain, method, params = [], url }) {
  const c = resolveChain(chain);
  const endpoint = url || c.rpc;
  const res = await jsonRpcPost(endpoint, method, params);
  return textResult({ chain: c.key, endpoint, method, ...res });
}

async function toolGetBalance({ chain, address }) {
  const c = resolveChain(chain);
  if (c.type === "evm") {
    const res = await jsonRpcPost(c.rpc, "eth_getBalance", [address, "latest"]);
    const wei = res.body && res.body.result ? hexToBigInt(res.body.result) : 0n;
    const dec = c.nativeDecimals || 18;
    const native = Number(wei) / Math.pow(10, dec);
    return textResult({ chain: c.key, address, rawWei: wei.toString(), native, symbol: c.nativeSymbol, rpc: c.rpc, latencyMs: res.latencyMs, error: res.body && res.body.error });
  }
  if (c.type === "cosmos") {
    const url = `${c.restUrl.replace(/\/+$/, "")}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;
    const res = await httpGetJson(url, { timeoutMs: 8000 });
    return textResult({ chain: c.key, address, restUrl: c.restUrl, chainId: c.chainId, balances: res.body && res.body.balances, httpStatus: res.status, latencyMs: res.latencyMs, error: res.error });
  }
  // svm
  const res = await jsonRpcPost(c.rpc, "getBalance", [address]);
  const lamports = res.body && res.body.result && typeof res.body.result.value === "number" ? res.body.result.value : 0;
  const dec = c.nativeDecimals || 9;
  return textResult({ chain: c.key, address, lamports, native: lamports / Math.pow(10, dec), symbol: c.nativeSymbol, rpc: c.rpc, latencyMs: res.latencyMs, error: res.body && res.body.error });
}

async function toolGetTokenBalance({ chain, address, contract }) {
  const c = resolveChain(chain);
  if (c.type !== "evm") return textResult({ error: "rpc_get_token_balance currently supports EVM only" }, true);
  const data = "0x70a08231" + hexPadAddress(address).slice(2); // balanceOf(address)
  const res = await jsonRpcPost(c.rpc, "eth_call", [{ to: contract, data }, "latest"]);
  const raw = res.body && res.body.result ? hexToBigInt(res.body.result) : 0n;
  return textResult({ chain: c.key, address, contract, rawBalance: raw.toString(), rpc: c.rpc, latencyMs: res.latencyMs, error: res.body && res.body.error });
}

async function toolCallPrice({ token, chain, vs_currency = "usd" }) {
  // DexScreener: /latest/dex/tokens/{contract} or /latest/dex/search?q=...
  const q = encodeURIComponent(token);
  const url = /^0x[0-9a-fA-F]{40}$/.test(token) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)
    ? `https://api.dexscreener.com/latest/dex/tokens/${q}`
    : `https://api.dexscreener.com/latest/dex/search?q=${q}`;
  const res = await httpGetJson(url, { timeoutMs: 8000 });
  const pairs = (res.body && res.body.pairs) || [];
  const filtered = chain
    ? pairs.filter((p) => String(p.chainId || "").toLowerCase() === String(chain).toLowerCase())
    : pairs;
  const top = filtered.slice(0, 5).map((p) => ({
    chainId: p.chainId, dex: p.dexId, pair: p.pairAddress,
    baseSymbol: p.baseToken && p.baseToken.symbol, quoteSymbol: p.quoteToken && p.quoteToken.symbol,
    priceUsd: p.priceUsd, liquidityUsd: p.liquidity && p.liquidity.usd, volume24h: p.volume && p.volume.h24,
  }));
  return textResult({ token, vs_currency, status: res.status, count: filtered.length, topPairs: top });
}

async function toolValidateEndpoint({ chain, url }) {
  const c = resolveChain(chain);
  const endpoint = url || c.rpc;
  if (c.type === "evm") {
    const res = await jsonRpcPost(endpoint, "eth_chainId", [], { timeoutMs: 6000 });
    const returnedId = res.body && res.body.result ? parseInt(res.body.result, 16) : null;
    const match = c.chainId == null || returnedId === c.chainId;
    return textResult({ chain: c.key, endpoint, ok: res.ok && match, expectedChainId: c.chainId, returnedChainId: returnedId, latencyMs: res.latencyMs, httpStatus: res.status, error: res.error || (res.body && res.body.error) });
  }
  if (c.type === "cosmos") {
    const base = (url || c.restUrl || c.rpc).replace(/\/+$/, "");
    const target = `${base}/cosmos/base/tendermint/v1beta1/node_info`;
    const res = await httpGetJson(target, { timeoutMs: 6000 });
    const network = res.body && res.body.default_node_info && res.body.default_node_info.network;
    const match = c.chainId == null || !network || network === c.chainId;
    return textResult({ chain: c.key, endpoint: target, ok: res.ok && match, expectedChainId: c.chainId, returnedNetwork: network, latencyMs: res.latencyMs, httpStatus: res.status, error: res.error });
  }
  // svm: getHealth
  const res = await jsonRpcPost(endpoint, "getHealth", [], { timeoutMs: 6000 });
  const healthy = res.body && res.body.result === "ok";
  return textResult({ chain: c.key, endpoint, ok: res.ok && healthy, latencyMs: res.latencyMs, httpStatus: res.status, error: res.error || (res.body && res.body.error), response: res.body && res.body.result });
}

function consensusVote(values) {
  // values: array of stringified results; returns {winner, tally, total}
  const tally = {};
  let total = 0;
  for (const v of values) {
    if (v == null) continue;
    const k = typeof v === "string" ? v : JSON.stringify(v);
    tally[k] = (tally[k] || 0) + 1;
    total++;
  }
  let winner = null;
  let best = 0;
  for (const [k, n] of Object.entries(tally)) {
    if (n > best) { best = n; winner = k; }
  }
  const strictMajority = winner != null && best * 2 > total; // WCORE rule: votes * 2 > total
  return { winner, winnerVotes: best, total, tally, strictMajority };
}

async function toolConsensusCheck({ chain, method, params = [], endpoints }) {
  const c = resolveChain(chain);
  const list = (endpoints && endpoints.length) ? endpoints : [c.rpc];
  const results = await Promise.all(list.map((url) => jsonRpcPost(url, method, params, { timeoutMs: 8000 }).then((r) => ({ url, ...r }))));
  const values = results.map((r) => (r.body && "result" in r.body) ? r.body.result : null);
  const vote = consensusVote(values);
  return textResult({
    chain: c.key, method, params, endpoints: list,
    perEndpoint: results.map((r) => ({ url: r.url, ok: r.ok, status: r.status, latencyMs: r.latencyMs, result: r.body && r.body.result, error: r.error || (r.body && r.body.error) })),
    consensus: vote,
  });
}

async function toolChainList() {
  return textResult(CHAINS);
}

// ---------- MCP plumbing ----------

const TOOLS = [
  { name: "rpc_call",              description: "Raw JSON-RPC call. Auto-routes to chain default RPC or a given url.",
    inputSchema: { type: "object", properties: { chain: { type: "string" }, method: { type: "string" }, params: { type: "array" }, url: { type: "string" } }, required: ["chain", "method"], additionalProperties: false } },
  { name: "rpc_get_balance",       description: "Get native token balance (eth_getBalance or getBalance).",
    inputSchema: { type: "object", properties: { chain: { type: "string" }, address: { type: "string" } }, required: ["chain", "address"], additionalProperties: false } },
  { name: "rpc_get_token_balance", description: "Get ERC20 balance via eth_call(balanceOf). EVM only.",
    inputSchema: { type: "object", properties: { chain: { type: "string" }, address: { type: "string" }, contract: { type: "string" } }, required: ["chain", "address", "contract"], additionalProperties: false } },
  { name: "rpc_call_price",        description: "DexScreener price lookup by contract or symbol. Optional chain filter.",
    inputSchema: { type: "object", properties: { token: { type: "string" }, chain: { type: "string" }, vs_currency: { type: "string" } }, required: ["token"], additionalProperties: false } },
  { name: "rpc_validate_endpoint", description: "Health-check a chain RPC endpoint (eth_chainId or getHealth). Returns latency + match.",
    inputSchema: { type: "object", properties: { chain: { type: "string" }, url: { type: "string" } }, required: ["chain"], additionalProperties: false } },
  { name: "rpc_consensus_check",   description: "Call multiple endpoints, return majority result (WCORE strict-majority rule: votes*2 > total).",
    inputSchema: { type: "object", properties: { chain: { type: "string" }, method: { type: "string" }, params: { type: "array" }, endpoints: { type: "array", items: { type: "string" } } }, required: ["chain", "method"], additionalProperties: false } },
  { name: "rpc_chain_list",        description: "List supported chains and default RPCs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];

async function handleToolCall(name, args = {}) {
  try {
    switch (name) {
      case "rpc_call":              return await toolRpcCall(args);
      case "rpc_get_balance":       return await toolGetBalance(args);
      case "rpc_get_token_balance": return await toolGetTokenBalance(args);
      case "rpc_call_price":        return await toolCallPrice(args);
      case "rpc_validate_endpoint": return await toolValidateEndpoint(args);
      case "rpc_consensus_check":   return await toolConsensusCheck(args);
      case "rpc_chain_list":        return await toolChainList();
      default: return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (e) {
    return textResult({ error: e.message, stack: e.stack }, true);
  }
}

function jsonRpcResult(id, result) { return JSON.stringify({ jsonrpc: "2.0", id, result }); }
function jsonRpcError(id, code, message, data) {
  const err = { code, message }; if (data !== undefined) err.data = data;
  return JSON.stringify({ jsonrpc: "2.0", id, error: err });
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      return jsonRpcResult(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "rpc-mcp", version: "1.0.0" } });
    }
    if (method === "notifications/initialized") return null;
    if (method === "tools/list") return jsonRpcResult(id, { tools: TOOLS });
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      const out = await handleToolCall(name, args || {});
      return jsonRpcResult(id, out);
    }
    if (method === "ping") return jsonRpcResult(id, {});
    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return jsonRpcError(id, -32603, `Internal error: ${err.message}`, { stack: err.stack });
  }
}

async function main() {
  const loadInfo = loadWcoreChains();
  log(`chain loader: ${loadInfo.added} from src/, total=${loadInfo.total}`);

  if (process.argv.includes("--test")) {
    const byType = {};
    for (const [k, v] of Object.entries(CHAINS)) byType[v.type] = (byType[v.type] || 0) + 1;
    log("chains:", Object.keys(CHAINS).length, JSON.stringify(byType));
    log("sample keys:", Object.keys(CHAINS).slice(0, 15).join(", "), "...");
    log("tools:", TOOLS.map((t) => t.name).join(", "));
    process.exit(0);
  }
  const rl = readline.createInterface({ input: process.stdin, output: undefined, terminal: false });
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { process.stdout.write(jsonRpcError(null, -32700, "Parse error") + "\n"); return; }
    const resp = await dispatch(msg);
    if (resp !== null) process.stdout.write(resp + "\n");
  });
  rl.on("close", () => process.exit(0));
  log("rpc-mcp started, chains=", Object.keys(CHAINS).length);
}

main().catch((e) => { log("fatal:", e.stack || e.message); process.exit(1); });
