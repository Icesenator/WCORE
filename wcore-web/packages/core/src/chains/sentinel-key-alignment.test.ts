import test from "node:test";
import assert from "node:assert/strict";
import { VERIFIED_LIFECYCLE_REGISTRY, normalizeChainKey } from "@wcore/shared";
import { chainList } from "./index.js";

// Chain Sentinel croise l'exposition par chainKey : une cle du registre qui ne
// correspond pas a la cle reelle du scan rendrait toute exposition invisible.
test("chaque chaine du registre Sentinel scannee par WCORE a la meme cle normalisee", () => {
  const byId = new Map(chainList.map((c) => [Number(c.CHAIN?.CHAIN_ID), c]));
  const mismatches: string[] = [];
  for (const rec of VERIFIED_LIFECYCLE_REGISTRY) {
    const scanned = byId.get(rec.chainId);
    if (!scanned) continue; // non scannee par WCORE-web : exposition NOT_COVERED, jamais un zero
    if (normalizeChainKey(scanned.key) !== rec.chainKey) mismatches.push(`${rec.chainId}: ${scanned.key} != ${rec.chainKey}`);
  }
  assert.deepEqual(mismatches, []);
});

test("la couverture des scans pour le registre est explicite", () => {
  const ids = new Set(chainList.map((c) => Number(c.CHAIN?.CHAIN_ID)));
  const scanned = VERIFIED_LIFECYCLE_REGISTRY.filter((r) => ids.has(r.chainId)).map((r) => r.chainKey).sort();
  // Etat au 2026-11-07 : Cronos zkEVM (388), Blast (81457) et Sophon (50104) ne sont pas scannees par WCORE-web.
  assert.deepEqual(scanned, ["abstract", "gravity", "lisk"]);
});
