'use strict';
// CM/scripts/cm-run.cjs - Launcher CM-owned (WCORE/CM).
// BUT : resoudre EXPLICITEMENT le chemin d'un outil CM-owned SANS dependre du cwd.
// Le tooling CM reste physiquement sous K:\ProjetIA\WCORE\scripts (aucun deplacement de masse) ;
// ce launcher est le point d'entree stable pour l'agent dont le project root est K:\ProjetIA\WCORE\CM.
// USAGE :
//   node CM/scripts/cm-run.cjs <tool> [args...]
//   node CM/scripts/cm-run.cjs --list
//   node CM/scripts/cm-run.cjs --self-check
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const CM_ROOT = path.resolve(__dirname, '..');            // K:\ProjetIA\WCORE\CM
const WCORE_ROOT = path.resolve(CM_ROOT, '..');           // K:\ProjetIA\WCORE
const TOOL_ROOT = path.join(WCORE_ROOT, 'scripts');

// Liste blanche : uniquement des outils CM-owned (prefixe cm- + la garde de gouvernance partagee).
const ALLOW = [
  'cm-boundary.cjs', 'cm-boundary.test.cjs',
  'cm-turn-end-check.cjs', 'cm-turn-end-guard.test.cjs',
  'cm-discovery-validate.cjs', 'cm-discovery-validate.test.cjs',
  'cm-discovery-qualify.cjs', 'cm-discovery-qualify.test.cjs',
  'cm-continuity-runner.cjs', 'cm-continuity-runner.test.cjs',
  'cm-continuity-child-guard.test.cjs', 'cm-continuity-freshness.test.cjs',
  'cm-continuity-gate.test.cjs', 'cm-continuity-session.test.cjs',
  'cm-continuity-window.test.cjs', 'cm-continuity-admission.test.cjs',
  'cm-continuity-owner.test.cjs', 'cm-checkpoint-c2.cjs', 'cm-checkpoint-c2.test.cjs',
  'cm-resident-supervisor.cjs', 'cm-resident.test.cjs',
  'cm-x-read.cjs', 'cm-x-open.cjs', 'cm-x-search.cjs', 'cm-probe.cjs', 'cm-signals.cjs',
  'cm-verify-by-phrase.cjs',
  'gov-interagent-routing.test.cjs',
];
const ALLOW_SET = new Set(ALLOW);

function resolveTool(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('EMPTY_TOOL_NAME');
  const file = n.endsWith('.cjs') ? n : n + '.cjs';
  if (!ALLOW_SET.has(file)) throw new Error('TOOL_NOT_CM_OWNED:' + file);
  const p = path.join(TOOL_ROOT, file);
  if (!fs.existsSync(p)) throw new Error('TOOL_NOT_FOUND:' + p);
  return p;
}

function toolPaths() {
  return {
    CM_ROOT, WCORE_ROOT, TOOL_ROOT,
    cwd_independent: true,
    resolution: 'EXPLICIT_FROM_LAUNCHER_DIRNAME',
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--list') {
    console.log(JSON.stringify({ tools: ALLOW, ...toolPaths() }, null, 1));
    process.exit(0);
  }
  if (argv[0] === '--self-check' || !argv.length) {
    const results = ALLOW.map((f) => {
      const p = path.join(TOOL_ROOT, f);
      return { tool: f, resolves: fs.existsSync(p) };
    });
    const missing = results.filter((r) => !r.resolves);
    console.log(JSON.stringify({
      CM_COLD_START_PATHS_RESOLVE: missing.length === 0 ? 'PASS' : 'FAIL',
      ...toolPaths(),
      checked: results.length,
      missing: missing.map((m) => m.tool),
    }, null, 1));
    process.exit(missing.length === 0 ? 0 : 1);
  }
  let toolPath;
  try { toolPath = resolveTool(argv[0]); } catch (e) {
    console.error(JSON.stringify({ error: String(e.message), tool: argv[0] }));
    process.exit(2);
  }
  const r = spawnSync(process.execPath, [toolPath, ...argv.slice(1)], { stdio: 'inherit', cwd: process.cwd() });
  process.exit(r.status === null ? 1 : r.status);
}

module.exports = { resolveTool, toolPaths, ALLOW };
