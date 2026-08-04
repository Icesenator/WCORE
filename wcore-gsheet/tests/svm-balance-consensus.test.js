// Guards the SVM native balance consensus.
//
// getBalanceWithConsensus kept the first value with the highest vote count and returned
// it unconditionally. With three endpoints disagreeing, a 1/3 minority was published as
// "consensus", so one stale RPC could overwrite a correct balance. WCORE requires a
// strict majority (votes * 2 > total), and a tie is not a consensus.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const source = fs.readFileSync(path.join(SRC, '14_SVM_ENGINE.gs'), 'utf8');

function clientWith(values) {
  // values: array aligned with rpcUrls; a number is a balance, null is an RPC failure.
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    isFinite, parseInt, parseFloat,
    Logger: { log: () => {} },
    UrlFetchApp: {
      fetchAll: (requests) => requests.map((_req, i) => ({
        getContentText: () => (values[i] === null
          ? JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'boom' } })
          : JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: values[i] } })),
      })),
    },
    Utilities: {}, PropertiesService: {}, CacheService: {}, SpreadsheetApp: {},
    SVM_DEFAULT_CONFIG: { TIMEOUTS: { HTTP_MS: 2500 } },
  };
  vm.createContext(context);
  const start = source.indexOf('var SvmRpcClient');
  assert.ok(start >= 0, 'SvmRpcClient not found');
  // Take only the client object literal, up to the next top-level declaration.
  const rest = source.slice(start);
  const end = rest.search(/\n(var|function) [A-Za-z_]/);
  vm.runInContext(rest.slice(0, end > 0 ? end : rest.length), context);
  return context.SvmRpcClient;
}

const RPCS = ['https://rpc1', 'https://rpc2', 'https://rpc3'];

// Unanimous.
{
  const res = clientWith([7, 7, 7]).getBalanceWithConsensus(RPCS, 'addr');
  assert.strictEqual(res.result.value, 7, 'a unanimous reading is accepted');
  assert.strictEqual(res.consensus, '3/3');
}

// Clear majority, one dissenter.
{
  const res = clientWith([7, 7, 9]).getBalanceWithConsensus(RPCS, 'addr');
  assert.strictEqual(res.result.value, 7, '2 of 3 is a majority');
  assert.strictEqual(res.consensus, '2/3');
}

// Majority among the endpoints that actually answered.
{
  const res = clientWith([7, 7, null]).getBalanceWithConsensus(RPCS, 'addr');
  assert.strictEqual(res.result.value, 7, 'a failed endpoint does not count against the majority');
  assert.strictEqual(res.consensus, '2/2');
}

// Three-way disagreement: this is the regression.
{
  const res = clientWith([7, 8, 9]).getBalanceWithConsensus(RPCS, 'addr');
  assert.ok(!res.result, 'a 1/3 minority must never be published as a balance');
  assert.strictEqual(res.noConsensus, true);
  assert.ok(/no consensus/.test(res.lastError), 'the caller needs an error to fall back to cache');
}

// A tie is not a consensus.
{
  const res = clientWith([7, 9, null]).getBalanceWithConsensus(RPCS, 'addr');
  assert.ok(!res.result, '1 vs 1 is a draw, not agreement');
  assert.strictEqual(res.noConsensus, true);
}

// A stale zero must not win over a positive majority.
{
  const res = clientWith([0, 5, 5]).getBalanceWithConsensus(RPCS, 'addr');
  assert.strictEqual(res.result.value, 5, 'the stale zero is outvoted');
}

// Everything down.
{
  const res = clientWith([null, null, null]).getBalanceWithConsensus(RPCS, 'addr');
  assert.ok(!res.result);
  assert.strictEqual(res.error, 'All RPCs failed');
}

console.log('OK - SVM balance consensus verified');
