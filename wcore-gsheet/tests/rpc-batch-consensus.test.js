// Guards RpcClient.batchWithConsensus — WC-03.
//
// The function used to short-circuit the fetch loop on the first HTTP 200 OK and
// count the majority against the responder set (values.length) with an explicit
// `values.length === 1` accept branch, so a single responding RPC was published as
// "consensus" even though several endpoints were queried. WCORE requires a strict
// majority over the QUERIED set: votes * 2 > total (invariant #3), failures and
// non-responders included. This mirrors svm-balance-consensus.test.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const source = fs.readFileSync(path.join(SRC, '05_RPC.gs'), 'utf8');

const CALLS = [{ method: 'eth_chainId', params: [] }];

// values[i]: string = JSON-RPC result for endpoint i, 'THROW' = network failure,
// 'DOWN' = non-200, 'ERR' = JSON-RPC error object.
function run(values) {
  const endpoints = values.map((_v, i) => 'https://rpc' + (i + 1));
  let fetchCount = 0;

  const fetchImpl = (url) => {
    fetchCount++;
    const i = endpoints.indexOf(url);
    const v = values[i];
    if (v === 'THROW') throw new Error('network down');
    if (v === 'DOWN') return { getResponseCode: () => 503, getContentText: () => '' };
    const item = v === 'ERR'
      ? { jsonrpc: '2.0', id: 1, error: { message: 'boom' } }
      : { jsonrpc: '2.0', id: 1, result: v };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify([item]) };
  };

  const context = {
    console: { log: () => {} },
    Date, JSON, Math, Number, String, Array, Object, RegExp,
    isFinite, parseInt, parseFloat,
    UrlFetchApp: { fetch: fetchImpl },
    Http: { _defaultOptions: (o) => o },
    Obj: { keyCount: (m) => (m ? Object.keys(m).length : 0) },
    RpcHealth: { recordSuccess: () => {}, recordFailure: () => {} },
    RpcSelector: { pickForConsensus: (_userRpc, count, _config) => endpoints.slice(0, count) },
  };
  vm.createContext(context);

  const start = source.indexOf('var RpcClient');
  assert.ok(start >= 0, 'RpcClient not found');
  const rest = source.slice(start);
  const end = rest.search(/\n(var|function) [A-Za-z_]/);
  vm.runInContext(rest.slice(0, end > 0 ? end : rest.length), context);

  const timer = { isLow: () => false }; // keeps CONSENSUS_COUNT instead of forcing 2
  const config = { RPC: { CONSENSUS_COUNT: values.length, ENDPOINTS: endpoints } };
  const out = context.RpcClient.batchWithConsensus(endpoints[0], CALLS, timer, config);
  return { result: out[0], fetchCount };
}

// 2/2 agreement — a genuine majority of the queried set.
{
  const { result } = run(['0x1', '0x1']);
  assert.strictEqual(result.error, null, '2/2 must be accepted');
  assert.strictEqual(result.result, '0x1');
}

// 2/3 agreement — majority with one dissenter.
{
  const { result } = run(['0x1', '0x1', '0x2']);
  assert.strictEqual(result.error, null, '2/3 must be accepted');
  assert.strictEqual(result.result, '0x1');
}

// 2/3 with one failing endpoint — the failure still counts in the queried set.
{
  const { result } = run(['0x1', '0x1', 'THROW']);
  assert.strictEqual(result.error, null, '2 responders of 3 queried is a majority');
  assert.strictEqual(result.result, '0x1');
}

// THE WC-03 regression: one success, the rest down. Must NOT be published.
{
  const { result } = run(['0x1', 'THROW', 'DOWN']);
  assert.ok(result.error, 'a lone responder must never be published as consensus');
  assert.strictEqual(result.result, null);
  assert.ok(/no majority/.test(result.error.message), result.error.message);
}

// One success among two queried endpoints is a tie, not a consensus.
{
  const { result } = run(['0x1', 'THROW']);
  assert.ok(result.error, '1 of 2 queried is not a majority');
  assert.strictEqual(result.result, null);
}

// Three-way disagreement — 1/3 minority must be rejected.
{
  const { result } = run(['0x1', '0x2', '0x3']);
  assert.ok(result.error, 'a 1/3 minority is not a consensus');
  assert.strictEqual(result.result, null);
}

// JSON-RPC error payloads do not count as votes.
{
  const { result } = run(['0x1', 'ERR', 'ERR']);
  assert.ok(result.error, 'error payloads are not votes');
  assert.strictEqual(result.result, null);
}

// A single known endpoint is a 1/1 majority and stays usable.
{
  const { result } = run(['0x1']);
  assert.strictEqual(result.error, null, '1 of 1 queried is a majority');
  assert.strictEqual(result.result, '0x1');
}

// No first-success short-circuit: every endpoint of the set is actually queried.
{
  const { fetchCount } = run(['0x1', '0x1', '0x1']);
  assert.strictEqual(fetchCount, 3, 'all queried endpoints must be fetched');
}

console.log('OK - RPC batch consensus verified');
