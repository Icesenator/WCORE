// Importé le 10/11/2026 : restauration de 4.16.86/87/89 (effacés du LIVE le 07/11). Charge le source du dépôt.
// Usage : WCORE16=<dossier contenant 16_REFRESH.js> node --test ack-pulse-degraded.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
function load() {
  const c = { _wd_norm_: v => String(v).trim(), _webScanQueueOpaque_: id => 'o:' + id };
  vm.createContext(c);
  for (const n of ['_wd_ackPulseProven_', '_wd_ackPulseTargets_']) {
    const s = src.indexOf('function ' + n + '(');
    if (s < 0) continue; // absent du live : la cible doit quand même se charger
    vm.runInContext(src.slice(s, src.indexOf('\n}', s) + 2), c);
  }
  assert.equal(typeof c._wd_ackPulseTargets_, 'function');
  return c;
}
const row = (name, chain, addr, vC1 = 'FALSE') => ({ name, vC1, formula: `=${chain}_REFRESH_STATUS("${addr}";A3:A;C1;B1)` });
const res = (id, outcome, written = true) => ({ source: 'o:' + id, outcome, cacheWriteReread: written, queueCommitted: true });

test('un scan DEGRADED dont le cache a été réécrit est re-pulsé pour afficher la nouvelle donnée', () => {
  const c = load();
  const out = c._wd_ackPulseTargets_([res('ARB|0xa', 'DEGRADED')], [row('Ledger - Arb', 'ARB', '0xA')]);
  assert.deepEqual(Array.from(out), ['Ledger - Arb']);
});
test('OK prouvé reste re-pulsé', () => {
  const c = load();
  assert.deepEqual(Array.from(c._wd_ackPulseTargets_([res('E|0xb', 'OK')], [row('T', 'E', '0xb')])), ['T']);
});
test('aucun pulse sans réécriture prouvée du cache, ni pour PRESERVED, ni pour C1 coché', () => {
  const c = load();
  assert.equal(c._wd_ackPulseTargets_([res('E|0xb', 'DEGRADED', false)], [row('T', 'E', '0xb')]).length, 0);
  assert.equal(c._wd_ackPulseTargets_([res('E|0xb', 'PRESERVED')], [row('T', 'E', '0xb')]).length, 0);
  assert.equal(c._wd_ackPulseTargets_([res('E|0xb', 'DEGRADED')], [row('T', 'E', '0xb', 'TRUE')]).length, 0);
});
