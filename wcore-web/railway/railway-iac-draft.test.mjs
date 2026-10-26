// Run: node --test wcore-web/railway/railway-iac-draft.test.mjs
// Static checks of the Infrastructure as Code draft (docs/cloud/railway-iac/railway.draft.ts)
// against the Config as Code files it replaces. Nothing contacts Railway.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const draft = readFileSync(join(root, "docs/cloud/railway-iac/railway.draft.ts"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "wcore-web/railway/deploy-manifest.json"), "utf8"));
const code = draft.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

test("the draft is not where `railway config plan|apply` would pick it up", () => {
  assert.equal(existsSync(join(root, ".railway/railway.ts")), false);
});

test("it is a partial declaring exactly the services this repository builds", () => {
  assert.match(code, /export const partial = "wcore-root";/);
  const declared = [...code.matchAll(/service\("([^"]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(declared, Object.keys(manifest.services).sort());
});

test("healthchecks match the Config as Code files they replace", () => {
  for (const service of Object.keys(manifest.services)) {
    const deploy = JSON.parse(readFileSync(join(root, manifest.services[service].config), "utf8")).deploy ?? {};
    const block = code.match(new RegExp(`service\\("${service}", \\{([^}]*)\\}`))?.[1] ?? "";
    if (deploy.healthcheckPath) {
      assert.match(block, new RegExp(`healthcheck: "${deploy.healthcheckPath}"`), service);
      assert.match(block, new RegExp(`healthcheckTimeout: ${deploy.healthcheckTimeout}\\b`), service);
    } else {
      assert.doesNotMatch(block, /healthcheck/, service);
    }
  }
});

test("it declares no variables, databases, volumes or domains, and cannot be applied as is", () => {
  assert.doesNotMatch(code, /\benv\s*:|preserve\(|database\(|postgres|redis|volume|domains\s*:/i);
  assert.match(code, /REPLACE_WITH_PULLED_PROJECT_NAME/);
});

test("the deployer still treats the services as Config as Code until the migration is applied", () => {
  assert.equal(manifest.configSource, "config-as-code");
});
