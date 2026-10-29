import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { applyRefreshedChain, mergeChainRefreshResult } from '../hooks/useScanOrchestrator';
import { mergeChainResults } from '../components/scan-results';

const source = readFileSync(new URL('../hooks/useScanOrchestrator.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true);
function callback(name: string, scope: Record<string, unknown>) {
  const found: ts.ArrowFunction[] = [];
  function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name && n.initializer && ts.isCallExpression(n.initializer)) {
      const arg = n.initializer.arguments[0]; if (arg && ts.isArrowFunction(arg)) found.push(arg);
    }
    ts.forEachChild(n, visit);
  }
  visit(ast); assert.equal(found.length, 1, `exactly one real callback ${name}`);
  const js = ts.transpile(`const callback = ${found[0]!.getText(ast)};`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });
  return new Function(...Object.keys(scope), `${js}; return callback;`)(...Object.values(scope));
}
const chain = (chainKey: string, value: number): any => ({ chainKey, chainName: chainKey, vm: 'EVM', native: null, tokens: [{ balance: value, valueEur: value }], totals: { valueEur: value, tokenCount: 1, pricedCount: 1 }, errors: [], degraded: false });
function harness() {
  const old = [chain('BASE', 1), chain('ETHEREUM', 2)];
  let state: any[] = [{ address: 'alice', label: '', chains: old, totalEur: 3 }];
  const ref = { current: state };
  const run = { current: 1 };
  const recorded: unknown[] = [];
  const scope: Record<string, any> = {
    resultsRef: ref, scanRunIdRef: run, mergeChainRefreshResult, mergeChainResults, applyRefreshedChain,
    detectChainType: () => 'EVM', recordRefresh: (...args: unknown[]) => recorded.push(args),
    setResults: (fn: any) => { const first = fn(state); const second = fn(state); assert.deepEqual(first, second); state = first; ref.current = state; return first; },
    timedOutChains: [{ address: 'alice', chainKey: 'BASE' }, { address: 'alice', chainKey: 'ETHEREUM' }],
    retryAbortControllerRef: { current: null }, setRetryingTimedOut: () => {},
    deepScan: false, customTokenList: [],
  };
  return { scope, ref, run, recorded, get: () => state, set: (v: any[]) => { state = v; } };
}

describe("refresh race: stale ref never rewrites other fresh chains", () => {
  for (const order of [['BASE', 'ETHEREUM'], ['ETHEREUM', 'BASE']]) test(`single refresh stale ref preserves other fresh chain: ${order}`, () => {
    const h = harness(); const apply = callback('applyChainRefresh', h.scope);
    apply('alice', order[0]!, chain(order[0]!, 100));
    apply('alice', order[1]!, chain(order[1]!, 200));
    assert.equal(h.get()[0].chains.find((c: any) => c.chainKey === order[0]).totals.valueEur, 100);
    assert.equal(h.get()[0].totalEur, 300); assert.equal(h.recorded.length, 2);
  });

  test('two card refreshes with a lagging ref (React commits later) are both applied', () => {
    const h = harness();
    h.scope.setResults = (fn: any) => { const first = fn(h.get()); assert.deepEqual(fn(h.get()), first); h.set(first); };
    const apply = callback('applyChainRefresh', h.scope);
    apply('alice', 'BASE', chain('BASE', 100));
    apply('alice', 'ETHEREUM', chain('ETHEREUM', 200));
    assert.equal(h.get()[0].chains.find((c: any) => c.chainKey === 'BASE').totals.valueEur, 100);
    assert.equal(h.get()[0].chains.find((c: any) => c.chainKey === 'ETHEREUM').totals.valueEur, 200);
    assert.equal(h.get()[0].totalEur, 300);
  });

  test('retry success path updates results, registry and keeps other fresh chains', async () => {
    const h = harness();
    h.scope.fetchBatchScan = async (_a: unknown, keys: string[]) => ({ wallets: [{ address: 'alice', chains: [chain(keys[0]!, keys[0] === 'BASE' ? 100 : 200)] }] });
    await callback('handleRetryTimedOut', h.scope)();
    assert.equal(h.get()[0].chains.find((c: any) => c.chainKey === 'BASE').totals.valueEur, 100);
    assert.equal(h.get()[0].chains.find((c: any) => c.chainKey === 'ETHEREUM').totals.valueEur, 200);
    assert.equal(h.get()[0].totalEur, 300);
    assert.equal(h.recorded.length, 2);
  });

  test('late retry from older run does not mutate current results or registry', async () => {
    const h = harness(); const fresh = [{ ...h.get()[0], chains: [chain('BASE', 900)], totalEur: 900 }];
    h.scope.fetchBatchScan = async () => { h.run.current++; h.set(fresh); return { wallets: [{ address: 'alice', chains: [chain('BASE', 3)] }] }; };
    await callback('handleRetryTimedOut', h.scope)();
    assert.deepEqual(h.get(), fresh); assert.equal(h.recorded.length, 0);
  });
});

describe("AST: every functional setResults updater excludes registry writes; nonempty coverage", () => {
  let count = 0;
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'setResults' && n.arguments[0] && ts.isArrowFunction(n.arguments[0])) {
      count++;
      function inspect(x: ts.Node) { if (ts.isCallExpression(x)) assert.notEqual(x.expression.getText(ast), 'recordRefresh'); ts.forEachChild(x, inspect); }
      inspect(n.arguments[0]);
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.ok(count >= 2, `functional updater count=${count}`);
});