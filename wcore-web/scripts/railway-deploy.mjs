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
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, openSync, closeSync, lstatSync, fstatSync, realpathSync, readSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { hostname as osHostname, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export class DeployError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Railway stops reading railway.json / railway.toml for existing services on this date
// (docs.railway.com/config-as-code). After it, the config written into the upload no longer
// decides which Dockerfile builds the service, so a "config-as-code" manifest is refused.
export const CONFIG_AS_CODE_CUTOFF = Date.parse("2026-12-01T00:00:00Z");
// Statuses of a deployment that is still being built or rolled out.
const ACTIVE_DEPLOYMENT = new Set(["BUILDING", "DEPLOYING", "INITIALIZING", "WAITING", "QUEUED"]);
const SHA = /^[0-9a-f]{40}$/;

export function parseArgs(argv) {
  const options = { dryRun: false, acceptSharedClientIp: false, clearStaleLock: false };
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
    else if (arg === "--trust-proxy-attestation") options.trustProxyAttestation = next();
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--accept-shared-client-ip") options.acceptSharedClientIp = true;
    else if (arg === "--clear-stale-lock") options.clearStaleLock = true;
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

// What a commit must contain to claim a trust model. The table belongs to the deployer, not to
// the commit: a manifest names a model, it cannot weaken what the name requires. Markers catch a
// wrong or stale commit (the positional attestation presented for code that trusts the public
// entries at every hop); they are not a defence against a commit written to deceive.
export const TRUST_PROXY_MODELS = {
  "wcore.trust-proxy.positional/v1": {
    model: "positional",
    sourceMarkers: {
      "wcore-web/apps/api/src/server.ts": ["positionalTrustProxy(apiConfig.server.trustProxy)", "const trustProxy = trustProxyScope.trust;"],
      "wcore-web/apps/api/src/trust-proxy.ts": ["export function positionalTrustProxy("],
    },
  },
};

function resolveTrustProxyModel(repo, sha, entry) {
  if (!Object.hasOwn(entry, "trustProxyModel")) return "uniform";
  const fail = (reason) => { throw new DeployError("E_TRUST_PROXY_MODEL", `trustProxyModel is not usable at ${sha}: ${reason}`); };
  const declared = entry.trustProxyModel;
  if (typeof declared !== "string" || !Object.hasOwn(TRUST_PROXY_MODELS, declared)) fail("unknown model");
  const { model, sourceMarkers } = TRUST_PROXY_MODELS[declared];
  for (const [path, markers] of Object.entries(sourceMarkers)) {
    // A path missing at the SHA prints nothing, so every marker is reported missing.
    const shown = capture("git", ["show", `${sha}:${path}`], repo);
    const missing = markers.filter((marker) => !shown.stdout.includes(marker));
    if (missing.length > 0) fail(`${path} does not carry ${JSON.stringify(missing)}`);
  }
  return model;
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
    trustProxyModel: resolveTrustProxyModel(repo, sha, entry),
    productionEnvironment: manifest.productionEnvironment,
    configSource: manifest.configSource,
  };
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// Machine-local lock. It never expires by age: a deploy that runs past any timeout keeps
// it. A lock left by a crash is only cleared on request (--clear-stale-lock), and only
// when it was taken on this machine by a process that no longer exists. It cannot see a
// deploy started from another machine: checkRemoteIdle covers that, as far as Railway can.
export function acquireLock(lockDir, target, { clearStale = false, host = osHostname(), pid = process.pid, isAlive = processAlive, now = Date.now() } = {}) {
  mkdirSync(lockDir, { recursive: true });
  const lockPath = join(lockDir, `wcore-railway-${target.project}-${target.environment}-${target.service}.lock`.replace(/[^\w.-]/g, "_"));
  const owner = { host, pid, startedAt: new Date(now).toISOString(), sha: target.sha };
  const create = () => {
    const fd = openSync(lockPath, "wx");
    try {
      writeSync(fd, JSON.stringify(owner));
    } finally {
      closeSync(fd);
    }
  };
  try {
    create();
  } catch (error) {
    if (error.code !== "EEXIST") throw new DeployError("E_LOCK", `cannot create ${lockPath}: ${error.message}`);
    let holder;
    try {
      holder = JSON.parse(readFileSync(lockPath, "utf8"));
    } catch {
      throw new DeployError("E_LOCK", `${lockPath} exists and is unreadable; inspect it before removing it by hand`);
    }
    if (holder.host !== host) throw new DeployError("E_LOCK", `${lockPath} was taken on ${holder.host}; its process cannot be checked from here`);
    if (isAlive(holder.pid)) throw new DeployError("E_LOCK", `deploy of ${target.service} to ${target.environment} still running (pid ${holder.pid} since ${holder.startedAt})`);
    if (!clearStale) {
      throw new DeployError("E_LOCK_STALE", `${lockPath} was left by pid ${holder.pid} (since ${holder.startedAt}), which has exited; check Railway for that deploy, then rerun with --clear-stale-lock`);
    }
    // Moved aside rather than deleted, so a racing clear cannot remove a fresh lock.
    renameSync(lockPath, `${lockPath}.stale-${now}`);
    try {
      create();
    } catch {
      throw new DeployError("E_LOCK", `${lockPath} was taken again while clearing it`);
    }
  }
  return () => {
    try {
      const holder = JSON.parse(readFileSync(lockPath, "utf8"));
      if (holder.host === host && holder.pid === pid && holder.startedAt === owner.startedAt) rmSync(lockPath, { force: true });
    } catch {
      // Already gone or replaced: never remove a lock this run does not own.
    }
  };
}

// `railway status --json` prints the linked project object (id at the top level). The
// link must be the target by exact id: a status that merely mentions the id elsewhere
// is refused, as is any shape not recognised. Commands that can take --project do.
export function checkLinkedProject(project, repo) {
  const status = capture("railway", ["status", "--json"], repo);
  let linked;
  try {
    const parsed = status.status === 0 ? JSON.parse(status.stdout) : null;
    const ids = [parsed?.id, parsed?.project?.id].filter((id) => typeof id === "string");
    linked = ids.length > 0 && ids.every((id) => id === project) ? project : null;
  } catch {
    linked = null;
  }
  if (linked !== project) {
    throw new DeployError("E_LINK", `the Railway CLI is not linked to project ${project}; run railway link first`);
  }
}

// Refuses while Railway reports a build or rollout in progress for this service, whoever
// started it. Fails closed when the state cannot be read. There is still a window between
// this check and `railway up`; Railway itself does not offer a lock.
export function checkRemoteIdle(project, service, environment, repo) {
  const listed = capture("railway", ["deployment", "list", "--project", project, "--service", service, "--environment", environment, "--json", "--limit", "20"], repo);
  let deployments;
  try {
    deployments = listed.status === 0 ? JSON.parse(listed.stdout) : null;
  } catch {
    deployments = null;
  }
  if (!Array.isArray(deployments) || deployments.some((d) => typeof d?.status !== "string")) {
    throw new DeployError("E_REMOTE_UNKNOWN", `cannot read the deployments of ${service} in ${environment}; refusing rather than risking a concurrent deploy`);
  }
  const active = deployments.filter((d) => ACTIVE_DEPLOYMENT.has(d.status.toUpperCase()));
  if (active.length > 0) {
    throw new DeployError("E_REMOTE_BUSY", `${service} in ${environment} has a deployment in progress (${active.map((d) => `${d.id ?? "?"} ${d.status}`).join(", ")})`);
  }
}

// configSource:
// - "config-as-code": the uploaded railway.json decides the build. Railway stops reading it on
//   2026-12-01; from then on this mode is refused.
// - "service-settings": the build is decided by the settings stored on the Railway service
//   (builder, Dockerfile, watch patterns, healthcheck). No railway.json is uploaded, and the
//   stored settings must match wcore-web/railway/<service>.json before anything is published.
export const CONFIG_SOURCES = new Set(["config-as-code", "service-settings"]);

export function assertConfigSourceUsable(configSource, now = Date.now()) {
  if (!CONFIG_SOURCES.has(configSource)) {
    throw new DeployError("E_CONFIG_SOURCE", `unknown configSource ${JSON.stringify(configSource)} in deploy-manifest.json`);
  }
  if (configSource === "config-as-code" && now >= CONFIG_AS_CODE_CUTOFF) {
    throw new DeployError("E_CONFIG_SOURCE", "Railway no longer reads railway.json since 2026-12-01: the Dockerfile of the service is no longer set by this upload. Switch to configSource service-settings (docs/cloud/RAILWAY_CONFIG_MIGRATION.md)");
  }
}

// The settings this deployer requires on the Railway service, taken from the committed config.
export function expectedServiceSettings(configText) {
  const config = JSON.parse(configText);
  const expected = {
    builder: config.build?.builder,
    dockerfilePath: config.build?.dockerfilePath,
    watchPatterns: [...(config.build?.watchPatterns ?? [])].sort(),
  };
  if (config.deploy?.healthcheckPath !== undefined) expected.healthcheckPath = config.deploy.healthcheckPath;
  if (config.deploy?.healthcheckTimeout !== undefined) expected.healthcheckTimeout = config.deploy.healthcheckTimeout;
  return expected;
}

// Compares the settings stored on the Railway service with the committed config. Reads
// `railway config pull --json`, which writes nothing; its variables are never logged or kept.
// Fails closed: an unreadable state, a missing service or any difference stops the deploy.
export function checkServiceSettings(plan, environment, repo) {
  const pulled = capture("railway", ["config", "pull", "--json", "--environment", environment], repo);
  let resources;
  try {
    resources = pulled.status === 0 ? JSON.parse(pulled.stdout)?.resources : null;
  } catch {
    resources = null;
  }
  if (!Array.isArray(resources)) {
    throw new DeployError("E_SETTINGS_UNKNOWN", `cannot read the Railway settings of ${plan.service} in ${environment}; refusing rather than building with unknown settings`);
  }
  const found = resources.filter((r) => r?.type === "service" && r?.name === plan.service);
  if (found.length !== 1) throw new DeployError("E_SETTINGS_UNKNOWN", `expected one Railway service named ${plan.service}, found ${found.length}`);
  const { build = {}, deploy = {} } = found[0];
  const actual = {
    builder: build.builder,
    dockerfilePath: build.dockerfilePath,
    watchPatterns: [...(build.watchPatterns ?? [])].sort(),
    healthcheckPath: deploy.healthcheckPath,
    healthcheckTimeout: deploy.healthcheckTimeout,
  };
  const expected = expectedServiceSettings(plan.configText);
  const drift = Object.keys(expected).filter((key) => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
  if (drift.length > 0) {
    // Names and values of build settings only: never variables.
    const detail = drift.map((key) => `${key}: Railway ${JSON.stringify(actual[key])} != ${plan.configPath} ${JSON.stringify(expected[key])}`).join("; ");
    throw new DeployError("E_SETTINGS_DRIFT", `${plan.service} settings on Railway do not match the commit: ${detail}`);
  }
  return expected;
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
    // Without these, core.autocrlf=true (Git for Windows' default) makes git archive write
    // CRLF into every text file, so the image would not match the commit byte for byte.
    const archive = spawn("git", ["-c", "core.autocrlf=false", "-c", "core.eol=lf", "archive", "--format=tar", sha], { cwd: repo });
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
  const blobs = new Map(git(repo, ["ls-tree", "-r", "-z", sha]).split("\0").filter(Boolean).map((line) => {
    const [meta, path] = line.split("\t");
    return [path, meta.split(" ")[2]];
  }));
  const expected = [...blobs.keys()].sort();
  const actual = listFiles(contextDir);
  if (expected.length !== actual.length || expected.some((path, i) => path !== actual[i])) {
    throw new DeployError("E_CONTEXT", `exported context does not match ${sha} (${actual.length} files, expected ${expected.length})`);
  }
  // Same bytes as the commit, not only the same names: hash each file as a git blob.
  for (const path of actual) {
    const content = readFileSync(join(contextDir, path));
    const id = createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
    if (id !== blobs.get(path)) throw new DeployError("E_CONTEXT", `${path} in the exported context differs from ${sha}`);
  }
}

// Config files Railway would read from an upload. In service-settings mode none may reach the
// upload: the root railway.json names the api Dockerfile and would build the wrong image.
const CONFIG_AS_CODE_FILES = new Set(["railway.json", "railway.toml"]);

export function removeConfigAsCodeFiles(contextDir) {
  const removed = listFiles(contextDir).filter((path) => CONFIG_AS_CODE_FILES.has(path.split("/").pop()));
  for (const path of removed) rmSync(join(contextDir, path), { force: true });
  return removed;
}

export function writeGenerated(contextDir, plan, { sha, ref, environment }) {
  if (plan.configSource === "service-settings") removeConfigAsCodeFiles(contextDir);
  else writeFileSync(join(contextDir, "railway.json"), plan.configText);
  writeFileSync(join(contextDir, ".railwayignore"), [`# Generated by railway-deploy.mjs for ${plan.service} at ${sha}`, ...plan.ignore, ""].join("\n"));
  // Not secret: the repository is public. Read by the image so /health can name its commit.
  const buildInfo = { schema: 1, sha, ref, service: plan.service, environment, source: "railway-deploy.mjs" };
  writeFileSync(join(contextDir, "wcore-web", "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
  return buildInfo;
}

// Déclaration humaine locale uniquement : ni identité authentifiée, ni preuve runtime.
// Aucun appel de variables, aucune génération de déclaration, aucun fallback réseau.
const ATTESTATION_KEYS = ["schema", "version", "project", "service", "environment", "sha", "observedAt", "reviewedAt", "issuedAt", "expiresAt", "classification", "topologyVerified", "operatorConfirmed", "validationRules", "driftAcknowledgement"];
// Version 1 : chaque entrée de TRUST_PROXY est un proxy vérifié, quel que soit le code déployé.
// Version 2 : la valeur contient des adresses publiques, qui sont les bords de la plateforme ; elle
// n'est recevable que pour un commit dont le code ne leur fait confiance qu'au saut 1 (modèle
// "positional" du plan, vérifié au SHA). Elle ajoute deux clés et ne remplace aucun contrôle.
const ATTESTATION_VERSIONS = {
  1: { keys: ATTESTATION_KEYS, classification: "VALID_VERIFIED_PROXY", validationRules: "wcore.trust-proxy.release/v1", models: null, extra: {},
    mode: "OPERATOR_DECLARATIVE_ATTESTATION" },
  2: { keys: [...ATTESTATION_KEYS, "trustModel", "publicEntriesAreEdgesOnly"], classification: "VALID_POSITIONAL_PROXY", validationRules: "wcore.trust-proxy.release/v2",
    models: ["positional"], extra: { trustModel: "wcore.trust-proxy.positional/v1", publicEntriesAreEdgesOnly: true },
    mode: "OPERATOR_DECLARATIVE_ATTESTATION_POSITIONAL" },
};
function attestationError() {
  return new DeployError("E_TRUST_PROXY_ATTESTATION", "Déclaration opérateur absente, invalide ou expirée ; aucune vérification technique du runtime n'est revendiquée.");
}
function validateAttestation(value, target, now, model) {
  const fail = () => { throw attestationError(); };
  if (!value || Array.isArray(value) || typeof value !== "object" || !Object.hasOwn(value, "version") ||
      typeof value.version !== "number" || !Object.hasOwn(ATTESTATION_VERSIONS, value.version)) fail();
  const spec = ATTESTATION_VERSIONS[value.version];
  if (Object.keys(value).length !== spec.keys.length || spec.keys.some((key) => !Object.hasOwn(value, key))) fail();
  if (spec.models && !spec.models.includes(model)) fail();
  if (Object.entries(spec.extra).some(([key, expected]) => value[key] !== expected)) fail();
  if (value.schema !== "wcore.trust-proxy-attestation" ||
      target.service !== "api" || value.service !== target.service ||
      typeof target.project !== "string" || !target.project || value.project !== target.project ||
      typeof target.environment !== "string" || !target.environment || value.environment !== target.environment ||
      !SHA.test(target.sha ?? "") || value.sha !== target.sha ||
      value.classification !== spec.classification || value.topologyVerified !== true || value.operatorConfirmed !== true ||
      value.validationRules !== spec.validationRules || value.driftAcknowledgement !== "wcore.post-observation-drift/v1") fail();
  const times = ["observedAt", "reviewedAt", "issuedAt", "expiresAt"].map((key) => {
    const text = value[key];
    if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text)) fail();
    const time = Date.parse(text);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== text) fail();
    return time;
  });
  const [observed, reviewed, issued, expires] = times;
  if (!Number.isFinite(now) || !(observed <= reviewed && reviewed <= issued && issued <= now && now < expires) || expires - observed > 30 * 60_000) fail();
  return spec;
}

export function checkTrustProxy(plan, options, repo, now = Date.now()) {
  if (!plan.trustProxyPreflight) return null;
  let value, spec;
  try {
    if (options.acceptSharedClientIp || typeof options.trustProxyAttestation !== "string") throw attestationError();
    const path = resolve(options.trustProxyAttestation);
    // Refuse les symlinks/jonctions connus dans chaque composant ; pas une garantie
    // contre un adversaire local capable de remplacer simultanément les parents.
    for (let current = path; ; current = dirname(current)) {
      if (lstatSync(current).isSymbolicLink()) throw attestationError();
      if (dirname(current) === current) break;
    }
    const before = lstatSync(path);
    if (!before.isFile() || before.size > 8192 || realpathSync(path) !== path) throw attestationError();
    const fd = openSync(path, "r");
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.size > 8192 || opened.dev !== before.dev || opened.ino !== before.ino) throw attestationError();
      const buffer = Buffer.alloc(8193);
      const bytes = readSync(fd, buffer, 0, buffer.length, 0);
      if (bytes > 8192) throw attestationError();
      const text = buffer.subarray(0, bytes).toString("utf8");
      value = JSON.parse(text);
      // Schéma plat : chaque clé doit apparaître une seule fois, y compris les clés
      // échappées. Toute structure imbriquée est ensuite refusée par le schéma.
      const keys = [...text.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map((match) => JSON.parse(`"${match[1]}"`));
      // Le nombre exact de clés de la version déclarée est contrôlé par validateAttestation.
      if (new Set(keys).size !== keys.length || keys.length !== Object.keys(value ?? {}).length) throw attestationError();
    } finally {
      closeSync(fd);
    }
    spec = validateAttestation(value, options, now, plan.trustProxyModel);
  } catch {
    throw attestationError(); // Jamais le contenu, le chemin ou l'erreur système.
  }
  return { mode: spec.mode, revalidate: (time) => validateAttestation(value, options, time, plan.trustProxyModel) };
}

export async function deploy(argv, { repo: defaultRepo, lockDir = tmpdir(), log = console.error, inspect, now = Date.now(), clock = Date.now, lockOptions = {} } = {}) {
  const options = parseArgs(argv);
  const repo = resolve(options.repo ?? defaultRepo);
  const sha = resolveCommit(repo, options.ref);
  const plan = loadServicePlan(repo, sha, options.service);
  assertEnvironmentAccepts(repo, sha, options.environment, plan.productionEnvironment);
  assertConfigSourceUsable(plan.configSource, now);
  checkLinkedProject(options.project, repo);
  const trustProxy = checkTrustProxy(plan, { ...options, sha }, repo, now);
  const release = acquireLock(lockDir, { ...options, sha }, { clearStale: options.clearStaleLock, now, ...lockOptions });
  let contextDir;
  try {
    // After the lock: two runs on this machine cannot both pass this check and upload.
    checkRemoteIdle(options.project, options.service, options.environment, repo);
    if (plan.configSource === "service-settings") checkServiceSettings(plan, options.environment, repo);
    contextDir = mkdtempSync(join(tmpdir(), `wcore-${options.service}-`));
    await exportCommit(repo, sha, contextDir);
    const buildInfo = writeGenerated(contextDir, plan, { sha, ref: options.ref, environment: options.environment });
    inspect?.(contextDir);
    log(`plan: ${options.service} <- ${sha} (${options.ref}) via ${plan.dockerfile} to ${options.environment}${trustProxy ? `, ${trustProxy.mode} (déclaration locale, ni identité ni runtime attestés)` : ""}`);
    trustProxy?.revalidate(clock());
    if (options.dryRun) return { status: 0, sha, buildInfo, published: false };
    const line = commandLine("railway", ["up", contextDir, "--path-as-root", "--project", options.project, "--environment", options.environment,
      "--service", options.service, "--ci", "--message", `wcore ${options.service} ${sha}`]);
    const result = spawnSync(line.command, line.args, { stdio: "inherit", shell: line.shell });
    return { status: result.status ?? 1, sha, buildInfo, published: result.status === 0 };
  } finally {
    if (contextDir) rmSync(contextDir, { recursive: true, force: true });
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
