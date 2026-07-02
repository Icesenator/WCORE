const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function extractFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = sourceText.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < sourceText.length; i++) {
    if (sourceText[i] === '{') depth++;
    if (sourceText[i] === '}') depth--;
    if (depth === 0) return sourceText.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const autoHeal = read('src/16B_AUTO_HEAL.gs');
const bitpanda = read('src/35_BITPANDA_SYNC.gs');
const activity = read('src/27_ACTIVITY_REFRESH.gs');

if (!autoHeal.includes('cexManualQueue')) {
  throw new Error('Auto-heal trigger spec must be bumped for queued manual CEX refreshes');
}

if (!autoHeal.includes('ScriptApp.newTrigger("CEX_HOURLY_REFRESH").timeBased().everyHours(4).create()')) {
  throw new Error('CEX auto refresh trigger must run every 4 hours (closest GAS cadence under the 5h watchdog stale threshold)');
}

if (autoHeal.includes('ScriptApp.newTrigger("BITPANDA_REFRESH_WATCHDOG")') || /required = \[[^\]]*BITPANDA_REFRESH_WATCHDOG/.test(autoHeal)) {
  throw new Error('Auto-heal must not install or require BITPANDA_REFRESH_WATCHDOG; manual CEX refreshes are direct-only');
}

const cleanupBody = extractFunction(autoHeal, 'WCORE_CEX_TRIGGER_CLEANUP_FORCE');
if (cleanupBody.includes('WCORE_AUTO_HEAL(')) {
  throw new Error('WCORE_CEX_TRIGGER_CLEANUP_FORCE must not call full WCORE_AUTO_HEAL; it times out in listing/hyperlink maintenance');
}
if (!cleanupBody.includes('MASTER_ON_EDIT') || !cleanupBody.includes('CEX_HOURLY_REFRESH')) {
  throw new Error('WCORE_CEX_TRIGGER_CLEANUP_FORCE must reinstall MASTER_ON_EDIT and CEX_HOURLY_REFRESH directly');
}
if (!cleanupBody.includes('everyHours(4)')) {
  throw new Error('WCORE_CEX_TRIGGER_CLEANUP_FORCE must reinstall CEX_HOURLY_REFRESH every 4 hours');
}
const cexTriggerList = bitpanda.slice(
  bitpanda.indexOf('var _BP_CEX_TRIGGERS_TO_HEAL'),
  bitpanda.indexOf('var _BP_CEX_LEGACY_TRIGGERS_TO_DELETE')
);
for (const legacy of ['BINANCE_REFRESH_WATCHDOG', 'BITFINEX_REFRESH_WATCHDOG', 'BYBIT_REFRESH_WATCHDOG']) {
  if (cexTriggerList.includes(legacy)) {
    throw new Error(`CEX onEdit self-heal must not recreate legacy ${legacy} pollers`);
  }
}
if (cexTriggerList.includes('BITPANDA_REFRESH_WATCHDOG')) {
  throw new Error('CEX onEdit self-heal must not recreate BITPANDA_REFRESH_WATCHDOG');
}
if (!cexTriggerList.includes('CEX_HOURLY_REFRESH')) {
  throw new Error('CEX onEdit self-heal must keep only the hourly CEX refresh trigger');
}

const activityBody = extractFunction(activity, 'ACTIVITY_WATCHDOG');
if (activityBody.includes('BITPANDA_REFRESH_WATCHDOG')) {
  throw new Error('ACTIVITY_WATCHDOG must not call the CEX watchdog; it duplicates CEX polling under wallet load');
}
const refresh = read('src/16_REFRESH.gs');
const simpleOnEditBody = extractFunction(refresh, 'onEdit');
if (simpleOnEditBody.includes('WCORE_ON_EDIT')) {
  throw new Error('Simple onEdit must not call WCORE_ON_EDIT; installable MASTER_ON_EDIT owns edit handling');
}
const baseEngine = read('src/10A_BASE_ENGINE.gs');
if (!baseEngine.includes('BaseEngine.cexBusyStatus')) {
  throw new Error('BaseEngine must expose cexBusyStatus to block wallet live scans during manual CEX work');
}
for (const file of ['src/11_EVM_ENGINE.gs', 'src/14_SVM_ENGINE.gs', 'src/15_COSMOS_ENGINE.gs']) {
  const body = read(file);
  if (!body.includes('BaseEngine.cexBusyStatus')) {
    throw new Error(`${file} must call BaseEngine.cexBusyStatus before live refresh scans`);
  }
}
if (!bitpanda.includes('CEX_MANUAL_ACTIVE_UNTIL_MS')) {
  throw new Error('Manual CEX queue must set CEX_MANUAL_ACTIVE_UNTIL_MS while jobs are pending/running');
}
const syncJ1Body = extractFunction(refresh, 'SYNC_J1_ALL_SHEETS');
if (syncJ1Body.includes('WCORE_AUTO_HEAL')) {
  throw new Error('SYNC_J1_ALL_SHEETS must not run auto-heal; it turns lightweight sync into trigger churn');
}

if (!bitpanda.includes('function CEX_QUEUE_OR_MARK_MANUAL_JOB(')) {
  throw new Error('Missing shared queue helper for manual CEX refreshes');
}

// v4.15.114: worker must hold a lease so two one-shot instances never dequeue concurrently.
const workerBody = extractFunction(bitpanda, 'CEX_MANUAL_REFRESH_WORKER');
if (!workerBody.includes('_cexWorkerAcquireLease_') || !workerBody.includes('_cexWorkerReleaseLease_')) {
  throw new Error('CEX_MANUAL_REFRESH_WORKER must acquire/release the worker lease to prevent concurrent queue read-modify-write');
}
if (!bitpanda.includes('CEX_WORKER_LEASE')) {
  throw new Error('Missing CEX_WORKER_LEASE property lease for the manual CEX worker');
}

// v4.15.114: multi-job clicks (Z1, AC2) must enqueue in ONE batch (single trigger ensure),
// not N per-job CEX_QUEUE_MANUAL_JOB calls (each redoing getProjectTriggers+delete+create).
const bpOnEditBody = extractFunction(bitpanda, 'BITPANDA_ON_EDIT');
if (!bpOnEditBody.includes('_cexEnqueueManualJobs_')) {
  throw new Error('BITPANDA_ON_EDIT must use batch _cexEnqueueManualJobs_ for Z1/AC2 multi-job clicks');
}
if (bpOnEditBody.includes('CEX_QUEUE_MANUAL_JOB(')) {
  throw new Error('BITPANDA_ON_EDIT must not enqueue jobs one by one; use _cexEnqueueManualJobs_');
}
const enqueueBody = extractFunction(bitpanda, '_cexEnqueueManualJobs_');
const ensureCount = (enqueueBody.match(/_cexEnsureManualWorkerTrigger_\(/g) || []).length;
if (ensureCount !== 1) {
  throw new Error('_cexEnqueueManualJobs_ must ensure the worker trigger exactly once per batch');
}

// v4.15.114: transient failures (Spreadsheets timeout, quota, BUSY) must requeue
// the job with a bounded retry counter instead of leaving a dead ERROR in B1.
const runJobBody = extractFunction(bitpanda, '_cexRunManualJob_');
if (!runJobBody.includes('_cexIsTransientResult_') || !runJobBody.includes('_cexRequeueManualJob_')) {
  throw new Error('_cexRunManualJob_ must requeue transient failures (Spreadsheets timeout / quota / BUSY)');
}
if (!runJobBody.includes('_CEX_MANUAL_JOB_MAX_RETRIES')) {
  throw new Error('Transient CEX job retries must be bounded by _CEX_MANUAL_JOB_MAX_RETRIES');
}
const transientBody = extractFunction(bitpanda, '_cexIsTransientResult_');
if (!transientBody.includes('timed out') || !transientBody.includes('BUSY')) {
  throw new Error('_cexIsTransientResult_ must cover Spreadsheets timeouts and BUSY lock collisions');
}

// v4.15.116: the worker must DRAIN the queue within a time budget (one job per
// one-shot run = 10-20 min for an AC2 click, because GAS one-shot triggers fire
// with ~1 min granularity).
if (!bitpanda.includes('_CEX_WORKER_BUDGET_MS')) {
  throw new Error('CEX_MANUAL_REFRESH_WORKER must drain jobs within a time budget (_CEX_WORKER_BUDGET_MS)');
}
if (!workerBody.includes('while')) {
  throw new Error('CEX_MANUAL_REFRESH_WORKER must loop over queued jobs instead of running a single job per run');
}

// v4.15.116: [BUSY:CEX] in I1 must be re-pulsed by the watchdog, otherwise the
// sheet freezes forever (unparseable I1 -> needsPulse:false).
const needsRefreshBody = extractFunction(refresh, '_wd_needsRefresh_');
if (!needsRefreshBody.includes('[BUSY:CEX]')) {
  throw new Error('_wd_needsRefresh_ must re-pulse sheets left in [BUSY:CEX] state');
}

// v4.15.118: a 1-min recurring trigger is the only reliable way to drain the
// queue — GAS one-shot triggers fire with ~1 min granularity and miss in
// saturation windows.
if (!autoHeal.includes('ScriptApp.newTrigger("CEX_MANUAL_REFRESH_WORKER").timeBased().everyMinutes(1)')) {
  throw new Error('Auto-heal must install a 1-min recurring CEX_MANUAL_REFRESH_WORKER trigger as a safety net');
}
if (!cleanupBody.includes('CEX_MANUAL_REFRESH_WORKER')) {
  throw new Error('WCORE_CEX_TRIGGER_CLEANUP_FORCE must reinstall the 1-min CEX_MANUAL_REFRESH_WORKER safety net');
}
if (!cexTriggerList.includes('CEX_MANUAL_REFRESH_WORKER')) {
  throw new Error('Self-heal CEX trigger list must keep the 1-min CEX_MANUAL_REFRESH_WORKER safety net');
}

const bitpandaWatchdog = extractFunction(bitpanda, 'BITPANDA_REFRESH_WATCHDOG');
if (!bitpandaWatchdog.includes('LEGACY_DISABLED') || bitpandaWatchdog.includes('UPDATE_BITPANDA')) {
  throw new Error('BITPANDA_REFRESH_WATCHDOG must be disabled; manual CEX refreshes must not depend on a poller');
}

const onEditFiles = {
  'src/36_BINANCE_SYNC.gs': ['BINANCE_ON_EDIT', 'BINANCE', 'UPDATE_BINANCE_SPOT'],
  'src/37_BITFINEX_SYNC.gs': ['BITFINEX_ON_EDIT', 'BITFINEX', 'UPDATE_BITFINEX_SPOT'],
  'src/38_BYBIT_SYNC.gs': ['BYBIT_ON_EDIT', 'BYBIT', 'UPDATE_BYBIT_SPOT'],
  'src/39_COINBASE_SYNC.gs': ['COINBASE_ON_EDIT', 'COINBASE', 'UPDATE_COINBASE_SPOT'],
  'src/40_OKX_SYNC.gs': ['OKX_ON_EDIT', 'OKX', 'UPDATE_OKX_SPOT'],
};

for (const [file, [fnName, label, updateFn]] of Object.entries(onEditFiles)) {
  const src = read(file);
  const body = extractFunction(src, fnName);
  if (!body.includes('CEX_QUEUE_OR_MARK_MANUAL_JOB')) {
    throw new Error(`${fnName} must queue manual refresh work instead of running it inside onEdit`);
  }
  if (!body.includes(`"${label}"`) || !body.includes(updateFn)) {
    throw new Error(`${fnName} queued refresh must pass label ${label} and ${updateFn}`);
  }
  const firstTriggerGuard = body.indexOf('!e.triggerUid');
  const directIdx = body.indexOf('CEX_QUEUE_OR_MARK_MANUAL_JOB');
  const simpleGuardBlock = body.slice(firstTriggerGuard, directIdx < 0 ? body.length : directIdx);
  if (firstTriggerGuard < 0 || firstTriggerGuard > directIdx || !simpleGuardBlock.includes('range.setValue(false)')) {
    throw new Error(`${fnName} must reset the checkbox in simple onEdit, then skip queuing until installable MASTER_ON_EDIT`);
  }
  const queueCallIdx = body.indexOf('CEX_QUEUE_OR_MARK_MANUAL_JOB');
  const updateCallIdx = body.indexOf(`${updateFn}(`);
  if (updateCallIdx >= 0 && updateCallIdx < queueCallIdx) {
    throw new Error(`${fnName} must not call ${updateFn} directly inside onEdit`);
  }
  if (body.includes('_bpEnsureCexTriggers_')) {
    throw new Error(`${fnName} must not reinstall triggers during a manual CEX click`);
  }
}

const legacyWatchdogs = {
  'src/36_BINANCE_SYNC.gs': 'BINANCE_REFRESH_WATCHDOG',
  'src/37_BITFINEX_SYNC.gs': 'BITFINEX_REFRESH_WATCHDOG',
  'src/38_BYBIT_SYNC.gs': 'BYBIT_REFRESH_WATCHDOG',
};
for (const [file, fnName] of Object.entries(legacyWatchdogs)) {
  const body = extractFunction(read(file), fnName);
  if (!body.includes('LEGACY_DISABLED') || body.includes('UPDATE_')) {
    throw new Error(`${fnName} must be disabled; central BITPANDA_REFRESH_WATCHDOG owns queued CEX refreshes`);
  }
}

console.log('CEX refresh load guard OK');
