// v4.16.82 - PEAQ est une chaine CRYPTO UNIQUEMENT, enregistree dans
// RWA_CHAIN_VIEWS_CONFIG au meme titre que les 10 chaines a double vue.
//
// Regression d'origine: PEAQ.gs declarait CACHED_WALLET_ASSETS_PEAQ_CRYPTO
// et _ACTION, tous deux Resolution via _rwaViewsConfigByKey_("PEAQ"), qui
// renvoyait null (PEAQ absent de RWA_CHAIN_VIEWS_CONFIG) -> TypeError
// "Cannot read properties of null (reading 'chainKey')". Le fichier n'etait
// en outre pas suivi par git.
//
// Ces tests verrouillent les DEUX proprietes qui avaient ete violees:
//   1. toute vue Crypto/Action referencee par une chaine .gs doit exister
//      dans RWA_CHAIN_VIEWS_CONFIG (et son cacheFn doit etre coherent)
//   2. une chaine crypto-only est legitime: `action` absent != invalide
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const viewsSource = read('45_RWA_CHAIN_VIEWS.gs');
const peaqSource = read('PEAQ.gs');

// --- 1. PEAQ est enregistre, en crypto uniquement -----------------------
const peaqEntry = viewsSource.match(/\{[^{}]*key:"PEAQ"[^{}]*\}/);
assert.ok(peaqEntry, 'PEAQ doit etre declare dans RWA_CHAIN_VIEWS_CONFIG');
const peaqCfg = peaqEntry[0];

assert.match(peaqCfg, /chainKey:"PEAQ"/, 'PEAQ: chainKey requis');
assert.match(peaqCfg, /cacheFn:"CACHED_WALLET_ASSETS_PEAQ"/, 'PEAQ: cacheFn doit pointer sur la fonction reelle');
assert.match(peaqCfg, /crypto:"Ledger - Peaq Crypto"/, 'PEAQ: vue Crypto requise');
assert.deepStrictEqual(
  JSON.parse(peaqCfg.match(/legacy:(\[[^\]]*\])/)[1].replace(/'/g, '"')),
  ['Ledger - Peaq'],
  'PEAQ: l\'onglet existant "Ledger - Peaq" doit rester declare en legacy'
);
// Pas de vue Action: PEAQ n'a aucune entree RWA, une vue Action serait vide.
assert.ok(
  !/action:/.test(peaqCfg),
  'PEAQ ne doit PAS declarer de vue Action (aucune entree dans RWA_REGISTRY_ENTRIES => onglet toujours vide)'
);

// --- 2. Le wrapper Crypto de PEAQ ne leve plus de TypeError --------------
assert.match(
  peaqSource,
  /function CACHED_WALLET_ASSETS_PEAQ_CRYPTO\([^)]*\)\{[^}]*if\(!cfg\)/,
  'CACHED_WALLET_ASSETS_PEAQ_CRYPTO doit echouer explicitement si PEAQ est absent de la config'
);
// La vue Action a ete supprimee: elle ne pouvait produire que du vide.
assert.ok(
  !/function CACHED_WALLET_ASSETS_PEAQ_ACTION/.test(peaqSource),
  'la vue Action de PEAQ doit etre supprimee (chaine crypto-only)'
);
assert.ok(
  !/PEAQ_STATS_ACTION|PEAQ_REFRESH_STATUS_ACTION/.test(peaqSource),
  'les relais Action de PEAQ doivent etre supprimes'
);

// --- 3. Garde transverse : toute resolution RWA pointe une cle reelle ----
// C'est la garde qui aurait attrape le bug d'origine sans connaitre PEAQ.
// Portee volontairement restreinte aux wrappers qui passent par
// _rwaViewsConfigByKey_ : c'est le seul chemin qui peut renvoyer null.
// SOLANA est hors perimetre a dessein (projecteurs xStocks propres +
// enregistrement direct via LedgerViewRegistry, cf. 45_RWA_CHAIN_VIEWS.gs).
const configKeys = new Set(
  [...viewsSource.matchAll(/key:"([A-Z0-9_]+)"/g)].map((m) => m[1])
);
const wrapperFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.gs'));
const offenders = [];
for (const file of wrapperFiles) {
  const src = read(file);
  for (const m of src.matchAll(
    /function CACHED_WALLET_ASSETS_([A-Z0-9_]+)_(?:CRYPTO|ACTION)\([^)]*\)\{([\s\S]{0,400}?)\n/g
  )) {
    const [, key, body] = m;
    if (!body.includes('_rwaViewsConfigByKey_')) continue;
    if (!configKeys.has(key)) offenders.push(`${file}: ${m[0].trim()}`);
  }
}
assert.deepStrictEqual(
  offenders,
  [],
  'tout wrapper appelant _rwaViewsConfigByKey_("<CHAINE>") doit avoir une entree correspondante dans RWA_CHAIN_VIEWS_CONFIG:\n  ' +
    offenders.join('\n  ')
);

// --- 4. `_rwaProjectActionByCfg_` refuse explicitement le crypto-only ----
assert.match(
  viewsSource,
  /function _rwaProjectActionByCfg_\([\s\S]{0,200}if \(!cfg \|\| !cfg\.action\) throw/,
  '_rwaProjectActionByCfg_ doit lever une erreur explicite sur une chaine crypto-only'
);
assert.match(
  viewsSource,
  /if \(_rwaHasActionView_\(RWA_CHAIN_VIEWS_CONFIG\[_rwaViewCfgIndex_\]\)\)/,
  'la boucle d\'enregistrement doit sauter les chaines crypto-only'
);
