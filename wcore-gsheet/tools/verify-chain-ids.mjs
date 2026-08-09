// Verifies that every EVM chain config declares the chainId its own RPC endpoints serve.
//
// This class of bug appeared twice: SOMNIA shipped with 50311 while all five of its
// endpoints answer 5031. Nothing failed loudly, the chainId consensus just never matched
// and the chain looked degraded. `npm test` cannot catch it because the truth only exists
// on the network, so this check is deliberately kept out of the blocking CI.
//
// It only fails on a CONTRADICTION: an endpoint that answers a valid chainId different
// from the config. Unreachable, rate-limited or geo-blocked endpoints are reported and
// ignored, because reachability depends on the IP the check runs from and would otherwise
// make this permanently red and therefore useless.
//
// Usage: node tools/verify-chain-ids.mjs

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAINS_DIR = path.join(ROOT, "dist", "chains");
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;

function extractConfig(text, chainKey) {
  const start = text.indexOf(`export const ${chainKey}: ChainConfig = {`);
  if (start === -1) return null;
  const objectStart = text.indexOf("{", start);
  const objectEnd = text.lastIndexOf("};");
  if (objectStart === -1 || objectEnd <= objectStart) return null;
  const objectText = text
    .slice(objectStart, objectEnd + 1)
    .replace(/\.\.\.\(\{/g, "")
    .replace(/\}\s+as\s+Omit<ChainConfig,\s*"key"\s*\|\s*"vm">\),?/g, "");
  try {
    return new Function(`return (${objectText});`)();
  } catch {
    return null;
  }
}

function loadTargets() {
  const targets = [];
  for (const file of readdirSync(CHAINS_DIR)) {
    if (!file.endsWith(".ts") || file === "index.ts" || file === "types.ts") continue;
    const chainKey = path.basename(file, ".ts");
    const config = extractConfig(readFileSync(path.join(CHAINS_DIR, file), "utf8"), chainKey);
    if (!config || config.vm !== "EVM") continue;
    if (config.FLAGS?.DISABLE_CHAIN === true) continue;

    const chainId = config.CHAIN?.CHAIN_ID;
    if (typeof chainId !== "number" || !Number.isFinite(chainId)) continue;

    const endpoints = (config.RPC?.ENDPOINTS ?? []).filter(
      (url) => typeof url === "string" && url.startsWith("http"),
    );
    for (const endpoint of endpoints) targets.push({ chainKey, chainId, endpoint });
  }
  return targets;
}

async function probe({ chainKey, chainId, endpoint }) {
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    body = await response.text();
  } catch (error) {
    return { chainKey, chainId, endpoint, status: "unreachable", detail: String(error?.message ?? error) };
  }

  if (!response.ok) {
    return { chainKey, chainId, endpoint, status: "unreachable", detail: `HTTP ${response.status}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { chainKey, chainId, endpoint, status: "unreachable", detail: "non-JSON response" };
  }

  // A JSON-RPC error, or a provider that answers 200 with an error envelope
  // ("Invalid chain" on thirdweb mirrors), proves nothing about the chainId.
  if (parsed?.error || typeof parsed?.result !== "string") {
    return {
      chainKey,
      chainId,
      endpoint,
      status: "unreachable",
      detail: String(parsed?.error?.message ?? "no result"),
    };
  }

  let served;
  try {
    served = Number(BigInt(parsed.result));
  } catch {
    return { chainKey, chainId, endpoint, status: "unreachable", detail: `unparsable result ${parsed.result}` };
  }

  if (served !== chainId) {
    return { chainKey, chainId, endpoint, status: "mismatch", detail: `serves ${served}` };
  }
  return { chainKey, chainId, endpoint, status: "match", detail: String(served) };
}

const targets = loadTargets();
const results = new Array(targets.length);
let cursor = 0;

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    while (cursor < targets.length) {
      const index = cursor++;
      results[index] = await probe(targets[index]);
    }
  }),
);

const mismatches = results.filter((r) => r.status === "mismatch");
const unreachable = results.filter((r) => r.status === "unreachable");
const matched = results.filter((r) => r.status === "match");

const checkedChains = new Set(targets.map((t) => t.chainKey)).size;
console.log(
  `[verify-chain-ids] ${checkedChains} EVM chains, ${targets.length} endpoints: ` +
    `${matched.length} confirmed, ${unreachable.length} unreachable, ${mismatches.length} mismatched`,
);

// A chain whose every endpoint is unreachable cannot be scanned at all. That is worth
// surfacing, but it is IP-dependent so it never fails the run.
const confirmedChains = new Set(matched.map((r) => r.chainKey));
const unconfirmed = [...new Set(targets.map((t) => t.chainKey))]
  .filter((key) => !confirmedChains.has(key))
  .sort();
if (unconfirmed.length > 0) {
  console.log(`\n[warn] no endpoint confirmed the chainId for: ${unconfirmed.join(", ")}`);
}

if (mismatches.length > 0) {
  console.error("\n[error] configured chainId contradicted by a live endpoint:");
  for (const m of mismatches) {
    console.error(`  ${m.chainKey}: config ${m.chainId}, ${m.endpoint} ${m.detail}`);
  }
  process.exit(1);
}
