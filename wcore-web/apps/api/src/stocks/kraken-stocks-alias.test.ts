import assert from "node:assert/strict";
import test from "node:test";
import { krakenStockCanonicalSymbol } from "./mappings.js";

test("maps Kraken xStock symbols to canonical underlying tickers", () => {
  assert.equal(krakenStockCanonicalSymbol("JPMx"), "JPM");
  assert.equal(krakenStockCanonicalSymbol("AAPLx"), "AAPL");
  assert.equal(krakenStockCanonicalSymbol("NVDAx"), "NVDA");
  assert.equal(krakenStockCanonicalSymbol("GOOGLx"), "GOOG");
  assert.equal(krakenStockCanonicalSymbol("KRX:005930"), "KRX:005930");
});

test("keeps unknown or already-canonical symbols unchanged", () => {
  assert.equal(krakenStockCanonicalSymbol("SOMETHING_ELSE"), "SOMETHING_ELSE");
  assert.equal(krakenStockCanonicalSymbol("JPM"), "JPM");
  assert.equal(krakenStockCanonicalSymbol(""), "");
});
