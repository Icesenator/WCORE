import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@wcore/db";
import {
  CLAIM_SCAN_JOB_SQL,
  HEARTBEAT_SCAN_JOB_SQL,
  RELEASE_SCAN_JOB_SQL,
  PostgresScanJobQueue,
  type ScanJobProgress,
  type ScanJobRequest,
} from "./scan-job.js";

const databaseUrl = process.env.DATABASE_URL;

const request: ScanJobRequest = {
  activeChains: ["ETHEREUM"],
  forceRefresh: false,
  strictTokens: false,
  logBlockRange: 5_000,
  customTokens: [],
  fxRate: 0.9,
};

const progress: ScanJobProgress = {
  chains: [{ chainKey: "ETHEREUM", chainName: "Ethereum", status: "pending" }],
  totalEur: 0,
  tokenCount: 0,
  errors: [],
};

async function waitForDone(queue: PostgresScanJobQueue, jobId: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await queue.getOwned(jobId, undefined, "127.0.0.1");
    if (result?.status === "done") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`job ${jobId} did not finish before the test deadline`);
}

test("PostgreSQL queue executes claim, progress, fencing, and release SQL", { skip: !databaseUrl }, async () => {
  const prisma = new PrismaClient();
  const queue = new PostgresScanJobQueue(prisma);
  const prefix = `queue-it-${randomUUID()}`;

  try {
    const jobId = `${prefix}-worker`;
    const admission = await queue.enqueue({
      jobId,
      principal: `ip:${prefix}`,
      ip: "127.0.0.1",
      address: "0x1111111111111111111111111111111111111111",
      request,
      progress,
    });
    assert.deepEqual(admission, { ok: true, jobId });

    queue.start(async ({ job, publish }) => {
      const completed = structuredClone(job.progress);
      completed.chains[0]!.status = "done";
      assert.equal(await publish(completed), true);
      return { status: "done", progress: completed };
    });
    await waitForDone(queue, jobId);
    await queue.stop();

    const leaseJobId = `${prefix}-lease`;
    await prisma.scanJob.create({ data: {
      id: leaseJobId,
      ownerPrincipal: `ip:${prefix}`,
      ip: "127.0.0.1",
      address: "0x2222222222222222222222222222222222222222",
      request: request as never,
      progress: progress as never,
      expiresAt: new Date(Date.now() + 60_000),
    } });
    const leaseToken = `${prefix}:lease`;
    const claimed = await prisma.$queryRawUnsafe<Array<{ id: string }>>(CLAIM_SCAN_JOB_SQL, leaseToken, 45_000);
    assert.equal(claimed[0]?.id, leaseJobId);
    const heartbeat = await prisma.$queryRawUnsafe<Array<{ id: string }>>(HEARTBEAT_SCAN_JOB_SQL, leaseJobId, leaseToken, 45_000);
    assert.equal(heartbeat[0]?.id, leaseJobId);
    const released = await prisma.$queryRawUnsafe<Array<{ id: string }>>(RELEASE_SCAN_JOB_SQL, leaseJobId, leaseToken);
    assert.equal(released[0]?.id, leaseJobId);
    assert.equal((await prisma.scanJob.findUniqueOrThrow({ where: { id: leaseJobId } })).status, "queued");
  } finally {
    await queue.stop();
    await prisma.scanJob.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.$disconnect();
  }
});
