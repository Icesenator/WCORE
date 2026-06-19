const fs = require('fs');
const path = require('path');
const chainsDir = path.join(__dirname, '../packages/core/src/chains');

const chains = [
  { id: 148, name: 'Shimmer EVM', key: 'SHIMMER_EVM', symbol: 'SMR', llamaId: 'coingecko:shimmer', geckoId: 'shimmer', dexSlug: 'shimmer-evm', gtNetwork: 'shimmer-evm' },
  { id: 488, name: 'BXN', key: 'BXN', symbol: 'BXN', llamaId: null, geckoId: null, dexSlug: 'bxn', gtNetwork: 'bxn' },
  { id: 714, name: 'Eden', key: 'EDEN', symbol: 'EDEN', llamaId: null, geckoId: null, dexSlug: 'eden', gtNetwork: 'eden' },
  { id: 869, name: 'World Mobile', key: 'WORLD_MOBILE', symbol: 'WMTX', llamaId: 'coingecko:world-mobile-token', geckoId: 'world-mobile-token', dexSlug: 'world-mobile', gtNetwork: 'world-mobile' },
  { id: 1829, name: 'Playnance Playblock', key: 'PLAYNANCE_PLAYBLOCK', symbol: 'PAY', llamaId: 'coingecko:playnance', geckoId: 'play-2-earn', dexSlug: 'playnance-playblock', gtNetwork: 'playnance-playblock' },
  { id: 1890, name: 'LightLink Phoenix', key: 'LIGHTLINK', symbol: 'ETH', llamaId: 'coingecko:ethereum', geckoId: 'ethereum', dexSlug: 'lightlink', gtNetwork: 'lightlink' },
  { id: 2288, name: 'Moca Chain', key: 'MOCA_CHAIN', symbol: 'MOCA', llamaId: 'coingecko:moca-network', geckoId: 'moca-network', dexSlug: 'moca-chain', gtNetwork: 'moca-chain' },
  { id: 2366, name: 'KiteAI', key: 'KITEAI', symbol: 'KITE', llamaId: null, geckoId: null, dexSlug: 'kiteai', gtNetwork: 'kiteai' },
  { id: 6497, name: 'Awaji', key: 'AWAJI', symbol: 'AWAJI', llamaId: null, geckoId: null, dexSlug: 'awaji', gtNetwork: 'awaji' },
  { id: 8021, name: 'Numine', key: 'NUMINE', symbol: 'NUMINE', llamaId: null, geckoId: null, dexSlug: 'numine', gtNetwork: 'numine' },
  { id: 8822, name: 'IOTA EVM', key: 'IOTA_EVM', symbol: 'IOTA', llamaId: 'coingecko:iota', geckoId: 'iota', dexSlug: 'iota-evm', gtNetwork: 'iota-evm' },
  { id: 41923, name: 'EDU Chain', key: 'EDU_CHAIN', symbol: 'EDU', llamaId: 'coingecko:edu-chain', geckoId: 'edu-chain', dexSlug: 'edu-chain', gtNetwork: 'edu-chain' },
  { id: 73115, name: 'ICB Network', key: 'ICB_NETWORK', symbol: 'ICB', llamaId: null, geckoId: null, dexSlug: 'icb-network', gtNetwork: 'icb-network' },
  { id: 102030, name: 'Creditcoin', key: 'CREDITCOIN', symbol: 'CTC', llamaId: 'coingecko:creditcoin', geckoId: 'creditcoin', dexSlug: 'creditcoin', gtNetwork: 'creditcoin' },
  { id: 612055, name: 'Cross Mainnet', key: 'CROSS_MAINNET', symbol: 'CROSS', llamaId: null, geckoId: null, dexSlug: 'cross-mainnet', gtNetwork: 'cross-mainnet' },
  { id: 685689, name: 'Gensyn', key: 'GENSYN', symbol: 'SYN', llamaId: null, geckoId: null, dexSlug: 'gensyn', gtNetwork: 'gensyn' },
  { id: 245022934, name: 'Neon', key: 'NEON', symbol: 'NEON', llamaId: 'coingecko:neon', geckoId: 'neon', dexSlug: 'neon', gtNetwork: 'neon' },
];

chains.forEach(c => {
  const llamaMap = c.llamaId ? { [c.symbol]: c.llamaId } : {};
  const content = `// Auto-generated from chainlist.org by tools/add-blockscout-chains.cjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ${c.key}: ChainConfig = {
  key: "${c.key}",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: ["https://${c.id}.rpc.thirdweb.com"],
  },
  CHAIN: {
    NAME: "${c.name}",
    CHAIN_ID: ${c.id},
    NATIVE_SYMBOL: "${c.symbol}",
    NATIVE_NAME: "${c.name} Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: ${c.llamaId ? `"${c.llamaId}"` : 'null'},
    NATIVE_GECKO_ID: ${c.geckoId ? `"${c.geckoId}"` : 'null'},
    DEX_SLUG: "${c.dexSlug}",
    GT_NETWORK: "${c.gtNetwork}",
  },
  LLAMA_ID_MAP: ${JSON.stringify(llamaMap)},
} as Omit<ChainConfig, "key" | "vm">),
};

export default ${c.key};
`;
  fs.writeFileSync(path.join(chainsDir, c.key + '.ts'), content, 'utf8');
  console.log('Created ' + c.key + '.ts');
});

// Update index.ts
const indexPath = path.join(chainsDir, 'index.ts');
let indexContent = fs.readFileSync(indexPath, 'utf8');

// Add imports before the chains object
const imports = chains.map(c => `import { ${c.key} } from "./${c.key}.js";`).join('\n');
const lastImportLine = indexContent.lastIndexOf('import {');
const lastImportEnd = indexContent.indexOf(';', lastImportLine) + 1;
indexContent = indexContent.slice(0, lastImportEnd) + '\n' + imports + indexContent.slice(lastImportEnd);

// Add chain entries before the closing brace of the chains object
const chainsCloseIdx = indexContent.indexOf('} as const satisfies Record<string, ChainConfig>;');
const entries = chains.map(c => `  ${c.key},`).join('\n');
indexContent = indexContent.slice(0, chainsCloseIdx) + '\n' + entries + '\n' + indexContent.slice(chainsCloseIdx);

fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log('Updated index.ts with ' + chains.length + ' chains');
console.log('Done: ' + chains.length + ' chains created');
