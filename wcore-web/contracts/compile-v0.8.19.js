// Compile GmOnChain + GmFactory with solc 0.8.19 (Paris default, no PUSH0 anywhere)
// Strategy: write temporary .sol copies with relaxed pragma, compile those, then keep results.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const contractsDir = __dirname;
const tmpDir = path.join(contractsDir, "tmp-paris");

// Clean tmp dir
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });

// Copy and relax pragma
for (const f of ["GmOnChain.sol", "GmFactory.sol"]) {
  const src = fs.readFileSync(path.join(contractsDir, f), "utf8");
  // Replace "pragma solidity ^0.8.20;" with "pragma solidity ^0.8.19;"
  const relaxed = src.replace(/pragma solidity \^0\.8\.20;/, "pragma solidity ^0.8.19;");
  if (relaxed === src) { console.error("No pragma found in " + f); process.exit(1); }
  fs.writeFileSync(path.join(tmpDir, f), relaxed);
  console.log("Wrote relaxed-pragma copy:", path.join(tmpDir, f));
}

const sources = {
  "GmOnChain.sol": { content: fs.readFileSync(path.join(tmpDir, "GmOnChain.sol"), "utf8") },
  "GmFactory.sol": { content: fs.readFileSync(path.join(tmpDir, "GmFactory.sol"), "utf8") },
};

const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

function findImports(p) { return { error: "File not found: " + p }; }

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

if (output.errors) for (const e of output.errors) console.log("[" + e.severity + "]", e.formattedMessage);

function countRealPush0(hex) {
  const bytes = hex.match(/.{2}/g) || [];
  let count = 0;
  const positions = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === "5f") {
      if (i === 0) { count++; positions.push(i); continue; }
      const prev = parseInt(bytes[i - 1], 16);
      if (prev < 0x60 || prev > 0x7f) { count++; positions.push(i); }
    }
  }
  return { count, positions };
}

for (const f of Object.keys(output.contracts || {})) {
  for (const n of Object.keys(output.contracts[f])) {
    const c = output.contracts[f][n];
    const bin = c.evm.bytecode.object;
    const run = c.evm.deployedBytecode.object;
    const startPattern = "fe6080604052";
    const idx = bin.indexOf(startPattern);
    const constructor = idx >= 0 ? bin.slice(0, idx + 2) : bin;
    const conStats = countRealPush0(constructor);
    const runStats = countRealPush0(run);
    console.log(`${n}: bin=${bin.length/2}B constructor=${constructor.length/2}B (PUSH0=${conStats.count}), runtime=${run.length/2}B (PUSH0=${runStats.count})`);
    fs.writeFileSync(path.join(contractsDir, n + ".v0819.json"), JSON.stringify({
      abi: c.abi,
      bin,
      deployedBytecode: run,
      push0InConstructor: conStats.count,
      push0InRuntime: runStats.count,
      compilerVersion: "0.8.19",
    }, null, 2));
  }
}

// Clean up tmp dir
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log("Cleaned tmp-paris dir");

if (output.errors && output.errors.some((e) => e.severity === "error")) process.exit(1);
console.log("Solidity version:", solc.version());
