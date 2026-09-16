// Garde de non-regression — GARDE CHILD-SIDE de fraicheur X.
// P1-GOV-CM-PERSISTENT-OWNER, REOPEN_REASON=LONG_CHILD_BLOCKS_X_REFRESH.
// Cause prouvee : le resident parent attend le child via spawnSync ; pendant un child long il ne peut
// NI ticker NI appliquer X_REFRESH_SOFT_MS. Mesure reelle : gaps X 20,99 / 16,72 min > borne 15 min.
// Le controle doit donc etre porte par le CHILD.
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
const R = require(path.join(ROOT, 'scripts', 'cm-continuity-runner.cjs'));
const SRC = read('scripts/cm-continuity-runner.cjs');
const RES = read('scripts/cm-resident-supervisor.cjs');
const codeOnly = (s) => s.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
const MIN = 60 * 1000;
const T0 = Date.parse('2026-09-16T05:00:00.000Z');
const at = (min) => T0 + min * MIN;

check('GUARD_FUNCTION_EXISTS', 'childFreshnessBudget exportee + CLI --guard-check',
  typeof R.childFreshnessBudget === 'function' && /--guard-check/.test(SRC) && /CHILD_GUARD_CHECK/.test(SRC),
  'garde child-side absente');
check('GUARD_THRESHOLDS', 'seuil doux 12 min < borne dure 15 min, toutes deux exportees',
  R.CHILD_X_SOFT_MS === 12 * MIN && R.CHILD_X_HARD_MS === 15 * MIN,
  JSON.stringify({ soft: R.CHILD_X_SOFT_MS, hard: R.CHILD_X_HARD_MS }));

// 1) Un child long doit rafraichir AVANT 15 min.
check('LONG_NON_CM_CHILD_REFRESHES_X_BEFORE_15MIN',
  'age 13 min => REFRESH_X_NOW (le child ne peut pas continuer son travail non-CM)',
  R.childFreshnessBudget(at(0), at(13), 0).must_refresh === true
    && R.childFreshnessBudget(at(0), at(13), 0).action === 'REFRESH_X_NOW',
  JSON.stringify(R.childFreshnessBudget(at(0), at(13), 0)));

// 2) Une micro-etape ne peut JAMAIS franchir la borne dure.
check('NON_CM_MICROSTEP_CANNOT_CROSS_HARD_X_BOUND',
  'age 6 min + budget 10 min => projetee 16 min > 15 => REFRESH_X_NOW (PROJECTED_TO_CROSS_HARD)',
  (() => { const b = R.childFreshnessBudget(at(0), at(6), 10 * MIN);
    return b.must_refresh === true && b.reason === 'PROJECTED_TO_CROSS_HARD' && b.projected_age_min > 15; })(),
  JSON.stringify(R.childFreshnessBudget(at(0), at(6), 10 * MIN)));

// 3) Seuil doux : preemption DANS le child (avant la borne dure).
check('SOFT_X_THRESHOLD_PREEMPTS_NON_CM_INSIDE_CHILD',
  'age 12 min (seuil doux) => REFRESH_X_NOW meme si budget 0',
  R.childFreshnessBudget(at(0), at(12), 0).must_refresh === true
    && R.childFreshnessBudget(at(0), at(12), 0).reason === 'AGE_AT_OR_ABOVE_SOFT',
  JSON.stringify(R.childFreshnessBudget(at(0), at(12), 0)));

// 4) Aucun stamp sans lecture X reelle.
check('REAL_X_READ_REQUIRED_BEFORE_X_OBSERVED',
  'la garde exige une vraie lecture + le resident ne peut JAMAIS avancer X_OBSERVED',
  /real_x_read_required: true/.test(SRC)
    && !/last_x_observation_at\s*=/.test(codeOnly(RES))
    && /hb\.last_x_observation_at\s*=/.test(SRC), 'X_OBSERVED avancable hors vraie lecture');

// 5) La progression non-X ne rafraichit pas X.
check('NON_X_PROGRESS_CANNOT_REFRESH_X',
  'seul --x-observed ecrit last_x_observation_at ; ni heartbeat ni self-mark ni discovery',
  (() => {
    const hb = codeOnly(SRC).split(/\r?\n/).filter((l) => /last_x_observation_at\s*=/.test(l));
    return hb.length === 1 && /hb\.last_x_observation_at/.test(hb[0]);
  })(), 'plusieurs writers de X_OBSERVED');

// 6) CM du => preemption du non-CM.
check('CM_GATE_PREEMPTS_CURRENT_NON_CM_WORK',
  'couverture CM due => le child suspend le non-CM (must_refresh)',
  R.childFreshnessBudget(at(0), at(16), 0).must_refresh === true
    && R.childFreshnessBudget(at(0), at(16), 0).resume_after_refresh === true,
  JSON.stringify(R.childFreshnessBudget(at(0), at(16), 0)));

// 7) Aucune action publique sans gate.
check('NO_PUBLIC_ACTION_WITHOUT_GATE',
  'le runner de gate reste la seule voie de publication ; la garde ne publie rien',
  /NO_PUBLIC_ACTION_WITHOUT_GATE|publication: 'NONE'/.test(SRC)
    && !/postTweet|createTweet|tweet\(/i.test(codeOnly(SRC)), 'publication possible hors gate');

// 8) Meme conversation.
check('SAME_SESSION_PRESERVED',
  'aucune creation de session ; SESSION_PRIMARY seule cible',
  !/--title|--new-session|NEW_SESSION/.test(codeOnly(RES)) && /SESSION_PRIMARY/.test(RES),
  'session non preservee');

// 9) Single-flight.
check('SINGLE_FLIGHT_PRESERVED',
  'SENSOR_ONLY : le resident ne lance aucun child => single-flight trivialement preserve',
  !/spawnSync\(spawnCmd/.test(RES) && /SENSOR_ONLY/.test(RES), 'single-flight non garanti');

// 10) Aucun second child.
check('NO_SECOND_CHILD',
  'aucun spawn de child dans le resident (ni normal, ni breach)',
  (codeOnly(RES).match(/opencode run|'run',\s*'--session'/g) || []).length === 0, 'child encore lance');

// 11) Pas de boucle de refresh serree.
check('NO_TIGHT_REFRESH_LOOP',
  'la garde est un point de decision, pas une boucle : aucun while/polling',
  !/while\s*\(true\)/.test(codeOnly(SRC)) && !/setInterval\(/.test(codeOnly(SRC)),
  'boucle de refresh serree');

// --- SIMULATION CUMULEE : sans garde => violation ; avec garde => aucune fenetre > 15 min ---
const STEPS = 5;              // 5 micro-etapes non-CM
const STEP_MS = 4 * MIN;      // de 4 min chacune
function simulate(withGuard) {
  let age = 0, maxAge = 0, refreshes = 0;
  const windows = [];
  for (let i = 0; i < STEPS; i++) {
    if (withGuard) {
      const b = R.childFreshnessBudget(T0, T0 + age, STEP_MS);
      if (b.must_refresh) { refreshes++; windows.push(age); age = 0; }
    }
    age += STEP_MS;
    maxAge = Math.max(maxAge, age);
  }
  return { maxAgeMin: maxAge / MIN, refreshes, preRefreshAges: windows };
}
const noGuard = simulate(false);
const guarded = simulate(true);

check('PRE_FIX_SIMULATION_DEMONSTRATES_VIOLATION',
  'SANS garde : 5 micro-etapes de 4 min => age max 20 min > 15 (violation demontree)',
  noGuard.maxAgeMin > 15 && noGuard.refreshes === 0,
  JSON.stringify(noGuard));
check('POST_FIX_SIMULATION_NO_WINDOW_OVER_15',
  'AVEC garde : chaque micro-etape est budgtee => age max <= 15 ET au moins un refresh',
  guarded.maxAgeMin <= 15 && guarded.refreshes >= 1,
  JSON.stringify(guarded));


// --- Ledger de couverture (rend les depassements TRACABLES, donc non silencieux) ---
check('COVERAGE_LEDGER_FUNCTION_EXISTS', 'coverageLedgerEntry + readXObservationLedger exportees + CLI --coverage-ledger',
  typeof R.coverageLedgerEntry === 'function' && typeof R.readXObservationLedger === 'function' && /--coverage-ledger/.test(SRC),
  'ledger absent');
check('COVERAGE_LEDGER_RECORDS_GAP', 'entry porte prev_at/at/gap_min',
  (() => { const e = R.coverageLedgerEntry('2026-09-16T06:00:00.000Z', '2026-09-16T06:13:11.000Z');
    return e.gap_min === 13.18 || Math.abs(e.gap_min - 13.18) < 0.02; })(),
  JSON.stringify(R.coverageLedgerEntry('2026-09-16T06:00:00.000Z', '2026-09-16T06:13:11.000Z')));
check('COVERAGE_LEDGER_FLAGS_VIOLATION', 'gap 20 min => violation=true ; gap 13 min => violation=false',
  R.coverageLedgerEntry('2026-09-16T06:00:00.000Z', '2026-09-16T06:20:00.000Z').violation === true
  && R.coverageLedgerEntry('2026-09-16T06:00:00.000Z', '2026-09-16T06:13:00.000Z').violation === false,
  'violation mal classee');
check('COVERAGE_LEDGER_WRITTEN_ON_X_OBSERVED', '--x-observed alimente le ledger (aucun gap silencieux)',
  /appendXObservationLedger\(entry\)/.test(codeOnly(SRC)) && /X_LEDGER/.test(SRC), 'ledger non alimente');

// --- Regle durable WCORE-owned (AGENTS.md) ---
check('AGENTS_DURABLE_FRESHNESS_RULE', 'AGENTS.md (git-tracked) porte la regle child-side + capteur non-reveilleur',
  /CHILD_SIDE_FRESHNESS_GUARD=TRUE/.test(read('AGENTS.md'))
  && /SENSOR_CAN_WAKE_MODEL=FALSE/.test(read('AGENTS.md')), 'regle durable absente');
check('SENSOR_IS_NOT_AN_EXECUTOR', 'le capteur n execute pas le travail : aucun spawn + aucun message + mode explicite',
  /SENSOR_ONLY/.test(RES) && !/spawnSync\(spawnCmd/.test(RES) && /injected_message: false/.test(RES),
  'capteur presente comme executeur');
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAIL'));
process.exit(failed === 0 ? 0 : 1);
