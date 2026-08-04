// Async scan job management: type, store, and TTL cleanup.
import type { ChainScan } from "@wcore/shared";
import { apiConfig } from "../config.js";

const CHAIN_TIMEOUT_MS = apiConfig.scan.chainTimeoutMs;
const JOB_TTL_RUNNING_MS = apiConfig.scan.jobTtlRunningMs;
const JOB_TTL_DONE_MS = apiConfig.scan.jobTtlDoneMs;
const JOB_TTL_NO_PROGRESS_MS = apiConfig.scan.jobTtlNoProgressMs;

const MAX_JOBS = apiConfig.scan.maxAsyncJobs;
const MAX_JOBS_PER_PRINCIPAL = apiConfig.scan.maxAsyncJobsPerPrincipal;

export interface ScanJob {
  jobId: string;
  address: string;
  userId?: string;
  ip?: string;
  status: "running" | "done" | "error";
  chains: Array<{ chainKey: string; chainName: string; status: "pending" | "scanning" | "done" | "error"; result?: ChainScan }>;
  totalEur: number;
  tokenCount: number;
  errors: string[];
  createdAt: number;
  /** Aborted when the job stops, so the chains it started stop calling RPCs too. */
  controller: AbortController;
}

export const scanJobs = new Map<string, ScanJob>();

/** A job belongs to its user when signed in, otherwise to its source IP. */
export function jobPrincipal(job: Pick<ScanJob, "userId" | "ip">): string {
  return job.userId ? `user:${job.userId}` : `ip:${job.ip ?? "unknown"}`;
}

function countRunning(principal?: string): number {
  let n = 0;
  for (const job of scanJobs.values()) {
    if (job.status !== "running") continue;
    if (principal && jobPrincipal(job) !== principal) continue;
    n++;
  }
  return n;
}

export type JobAdmission = { ok: true } | { ok: false; reason: "global" | "principal"; limit: number };

/**
 * Decides whether another job may start. The store used to be unbounded: each job holds
 * the full scan result of every chain it covers, so a caller looping on the async
 * endpoint could grow the process heap without limit and keep that many scans in flight.
 *
 * Settled jobs linger for their polling TTL, so the global cap evicts the oldest of them
 * before refusing anything: a client has almost always read its result by then, and a
 * burst of finished scans must not lock out new ones. Only genuinely running work counts
 * against the per-caller allowance.
 */
export function admitScanJob(principal: string): JobAdmission {
  if (scanJobs.size >= MAX_JOBS) {
    const settled = [...scanJobs.values()].filter(j => j.status !== "running").sort((a, b) => a.createdAt - b.createdAt);
    for (const job of settled) {
      if (scanJobs.size < MAX_JOBS) break;
      scanJobs.delete(job.jobId);
    }
  }
  if (scanJobs.size >= MAX_JOBS) return { ok: false, reason: "global", limit: MAX_JOBS };
  if (countRunning(principal) >= MAX_JOBS_PER_PRINCIPAL) return { ok: false, reason: "principal", limit: MAX_JOBS_PER_PRINCIPAL };
  return { ok: true };
}

/** Marks a job failed and actually stops the work it started. */
export function failJob(job: ScanJob, message: string): void {
  job.status = "error";
  job.errors.push(message);
  job.controller.abort();
}

// Cleanup expired jobs every 60s. Running jobs are NEVER deleted (they may
// take >15min on chains like BASE). Done/error jobs are kept 30min for polling.
export function startJobCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, job] of scanJobs) {
      if (job.status === "running") {
        // Guard 1: kill truly stuck jobs (10+ min with 0 progress)
        if (now - job.createdAt > JOB_TTL_NO_PROGRESS_MS && job.chains.every(c => c.status === "pending")) {
          failJob(job, "job_timeout: no chain progress after 10min");
          continue;
        }
        // Guard 2: chains stuck in "scanning" for > 2× CHAIN_TIMEOUT_MS
        const maxChainTime = CHAIN_TIMEOUT_MS * 2;
        const hasStuckChains = job.chains.some(c => c.status === "scanning");
        const allStuck = job.chains.every(c => c.status === "pending" || c.status === "scanning");
        if (hasStuckChains && allStuck && now - job.createdAt > maxChainTime) {
          failJob(job, `job_timeout: chains stuck in scanning after ${Math.round(maxChainTime / 1000)}s`);
          continue;
        }
        // Guard 3: hard cap
        if (now - job.createdAt > JOB_TTL_RUNNING_MS) {
          failJob(job, "job_timeout: exceeded max running time");
          continue;
        }
        continue;
      }
      if (now - job.createdAt > JOB_TTL_DONE_MS) {
        // Defensive: a job can only reach here once settled, but dropping the last
        // reference without aborting would strand any straggler still holding it.
        job.controller.abort();
        scanJobs.delete(id);
      }
    }
  }, 60_000).unref();
}
