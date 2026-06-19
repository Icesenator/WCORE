const assert = require("assert");
const { okxCanonical, okxSign } = require("./server");

assert.strictEqual(okxCanonical("usd"), "USDT");
assert.strictEqual(okxCanonical("EUR"), "EURC");
assert.strictEqual(okxCanonical("btc"), "BTC");

const sig = okxSign("2020-12-08T09:08:57.715Z", "GET", "/api/v5/account/balance", "", "secret");
assert.strictEqual(sig, "5ktoTKif8DCJlIPb/3Kfd1A17bIRye6jpS9QBWj+9AU=");

console.log("okx helper tests OK");
