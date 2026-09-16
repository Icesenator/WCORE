'use strict';
// CM/scripts/cold-start-canary.cjs - CANARI D'ACCEPTATION du nouvel agent WCORE/CM.
// Simule exactement ce que doit faire un agent au cold-start, depuis un project root K:\ProjetIA\WCORE\CM.
// AUCUNE creation de session OpenCode, AUCUN reseau, AUCUN effet de bord sur X ou le produit.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveTool, toolPaths } = require('./cm-run.cjs');

const CM_ROOT = path.resolve(__dirname, '..');
const out = { owner: 'WCORE_CM_COLD_START_CANARY', at: new Date().toISOString() };
const must = [];
function readOrNull(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }

// 1) sources canoniques
const sources = ['AGENTS.md', 'ROADMAP.md', 'review-context.md', 'HANDOFF.md', 'INTERFACE.md', 'OWNERSHIP-MANIFEST.md'];
out.canonical_sources = sources.map((s) => {
  const t = readOrNull(path.join(CM_ROOT, s));
  return { file: s, present: t !== null, bytes: t ? Buffer.byteLength(t, 'utf8') : 0 };
});
const missing = out.canonical_sources.filter((s) => !s.present).map((s) => s.file);
out.CM_COLD_START_SOURCES_OK = missing.length === 0;
if (missing.length) must.push('MISSING_SOURCES:' + missing.join(','));

// 2) chemins tooling
out.tooling = toolPaths();
let selfCheck = null;
try {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'cm-run.cjs'), '--self-check'], { encoding: 'utf8' });
  selfCheck = JSON.parse(r.stdout || '{}');
} catch (e) { selfCheck = { CM_COLD_START_PATHS_RESOLVE: 'FAIL', error: String(e.message) }; }
out.CM_COLD_START_PATHS_RESOLVE = selfCheck.CM_COLD_START_PATHS_RESOLVE;

// 3) frontiere + queue (via le module CM-owned, resolu explicitement)
let B = null;
try { B = require(resolveTool('cm-boundary.cjs')); } catch (e) { must.push('BOUNDARY_LOAD_FAILED:' + e.message); }
let queue = [];
if (B) {
  queue = B.readCmQueue();
  out.ROOT_ROADMAP_IS_WORK_QUEUE = B.ROOT_ROADMAP_IS_WORK_QUEUE;
  out.ROOT_PRODUCT_TASK_SELECTION_ALLOWED = B.ROOT_PRODUCT_TASK_SELECTION_ALLOWED;
  out.queue = queue.map((i) => i.id + ':' + i.status);
  out.CM_COLD_START_WC01_VISIBLE = queue.some((i) => i.id === 'WC-01');
  out.CM_COLD_START_P1_GOV_VISIBLE = queue.some((i) => i.id === 'P1-GOV-CM-PERSISTENT-OWNER');
  out.CM_COLD_START_ROOT_PRODUCT_VISIBLE_AS_WORK = queue.some((i) => B.isCmWorkItem(i.id) === false);
  out.non_cm_in_queue = queue.filter((i) => B.isCmWorkItem(i.id) === false).map((i) => i.id);
  out.CM_COLD_START_BOUNDARY = (out.ROOT_ROADMAP_IS_WORK_QUEUE === false
    && out.CM_COLD_START_WC01_VISIBLE === true
    && out.CM_COLD_START_P1_GOV_VISIBLE === true
    && out.CM_COLD_START_ROOT_PRODUCT_VISIBLE_AS_WORK === false) ? 'PASS' : 'FAIL';
} else {
  out.CM_COLD_START_WC01_VISIBLE = false;
  out.CM_COLD_START_P1_GOV_VISIBLE = false;
  out.CM_COLD_START_ROOT_PRODUCT_VISIBLE_AS_WORK = false;
  out.CM_COLD_START_BOUNDARY = 'FAIL';
}

// 4) tests bootstrap pertinents (executes depuis le cwd courant, sans dependance cwd)
const TESTS = [
  'cm-boundary.test.cjs', 'cm-turn-end-guard.test.cjs',
  'cm-discovery-validate.test.cjs', 'cm-discovery-qualify.test.cjs',
  'cm-continuity-child-guard.test.cjs',
];
out.tests = TESTS.map((t) => {
  const r = spawnSync(process.execPath, [resolveTool(t)], { encoding: 'utf8' });
  const s = (r.stdout || '') + (r.stderr || '');
  return { test: t, exit: r.status, all_pass: /ALL PASS/.test(s) || /\b0 fail\b/.test(s) };
});
out.CM_COLD_START_TOOLING = out.tests.every((t) => t.exit === 0 && t.all_pass) ? 'PASS' : 'FAIL';

// 5) invariants
out.CM_COLD_START_PROJECT_ROOT = CM_ROOT;
out.CM_COLD_START_CANARY = (out.CM_COLD_START_SOURCES_OK && out.CM_COLD_START_PATHS_RESOLVE === 'PASS'
  && out.CM_COLD_START_BOUNDARY === 'PASS' && out.CM_COLD_START_TOOLING === 'PASS' && must.length === 0) ? 'PASS' : 'FAIL';
out.blocking = must;
out.CM_NEW_VISIBLE_SESSION_CREATED_BY_PREPARATION = false;
out.publication = 'NONE';

console.log(JSON.stringify(out, null, 1));
process.exit(out.CM_COLD_START_CANARY === 'PASS' ? 0 : 1);
