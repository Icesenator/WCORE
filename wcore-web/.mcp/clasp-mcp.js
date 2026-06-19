#!/usr/bin/env node
// clasp-mcp - Minimal MCP stdio server exposing clasp commands for WCORE
// Protocol: JSON-RPC 2.0 over stdio per Model Context Protocol spec
"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

const PROJECT_DIR = path.resolve(__dirname, "..");
const IS_WIN = process.platform === "win32";
const PROTOCOL_VERSION = "2024-11-05";

function log(...args) {
  process.stderr.write("[clasp-mcp] " + args.join(" ") + "\n");
}

function shellEscape(s) {
  // Conservative quoting for Windows cmd.exe and POSIX sh. Reject NUL and newlines.
  if (/[\0\r\n]/.test(s)) throw new Error("illegal character in arg");
  if (IS_WIN) return '"' + String(s).replace(/(["\\^&|<>%])/g, "^$1") + '"';
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function runClasp(args, { cwd = PROJECT_DIR, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const cmdLine = ["clasp", ...args.map(shellEscape)].join(" ");
    const child = spawn(cmdLine, { cwd, shell: true, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
    }, timeoutMs);
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("error", (err) => {
      clearTimeout(killer);
      resolve({ ok: false, code: -1, stdout, stderr: stderr + "\n[spawn error] " + err.message });
    });
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function textResult(text, isError = false) {
  return {
    content: [{ type: "text", text: text || "(no output)" }],
    isError: !!isError,
  };
}

function formatRun(res) {
  const head = `exit=${res.code}`;
  const parts = [head];
  if (res.stdout) parts.push("--- stdout ---\n" + res.stdout.trim());
  if (res.stderr) parts.push("--- stderr ---\n" + res.stderr.trim());
  return textResult(parts.join("\n\n"), !res.ok);
}

const TOOLS = [
  {
    name: "clasp_status",
    description: "Show clasp project status (tracked/untracked files) in wcore-gsheet/. Use before clasp_push.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "clasp_push",
    description: "Push local .gs files to Google Apps Script. WARNING: overwrites remote. Run clasp_status first.",
    inputSchema: {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Pass --force (skip confirmation, overwrite remote manifest)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "clasp_pull",
    description: "Pull remote .gs files from Google Apps Script into wcore-gsheet/.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "clasp_deploy",
    description: "Create a new clasp deployment. Optional description.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Deployment description" },
        deploymentId: { type: "string", description: "Update existing deployment by ID" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "clasp_logs",
    description: "Fetch recent Apps Script execution logs (non-watch, returns latest entries).",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "boolean", description: "Return JSON formatted logs" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "clasp_run",
    description: "Execute a deployed Apps Script function by name (requires API executable deployment).",
    inputSchema: {
      type: "object",
      properties: {
        functionName: { type: "string", description: "Function name, e.g. WCORE_HEALTH" },
      },
      required: ["functionName"],
      additionalProperties: false,
    },
  },
  {
    name: "clasp_version",
    description: "Return clasp --version and project info.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const FN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

async function handleToolCall(name, args = {}) {
  switch (name) {
    case "clasp_status":
      return formatRun(await runClasp(["status"]));
    case "clasp_push": {
      const extra = args.force ? ["--force"] : [];
      return formatRun(await runClasp(["push", ...extra], { timeoutMs: 180000 }));
    }
    case "clasp_pull":
      return formatRun(await runClasp(["pull"], { timeoutMs: 180000 }));
    case "clasp_deploy": {
      const extra = [];
      if (args.deploymentId && typeof args.deploymentId === "string") extra.push("-i", args.deploymentId);
      if (args.description && typeof args.description === "string") extra.push("-d", args.description);
      return formatRun(await runClasp(["deploy", ...extra], { timeoutMs: 180000 }));
    }
    case "clasp_logs": {
      const extra = args.json ? ["--json"] : [];
      return formatRun(await runClasp(["logs", ...extra], { timeoutMs: 60000 }));
    }
    case "clasp_run": {
      const fn = String(args.functionName || "");
      if (!FN_NAME_RE.test(fn)) {
        return textResult(`Invalid functionName: ${JSON.stringify(fn)}. Must match ${FN_NAME_RE}.`, true);
      }
      return formatRun(await runClasp(["run", fn], { timeoutMs: 180000 }));
    }
    case "clasp_version": {
      const res = await runClasp(["--version"]);
      const claspJson = path.join(PROJECT_DIR, ".clasp.json");
      let info = "";
      try {
        const j = JSON.parse(fs.readFileSync(claspJson, "utf8"));
        info = `\nscriptId=${j.scriptId}\nrootDir=${j.rootDir}\nprojectDir=${PROJECT_DIR}`;
      } catch (e) {
        info = `\n[could not read ${claspJson}: ${e.message}]`;
      }
      return textResult(`clasp ${res.stdout.trim() || res.stderr.trim()}${info}`, !res.ok);
    }
    default:
      return textResult(`Unknown tool: ${name}`, true);
  }
}

function jsonRpcResult(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}
function jsonRpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return JSON.stringify({ jsonrpc: "2.0", id, error: err });
}

async function dispatch(msg) {
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "clasp-mcp", version: "1.0.0" },
      });
    }
    if (method === "notifications/initialized") return null;
    if (method === "tools/list") {
      return jsonRpcResult(id, { tools: TOOLS });
    }
    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      const out = await handleToolCall(name, args || {});
      return jsonRpcResult(id, out);
    }
    if (method === "ping") return jsonRpcResult(id, {});
    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return jsonRpcError(id, -32603, `Internal error: ${err.message}`, { stack: err.stack });
  }
}

async function main() {
  if (process.argv.includes("--test")) {
    const v = await runClasp(["--version"]);
    log("clasp --version:", v.stdout.trim() || v.stderr.trim(), "code=", v.code);
    log("tools:", TOOLS.map((t) => t.name).join(", "));
    process.exit(v.ok ? 0 : 1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: undefined, terminal: false });
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch (e) {
      process.stdout.write(jsonRpcError(null, -32700, "Parse error") + "\n");
      return;
    }
    const resp = await dispatch(msg);
    if (resp !== null) process.stdout.write(resp + "\n");
  });
  rl.on("close", () => process.exit(0));
  log("clasp-mcp started, projectDir=", PROJECT_DIR);
}

main().catch((e) => { log("fatal:", e.stack || e.message); process.exit(1); });
