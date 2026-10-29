import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Environnement enfant en liste blanche : aucune variable héritée hormis le strict nécessaire
// au lancement de Node (PATH, SystemRoot, TEMP/TMP). Toutes les autres valeurs sont factices.
const FAKE_KEY = "fake-zerion-key-SENTINEL-7f3a";
const FIXTURE = fileURLToPath(new URL("./zerion-config-startup.fixture.ts", import.meta.url));
const API_DIR = fileURLToPath(new URL("..", import.meta.url));

interface ChildResult { ok: boolean; message?: string; maxPositions?: number; maxResponseBytes?: number; fetchCalls: number }

function baseEnv(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: "test" };
  for (const key of ["PATH", "Path", "SystemRoot", "TEMP", "TMP"]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function runChild(mode: "config" | "startup", extra: Record<string, string>): ChildResult {
  const result = spawnSync(process.execPath, ["--import", "tsx", FIXTURE, mode], {
    cwd: API_DIR,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...baseEnv(), ...extra },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const line = result.stdout.split(/\r?\n/).find((l) => l.startsWith("RESULT "));
  assert.ok(line, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(line.slice("RESULT ".length)) as ChildResult;
}

const CASES = [
  { key: "ZERION_MAX_POSITIONS", field: "maxPositions", fallback: 1000, valid: "500", limit: "1000", over: "1001" },
  { key: "ZERION_MAX_RESPONSE_BYTES", field: "maxResponseBytes", fallback: 2_000_000, valid: "1500000", limit: "2000000", over: "2000001" },
] as const;

test("variables absentes : défauts 1000 et 2 000 000 conservés", () => {
  const r = runChild("config", {});
  assert.deepEqual(r, { ok: true, maxPositions: 1000, maxResponseBytes: 2_000_000, fetchCalls: 0 });
});

for (const c of CASES) {
  test(`${c.key} : valeur valide acceptée`, () => {
    const r = runChild("config", { [c.key]: c.valid });
    assert.equal(r.ok, true, r.message);
    assert.equal(r[c.field], Number(c.valid));
  });

  test(`${c.key} : limite exacte acceptée`, () => {
    const r = runChild("config", { [c.key]: c.limit });
    assert.equal(r.ok, true, r.message);
    assert.equal(r[c.field], Number(c.limit));
  });

  test(`${c.key} : limite + 1 refusée, sans repli silencieux ni fuite de valeur`, () => {
    const r = runChild("config", { [c.key]: c.over, ZERION_API_KEY: FAKE_KEY });
    assert.equal(r.ok, false, `repli silencieux : ${JSON.stringify(r)}`);
    assert.equal(r[c.field], undefined);
    assert.match(r.message ?? "", new RegExp(`^${c.key} must be at most ${c.limit}$`));
    assert.ok(!(r.message ?? "").includes(c.over), "valeur brute dans le message");
    assert.ok(!(r.message ?? "").includes(FAKE_KEY), "secret dans le message");
  });

  for (const raw of ["invalid", "1.5", "-1", "0", "Infinity", "1e400", "", "9007199254740992"]) {
    test(`${c.key}=${JSON.stringify(raw)} refusée sans repli ni fuite`, () => {
      const r = runChild("config", { [c.key]: raw, ZERION_API_KEY: FAKE_KEY });
      assert.equal(r.ok, false, `repli silencieux : ${JSON.stringify(r)}`);
      assert.equal(r.message, `${c.key} must be a positive safe integer`);
      assert.ok(!(r.message ?? "").includes(FAKE_KEY));
    });
  }

  test(`${c.key} au-dessus du plafond : refus au démarrage réel, avant tout fetch`, () => {
    const r = runChild("startup", {
      [c.key]: c.over,
      ZERION_ENRICHMENT_ENABLED: "true",
      ZERION_API_KEY: FAKE_KEY,
      DATABASE_URL: "postgresql://fake:fake@127.0.0.1:1/fake",
    });
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.message, `${c.key} must be at most ${c.limit}`);
    assert.equal(r.fetchCalls, 0);
  });
}
