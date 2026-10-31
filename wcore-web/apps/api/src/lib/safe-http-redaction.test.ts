import assert from "node:assert/strict";
import { test } from "node:test";

import { assertPublicHttp, UnsafeUrlError } from "./safe-http.js";

test("UnsafeUrlError ne recopie ni le chemin, ni la requête, ni les identifiants de l'URL", () => {
  for (const url of [
    "http://127.0.0.1/v2/token-abc123",
    "https://localhost/rpc?secret=token-abc123",
    "ftp://user:token-abc123@rpc.example.test/x",
  ]) {
    try {
      assertPublicHttp(url);
      assert.fail(`accepté : ${url}`);
    } catch (err) {
      assert.ok(err instanceof UnsafeUrlError);
      assert.equal(err.message.includes("token-abc123"), false, err.message);
    }
  }
});
