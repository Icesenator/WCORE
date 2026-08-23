import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ensureCdpAvailable,
  inspectCdpEndpoint,
  launchOwnedChrome,
  resolveChromeConfig,
  waitForCdp,
} from "./chrome-cdp.js";

const config = resolveChromeConfig(process.env, process.cwd());

await ensureCdpAvailable(config.cdpEndpoint, config.cdpTimeoutMs, {
  inspect: (timeoutMs) => inspectCdpEndpoint(config.cdpEndpoint, timeoutMs),
  start: () => launchOwnedChrome(config),
  wait: (timeoutMs) => waitForCdp(config.cdpEndpoint, timeoutMs),
});

const cliPath = fileURLToPath(new URL("../node_modules/@playwright/mcp/cli.js", import.meta.url));
const server = spawn(
  process.execPath,
  [cliPath, "--cdp-endpoint", config.cdpEndpoint, "--cdp-timeout", String(config.cdpTimeoutMs)],
  { stdio: "inherit", windowsHide: true },
);

const stop = () => server.kill();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const exitCode = await new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code) => resolve(code ?? 0));
});

process.exitCode = exitCode;
