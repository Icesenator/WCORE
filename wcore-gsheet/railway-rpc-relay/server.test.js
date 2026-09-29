// Tests du relais JSON-RPC. L'objectif principal n'est pas le routage mais la
// BORNE DE SECURITE : le relais est public (l'API ne peut pas envoyer
// d'auth), donc il ne doit jamais pouvoir servir de proxy ouvert.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
let child;

const upstreamCalls = [];
// Faux amont : observe ce que le relais relaie vraiment.
const UPSTREAM_PORT = 8124;
const upstream = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    upstreamCalls.push({ url: req.url, body: Buffer.concat(chunks).toString("utf8") });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x40ebb79" }));
  });
});

function post(path, body, asText) {
  return fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: asText ? body : JSON.stringify(body),
  });
}

test.before(async () => {
  await new Promise((r) => upstream.listen(UPSTREAM_PORT, "127.0.0.1", r));
  process.env.PORT = String(PORT);
  // Rediriger une cible de test vers le faux amont.
  const mod = require("./server.js");
  mod.TARGETS["test-1"] = `http://127.0.0.1:${UPSTREAM_PORT}/upstream`;
  child = mod.server.listen(PORT, "127.0.0.1");
  await new Promise((r) => child.once("listening", r));
});

test.after(() => {
  child?.close();
  upstream.close();
});

test("sante: /health expose les cibles (aucun secret)", async () => {
  const r = await fetch(BASE + "/health");
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.ok, true);
  assert.ok(Array.isArray(j.targets));
});

test("methode HTTP non autorisee -> 405", async () => {
  const r = await fetch(BASE + "/test-1");
  assert.equal(r.status, 405);
});

test("cible inconnue -> 404 (jamais de proxy ouvert)", async () => {
  const r = await post("/http://evil.example/", { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
  assert.equal(r.status, 404);
  const j = await r.json();
  assert.equal(j.error.code, -32601);
});

test("methode JSON-RPC non autorisee -> 400, jamais relaiée", async () => {
  const before = upstreamCalls.length;
  const r = await post("/test-1", { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: ["0xdead"] });
  assert.equal(r.status, 400);
  assert.equal(upstreamCalls.length, before, "l'amont ne doit pas avoir ete-appsele");
});

test("batch JSON-RPC refuse (1 requete HTTP = 1 appel amont)", async () => {
  const before = upstreamCalls.length;
  const r = await post("/test-1", [
    { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
    { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
  ]);
  assert.equal(r.status, 400);
  assert.equal(upstreamCalls.length, before);
});

test("URL en parametre refusee (pas de SSRF)", async () => {
  const before = upstreamCalls.length;
  const r = await post("/test-1", { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: "https://evil.example" }, "latest"] });
  assert.equal(r.status, 400);
  assert.equal(upstreamCalls.length, before);
});

test("adresse non-hex sur eth_getBalance refusee", async () => {
  const before = upstreamCalls.length;
  const r = await post("/test-1", { jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: ["pas-une-adresse", "latest"] });
  assert.equal(r.status, 400);
  assert.equal(upstreamCalls.length, before);
});

test("requete valide -> relaiee telle quelle, reponse passee au travers", async () => {
  const before = upstreamCalls.length;
  const r = await post("/test-1", { jsonrpc: "2.0", id: 7, method: "eth_blockNumber", params: [] });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.result, "0x40ebb79");
  assert.equal(upstreamCalls.length, before + 1);
  assert.match(upstreamCalls[upstreamCalls.length - 1].body, /eth_blockNumber/);
});

test("eth_getLogs accepte un bloc numerique en hexadecimal", async () => {
  const r = await post("/test-1", {
    jsonrpc: "2.0", id: 8, method: "eth_getLogs",
    params: [{ fromBlock: "0x1", toBlock: "0x2" }],
  });
  assert.equal(r.status, 200);
});

test("corps JSON invalide -> 400", async () => {
  const r = await post("/test-1", "{pas du json", true);
  assert.equal(r.status, 400);
});
