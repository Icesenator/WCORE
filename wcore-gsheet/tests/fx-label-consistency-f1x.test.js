// F1X-r2 : l'information de fraicheur ne contredit jamais le statut affiche.
// Reproduit le defaut trouve sur F1X (INFO_FX freshness=FRESH alors qu'une valeur affichee repose
// sur un FX plus ancien) et verifie le contrat r2 sur le rendu reel CACHED_WALLET_ASSETS_FLARE.
const test = require('node:test'); const assert = require('node:assert/strict');
const path = require('node:path'); const Module = require('node:module'); const fs = require('node:fs');
const src = fs.readFileSync(path.join(__dirname, 'fx-valuation-integrity-f1.test.js'), 'utf8')
  .split('// ---------------------------------------------------------------------------\n// 1 a 8')[0].replace("const test = require('node:test');", '');
const m = new Module(path.join(__dirname, 'fx-label-harness.js')); m.paths = Module._nodeModulePaths(__dirname);
m._compile(src + '\nmodule.exports={execution,newStorage,renderFlare,storeWith,scanState,runNative,wcFromState,seedFx,VER,NOW,MIN,H,TOKEN};', m.id);
const { execution, newStorage, renderFlare, storeWith, scanState, runNative, wcFromState, seedFx, VER, NOW, MIN, H, TOKEN } = m.exports;
const meta = t => ({ rate: 0.91, sources: [{ source: 'frankfurter' }], selection: 'median', sourceCollectedAt: t, cacheWrittenAt: t, ttlMs: 3600000, applied: true });
const fxLabel = out => String(out.find(r => r[1] === 'INFO_FX')[2]);
const nat = out => String((out.find(r => r[1] === 'INFO_NATIVE') || [])[2] || '');
const rows = () => [['Flare', 'INFO_NATIVE', 'n', '', '', '', ''], ['Flare', 'INFO_FX', 'fx', '', '', '', ''], ['Flare', 'INFO_TOTAL', 'T', '', '', '', 0]];

test('L1 magasin : valeur native au FX de 70 min => INFO_NATIVE fxFreshness=STALE, INFO_FX jamais FRESH', () => {
  const st = newStorage(); storeWith(st, { obsAgo: 5 * MIN, fxAgo: 70 * MIN });
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
    priceMap: { 'native@flare': 0.02 }, priceTsMap: { 'native@flare': NOW - 3 * H }, balanceTsMap: { native: NOW - 30 * MIN },
    usd_to_eur_rate: 0.91, last_cache_update_ms: NOW - 10 * MIN, lastInfoMetaRows: rows() });
  assert.ok(out.find(r => r[3] === 'native')[5] > 0, 'contrat F1X : date effective 70 min < 90 min, valeur affichee');
  assert.match(nat(out), /fxAt=\S+ fxFreshness=STALE/);
  assert.doesNotMatch(fxLabel(out), /freshness=FRESH/);
});

test('L2 magasin : valeur native au FX de 20 min => fxFreshness=FRESH (date FX de la valorisation connue)', () => {
  const st = newStorage(); storeWith(st, { obsAgo: 5 * MIN, fxAgo: 20 * MIN });
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
    priceMap: {}, priceTsMap: {}, balanceTsMap: { native: NOW - 30 * MIN }, usd_to_eur_rate: 0.91, last_cache_update_ms: NOW - 10 * MIN, lastInfoMetaRows: rows() });
  assert.match(nat(out), /fxFreshness=FRESH/);
});

test('L3 anomalie ouverte documentee : cache portant des metadonnees FX heritees (scan web, hors perimetre)', () => {
  // Les caches EVM ecrits par F1X-r2 ne portent plus fxMetadata. Un cache herite d'un scan web
  // (41_GSHEET_WEB_SCAN) peut en porter : comportement preexistant, non modifie par ce lot.
  const st = newStorage();
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 0 }, { contract: TOKEN, symbol: 'TKN', name: 'T', balance: 3, price_eur: 1.5 }],
    priceMap: { [TOKEN]: 1.5 }, priceTsMap: { [TOKEN]: NOW - 5 * H }, balanceTsMap: { native: NOW - MIN, [TOKEN]: NOW - MIN },
    usd_to_eur_rate: 0.91, fxMetadata: meta(NOW - 10 * MIN), last_cache_update_ms: NOW - 10 * MIN, lastInfoMetaRows: rows() });
  assert.match(fxLabel(out), /freshness=FRESH/, 'caracterisation : metadonnees heritees, non produites par l EVM');
});

test('L4 scan EVM reel (FX frais) puis rendu : aucune metadonnee FX persistee par 11_EVM, INFO_FX sans affirmation FRESH', () => {
  const st = newStorage(); seedFx(st, NOW - 10 * MIN, 0.91, VER);
  const e = execution(st);
  const r = runNative(e, scanState(e), { src: 'LLAMA', observedAt: NOW - 2 * MIN }, 0.025);
  const wc = wcFromState(r.state, NOW + MIN); delete wc.fxMetadata;
  const out = renderFlare(execution(st, { now: NOW + MIN }), wc);
  assert.doesNotMatch(fxLabel(out), /freshness=FRESH/);
  const evm = fs.readFileSync(path.join(__dirname, '../src/11_EVM_ENGINE.gs'), 'utf8');
  assert.doesNotMatch(evm, /^\s*fxMetadata:/m, 'aucune persistance de fxMetadata par 11_EVM');
});

test('L5 garde C : jeton conserve d un ancien scan, cache ecrit par F1X-r2 (sans fxMetadata) => aucun libelle FRESH', () => {
  const st = newStorage();
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 0 }, { contract: TOKEN, symbol: 'TKN', name: 'T', balance: 3, price_eur: 1.5 }],
    priceMap: { [TOKEN]: 1.5 }, priceTsMap: { [TOKEN]: NOW - 5 * H }, balanceTsMap: { native: NOW - MIN, [TOKEN]: NOW - MIN },
    usd_to_eur_rate: 0.91, last_cache_update_ms: NOW - 10 * MIN, lastInfoMetaRows: rows() });
  assert.doesNotMatch(JSON.stringify(out), /freshness=FRESH|fxFreshness=FRESH/);
});

test('L6 garde D : prix natif reutilise du cache wallet (scan anterieur) => valeur selon sa date effective, aucune affirmation FRESH', () => {
  const st = newStorage();
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
    priceMap: { 'native@flare': 0.02 }, priceTsMap: { 'native@flare': NOW - 80 * MIN }, balanceTsMap: { native: NOW - 30 * MIN },
    usd_to_eur_rate: 0.91, last_cache_update_ms: NOW - 80 * MIN, lastInfoMetaRows: rows() });
  assert.equal(out.find(r => r[3] === 'native')[5], 0.02, 'contrat F1X : date effective 80 min < 90 min');
  assert.doesNotMatch(JSON.stringify(out), /freshness=FRESH|fxFreshness=FRESH/);
});
