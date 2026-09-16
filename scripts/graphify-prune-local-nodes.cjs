#!/usr/bin/env node
// WCORE Graphify prune - retire du graphe publie les noeuds dont la source n'est
// pas suivie par git.
//
// Pourquoi : le stager partage (K:\ProjetIA\scripts\graphify-project.ps1) copie
// tous les .js/.ts/.gs du depot en excluant une liste codee en dur (node_modules,
// .git, graphify-out, generated, backups, pw-profile...) mais il ne lit PAS le
// .gitignore du projet. Il stage donc des dossiers locaux/gitignores de WCORE
// (data/chrome-profile, invest-gas, .worktrees, _vault, graft, .generated), dont
// les noeuds finissaient dans graphify-out/graph.json, un artefact suivi par git.
//
// Regle : un noeud publie ne peut referencer qu'une source suivie par git (les
// noeuds sans chemin local, issus d'imports, sont conserves). Les liens dont un
// bout est retire, ou dont la source d'extraction est locale, sont retires aussi.
//
// Usage : node scripts/graphify-prune-local-nodes.cjs [--dry-run]
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const GRAPH_FILE = path.join(ROOT, "graphify-out", "graph.json");

const LOCAL_TOP_DIRS = new Set([
  "data",
  ".worktrees",
  "invest-gas",
  "graft",
  "_vault",
  ".generated",
  "generated",
  "node_modules",
  "tmp",
  ".tmp",
  "backups",
  ".claude",
  ".playwright-mcp",
  ".obsidian-vault",
  "graphify-out",
]);

const dryRun = process.argv.includes("--dry-run");

function fail(message) {
  process.stderr.write(`[graphify-prune] ABORT: ${message}\n`);
  process.exit(1);
}

function normalize(file) {
  return String(file || "").replace(/\\/g, "/");
}

function localTopDir(file) {
  const norm = normalize(file);
  if (/^[a-zA-Z]:/.test(norm) || norm.startsWith("/")) return "(chemin absolu)";
  const top = norm.split("/")[0];
  return LOCAL_TOP_DIRS.has(top) ? top : null;
}

function readTrackedFiles() {
  let raw;
  try {
    raw = execFileSync("git", ["ls-files", "-z"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1 << 28,
    });
  } catch (error) {
    fail(`git ls-files a echoue: ${error.message}`);
  }
  const tracked = new Set();
  for (const entry of raw.split("\0")) {
    if (entry) tracked.add(normalize(entry));
  }
  if (tracked.size === 0) fail("git ls-files ne renvoie aucun fichier suivi");
  return tracked;
}

function keepReason(node, tracked) {
  const src = node && node.source_file;
  if (!src) return "sans-source";
  const norm = normalize(src);
  const top = localTopDir(norm);
  if (top) return null;
  if (tracked.has(norm)) return "suivi";
  if (norm.endsWith(".stub.py")) {
    const base = norm.slice(0, -".stub.py".length);
    if (tracked.has(base) || tracked.has(`${base}.md`) || tracked.has(`${base}.markdown`)) {
      return "stub-md-suivi";
    }
    return null;
  }
  if (norm.endsWith(".js") && tracked.has(`${norm.slice(0, -3)}.mjs`)) return "mjs-renomme";
  return null;
}

function syncStatusFile(nodes, edges, removedNodes, removedLinks) {
  const statusFile = path.join(ROOT, "graphify-out", "status.json");
  if (!fs.existsSync(statusFile)) return;
  let status;
  try {
    status = JSON.parse(fs.readFileSync(statusFile, "utf8"));
  } catch (error) {
    return;
  }
  status.nodes = nodes;
  status.edges = edges;
  status.prunedNodes = removedNodes;
  status.prunedEdges = removedLinks;
  status.prunedAt = new Date().toISOString();
  const tmp = `${statusFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(status), "utf8");
  fs.renameSync(tmp, statusFile);
}

function main() {
  if (!fs.existsSync(GRAPH_FILE)) fail(`introuvable: ${GRAPH_FILE}`);
  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf8"));
  } catch (error) {
    fail(`graph.json illisible: ${error.message}`);
  }
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.links)) {
    fail("graph.json doit contenir des tableaux nodes et links");
  }

  const tracked = readTrackedFiles();
  const droppedTopDirs = new Map();
  const keptIds = new Set();
  let droppedNodes = 0;

  for (const node of graph.nodes) {
    const reason = keepReason(node, tracked);
    if (reason) {
      keptIds.add(node.id);
      continue;
    }
    droppedNodes += 1;
    const top = localTopDir(node.source_file) || "(non suivi)";
    droppedTopDirs.set(top, (droppedTopDirs.get(top) || 0) + 1);
  }

  const guardLimit = Math.floor(graph.nodes.length * 0.9);
  if (graph.nodes.length > 0 && droppedNodes > guardLimit) {
    fail(`prune refusee: ${droppedNodes}/${graph.nodes.length} noeuds seraient retires (>90%)`);
  }

  const keptLinks = graph.links.filter((link) => {
    if (!keptIds.has(link.source) || !keptIds.has(link.target)) return false;
    if (link.source_file && localTopDir(link.source_file)) return false;
    return true;
  });
  const droppedLinks = graph.links.length - keptLinks.length;

  const summary = [...droppedTopDirs.entries()].sort((a, b) => b[1] - a[1]);
  if (droppedNodes === 0) {
    syncStatusFile(graph.nodes.length, graph.links.length, 0, 0);
    process.stdout.write(
      `[graphify-prune] OK - rien a retirer (${graph.nodes.length} noeuds, ${graph.links.length} liens)\n`,
    );
    return;
  }

  if (dryRun) {
    process.stdout.write(
      `[graphify-prune] DRY-RUN - ${droppedNodes} noeuds / ${droppedLinks} liens a retirer: ${summary
        .map(([dir, count]) => `${dir}=${count}`)
        .join(", ")}\n`,
    );
    return;
  }

  graph.nodes = graph.nodes.filter((node) => keptIds.has(node.id));
  graph.links = keptLinks;
  const tmp = `${GRAPH_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(graph), "utf8");
  fs.renameSync(tmp, GRAPH_FILE);
  syncStatusFile(graph.nodes.length, graph.links.length, droppedNodes, droppedLinks);
  process.stdout.write(
    `[graphify-prune] OK - ${droppedNodes} noeuds / ${droppedLinks} liens retires (${summary
      .map(([dir, count]) => `${dir}=${count}`)
      .join(", ")}); reste ${graph.nodes.length} noeuds, ${graph.links.length} liens\n`,
  );
}

main();
