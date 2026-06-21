import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import manifest from "../lib/chain-icon-manifest.json";

const PREVIOUSLY_BROKEN = ["AEVO", "PLAYNANCE_PLAYBLOCK", "SHIDO_NETWORK"] as const;
const QUESTION_MARK_PLACEHOLDERS = [
  "NEXUS",
  "STEP_NETWORK",
  "HYCHAIN",
  "CROSSBELL",
  "NEXI_CHAIN",
  "LUMIO",
  "BXN",
  "MOCA_CHAIN",
] as const;

describe("chain icon manifest", () => {
  test("uses browser-decodable replacement files for previously broken icons", () => {
    for (const chainKey of PREVIOUSLY_BROKEN) {
      const src = (manifest as Record<string, string>)[chainKey];
      assert.ok(src, `${chainKey} is present in the chain icon manifest`);
      assert.equal(path.extname(src).toLowerCase(), ".png", `${chainKey} should not point to the broken .ico asset`);

      const file = path.join(process.cwd(), "public", src.replace(/^\//, ""));
      assert.ok(fs.existsSync(file), `${chainKey} icon file exists`);
      assert.ok(fs.statSync(file).size > 0, `${chainKey} icon file is not empty`);
    }
  });

  test("does not use known question-mark placeholder image files", () => {
    for (const chainKey of QUESTION_MARK_PLACEHOLDERS) {
      const src = (manifest as Record<string, string>)[chainKey];
      if (!src) continue;
      assert.notEqual(src, `/chains/${chainKey}.png`, `${chainKey} should not point to the old local question-mark placeholder`);
    }
  });

  test("Intuition uses the official logo instead of the text placeholder", () => {
    assert.equal(
      (manifest as Record<string, string>).INTUITION,
      "https://cdn.prod.website-files.com/65cdf366e68587fd384547f0/65cdf4b15329ddf9e0f63848_webclip.jpg",
    );
  });
});
