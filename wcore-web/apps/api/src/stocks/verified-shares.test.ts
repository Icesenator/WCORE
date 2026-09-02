import assert from "node:assert/strict";
import test from "node:test";
import {
  VERIFIED_SHARES_DEVIATION_GATE,
  VERIFIED_SHARES_VERSION,
  resolveVerifiedMarketCapUsd,
} from "./verified-shares.js";

test("corrects a CompaniesMarketCap cap deviating beyond the gate from verified shares", () => {
  // CSV CMC 2026-09-02 : 1 016 968 052 736 USD @ 56,14 -> 18,11 Mds actions implicites
  // vs 9,173 Mds verifiees (ratio 1,98 > gate 1,2).
  const result = resolveVerifiedMarketCapUsd("TCEHY", 1_016_968_052_736, 56.14);
  assert.ok(result);
  assert.equal(result.corrected, true);
  assert.equal(result.marketCapUsd, 9_173_000_000 * 56.14);
  assert.equal(result.sharesOutstanding, 9_173_000_000);
});

test("passes the CSV cap through untouched while it converges with the register", () => {
  // Auto-desengagement : cap CMC corrigee un jour -> ratio ~1, aucune correction.
  const capUsd = 9_173_000_000 * 56.14;
  const result = resolveVerifiedMarketCapUsd("TCEHY", capUsd, 56.14);
  assert.ok(result);
  assert.equal(result.corrected, false);
  assert.equal(result.marketCapUsd, capUsd);
  assert.equal(result.sharesOutstanding, 9_173_000_000);

  // Rachats d'actions : -1,6%/an pendant 5 ans -> ratio ~0,92, toujours dans la bande.
  const reducedCap = 9_173_000_000 * 0.92 * 56.14;
  const buyback = resolveVerifiedMarketCapUsd("TCEHY", reducedCap, 56.14);
  assert.ok(buyback);
  assert.equal(buyback.corrected, false);
});

test("corrects in both directions (cap understated vs register)", () => {
  // Un CSV 2x trop bas (ratio 0,5 < 1/1,2) doit aussi etre corrige vers le haut.
  const result = resolveVerifiedMarketCapUsd("TCEHY", 9_173_000_000 * 56.14 * 0.5, 56.14);
  assert.ok(result);
  assert.equal(result.corrected, true);
  assert.equal(result.marketCapUsd, 9_173_000_000 * 56.14);
});

test("leaves unregistered tickers and invalid inputs alone", () => {
  assert.equal(resolveVerifiedMarketCapUsd("AAPL", 3_000_000_000_000, 100), null);
  assert.equal(resolveVerifiedMarketCapUsd("", 1_000, 1), null);
  assert.equal(resolveVerifiedMarketCapUsd("TCEHY", 0, 56.14), null);
  assert.equal(resolveVerifiedMarketCapUsd("TCEHY", -1, 56.14), null);
  assert.equal(resolveVerifiedMarketCapUsd("TCEHY", 1_000, 0), null);
  assert.equal(resolveVerifiedMarketCapUsd("TCEHY", Number.NaN, 56.14), null);
  assert.equal(resolveVerifiedMarketCapUsd("tcehy", 1_016_968_052_736, 56.14)!.corrected, true);
});

test("keeps the gate boundary and registry metadata explicit", () => {
  assert.equal(VERIFIED_SHARES_DEVIATION_GATE, 1.2);
  assert.equal(VERIFIED_SHARES_VERSION, 1);
  // Juste sous le seuil : ratio 1,2 exactement -> pas de correction.
  const atGate = resolveVerifiedMarketCapUsd("TCEHY", 9_173_000_000 * 1.2 * 56.14, 56.14);
  assert.ok(atGate);
  assert.equal(atGate.corrected, false);
  // Juste au-dela : ratio 1,201 -> correction.
  const beyondGate = resolveVerifiedMarketCapUsd("TCEHY", 9_173_000_000 * 1.201 * 56.14, 56.14);
  assert.ok(beyondGate);
  assert.equal(beyondGate.corrected, true);
});
