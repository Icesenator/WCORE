import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIM_SCAN_JOB_SQL,
  HEARTBEAT_SCAN_JOB_SQL,
  PUBLISH_SCAN_JOB_PROGRESS_SQL,
  RELEASE_SCAN_JOB_SQL,
  PostgresScanJobQueue,
  createLeaseToken,
  fencedLeaseWhere,
  jobPrincipal,
  ownsScanJob,
  progressTimeoutReason,
  serializePollResult,
  type ScanJobProgress,
} from "./scan-job.js";

const progress: ScanJobProgress = {
  chains: [
    { chainKey: "A", chainName: "A", status: "done", result: { chainKey: "A", totals: { valueEur: 1.235, tokenCount: 2, pricedCount: 2 } } as never },
    { chainKey: "B", chainName: "B", status: "error" },
    { chainKey: "C", chainName: "C", status: "pending" },
  ],
  totalEur: 1.235,
  tokenCount: 2,
  errors: Array.from({ length: 25 }, (_, index) => `error-${index}`),
};

test("jobPrincipal prefers the signed-in user over the source IP", () => {
  assert.equal(jobPrincipal({ userId: "u1", ip: "1.2.3.4" }), "user:u1");
  assert.equal(jobPrincipal({ ip: "1.2.3.4" }), "ip:1.2.3.4");
  assert.equal(jobPrincipal({}), "ip:unknown");
});

test("ownership keeps wrong users and IPs indistinguishable", () => {
  assert.equal(ownsScanJob({ userId: "owner", ip: "1.2.3.4" }, "owner", "9.9.9.9"), true);
  assert.equal(ownsScanJob({ userId: "owner", ip: "1.2.3.4" }, "intruder", "1.2.3.4"), false);
  assert.equal(ownsScanJob({ userId: null, ip: "1.2.3.4" }, undefined, "1.2.3.4"), true);
  assert.equal(ownsScanJob({ userId: null, ip: "1.2.3.4" }, undefined, "9.9.9.9"), false);
});

test("poll serialization preserves the API shape and hides queued status", () => {
  const result = serializePollResult("job-1", "0xabc", "queued", progress);
  assert.deepEqual(result.progress, { done: 2, total: 3 });
  assert.equal(result.status, "running");
  assert.equal(result.totalEur, 1.24);
  assert.equal(result.chains.length, 1);
  assert.equal(result.errors.length, 20);
});

test("each claim gets a unique lease token under the process prefix", () => {
  const first = createLeaseToken("process-a");
  const second = createLeaseToken("process-a");
  assert.match(first, /^process-a:/);
  assert.match(second, /^process-a:/);
  assert.notEqual(first, second);
});

test("lease fencing distinguishes stale and reclaimed attempts in one process", () => {
  const stale = fencedLeaseWhere("job-1", "process-a:attempt-1");
  const current = fencedLeaseWhere("job-1", "process-a:attempt-2");
  assert.deepEqual(stale, {
    id: "job-1",
    status: "running",
    leaseOwner: "process-a:attempt-1",
  });
  assert.notDeepEqual(stale, current);
});

test("claim SQL atomically locks and reclaims only eligible jobs", () => {
  assert.match(CLAIM_SCAN_JOB_SQL, /FOR UPDATE SKIP LOCKED/);
  assert.match(CLAIM_SCAN_JOB_SQL, /"status" = 'queued'.*"availableAt" <= NOW\(\)/s);
  assert.match(CLAIM_SCAN_JOB_SQL, /"status" = 'running'.*"leaseExpiresAt" < NOW\(\)/s);
  assert.match(CLAIM_SCAN_JOB_SQL, /"leaseOwner" = \$1/);
  assert.match(CLAIM_SCAN_JOB_SQL, /"attempts" = job\."attempts" \+ 1/);
  assert.match(CLAIM_SCAN_JOB_SQL, /UPDATE "scan_jobs"/);
});

test("heartbeat uses the database clock and exact lease token fencing", () => {
  assert.match(HEARTBEAT_SCAN_JOB_SQL, /"heartbeatAt" = NOW\(\)/);
  assert.match(HEARTBEAT_SCAN_JOB_SQL, /"leaseExpiresAt" = NOW\(\) \+ \(\$3 \* INTERVAL '1 millisecond'\)/);
  assert.match(HEARTBEAT_SCAN_JOB_SQL, /"id" = \$1/);
  assert.match(HEARTBEAT_SCAN_JOB_SQL, /"status" = 'running'/);
  assert.match(HEARTBEAT_SCAN_JOB_SQL, /"leaseOwner" = \$2/);
  assert.doesNotMatch(HEARTBEAT_SCAN_JOB_SQL, /Date\.now/);
});

test("progress publication and stop release are fenced and database-clock based", () => {
  assert.match(PUBLISH_SCAN_JOB_PROGRESS_SQL, /"progressAt" = NOW\(\)/);
  assert.match(PUBLISH_SCAN_JOB_PROGRESS_SQL, /"leaseOwner" = \$2/);
  assert.match(RELEASE_SCAN_JOB_SQL, /"status" = 'queued'/);
  assert.match(RELEASE_SCAN_JOB_SQL, /"availableAt" = NOW\(\)/);
  assert.match(RELEASE_SCAN_JOB_SQL, /"status" = 'running'/);
  assert.match(RELEASE_SCAN_JOB_SQL, /"leaseOwner" = \$2/);
});

test("progress timeout guards distinguish no-progress, stuck, settled, and hard TTL jobs", () => {
  const now = new Date("2026-08-06T12:20:00.000Z");
  const old = new Date("2026-08-06T12:00:00.000Z");
  const future = new Date("2026-08-06T13:00:00.000Z");
  const expired = new Date("2026-08-06T12:19:59.000Z");
  const withStatuses = (statuses: Array<"pending" | "scanning" | "done" | "error">): ScanJobProgress => ({
    chains: statuses.map((status, index) => ({ chainKey: String(index), chainName: String(index), status })),
    totalEur: 0,
    tokenCount: 0,
    errors: [],
  });

  assert.match(progressTimeoutReason({ status: "queued", progress: withStatuses(["pending"]), progressAt: old, expiresAt: future }, now, 600_000, 90_000) ?? "", /no chain progress/);
  assert.match(progressTimeoutReason({ status: "running", progress: withStatuses(["scanning", "pending"]), progressAt: old, expiresAt: future }, now, 600_000, 90_000) ?? "", /chains stuck in scanning/);
  assert.equal(progressTimeoutReason({ status: "running", progress: withStatuses(["done", "scanning"]), progressAt: old, expiresAt: future }, now, 600_000, 90_000), null);
  assert.equal(progressTimeoutReason({ status: "done", progress: withStatuses(["pending"]), progressAt: old, expiresAt: expired }, now, 600_000, 90_000), null);
  assert.match(progressTimeoutReason({ status: "running", progress: withStatuses(["done"]), progressAt: now, expiresAt: expired }, now, 600_000, 90_000) ?? "", /max running time/);
});

test("stop aborts, releases the exact claimed token, drains, and permits restart", async () => {
  let claimCount = 0;
  let claimedToken = "";
  let handlerStopped = false;
  const releases: Array<{ jobId: string; leaseToken: string }> = [];
  const prisma = {
    $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
      if (sql === CLAIM_SCAN_JOB_SQL) {
        claimCount++;
        if (claimCount > 1) return [];
        claimedToken = String(params[0]);
        return [{
          id: "job-stop",
          address: "0xabc",
          userId: null,
          ip: "127.0.0.1",
          request: { activeChains: ["A"], forceRefresh: false, strictTokens: false, logBlockRange: 5_000, customTokens: [], fxRate: 0.9 },
          progress,
          attempts: 1,
          leaseOwner: claimedToken,
        }];
      }
      if (sql === RELEASE_SCAN_JOB_SQL) {
        assert.equal(handlerStopped, true, "the handler must stop before its lease is released");
        releases.push({ jobId: String(params[0]), leaseToken: String(params[1]) });
        return [{ id: params[0] }];
      }
      return [];
    },
    scanJob: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
    },
  };

  const queue = new PostgresScanJobQueue(prisma as never);
  let handlerStartedResolve!: () => void;
  const handlerStarted = new Promise<void>((resolve) => { handlerStartedResolve = resolve; });
  queue.start(async ({ signal, job }) => {
    assert.equal(job.leaseToken, claimedToken);
    handlerStartedResolve();
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    handlerStopped = true;
    return { status: "error", progress: job.progress };
  });

  await handlerStarted;
  await queue.stop();
  assert.equal(releases.length, 1);
  assert.deepEqual(releases[0], { jobId: "job-stop", leaseToken: claimedToken });

  queue.start(async ({ job }) => ({ status: "error", progress: job.progress }));
  await queue.stop();
});

test("stop drains an in-flight cleanup before resolving", async () => {
  let cleanupStartedResolve!: () => void;
  let releaseCleanup!: () => void;
  const cleanupStarted = new Promise<void>((resolve) => { cleanupStartedResolve = resolve; });
  const cleanupBlocked = new Promise<void>((resolve) => { releaseCleanup = resolve; });
  const prisma = {
    $queryRawUnsafe: async () => [],
    scanJob: {
      deleteMany: async () => {
        cleanupStartedResolve();
        await cleanupBlocked;
        return { count: 0 };
      },
      findMany: async () => [],
    },
  };

  const queue = new PostgresScanJobQueue(prisma as never);
  queue.start(async ({ job }) => ({ status: "error", progress: job.progress }));
  await cleanupStarted;

  let stopped = false;
  const stopping = queue.stop().then(() => { stopped = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stopped, false);

  releaseCleanup();
  await stopping;
  assert.equal(stopped, true);
});
