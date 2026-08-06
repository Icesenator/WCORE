import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { classifyScanError } from "./server-helpers.js";

// La classification vivait en double dans scan.ts, avec deux jeux de regles
// divergents, et le test `includes("RPC")` etait sensible a la casse. Les
// echecs d'endpoint — les plus frequents — etaient donc comptes en "other" et
// n'apparaissaient pas dans le compteur RPC des tableaux de bord.
//
// Mesure du 2026-08-06 sur DEGEN, dont les trois RPC sont hors service:
//   "https://rpc.degen.tips: HTTP 429"                  -> compte en "other"
//   "blockNumber unavailable on every endpoint; ..."    -> compte en "other"
// Aucune de ces erreurs n'etait donc visible comme erreur RPC.

describe("classification des erreurs de scan", () => {
  test("un echec d'endpoint est une erreur RPC, quelle que soit la casse", () => {
    assert.equal(classifyScanError("https://rpc.degen.tips: HTTP 429"), "rpc");
    assert.equal(classifyScanError("https://degen.drpc.org: HTTP 404"), "rpc");
    assert.equal(classifyScanError("blockNumber unavailable on every endpoint"), "rpc");
    assert.equal(classifyScanError("RPC consensus failed"), "rpc");
    assert.equal(classifyScanError("fetch failed"), "rpc");
  });

  test("le pricing prime sur le reseau quand les deux sont mentionnes", () => {
    // Sinon la meme erreur etait comptee dans deux categories, et le compteur
    // "other" (total - rpc - price - balCache) devenait negatif.
    assert.equal(classifyScanError("price: NO_PRICE after fetch"), "pricing");
    assert.equal(classifyScanError("ABSURD_PRICE for token"), "pricing");
  });

  test("les categories restent exclusives", () => {
    const samples = [
      "[BAL_CACHE] No activity since last scan",
      "chain_timeout: BASE exceeded 60000ms",
      "price: NO_PRICE",
      "https://rpc.example.org: HTTP 500",
      "explorer error BASE: This operation was aborted",
    ];
    const kinds = samples.map(classifyScanError);
    assert.deepEqual(kinds, ["balCache", "timeout", "pricing", "rpc", "other"]);
    // Aucun chevauchement possible: une entree, une categorie.
    assert.equal(new Set(kinds).size, kinds.length);
  });

  test("le cache de balance reste exclu du comptage d'erreurs", () => {
    assert.equal(classifyScanError("[BAL_CACHE] No activity since last scan"), "balCache");
  });

  test("un timeout de chaine n'est pas noye dans les erreurs RPC", () => {
    assert.equal(classifyScanError("chain_timeout: DEGEN exceeded 90000ms"), "timeout");
  });

  test("une erreur explorer n'est pas attribuee au RPC", () => {
    // L'explorer est une source de decouverte, pas un endpoint RPC: la confondre
    // ferait accuser des RPC sains.
    assert.equal(classifyScanError("explorer cooldown active for REYA"), "other");
  });

  test("tolere une entree vide sans lever", () => {
    assert.equal(classifyScanError(""), "other");
    assert.equal(classifyScanError(undefined as never), "other");
  });
});
