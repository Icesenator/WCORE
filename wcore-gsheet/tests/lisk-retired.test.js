const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const src = path.join(__dirname, '..', 'src');
const chains = [
  ['LISK', 'Lisk', 1135, '0x46f'],
];
const now = Date.now();
const read = name => fs.readFileSync(path.join(src, name), 'utf8');

function context(selected, extra = {}) {
  const effects = [];
  const forbid = () => { effects.push('accès interdit'); throw Error('accès interdit'); };
  const ctx = vm.createContext({
    Logger: { log() {} }, CacheManager: {}, WCORE_STABLECOINS: {},
    Utilities: { formatDate: () => '2026-11-21 08:00:00' },
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
    Diagnostic: { cacheListAssets(cfg, wallet) { archived.push([cfg.KEYS.PREFIX, wallet]); } },
  });
  for (const [key, label, id, hex] of chains) {
    const marker = '[CHAIN_REMOVED] ' + label + ' (' + id + ')';
    assert.equal(ctx['_' + key], undefined);
    for (const alias of [key, id, hex, 'Ledger - ' + label, 'Ledger - ' + label + ' Crypto', 'Ledger - Lisk', 'Ledger - Lisk Crypto']) {
      assert.equal(ctx._wcoreRemovedChain_(alias), true);
      assert.equal(ctx.ChainFactory.registerChain(alias, { getConfig: () => ({}) }), null);
    }
    assert.equal(ctx._wcoreRemovedChain_(key + '_TEST'), false);
    assert.throws(() => ctx.ChainFactory.createEvmChain(key, {}), /CHAIN_REMOVED/);
    assert.throws(() => ctx.ChainFactory.createEvmChain('ALIAS', { CHAIN: { CHAIN_ID: id } }), /CHAIN_REMOVED/);
    assert.equal(ctx[key + '_REFRESH_STATUS']('wallet-fixture', '', [], true, true), marker);
    // Tombstone LIVE de Lisk (v4.15.52) : la cellule texte porte la date d'arrêt et « valeur UNKNOWN », jamais un nombre.
    const cell = JSON.stringify([['[CHAIN_REMOVED] Lisk (1135) — réseau arrêté le 2026-11-02, réclamation annoncée pour janvier 2027, valeur UNKNOWN']]);
    for (const fn of ['GET_WALLET_ASSETS_' + key, 'CACHED_WALLET_ASSETS_' + key, key + '_STATS']) {
      assert.equal(JSON.stringify(ctx[fn]('wallet-fixture', '', [], true, true)), cell);
    }
    assert.equal(JSON.stringify(ctx.REBUILD_WALLET_CACHE('wallet-fixture', key)), JSON.stringify([[marker]]));
    assert.equal(ctx['DIAG_' + key + '_CLEAR_CACHE'], undefined);
    ctx['DIAG_' + key + '_CACHE_ASSETS']('wallet-fixture');
  }
  assert.deepEqual(archived, chains.map(([key]) => [key + '_CACHE_', 'wallet-fixture']));
  assert.deepEqual(Object.keys(ctx.ChainFactory.getRegistry()), []);
  assert.deepEqual(effects, []);
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
  assert.deepEqual(rescan, ['CHAIN_REMOVED']);
  assert.equal(ctx._checkSheetErrors_().checked, 1);
  assert.deepEqual(effects, [active]);
  ctx._activity_pulseB1ForChain_('ETHEREUM');
  assert.deepEqual(effects, [active, active]);
});

test('listes et anciens RPC : exclusions par nom et par identifiant', () => {
  const raw = JSON.stringify({
    LISK: { rpc: 'archive-fixture' },
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
    assert.equal(ctx._RpcLookup.get(key), null);
    ctx._RpcLookup.set(key, 'archive-fixture', 'EVM');
    assert.equal(ctx._RpcLookup.getRpcs(key).length, 0);
    assert.equal(ctx._getDynamicRpcsMerged(['archive-fixture'], { CHAIN: { CHAIN_ID: hex } }).length, 0);
  }
  assert.deepEqual(Object.keys(ctx._RpcLookup.getAll()), ['ETHEREUM']);
});

// Écart repo/LIVE connu (2026-11-21) : le LIVE garde encore LISK / 1135 dans les listes Dashboard, santé RPC,
// activité et RPC dynamiques, et n'a pas de « ledger - lisk » dans LEDGER_RETIRED_NAMES (l'onglet a été supprimé).
// Ces deux tests décrivent l'état cible, comme ZERO et Swellchain ; ils passeront quand ces retraits seront publiés.
test('listes : LISK retiré du Dashboard, de la santé RPC, de l\'activité et des RPC dynamiques', { todo: 'retrait de LISK des listes non publié dans le LIVE' }, () => {
  const { ctx } = context(['27_ACTIVITY_REFRESH.gs', '27A_RPC_LOOKUP.gs', '33_DYNAMIC_RPC.gs']);
  const ids = Array.from(ctx._dynamicRpcGetOurChainIds());
  assert.equal(ids.includes(1135), false);
  for (const file of ['21_DASHBOARD.gs', '25_RPC_HEALTH_REPORT.gs', '27_ACTIVITY_REFRESH.gs', '33_DYNAMIC_RPC.gs']) {
    assert.doesNotMatch(read(file), /"LISK"/, file);
  }
});

test('Recap : lecture du cache ancien puis régénération des noms, liens et fin de tableau', { todo: 'ledger - lisk absent de LEDGER_RETIRED_NAMES dans le LIVE' }, () => {
  const names = chains.map(([, label]) => 'Ledger - ' + label);
  const active = 'Ledger - Ethereum';
  const existing = [names[0], active];
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
  for (const name of names) assert.equal(ctx.SHEET_LINK(name), '');
  assert.match(ctx.REFRESH_LEDGER_CACHE(), /^Cache refreshed/);
  assert.deepEqual(JSON.parse(props.get('LEDGER_SHEET_NAMES')), [active]);
  assert.deepEqual(Object.keys(JSON.parse(props.get('LEDGER_SHEET_MAP'))), [active]);
  assert.deepEqual(links, [active]);
  assert.deepEqual(cleared, [3, 1, 2, 10]);
  assert.equal(ss.getSheets().length, 2);
});

test('purge d’urgence, TTL et pression de taille préservent le cache historique', () => {
  const { ctx } = context(['02_UTILS.gs', '04A_CACHE_CORE.gs', '04B_CACHE_WALLET.gs']);
  ctx.CacheManager._jsonSizeBytes_ = obj => Buffer.byteLength(JSON.stringify(obj));
  const classify = ctx.CacheManager._emergencyPurge_({ classifierOnly: true });
  for (const [key] of chains) {
    assert.equal(classify(key + '_CACHE_FIXTURE', '{}', now).fam, 'RETIRED_CHAIN_EVIDENCE');
    assert.equal(classify(key + '_CACHE_FIXTURE', '{}', now).tier, 0);
  }
  assert.equal(classify('ETHEREUM_CACHE_FIXTURE', '{}', now).tier, 3);
  const recent = Math.floor(now / 1000);
  const packed = { m: {
    lisk: { k: 'LISK_CACHE_WALLET_FIXTURE', ts: recent - 20 * 86400 },
    activeTtl: { k: 'ETHEREUM_CACHE_WALLET_TTL_FIXTURE', ts: recent - 20 * 86400 },
    activeSize: { k: 'ETHEREUM_CACHE_WALLET_SIZE_FIXTURE', ts: recent - 7200 },
  } };
  ctx.CacheManager._prunePackedWalletCache_(packed, 1);
  assert.deepEqual(Object.keys(packed.m).sort(), ['lisk']);
  assert.equal(packed._pruned.ttl, 1);
  assert.equal(packed._pruned.n, 1);
});
