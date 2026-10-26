import { test } from "node:test";
import assert from "node:assert/strict";
import { AnyAddress } from "@wcore/shared";
import {
  AdminEventsQuerySchema,
  BatchScanRequestBodySchema,
  CexAccountBodySchema,
  ChainKey,
  CustomTokenAddBodySchema,
  EvmAddress,
  FunnelEventsBodySchema,
  GmDeployBodySchema,
  GmOnchainBodySchema,
  LinkedWalletPatchBodySchema,
  MetricsHistoryQuerySchema,
  NonceQuerySchema,
  ScanRequestBodySchema,
  ScanShareBodySchema,
  ScansQuerySchema,
  SupportTicketCreateBodySchema,
  TxHash,
} from "./schemas.js";

// Validation contracts the API relies on, pinned during the Zod 3 -> 4 migration.
// A differential run over 5 797 inputs found no change in accepted output or in
// the first issue path; these cases keep the behaviour callers depend on.

const EVM = "0x17d518736EE9341dcdc0a2498e013d33cfcdd080";
const TX = `0x${"ab".repeat(32)}`;
const funnelEvent = { event: "scan_started", campaign: "unknown", surface: "home", variant: "control", dimensions: {} };

test("defaults are applied only when the field is absent", () => {
  assert.equal(GmOnchainBodySchema.parse({ txHash: TX }).chainKey, "base");
  assert.equal(GmOnchainBodySchema.parse({ txHash: TX, chainKey: "BASE" }).chainKey, "base");
  assert.equal(GmOnchainBodySchema.safeParse({ txHash: TX, chainKey: null }).success, false);
  assert.equal(CustomTokenAddBodySchema.parse({ contract: EVM }).chainType, "EVM");
  assert.equal(SupportTicketCreateBodySchema.parse({ title: "t", description: "d" }).type, "bug");
  assert.equal(MetricsHistoryQuerySchema.parse({}).range, "24h");
  assert.equal(MetricsHistoryQuerySchema.safeParse({ range: "1y" }).success, false);
});

test("coercion and transforms keep their output", () => {
  assert.deepEqual(NonceQuerySchema.parse({ address: EVM, chainId: "8453" }), { address: EVM, chainId: 8453 });
  assert.equal(NonceQuerySchema.safeParse({ address: EVM, chainId: "1.5" }).success, false);
  assert.equal(NonceQuerySchema.safeParse({ address: EVM, chainId: "" }).success, false);
  assert.equal(AdminEventsQuerySchema.parse({ limit: "500" }).limit, 500);
  assert.equal(AdminEventsQuerySchema.safeParse({ limit: "501" }).success, false);
  assert.equal(ScansQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(ChainKey.parse("Base_Main-1"), "base_main-1");
  assert.equal(LinkedWalletPatchBodySchema.parse({ label: null }).label, null);
});

test("strict bodies refuse unknown keys and array bounds hold", () => {
  assert.equal(ScanRequestBodySchema.safeParse({ extra: 1 }).success, false);
  assert.equal(CexAccountBodySchema.safeParse({ provider: "binance", extra: 1 }).success, false);
  assert.equal(ScanRequestBodySchema.safeParse({ customTokens: Array(100).fill(1) }).success, true);
  assert.equal(ScanRequestBodySchema.safeParse({ customTokens: Array(101).fill(1) }).success, false);
  assert.equal(BatchScanRequestBodySchema.safeParse({ addresses: [] }).success, false);
  assert.equal(BatchScanRequestBodySchema.safeParse({ addresses: Array(20).fill(EVM) }).success, true);
  assert.equal(BatchScanRequestBodySchema.safeParse({ addresses: Array(21).fill(EVM) }).success, false);
  assert.equal(FunnelEventsBodySchema.safeParse({ events: Array(5).fill(funnelEvent) }).success, true);
  assert.equal(FunnelEventsBodySchema.safeParse({ events: Array(6).fill(funnelEvent) }).success, false);
});

test("an over-limit array yields a bounded issue list (GHSA-mrhx-c7xc-m3w5)", () => {
  // Zod 3 walked every element past .max() and recorded one issue each.
  const hostile = Array.from({ length: 10_000 }, (_, index) => index);
  for (const [schema, body] of [
    [BatchScanRequestBodySchema, { addresses: hostile }],
    [ScanRequestBodySchema, { customTokens: hostile }],
    [FunnelEventsBodySchema, { events: hostile }],
  ] as const) {
    const result = schema.safeParse(body);
    assert.equal(result.success, false);
    assert.ok(result.error.issues.length <= 2, `issues: ${result.error.issues.length}`);
  }
});

test("custom messages and first-issue paths callers depend on are preserved", () => {
  assert.equal(EvmAddress.safeParse("0x12").error?.issues[0]?.message, "Invalid EVM address");
  assert.equal(TxHash.safeParse("0xzz").error?.issues[0]?.message, "Invalid tx hash");
  assert.equal(ChainKey.safeParse("ba$e").error?.issues[0]?.message, "Invalid chain key");
  // gm/contracts/deploy maps issues[].path[0] to its error code.
  assert.deepEqual(GmDeployBodySchema.safeParse({ contractAddress: EVM, txHash: TX }).error?.issues[0]?.path, ["chainKey"]);
  assert.deepEqual(GmDeployBodySchema.safeParse({ chainKey: "base", txHash: TX }).error?.issues[0]?.path, ["contractAddress"]);
  assert.deepEqual(GmDeployBodySchema.safeParse({ chainKey: "base", contractAddress: EVM }).error?.issues[0]?.path, ["txHash"]);
});

test("expiresAt keeps the Zod 3 datetime-with-offset contract", () => {
  for (const value of ["2026-12-01T10:00:00Z", "2026-12-01T10:00Z", "2026-12-01T10:00:00.123+02:00", "2026-12-01T10:00:00+0200", "2024-02-29T00:00:00-05:30"]) {
    assert.equal(ScanShareBodySchema.safeParse({ expiresAt: value }).success, true, value);
  }
  for (const value of ["2026-12-01", "2026-12-01T10:00:00", "2026-12-01T10:00:00+02", "2023-02-29T00:00:00Z", "2026-12-01T24:00:00Z"]) {
    const result = ScanShareBodySchema.safeParse({ expiresAt: value });
    assert.equal(result.success, false, value);
    assert.equal(result.error?.issues[0]?.message, "Invalid datetime");
  }
  assert.equal(ScanShareBodySchema.safeParse({}).success, true);
});

test("wallet address contract across VMs", () => {
  assert.equal(AnyAddress.parse(EVM), EVM.toLowerCase());
  for (const value of ["9gjm5Hw5E6hLisCrCiewCnQv9mT1L4DcM9w2AReX6pe5", "cosmos1r5v5srda7xfth3hn2s26txvrc77nt6kj45g3u8", "EQD4FPq-PRDieyQKkizFTRtSDyucUIqrj0v_zXJmqaDp6_0t"]) {
    assert.equal(AnyAddress.parse(value), value);
  }
  for (const value of ["", "0xgggggggggggggggggggggggggggggggggggggggg", "9gjm5Hw5E6hLisCrCiewCnQv9mT1L4D", 42, null]) {
    assert.equal(AnyAddress.safeParse(value).success, false, String(value));
  }
});
