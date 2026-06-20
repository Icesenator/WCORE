// Async scan job management: type, store, and TTL cleanup.
import type { ChainScan } from "@wcore/shared";
import { apiConfig } from "../config.js";

const CHAIN_TIMEOUT_MS = apiConfig.scan.chainTimeoutMs;
const JOB_TTL_RUNNING_MS = apiConfig.scan.jobTtlRunningMs;
const JOB_TTL_DONE_MS = apiConfig.scan.jobTtlDoneMs;
const JOB_TTL_NO_PROGRESS_MS = apiConfig.scan.jobTtlNoProgressMs;

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
}

export const scanJobs = new Map<string, ScanJob>();

// Cleanup expired jobs every 60s. Running jobs are NEVER deleted (they may
// take >15min on chains like BASE). Done/error jobs are kept 30min for polling.
export function startJobCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, job] of scanJobs) {
      if (job.status === "running") {
        // Guard 1: kill truly stuck jobs (10+ min with 0 progress)
        if (now - job.createdAt > JOB_TTL_NO_PROGRESS_MS && job.chains.every(c => c.status === "pending")) {
          job.status = "error";
          job.errors.push("job_timeout: no chain progress after 10min");
          continue;
        }
        // Guard 2: chains stuck in "scanning" for > 2× CHAIN_TIMEOUT_MS
        const maxChainTime = CHAIN_TIMEOUT_MS * 2;
        const hasStuckChains = job.chains.some(c => c.status === "scanning");
        const allStuck = job.chains.every(c => c.status === "pending" || c.status === "scanning");
        if (hasStuckChains && allStuck && now - job.createdAt > maxChainTime) {
          job.status = "error";
          job.errors.push(`job_timeout: chains stuck in scanning after ${Math.round(maxChainTime / 1000)}s`);
          continue;
        }
        // Guard 3: hard cap
        if (now - job.createdAt > JOB_TTL_RUNNING_MS) {
          job.status = "error";
          job.errors.push("job_timeout: exceeded max running time");
          continue;
        }
        continue;
      }
      if (now - job.createdAt > JOB_TTL_DONE_MS) scanJobs.delete(id);
    }
  }, 60_000).unref();
}
