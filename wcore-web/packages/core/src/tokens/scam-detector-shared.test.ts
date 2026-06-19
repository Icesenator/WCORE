import assert from "node:assert/strict";
import { test } from "node:test";

import { detectScam } from "@wcore/shared";

test("blocks the known BASE scam contract 0x260b...", () => {
  const result = detectScam("BASE", "Base", 1, 1, "0x260b9ac75753fbd67f2ea6d10724dd89a52c1913");

  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.includes("blocked contract"));
});
