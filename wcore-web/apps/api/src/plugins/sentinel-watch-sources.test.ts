// Run: tsx --test apps/api/src/plugins/sentinel-watch-sources.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { WATCH_SOURCES } from "./sentinel-watch-sources.js";
import { isPublicHttp } from "../lib/safe-http.js";

test("sources de veille : https publiques, sans doublon chaine+url, cles en minuscules", () => {
  assert.ok(WATCH_SOURCES.length >= 40);
  const seen = new Set<string>();
  for (const s of WATCH_SOURCES) {
    assert.ok(s.url.startsWith("https://") && isPublicHttp(s.url), s.url);
    assert.match(s.chainKey, /^[a-z0-9_]+$/);
    const k = `${s.chainKey}|${s.url}`;
    assert.ok(!seen.has(k), k);
    seen.add(k);
  }
});
