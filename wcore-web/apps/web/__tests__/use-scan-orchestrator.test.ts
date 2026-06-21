import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildScanOrchestratorJobs } from "../hooks/useScanOrchestrator";

const EVM = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

describe("useScanOrchestrator planning", () => {
  test("filters chains by wallet VM and batches compatible chains", () => {
    const jobs = buildScanOrchestratorJobs({
      enabledAddresses: [EVM],
      chains: ["BASE", "SOLANA", "ETHEREUM", "COSMOS_HUB"],
      chainMetaMap: {
        BASE: { vm: "EVM" },
        SOLANA: { vm: "SVM" },
        ETHEREUM: { vm: "EVM" },
        COSMOS_HUB: { vm: "COSMOS" },
      },
      batchSize: 5,
    });

    assert.deepEqual(jobs.map((job) => ({ vm: job.vm, chains: job.chains })), [
      { vm: "EVM", chains: ["BASE", "ETHEREUM"] },
    ]);
    assert.deepEqual(jobs[0]?.tasks.map((task) => task.addr.toLowerCase()), [EVM]);
  });

  test("keeps disabled chains out of scan jobs", () => {
    const jobs = buildScanOrchestratorJobs({
      enabledAddresses: [EVM],
      chains: ["BASE", "KATANA"],
      chainMetaMap: {
        BASE: { vm: "EVM", disabled: true },
        KATANA: { vm: "EVM" },
      },
      batchSize: 5,
    });

    assert.deepEqual(jobs.map((job) => job.chains), [["KATANA"]]);
  });
});
