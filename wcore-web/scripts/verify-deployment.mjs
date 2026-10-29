#!/usr/bin/env node
// Confirms which commit a deployed service runs, with one GET and nothing else.
//
//   node wcore-web/scripts/verify-deployment.mjs --service api --url https://<api host> --expect-sha <40-hex>
//   node wcore-web/scripts/verify-deployment.mjs --service web --url https://wcore.xyz --expect-sha <40-hex>
//
// A 200 is not enough: on 2026-05-19 the API service answered 200 with the web app's
// HTML. Checks the status, the JSON content type, the service name and the commit id.
// After a rollback, pass the commit the rollback should have restored.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SERVICES = {
  // /health is liveness only (it is also the Railway healthcheck, so a database or Redis
  // outage cannot block a rollback); /ready is where PostgreSQL and Redis are checked.
  api: { path: "/health", name: "wcore-api", ready: "/ready" },
  web: { path: "/healthz", name: "wcore-web" },
};

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!["--service", "--url", "--expect-sha"].includes(flag) || value === undefined) throw new Error(`usage: --service api|web --url <base url> --expect-sha <sha>`);
    options[flag.slice(2).replace("-sha", "Sha")] = value;
  }
  if (!SERVICES[options.service]) throw new Error("--service must be api or web");
  if (!/^[0-9a-f]{40}$/.test(options.expectSha ?? "")) throw new Error("--expect-sha must be a full 40-character commit id");
  if (!options.url) throw new Error("--url is required");
  return options;
}

export async function verifyDeployment({ service, url, expectSha }, fetchImpl = fetch) {
  const target = SERVICES[service];
  const endpoint = new URL(target.path, url);
  const response = await fetchImpl(endpoint, { method: "GET", headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000) });
  const problems = [];
  if (response.status !== 200) problems.push(`status ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) problems.push(`content-type ${type || "missing"}: another app may be answering`);
  let body = null;
  try {
    body = await response.json();
  } catch {
    problems.push("body is not JSON");
  }
  if (body) {
    if (body.service !== target.name) problems.push(`service ${JSON.stringify(body.service)} instead of ${target.name}`);
    if (body.build?.sha !== expectSha) problems.push(`commit ${body.build?.sha ?? "unknown"} (${body.build?.source ?? "no build field"}) instead of ${expectSha}`);
  }
  if (target.ready) {
    const readyEndpoint = new URL(target.ready, url);
    const ready = await fetchImpl(readyEndpoint, { method: "GET", headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000) });
    let readyBody = null;
    try {
      readyBody = await ready.json();
    } catch {
      // reported below
    }
    if (ready.status !== 200 || readyBody?.status !== "ready") {
      problems.push(`not ready (${ready.status}${readyBody?.checks ? ` ${JSON.stringify(readyBody.checks)}` : ""}): PostgreSQL or Redis unavailable`);
    }
  }
  return { ok: problems.length === 0, endpoint: endpoint.href, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyDeployment(parseArgs(process.argv.slice(2)));
    console.log(result.ok ? `OK ${result.endpoint}` : `MISMATCH ${result.endpoint}\n- ${result.problems.join("\n- ")}`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
