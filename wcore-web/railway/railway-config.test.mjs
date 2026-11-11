// Run: node --test wcore-web/railway/railway-config.test.mjs
// Static parity between each Railway service, its Dockerfile, its watch patterns and the
// paths left out of its upload. Reads the checked-out tree; touches nothing remote.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(read("wcore-web/railway/deploy-manifest.json"));
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);

// Sources of COPY instructions that read the build context (not another stage).
function copySources(dockerfile) {
  return read(dockerfile).split("\n")
    .map((line) => line.trim())
    .filter((line) => /^COPY\s/i.test(line) && !/--from=/i.test(line))
    .flatMap((line) => line.replace(/^COPY\s+/i, "").split(/\s+/).filter((part) => !part.startsWith("--")).slice(0, -1));
}

// Generated into the upload by railway-deploy.mjs, never tracked, copied optionally.
const GENERATED = new Set(["wcore-web/build-info.jso[n]"]);
const covers = (pattern, path) => pattern === path || (pattern.endsWith("/**") && `${path}/`.startsWith(pattern.slice(0, -2)));

// .railwayignore follows gitignore rules: a pattern without an inner slash matches at any depth.
function ignored(pattern, path) {
  const dir = pattern.replace(/^\*\*\//, "").replace(/\/$/, "");
  const anchored = !pattern.startsWith("**/") && dir.includes("/");
  if (anchored) return path === dir || path.startsWith(`${dir}/`);
  return path.split("/").slice(0, -1).includes(dir) || path === dir;
}

for (const [service, entry] of Object.entries(manifest.services)) {
  const config = JSON.parse(read(entry.config));
  const dockerfile = config.build.dockerfilePath;
  const sources = copySources(dockerfile);

  test(`${service}: config builds ${dockerfile}, which carries the service's markers`, () => {
    assert.equal(config.build.builder, "DOCKERFILE");
    const text = read(dockerfile);
    for (const marker of entry.dockerfileMarkers) assert.ok(text.includes(marker), `${dockerfile} lacks ${marker}`);
  });

  test(`${service}: every path the Dockerfile copies is watched`, () => {
    assert.ok(sources.length > 0);
    const unwatched = sources.filter((source) => !GENERATED.has(source) && !config.build.watchPatterns.some((pattern) => covers(pattern, source)));
    assert.deepEqual(unwatched, []);
    assert.ok(config.build.watchPatterns.includes(entry.config), "a change to the service's own config must trigger it");
  });

  test(`${service}: no tracked file the Dockerfile copies is left out of the upload`, () => {
    const ignore = [...manifest.commonIgnore, ...entry.ignore];
    const copied = tracked.filter((path) => sources.some((source) => path === source || path.startsWith(`${source.replace(/\/$/, "")}/`)));
    const lost = copied.filter((path) => ignore.some((pattern) => ignored(pattern, path)));
    assert.deepEqual(lost, []);
  });
}

for (const service of ["api", "web"]) {
  test(`${service}: the image carries build-info and Railway gates traffic on a healthcheck`, () => {
    const config = JSON.parse(read(manifest.services[service].config));
    const text = read(config.build.dockerfilePath);
    assert.match(text, /^COPY wcore-web\/package\.json wcore-web\/build-info\.jso\[n\] \/build-info\/$/m);
    assert.match(text, /^COPY --chown=node:node --from=builder \/build-info\/ \/app\/build-info\/$/m);
    assert.equal(config.deploy.healthcheckPath, service === "api" ? "/health" : "/healthz");
  });
}

test("build-info.json is generated at deploy time and never committed", () => {
  assert.deepEqual(tracked.filter((path) => path.endsWith("build-info.json")), []);
});

test("a web-only change cannot trigger the API service, and the reverse", () => {
  const api = JSON.parse(read(manifest.services.api.config)).build;
  const web = JSON.parse(read(manifest.services.web.config)).build;
  assert.ok(!api.watchPatterns.some((pattern) => covers(pattern, "wcore-web/apps/web/app/page.tsx")));
  assert.ok(!web.watchPatterns.some((pattern) => covers(pattern, "wcore-web/apps/api/src/server.ts")));
  assert.notEqual(api.dockerfilePath, web.dockerfilePath);
});

// Since the move to configSource "service-settings" (2026-11-11), the build of each service is
// decided by the settings stored on Railway and checked by the deployer. A railway.json or
// railway.toml back in the repository would be read by Railway until 2026-12-01 and could build
// the wrong image (the old root file named the API Dockerfile for every service).
test("no Railway config-as-code file is tracked anywhere in the repository", () => {
  assert.deepEqual(tracked.filter((file) => /(^|\/)railway\.(json|toml)$/.test(file)), []);
  assert.equal(manifest.configSource, "service-settings");
});

// The API trusts TRUST_PROXY by hop position (apps/api/src/trust-proxy.ts). The manifest says so,
// which is what lets the deployer accept a version 2 operator attestation for this commit; the
// deployer then looks for the model's markers at the deployed SHA. If the wiring is renamed or
// removed without updating both, this fails here instead of at release time.
test("api: the declared trust-proxy model is one the deployer knows and its markers are in the sources", async () => {
  const { TRUST_PROXY_MODELS } = await import("../scripts/railway-deploy.mjs");
  const declared = manifest.services.api.trustProxyModel;
  assert.equal(declared, "wcore.trust-proxy.positional/v1");
  for (const [path, markers] of Object.entries(TRUST_PROXY_MODELS[declared].sourceMarkers)) {
    for (const marker of markers) assert.ok(read(path).includes(marker), `${path} lacks ${JSON.stringify(marker)}`);
  }
  for (const service of ["web", "cex-relay"]) assert.ok(!Object.hasOwn(manifest.services[service], "trustProxyModel"), service);
});
