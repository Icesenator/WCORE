const assert = require("node:assert/strict");
const { normalizeCoinbasePrivateKeyPem } = require("../server.js");

const pem = "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAoGCCqGSM49\nAwEHoUQDQgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\n-----END EC PRIVATE KEY-----";

const cdpJson = JSON.stringify({
  name: "organizations/example/apiKeys/example-key",
  privateKey: pem.replace(/\n/g, "\\n"),
});

assert.equal(normalizeCoinbasePrivateKeyPem(cdpJson), pem);
assert.equal(normalizeCoinbasePrivateKeyPem({ privateKey: pem.replace(/\n/g, "\\n") }), pem);

console.log("coinbase private key normalization ok");
