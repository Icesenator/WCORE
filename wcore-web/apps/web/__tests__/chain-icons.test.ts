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
  "LUMIO",
  "BXN",
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

  test("every local manifest entry points to an existing, non-empty file", () => {
    const entries = Object.entries(manifest as Record<string, string>).filter(([, src]) => src.startsWith("/"));
    assert.ok(entries.length > 150, `expected the manifest to be broadly populated, got ${entries.length} local entries`);
    for (const [chainKey, src] of entries) {
      const file = path.join(process.cwd(), "public", src.replace(/^\//, ""));
      assert.ok(fs.existsSync(file), `${chainKey} -> ${src} exists`);
      assert.ok(fs.statSync(file).size > 0, `${chainKey} -> ${src} is not empty`);
    }
  });

  test("no manifest entry depends on a known-dead remote host", () => {
    // rubyscore served HEMI's SVG and now answers 404, which made the icon fall
    // back to an emoji glyph in Value Distribution.
    const DEAD_HOSTS = ["rubyscore.fra1.digitaloceanspaces.com"] as const;
    for (const [chainKey, src] of Object.entries(manifest as Record<string, string>)) {
      for (const host of DEAD_HOSTS) {
        assert.ok(!src.includes(host), `${chainKey} must not depend on the dead host ${host}`);
      }
    }
  });

  test("ChainIcon has no emoji/glyph fallback (neutral monogram only)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components", "ChainIcon.tsx"), "utf8");
    const BANNED_GLYPHS = [
      "\u27E0", "\uD83D\uDD35", "\uD83D\uDD36", "\uD83D\uDD34", "\uD83D\uDFE3", "\uD83D\uDFE1",
      "\uD83D\uDD3A", "\uD83D\uDFE2", "\u2B1C", "\u2B1B", "\u25CE", "\u269B", "\uD83D\uDCA7",
      "\uD83C\uDF0A", "\u26D3",
    ] as const;
    for (const glyph of BANNED_GLYPHS) {
      assert.ok(!src.includes(glyph), `ChainIcon must not render the ${JSON.stringify(glyph)} glyph fallback`);
    }
    for (const ch of src) {
      const cp = ch.codePointAt(0)!;
      assert.ok(cp < 0x1f000, `ChainIcon must not contain emoji codepoint U+${cp.toString(16).toUpperCase()}`);
    }
  });

  test("ValueDistribution keys chain rows by name, not by list index", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "components", "ValueDistribution.tsx"), "utf8");
    assert.ok(src.includes("key={entry.name}"), "rows must be keyed by chain name");
    assert.ok(!/key=\{i\}/.test(src), "index keys let a ChainIcon failure stick to a slot after a reorder");
  });
});
