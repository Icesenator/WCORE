const crypto = require('crypto');

function bybitSign(timestamp, apiKey, recvWindow, queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(String(timestamp) + String(apiKey) + String(recvWindow) + String(queryString || ''))
    .digest('hex');
}

const actual = bybitSign(
  '1658384314791',
  'XXXXXXXXXX',
  '5000',
  'accountType=UNIFIED',
  'YYYYYYYYYY'
);

const expected = 'b32cae975aed735f5030af235d2e23f8c4268cc6a0c74ebddd26f14fc39fce68';

if (actual !== expected) {
  console.error('Expected:', expected);
  console.error('Actual:  ', actual);
  process.exit(1);
}

console.log('ByBit signature test passed');
