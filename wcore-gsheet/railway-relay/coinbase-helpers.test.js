const assert = require("assert");
const { coinbaseCanonical, derToJose } = require("./server");

assert.strictEqual(coinbaseCanonical("usd"), "USDT");
assert.strictEqual(coinbaseCanonical("EUR"), "EURC");
assert.strictEqual(coinbaseCanonical("RONIN"), "RON");
assert.strictEqual(coinbaseCanonical("btc"), "BTC");

const der = Buffer.from("304402200102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20022100ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100", "hex");
const jose = derToJose(der, 64);
assert.strictEqual(Buffer.from(jose, "base64url").length, 64);

console.log("coinbase helper tests OK");
