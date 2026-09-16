// Guards FLAGS.EXCLUDE_CONTRACTS in the gsheet EVM contract list builder.
//
// Arc (chainId 5042) pays gas in USDC: the native 18-dec balance and the 6-dec
// ERC-20 interface (0x3600…0000) share one balance, and the EIP-7708 system
// emitter logs native transfers. Either one, scanned as a token, would add a
// second USDC row and double-count the native balance.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const tokensSource = fs.readFileSync(path.join(ROOT, "src", "06_TOKENS.gs"), "utf8");

const ARC_USDC_ERC20 = "0x3600000000000000000000000000000000000000";
const ARC_SYSTEM_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe";
const LEGIT_TOKEN = "0xbeF5f6d51CB62b58e6A8f77868681825C6fe21c1";

function makeContext() {
  const context = {
    console,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    isFinite,
    parseInt,
    BigInt,
    Utilities: { newBlob: () => ({ getDataAsString: () => "" }) },
    // Addr lives in 02_UTILS.gs (not loaded here); mirror its normalisation.
    Addr: {
      normalize: (value) => {
        const v = String(value || "").trim().toLowerCase();
        return /^0x[0-9a-f]{40}$/.test(v) ? v : "";
      },
      pad32: (value) => String(value),
    },
  };
  vm.createContext(context);
  vm.runInContext(tokensSource, context);
  assert.equal(typeof context.ContractListBuilder, "object", "ContractListBuilder must load");
  return context;
}

test("ContractListBuilder.build skips FLAGS.EXCLUDE_CONTRACTS from cache and known tokens", () => {
  const context = makeContext();
  const config = {
    FLAGS: { EXCLUDE_CONTRACTS: [ARC_USDC_ERC20, ARC_SYSTEM_EMITTER] },
    KNOWN_TOKENS: {
      [ARC_USDC_ERC20]: { symbol: "USDC" },
      [LEGIT_TOKEN]: { symbol: "EURC" },
    },
    LIMITS: { MAX_TOKENS_RANGE_SCAN: 500 },
  };

  const out = context.ContractListBuilder.build(null, {
    [ARC_USDC_ERC20]: { contract: ARC_USDC_ERC20 },
    [ARC_SYSTEM_EMITTER]: { contract: ARC_SYSTEM_EMITTER },
    [LEGIT_TOKEN]: { contract: LEGIT_TOKEN },
  }, config);

  assert.equal(out.includes(ARC_USDC_ERC20), false, "excluded ERC-20 USDC must not be scanned");
  assert.equal(out.includes(ARC_SYSTEM_EMITTER), false, "excluded system emitter must not be scanned");
  assert.ok(out.includes(LEGIT_TOKEN.toLowerCase()), "legit tokens must still be scanned");
});

test("ContractListBuilder.build without EXCLUDE_CONTRACTS keeps every cached contract", () => {
  const context = makeContext();
  const out = context.ContractListBuilder.build(null, {
    [ARC_USDC_ERC20]: { contract: ARC_USDC_ERC20 },
    [LEGIT_TOKEN]: { contract: LEGIT_TOKEN },
  }, { FLAGS: {} });

  assert.ok(out.includes(ARC_USDC_ERC20), "no exclusion declared -> nothing filtered");
  assert.ok(out.includes(LEGIT_TOKEN.toLowerCase()), "legit token kept");
});

console.log("chain exclude-contracts guard OK");
