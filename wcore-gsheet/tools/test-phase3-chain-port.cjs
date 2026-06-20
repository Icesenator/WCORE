const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const WEB_CHAINS_DIR = path.join(REPO, "wcore-web", "packages", "core", "src", "chains");
const EXCLUDED_WEB_CHAINS = new Set();

function expectedChains() {
  return fs.readdirSync(WEB_CHAINS_DIR)
    .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "chains.test.ts")
    .map((file) => path.basename(file, ".ts"))
    .filter((chainKey) => !EXCLUDED_WEB_CHAINS.has(chainKey))
    .sort();
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function extractConfigObject(tsText, chainKey) {
  const startMarker = `export const ${chainKey}: ChainConfig = {`;
  const start = tsText.indexOf(startMarker);
  assert.notEqual(start, -1, `${chainKey}: missing export const`);
  const objectStart = tsText.indexOf("{", start);
  const objectEnd = tsText.lastIndexOf("};");
  assert.ok(objectStart > start && objectEnd > objectStart, `${chainKey}: malformed ChainConfig export`);
  const objectText = tsText
    .slice(objectStart, objectEnd + 1)
    .replace(/\.\.\.\(\{/g, "")
    .replace(/\}\s+as\s+Omit<ChainConfig,\s*"key"\s*\|\s*"vm">\),?/g, "");
  return new Function(`return (${objectText});`)();
}

function comparable(config) {
  return {
    key: config.key,
    vm: config.vm,
    cacheVersion: config.CACHE_VERSION,
    endpoints: config.RPC && config.RPC.ENDPOINTS,
    chain: config.CHAIN,
    llamaIdMap: config.LLAMA_ID_MAP || {},
    llamaContractMap: config.LLAMA_CONTRACT_MAP || {},
  };
}

function expectedFactoryForVm(vm) {
  if (vm === "EVM") return "createEvmChain";
  if (vm === "SVM") return "createSvmChain";
  if (vm === "COSMOS") return "createCosmosChain";
  if (vm === "TON") return "createTonChain";
  throw new Error(`unsupported VM in test: ${vm}`);
}

execFileSync(process.execPath, ["tools/extract-chains.mjs"], {
  cwd: ROOT,
  stdio: "pipe",
});

const chainsToVerify = expectedChains();

for (const chainKey of chainsToVerify) {
  const gsPath = path.join(ROOT, "src", `${chainKey}.gs`);
  assert.ok(fs.existsSync(gsPath), `${chainKey}: missing src/${chainKey}.gs`);
  const gsText = readText(gsPath);
  assert.match(gsText, new RegExp(`ChainFactory\\.create(Evm|Svm|Cosmos|Ton)Chain\\(\\s*["']${chainKey}["']`), `${chainKey}: must use ChainFactory`);
  assert.match(gsText, new RegExp(`function GET_WALLET_ASSETS_${chainKey}\\(`), `${chainKey}: missing GET_WALLET_ASSETS function`);
  assert.match(gsText, new RegExp(`function CACHED_WALLET_ASSETS_${chainKey}\\(`), `${chainKey}: missing CACHED_WALLET_ASSETS function`);
  assert.match(gsText, new RegExp(`function ${chainKey}_REFRESH_STATUS\\(`), `${chainKey}: missing REFRESH_STATUS function`);
  assert.match(gsText, new RegExp(`function ${chainKey}_STATS\\(`), `${chainKey}: missing STATS function`);

  const generatedPath = path.join(ROOT, "dist", "chains", `${chainKey}.ts`);
  assert.ok(fs.existsSync(generatedPath), `${chainKey}: extraction did not emit dist/chains/${chainKey}.ts`);

  if (/Phase 3 .*port from wcore-web chain config/.test(gsText)) {
    const webPath = path.join(REPO, "wcore-web", "packages", "core", "src", "chains", `${chainKey}.ts`);
    const web = comparable(extractConfigObject(readText(webPath), chainKey));
    const expectedFactory = expectedFactoryForVm(web.vm);
    assert.match(gsText, new RegExp(`ChainFactory\\.${expectedFactory}\\(\\s*["']${chainKey}["']`), `${chainKey}: must use ChainFactory.${expectedFactory}`);
    const generated = comparable(extractConfigObject(readText(generatedPath), chainKey));
    assert.deepEqual(generated, web, `${chainKey}: extracted config differs from web config`);
  }
}

execFileSync(process.execPath, ["build-index.mjs"], {
  cwd: WEB_CHAINS_DIR,
  stdio: "pipe",
});

const gsheetCount = fs.readdirSync(path.join(ROOT, "dist", "chains"))
  .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "types.ts")
  .length;
const localUniqueCount = fs.readdirSync(WEB_CHAINS_DIR)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "chains.test.ts")
  .map((file) => path.basename(file, ".ts"))
  .filter((chainKey) => !fs.existsSync(path.join(ROOT, "dist", "chains", `${chainKey}.ts`)))
  .length;
const webIndexText = readText(path.join(WEB_CHAINS_DIR, "index.ts"));
assert.match(
  webIndexText,
  new RegExp(`Source: @wcore/chains \\(${gsheetCount} chains from wcore-gsheet/dist\\) \\+ ${localUniqueCount} local web-only chains\\.`),
  "web chain index should report dynamic gsheet/local counts"
);

console.log(`Phase 3 chain ports OK: ${chainsToVerify.length} chains verified; excluded: ${Array.from(EXCLUDED_WEB_CHAINS).join(", ")}`);
