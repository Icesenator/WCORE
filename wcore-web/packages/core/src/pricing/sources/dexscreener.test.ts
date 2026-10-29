import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DexScreenerPriceSource } from './dexscreener.js';
import { getChain } from '../../chains/index.js';

const paper = '0x008dd62dd934f3ffdc0986ba5316c78ae51cb1c9';
const spy = '0x117cc2133c37b721f49de2a7a74833232b3b4c0c';
const pair = { chainId: 'robinhood', baseToken: { address: paper, symbol: 'PAPER' }, quoteToken: { address: spy, symbol: 'SPY' }, priceUsd: '0.09547', liquidity: { usd: 70677.71 } };

test('Robinhood PAPER uses observable DEX price from address-verified SPY quote', async () => {
  const chain = getChain('ROBINHOOD_CHAIN')!;
  assert.equal(chain.CHAIN?.DEX_SLUG, 'robinhood');
  const source = new DexScreenerPriceSource((async () => new Response(JSON.stringify([pair]))) as typeof fetch);
  const result = await source.getTokenPriceUsd({ key: paper, contract: paper, chain });
  assert.equal(typeof result === 'object' ? result?.priceUsd : result, 0.09547);
});

test('rejects fake SPY, wrong chain, unrelated contract and empty liquidity', async () => {
  const chain = getChain('ROBINHOOD_CHAIN')!;
  for (const bad of [
    { ...pair, quoteToken: { address: '0x1111111111111111111111111111111111111111', symbol: 'SPY' } },
    { ...pair, chainId: 'ethereum' },
    { ...pair, baseToken: { address: '0x2222222222222222222222222222222222222222', symbol: 'PAPER' } },
    { ...pair, liquidity: { usd: 0 } },
  ]) {
    const source = new DexScreenerPriceSource((async () => new Response(JSON.stringify([bad]))) as typeof fetch);
    assert.equal(await source.getTokenPriceUsd({ key: paper, contract: paper, chain }), null);
  }
});
