import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { scanJobs, admitScanJob, failJob, jobPrincipal, type ScanJob } from "./scan-job.js";
import { apiConfig } from "../config.js";

const MAX_JOBS = apiConfig.scan.maxAsyncJobs;
const MAX_PER_PRINCIPAL = apiConfig.scan.maxAsyncJobsPerPrincipal;

let seq = 0;
function addJob(opts: { principal?: string; status?: ScanJob["status"]; createdAt?: number } = {}): ScanJob {
  const id = `job-${seq++}`;
  const principal = opts.principal ?? "user:a";
  const job: ScanJob = {
    jobId: id,
    address: "0x0000000000000000000000000000000000000001",
    userId: principal.startsWith("user:") ? principal.slice(5) : undefined,
    ip: principal.startsWith("ip:") ? principal.slice(3) : undefined,
    status: opts.status ?? "running",
    chains: [],
    totalEur: 0,
    tokenCount: 0,
    errors: [],
    createdAt: opts.createdAt ?? Date.now(),
    controller: new AbortController(),
  };
  scanJobs.set(id, job);
  return job;
}

beforeEach(() => {
  scanJobs.clear();
  seq = 0;
});

test("jobPrincipal prefers the signed-in user over the source IP", () => {
  assert.equal(jobPrincipal({ userId: "u1", ip: "1.2.3.4" }), "user:u1");
  assert.equal(jobPrincipal({ ip: "1.2.3.4" }), "ip:1.2.3.4");
  assert.equal(jobPrincipal({}), "ip:unknown");
});

test("a caller may run scans up to its allowance", () => {
  for (let i = 0; i < MAX_PER_PRINCIPAL - 1; i++) addJob({ principal: "user:a" });
  assert.deepEqual(admitScanJob("user:a"), { ok: true });
});

test("a caller cannot exceed its allowance", () => {
  for (let i = 0; i < MAX_PER_PRINCIPAL; i++) addJob({ principal: "user:a" });
  const decision = admitScanJob("user:a");
  assert.deepEqual(decision, { ok: false, reason: "principal", limit: MAX_PER_PRINCIPAL });
});

test("one greedy caller does not lock out the others", () => {
  for (let i = 0; i < MAX_PER_PRINCIPAL; i++) addJob({ principal: "user:a" });
  assert.deepEqual(admitScanJob("user:b"), { ok: true });
});

test("finished scans stop counting against the allowance", () => {
  // A wide scan leaves many settled jobs behind for their polling window. Counting
  // those would refuse the caller's next scan for half an hour.
  for (let i = 0; i < MAX_PER_PRINCIPAL * 2; i++) addJob({ principal: "user:a", status: "done" });
  assert.deepEqual(admitScanJob("user:a"), { ok: true });
});

test("the store evicts the oldest finished scans instead of refusing new ones", () => {
  for (let i = 0; i < MAX_JOBS; i++) addJob({ principal: `user:p${i}`, status: "done", createdAt: 1000 + i });
  const oldest = scanJobs.get("job-0");
  assert.ok(oldest, "precondition: the oldest job exists");

  assert.deepEqual(admitScanJob("user:new"), { ok: true });
  assert.ok(scanJobs.size < MAX_JOBS, "room must be freed for the incoming job");
  assert.equal(scanJobs.has("job-0"), false, "the oldest settled job is the one evicted");
  assert.equal(scanJobs.has(`job-${MAX_JOBS - 1}`), true, "the most recent settled job is kept");
});

test("the store refuses new scans once it is full of running ones", () => {
  // Spread across principals so the per-caller allowance is not what trips first.
  for (let i = 0; i < MAX_JOBS; i++) addJob({ principal: `user:p${i}` });
  const decision = admitScanJob("user:new");
  assert.deepEqual(decision, { ok: false, reason: "global", limit: MAX_JOBS });
  assert.equal(scanJobs.size, MAX_JOBS, "running work must never be evicted");
});

test("failing a job actually cancels the work it started", () => {
  const job = addJob();
  assert.equal(job.controller.signal.aborted, false);

  failJob(job, "job_timeout: exceeded max running time");

  // Before this, a TTL guard only flipped the status: every chain the job had
  // launched kept calling RPCs to completion for a result nobody would read.
  assert.equal(job.controller.signal.aborted, true, "the guard must stop the work, not just relabel it");
  assert.equal(job.status, "error");
  assert.deepEqual(job.errors, ["job_timeout: exceeded max running time"]);
});
