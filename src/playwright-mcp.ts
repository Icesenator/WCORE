import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  inspectCdpEndpoint,
  launchOwnedChrome,
  resolveChromeConfig,
  waitForCdp,
} from "./chrome-cdp.js";

const config = resolveChromeConfig(process.env, process.cwd());
const probeTimeoutMs = 5000;

const probeStatus = async (): Promise<"available" | "unavailable" | "non-cdp"> => {
  try {
    return await inspectCdpEndpoint(config.cdpEndpoint, probeTimeoutMs);
  } catch {
    return "unavailable";
  }
};

const ensureChromeReady = async (): Promise<void> => {
  const status = await probeStatus();
  if (status === "available") return;
  if (status === "non-cdp") {
    throw new Error(
      `Port ${config.cdpPort} occupe par un service non-CDP. Choisissez un autre PROJETIA_CDP_PORT.`,
    );
  }
  process.stderr.write(`[playwright-mcp] Demarrage paresseux de Chrome sur ${config.cdpEndpoint}\n`);
  await launchOwnedChrome(config);
  await waitForCdp(config.cdpEndpoint, config.cdpTimeoutMs);
};

const initial = await probeStatus();
if (initial === "available") {
  process.stderr.write(`[playwright-mcp] Chrome deja disponible sur ${config.cdpEndpoint}\n`);
} else if (initial === "non-cdp") {
  process.stderr.write(
    `[playwright-mcp] Port ${config.cdpPort} occupe (non-CDP); le MCP restera desynchronise\n`,
  );
} else {
  process.stderr.write(
    `[playwright-mcp] Chrome absent sur ${config.cdpEndpoint} (demarrage paresseux au premier outil)\n`,
  );
}

const cliPath = fileURLToPath(new URL("../node_modules/@playwright/mcp/cli.js", import.meta.url));

// Proxy transparent : on pipe stdin/stdout vers le child pour intercepter
// le bus JSON-RPC et detecter le premier appel d'un outil navigateur, qui
// declenche ensureChromeReady() avant que @playwright/mcp ne se connecte
// a Chrome (sinon l'init du client MCP attend 30 s sur CDP par defaut).
const server: ChildProcess = spawn(
  process.execPath,
  [
    cliPath,
    "--cdp-endpoint",
    config.cdpEndpoint,
    "--cdp-timeout",
    String(config.cdpTimeoutMs),
  ],
  { stdio: ["pipe", "pipe", "inherit"], windowsHide: true },
);
server.stdout?.pipe(process.stdout);
server.stderr?.pipe(process.stderr);

let bootstrapped = false;
const needsChrome = (chunk: Buffer): boolean => {
  // JSON-RPC line-delimited ; on lance Chrome a la reception d'une
  // requete d'outil (tools/call). initialize / tools/list / notifications
  // n'ouvrent pas de connexion Chrome, donc on ne les intercepte pas.
  if (bootstrapped) return false;
  if (chunk.length === 0) return false;
  const head = chunk.toString("utf8", 0, Math.min(chunk.length, 512));
  if (head.indexOf('"method"') < 0) return false;
  return head.indexOf('"tools/call"') >= 0;
};

const ensureAndForward = (chunk: Buffer, target: NodeJS.WritableStream | null): void => {
  if (target === null) return;
  if (needsChrome(chunk)) {
    bootstrapped = true;
    // On ne bloque pas le forwarding : on laisse passer la requete
    // immediatement, on lance Chrome en parallele. La latence du
    // premier appel sera absorbee par --cdp-timeout (config.cdpTimeoutMs).
    void ensureChromeReady().catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[playwright-mcp] Echec demarrage Chrome: ${msg}\n`);
    });
  }
  target.write(chunk);
};

process.stdin.on("data", (chunk: Buffer) => ensureAndForward(chunk, server.stdin));
process.stdin.on("end", () => server.stdin?.end());
process.stdin.on("close", () => server.stdin?.end());

const stop = (): void => {
  server.kill();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const exitCode = await new Promise<number>((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code) => resolve(code ?? 0));
});

process.exitCode = exitCode;
