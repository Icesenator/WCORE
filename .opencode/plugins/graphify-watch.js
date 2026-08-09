import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process";
import { existsSync as nodeExistsSync, readFileSync as nodeReadFileSync } from "node:fs";
import path from "node:path";

const WCORE_ROOT = "K:\\WCORE";
const OWNER_PATH = "K:\\WCORE\\.tmp\\graphify-watch.json";
const SCRIPT_PATH = "K:\\WCORE\\scripts\\graphify-sync.ps1";
const MAX_HEARTBEAT_AGE_MS = 5000;
const MAX_SYNC_AGE_MS = 30 * 60 * 1000;
const RECONCILE_INTERVAL_MS = 3000;
export const IDENTITY_CACHE_TTL_MS = 30 * 1000;

function workspaceRoot(input) {
  return input?.worktree ?? input?.directory ?? input?.project?.worktree ?? input?.project?.root ?? "";
}

export function isWcoreWorkspace(input) {
  const root = workspaceRoot(input);
  return root !== "" && path.win32.resolve(root).toLowerCase() === WCORE_ROOT.toLowerCase();
}

export function isOwnerFresh(owner, nowMs) {
  if (owner?.syncing === true) {
    const syncStarted = Date.parse(owner.syncStartedUtc ?? "");
    const syncAge = nowMs - syncStarted;
    return Number.isFinite(syncStarted) && syncAge >= 0 && syncAge <= MAX_SYNC_AGE_MS;
  }
  const heartbeat = Date.parse(owner?.heartbeat ?? "");
  const heartbeatAge = nowMs - heartbeat;
  return Number.isFinite(heartbeat) && heartbeatAge >= 0 && heartbeatAge <= MAX_HEARTBEAT_AGE_MS;
}

export function resolveWindowsProcessIdentity(execFile, pid) {
  return new Promise((resolve) => {
    const command = `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks.ToString([System.Globalization.CultureInfo]::InvariantCulture)`;
    execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", command],
      { windowsHide: true, timeout: 3000 },
      (error, stdout) => resolve(error ? null : String(stdout).trim() || null),
    );
  });
}

export function createGraphifyWatchPlugin(overrides = {}) {
  const dependencies = {
    existsSync: nodeExistsSync,
    readFileSync: nodeReadFileSync,
    isProcessAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    spawn: nodeSpawn,
    execFile: nodeExecFile,
    logError: (error) => console.error("Graphify watcher startup failed:", error),
    processPid: process.pid,
    now: () => Date.now(),
    scheduleReconcile: (callback) => queueMicrotask(callback),
    setInterval: (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
    ...overrides,
  };
  dependencies.resolveProcessIdentity ??= (pid) => resolveWindowsProcessIdentity(dependencies.execFile, pid);

  return async function graphifyWatchPlugin(input) {
    if (!isWcoreWorkspace(input)) return {};

    let localChild = null;
    let reconciliationPending = false;
    let verifiedOwnerKey = null;
    let verifiedOwnerAtMs = null;

    const invalidateVerifiedOwner = () => {
      verifiedOwnerKey = null;
      verifiedOwnerAtMs = null;
    };

    const hasTrustedOwner = async () => {
      if (!dependencies.existsSync(OWNER_PATH)) {
        invalidateVerifiedOwner();
        return false;
      }
      let owner;
      try {
        owner = JSON.parse(dependencies.readFileSync(OWNER_PATH, "utf8"));
      } catch {
        invalidateVerifiedOwner();
        return false;
      }
      const ownerKey = [owner?.token, owner?.watcherPid, owner?.watcherStartIdentity].join("|");
      const nowMs = dependencies.now();
      if (
        typeof owner?.token !== "string" ||
        owner.token === "" ||
        !Number.isInteger(owner?.watcherPid) ||
        owner.watcherPid <= 0 ||
        typeof owner?.watcherStartIdentity !== "string" ||
        owner.watcherStartIdentity === "" ||
        !isOwnerFresh(owner, nowMs) ||
        !dependencies.isProcessAlive(owner.watcherPid)
      ) {
        invalidateVerifiedOwner();
        return false;
      }
      const cacheAge = nowMs - verifiedOwnerAtMs;
      if (ownerKey === verifiedOwnerKey && cacheAge >= 0 && cacheAge < IDENTITY_CACHE_TTL_MS) return true;
      invalidateVerifiedOwner();
      const actualIdentity = await dependencies.resolveProcessIdentity(owner.watcherPid);
      if (actualIdentity === null || actualIdentity !== owner.watcherStartIdentity) return false;
      verifiedOwnerKey = ownerKey;
      verifiedOwnerAtMs = nowMs;
      return true;
    };

    const reconcile = async () => {
      if (localChild !== null || reconciliationPending) return;
      reconciliationPending = true;
      try {
        if (await hasTrustedOwner()) return;

        const child = dependencies.spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            SCRIPT_PATH,
            "watch",
            "-ParentPid",
            String(dependencies.processPid),
          ],
          { detached: true, stdio: "ignore", windowsHide: true },
        );
        localChild = child;
        const clearChild = () => {
          if (localChild === child) localChild = null;
          invalidateVerifiedOwner();
        };
        child.once?.("error", (error) => {
          dependencies.logError(error);
          clearChild();
        });
        child.once?.("exit", (code, signal) => {
          if (code !== 0) dependencies.logError(new Error(`Graphify watcher exited with code ${code}${signal ? ` (${signal})` : ""}`));
          clearChild();
        });
        child.unref?.();
      } catch (error) {
        dependencies.logError(error);
      } finally {
        reconciliationPending = false;
      }
    };

    const requestReconciliation = () => {
      void reconcile();
    };
    try {
      dependencies.scheduleReconcile(requestReconciliation);
      const timer = dependencies.setInterval(requestReconciliation, RECONCILE_INTERVAL_MS);
      timer?.unref?.();
    } catch (error) {
      dependencies.logError(error);
    }
    return {};
  };
}

export default createGraphifyWatchPlugin();
