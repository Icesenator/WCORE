import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { BACKUP_MODELS, collectBackup } = require("../backup-db.cjs") as {
  BACKUP_MODELS: string[];
  collectBackup: (client: Record<string, unknown>) => Promise<{ tables: Record<string, unknown[]> }>;
};

test("JSON backup covers every Prisma schema model", () => {
  const schemaPath = fileURLToPath(new URL("../../../packages/db/prisma/schema.prisma", import.meta.url));
  const schema = readFileSync(schemaPath, "utf8");
  const expected = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)]
    .map((match) => match[1]![0]!.toLowerCase() + match[1]!.slice(1))
    .sort();
  assert.deepEqual([...BACKUP_MODELS].sort(), expected);
});

test("scheduled wrapper runs the JSON backup directly and propagates failure", () => {
  const scriptPath = fileURLToPath(new URL("../../../scripts/backup-db-scheduled.ps1", import.meta.url));
  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /& node backup-db\.cjs/);
  assert.match(script, /if \(\$LASTEXITCODE -ne 0\)/);
  assert.match(script, /exit \$LASTEXITCODE/);
});

test("JSON backup fails instead of returning partial data on query failure", async () => {
  const client = Object.fromEntries(BACKUP_MODELS.map((name) => [name, {
    findMany: async () => name === "scanJob" ? Promise.reject(new Error("query unavailable")) : [{ id: name }],
  }]));

  await assert.rejects(() => collectBackup(client), /Backup query failed for scanJob: query unavailable/);
});

test("JSON backup fails when a configured Prisma model is missing", async () => {
  const client = Object.fromEntries(BACKUP_MODELS.slice(1).map((name) => [name, { findMany: async () => [] }]));
  await assert.rejects(() => collectBackup(client), /Prisma model unavailable: user/);
});
