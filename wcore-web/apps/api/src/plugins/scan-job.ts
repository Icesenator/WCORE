import { randomUUID } from "node:crypto";
import type { PrismaClient, ScanJob as DbScanJob } from "@wcore/db";
import type { ChainScan } from "@wcore/shared";
import { apiConfig } from "../config.js";

const LEASE_MS = 45_000;
const HEARTBEAT_MS = 15_000;
const POLL_MS = 500;
const CLEANUP_MS = 60_000;
const WORKER_CONCURRENCY = 10;
const STOP_DRAIN_MS = 5_000;
const ADMISSION_LOCK_KEY = 8_204_061;
const PROCESS_WORKER_PREFIX = `${process.pid}:${randomUUID()}`;

export type ScanJobStatus = "queued" | "running" | "done" | "error";
export type ScanChainProgress = {
  chainKey: string;
  chainName: string;
  status: "pending" | "scanning" | "done" | "error";
  result?: ChainScan;
  cleanValueEur?: number;
};

export interface ScanJobProgress {
  chains: ScanChainProgress[];
  totalEur: number;
  tokenCount: number;
  errors: string[];
}

export interface ScanJobRequest {
  activeChains: string[];
  forceRefresh: boolean;
  strictTokens: boolean;
  logBlockRange: number;
  customTokens: string[];
  fxRate: number;
}

export interface ScanJobPollResult {
  jobId: string;
  status: "running" | "done" | "error";
  address: string;
  progress: { done: number; total: number };
  chains: ChainScan[];
  totalEur: number;
  tokenCount: number;
  errors: string[];
}

export interface ClaimedScanJob {
  id: string;
  address: string;
  userId: string | null;
  ip: string | null;
  request: ScanJobRequest;
  progress: ScanJobProgress;
  attempts: number;
  leaseToken: string;
}

export type JobAdmission = { ok: true; jobId: string } | { ok: false; reason: "global" | "principal"; limit: number };

export interface EnqueueScanJobInput {
  jobId: string;
  principal: string;
  userId?: string;
  ip?: string;
  address: string;
  request: ScanJobRequest;
  progress: ScanJobProgress;
}

export interface ScanJobQueue {
  enqueue(input: EnqueueScanJobInput): Promise<JobAdmission>;
  getOwned(jobId: string, userId: string | undefined, ip: string): Promise<ScanJobPollResult | null>;
  start(handler: ScanJobHandler): void;
  stop(): Promise<void>;
}

export interface ScanJobContext {
  job: ClaimedScanJob;
  signal: AbortSignal;
  publish(progress: ScanJobProgress): Promise<boolean>;
}

export type ScanJobHandler = (context: ScanJobContext) => Promise<{ status: "done" | "error"; progress: ScanJobProgress }>;

/** A job belongs to its user when signed in, otherwise to its source IP. */
export function jobPrincipal(job: { userId?: string | null; ip?: string | null }): string {
  return job.userId ? `user:${job.userId}` : `ip:${job.ip ?? "unknown"}`;
}

export function ownsScanJob(
  job: { userId?: string | null; ip?: string | null },
  userId: string | undefined,
  ip: string,
): boolean {
  return job.userId ? job.userId === userId : job.ip === ip;
}

export function createLeaseToken(processPrefix = PROCESS_WORKER_PREFIX): string {
  return `${processPrefix}:${randomUUID()}`;
}

export function fencedLeaseWhere(jobId: string, leaseToken: string) {
  return { id: jobId, status: "running", leaseOwner: leaseToken } as const;
}

export interface ProgressTimeoutCandidate {
  status: string;
  progress: ScanJobProgress;
  progressAt: Date;
  expiresAt: Date;
}

export function progressTimeoutReason(
  job: ProgressTimeoutCandidate,
  now: Date,
  noProgressMs: number,
  chainTimeoutMs: number,
): string | null {
  if (job.status !== "queued" && job.status !== "running") return null;
  if (job.expiresAt.getTime() <= now.getTime()) return "job_timeout: exceeded max running time";

  const statuses = job.progress.chains.map((chain) => chain.status);
  const idleMs = now.getTime() - job.progressAt.getTime();
  if (statuses.length > 0 && statuses.every((status) => status === "pending") && idleMs > noProgressMs) {
    return `job_timeout: no chain progress after ${Math.round(noProgressMs / 60_000)}min`;
  }
  if (
    statuses.some((status) => status === "scanning")
    && statuses.every((status) => status === "pending" || status === "scanning")
    && idleMs > chainTimeoutMs * 2
  ) {
    return `job_timeout: chains stuck in scanning after ${Math.round((chainTimeoutMs * 2) / 1000)}s`;
  }
  return null;
}

export function serializePollResult(
  jobId: string,
  address: string,
  status: ScanJobStatus,
  progress: ScanJobProgress,
): ScanJobPollResult {
  const done = progress.chains.filter((chain) => chain.status === "done" || chain.status === "error").length;
  return {
    jobId,
    status: status === "queued" ? "running" : status,
    address,
    progress: { done, total: progress.chains.length },
    chains: progress.chains.flatMap((chain) => chain.result ? [chain.result] : []),
    totalEur: Math.round(progress.totalEur * 100) / 100,
    tokenCount: progress.tokenCount,
    errors: progress.errors.slice(0, 20),
  };
}

export const CLAIM_SCAN_JOB_SQL = `
WITH candidate AS (
  SELECT "id"
  FROM "scan_jobs"
  WHERE "expiresAt" > NOW()
    AND (
      ("status" = 'queued' AND "availableAt" <= NOW())
      OR ("status" = 'running' AND "leaseExpiresAt" < NOW())
    )
  ORDER BY "availableAt" ASC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE "scan_jobs" AS job
SET "status" = 'running',
    "attempts" = job."attempts" + 1,
    "leaseOwner" = $1,
    "leaseExpiresAt" = NOW() + ($2 * INTERVAL '1 millisecond'),
    "heartbeatAt" = NOW(),
    "progressAt" = NOW(),
    "startedAt" = COALESCE(job."startedAt", NOW())
FROM candidate
WHERE job."id" = candidate."id"
RETURNING job.*`;

export const HEARTBEAT_SCAN_JOB_SQL = `
UPDATE "scan_jobs"
SET "heartbeatAt" = NOW(),
    "leaseExpiresAt" = NOW() + ($3 * INTERVAL '1 millisecond')
WHERE "id" = $1
  AND "status" = 'running'
  AND "leaseOwner" = $2
RETURNING "id"`;

export const PUBLISH_SCAN_JOB_PROGRESS_SQL = `
UPDATE "scan_jobs"
SET "progress" = $3::jsonb,
    "progressAt" = NOW()
WHERE "id" = $1
  AND "status" = 'running'
  AND "leaseOwner" = $2
RETURNING "id"`;

export const RELEASE_SCAN_JOB_SQL = `
UPDATE "scan_jobs"
SET "status" = 'queued',
    "availableAt" = NOW(),
    "leaseOwner" = NULL,
    "leaseExpiresAt" = NULL,
    "heartbeatAt" = NULL
WHERE "id" = $1
  AND "status" = 'running'
  AND "leaseOwner" = $2
RETURNING "id"`;

function asProgress(value: unknown): ScanJobProgress {
  return value as ScanJobProgress;
}

function asRequest(value: unknown): ScanJobRequest {
  return value as ScanJobRequest;
}

async function waitUntilDeadline(promises: Promise<unknown>[], deadline: number): Promise<boolean> {
  if (promises.length === 0) return true;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return false;

  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), remainingMs);
    timer.unref();
  });
  const settled = Promise.allSettled(promises).then(() => true as const);
  const completed = await Promise.race([settled, timedOut]);
  if (timer) clearTimeout(timer);
  return completed;
}

export class PostgresScanJobQueue implements ScanJobQueue {
  readonly processPrefix = PROCESS_WORKER_PREFIX;
  private started = false;
  private stopped = false;
  private stopPromise?: Promise<void>;
  private pollTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private pollRun?: Promise<void>;
  private active = 0;
  private polling = false;
  private readonly attempts = new Map<string, { jobId: string; controller: AbortController }>();
  private readonly runs = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(input: EnqueueScanJobInput): Promise<JobAdmission> {
    const maxJobs = apiConfig.scan.maxAsyncJobs;
    const maxPrincipal = apiConfig.scan.maxAsyncJobsPerPrincipal;
    const now = new Date();
    const hardExpiry = new Date(now.getTime() + apiConfig.scan.jobTtlRunningMs);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
        "SELECT true AS locked FROM pg_advisory_xact_lock($1)",
        ADMISSION_LOCK_KEY,
      );
      await tx.scanJob.deleteMany({ where: { status: { in: ["done", "error"] }, expiresAt: { lte: now } } });

      const total = await tx.scanJob.count();
      const rowsToDelete = Math.max(0, total - maxJobs + 1);
      if (rowsToDelete > 0) {
        await tx.$executeRawUnsafe(`
          DELETE FROM "scan_jobs"
          WHERE "id" IN (
            SELECT "id" FROM "scan_jobs"
            WHERE "status" IN ('done', 'error')
            ORDER BY "createdAt" ASC
            LIMIT $1
          )`, rowsToDelete);
      }

      const activeCount = await tx.scanJob.count({ where: { status: { in: ["queued", "running"] } } });
      if (activeCount >= maxJobs) return { ok: false, reason: "global", limit: maxJobs } as const;
      const principalCount = await tx.scanJob.count({ where: { ownerPrincipal: input.principal, status: { in: ["queued", "running"] } } });
      if (principalCount >= maxPrincipal) return { ok: false, reason: "principal", limit: maxPrincipal } as const;

      await tx.scanJob.create({ data: {
        id: input.jobId,
        ownerPrincipal: input.principal,
        userId: input.userId,
        ip: input.ip,
        address: input.address,
        request: input.request as never,
        progress: input.progress as never,
        expiresAt: hardExpiry,
      } });
      return { ok: true, jobId: input.jobId } as const;
    });
  }

  async getOwned(jobId: string, userId: string | undefined, ip: string): Promise<ScanJobPollResult | null> {
    const row = await this.prisma.scanJob.findUnique({ where: { id: jobId } });
    if (!row || !ownsScanJob(row, userId, ip)) return null;
    if (row.result && (row.status === "done" || row.status === "error")) return row.result as unknown as ScanJobPollResult;
    return serializePollResult(row.id, row.address, row.status as ScanJobStatus, asProgress(row.progress));
  }

  start(handler: ScanJobHandler): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.stopPromise = undefined;

    const poll = async () => {
      if (this.stopped || this.polling) return;
      this.polling = true;
      try {
        while (!this.stopped && this.active < WORKER_CONCURRENCY) {
          const job = await this.claim().catch((error) => {
            console.error("[scan-job] claim failed:", error instanceof Error ? error.message : String(error));
            return null;
          });
          if (!job) break;
          if (this.stopped) {
            await this.releaseLease(job.id, job.leaseToken);
            break;
          }
          this.active++;
          const run = this.runClaimed(job, handler);
          this.runs.set(job.leaseToken, run);
          const finished = () => {
            this.active--;
            this.runs.delete(job.leaseToken);
          };
          void run.then(finished, finished);
        }
      } finally {
        this.polling = false;
      }
    };

    const runPoll = () => {
      const current = poll();
      this.pollRun = current;
      void current.finally(() => {
        if (this.pollRun === current) this.pollRun = undefined;
      });
    };
    void this.cleanup();
    runPoll();
    this.pollTimer = setInterval(runPoll, POLL_MS);
    this.cleanupTimer = setInterval(() => { void this.cleanup(); }, CLEANUP_MS);
    this.pollTimer.unref();
    this.cleanupTimer.unref();
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = (async () => {
      this.stopped = true;
      if (this.pollTimer) clearInterval(this.pollTimer);
      if (this.cleanupTimer) clearInterval(this.cleanupTimer);
      this.pollTimer = undefined;
      this.cleanupTimer = undefined;

      const deadline = Date.now() + STOP_DRAIN_MS;
      const activeAttempts = [...this.attempts.entries()];
      for (const [, attempt] of activeAttempts) attempt.controller.abort();
      const draining = [
        ...(this.pollRun ? [this.pollRun] : []),
        ...activeAttempts.flatMap(([leaseToken]) => {
          const run = this.runs.get(leaseToken);
          return run ? [run] : [];
        }),
      ];
      await waitUntilDeadline(draining, deadline);

      // Only release attempts whose handlers have stopped. A non-cooperative
      // handler keeps its lease until expiry instead of overlapping a retry.
      const releases = activeAttempts.flatMap(([leaseToken, attempt]) => (
        this.attempts.has(leaseToken) ? [] : [this.releaseLease(attempt.jobId, leaseToken)]
      ));
      await waitUntilDeadline(releases, deadline);
      this.started = false;
    })();
    return this.stopPromise;
  }

  private async claim(): Promise<ClaimedScanJob | null> {
    const leaseToken = createLeaseToken(this.processPrefix);
    const rows = await this.prisma.$queryRawUnsafe<DbScanJob[]>(CLAIM_SCAN_JOB_SQL, leaseToken, LEASE_MS);
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, address: row.address, userId: row.userId, ip: row.ip, request: asRequest(row.request), progress: asProgress(row.progress), attempts: row.attempts, leaseToken };
  }

  private async runClaimed(job: ClaimedScanJob, handler: ScanJobHandler): Promise<void> {
    const controller = new AbortController();
    this.attempts.set(job.leaseToken, { jobId: job.id, controller });
    let heartbeatBusy = false;
    const heartbeat = setInterval(async () => {
      if (heartbeatBusy || controller.signal.aborted) return;
      heartbeatBusy = true;
      try {
        const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          HEARTBEAT_SCAN_JOB_SQL,
          job.id,
          job.leaseToken,
          LEASE_MS,
        );
        if (rows.length !== 1) controller.abort();
      } catch (error) {
        console.error(`[scan-job] heartbeat failed for ${job.id}:`, error instanceof Error ? error.message : String(error));
        controller.abort();
      } finally {
        heartbeatBusy = false;
      }
    }, HEARTBEAT_MS);
    heartbeat.unref();

    try {
      const outcome = await handler({
        job,
        signal: controller.signal,
        publish: async (progress) => {
          if (controller.signal.aborted) return false;
          const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
            PUBLISH_SCAN_JOB_PROGRESS_SQL,
            job.id,
            job.leaseToken,
            JSON.stringify(progress),
          );
          if (rows.length !== 1) controller.abort();
          return rows.length === 1;
        },
      });
      if (controller.signal.aborted) return;
      const pollResult = serializePollResult(job.id, job.address, outcome.status, outcome.progress);
      const updated = await this.prisma.scanJob.updateMany({
        where: fencedLeaseWhere(job.id, job.leaseToken),
        data: {
          status: outcome.status,
          progress: outcome.progress as never,
          result: pollResult as never,
          finishedAt: new Date(),
          expiresAt: new Date(Date.now() + apiConfig.scan.jobTtlDoneMs),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count !== 1) controller.abort();
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(`[scan-job] worker failed for ${job.id}:`, error instanceof Error ? error.message : String(error));
        // Leave the durable row running. Its lease will expire and another
        // worker can retry from the last successfully fenced progress snapshot.
        controller.abort();
      }
    } finally {
      clearInterval(heartbeat);
      controller.abort();
      this.attempts.delete(job.leaseToken);
    }
  }

  private async releaseLease(jobId: string, leaseToken: string): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ id: string }>>(RELEASE_SCAN_JOB_SQL, jobId, leaseToken);
      return rows.length === 1;
    } catch (error) {
      console.error(`[scan-job] release failed for ${jobId}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const now = new Date();
      await this.prisma.scanJob.deleteMany({ where: { status: { in: ["done", "error"] }, expiresAt: { lte: now } } });
      const activeRows = await this.prisma.scanJob.findMany({ where: { status: { in: ["queued", "running"] } } });
      for (const row of activeRows) {
        const progress = asProgress(row.progress);
        const reason = progressTimeoutReason(
          { status: row.status, progress, progressAt: row.progressAt, expiresAt: row.expiresAt },
          now,
          apiConfig.scan.jobTtlNoProgressMs,
          apiConfig.scan.chainTimeoutMs,
        );
        if (!reason) continue;
        const failedProgress = { ...progress, errors: [...progress.errors, reason] };
        const result = serializePollResult(row.id, row.address, "error", failedProgress);
        const updated = await this.prisma.scanJob.updateMany({
          where: { id: row.id, status: row.status, leaseOwner: row.leaseOwner, progressAt: row.progressAt },
          data: { status: "error", progress: failedProgress as never, result: result as never, finishedAt: now, expiresAt: new Date(now.getTime() + apiConfig.scan.jobTtlDoneMs), leaseOwner: null, leaseExpiresAt: null },
        });
        if (updated.count === 1 && row.leaseOwner) this.attempts.get(row.leaseOwner)?.controller.abort();
      }
    } catch (error) {
      console.error("[scan-job] cleanup failed:", error instanceof Error ? error.message : String(error));
    }
  }
}

const postgresQueues = new WeakMap<PrismaClient, PostgresScanJobQueue>();

export function getPostgresScanJobQueue(prisma: PrismaClient): PostgresScanJobQueue {
  let queue = postgresQueues.get(prisma);
  if (!queue) {
    queue = new PostgresScanJobQueue(prisma);
    postgresQueues.set(prisma, queue);
  }
  return queue;
}
