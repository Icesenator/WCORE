// 24/11/2026 (P2-MAINT-API-SMALL-HARDENING) : les quatre SET_*_RELAY n'acceptent plus que https et un
// hote de relais connu (le jeton du relais part ensuite vers cette URL). Charge le vrai source du depot.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');

function load() {
  const saved = {};
  const store = () => ({ setProperty: (k, v) => { saved[k] = v; }, deleteProperty: k => { delete saved[k]; }, getProperty: k => saved[k] || null });
  const c = { PropertiesService: { getUserProperties: store, getDocumentProperties: store }, saved };
  vm.createContext(c);
  const take = (file, startToken) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const s = src.indexOf(startToken);
    assert.ok(s >= 0, file + ' : ' + startToken);
    return src.slice(s, src.indexOf('\n}', s) + 2);
  };
  const binance = fs.readFileSync(path.join(root, '36_BINANCE_SYNC.gs'), 'utf8');
  const h = binance.indexOf('var WCORE_CEX_RELAY_HOSTS');
  assert.ok(h >= 0, 'liste des hotes absente');
  vm.runInContext(binance.slice(h, binance.indexOf('\n}', binance.indexOf('function _cexRelayUrlAllowed_', h)) + 2), c);
  const cfgs = { '36_BINANCE_SYNC.gs': 'BINANCE_SYNC_CONFIG', '38_BYBIT_SYNC.gs': 'BYBIT_SYNC_CONFIG', '39_COINBASE_SYNC.gs': 'COINBASE_SYNC_CONFIG', '40_OKX_SYNC.gs': 'OKX_SYNC_CONFIG' };
  for (const [file, cfg] of Object.entries(cfgs)) {
    const name = cfg.replace('_SYNC_CONFIG', '');
    vm.runInContext(`var ${cfg} = { RELAY_URL_PROP: "${name}_RELAY_URL", RELAY_TOKEN_PROP: "${name}_RELAY_TOKEN" };`, c);
    vm.runInContext(take(file, `function SET_${name}_RELAY(`), c);
  }
  return c;
}

const TOKEN = 't'.repeat(32);
const setters = ['SET_BINANCE_RELAY', 'SET_BYBIT_RELAY', 'SET_COINBASE_RELAY', 'SET_OKX_RELAY'];

test('https vers un hote de relais connu : accepte, barre oblique finale retiree', () => {
  for (const fn of setters) {
    const c = load();
    c[fn]('https://cex-relay-production.up.railway.app/', TOKEN);
    const key = fn.replace('SET_', '').replace('_RELAY', '') + '_RELAY_URL';
    assert.equal(c.saved[key], 'https://cex-relay-production.up.railway.app', fn);
  }
});

test('refus : http en clair, hote inconnu, identifiants dans l URL, requete, sous-domaine piege, vide', () => {
  const bad = [
    'http://cex-relay-production.up.railway.app',
    'https://evil.up.railway.app',
    'https://cex-relay-production.up.railway.app@evil.example',
    'https://user:pw@cex-relay-production.up.railway.app',
    'https://cex-relay-production.up.railway.app.evil.example',
    'https://cex-relay-production.up.railway.app/x?to=evil',
    'https://cex-relay-production.up.railway.app:8443',
    'https://cex-relay.up.railway.app',
    'https://binance-relay.up.railway.app',
    'https://cex-relay-production%2eup.railway.app',
    'https://cex-relay-production.up.railway.app%2f@evil.example',
    'ftp://cex-relay-production.up.railway.app',
    '',
    null,
  ];
  for (const fn of setters) {
    for (const url of bad) {
      const c = load();
      assert.throws(() => c[fn](url, TOKEN), /URL relais invalide/, `${fn} ${url}`);
      assert.equal(Object.keys(c.saved).length, 0, `${fn} ${url} : rien d'enregistre`);
    }
  }
});

test('le controle du jeton reste en place', () => {
  const c = load();
  assert.throws(() => c.SET_BINANCE_RELAY('https://cex-relay-production.up.railway.app', 'court'), /Token relais invalide/);
});

test('majuscules et port 443 explicite : meme hote, accepte', () => {
  const c = load();
  c.SET_OKX_RELAY('HTTPS://CEX-RELAY-PRODUCTION.UP.RAILWAY.APP:443/', TOKEN);
  assert.equal(c.saved.OKX_RELAY_URL, 'HTTPS://CEX-RELAY-PRODUCTION.UP.RAILWAY.APP:443');
});

test('les appels au relais ne suivent pas les redirections (le jeton ne change pas d hote)', () => {
  for (const file of ['36_BINANCE_SYNC.gs', '38_BYBIT_SYNC.gs', '39_COINBASE_SYNC.gs', '40_OKX_SYNC.gs', '44_CEX_BULK.gs']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const calls = src.split(/\r?\n/).filter((line) => line.includes('"x-relay-token"'));
    assert.ok(calls.length >= 1, file + ' : appel au relais introuvable');
    for (const call of calls) assert.match(call, /followRedirects:\s*false/, file + ' : ' + call.trim());
  }
});