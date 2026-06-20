const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "..");
const SRC_DIR = path.join(ROOT, "src");
const WEB_CHAINS_DIR = path.join(REPO, "wcore-web", "packages", "core", "src", "chains");
const EXCLUDED = new Set(["TON"]);

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

function jsLiteral(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const lines = value.map((item) => `${"  ".repeat(indent + 1)}${jsLiteral(item, indent + 1)}`);
    return "[\n" + lines.join(",\n") + "\n" + pad + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    const lines = keys.map((key) => {
      const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
      return `${"  ".repeat(indent + 1)}${safeKey}: ${jsLiteral(value[key], indent + 1)}`;
    });
    return "{\n" + lines.join(",\n") + "\n" + pad + "}";
  }
  throw new Error(`unsupported value type: ${typeof value}`);
}

function factoryName(vm) {
  if (vm === "EVM") return "createEvmChain";
  if (vm === "SVM") return "createSvmChain";
  if (vm === "COSMOS") return "createCosmosChain";
  throw new Error(`unsupported VM for ChainFactory port: ${vm}`);
}

function emitGs(chainKey, config) {
  const vm = config.vm;
  const factory = factoryName(vm);
  const body = { ...config };
  delete body.key;
  delete body.vm;
  const chainName = config.CHAIN && config.CHAIN.NAME ? config.CHAIN.NAME : chainKey;
  return `/**
 * ${chainKey}.gs - ${chainName} (v4.15.51)
 * Phase 3 bulk port from wcore-web chain config.
 */

var _${chainKey} = ChainFactory.${factory}("${chainKey}", ${jsLiteral(body, 0)});

function GET_WALLET_ASSETS_${chainKey}(a,r,t,f,g){return _${chainKey}.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_${chainKey}(a){return _${chainKey}.getCachedWalletAssets(a);}
function ${chainKey}_REFRESH_STATUS(a,r,t,f,g){return _${chainKey}.getRefreshStatus(a,r,t,f,g);}
function ${chainKey}_STATS(a,t){return _${chainKey}.getStats(a,t);}
`;
}

const webChainFiles = fs.readdirSync(WEB_CHAINS_DIR)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "chains.test.ts")
  .map((file) => path.basename(file, ".ts"))
  .filter((chainKey) => !EXCLUDED.has(chainKey))
  .sort();

const created = [];
for (const chainKey of webChainFiles) {
  const outPath = path.join(SRC_DIR, `${chainKey}.gs`);
  if (fs.existsSync(outPath)) continue;
  const webPath = path.join(WEB_CHAINS_DIR, `${chainKey}.ts`);
  const config = extractConfigObject(readText(webPath), chainKey);
  fs.writeFileSync(outPath, emitGs(chainKey, config));
  created.push(chainKey);
}

console.log(`Created ${created.length} Phase 3 chain files: ${created.join(", ")}`);
