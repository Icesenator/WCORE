// wcore-rpc-relay - version Cloudflare Workers.
//
// Raison d'etre : les IP de sortie Railway sont des IP datacenter PARTAGEES
// entre tenants, et thirdweb limite son palier gratuit PAR IP. Ces IP sont donc
// structurellement throttlees (mesure le 2026-09-29 : 0/6 en 429 via Railway
// contre 15/15 en 200 depuis une IP residentielle, meme endpoint, meme
// instant). Un Worker a une adresse de sortie qui n'est pas partagee avec les
// tenants Railway, ce qui constitue une voie distincte de celle du relais
// heberge dans Railway.
//
// Le service ne lit AUCUN secret et n'ecrit rien : il ne fait que relayer un
// JSON-RPC en lecture vers un amont fige dans le code. C'est ce qui le rend
// deployable sans managedeur niCle.
const TARGETS = {
  "b3-1": "https://b3.rpc.thirdweb.com",
  "b3-2": "https://8333.rpc.thirdweb.com",
};

const ALLOWED_METHODS = new Set([
  "eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_call", "eth_getCode",
  "eth_getLogs", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_estimateGas",
  "eth_gasPrice", "net_version", "web3_clientVersion",
]);
const ALLOWED_BLOCK_TAGS = new Set(["latest", "earliest", "pending", "safe", "finalized"]);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SCAN_DEPTH = 6;

const jsonRpcError = (id, code, message) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function hasUrlLikeString(value, depth) {
  if (depth > MAX_SCAN_DEPTH) return true;
  if (typeof value === "string") return /^https?:\/\//i.test(value);
  if (Array.isArray(value)) return value.some((v) => hasUrlLikeString(v, depth + 1));
  if (value && typeof value === "object") return Object.values(value).some((v) => hasUrlLikeString(v, depth + 1));
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
      // Parcours recursif : une URL peut etre cachee en profondeur.
      if (hasUrlLikeString(p, 0)) return { ok: false, reason: "params: URL refusee" };
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

export default {
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
        body: raw,
      });
      // Passthrough verbatim : le code HTTP amont (429 compris) doit rester
      // visible par l'appelant, sinon le diagnostic de la chaine devient faux.
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      });
    } catch {
      return jsonRpcError(parsed.id ?? null, -32603, "amont injoignable");
    }
  },
};
