import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFetch, UnsafeUrlError } from "./safe-http.js";

const url = "https://account-secret.example.test/key-secret";

test("les erreurs HTTP de transport ne divulguent pas la clé reflétée", async () => {
  await assert.rejects(safeFetch(url, {}, {
    resolveAddresses: async () => [{ address: "1.1.1.1" }],
    fetchImpl: (async () => { throw new Error(`failure at ${url} key-secret`); }) as typeof fetch,
  }), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.doesNotMatch(err.message, /account-secret|key-secret/);
    return true;
  });
});

test("un motif SSRF ne divulgue pas le nom de compte", () => {
  const err = new UnsafeUrlError("private_host_account-secret.internal", url);
  assert.doesNotMatch(err.message, /account-secret|key-secret/);
});

test("GM refuse explicitement une chaîne surchargée non attestée", async () => {
  const { getChainRpc, getChainRpcs } = await import("../gamification/index.js");
  const old = process.env.WCORE_RPC_OVERRIDES;
  process.env.WCORE_RPC_OVERRIDES = JSON.stringify({ B3: [url, "https://other.provider.test/key-secret"] });
  try {
    for (const get of [getChainRpc, getChainRpcs]) {
      assert.throws(() => get("b3"), /RPC_OVERRIDE_GM_UNATTESTED/);
    }
  } finally {
    if (old === undefined) delete process.env.WCORE_RPC_OVERRIDES; else process.env.WCORE_RPC_OVERRIDES = old;
  }
});
