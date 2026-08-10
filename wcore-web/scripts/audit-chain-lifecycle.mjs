import fs from "node:fs";
import path from "node:path";

const apiUrl = (process.env.WCORE_API_URL || "https://api-production-b5bf.up.railway.app").replace(/\/$/, "");
const adminToken = process.env.ADMIN_TOKEN || "";
const outJson = process.env.CHAIN_AUDIT_JSON || "C:/Users/strau/AppData/Local/Temp/opencode/chain-lifecycle-audit.json";
const outText = process.env.CHAIN_AUDIT_TEXT || "C:/Users/strau/AppData/Local/Temp/opencode/chain-lifecycle-audit.txt";

if (!adminToken) throw new Error("ADMIN_TOKEN is required");

const [rpcResponse, chainlistResponse] = await Promise.all([
  fetch(`${apiUrl}/api/admin/chains/rpc-audit`, { headers: { "x-admin-token": adminToken } }),
  fetch("https://chainid.network/chains.json"),
]);

if (!rpcResponse.ok) throw new Error(`RPC audit failed: HTTP ${rpcResponse.status}`);
if (!chainlistResponse.ok) throw new Error(`ChainList failed: HTTP ${chainlistResponse.status}`);

const rpcAudit = await rpcResponse.json();
const chainlist = await chainlistResponse.json();
const chainlistById = new Map(chainlist.map((chain) => [chain.chainId, chain]));
const rows = rpcAudit.rows.map((row) => {
  const listed = chainlistById.get(row.chainId);
  return {
    ...row,
    chainlistName: listed?.name || null,
    removedFromChainlist: !listed,
    allDead: row.alive === 0,
    candidate: row.disabled && (!listed || row.alive === 0 || row.mismatched > 0),
  };
});
const candidates = rows.filter((row) => row.candidate);
const report = {
  generatedAt: rpcAudit.generatedAt,
  apiUrl,
  scanned: rows.length,
  candidates,
  removedFromChainlist: rows.filter((row) => row.removedFromChainlist),
  allDead: rows.filter((row) => row.allDead),
  mismatched: rows.filter((row) => row.mismatched > 0),
  rows,
};

fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.mkdirSync(path.dirname(outText), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

const lines = [
  `Chain lifecycle audit ${report.generatedAt}`,
  `Scanned: ${report.scanned}`,
  `Removal candidates: ${candidates.length}`,
  "",
];
for (const row of candidates) {
  const reasons = [];
  if (row.removedFromChainlist) reasons.push("removed_from_chainlist");
  if (row.allDead) reasons.push("all_rpcs_dead");
  if (row.mismatched > 0) reasons.push("chain_id_mismatch");
  lines.push(`${row.key} chainId=${row.chainId} alive=${row.alive}/${row.total} reasons=${reasons.join(",")}`);
  for (const endpoint of row.endpoints) lines.push(`  ${endpoint.ok ? "OK" : "KO"} ${endpoint.url} ${endpoint.error || `${endpoint.ms}ms`}`);
}
fs.writeFileSync(outText, `${lines.join("\n")}\n`);

console.log(lines.join("\n"));
console.log(`JSON: ${outJson}`);
console.log(`Text: ${outText}`);

if (process.env.CHAIN_AUDIT_FAIL_ON_CANDIDATES === "1" && candidates.length > 0) process.exitCode = 2;
