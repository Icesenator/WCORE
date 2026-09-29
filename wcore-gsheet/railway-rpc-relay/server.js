// wcore-rpc-relay - relais JSON-RPC minimal pour WCORE.
//
// Pourquoi : certains RPC publics (ex. B3 chez thirdweb) renvoient HTTP 429
// depuis les IP de sortie datacenter. Le `cex-relay` existe deja pour le meme
// motif côté CEX ("Contourne les blocages IP/geo datacenter") ; ce service
// etend ce motif aux appels JSON-RPC on-chain.
//
// Contrainte de securite assumee : l'API ne peut pas envoyer d'en-tete
// d'authentification (le dispatcher poste du JSON-RPC brut) et un secret
// dans l'URL serait commite avec la config de chaine. Le relais est donc
// public mais strictement borne : amont en allowlist, corps JSON-RPC valide,
// rate limiting. La surface d'attaque est "utiliser notre quota B3", ce que
// nous faisons deja nous-memes.
const http = require("node:http");

const PORT = Number(process.env.PORT || 8080);
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 12000);

// Cibles autorisees. Jamais d'URL arbitraire : le client choisit un slug,
// pas une destination.
const TARGETS = {
  "b3-1": "https://b3.rpc.thirdweb.com",
  "b3-2": "https://8333.rpc.thirdweb.com",
};
const ALLOWED_METHODS = new Set([
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
  "web3_clientVersion",
]);
const ALLOWED_BLOCK_TAGS = new Set(["latest", "earliest", "pending", "safe", "finalized"]);
const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_MAX = 120; // requetes
const RATE_LIMIT_WINDOW_MS = 60_000;

const buckets = new Map();

function rateLimited(key) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] >= RATE_LIMIT_WINDOW_MS) buckets.delete(k);
    }
  }
  return hits.length > RATE_LIMIT_MAX;
}

/**
 * Un JSON-RPC batch est une liste de requetes. On refuse tout batch afin de
 * garantir qu'une requete HTTP = un appel amont : le trace par cible reste
 * ainsi 1 pour 1, et le relais ne peut pas etre utilise comme multiplicateur.
 */
const MAX_SCAN_DEPTH = 6;

/**
 * Parcourt une valeur de parametre et detecte toute chaine ressemblant a une
 * URL. But : empecher le relais de servir de relais SSRF, y compris via une
 * valeur imbriquee en profondeur (au-dela de MAX_SCAN_DEPTH, on refuse par
 * prudence plutot que de risquer une missed).
 */
function hasUrlLikeString(value, depth) {
  if (depth > MAX_SCAN_DEPTH) return true;
  if (typeof value === "string") return /^https?:\/\//i.test(value);
  if (Array.isArray(value)) return value.some((v) => hasUrlLikeString(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value).some((v) => hasUrlLikeString(v, depth + 1));
  }
  return false;
}

function validate(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "corps JSON invalide (objet attendu, batch refuse)" };
  }
  const { method, id, params } = body;
  if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
    return { ok: false, reason: "methode non autorisee" };
  }
  if (id !== undefined && id !== null && typeof id !== "string" && typeof id !== "number") {
    return { ok: false, reason: "id invalide" };
  }
  if (params !== undefined) {
    if (!Array.isArray(params)) return { ok: false, reason: "params doit etre un tableau" };
    if (params.length > 8) return { ok: false, reason: "params: trop d'elements" };
    for (const p of params) {
      if (typeof p !== "string" && typeof p !== "number" && p !== null && typeof p !== "boolean" && typeof p !== "object") {
        return { ok: false, reason: "params: type non autorise" };
      }
      // Parcours RECURSIF : une URL peut etre cachee dans un objet imbrique
      // (ex. eth_call params[0].to). Ne verifier que le premier niveau laissait
      // passer un SSRF — attrape par le test dedie.
      if (hasUrlLikeString(p, 0)) {
        return { ok: false, reason: "params: URL refusee" };
      }
    }
  }
  const first = Array.isArray(params) ? params[0] : undefined;
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("corps trop volumineux"), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, code, payload) {
  const buf = Buffer.from(JSON.stringify(payload));
  res.writeHead(code, { "content-type": "application/json", "content-length": buf.length });
  res.end(buf);
}

async function forward(target, rawBody) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
      signal: controller.signal,
    });
    const text = await upstream.text();
    return { status: upstream.status, text };
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, service: "wcore-rpc-relay", targets: Object.keys(TARGETS) });
  }
  if (req.method !== "POST") {
    res.setHeader("allow", "POST, GET");
    return send(res, 405, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "methode HTTP non autorisee" } });
  }

  let slug;
  try {
    slug = decodeURIComponent((req.url || "").split("?")[0]).replace(/^\/+|\/+$/g, "");
  } catch {
    return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "chemin invalide" } });
  }
  const target = TARGETS[slug];
  if (!target) {
    return send(res, 404, { jsonrpc: "2.0", id: null, error: { code: -32601, message: "cible inconnue" } });
  }

  const key = req.socket.remoteAddress || "unknown";
  if (rateLimited(key)) {
    return send(res, 429, { jsonrpc: "2.0", id: null, error: { code: -32005, message: "rate limit" } });
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (e) {
    return send(res, e.code === 413 ? 413 : 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: String(e.message || e) } });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } });
  }

  const check = validate(parsed);
  if (!check.ok) {
    return send(res, 400, { jsonrpc: "2.0", id: parsed.id ?? null, error: { code: -32600, message: check.reason } });
  }

  try {
    const { status, text } = await forward(target, raw);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(text);
  } catch (e) {
    const aborted = e && (e.name === "AbortError" || String(e.message).includes("abort"));
    send(res, aborted ? 504 : 502, {
      jsonrpc: "2.0",
      id: parsed.id ?? null,
      error: { code: aborted ? -32000 : -32603, message: aborted ? "amont timeout" : "amont injoignable" },
    });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`wcore-rpc-relay sur :${PORT} - cibles: ${Object.keys(TARGETS).join(", ")}`));
}

module.exports = { server, validate, rateLimited, TARGETS, ALLOWED_METHODS };
