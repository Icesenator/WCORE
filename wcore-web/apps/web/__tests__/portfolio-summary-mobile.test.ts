import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("portfolio summary separates title and actions on mobile without clipping overflow", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components/PortfolioSummaryCard.tsx"), "utf8");
  assert.ok(source.includes('className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-4"'));
  assert.ok(!source.includes('className="flex items-start justify-between mb-4"'));
});
