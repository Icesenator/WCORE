// P2-OBS-CEX-QUEUE-LOCK-MISS — banc VM sur les fonctions reelles de
// 35_BITPANDA_SYNC.gs. Aucun CEX LIVE, aucun Spreadsheet LIVE.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', '35_BITPANDA_SYNC.gs'), 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const bodyStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`${name} not closed`);
}
function constNum(name) {
  const m = src.match(new RegExp(`var\\s+${name}\\s*=\\s*(\\d+)\\s*;`));
  assert.ok(m, `${name} must be defined`);
  return Number(m[1]);
}

const NAMES = ['_cexWithScriptLock_', '_cexQueueMutate_', '_cexEnqueueManualJobs_',
  'CEX_QUEUE_MANUAL_JOB', '_cexWriteManualQueuedStatusBatch_', '_bpFmtStamp_',
  '_bpGetSpreadsheet_', '_bpSetSheetStatus_', '_cexWriteManualEnqueueFailure_'];

function harness({ tryLockSequence = 'always-ok', setPropertyThrows = false, queue = null } = {}) {
  const propsMap = new Map();
  if (queue !== null) propsMap.set('CEX_MANUAL_JOB_QUEUE', queue);
  const cells = {};
  let lockCalls = 0;
  const ss = {
    getSheetByName: (n) => ({
      getRange: (c) => ({
        setValue: (v) => { cells[`${n}!${c}`] = String(v); return { setNumberFormat: () => {} }; },
        setNumberFormat: () => {},
        getDisplayValue: () => String(cells[`${n}!${c}`] || ''),
      }),
    }),
  };
  const ctx = {
    _CEX_LOCK_MAX_ATTEMPTS: constNum('_CEX_LOCK_MAX_ATTEMPTS'),
    _CEX_LOCK_RETRY_SLEEP_MS: constNum('_CEX_LOCK_RETRY_SLEEP_MS'),
    _CEX_LOCK_TRY_MS: constNum('_CEX_LOCK_TRY_MS'),
    _CEX_QUEUE_MAX_CHARS: constNum('_CEX_QUEUE_MAX_CHARS'),
    BITPANDA_SYNC_CONFIG: { SPREADSHEET_ID: 'TEST', SHEETS: { STOCKS: 'S', CRYPTO: 'C' } },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          lockCalls++;
          if (tryLockSequence === 'always-fail') return false;
          if (tryLockSequence === 'fail-once') return lockCalls > 1;
          if (tryLockSequence === 'fail-twice') return lockCalls > 2;
          return true;
        },
        releaseLock: () => {},
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propsMap.has(k) ? propsMap.get(k) : null),
        setProperty: (k, v) => { if (setPropertyThrows) throw new Error('storage unavailable'); propsMap.set(k, v); },
        deleteProperty: (k) => propsMap.delete(k),
      }),
    },
    Utilities: { sleep: () => {}, getUuid: () => 'uuid-' + (++lockCalls), formatDate: () => '2026-10-14 12:00:00' },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger: () => ({ timeBased: () => ({ after: () => ({ create: () => {} }) }) }),
    },
    Logger: { log: () => {} },
    // Extraction volontairement exclue : ne doit pas creer de trigger reel.
    _cexEnsureManualWorkerTrigger_: () => {},
    console,
  };
  vm.createContext(ctx);
  for (const n of NAMES) vm.runInContext(extractFunction(n), ctx);
  const queueValue = () => { try { return JSON.parse(propsMap.get('CEX_MANUAL_JOB_QUEUE') || '[]'); } catch (e) { return null; } };
  const enqueue = (jobs) => ctx._cexEnqueueManualJobs_(jobs);
  return { ctx, cells, propsMap, queueValue, enqueue, lockCalls: () => lockCalls };
}

const JOB = { kind: 'KRAKEN', sheetName: 'CEX - Kraken Crypto', refreshFlagProp: 'P', statusSheetName: 'Portefeuille Crypto', statusCell: 'V2' };

test('contention courte (1 tryLock rate) puis liberation : la mise en file aboutit', () => {
  const h = harness({ tryLockSequence: 'fail-once' });
  const out = h.enqueue([JOB]);
  assert.equal(out, 'QUEUED', 'une contention courte ne doit plus perdre le job manuel');
  assert.equal(h.queueValue().length, 1);
  assert.ok(h.lockCalls() > 1, 'le helper doit retenter');
});

test('contention courte de deux tentatives : absorbee dans la limite configuree', () => {
  const h = harness({ tryLockSequence: 'fail-twice' });
  assert.equal(h.enqueue([JOB]), 'QUEUED');
  assert.equal(h.queueValue().length, 1);
});

test('verrou durablement indisponible : fail-closed, aucun job, statut explicite (jamais QUEUED)', () => {
  const h = harness({ tryLockSequence: 'always-fail' });
  const out = h.enqueue([JOB]);
  assert.notEqual(out, 'QUEUED', 'un echec ne doit pas etre annonce comme mis en file');
  assert.equal(h.queueValue().length, 0, 'aucun job ne doit etre ecrit');
  const status = h.cells['Portefeuille Crypto!V2'];
  assert.ok(status && status.startsWith('ERROR '), 'un echec doit laisser un statut ERROR horodate explicite');
  assert.ok(/lock/i.test(status), 'le statut doit nommer la cause (verrou)');
});

test('file saturee : refus explicite, file preservee sans corruption', () => {
  const big = JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ kind: 'X' + i, pad: 'y'.repeat(200) })));
  assert.ok(big.length > constNum('_CEX_QUEUE_MAX_CHARS'), 'fixture doit depasser la limite');
  const h = harness({ queue: big });
  const out = h.enqueue([JOB]);
  assert.notEqual(out, 'QUEUED');
  assert.equal(h.propsMap.get('CEX_MANUAL_JOB_QUEUE'), big, 'la file existante doit rester intacte');
  assert.ok(String(h.cells['Portefeuille Crypto!V2'] || '').startsWith('ERROR '), 'saturation signalee a l operateur');
});

test('erreur de persistance : fail-closed, aucun QUEUED, aucune ecriture de statut de succes', () => {
  const h = harness({ setPropertyThrows: true });
  const out = h.enqueue([JOB]);
  assert.notEqual(out, 'QUEUED');
  assert.equal(h.propsMap.has('CEX_MANUAL_JOB_QUEUE'), false, 'aucune file ne doit etre persistee');
  assert.equal(h.propsMap.has('CEX_MANUAL_ACTIVE_UNTIL_MS'), false, 'aucun blocage on-chain ne doit etre pose');
  assert.ok(String(h.cells['Portefeuille Crypto!V2'] || '').startsWith('ERROR '), 'echec de persistance signale');
});

test('succes : un job mis en file, B1/V2 observables et horodates, pas de doublon', () => {
  const h = harness();
  assert.equal(h.enqueue([JOB]), 'QUEUED');
  const q = h.queueValue();
  assert.equal(q.length, 1);
  assert.equal(q[0].kind, 'KRAKEN');
  assert.ok(Number(q[0].ts) > 0);
  assert.ok(h.cells['Portefeuille Crypto!V2'].startsWith('QUEUED: '), 'V2 doit porter le statut QUEUED horodate');
  assert.ok(h.cells['CEX - Kraken Crypto!B1'].startsWith('QUEUED: '), 'B1 de la feuille doit etre observable');
});

test('deux clics successifs : deux jobs distincts, file valide, aucun ecrasement', () => {
  const h = harness();
  h.enqueue([JOB]);
  h.enqueue([{ ...JOB, kind: 'BITFINEX' }]);
  const q = h.queueValue();
  assert.equal(q.length, 2);
  assert.deepEqual(q.map((j) => j.kind), ['KRAKEN', 'BITFINEX']);
});

test('CEX_QUEUE_MANUAL_JOB expose le meme contrat que le batch', () => {
  const h = harness();
  const out = h.ctx.CEX_QUEUE_MANUAL_JOB('OKX', 'CEX - OKX', 'P', 'Portefeuille Crypto', 'V2');
  assert.equal(out, 'QUEUED');
  assert.equal(h.queueValue()[0].kind, 'OKX');
});
