const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8'), ctx);
// Fixtures SYNTHÉTIQUES de contrat AssetPairs, jamais des réponses LIVE.
const metadata = Object.fromEntries(['BRK.Bx', 'AAPLx', 'MUx', 'SKHYx'].map((s, i) => ['fixture' + i, { base: s, quote: 'ZUSD', altname: s + 'USD', wsname: s + '/USD', asset_class: 'tokenized_asset' }]));
for (const [id, item] of Object.entries(metadata)) test('AssetPairs identités exactes ' + item.base, () => {
  const index = ctx._krakenBuildAssetPairIndex_(metadata);
  for (const pair of [id, item.altname, item.wsname, item.base + 'ZUSD', item.base + '/ZUSD']) {
    const r = ctx._krakenResolveAssetPair_(pair, index);
    assert.equal(r.ticker, item.base);
    assert.equal(r.pair, item.wsname);
  }
});
test('inconnu et collisions ne sont pas devinés', () => {
  assert.equal(ctx._krakenResolveAssetPair_('AAPLxFOO', ctx._krakenBuildAssetPairIndex_(metadata)), null);
  const collision = { ...metadata, duplicate: { base: 'MUx', quote: 'USD', altname: 'AAPLxUSD', wsname: 'MUx/USD' } };
  assert.equal(ctx._krakenResolveAssetPair_('AAPLxUSD', ctx._krakenBuildAssetPairIndex_(collision)), null);
});
test('OpenOrders sans slash est résolu par les métadonnées, inconnu borné', () => {
  const index = ctx._krakenBuildAssetPairIndex_(metadata);
  const order = pair => ({ status: 'open', vol: '2', vol_exec: '1', descr: { type: 'sell', pair, price: '3' } });
  const r = ctx._krakenParseOpenOrders_({ open: { fixture: order('fixture0') } }, index);
  assert.equal(r['BRK.Bx'].sell, 1);
  assert.equal(r['BRK.Bx'].orders[0].pair, 'BRK.Bx/USD');
  const unknown = ctx._krakenParseOpenOrders_({ open: { fixture: order('not-a-known-pair') } }, index);
  assert.equal(unknown.status, 'UNKNOWN');
  assert.equal(unknown._error, 'UNKNOWN_ASSET_PAIR');
  assert.equal(JSON.stringify(unknown).includes('not-a-known-pair'), false);
});
