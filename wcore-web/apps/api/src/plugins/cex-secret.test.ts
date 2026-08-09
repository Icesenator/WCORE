import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCexEncryptionSecret } from "./cex.js";

test("the configured secret is used whenever it is present", () => {
  assert.equal(
    resolveCexEncryptionSecret({ CEX_SECRET: "configured", JWT_SECRET: "jwt", NODE_ENV: "production" }),
    "configured",
  );
});

test("production refuses to encrypt credentials with a borrowed secret", () => {
  // Deriving the key from JWT_SECRET couples two secrets that rotate independently: a
  // JWT rotation would silently make every stored credential undecryptable.
  assert.throws(
    () => resolveCexEncryptionSecret({ JWT_SECRET: "jwt", NODE_ENV: "production" }),
    /CEX_SECRET is required/,
  );
});

test("production refuses the public development secret", () => {
  assert.throws(
    () => resolveCexEncryptionSecret({ NODE_ENV: "production" }),
    /CEX_SECRET is required/,
  );
});

test("outside production the previous fallbacks are preserved", () => {
  // Changing these would make credentials already stored in a developer or staging
  // database undecryptable, for no security gain.
  assert.equal(resolveCexEncryptionSecret({ JWT_SECRET: "jwt", NODE_ENV: "development" }), "jwt");
  assert.equal(resolveCexEncryptionSecret({ NODE_ENV: "development" }), "wcore-dev-cex-secret");
  assert.equal(resolveCexEncryptionSecret({}), "wcore-dev-cex-secret");
});
