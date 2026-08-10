const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT, "dist", "chains");
const WEB_RUNTIME_DIR = path.join(ROOT, "..", "wcore-web", "packages", "core", "src", "chains");

function readConfig(directory, chainKey) {
  const text = fs.readFileSync(path.join(directory, `${chainKey}.ts`), "utf8");
  const marker = `export const ${chainKey}: ChainConfig = {`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `${chainKey}: missing export const`);
  const objectStart = text.indexOf("{", start);
  const objectEnd = text.lastIndexOf("};");
  const objectText = text
    .slice(objectStart, objectEnd + 1)
    .replace(/\.\.\.\(\{/g, "")
    .replace(/\}\s+as\s+Omit<ChainConfig,\s*"key"\s*\|\s*"vm">\),?/g, "");
  return new Function(`return (${objectText});`)();
}

function readCanonicalConfig(chainKey) {
  const text = fs.readFileSync(path.join(ROOT, "src", `${chainKey}.gs`), "utf8");
  const marker = `ChainFactory.createEvmChain("${chainKey}",`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `${chainKey}: missing canonical factory call`);
  const objectStart = text.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = objectStart; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      return new Function(`return (${text.slice(objectStart, i + 1)});`)();
    }
  }
  assert.fail(`${chainKey}: unterminated canonical config`);
}

const CONFIGS = [
  ["canonical source", readCanonicalConfig],
  ["generated runtime", (chainKey) => readConfig(GENERATED_DIR, chainKey)],
  ["web runtime", (chainKey) => readConfig(WEB_RUNTIME_DIR, chainKey)],
];

test("BSC canonical, generated, and runtime configs use bounded Binance dataseed RPCs", () => {
  const expectedEndpoints = [
    "https://bsc.drpc.org",
    "https://bsc-dataseed1.binance.org",
    "https://bsc-dataseed2.binance.org",
  ];

  for (const [runtime, read] of CONFIGS) {
    const bsc = read("BSC");
    assert.deepEqual(bsc.RPC.ENDPOINTS, expectedEndpoints, `${runtime} endpoints`);
    assert.equal(bsc.RPC.MAX_LOG_RANGE, 5000, `${runtime} MAX_LOG_RANGE`);
  }
});

test("BSC canonical and generated configs retain individual JSON-RPC batching", () => {
  const canonical = readCanonicalConfig("BSC");
  const generated = readConfig(GENERATED_DIR, "BSC");
  assert.equal(canonical.RPC.DISABLE_JSON_RPC_BATCH, true, "canonical source DISABLE_JSON_RPC_BATCH");
  assert.equal(generated.RPC.DISABLE_JSON_RPC_BATCH, true, "generated runtime DISABLE_JSON_RPC_BATCH");
});

test("Monad canonical, generated, and runtime configs cap log ranges at 1000", () => {
  for (const [runtime, read] of CONFIGS) {
    const monad = read("MONAD");
    assert.equal(monad.RPC.MAX_LOG_RANGE, 1000, `${runtime} MAX_LOG_RANGE`);
  }
});


