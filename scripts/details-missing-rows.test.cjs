"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { shiftFormula, planMissingRows, buildRow } = require("./details-missing-rows.cjs");

test("shiftFormula déplace seulement les références relatives à la ligne modèle", () => {
  assert.equal(shiftFormula("=sum(H184:J184)", 184, 790), "=sum(H790:J790)");
  assert.equal(shiftFormula("=IF($E184=\"\";\"\";A$1+B184+C18)", 184, 790), "=IF($E790=\"\";\"\";A$1+B790+C18)");
  assert.equal(shiftFormula("HYPE", 184, 790), "HYPE");
});

const DETAILS = [
  ["Symbol", "Price", "Position", "Ticker", "Contract"],
  ["HYPE", "", "Ledger - HyperEVM Crypto", "HYPE", "native"],
  ["USDT", "", "Ledger - Base Crypto", "USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
];

test("une détention en X avec un modèle de même ticker est planifiée, symbole du modèle repris", () => {
  const { plan, unmatched } = planMissingRows([
    { tab: "Ledger - Elysium", ticker: "USDC", contract: "0xb47c4c8f73f009cc0c0d3f92b388d13e293f0b65", verif: "X" },
    { tab: "Ledger - Elysium", ticker: "HYPE", contract: "native", verif: "X" },
  ], DETAILS);
  assert.deepEqual(plan.map((p) => [p.ticker, p.symbol, p.templateRow]), [["USDC", "USDT", 3], ["HYPE", "HYPE", 2]]);
  assert.equal(unmatched.length, 0);
});

test("rien n'est planifié pour une ligne V, déjà présente, informative ou sans modèle", () => {
  const { plan, unmatched } = planMissingRows([
    { tab: "Ledger - Base Crypto", ticker: "USDC", contract: "0x833589FCD6EDB6E08F4C7C32D4F71B54BDA02913", verif: "X" },
    { tab: "Ledger - Elysium", ticker: "HYPE", contract: "native", verif: "V" },
    { tab: "Ledger - Elysium", ticker: "INFO_TOTAL", contract: "x", verif: "X" },
    { tab: "Ledger - Elysium", ticker: "ZZZ", contract: "0x0000000000000000000000000000000000000001", verif: "X" },
  ], DETAILS);
  assert.equal(plan.length, 0);
  assert.deepEqual(unmatched.map((u) => u.ticker), ["ZZZ"]);
});

test("buildRow garde les formules décalées, pose les constantes, n'écrit aucun montant", () => {
  const row = buildRow(["=A2", "1234", "OLD", "=D2", "Ledger - X", "=F2", "native", "", "", "", "=sum(H2:J2)"], 2, 9, "USDT", "Ledger - Elysium", "0xabc");
  assert.deepEqual(row.slice(0, 11), ["=A9", "", "USDT", "=D9", "Ledger - Elysium", "=F9", "0xabc", "", "", "", "=sum(H9:J9)"]);
});
