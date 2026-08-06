import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { findUnreachableChains } from "./server-helpers.js";

// Une chaine dont tous les RPC sont morts n'ouvre aucun circuit et ne fait rien
// echouer: le scan est degrade, le cache preserve, personne ne le voit.
// "Ledger - Degen" est reste ainsi du 2026-08-04 au 2026-08-06, ses trois RPC
// hors service (429, 404, -32603), jusqu'a ce qu'un humain remarque une cellule
// figee. Ces tests fixent le critere qui doit lever l'alerte — et surtout ceux
// qui ne doivent PAS la lever, sinon elle perd sa valeur de signal.

function m(scans: number, tokensFound: number, rpcErrors: number) {
  return { scans, tokensFound, rpcErrors };
}

describe("detection des chaines injoignables", () => {
  test("signale une chaine dont chaque scan echoue sans trouver de token", () => {
    const out = findUnreachableChains({ DEGEN: m(5, 0, 12) });
    assert.deepEqual(out, ["DEGEN"]);
  });

  test("ne signale pas une chaine saine", () => {
    assert.deepEqual(findUnreachableChains({ BASE: m(50, 120, 0) }), []);
  });

  test("ne signale pas un wallet simplement vide sur une chaine saine", () => {
    // Le cas le plus important: aucun token trouve, mais aucune erreur RPC non
    // plus. Confondre les deux rendrait l'alerte inexploitable.
    assert.deepEqual(findUnreachableChains({ ZORA: m(10, 0, 0) }), []);
  });

  test("ne signale pas une chaine seulement instable", () => {
    // Des erreurs, mais pas a chaque scan, et des tokens trouves.
    assert.deepEqual(findUnreachableChains({ SOLANA: m(20, 40, 5) }), []);
  });

  test("attend un nombre minimal de scans avant de conclure", () => {
    // Au demarrage, deux scans rates ne prouvent rien.
    assert.deepEqual(findUnreachableChains({ NEW: m(2, 0, 4) }), []);
    assert.deepEqual(findUnreachableChains({ NEW: m(2, 0, 4) }, 2), ["NEW"]);
  });

  test("des erreurs RPC moins nombreuses que les scans ne suffisent pas", () => {
    // 4 erreurs sur 5 scans: un scan a abouti, la chaine repond encore.
    assert.deepEqual(findUnreachableChains({ FLAKY: m(5, 0, 4) }), []);
  });

  test("plusieurs chaines sont rendues triees, sans doublon", () => {
    const out = findUnreachableChains({
      DEGEN: m(5, 0, 10),
      BASE: m(30, 90, 1),
      AVES_NETWORK: m(4, 0, 4),
    });
    assert.deepEqual(out, ["AVES_NETWORK", "DEGEN"]);
  });

  test("tolere une entree vide ou malformee sans lever", () => {
    assert.deepEqual(findUnreachableChains({}), []);
    assert.deepEqual(findUnreachableChains(undefined as never), []);
  });
});
