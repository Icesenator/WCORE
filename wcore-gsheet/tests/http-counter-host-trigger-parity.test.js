// Garde de reproduction — P1-OBS-GSHEET-HTTP-ATTRIBUTION
// Ecart observe en production (2026-09-14) :
//   GET_HTTP_BURN_BY_HOST()   -> TOTAL 0
//   GET_HTTP_BURN_BY_TRIGGER()-> TOTAL 132   (meme flush, meme cle de jour 09h UTC)
// Ce test reproduit l'ecart de facon isolee, sans runtime Google.
// Critere d'acceptation (3) de la priorite : egalite byHost total == byTrigger total == count()
// dans une MEME execution.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', '26B_HTTP_SAVINGS.gs');

function dayKey() {
  const d = new Date(Date.now() - 9 * 3600000);
  return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
}

function makeHarness() {
  const propsStore = {};
  const callLog = { fetch: 0, fetchAll: 0 };
  const context = {
    console,
    Logger: { log() {} },
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    isNaN,
    parseInt,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in propsStore ? propsStore[k] : null),
        setProperty: (k, v) => { propsStore[k] = String(v); },
        deleteProperty: (k) => { delete propsStore[k]; },
      }),
    },
    LockService: {
      getUserLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    UrlFetchApp: undefined, // patching desactive : on appelle increment() directement
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), context, { filename: SRC });
  return { context, propsStore, callLog };
}

function run() {
  const h = makeHarness();
  const day = dayKey();
  const hostKey = 'WCORE_HTTP_HOST_' + day;
  const triggerKey = 'WCORE_HTTP_TRIGGER_' + day;

  const urls = [
    'https://api.coingecko.com/api/v3/simple/price',
    'https://api.coingecko.com/api/v3/simple/price',
    'https://api.llama.fi/prices/current/ethereum:0x0',
    'https://rpc.ankr.com/eth',
    'https://api.coingecko.com/api/v3/simple/price',
  ];
  assert.strictEqual(typeof h.context.HttpCallCounter, 'object', 'HttpCallCounter introuvable dans le contexte');
  urls.forEach((u) => h.context.HttpCallCounter.increment(u, 'TEST_TRIGGER'));
  h.context.HttpCallCounter.flush();

  const hostMap = h.propsStore[hostKey] ? JSON.parse(h.propsStore[hostKey]) : {};
  const triggerMap = h.propsStore[triggerKey] ? JSON.parse(h.propsStore[triggerKey]) : {};
  const hostTotal = Object.keys(hostMap).reduce((s, k) => s + hostMap[k], 0);
  const triggerTotal = Object.keys(triggerMap).reduce((s, k) => s + triggerMap[k], 0);

  const report = { urls: urls.length, hostTotal, triggerTotal, hostMap, triggerMap, hostKey, triggerKey };
  console.log('REPRODUCTION ' + JSON.stringify(report, null, 1));

  assert.strictEqual(hostTotal, urls.length, 'HOST total != nombre d appels (ecart reproduit)');
  assert.strictEqual(triggerTotal, urls.length, 'TRIGGER total != nombre d appels');
  assert.strictEqual(hostTotal, triggerTotal, 'byHost total != byTrigger total (ecart reproduit)');
  assert.ok(!('unknown' in hostMap) || hostMap.unknown === 0, 'des URL valides sont tombees dans host=unknown');
  console.log('PASS http-counter-host-trigger-parity');
}

try {
  run();
} catch (e) {
  console.error('FAIL http-counter-host-trigger-parity -> ' + e.message);
  process.exit(1);
}
