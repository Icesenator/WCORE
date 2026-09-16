// Controle de gouvernance CURRENT - P1-DATA-GRAPH-CHROME-PROFILE-NODES
// Garde de l'artefact graphify-out/graph.json (suivi par git) : aucune source
// locale/gitignore ne doit y apparaitre (profil Chrome, worktrees, _vault, cache
// graft, export .generated), et tout lien doit pointer sur un noeud present.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const GRAPH_FILE = path.join(ROOT, "graphify-out", "graph.json");

const LOCAL_TOP_DIRS = [
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
];

let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${desc}${ok ? "" : "  -> " + detail}`);
}

const normalize = (file) => String(file || "").replace(/\\/g, "/");
const topDir = (file) => normalize(file).split("/")[0];

let tracked = new Set();
try {
  for (const entry of execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0")) {
    if (entry) tracked.add(normalize(entry));
  }
} catch (error) {
  check("GIT", "git ls-files disponible", false, error.message);
}

let graph = null;
try {
  graph = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf8"));
} catch (error) {
  check("JSON", "graph.json lisible", false, error.message);
}
check("JSON", "graph.json lisible", graph !== null && Array.isArray(graph.nodes) && Array.isArray(graph.links), "structure invalide");

if (graph && Array.isArray(graph.nodes)) {
  const localDirs = LOCAL_TOP_DIRS.filter((dir) => graph.nodes.some((n) => topDir(n.source_file) === dir));
  check("LOCAL", "aucun noeud issu d'un dossier local/gitignore", localDirs.length === 0, `dossiers presents: ${localDirs.join(", ")}`);

  const absolute = graph.nodes.filter((n) => /^[a-zA-Z]:/.test(normalize(n.source_file)) || normalize(n.source_file).startsWith("/"));
  check("ABS", "aucun noeud avec chemin absolu", absolute.length === 0, `${absolute.length} noeud(s)`);

  const untracked = graph.nodes.filter((n) => {
    const src = normalize(n.source_file);
    if (!src) return false;
    if (src.endsWith(".stub.py")) {
      const base = src.slice(0, -".stub.py".length);
      return !(tracked.has(base) || tracked.has(`${base}.md`) || tracked.has(`${base}.markdown`));
    }
    if (tracked.has(src)) return false;
    if (src.endsWith(".js") && tracked.has(`${src.slice(0, -3)}.mjs`)) return false;
    return true;
  });
  check("TRACKED", "tout noeud source est suivi par git", untracked.length === 0, `${untracked.length} noeud(s), ex. ${untracked[0] ? untracked[0].source_file + " @ " + untracked[0].source_location : "-"}`);
}

if (graph && Array.isArray(graph.links) && Array.isArray(graph.nodes)) {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const dangling = graph.links.filter((l) => !ids.has(l.source) || !ids.has(l.target));
  check("LINKS", "aucun lien orphelin", dangling.length === 0, `${dangling.length} lien(s)`);
  check("SIZE", "graphe non vide", graph.nodes.length > 0 && graph.links.length > 0, `nodes=${graph.nodes.length} links=${graph.links.length}`);
}

// Le corpus d'extraction est aussi nettoye a la source par .graphify-exclude, lu par
// le stager partage (K:\ProjetIA\scripts\graphify-project.ps1). Si un dossier local
// disparait de ce fichier, il revient dans .tmp/graphify-input puis dans le graphe au
// prochain rebuild : le garder aligne avec les dossiers locaux connus.
const EXCLUDE_FILE = path.join(ROOT, ".graphify-exclude");
const SHARED_STAGER_LOCAL_DIRS = ["data", ".generated", "graft", "_vault", "invest-gas", ".worktrees", ".claude"];
const excludeText = fs.existsSync(EXCLUDE_FILE) ? fs.readFileSync(EXCLUDE_FILE, "utf8") : "";
const fragments = excludeText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
check("EXCL", ".graphify-exclude present (corpus propre a la source)", fragments.length > 0, `${fragments.length} fragment(s)`);
const flatExclude = fragments.join(" ").replace(/\\/g, "");
const missingExclude = SHARED_STAGER_LOCAL_DIRS.filter((dir) => !flatExclude.includes(dir));
check("EXCL-DIRS", ".graphify-exclude couvre les dossiers locaux du stager", missingExclude.length === 0, `manquants: ${missingExclude.join(", ")}`);

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAIL"}  (JSON/GIT/LOCAL/ABS/TRACKED/LINKS/SIZE/EXCL)`);
process.exit(failed === 0 ? 0 : 1);
