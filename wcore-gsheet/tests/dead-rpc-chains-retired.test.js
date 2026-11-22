const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Douze chaînes sans RPC (constat WCORE du 2026-11-22) : modèle zero-retired.test.js, en boucle.
const src = path.join(__dirname, '..', 'src');
const chains = [
  ['NEXUS', 'Nexus Mainnet', 3946, 'NEX'],
  ['AIRDAO', 'AirDAO', 16718, 'AMB'],
  ['CROSSBELL', 'Crossbell', 3737, 'CSB'],
  ['EDGELESS', 'Edgeless', 2026, 'EDG'],
  ['LUMIO', 'Lumio', 8866, 'ETH'],
  ['DOGECHAIN', 'Dogechain', 2000, 'DOGE'],
  ['HYCHAIN', 'Hychain', 2911, 'TOPIA'],
  ['PROOF_OF_PLAY_APEX', 'Proof of Play Apex', 70700, 'ETH'],
  ['STEP_NETWORK', 'Step Network', 1234, 'FITFI'],
  ['SHIMMER_EVM', 'Shimmer EVM', 148, 'SMR'],
  ['LORENZO', 'Lorenzo', 8329, 'Lorenzo'],
  ['DOS_CHAIN', 'DOS Chain', 7979, 'DOS'],
].map(([key, label, id, symbol]) => [key, label, id, '0x' + id.toString(16), symbol]);
const now = Date.now();
const read = name => fs.readFileSync(path.join(src, name), 'utf8');

function context(selected, extra = {}) {
  const effects = [];
  const forbid = () => { effects.push('accès interdit'); throw Error('accès interdit'); };
  const ctx = vm.createContext({
    Logger: { log() {} }, CacheManager: {}, WCORE_STABLECOINS: {},
    Utilities: { formatDate: () => '2026-11-22 08:00:00' },
    UrlFetchApp: { fetch: forbid, fetchAll: forbid },
    WalletCache: { load: forbid, save: forbid, clear: forbid },
    DegradedMode: { resetCircuitBreaker: forbid },
    ...extra,
  });
  for (const name of ['19_CHAIN_FACTORY.gs', ...selected]) {
    vm.runInContext(read(name), ctx, { filename: name });
  }
  return { ctx, effects };
}

test('tombstones : aucun binding actif, formules texte seules et diagnostic dédié', () => {
  const archived = [];
  const { ctx, effects } = context(chains.map(([key]) => key + '.gs').concat('18_CLEANUP.gs'), {
    Diagnostic: { cacheListAssets(cfg, wallet) { archived.push([cfg.KEYS.PREFIX, cfg.CHAIN.CHAIN_ID, cfg.CHAIN.NATIVE_SYMBOL, wallet]); } },
  });
  for (const [key, label, id, hex] of chains) {
    const marker = '[CHAIN_REMOVED] ' + label + ' (' + id + ')';
    assert.equal(ctx['_' + key], undefined);
    const tab = key.replace(/_/g, ' ');
    for (const alias of [key, id, String(id), hex, hex.toUpperCase(), 'Ledger - ' + label, 'Ledger - ' + label + ' Crypto', 'Ledger - ' + tab, 'Ledger - ' + tab + ' Crypto']) {
      assert.equal(ctx._wcoreRemovedChain_(alias), true, String(alias));
      assert.equal(ctx.ChainFactory.registerChain(alias, { getConfig: () => ({}) }), null);
    }
    assert.equal(ctx._wcoreRemovedChain_(key + '_TEST'), false);
    assert.throws(() => ctx.ChainFactory.createEvmChain(key, {}), /CHAIN_REMOVED/);
    assert.throws(() => ctx.ChainFactory.createEvmChain('ALIAS', { CHAIN: { CHAIN_ID: id } }), /CHAIN_REMOVED/);
    assert.equal(ctx[key + '_REFRESH_STATUS']('wallet-fixture', '', [], true, true), marker);
    for (const fn of ['GET_WALLET_ASSETS_' + key, 'CACHED_WALLET_ASSETS_' + key, key + '_STATS']) {
      assert.equal(JSON.stringify(ctx[fn]('wallet-fixture', '', [], true, true)), JSON.stringify([[marker]]));
    }
    assert.equal(JSON.stringify(ctx.REBUILD_WALLET_CACHE('wallet-fixture', key)), JSON.stringify([[marker]]));
    assert.equal(ctx['DIAG_' + key + '_CLEAR_CACHE'], undefined);
    ctx['DIAG_' + key + '_CACHE_ASSETS']('wallet-fixture');
  }
  assert.deepEqual(archived, chains.map(([key, , id, , symbol]) => [key + '_CACHE_', id, symbol, 'wallet-fixture']));
  assert.deepEqual(Object.keys(ctx.ChainFactory.getRegistry()), []);
  assert.deepEqual(effects, []);
});

test('chaînes voisines et identifiants proches restent actifs', () => {
  const { ctx } = context([]);
  for (const alias of ['BASE', '8453', 'ETHEREUM', '1', 'CORE', '1116', 'DOGECOIN', 'DOGE', 'SMR', 'NEX', 'IOTA_EVM', '8822', 'Ledger - Ethereum', 'Ledger - Core']) {
    assert.equal(ctx._wcoreRemovedChain_(alias), false, alias);
  }
});

test('admission, scan et file historique refusés, y compris avec un ancien binding', () => {
  const { ctx, effects } = context(['41_GSHEET_WEB_SCAN.gs', '41A_WEB_SCAN_QUEUE.gs']);
  ctx._webScanProp_ = () => 'ALL';
  ctx._webScanQueueEnabled_ = () => true;
  const aliases = chains.flatMap(([key, , id, hex]) => [key, String(id), hex]);
  const raw = JSON.stringify([...aliases, 'ETHEREUM'].map(c => ({ c, a: 'wallet-fixture', q: now })));
  ctx._webScanQueueCache_ = () => ({
    get: () => raw,
    put() { effects.push('queue put'); },
    remove() { effects.push('queue remove'); },
  });
  for (const alias of aliases) {
    ctx.ChainFactory._registry[alias.toUpperCase()] = { getConfig() { effects.push('ancien binding'); } };
    const cfg = { CHAIN: { KEY: alias } };
    assert.equal(ctx._webScanAllowed_(alias), false);
    assert.equal(ctx._webScanQueueResolveChain_(alias), null);
    assert.equal(ctx._webScanQueueEnqueue_('wallet-fixture', [], true, cfg).reason, 'CHAIN_REMOVED');
    assert.equal(ctx._webScanWallet_('wallet-fixture', [], true, cfg, 'fixture').error, 'CHAIN_REMOVED');
  }
  assert.deepEqual(Array.from(ctx._webScanQueueRead_(), entry => entry.c), ['ETHEREUM']);
  assert.equal(ctx._webScanAllowed_('ETHEREUM'), true);
  assert.deepEqual(effects, []);
});

test('aucun pulse des Ledgers archivés dans le watchdog, la récupération ou les entrées directes', () => {
  const { ctx, effects } = context(['16_REFRESH.gs', '27_ACTIVITY_REFRESH.gs']);
  const names = chains.map(([, label]) => 'Ledger - ' + label);
  const active = 'Ledger - Ethereum';
  const sheets = [...names, active].map(name => ({
    getName: () => name,
    getRange() {
      effects.push(name);
      return { getDisplayValues: () => [['OK']], setValue() {}, setNumberFormat() {} };
    },
  }));
  const ss = { getSheets: () => sheets, getSpreadsheetTimeZone: () => 'Europe/Paris',
    getSheetByName: name => sheets.find(sh => sh.getName() === name) };
  ctx._wcoreGetSpreadsheet_ = () => ss;
  ctx.PropertiesService = { getScriptProperties: () => ({}) };
  ctx._wd_loadWebBackoff_ = () => ({});
  ctx._wd_saveWebBackoff_ = () => {};
  ctx._wd_isSystemBlocked_ = () => ({ blocked: false });
  const rows = names.map(name => ({ name, vA2: '#ERROR!', vI1: '' }));
  const pending = names.map(sheetName => ({ sheetName, reason: 'partial' }));
  assert.equal(ctx._wd_collectGlobalRefreshActions_(rows, now, 1, '', {}, pending).length, 0);
  assert.deepEqual(Array.from(ctx._recoverySelectPulseList_([...names, active], false).pulse), [active]);
  for (const [[key], sheet] of chains.map((chain, i) => [chain, sheets[i]])) {
    ctx._activity_pulseB1ForChain_(key);
    ctx.WCORE_ON_EDIT({ value: 'TRUE', range: { getSheet: () => sheet, getA1Notation: () => 'A1' } });
  }
  const rescan = Array.from(ctx.FORCE_RESCAN_LEDGERS(names.map(name => name.slice(9))).slice(1), row => row[3]);
  assert.deepEqual(rescan, chains.map(() => 'CHAIN_REMOVED'));
  assert.equal(ctx._checkSheetErrors_().checked, 1);
  assert.deepEqual(effects, [active]);
  ctx._activity_pulseB1ForChain_('ETHEREUM');
  assert.deepEqual(effects, [active, active]);
});

test('listes et anciens RPC : exclusions par nom et par identifiant', () => {
  const raw = JSON.stringify({
    ...Object.fromEntries(chains.map(([key]) => [key, { rpc: 'archive-fixture' }])),
    ETHEREUM: { rpc: 'active-fixture' },
  });
  const { ctx } = context(['27_ACTIVITY_REFRESH.gs', '27A_RPC_LOOKUP.gs', '33_DYNAMIC_RPC.gs'], {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => key === 'ACTIVITY_NONCE_MAP'
        ? JSON.stringify(Object.fromEntries(Object.keys(JSON.parse(raw)).map(chain =>
          [chain + ':wallet-fixture', { n: 1 }])))
        : raw,
    }) },
  });
  assert.deepEqual(Array.from(ctx.ActivityTracker.getAllTracked(), item => item.chain), ['ETHEREUM']);
  const ids = Array.from(ctx._dynamicRpcGetOurChainIds());
  assert.ok(ids.includes(1), 'le fallback numérique reste actif');
  for (const [key, , id, hex] of chains) {
    assert.equal(ids.includes(id), false);
    assert.equal(ctx._RpcLookup.get(key), null);
    ctx._RpcLookup.set(key, 'archive-fixture', 'EVM');
    assert.equal(ctx._RpcLookup.getRpcs(key).length, 0);
    assert.equal(ctx._getDynamicRpcsMerged(['archive-fixture'], { CHAIN: { CHAIN_ID: hex } }).length, 0);
    assert.equal(ctx._getDynamicRpcsMerged(['archive-fixture'], { CHAIN: { CHAIN_ID: id } }).length, 0);
    for (const file of ['21_DASHBOARD.gs', '25_RPC_HEALTH_REPORT.gs', '27_ACTIVITY_REFRESH.gs', '33_DYNAMIC_RPC.gs']) {
      assert.doesNotMatch(read(file), new RegExp('"' + key + '"'), file);
    }
  }
  assert.deepEqual(Object.keys(ctx._RpcLookup.getAll()), ['ETHEREUM']);
});

test('Recap : lecture du cache ancien puis régénération des noms, liens et fin de tableau', () => {
  const names = chains.map(([, label]) => 'Ledger - ' + label);
  const active = 'Ledger - Ethereum';
  const existing = [...names, active];
  let links;
  let cleared;
  const props = new Map([['LEDGER_SHEET_NAMES', JSON.stringify(existing)],
    ['LEDGER_SHEET_MAP', JSON.stringify(Object.fromEntries(existing.map((name, i) => [name, i + 1]))) ]]);
  const recap = {
    getLastRow: () => 4,
    getRange: (...args) => ({
      setRichTextValues(values) { links = Array.from(values, row => row[0]); },
      setValues() {}, setValue() {}, setFormulas() {},
      clearContent() { cleared = args; },
    }),
  };
  const sheets = existing.map((name, i) => ({ getName: () => name, getSheetId: () => i + 1 }));
  const ss = { getSheets: () => sheets, getUrl: () => 'sheet-fixture',
    getSheetByName: name => name === 'Recap Portfolio' ? recap : null };
  const { ctx } = context(['17_LISTING.gs'], {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value),
    }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, newRichTextValue: () => ({
      setText(value) { this.text = value; return this; },
      setLinkUrl() { return this; }, build() { return this.text; },
    }) },
    ScriptApp: { getProjectTriggers: () => [{ getHandlerFunction: () => 'LEDGER_ON_CHANGE' }] },
  });
  assert.deepEqual(Array.from(ctx.LIST_SHEETS_LEDGER(), row => row[0]), [active]);
  for (const [key, label] of chains) {
    for (const name of ['Ledger - ' + label, 'Ledger - ' + label + ' Crypto', 'Ledger - ' + key.replace(/_/g, ' ')]) {
      assert.equal(ctx.SHEET_LINK(name), '', name);
    }
  }
  assert.match(ctx.REFRESH_LEDGER_CACHE(), /^Cache refreshed/);
  assert.deepEqual(JSON.parse(props.get('LEDGER_SHEET_NAMES')), [active]);
  assert.deepEqual(Object.keys(JSON.parse(props.get('LEDGER_SHEET_MAP'))), [active]);
  assert.deepEqual(links, [active]);
  assert.deepEqual(cleared, [3, 1, 2, 10]);
  assert.equal(ss.getSheets().length, existing.length);
});

test('purge d’urgence, TTL et pression de taille préservent le cache historique', () => {
  const { ctx } = context(['02_UTILS.gs', '04A_CACHE_CORE.gs', '04B_CACHE_WALLET.gs']);
  ctx.CacheManager._jsonSizeBytes_ = obj => Buffer.byteLength(JSON.stringify(obj));
  const classify = ctx.CacheManager._emergencyPurge_({ classifierOnly: true });
  for (const [key] of chains) {
    assert.equal(classify(key + '_CACHE_FIXTURE', '{}', now).fam, 'RETIRED_CHAIN_EVIDENCE', key);
    assert.equal(classify(key + '_CACHE_FIXTURE', '{}', now).tier, 0);
  }
  assert.equal(classify('ETHEREUM_CACHE_FIXTURE', '{}', now).tier, 3);
  assert.equal(classify('CORE_CACHE_FIXTURE', '{}', now).tier, 3);
  const recent = Math.floor(now / 1000);
  const packed = { m: {
    ...Object.fromEntries(chains.map(([key]) => ['retired_' + key, { k: key + '_CACHE_WALLET_FIXTURE', ts: recent - 20 * 86400 }])),
    activeTtl: { k: 'ETHEREUM_CACHE_WALLET_TTL_FIXTURE', ts: recent - 20 * 86400 },
    activeSize: { k: 'ETHEREUM_CACHE_WALLET_SIZE_FIXTURE', ts: recent - 7200 },
  } };
  ctx.CacheManager._prunePackedWalletCache_(packed, chains.length);
  assert.deepEqual(Object.keys(packed.m).sort(), chains.map(([key]) => 'retired_' + key).sort());
  assert.equal(packed._pruned.ttl, 1);
  assert.equal(packed._pruned.n, 1);
});
