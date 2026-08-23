import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

export type ChromeConfig = {
  targetUrl: string;
  chromePath: string;
  cdpPort: number;
  cdpEndpoint: string;
  profileDir: string;
  cdpTimeoutMs: number;
  ownershipFile: string;
};

type Environment = Record<string, string | undefined>;

type FetchResponse = {
  ok: boolean;
  json?: () => Promise<unknown>;
};

type Fetcher = (url: string, options: { signal: AbortSignal }) => Promise<FetchResponse>;

type WaitDependencies = {
  inspect?: (endpoint: string, timeoutMs: number) => Promise<CdpEndpointStatus>;
  fetch?: Fetcher;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

export type CdpEndpointStatus = "available" | "unavailable" | "non-cdp";

type EnsureDependencies = {
  inspect: (timeoutMs: number) => Promise<CdpEndpointStatus>;
  start: () => void | Promise<void>;
  wait: (timeoutMs: number) => Promise<void>;
  now?: () => number;
};

type StartDependencies = {
  exists: (filePath: string) => boolean;
  spawn: (
    command: string,
    args: string[],
    options: { detached: true; stdio: "ignore" },
  ) => {
    once: (event: "spawn" | "error", listener: (...args: any[]) => void) => unknown;
    removeListener: (event: "spawn" | "error", listener: (...args: any[]) => void) => unknown;
    unref: () => void;
    pid?: number;
  };
};

type OwnershipMarker = {
  port: number;
  profileDir: string;
  nonce: string;
  pid: number;
};

type DisconnectEmitter = {
  once: (event: "disconnected", listener: () => void) => unknown;
};

type PageLike = Pick<Page, "url">;

type ContextLike<TPage extends PageLike> = {
  pages: () => TPage[];
  newPage: () => Promise<TPage>;
};

export function resolveChromeConfig(env: Environment, cwd: string): ChromeConfig {
  const cdpPort = parseInteger(env.WCORE_CDP_PORT ?? "9416", "WCORE_CDP_PORT", 1, 65535);
  const cdpTimeoutMs = parseInteger(
    env.WCORE_CDP_TIMEOUT_MS ?? "10000",
    "WCORE_CDP_TIMEOUT_MS",
    1,
    Number.MAX_SAFE_INTEGER,
  );

  const dataDir = path.resolve(cwd, "data");
  const profileDir = path.resolve(cwd, env.WCORE_PROFILE_DIR ?? "data/chrome-profile");
  if (!isWithin(dataDir, profileDir)) {
    throw new Error("WCORE_PROFILE_DIR doit rester dans le dossier data/ du projet.");
  }

  return {
    targetUrl: env.WCORE_URL ?? "http://localhost:3000",
    chromePath: env.WCORE_CHROME_PATH ?? defaultChromePath(env),
    cdpPort,
    cdpEndpoint: `http://127.0.0.1:${cdpPort}`,
    profileDir,
    cdpTimeoutMs,
    ownershipFile: path.resolve(dataDir, `cdp-owner-${cdpPort}.json`),
  };
}

export function buildChromeArgs(config: ChromeConfig, ownerNonce?: string): string[] {
  return [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${config.cdpPort}`,
    `--user-data-dir=${config.profileDir}`,
    ...(ownerNonce ? [`--wcore-owner=${ownerNonce}`] : []),
    config.targetUrl,
  ];
}

export async function startChrome(
  config: ChromeConfig,
  dependencies: StartDependencies = {
    exists: existsSync,
    spawn: (command, args, options) => spawn(command, args, options),
  },
  ownerNonce?: string,
): Promise<number> {
  if (!dependencies.exists(config.chromePath)) {
    throw new Error(
      `Google Chrome est introuvable Ã  l'emplacement "${config.chromePath}". DÃ©finissez WCORE_CHROME_PATH vers chrome.exe.`,
    );
  }

  const child = dependencies.spawn(config.chromePath, buildChromeArgs(config, ownerNonce), {
    detached: true,
    stdio: "ignore",
  });
  return await new Promise<number>((resolve, reject) => {
    const onSpawn = () => {
      child.removeListener("error", onError);
      if (!child.pid) {
        reject(new Error("Google Chrome a dÃ©marrÃ© sans identifiant de processus."));
        return;
      }
      child.unref();
      resolve(child.pid);
    };
    const onError = (error: Error) => {
      child.removeListener("spawn", onSpawn);
      reject(new Error(`Google Chrome n'a pas pu dÃ©marrer: ${error.message}`));
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

export async function inspectCdpEndpoint(
  endpoint: string,
  timeoutMs: number,
  fetcher: Fetcher = fetch,
): Promise<CdpEndpointStatus> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("CDP probe timed out"));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetcher(`${endpoint}/json/version`, { signal: controller.signal }),
      deadline,
    ]);
    if (!response.ok || !response.json) {
      return "non-cdp";
    }

    try {
      const body = await response.json();
      return isCdpVersion(body) ? "available" : "non-cdp";
    } catch {
      return "non-cdp";
    }
  } catch {
    return "unavailable";
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function ensureCdpAvailable(
  endpoint: string,
  timeoutMs: number,
  dependencies: EnsureDependencies,
): Promise<void> {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const status = await dependencies.inspect(timeoutMs);
  if (status === "available") {
    return;
  }
  if (status === "non-cdp") {
    throw nonCdpPortError(endpoint);
  }

  await dependencies.start();
  const remainingMs = timeoutMs - (now() - startedAt);
  if (remainingMs <= 0) {
    throw new Error(
      `Le point de terminaison CDP ${endpoint} n'a pas rÃ©pondu dans le dÃ©lai de ${timeoutMs} ms.`,
    );
  }
  await dependencies.wait(remainingMs);
}

export async function waitForCdp(
  endpoint: string,
  timeoutMs: number,
  dependencies: WaitDependencies = {
    fetch,
    now: Date.now,
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  },
): Promise<void> {
  const startedAt = dependencies.now();

  while (dependencies.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (dependencies.now() - startedAt);
    const status = dependencies.inspect
      ? await dependencies.inspect(endpoint, remainingMs)
      : await inspectCdpEndpoint(endpoint, remainingMs, dependencies.fetch ?? fetch);
    if (status === "available") {
      return;
    }
    if (status === "non-cdp") {
      throw nonCdpPortError(endpoint);
    }
    await dependencies.sleep(Math.min(100, timeoutMs));
  }

  throw new Error(
    `Chrome CDP n'est pas disponible sur ${endpoint} aprÃ¨s ${timeoutMs} ms. VÃ©rifiez le port et WCORE_CDP_TIMEOUT_MS.`,
  );
}

export function shouldNavigateToTarget(currentUrl: string, targetUrl: string): boolean {
  return getOrigin(currentUrl) !== new URL(targetUrl).origin;
}

export async function selectPage<TPage extends PageLike>(
  context: ContextLike<TPage>,
  targetUrl: string,
): Promise<TPage> {
  const targetOrigin = new URL(targetUrl).origin;
  const pages = context.pages();
  const targetPage = pages.find((page) => getOrigin(page.url()) === targetOrigin);

  if (targetPage) {
    return targetPage;
  }

  const blankPage = pages.find((page) => page.url() === "about:blank");
  return blankPage ?? context.newPage();
}

export async function launchOwnedChrome(config: ChromeConfig): Promise<void> {
  const nonce = randomUUID();
  const pid = await startChrome(config, undefined, nonce);
  await writeOwnershipMarker(config.ownershipFile, {
    port: config.cdpPort,
    profileDir: config.profileDir,
    nonce,
    pid,
  });
}

export async function readOwnershipMarker(filePath: string): Promise<OwnershipMarker | undefined> {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return isOwnershipMarker(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function matchesOwnershipMarker(
  marker: OwnershipMarker | undefined,
  expected: Pick<OwnershipMarker, "port" | "profileDir">,
): boolean {
  return Boolean(
    marker &&
      marker.port === expected.port &&
      path.resolve(marker.profileDir) === path.resolve(expected.profileDir),
  );
}

const execFileAsync = promisify(execFile);

export function parseArguments(commandLine: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < commandLine.length; i += 1) {
    const char = commandLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "\\" && commandLine[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === " " && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

export async function getWindowsCommandLine(pid: number): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("wmic", [
      "process",
      "where",
      `ProcessId=${pid}`,
      "get",
      "CommandLine",
      "/value",
    ]);
    const match = stdout.match(/^CommandLine=(.*)$/m);
    if (!match) {
      return undefined;
    }
    const value = match[1];
    const crlfRemoved = value.replace(/\r/g, "");
    return crlfRemoved.length > 0 ? crlfRemoved : undefined;
  } catch {
    return undefined;
  }
}

function getSystemProcessId(
  processInfo: Array<{ type?: string; id?: number }>,
): number | undefined {
  const browserProcess = processInfo.find((process) => process.type === "browser");
  return browserProcess?.id;
}

export function getChromeProcessInfo(
  marker: Pick<OwnershipMarker, "pid">,
  options: {
    readCommandLine: (pid: number) => Promise<string | undefined>;
    getProcessInfo: () => Promise<Array<{ type?: string; id?: number }>>;
  },
): Promise<{ arguments?: string[]; processId?: number }> {
  const pid = marker.pid;
  return Promise.all([options.readCommandLine(pid), options.getProcessInfo()]).then(
    ([commandLine, processInfo]) => {
      const args = commandLine === undefined ? undefined : parseArguments(commandLine);
      return {
        arguments: args,
        processId: args === undefined ? getSystemProcessId(processInfo) : pid,
      };
    },
  );
}

export function verifyCdpOwnership(
  expected: Pick<OwnershipMarker, "port" | "profileDir">,
  dependencies: {
    read: () => Promise<OwnershipMarker | undefined>;
    getProcessInfo: () => Promise<{ arguments?: string[]; processId?: number }>;
  },
): Promise<void> {
  return dependencies.read().then((marker) => {
    if (!matchesOwnershipMarker(marker, expected) || !marker) {
      throw new Error("La propriÃ©tÃ© du navigateur CDP ne peut pas Ãªtre Ã©tablie.");
    }

    return dependencies.getProcessInfo().then((processInfo) => {
      const args = processInfo.arguments ?? [];
      if (
        processInfo.processId !== marker.pid ||
        !args.includes(`--wcore-owner=${marker.nonce}`) ||
        !args.includes(`--user-data-dir=${expected.profileDir}`)
      ) {
        throw new Error("Le navigateur CDP actif n'appartient pas Ã  ce projet.");
      }
    });
  });
}

export function createDisconnectPromise(browser: DisconnectEmitter): Promise<void> {
  return new Promise((resolve) => browser.once("disconnected", resolve));
}

async function writeOwnershipMarker(filePath: string, marker: OwnershipMarker): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(marker), { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temporaryPath, filePath);
}

function isOwnershipMarker(value: unknown): value is OwnershipMarker {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const marker = value as Record<string, unknown>;
  return (
    Number.isInteger(marker.port) &&
    typeof marker.profileDir === "string" &&
    typeof marker.nonce === "string" &&
    marker.nonce.length > 0 &&
    Number.isInteger(marker.pid) &&
    Number(marker.pid) > 0
  );
}

function nonCdpPortError(endpoint: string): Error {
  return new Error(
    `Le port ${new URL(endpoint).port} est occupÃ© par un service non-CDP. Choisissez un autre WCORE_CDP_PORT.`,
  );
}

function isCdpVersion(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const version = value as Record<string, unknown>;
  return typeof version.Browser === "string" && typeof version.webSocketDebuggerUrl === "string";
}

function getOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseInteger(value: string, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} doit Ãªtre un entier compris entre ${minimum} et ${maximum}, reÃ§u: "${value}".`);
  }
  return parsed;
}

function defaultChromePath(env: Environment): string {
  const candidates = [
    env.PROGRAMFILES && path.join(env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    env["PROGRAMFILES(X86)"] &&
      path.join(env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find(existsSync) ?? candidates[0] ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}
