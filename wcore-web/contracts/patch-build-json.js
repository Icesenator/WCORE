// Patch apps/web/public/build.json: replace GmFactoryParis and GmOnChainParis
// with the KCC-compatible 0.8.19 Paris build (no PUSH0 anywhere).
const fs = require("fs");
const path = require("path");

const contractsDir = __dirname;
const buildPath = path.join(contractsDir, "..", "apps", "web", "public", "build.json");

const build = JSON.parse(fs.readFileSync(buildPath, "utf8"));

for (const name of ["GmFactory", "GmOnChain"]) {
  const compiled = JSON.parse(fs.readFileSync(path.join(contractsDir, `${name}.v0819.json`), "utf8"));
  const entry = build[name];
  if (!entry) { console.error("No entry for", name); process.exit(1); }
  const parisKey = `${name}Paris`;
  build[parisKey] = { abi: entry.abi, bin: compiled.bin };
  console.log("Updated " + parisKey + ": bin=" + compiled.bin.length + " chars, compilerVersion=0.8.19 paris");
}

fs.writeFileSync(buildPath, JSON.stringify(build, null, 2) + "\n");
console.log("Patched", buildPath, "size now", fs.statSync(buildPath).size, "bytes");
