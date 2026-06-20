#!/usr/bin/env node
// tools/extract-chains.mjs
// Extracts the 180+ chain configs from src/*.gs (ChainFactory.createXxxChain blocks)
// and emits one TS file per chain in dist/chains/<key>.ts.
// Plus an index.ts that aggregates them.
//
// Source of truth: wcore-gsheet/src/*.gs (Google Apps Script).
// Output: wcore-gsheet/dist/chains/ (consumed by wcore-web via pnpm workspace).

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC_DIR = join(ROOT, "src");
const OUT_DIR = join(ROOT, "dist", "chains");

const FACTORY_RE =
  /var\s+_([A-Z][A-Z0-9_]*)\s*=\s*ChainFactory\.create(Evm|Svm|Cosmos|Ton)Chain\s*\(\s*["']([A-Z][A-Z0-9_]*)["']\s*,\s*\{/;

function findChainFiles() {
  return readdirSync(SRC_DIR)
    .filter((n) => n.endsWith(".gs"))
    .filter((n) => /^[A-Z][A-Z0-9_]*\.gs$/.test(n))
    .map((n) => join(SRC_DIR, n));
}

function extractObjectLiteral(text, startBraceIdx) {
  let depth = 0;
  let inStr = null;
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = startBraceIdx; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return [startBraceIdx, i + 1];
    }
  }
  throw new Error("unbalanced braces");
}

function safeEvalLiteral(literal, prelude = "") {
  return new Function(`"use strict";\n${prelude}\nreturn (${literal});`)();
}

function collectPrelude(text, factoryIdx) {
  const before = text.slice(0, factoryIdx);
  const re = /\bvar\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  const out = [];
  let match;
  while ((match = re.exec(before))) {
    const name = match[1];
    if (name.startsWith("_")) continue;
    const valueStart = re.lastIndex;
    const ch = before[valueStart];
    let valueEnd;
    if (ch === "{" || ch === "[") {
      try {
        const [, end] = scanBalanced(before, valueStart, ch === "{" ? "}" : "]");
        valueEnd = end;
      } catch {
        continue;
      }
    } else {
      const semi = before.indexOf(";", valueStart);
      if (semi < 0) continue;
      valueEnd = semi;
    }
    const valueText = before.slice(valueStart, valueEnd);
    out.push(`var ${name} = ${valueText};`);
  }
  return out.join("\n");
}

function scanBalanced(text, startIdx, closeChar) {
  const openChar = text[startIdx];
  let depth = 0;
  let inStr = null;
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (c === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return [startIdx, i + 1];
    }
  }
  throw new Error("unbalanced");
}

function tsLiteral(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => tsLiteral(v, indent + 1));
    return `[\n${items.map((s) => "  ".repeat(indent + 1) + s).join(",\n")},\n${pad}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    const lines = keys.map((k) => {
      const v = tsLiteral(value[k], indent + 1);
      const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      return `${"  ".repeat(indent + 1)}${safeKey}: ${v}`;
    });
    return `{\n${lines.join(",\n")},\n${pad}}`;
  }
  throw new Error(`unsupported value type: ${typeof value}`);
}

function vmTypeFor(factoryKind) {
  if (factoryKind === "Evm") return "EVM";
  if (factoryKind === "Svm") return "SVM";
  if (factoryKind === "Cosmos") return "COSMOS";
  if (factoryKind === "Ton") return "TON";
  throw new Error(`unknown factory kind: ${factoryKind}`);
}

function extractFromFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const m = FACTORY_RE.exec(text);
  if (!m) return null;
  const [, varName, kind, key] = m;
  const openBrace = text.indexOf("{", m.index + m[0].length - 1);
  const [, end] = extractObjectLiteral(text, openBrace);
  const literal = text.slice(openBrace, end);
  const prelude = collectPrelude(text, m.index);
  const config = safeEvalLiteral(literal, prelude);
  return { varName, kind, key, config };
}

function emitChainFile(chain, outPath) {
  const { kind, key, config } = chain;
  const vm = vmTypeFor(kind);
  const body = tsLiteral(config, 0);
  const ts =
    `// Auto-generated from src/${key}.gs by tools/extract-chains.mjs\n` +
    `// Do not edit by hand. Re-run: node tools/extract-chains.mjs\n\n` +
    `import type { ChainConfig } from "../types.js";\n\n` +
    `export const ${key}: ChainConfig = {\n` +
    `  key: ${JSON.stringify(key)},\n` +
    `  vm: ${JSON.stringify(vm)},\n` +
    `  ...(${body} as Omit<ChainConfig, "key" | "vm">),\n` +
    `};\n` +
    `\nexport default ${key};\n`;
  writeFileSync(outPath, ts);
}

function emitIndex(chains) {
  const sorted = [...chains].sort((a, b) => a.key.localeCompare(b.key));
  const imports = sorted
    .map((c) => `import { ${c.key} } from "./${c.key}.js";`)
    .join("\n");
  const entries = sorted.map((c) => `  ${c.key},`).join("\n");
  const ts =
    `// Auto-generated by tools/extract-chains.mjs. Do not edit by hand.\n` +
    `import type { ChainConfig } from "../types.js";\n\n` +
    `${imports}\n\n` +
    `export const chains = {\n${entries}\n} as const satisfies Record<string, ChainConfig>;\n\n` +
    `export type ChainKey = keyof typeof chains;\n\n` +
    `export const chainList: readonly ChainConfig[] = Object.values(chains);\n\n` +
    `export function getChain(key: string): ChainConfig | undefined {\n` +
    `  return (chains as Record<string, ChainConfig>)[key];\n` +
    `}\n`;
  writeFileSync(join(OUT_DIR, "index.ts"), ts);
}

function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const files = findChainFiles();
  const chains = [];
  const skipped = [];

  for (const f of files) {
    try {
      const result = extractFromFile(f);
      if (!result) {
        skipped.push({ file: f, reason: "no factory call" });
        continue;
      }
      const outPath = join(OUT_DIR, `${result.key}.ts`);
      emitChainFile(result, outPath);
      chains.push(result);
    } catch (err) {
      skipped.push({ file: f, reason: err.message });
    }
  }

  emitIndex(chains);

  const byKind = chains.reduce((acc, c) => {
    acc[c.kind] = (acc[c.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[extract-chains] emitted ${chains.length} chains ` +
      `(EVM=${byKind.Evm ?? 0} SVM=${byKind.Svm ?? 0} Cosmos=${byKind.Cosmos ?? 0})`,
  );
  if (skipped.length) {
    console.log(`[extract-chains] skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s.file}: ${s.reason}`);
  }
}

main();
