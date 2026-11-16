const test = require('node:test');
const assert = require('node:assert/strict');
const { formatLedgerPulse } = require('./ledger-pulse-time.cjs');
test('été : conversion source UTC en Paris sans ISO', () => assert.equal(formatLedgerPulse('2026-07-09T17:02:05.907Z'), '2026-07-09 19:02:05'));
test('hiver : changement heure automatique', () => assert.equal(formatLedgerPulse('2026-12-09T17:02:05.907Z'), '2026-12-09 18:02:05'));
test('pulse Robinhood original conservé à la seconde', () => assert.equal(formatLedgerPulse('2026-10-09T17:02:05.907Z'), '2026-10-09 19:02:05'));
test('refus date invalide et pas de double conversion', () => { assert.throws(() => formatLedgerPulse('invalide')); assert.equal(formatLedgerPulse('2026-10-09T19:02:05+02:00'), '2026-10-09 19:02:05'); });
