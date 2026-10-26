#!/usr/bin/env node
// Publishes one Railway service from one exact, pushed commit.
//
//   node wcore-web/scripts/railway-deploy.mjs --service api --ref origin/master \
//     --environment production --project <railway project id> [--dry-run]
//
// The uploaded context is `git archive <sha>` extracted into an empty temporary
// directory: nothing from the working tree (modified, untracked or ignored files, local
// commits) can reach the image. The Railway config, ignore list and build-info.json are
// generated inside that directory from the commit's own wcore-web/railway/ files, so
// two deploys never share a mutable railway.json. Every check runs before `railway up`;
// any failure exits non-zero without publishing.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, openSync, closeSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assessTrustProxy } from "../apps/api/src/trust-proxy.ts";

export class DeployError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const LOCK_STALE_MS = 30 * 60_000;
const SHA = /^[0-9a-f]{40}$/;

export function parseArgs(argv) {
  const options = { dryRun: false, acceptSharedClientIp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new DeployError("E_USAGE", `${arg} needs a value`);
      return value;
    };
    if (arg === "--service") options.service = next();
    else if (arg === "--ref") options.ref = next();
    else if (arg === "--environment") options.environment = next();
    else if (arg === "--project") options.project = next();
    else if (arg === "--repo") options.repo = next();
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--accept-shared-client-ip") options.acceptSharedClientIp = true;
    else throw new DeployError("E_USAGE", `unknown option ${arg}`);
  }
  // No defaults: the old script deployed "web" when -Service was omitted.
  for (const key of ["service", "ref", "environment", "project"]) {
    if (!options[key]) throw new DeployError("E_USAGE", `--${key} is required`);
  }
  return options;
}

// The Railway CLI is a .cmd shim on Windows, which Node only starts through a shell;
// every argument is quoted so a temp path or message with spaces stays one argument.
function commandLine(command, args) {
  if (process.platform !== "win32" || command !== "railway") return { command, args, shell: false };
  return { command: [command, ...args.map((arg) => `"${arg.replace(/"/g, '""')}"`)].join(" "), args: [], shell: true };
}

function capture(command, args, cwd) {
  const line = commandLine(command, args);
  const result = spawnSync(line.command, line.args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: line.shell });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function git(repo, args) {
  const result = capture("git", args, repo);
  if (result.status !== 0) throw new DeployError("E_GIT", `git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

export function resolveCommit(repo, ref) {
  git(repo, ["fetch", "--quiet", "origin"]);
  const resolved = capture("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], repo);
  const sha = resolved.stdout.trim();
  if (resolved.status !== 0 || !SHA.test(sha)) throw new DeployError("E_REF", `${ref} does not name a commit`);
  // A commit only on this machine cannot be rebuilt or audited by anyone else.
  const remotes = git(repo, ["branch", "--remotes", "--contains", sha]).trim();
  if (!remotes) throw new DeployError("E_NOT_PUBLISHED", `${sha} is not on any branch of origin; push it first`);
  return sha;
}

export function assertEnvironmentAccepts(repo, sha, environment, productionEnvironment) {
  if (!productionEnvironment) throw new DeployError("E_MANIFEST", "the manifest does not name the production environment");
  if (environment !== productionEnvironment) return;
  const onMaster = capture("git", ["merge-base", "--is-ancestor", sha, "origin/master"], repo);
  if (onMaster.status !== 0) throw new DeployError("E_NOT_ON_MASTER", `${sha} is not part of origin/master; production only runs merged code`);
}

function readJsonAt(repo, sha, path) {
  const shown = capture("git", ["show", `${sha}:${path}`], repo);
  if (shown.status !== 0) throw new DeployError("E_MANIFEST", `${path} is missing at ${sha}`);
  try {
    return { text: shown.stdout, json: JSON.parse(shown.stdout) };
  } catch {
    throw new DeployError("E_MANIFEST", `${path} at ${sha} is not valid JSON`);
  }
}

export function loadServicePlan(repo, sha, service) {
  const { json: manifest } = readJsonAt(repo, sha, "wcore-web/railway/deploy-manifest.json");
  const entry = manifest.services?.[service];
  if (!entry) throw new DeployError("E_USAGE", `unknown service ${service}; known: ${Object.keys(manifest.services ?? {}).join(", ")}`);
  const { text: configText, json: config } = readJsonAt(repo, sha, entry.config);
  const dockerfile = config.build?.dockerfilePath;
  if (config.build?.builder !== "DOCKERFILE" || typeof dockerfile !== "string") {
    throw new DeployError("E_MANIFEST", `${entry.config} must build from a Dockerfile`);
  }
  const shown = capture("git", ["show", `${sha}:${dockerfile}`], repo);
  if (shown.status !== 0) throw new DeployError("E_DOCKERFILE", `${dockerfile} is missing at ${sha}`);
  // A Dockerfile path pointing at the other app is exactly the 2026-05-19 incident.
  const missing = (entry.dockerfileMarkers ?? []).filter((marker) => !shown.stdout.includes(marker));
  if (missing.length > 0) throw new DeployError("E_DOCKERFILE", `${dockerfile} does not build ${service}: missing ${JSON.stringify(missing)}`);
  return {
    service,
    configPath: entry.config,
    configText,
    dockerfile,
    ignore: [...(manifest.commonIgnore ?? []), ...(entry.ignore ?? [])],
    trustProxyPreflight: entry.trustProxyPreflight === true,
    productionEnvironment: manifest.productionEnvironment,
  };
}

export function acquireLock(lockDir, project, environment, service, now = Date.now()) {
  mkdirSync(lockDir, { recursive: true });
  const lockPath = join(lockDir, `wcore-railway-${project}-${environment}-${service}.lock`.replace(/[^\w.-]/g, "_"));
  try {
    closeSync(openSync(lockPath, "wx"));
  } catch {
    const age = now - statSync(lockPath).mtimeMs;
    if (age < LOCK_STALE_MS) throw new DeployError("E_LOCK", `another deploy of ${service} to ${environment} holds ${lockPath}`);
    rmSync(lockPath, { force: true });
    closeSync(openSync(lockPath, "wx"));
  }
  return () => rmSync(lockPath, { force: true });
}

function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(root, full).split(sep).join("/"));
    }
  };
  walk(root);
  return out.sort();
}

export async function exportCommit(repo, sha, contextDir) {
  if (readdirSync(contextDir).length > 0) throw new DeployError("E_CONTEXT", `${contextDir} is not empty`);
  await new Promise((resolvePromise, reject) => {
    const archive = spawn("git", ["archive", "--format=tar", sha], { cwd: repo });
    const extract = spawn("tar", ["-x", "-f", "-", "-C", contextDir]);
    archive.stdout.pipe(extract.stdin);
    let failed = false;
    const onExit = (name) => (code) => {
      if (code !== 0 && !failed) {
        failed = true;
        reject(new DeployError("E_CONTEXT", `${name} exited with ${code}`));
      }
    };
    archive.on("exit", onExit("git archive"));
    extract.on("exit", (code) => (code === 0 ? (failed ? undefined : resolvePromise()) : onExit("tar")(code)));
  });
  const expected = git(repo, ["ls-tree", "-r", "--name-only", "-z", sha]).split("\0").filter(Boolean).sort();
  const actual = listFiles(contextDir);
  if (expected.length !== actual.length || expected.some((path, i) => path !== actual[i])) {
    throw new DeployError("E_CONTEXT", `exported context does not match ${sha} (${actual.length} files, expected ${expected.length})`);
  }
}

export function writeGenerated(contextDir, plan, { sha, ref, environment }) {
  writeFileSync(join(contextDir, "railway.json"), plan.configText);
  writeFileSync(join(contextDir, ".railwayignore"), [`# Generated by railway-deploy.mjs for ${plan.service} at ${sha}`, ...plan.ignore, ""].join("\n"));
  // Not secret: the repository is public. Read by the image so /health can name its commit.
  const buildInfo = { schema: 1, sha, ref, service: plan.service, environment, source: "railway-deploy.mjs" };
  writeFileSync(join(contextDir, "wcore-web", "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
  return buildInfo;
}

export function checkTrustProxy(plan, { project, environment, acceptSharedClientIp }, repo) {
  if (!plan.trustProxyPreflight) return null;
  const status = capture("railway", ["status", "--json"], repo);
  if (status.status !== 0 || !status.stdout.includes(project)) {
    throw new DeployError("E_LINK", `the Railway CLI is not linked to project ${project}; run railway link first`);
  }
  const listed = capture("railway", ["variable", "list", "--service", plan.service, "--environment", environment, "--json"], repo);
  if (listed.status !== 0) throw new DeployError("E_VARIABLES", `cannot read ${plan.service} variables in ${environment}`);
  let variables;
  try {
    variables = JSON.parse(listed.stdout);
  } catch {
    throw new DeployError("E_VARIABLES", "railway variable list did not return JSON");
  }
  // Only TRUST_PROXY is looked at, and its value is never printed.
  const assessment = assessTrustProxy(typeof variables?.TRUST_PROXY === "string" ? variables.TRUST_PROXY : undefined);
  if (!assessment.ok) throw new DeployError("E_TRUST_PROXY", `the API would refuse to start: ${assessment.reason}`);
  if (assessment.mode === "loopback-only" && !acceptSharedClientIp) {
    throw new DeployError("E_TRUST_PROXY", "TRUST_PROXY is unset: anonymous clients would share the proxy's rate-limit identity. Set the measured proxy addresses, or pass --accept-shared-client-ip to deploy knowingly");
  }
  return assessment;
}

export async function deploy(argv, { repo: defaultRepo, lockDir = tmpdir(), log = console.error, inspect } = {}) {
  const options = parseArgs(argv);
  const repo = resolve(options.repo ?? defaultRepo);
  const sha = resolveCommit(repo, options.ref);
  const plan = loadServicePlan(repo, sha, options.service);
  assertEnvironmentAccepts(repo, sha, options.environment, plan.productionEnvironment);
  const trustProxy = checkTrustProxy(plan, options, repo);
  const release = acquireLock(lockDir, options.project, options.environment, options.service);
  const contextDir = mkdtempSync(join(tmpdir(), `wcore-${options.service}-`));
  try {
    await exportCommit(repo, sha, contextDir);
    const buildInfo = writeGenerated(contextDir, plan, { sha, ref: options.ref, environment: options.environment });
    inspect?.(contextDir);
    log(`plan: ${options.service} <- ${sha} (${options.ref}) via ${plan.dockerfile} to ${options.environment}${trustProxy ? `, TRUST_PROXY ${trustProxy.mode}` : ""}`);
    if (options.dryRun) return { status: 0, sha, buildInfo, published: false };
    const line = commandLine("railway", ["up", contextDir, "--path-as-root", "--project", options.project, "--environment", options.environment,
      "--service", options.service, "--ci", "--message", `wcore ${options.service} ${sha}`]);
    const result = spawnSync(line.command, line.args, { stdio: "inherit", shell: line.shell });
    return { status: result.status ?? 1, sha, buildInfo, published: result.status === 0 };
  } finally {
    rmSync(contextDir, { recursive: true, force: true });
    release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  deploy(process.argv.slice(2), { repo })
    .then((result) => process.exit(result.status))
    .catch((error) => {
      console.error(`${error.code ?? "E_DEPLOY"}: ${error.message}`);
      process.exit(2);
    });
}
