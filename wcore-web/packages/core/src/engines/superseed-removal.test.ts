import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainList, getChain } from '../chains/index.js';
import { getWalletAssets } from './dispatch.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isRetiredChain } from '@wcore/shared';

test('un dist amont périmé ne réactive pas la chaîne retirée dans le registre web', () => {
  const ethereum = { key: 'ETHEREUM', CHAIN: { CHAIN_ID: 1 }, TOKENS: [{ symbol: 'SUPR' }] };
  const retired = { key: 'SUPERSEED', CHAIN: { CHAIN_ID: 5330 } };
  const upstream = { ETHEREUM: ethereum, SUPERSEED: retired, LEGACY_ALIAS: { key: 'LEGACY_ALIAS', CHAIN: { CHAIN_ID: 5330 } } };
  const code = ts.transpileModule(readFileSync(new URL('../chains/index.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  runInNewContext(code, { exports, require(id: string) {
    if (id === '@wcore/chains') return { chains: upstream };
    if (id === './web-overrides.js') return { WEB_CHAIN_OVERRIDES: {} };
    if (id === '@wcore/shared') return { isRetiredChain };
    throw new Error(`Unexpected import: ${id}`);
  } });
  assert.deepEqual(Object.keys(exports.chains), ['ETHEREUM']);
  assert.equal(exports.getChain('ETHEREUM'), ethereum);
  assert.equal(exports.getChain('ETHEREUM').TOKENS[0].symbol, 'SUPR');
  assert.equal(exports.chainList.length, 1);
  assert.equal(upstream.SUPERSEED, retired, 'ne pas muter le dist amont');
});

test('Superseed est retiré du registre core, Ethereum et son token SUPR restent indépendants', () => {
  assert.equal(getChain('SUPERSEED'), undefined);
  assert.equal(chainList.some(c => c.key === 'SUPERSEED' || Number(c.CHAIN?.CHAIN_ID) === 5330), false);
  assert.equal(getChain('ETHEREUM')?.CHAIN?.CHAIN_ID, 1);
  assert.equal(getChain('SUPERPOSITION'), undefined);
});

test('le tombstone ne capture ni les clés voisines ni un symbole de token', async () => {
  for (const key of ['SUPERSEED_TEST', 'SUPR', '15330', 'Superseed Crypto']) {
    await assert.rejects(getWalletAssets('wallet', key), /unknown chain:/);
  }
});

test('la frontière de scan refuse explicitement Superseed et 5330 avant tout réseau ou cache', async () => {
  let accesses = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { accesses++; throw new Error('réseau interdit'); };
  try {
    for (const key of ['SUPERSEED', 'superseed', ' Superseed ', '5330', ' sseed ', '0x14d2']) {
      await assert.rejects(getWalletAssets('wallet', key, { forceRefresh: true, cache: new Proxy({}, { get() { accesses++; throw Error('cache interdit'); } }) as never }), /chain removed: SUPERSEED \(5330\)/);
    }
    assert.equal(accesses, 0);
  } finally { globalThis.fetch = previous; }
});
