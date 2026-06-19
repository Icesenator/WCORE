import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Static checks on apps/web/public/build.json. These run at unit-test time
// and fail loudly if a contributor adds a new chain to PARIS_BUILD_CHAINS
// without providing a matching PUSH0-free Paris bytecode in build.json.

function findPush0(hex: string): number[] {
  const bytes = hex.match(/.{2}/g) ?? [];
  const positions: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = parseInt(bytes[i] ?? "00", 16);
    if (b === 0x5f) { positions.push(i); i++; continue; }
    if (b >= 0x60 && b <= 0x7f) { i += 1 + (b - 0x5f); continue; }
    i++;
  }
  return positions;
}

function splitConstructorAndRuntime(bin: string): { constructor: string; runtime: string } {
  const startPattern = "fe6080604052";
  const idx = bin.indexOf(startPattern);
  if (idx < 0) return { constructor: "", runtime: "" };
  return { constructor: bin.slice(0, idx + 2), runtime: bin.slice(idx + 2) };
}

const here = dirname(fileURLToPath(import.meta.url));
const buildPath = join(here, "..", "..", "..", "public", "build.json");
const build = JSON.parse(readFileSync(buildPath, "utf8")) as {
  GmOnChainParis?: { abi: unknown[]; bin: string };
  GmFactoryParis?: { abi: unknown[]; bin: string };
};

test("build.json exposes GmOnChainParis with 0 PUSH0 in constructor and runtime", () => {
  assert.ok(build.GmOnChainParis, "GmOnChainParis missing from build.json");
  const { constructor, runtime } = splitConstructorAndRuntime(build.GmOnChainParis!.bin);
  assert.deepEqual(findPush0(constructor), [], "GmOnChainParis constructor has PUSH0");
  assert.deepEqual(findPush0(runtime), [], "GmOnChainParis runtime has PUSH0 (incompatible with pre-Shanghai chains)");
});

test("build.json exposes GmFactoryParis with 0 PUSH0 in constructor and runtime", () => {
  assert.ok(build.GmFactoryParis, "GmFactoryParis missing from build.json");
  const { constructor, runtime } = splitConstructorAndRuntime(build.GmFactoryParis!.bin);
  assert.deepEqual(findPush0(constructor), [], "GmFactoryParis constructor has PUSH0");
  assert.deepEqual(findPush0(runtime), [], "GmFactoryParis runtime has PUSH0 (incompatible with pre-Shanghai chains)");
});
