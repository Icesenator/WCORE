var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var TARGETS = {
  "b3-1": "https://b3.rpc.thirdweb.com",
  "b3-2": "https://8333.rpc.thirdweb.com"
};
var ALLOWED_METHODS = /* @__PURE__ */ new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_call",
  "eth_getCode",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_estimateGas",
  "eth_gasPrice",
  "net_version",
  "web3_clientVersion"
]);
var ALLOWED_BLOCK_TAGS = /* @__PURE__ */ new Set(["latest", "earliest", "pending", "safe", "finalized"]);
var MAX_BODY_BYTES = 256 * 1024;
var MAX_SCAN_DEPTH = 6;
var jsonRpcError = /* @__PURE__ */ __name((id, code, message) => new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
  status: 200,
  headers: { "content-type": "application/json" }
}), "jsonRpcError");
function hasUrlLikeString(value, depth) {
  if (depth > MAX_SCAN_DEPTH) return true;
  if (typeof value === "string") return /^https?:\/\//i.test(value);
  if (Array.isArray(value)) return value.some((v) => hasUrlLikeString(v, depth + 1));
  if (value && typeof value === "object") return Object.values(value).some((v) => hasUrlLikeString(v, depth + 1));
  return false;
}
__name(hasUrlLikeString, "hasUrlLikeString");
function validate(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "corps JSON invalide (objet attendu, batch refuse)" };
  }
  const { method, id, params } = body;
  if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
    return { ok: false, reason: "methode non autorisee" };
  }
  if (id !== void 0 && id !== null && typeof id !== "string" && typeof id !== "number") {
    return { ok: false, reason: "id invalide" };
  }
  if (params !== void 0) {
    if (!Array.isArray(params)) return { ok: false, reason: "params doit etre un tableau" };
    if (params.length > 8) return { ok: false, reason: "params: trop d'elements" };
    for (const p of params) {
      if (typeof p !== "string" && typeof p !== "number" && p !== null && typeof p !== "boolean" && typeof p !== "object") {
        return { ok: false, reason: "params: type non autorise" };
      }
      if (hasUrlLikeString(p, 0)) return { ok: false, reason: "params: URL refusee" };
    }
  }
  const first = Array.isArray(params) ? params[0] : void 0;
  if ((method === "eth_getBalance" || method === "eth_getCode" || method === "eth_call") && typeof first === "string") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(first)) return { ok: false, reason: "adresse invalide" };
  }
  if (method === "eth_getLogs" && params && params[0] && typeof params[0] === "object") {
    const range = params[0];
    for (const tag of [range.fromBlock, range.toBlock]) {
      if (typeof tag === "string" && !ALLOWED_BLOCK_TAGS.has(tag) && !/^0x[0-9a-fA-F]+$/.test(tag)) {
        return { ok: false, reason: "bloc invalide" };
      }
    }
  }
  return { ok: true };
}
__name(validate, "validate");
var worker_default = {
  async fetch(request) {
    if (request.method === "GET") {
      return Response.json({ ok: true, service: "wcore-rpc-relay-cf", targets: Object.keys(TARGETS) });
    }
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    const slug = new URL(request.url).pathname.replace(/^\/+|\/+$/g, "");
    const target = TARGETS[slug];
    if (!target) return jsonRpcError(null, -32601, "cible inconnue");
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return jsonRpcError(null, -32600, "corps trop volumineux");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonRpcError(null, -32700, "JSON invalide");
    }
    const check = validate(parsed);
    if (!check.ok) return jsonRpcError(parsed.id ?? null, -32600, check.reason);
    try {
      const upstream = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw
      });
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { "content-type": "application/json" }
      });
    } catch {
      return jsonRpcError(parsed.id ?? null, -32603, "amont injoignable");
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
