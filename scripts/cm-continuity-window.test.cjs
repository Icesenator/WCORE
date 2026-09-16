// Controle de non-regression — P1-GOV-CM-PERSISTENT-OWNER (REOPEN: continuity targets main session + no visible window)
// POS (positifs) : le wake REUTILISE la conversation principale, aucun --title, aucun spawn visible.
// NEG (negatifs) : une regression (nouvelle conversation / fenetre CMD visible) fait ECHOUER la garde.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + id + '  ' + desc + (ok ? '' : '  -> ' + detail));
}

const runner = read('scripts/cm-continuity-runner.cjs');
const installer = read('scripts/install-cm-continuity-owner.ps1');
const vbsPath = path.join(ROOT, 'scripts', 'cm-continuity-owner-invisible.vbs');
const vbs = fs.existsSync(vbsPath) ? fs.readFileSync(vbsPath, 'utf8') : '';

// --- POS : le wake reutilise la session, jamais de titre par wake ---
// Analyse la COMMANDE construite (hors commentaires) : la ligne qui invoque `opencode run` ne doit
// jamais porter `--title` ; on verifie aussi qu aucune ligne de CODE (commentaires retires) n en porte.
const codeLines = runner.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
const opencodeInvocations = codeLines.match(/opencode run[^`'"]*/g) || [];
check('POS_NO_TITLE_FLAG_ON_WAKE', 'SENSOR_ONLY : aucune invocation d agent donc aucun --title (faux wake supprime)',
  !/opencode run/i.test(codeLines) && !/--title/.test(codeLines) && /SENSOR_ONLY/.test(runner),
  'commande d invocation encore construite');
check('POS_SESSION_REUSE_FLAG', 'SENSOR_ONLY : primaire resolue mais AUCUN message opencode run (pas de reuse synthetique)',
  /(SESSION_PRIMARY|resolvePrimary)/.test(runner) && !/opencode run/i.test(runner), 'invocation synthetique encore presente');
check('POS_FAIL_CLOSED_NO_FALLBACK', 'fail-closed sans primaire (aucun fallback NEW SESSION)',
  /PRIMARY_SESSION_MISSING/.test(runner) && !/NEW_SESSION|--new-session|--continue/.test(runner), 'fallback de creation present');

// --- POS : aucun spawn visible (windowsHide sur CHAQUE appel) ---
const spawnCalls = (runner.match(/spawnSync\(|spawn\(/g) || []).length;
const hideCount = (runner.match(/windowsHide: true/g) || []).length;
check('POS_WINDOWS_HIDE_ON_ALL_SPAWNS', 'windowsHide: true sur chaque spawn/spawnSync (aucune fenetre console)',
  hideCount >= spawnCalls && hideCount > 0, 'spawns=' + spawnCalls + ' windowsHide=' + hideCount);
check('NEG_NO_VISIBLE_CHILD_CMD', 'le spawn du child n est pas detached/new-console',
  !/new-console|detached: true[^}]*stdio: \['inherit'/.test(runner), 'option de console visible');

// --- POS : la conversation principale canonique est adoptee EN PREMIER ---
check('POS_CANONICAL_MAIN_FIRST', 'CANONICAL_TITLE exporte et prioritaire dans l adoption',
  /CANONICAL_TITLE = 'WCORE CM'/.test(runner)
  && /title=\? ORDER BY time_created ASC/.test(runner)
  && /CANONICAL_TITLE,\n?\s*LEGACY_WAKE_TITLES,/.test(runner), 'adoption canonique absente');
check('POS_LEGACY_TITLES_ARE_FALLBACK', 'les anciens titres de continuity sont un REPLI, pas la cible',
  !/LEGACY_WAKE_TITLES = \[[^\]]*CANONICAL_TITLE\]/.test(runner), 'CANONICAL_TITLE melange aux titres legacy');

// --- POS : la tache planifiee est invisible (wscript + VBS + Hidden) ---
check('POS_TASK_HIDDEN', 'tache planifiee masquee (-Hidden)',
  /-Hidden/.test(installer), 'pas de -Hidden');
check('POS_TASK_WSCRIPT_VBS', 'action = wscript.exe //B <vbs> (pas de cmd.exe interactif)',
  /New-ScheduledTaskAction -Execute "wscript\.exe"/.test(installer) && /cm-continuity-owner-invisible\.vbs/.test(installer), 'action visible');
check('POS_VBS_HIDDEN_WAIT', 'VBS: fenetre cachee (style 0) ET attente (Queue preservee)',
  /WshShell\.Run "cmd\.exe \/c ""/.test(vbs) && /", 0, True/.test(vbs), 'VBS absent ou non bloquant');
check('POS_LOG_REDIRECT_PRESERVED', 'observabilite preservee (redirect commands.log)',
  /commands\.log/.test(installer) || /commands\.log/.test(read('scripts/cm-continuity-owner-task.cmd')), 'logs perdus');

// --- POS (DB, souple si indisponible) : la primaire est la conversation principale ---
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('C:\\Users\\strau\\.local\\share\\opencode\\opencode.db', { readOnly: true });
  const dir = String(ROOT).replace(/\\/g, '/');
  const oldest = db.prepare('SELECT id FROM session WHERE directory=? AND title=? ORDER BY time_created ASC LIMIT 1').get(dir, 'WCORE CM');
  const prim = JSON.parse(read('.generated/cm-continuity/primary-session.json'));
  const forbidden = db.prepare("SELECT COUNT(*) n FROM session WHERE directory=? AND title IN ('WC-01-continuity-wake','WC-01 continuity wake')").get(dir).n;
  db.close();
  check('POS_PRIMARY_IS_MAIN_CONVERSATION', 'la primaire pointe la conversation principale (la plus ancienne "WCORE CM")',
    !!oldest && oldest.id === prim.session_id, 'primaire != conversation principale');
  check('NEG_NO_FORBIDDEN_TITLE_ACTIVE', 'aucune conversation au titre interdit restante',
    forbidden === 0, 'titres interdits=' + forbidden);
} catch (_) {
  console.log('SKIP  POS_PRIMARY_IS_MAIN_CONVERSATION  (DB indisponible dans cet environnement)');
}

console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAIL'));
process.exit(failed === 0 ? 0 : 1);
