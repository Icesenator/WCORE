import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import manifest from "../lib/chain-icon-manifest.json";

// Elysium de Kinetiq (99901) : le logo venait d'une base d'icones tierce (llamao, rsz_elysium.jpg), qui montrait
// un autre logo (tourbillon vert). On utilise le logomark officiel (site du projet), embarque en local.

test("Elysium uses its own local icon, not the third-party icon database", () => {
  const src = (manifest as Record<string, string>).ELYSIUM;
  assert.equal(src, "/chains/ELYSIUM.webp");
  assert.ok(!/^https?:/i.test(src), "no remote icon");
});

test("the Elysium icon file is a valid, small, square WebP", () => {
  const file = path.join(process.cwd(), "public", "chains", "ELYSIUM.webp");
  const buf = fs.readFileSync(file);
  assert.ok(buf.length > 500 && buf.length < 20_000, `unexpected size ${buf.length}`);
  assert.equal(buf.subarray(0, 4).toString(), "RIFF");
  assert.equal(buf.subarray(8, 12).toString(), "WEBP");
  // VP8X : largeur et hauteur - 1 sur 24 bits, octets 24-26 et 27-29.
  assert.equal(buf.subarray(12, 16).toString(), "VP8X");
  const w = 1 + buf.readUIntLE(24, 3);
  const h = 1 + buf.readUIntLE(27, 3);
  assert.equal(w, h, "square icon");
  assert.ok(w >= 64, "at least 64 px for a 36 px display");
});
