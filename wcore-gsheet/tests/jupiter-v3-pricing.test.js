const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '07_PRICES.gs'), 'utf8');
const initSource = fs.readFileSync(path.join(__dirname, '..', 'src', '01_INIT.gs'), 'utf8');
const start = source.indexOf('PriceSources.jupBulkMints =');
const end = start + source.slice(start).search(/\/\*\*\r?\n \* Jupiter Token API V1/);
assert.ok(start >= 0 && end > start, 'Jupiter bulk pricing source not found');

const mint = 'So11111111111111111111111111111111111111112';
let requestedUrl = '';
const context = {
  console,
  isFinite,
  Logger: { log: () => {} },
  PriceSources: {},
  HTTP: {
    fetchJsonWithRetry: (url) => {
      requestedUrl = url;
      return {
        [mint]: {
          usdPrice: 152.75,
          blockId: 359863411,
          decimals: 9,
          priceChange24h: 1.25,
        },
      };
    },
  },
  _pxHttpTimeoutMs: (_config, fallback) => fallback,
  _pxKeyLower: (value) => String(value).toLowerCase(),
};

vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const result = context.PriceSources.jupBulkMints([mint, mint], null, {});
assert.strictEqual(
  requestedUrl,
  `https://lite-api.jup.ag/price/v3?ids=${mint}`,
  'Jupiter V3 must use the public lite API and deduplicate mints'
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(result)),
  {
    [mint.toLowerCase()]: {
      priceUsd: 152.75,
      source: 'Jupiter',
    },
  },
  'the flat V3 usdPrice payload must produce a usable USD quote'
);
assert.match(
  initSource,
  /JUPITER_PRICE:\s*'https:\/\/lite-api\.jup\.ag\/price\/v3'/,
  'the shared Jupiter price endpoint must not expose a retired API'
);

console.log('OK - Jupiter V3 pricing payload verified');
