const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');

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

const onEditBody = extractFunction(source, 'BITPANDA_ON_EDIT');
const hourlyBody = extractFunction(source, 'CEX_HOURLY_REFRESH');
if (!hourlyBody.includes('!== "BUSY"') || !hourlyBody.includes('Utilities.sleep')) {
  throw new Error('CEX_HOURLY_REFRESH must retry each connector on BUSY (shared script lock collision)');
}

// v4.15.109: each CEX connector must use the per-connector lock, not the shared
// global LockService.getScriptLock() that the 1-min watchdog keeps held.
const cexFiles = {
  '35_BITPANDA_SYNC.gs': 'BITPANDA',
  '36_BINANCE_SYNC.gs': 'BINANCE',
  '37_BITFINEX_SYNC.gs': 'BITFINEX',
  '38_BYBIT_SYNC.gs': 'BYBIT',
  '39_COINBASE_SYNC.gs': 'COINBASE',
  '40_OKX_SYNC.gs': 'OKX',
};
for (const [file, name] of Object.entries(cexFiles)) {
  const src = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  if (!src.includes(`CEX_ACQUIRE_LOCK("${name}")`) || !src.includes(`CEX_RELEASE_LOCK("${name}")`)) {
    throw new Error(`${file} must use the per-connector CEX lock for ${name}`);
  }
  if (/UPDATE_[A-Z_]*SPOT[\s\S]{0,80}getScriptLock/.test(src) && !src.includes('CEX_ACQUIRE_LOCK')) {
    throw new Error(`${file} still uses the shared global ScriptLock in an UPDATE_*_SPOT`);
  }
}
if (!source.includes('function CEX_ACQUIRE_LOCK(') || !source.includes('function CEX_RELEASE_LOCK(')) {
  throw new Error('CEX_ACQUIRE_LOCK / CEX_RELEASE_LOCK helpers must exist in 35_BITPANDA_SYNC.gs');
}
const requestBody = extractFunction(source, 'CEX_SET_MANUAL_REQUEST');
const watchdogBody = extractFunction(source, 'BITPANDA_REFRESH_WATCHDOG');

if (!source.includes('function _bpRunActionRebalancingRefreshDirect_(')) {
  throw new Error('Missing direct Action Rebalancing refresh helper');
}

if (!onEditBody.includes('cell === "Z1"') || !onEditBody.includes('name === "Action Rebalancing"')) {
  throw new Error('BITPANDA_ON_EDIT must special-case Action Rebalancing!Z1');
}

if (!onEditBody.includes('e.triggerUid')) {
  throw new Error('Action Rebalancing!Z1 direct refresh must require an installable trigger event');
}

if (!source.includes('function CEX_MANUAL_REFRESH_WORKER(') || !source.includes('function CEX_QUEUE_MANUAL_JOB(')) {
  throw new Error('Manual heavy refreshes must use one-shot CEX worker jobs');
}

// v4.15.114: Z1/AC2 use a single batch enqueue (_cexEnqueueManualJobs_) instead of
// per-job CEX_QUEUE_MANUAL_JOB calls (each redoing getProjectTriggers+delete+create).
if (!onEditBody.includes('_cexEnqueueManualJobs_')) {
  throw new Error('Action Rebalancing!Z1 / AC2 must batch-enqueue jobs via _cexEnqueueManualJobs_');
}
if (!onEditBody.includes('kind: "TOP_MARKETCAP"') || !onEditBody.includes('kind: "BITPANDA_STOCKS_FIAT"')) {
  throw new Error('Action Rebalancing!Z1 must queue Top Marketcap and Bitpanda Stocks/Fiat jobs instead of running them inside onEdit');
}

if (!source.includes('function _bpSetExternalRefreshStatus_(') || !onEditBody.includes('_bpSetExternalRefreshStatus_(sheet')) {
  throw new Error('External refresh checkboxes must write visible status next to the checkbox');
}

// v4.15.115: AC2 refreshes Bitpanda CRYPTO only (no CEX - Bitpanda Fiat update needed).
for (const kind of ['BITPANDA_CRYPTO', 'BINANCE', 'BITFINEX', 'BYBIT', 'COINBASE', 'OKX']) {
  if (!onEditBody.includes(`kind: "${kind}"`)) {
    throw new Error(`Portefeuille Crypto!AC2 must queue ${kind} instead of running it inside onEdit`);
  }
}
if (onEditBody.includes('kind: "BITPANDA_CRYPTO_FIAT"')) {
  throw new Error('Portefeuille Crypto!AC2 must not refresh CEX - Bitpanda Fiat (crypto bucket only)');
}

if (source.includes('"AC1": BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP') || !source.includes('"AC2": BITPANDA_SYNC_CONFIG.CRYPTO_CEX_REFRESH_FLAG_PROP')) {
  throw new Error('Portefeuille Crypto CEX refresh checkbox must be AC2 only');
}

if (!source.includes('function _bpGetManagedSheetRefreshPlan_(')) {
  throw new Error('Missing Bitpanda managed-sheet refresh plan helper');
}

if (!onEditBody.includes('CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, refreshFlagProp')) {
  throw new Error('Bitpanda CEX A1 clicks must use the same queue helper as every other CEX');
}

const bitpandaSimpleGuardIdx = onEditBody.indexOf('!e.triggerUid');
const bitpandaDirectIdx = onEditBody.indexOf('CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, refreshFlagProp');
if (bitpandaSimpleGuardIdx < 0 || bitpandaSimpleGuardIdx > bitpandaDirectIdx) {
  throw new Error('BITPANDA_ON_EDIT must skip simple onEdit before queuing manual refresh work');
}

if (onEditBody.includes('_bpEnsureCexTriggers_')) {
  throw new Error('BITPANDA_ON_EDIT must not reinstall triggers during a manual CEX click');
}

for (const expected of ['UPDATE_BITPANDA_CRYPTO_FIAT', 'UPDATE_BITPANDA_STOCKS_FIAT', 'UPDATE_BITPANDA_SPOT']) {
  if (!source.includes(expected)) {
    throw new Error(`Bitpanda direct managed-sheet refresh must be able to call ${expected}`);
  }
}

if (!onEditBody.includes('_bpSetRefreshFlag_(refreshFlagProp)')) {
  throw new Error('Action Rebalancing!Z1 must keep watchdog fallback flag behavior');
}

const sheetRequestIdx = requestBody.indexOf('_bpSetSheetRequestFlag_(sheet)');
const propRequestIdx = requestBody.indexOf('_bpSetRefreshFlag_(refreshFlagProp)');
if (sheetRequestIdx < 0 || propRequestIdx < 0 || sheetRequestIdx > propRequestIdx) {
  throw new Error('CEX_SET_MANUAL_REQUEST must write visible B1 request before PropertiesService flag');
}

if (!watchdogBody.includes('LEGACY_DISABLED') || watchdogBody.includes('UPDATE_BITPANDA')) {
  throw new Error('BITPANDA_REFRESH_WATCHDOG must be disabled; manual CEX refreshes are direct-only');
}

console.log('Action Rebalancing direct refresh guard OK');
