import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildHeaders, EMBED_FRAME_ANCESTORS, EMBED_PATHS } from "../security-headers.mjs";

type Rule = { source: string; headers: { key: string; value: string }[] };

// Meme moteur de correspondance que Next.js pour les `source` des en-tetes.
const require = createRequire(import.meta.url);
const { match } = require("next/dist/compiled/path-to-regexp") as { match: (source: string) => (path: string) => unknown };

// En-tetes effectifs d'une URL : les regles qui correspondent s'appliquent dans l'ordre, la derniere gagne.
function effectiveHeaders(pathname: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of buildHeaders() as Rule[]) {
    if (match(rule.source)(pathname)) for (const h of rule.headers) out.set(h.key, h.value);
  }
  return out;
}

const csp = (pathname: string) => effectiveHeaders(pathname).get("Content-Security-Policy") ?? "";

describe("en-tetes de securite : cadrage (clickjacking)", () => {
  test("toutes les routes ordinaires restent interdites au cadrage", () => {
    for (const p of ["/", "/gm", "/profile", "/cmc/crypto", "/cmc/crypto/bubbles", "/cmc/crypto/bubbles/popup", "/cmc/stocks/bubbles/popup", "/wallet/0xabc"]) {
      const h = effectiveHeaders(p);
      assert.equal(h.get("X-Frame-Options"), "DENY", p);
      assert.match(csp(p), /^frame-ancestors 'none'(;|$)/, p);
    }
  });

  test("les deux pages embed sont cadrables par Apps Script seulement, sans X-Frame-Options", () => {
    assert.deepEqual([...EMBED_PATHS], ["/cmc/crypto/bubbles/embed", "/cmc/stocks/bubbles/embed"]);
    assert.deepEqual([...EMBED_FRAME_ANCESTORS], ["https://script.google.com", "https://*.googleusercontent.com"]);
    for (const p of EMBED_PATHS as string[]) {
      const h = effectiveHeaders(p);
      assert.equal(h.has("X-Frame-Options"), false, p);
      assert.match(csp(p), /^frame-ancestors https:\/\/script\.google\.com https:\/\/\*\.googleusercontent\.com(;|$)/, p);
      assert.ok(!csp(p).includes("'none'") || !csp(p).startsWith("frame-ancestors 'none'"), p);
    }
  });

  test("seules les deux routes embed exactes sont ouvertes : un prefixe ou un suffixe reste ferme", () => {
    for (const p of ["/cmc/crypto/bubbles/embedx", "/cmc/crypto/bubbles/embed/extra", "/cmc/stocks/bubbles/embedding", "/x/cmc/crypto/bubbles/embed", "/cmc/crypto/embed"]) {
      assert.equal(effectiveHeaders(p).get("X-Frame-Options"), "DENY", p);
      assert.match(csp(p), /^frame-ancestors 'none'/, p);
    }
  });

  test("les pages embed gardent les autres protections", () => {
    for (const p of EMBED_PATHS as string[]) {
      const h = effectiveHeaders(p);
      assert.equal(h.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains", p);
      assert.equal(h.get("X-Content-Type-Options"), "nosniff", p);
      assert.match(csp(p), /base-uri 'self'/, p);
      assert.match(csp(p), /form-action 'self'/, p);
      assert.match(csp(p), /object-src 'none'/, p);
    }
  });
});
