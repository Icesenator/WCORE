// Sets a per-process random JWT_SECRET for tests, before auth.ts is imported.
// Tests MUST import this module before `./server.js` so JWT_SECRET is in env when auth.ts evaluates.
import { randomBytes } from "node:crypto";

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = `test-${randomBytes(24).toString("hex")}`;
}

export const TEST_JWT_SECRET: string = process.env.JWT_SECRET;
