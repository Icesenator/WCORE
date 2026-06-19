import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, "schema.prisma"), "utf8");

function modelBlock(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `model ${modelName} not found`);
  return match[1] ?? "";
}

describe("Prisma hot-path indexes", () => {
  test("adds indexes for GM, notification and leaderboard read paths", () => {
    assert.match(modelBlock("User"), /@@index\(\[score\]\)/);
    assert.match(modelBlock("GmContract"), /@@index\(\[ownerId\]\)/);
    assert.match(modelBlock("GmContract"), /@@index\(\[creatorAddress\]\)/);
    assert.match(modelBlock("OnchainGm"), /@@index\(\[userId, createdAt\]\)/);
    assert.match(modelBlock("OnchainGm"), /@@index\(\[contractId\]\)/);
    assert.match(modelBlock("Notification"), /@@index\(\[userId, createdAt\]\)/);
  });
});
