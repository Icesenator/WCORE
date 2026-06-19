import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
try {
  process.loadEnvFile(resolve(__dirname, "../../.env.test"));
} catch {
  // ignore if .env.test doesn't exist
}
try {
  process.loadEnvFile(resolve(__dirname, "../../.env"));
} catch {
  // ignore if .env doesn't exist
}
process.env.NODE_ENV = "test";
// Require ALLOW_REMOTE_TEST_DB=1 for any non-loopback test DB to prevent
// accidentally pointing TEST_DATABASE_URL at Railway production.
const allowRemote = process.env.ALLOW_REMOTE_TEST_DB === "1";
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for API tests. Use a Railway test/staging database, never production.");
}
if (!process.env.TEST_REDIS_URL) {
  throw new Error("TEST_REDIS_URL is required for API tests. Use a Railway test/staging Redis, never production.");
}
const isLoopback = (v) => {
  try {
    const host = new URL(v).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
};
if (!isLoopback(process.env.TEST_DATABASE_URL) && !allowRemote) {
  throw new Error("TEST_DATABASE_URL points to a remote host. Set ALLOW_REMOTE_TEST_DB=1 to confirm this is a test/staging DB, never production.");
}
if (!isLoopback(process.env.TEST_REDIS_URL) && !allowRemote) {
  throw new Error("TEST_REDIS_URL points to a remote host. Set ALLOW_REMOTE_TEST_DB=1 to confirm this is a test/staging Redis, never production.");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.REDIS_URL = process.env.TEST_REDIS_URL;
