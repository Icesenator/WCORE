import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildHeaders, EMBED_FRAME_ANCESTORS, EMBED_PATHS } from "../lib/security-headers.mjs";
import { isBareBubblesRoute } from "../lib/bare-routes";

type Rule = { source: string; headers: { key: string; value: string }[] };

// Meme moteur de correspondance que Next.js pour les `source` des en-tetes.
const require = createRequire(import.meta.url);
const { match: rawMatch } = require("next/dist/compiled/path-to-regexp") as {
  match: (source: string, options?: { sensitive?: boolean }) => (path: string) => unknown;
};
// next.config.mjs active experimental.caseSensitiveRoutes : les `source` sont compares en respectant la casse.
const match = (source: string) => rawMatch(source, { sensitive: true });

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

  test("tout chemin cadrable s'affiche SANS l'habillage du site (menu, notifications, session)", () => {
    // Sinon un Apps Script tiers pourrait cadrer le menu et les actions de compte d'une session reutilisee.
    for (const p of EMBED_PATHS as string[]) assert.equal(isBareBubblesRoute(p), true, p);
    for (const p of ["/cmc/crypto/bubbles/popup", "/cmc/stocks/bubbles/popup"]) assert.equal(isBareBubblesRoute(p), true, p);
    for (const p of ["/", "/profile", "/gm", "/cmc/crypto", "/cmc/crypto/bubbles", "/cmc/stocks/bubbles", "/cmc/crypto/bubbles/embedx"]) {
      assert.equal(isBareBubblesRoute(p), false, p);
    }
  });

  test("une variante de casse d'un chemin embed N'est PAS cadrable (casse respectee) et reste sans habillage par precaution", () => {
    for (const p of ["/CMC/crypto/bubbles/EMBED", "/cmc/Stocks/Bubbles/Embed"]) {
      assert.equal(effectiveHeaders(p).get("X-Frame-Options"), "DENY", p);
      assert.match(csp(p), /^frame-ancestors 'none'/, p);
      assert.equal(isBareBubblesRoute(p), true, p); // defense en profondeur : jamais de menu sur une variante
    }
  });

  test("next.config.mjs active la correspondance sensible a la casse (sinon l'exception couvrirait les variantes)", () => {
    const config = readFileSync(path.join(path.resolve(import.meta.dirname, ".."), "next.config.mjs"), "utf8");
    assert.match(config, /caseSensitiveRoutes:\s*true/);
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

describe("next.config.mjs : fichiers importes presents dans les images Docker", () => {
  // Les Dockerfiles copient apps/web fichier par fichier ou dossier par dossier : un module importe par la
  // config et absent de ces COPY fait echouer `next build` dans l'image (constate sur la PR d'origine).
  const webDir = path.resolve(import.meta.dirname, "..");
  const config = readFileSync(path.join(webDir, "next.config.mjs"), "utf8");
  const imports = [...config.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((m) => (m[1] ?? "").slice(2));

  test("la config importe au moins le module des en-tetes", () => {
    assert.ok(imports.includes("lib/security-headers.mjs"), imports.join(", "));
  });

  for (const dockerfile of ["Dockerfile", "Dockerfile.railway"]) {
    test(`${dockerfile} copie chaque module importe par next.config.mjs`, () => {
      // Seuls les OPERANDES SOURCE d'un COPY comptent (tous sauf le dernier, qui est la destination).
      const sources = readFileSync(path.join(webDir, dockerfile), "utf8").split(/\r?\n/)
        .filter((l) => /^\s*COPY\s/i.test(l))
        .flatMap((l) => l.trim().split(/\s+/).slice(1).filter((t) => !t.startsWith("--")).slice(0, -1))
        .map((s) => s.replace(/^wcore-web\//, "").replace(/\/+$/, ""));
      for (const rel of imports) {
        const wanted = `apps/web/${rel}`;
        assert.ok(sources.some((s) => wanted === s || wanted.startsWith(`${s}/`)), `${dockerfile} ne copie ni ${rel} ni son dossier (sources : ${sources.join(", ")})`);
      }
    });
  }
});