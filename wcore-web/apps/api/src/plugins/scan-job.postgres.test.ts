import { randomUUID } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@wcore/db";
import {
  CLAIM_SCAN_JOB_SQL,
  HEARTBEAT_SCAN_JOB_SQL,
  PUBLISH_SCAN_JOB_PROGRESS_SQL,
  RELEASE_SCAN_JOB_SQL,
  PostgresScanJobQueue,
  fencedLeaseWhere,
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
  const locker = new PrismaClient();
  const queue = new PostgresScanJobQueue(prisma);
  const prefix = `queue-it-${randomUUID()}`;
  let unlockHeldLock: (() => void) | undefined;
  let heldLock: Promise<unknown> | undefined;

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

    const staleToken = `${prefix}:stale`;
    const currentToken = `${prefix}:current`;
    assert.equal((await prisma.$queryRawUnsafe<Array<{ id: string }>>(CLAIM_SCAN_JOB_SQL, staleToken, 45_000))[0]?.id, leaseJobId);
    await prisma.scanJob.update({ where: { id: leaseJobId }, data: { leaseExpiresAt: new Date(Date.now() - 1_000) } });
    assert.equal((await prisma.$queryRawUnsafe<Array<{ id: string }>>(CLAIM_SCAN_JOB_SQL, currentToken, 45_000))[0]?.id, leaseJobId);
    assert.deepEqual(await prisma.$queryRawUnsafe(HEARTBEAT_SCAN_JOB_SQL, leaseJobId, staleToken, 45_000), []);
    assert.deepEqual(await prisma.$queryRawUnsafe(PUBLISH_SCAN_JOB_PROGRESS_SQL, leaseJobId, staleToken, JSON.stringify(progress)), []);
    assert.deepEqual(await prisma.$queryRawUnsafe(RELEASE_SCAN_JOB_SQL, leaseJobId, staleToken), []);
    assert.equal((await prisma.scanJob.updateMany({ where: fencedLeaseWhere(leaseJobId, staleToken), data: { status: "done" } })).count, 0);
    const fencedRow = await prisma.scanJob.findUniqueOrThrow({ where: { id: leaseJobId } });
    assert.equal(fencedRow.status, "running");
    assert.equal(fencedRow.leaseOwner, currentToken);
    await prisma.$queryRawUnsafe(RELEASE_SCAN_JOB_SQL, leaseJobId, currentToken);
    await prisma.scanJob.delete({ where: { id: leaseJobId } });

    const firstId = `${prefix}-locked-first`;
    const secondId = `${prefix}-claim-second`;
    const availableAt = new Date(Date.now() - 5_000);
    await prisma.scanJob.createMany({ data: [
      { id: firstId, ownerPrincipal: `ip:${prefix}`, ip: "127.0.0.1", address: "0x3333333333333333333333333333333333333333", request: request as never, progress: progress as never, availableAt, createdAt: new Date(0), expiresAt: new Date(Date.now() + 60_000) },
      { id: secondId, ownerPrincipal: `ip:${prefix}`, ip: "127.0.0.1", address: "0x4444444444444444444444444444444444444444", request: request as never, progress: progress as never, availableAt, createdAt: new Date(1), expiresAt: new Date(Date.now() + 60_000) },
    ] });
    let lockedResolve!: () => void;
    const locked = new Promise<void>((resolve) => { lockedResolve = resolve; });
    const unlock = new Promise<void>((resolve) => { unlockHeldLock = resolve; });
    heldLock = locker.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "scan_jobs" WHERE "id" = $1 FOR UPDATE', firstId);
      lockedResolve();
      await unlock;
    });
    await locked;
    const skipLockedToken = `${prefix}:skip-locked`;
    const skipLockedClaim = await prisma.$queryRawUnsafe<Array<{ id: string }>>(CLAIM_SCAN_JOB_SQL, skipLockedToken, 45_000);
    assert.equal(skipLockedClaim[0]?.id, secondId);
    unlockHeldLock?.();
    await heldLock;
    await prisma.$queryRawUnsafe(RELEASE_SCAN_JOB_SQL, secondId, skipLockedToken);
  } finally {
    unlockHeldLock?.();
    await heldLock?.catch(() => {});
    await queue.stop();
    await prisma.scanJob.deleteMany({ where: { id: { startsWith: prefix } } });
    await locker.$disconnect();
    await prisma.$disconnect();
  }
});
