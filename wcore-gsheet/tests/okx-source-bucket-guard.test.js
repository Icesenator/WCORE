const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/40_OKX_SYNC.gs'), 'utf8');
const properties = {
  OKX_RELAY_URL: 'https://relay.example.test',
  OKX_RELAY_TOKEN: 'test-relay-token-long-enough',
};
const context = {
  console,
  PropertiesService: {
    getUserProperties: () => ({ getProperty: (key) => properties[key] || null }),
    getDocumentProperties: () => ({ getProperty: () => null }),
  },
  UrlFetchApp: {
    fetch: () => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        ok: true,
        spot: [
          ['BTC', '1', 'trading', '60000', '60000'],
          ['BTC', '2', 'funding', '120000', '60000'],
          ['BTC', '0.5', 'trading', '31000', '62000'],
        ],
      }),
    }),
  },
};
vm.createContext(context);
vm.runInContext(source, context);

const buckets = context._okxFetchBucketsViaRelay_();
assert.deepStrictEqual(Array.from(buckets.spot, (row) => Array.from(row)), [
  ['BTC', 1.5, 'trading', 91000, 91000 / 1.5],
  ['BTC', 2, 'funding', 120000, 60000],
], 'relay rows must retain and merge by their real source bucket');

const values = context._okxBuildValues_(buckets, '2026-08-07 12:00:00');
assert.deepStrictEqual(Array.from(values, (row) => Array.from(row)), [
  ['BTC', 1.5, 'trading', '2026-08-07 12:00:00', 91000, 91000 / 1.5],
  ['BTC', 2, 'funding', '2026-08-07 12:00:00', 120000, 60000],
], 'sheet rows must carry source and relay valuation metadata without forcing spot');

console.log('OKX source bucket guard OK');
