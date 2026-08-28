import assert from "node:assert/strict";
import test from "node:test";
import { krakenStockCanonicalSymbol } from "./mappings.js";

test("maps Kraken xStock symbols to canonical underlying tickers", () => {
  assert.equal(krakenStockCanonicalSymbol("JPMx"), "JPM");
  assert.equal(krakenStockCanonicalSymbol("AAPLx"), "AAPL");
  assert.equal(krakenStockCanonicalSymbol("NVDAx"), "NVDA");
  assert.equal(krakenStockCanonicalSymbol("GOOGLx"), "GOOG");
  assert.equal(krakenStockCanonicalSymbol("SKHYx"), "SKHY");
  assert.equal(krakenStockCanonicalSymbol("SKHY"), "SKHY");
  assert.equal(krakenStockCanonicalSymbol("NYSE:BRK.B"), "BRKB");
  assert.equal(krakenStockCanonicalSymbol("BRK-B"), "BRKB");
  assert.equal(krakenStockCanonicalSymbol("BRKB"), "BRKB");
  assert.equal(krakenStockCanonicalSymbol("SSU"), "SMSN");
  assert.equal(krakenStockCanonicalSymbol("SMSN"), "SMSN");
  assert.equal(krakenStockCanonicalSymbol("SSU"), "SMSN");
  assert.equal(krakenStockCanonicalSymbol("SMSN"), "SMSN");
});

test("keeps unknown or already-canonical symbols unchanged", () => {
  assert.equal(krakenStockCanonicalSymbol("SOMETHING_ELSE"), "SOMETHING_ELSE");
  assert.equal(krakenStockCanonicalSymbol("BRKB"), "BRKB");
  assert.equal(krakenStockCanonicalSymbol("JPM"), "JPM");
  assert.equal(krakenStockCanonicalSymbol(""), "");
});
