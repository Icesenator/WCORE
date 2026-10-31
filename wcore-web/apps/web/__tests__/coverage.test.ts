import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CEX_PROVIDERS, GM_FACTORIES } from "@wcore/shared";
import { getCoverageStats } from "../lib/coverage";

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isRetiredChain } from "@wcore/shared";

test("stale coverage files exclude retired keys and neutral aliases with retired IDs", () => {
  const fixtures: Record<string, string> = {
    'ETHEREUM.ts': 'key: "ETHEREUM", CHAIN_ID: 1',
    'SUPERSEED.ts': 'key: "SUPERSEED", CHAIN_ID: 5330',
    'LEGACY_ALIAS.js': 'key: "LEGACY_ALIAS", CHAIN_ID: 5330',
    'SUPR.ts': 'key: "SUPR", CHAIN_ID: 123',
  };
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL('../lib/coverage.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, process: { cwd: () => '/' }, require(id: string) {
    if (id === 'node:fs') return { readdirSync: () => Object.keys(fixtures), readFileSync: (path: string) => fixtures[path.split(/[\\/]/).pop()!] };
    if (id === 'node:path') return { resolve: (...parts: string[]) => parts.join('/') };
    if (id === '@wcore/shared') return { CEX_PROVIDERS, GM_FACTORIES, isRetiredChain };
    throw new Error(id);
  } });
  assert.equal(exports.getCoverageStats().chainConfigCount, 2);
});

describe("coverage stats", () => {
  test("derives counts from live registries instead of copied integers", () => {
    const stats = getCoverageStats();
    assert.equal(stats.cexProviderCount, CEX_PROVIDERS.length);
    assert.equal(stats.gmEnabledChainCount, Object.keys(GM_FACTORIES).length);
    assert.equal(stats.cexProviderCount, 7);
    assert.equal(stats.chainConfigCount, 157); // Superseed 5330 et B3 Mainnet 8333 retirés du catalogue actif.
    assert.notEqual(stats.chainConfigCount, 325);
  });
});
