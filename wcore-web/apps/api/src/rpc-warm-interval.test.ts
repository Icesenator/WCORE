import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Garde-fou: les endpoints RPC decouverts dynamiquement doivent survivre a leur TTL.
//
// rpc/endpoints.ts met en cache les endpoints issus de chainlist pendant 6 h
// (DYNAMIC_TTL_MS). warmDynamicRpcEndpoints n'etait appele qu'une fois, au
// chargement du module gamification. Un process Railway vivant plusieurs jours,
// getRpcEndpoints ne renvoyait plus que les endpoints statiques passe la 6e
// heure — sans erreur, sans alerte, jusqu'au redeploiement suivant.
//
// Meme signature que les autres defauts du 2026-08-06: un mecanisme correct que
// plus rien ne declenche. On verifie ici la seule chose qui le maintient vivant.

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "server.ts"), "utf8");
const endpoints = readFileSync(
  join(here, "..", "..", "..", "packages", "core", "src", "rpc", "endpoints.ts"),
  "utf8",
);

function dynamicTtlMs(): number {
  const m = endpoints.match(/const DYNAMIC_TTL_MS = ([^;]+);/);
  assert.ok(m, "DYNAMIC_TTL_MS introuvable dans rpc/endpoints.ts");
  const value = Function(`"use strict"; return (${m[1]});`)() as number;
  assert.ok(Number.isFinite(value) && value > 0, `TTL invalide: ${m[1]}`);
  return value;
}

function warmIntervalMs(): number {
  const m = server.match(/const RPC_WARM_INTERVAL_MS = ([^;]+);/);
  assert.ok(m, "RPC_WARM_INTERVAL_MS introuvable dans server.ts");
  const value = Function(`"use strict"; return (${m[1]});`)() as number;
  assert.ok(Number.isFinite(value) && value > 0, `intervalle invalide: ${m[1]}`);
  return value;
}

describe("rafraichissement des endpoints RPC dynamiques", () => {
  test("le warm est reprogramme, pas seulement joue au demarrage", () => {
    assert.ok(
      /setInterval\(\s*\(\)\s*=>\s*\{[\s\S]{0,400}?warmDynamicRpcEndpoints\(/.test(server),
      "sans setInterval, les endpoints decouverts sont perdus a l'expiration du cache",
    );
  });

  test("le renouvellement precede l'expiration du cache", () => {
    const ttl = dynamicTtlMs();
    const interval = warmIntervalMs();
    assert.ok(
      interval < ttl,
      `intervalle ${interval}ms >= TTL ${ttl}ms: il resterait une fenetre sans endpoints dynamiques`,
    );
  });

  test("une marge est gardee, un renouvellement pile a l'expiration serait fragile", () => {
    const ttl = dynamicTtlMs();
    const interval = warmIntervalMs();
    assert.ok(
      interval <= ttl * 0.9,
      `marge insuffisante: ${interval}ms pour un TTL de ${ttl}ms`,
    );
  });

  test("un echec du warm ne fait pas tomber le serveur", () => {
    const block = server.match(/setInterval\(\s*\(\)\s*=>\s*\{[\s\S]{0,500}?warmDynamicRpcEndpoints\([\s\S]{0,400}?\}, RPC_WARM_INTERVAL_MS\)[^;]*;/);
    assert.ok(block, "bloc de renouvellement introuvable");
    assert.ok(/try \{/.test(block[0]) && /catch/.test(block[0]), "le warm periodique doit etre protege");
    assert.ok(/\.unref\(\)/.test(block[0]), "l'intervalle ne doit pas retenir le process");
  });
});
