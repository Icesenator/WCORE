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
    const unwatched = sources.filter((source) => !config.build.watchPatterns.some((pattern) => covers(pattern, source)));
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

test("a web-only change cannot trigger the API service, and the reverse", () => {
  const api = JSON.parse(read(manifest.services.api.config)).build;
  const web = JSON.parse(read(manifest.services.web.config)).build;
  assert.ok(!api.watchPatterns.some((pattern) => covers(pattern, "wcore-web/apps/web/app/page.tsx")));
  assert.ok(!web.watchPatterns.some((pattern) => covers(pattern, "wcore-web/apps/api/src/server.ts")));
  assert.notEqual(api.dockerfilePath, web.dockerfilePath);
});

// Any service whose dashboard leaves the config path at its default reads the root
// railway.json (or wcore-web/railway.json when its root directory is wcore-web). Both
// build the API image: a web service left on the default would serve the API.
test("the default railway.json files build the API image and watch every API source", () => {
  const apiSources = copySources(JSON.parse(read(manifest.services.api.config)).build.dockerfilePath);
  for (const path of ["railway.json", "wcore-web/railway.json"]) {
    const build = JSON.parse(read(path)).build;
    assert.equal(build.dockerfilePath, "wcore-web/apps/api/Dockerfile.railway", path);
    if (build.watchPatterns) {
      assert.deepEqual(apiSources.filter((source) => !build.watchPatterns.some((pattern) => covers(pattern, source))), [], path);
    }
  }
});
