import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const WEB = resolve(process.cwd());
const ROOT = resolve(WEB, "../../..");
const FORBIDDEN = [
  /180\+/,
  /\b178\s+chains?\b/i,
  /\b174\s+chains?\b/i,
  /\b183\s+chains?\b/i,
  /\b4\s+CEX\b/,
  /\b5\s+CEX\b/,
  /\b6\s+CEX\b/,
  /80\+\s*GM/i,
];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "CHANGELOG.md"]);
const SKIP_PATHS = [
  /CHANGELOG\.md$/i,
  /AGENTS-ARCHIVE\.md$/i,
  /docs[\\/]archive[\\/]/i,
  /wcore-post-(close-the-tabs|forgotten-wallets|one-portfolio|kraken|gm-|six-cex)/i,
];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs", ".md", ".svg"]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (EXTENSIONS.has(extname(entry))) files.push(full);
  }
  return files;
}

describe("coverage claim drift", () => {
  test("active sources do not advertise obsolete coverage numbers", () => {
    const hits: string[] = [];
    for (const file of [...walk(join(WEB, "app")), ...walk(join(WEB, "components")), ...walk(join(WEB, "lib")), join(WEB, "__tests__/site-copy.test.ts")]) {
      const rel = relative(ROOT, file).replaceAll("\\", "/");
      if (SKIP_PATHS.some((pattern) => pattern.test(rel))) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) hits.push(`${rel} matches ${pattern}`);
      }
    }
    assert.deepEqual(hits, []);
  });
});
