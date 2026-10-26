// Run: node --test wcore-web/scripts/verify-deployment.test.mjs (local HTTP server only)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { parseArgs, verifyDeployment } from "./verify-deployment.mjs";

const SHA = "d".repeat(40);
const OTHER = "e".repeat(40);

async function serve(handler, fn) {
  const requests = [];
  const server = createServer((req, res) => { requests.push({ method: req.method, url: req.url }); handler(req, res); });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, requests);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

const json = (body, status = 200) => (_req, res) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };

test("accepts the expected service and commit with a single GET", async () => {
  await serve(json({ status: "ok", service: "wcore-api", build: { sha: SHA, source: "build-info" } }), async (url, requests) => {
    const result = await verifyDeployment({ service: "api", url, expectSha: SHA });
    assert.equal(result.ok, true, result.problems.join("; "));
    assert.deepEqual(requests, [{ method: "GET", url: "/health" }]);
  });
});

test("rejects a healthy service running another commit (e.g. a rollback that did not happen)", async () => {
  await serve(json({ status: "ok", service: "wcore-web", build: { sha: OTHER, source: "build-info" } }), async (url, requests) => {
    const result = await verifyDeployment({ service: "web", url, expectSha: SHA });
    assert.equal(result.ok, false);
    assert.match(result.problems.join(), new RegExp(`commit ${OTHER}`));
    assert.equal(requests[0].url, "/healthz");
  });
});

test("rejects a 200 HTML page: the other app answering on this service", async () => {
  await serve((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>WCORE</html>"); }, async (url) => {
    const result = await verifyDeployment({ service: "api", url, expectSha: SHA });
    assert.equal(result.ok, false);
    assert.match(result.problems.join(), /content-type text\/html/);
  });
});

test("rejects an image that cannot name its commit, or the wrong service", async () => {
  await serve(json({ status: "ok", service: "wcore-web", build: { sha: null, source: "unknown" } }), async (url) => {
    const result = await verifyDeployment({ service: "api", url, expectSha: SHA });
    assert.deepEqual(result.problems.map((p) => p.split(" ")[0]), ["service", "commit"]);
  });
});

test("requires a full commit id and a known service", () => {
  assert.throws(() => parseArgs(["--service", "api", "--url", "http://x", "--expect-sha", "abc123"]), /40-character/);
  assert.throws(() => parseArgs(["--service", "worker", "--url", "http://x", "--expect-sha", SHA]), /api or web/);
  assert.deepEqual(parseArgs(["--service", "web", "--url", "http://x", "--expect-sha", SHA]), { service: "web", url: "http://x", expectSha: SHA });
});
