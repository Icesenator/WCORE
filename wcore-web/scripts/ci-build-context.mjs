#!/usr/bin/env node
// Builds, for CI, the Docker build context that railway-deploy.mjs uploads to Railway for one
// service (P1-REL-CI-DOCKER-BUILD): the commit exported byte for byte (exportCommit), the files
// the deployer generates (writeGenerated: build-info.json, .railwayignore, no railway.json), then
// the upload ignore list applied with gitignore semantics, as Railway applies .railwayignore.
// `docker build -f <dockerfile> <context>` then reproduces the Railway image build with no secret
// and no Railway access, so a Dockerfile that no longer builds fails the PR instead of the deploy.
//
// Nested .gitignore files are NOT applied: a tracked file they cover still reaches production
// (wcore-web/apps/web/public/wcore-post-market-cap.png is served by wcore.xyz), so the upload
// only drops what .railwayignore names.
//
// Usage: node wcore-web/scripts/ci-build-context.mjs --service <api|web> --out <new or empty dir> [--ref HEAD]
// Prints DOCKERFILE=<path inside the context> and FILES=<count> on success.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exportCommit, loadServicePlan, writeGenerated } from "./railway-deploy.mjs";

export function parseArgs(argv) {
  const out = { ref: "HEAD" };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--service" || key === "--out" || key === "--ref") {
      if (!value || value.startsWith("--")) throw new Error(`${key} needs a value`);
      out[key.slice(2)] = value;
      i++;
    } else {
      throw new Error(`unknown argument ${key}`);
    }
  }
  if (!out.service) throw new Error("--service is required");
  if (!out.out) throw new Error("--out is required");
  return out;
}

function run(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim()}`);
  return r.stdout;
}

/**
 * Removes from contextDir every file matched by `patterns` (gitignore syntax), as an upload
 * filtered by .railwayignore would. Uses git's own matcher on a throwaway repository so the
 * semantics (anchoring, trailing slash, **) are git's, not a reimplementation. Returns the
 * removed paths.
 */
export function applyUploadIgnore(contextDir, patterns) {
  const patternFile = join(contextDir, ".git-upload-ignore");
  run("git", ["init", "--quiet"], contextDir);
  writeFileSync(patternFile, `${patterns.join("\n")}\n`);
  try {
    const listed = run("git", ["-c", "core.quotePath=false", "ls-files", "--others", "--ignored", `--exclude-from=${patternFile}`, "-z"], contextDir);
    const removed = listed.split("\0").filter((p) => p && p !== ".git-upload-ignore");
    for (const path of removed) rmSync(join(contextDir, path), { force: true });
    return removed.sort();
  } finally {
    rmSync(patternFile, { force: true });
    rmSync(join(contextDir, ".git"), { recursive: true, force: true });
    pruneEmptyDirs(contextDir);
  }
}

// An upload carries files, not directories: a directory emptied by the ignore list is not sent.
function pruneEmptyDirs(dir, isRoot = true) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(join(dir, entry.name), false);
  }
  if (!isRoot && readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

export async function buildContext({ repo, service, out, ref = "HEAD" }) {
  const sha = run("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], repo).trim();
  const plan = loadServicePlan(repo, sha, service);
  if (existsSync(out) && readdirSync(out).length > 0) throw new Error(`${out} is not empty`);
  mkdirSync(out, { recursive: true });
  await exportCommit(repo, sha, out);
  writeGenerated(out, plan, { sha, ref, environment: "ci" });
  const removed = applyUploadIgnore(out, plan.ignore);
  return { sha, dockerfile: plan.dockerfile, removed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await buildContext({ repo, service: args.service, out: resolve(args.out), ref: args.ref });
    console.log(`SHA=${result.sha}`);
    console.log(`DOCKERFILE=${result.dockerfile}`);
    console.log(`REMOVED_BY_RAILWAYIGNORE=${result.removed.length}`);
  } catch (error) {
    console.error(`ci-build-context: ${error.message}`);
    process.exit(2);
  }
}
