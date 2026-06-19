const https = require('https');
const fs = require('fs');
const path = require('path');

const chainsDir = path.join(__dirname, '../packages/core/src/chains');

// Chaînes à créer
const chainsToCreate = [
  { id: 61, name: 'Ethereum Classic', key: 'ETHEREUM_CLASSIC', symbol: 'ETC', llamaId: 'coingecko:ethereum-classic', geckoId: 'ethereum-classic', dexSlug: 'ethereum-classic', gtNetwork: 'ethereum-classic' },
  { id: 250, name: 'Fantom', key: 'FANTOM', symbol: 'FTM', llamaId: 'coingecko:fantom', geckoId: 'fantom', dexSlug: 'fantom', gtNetwork: 'fantom' },
  { id: 314, name: 'Filecoin Virtual Machine', key: 'FVM', symbol: 'FIL', llamaId: 'coingecko:filecoin', geckoId: 'filecoin', dexSlug: 'filecoin', gtNetwork: 'filecoin' },
  { id: 2000, name: 'Dogechain', key: 'DOGECHAIN', symbol: 'DOGE', llamaId: 'coingecko:dogecoin', geckoId: 'dogecoin', dexSlug: 'dogechain', gtNetwork: 'dogechain' },
  { id: 42766, name: 'zkFair', key: 'ZKFAIR', symbol: 'ZKF', llamaId: 'coingecko:zkfair', geckoId: 'zkfair-token', dexSlug: 'zkfair', gtNetwork: 'zkfair' },
  { id: 570, name: 'Rollux', key: 'ROLLUX', symbol: 'SYS', llamaId: 'coingecko:syscoin', geckoId: 'syscoin', dexSlug: 'rollux', gtNetwork: 'rollux' },
  { id: 648, name: 'Endurance', key: 'ENDURANCE', symbol: 'ACE', llamaId: 'coingecko:fusionist', geckoId: 'fusionist', dexSlug: 'endurance', gtNetwork: 'endurance' },
  { id: 841, name: 'Taraxa', key: 'TARAXA', symbol: 'TARA', llamaId: 'coingecko:taraxa', geckoId: 'taraxa', dexSlug: 'taraxa', gtNetwork: 'taraxa' },
  { id: 1111, name: 'Moonchain', key: 'MOONCHAIN', symbol: 'MHC', llamaId: 'coingecko:moonchain', geckoId: 'moonchain', dexSlug: 'moonchain', gtNetwork: 'moonchain' },
  { id: 1234, name: 'Step Network', key: 'STEP_NETWORK', symbol: 'FITFI', llamaId: 'coingecko:step-app-fit-to-earn', geckoId: 'step-app-fit-to-earn', dexSlug: 'step-network', gtNetwork: 'step-network' },
  { id: 1577, name: 'Etho Protocol', key: 'ETHO_PROTOCOL', symbol: 'ETHO', llamaId: 'coingecko:etho-protocol', geckoId: 'etho-protocol', dexSlug: 'etho-protocol', gtNetwork: 'etho-protocol' },
  { id: 2026, name: 'Edgeless', key: 'EDGELESS', symbol: 'EDG', llamaId: 'coingecko:edgeless', geckoId: 'edgeless', dexSlug: 'edgeless', gtNetwork: 'edgeless' },
  { id: 2525, name: 'inEVM', key: 'INEVM', symbol: 'INJ', llamaId: 'coingecko:injective-protocol', geckoId: 'injective-protocol', dexSlug: 'inevm', gtNetwork: 'inevm' },
  { id: 2800, name: 'LayerAI', key: 'LAYERAI', symbol: 'LAI', llamaId: 'coingecko:layerai', geckoId: 'layerai', dexSlug: 'layerai', gtNetwork: 'layerai' },
  { id: 2911, name: 'Hychain', key: 'HYCHAIN', symbol: 'TOPIA', llamaId: 'coingecko:hychain', geckoId: 'hychain', dexSlug: 'hychain', gtNetwork: 'hychain' },
  { id: 2999, name: 'Aevo', key: 'AEVO', symbol: 'ETH', llamaId: 'coingecko:ethereum', geckoId: 'ethereum', dexSlug: 'aevo', gtNetwork: 'aevo' },
  { id: 3333, name: 'Aves Network', key: 'AVES_NETWORK', symbol: 'AVES', llamaId: 'coingecko:aves', geckoId: 'aves', dexSlug: 'aves-network', gtNetwork: 'aves-network' },
  { id: 3737, name: 'Crossbell', key: 'CROSSBELL', symbol: 'CSB', llamaId: 'coingecko:crossbell', geckoId: 'crossbell', dexSlug: 'crossbell', gtNetwork: 'crossbell' },
  { id: 4242, name: 'Nexi Chain', key: 'NEXI_CHAIN', symbol: 'NEXI', llamaId: 'coingecko:nexi', geckoId: 'nexi', dexSlug: 'nexi-chain', gtNetwork: 'nexi-chain' },
  { id: 4399, name: 'Cysic', key: 'CYSIC', symbol: 'CYS', llamaId: 'coingecko:cysic', geckoId: 'cysic', dexSlug: 'cysic', gtNetwork: 'cysic' },
  { id: 5845, name: 'Tangle', key: 'TANGLE', symbol: 'TNT', llamaId: 'coingecko:tangle', geckoId: 'tangle', dexSlug: 'tangle', gtNetwork: 'tangle' },
  { id: 7332, name: 'Horizen Eon', key: 'HORIZEN_EON', symbol: 'ZEN', llamaId: 'coingecko:horizen', geckoId: 'horizen', dexSlug: 'horizen-eon', gtNetwork: 'horizen-eon' },
  { id: 7534, name: 'Rivalz', key: 'RIVALZ', symbol: 'RI', llamaId: 'coingecko:rivalz', geckoId: 'rivalz', dexSlug: 'rivalz', gtNetwork: 'rivalz' },
  { id: 7897, name: 'Arena-Z', key: 'ARENA_Z', symbol: 'ETH', llamaId: 'coingecko:ethereum', geckoId: 'ethereum', dexSlug: 'arena-z', gtNetwork: 'arena-z' },
  { id: 7979, name: 'DOS Chain', key: 'DOS_CHAIN', symbol: 'DOS', llamaId: 'coingecko:dos', geckoId: 'dos', dexSlug: 'dos-chain', gtNetwork: 'dos-chain' },
  { id: 8329, name: 'Lorenzo', key: 'LORENZO', symbol: 'Lorenzo', llamaId: 'coingecko:lorenzo', geckoId: 'lorenzo-protocol', dexSlug: 'lorenzo', gtNetwork: 'lorenzo' },
  { id: 8811, name: 'Haven1', key: 'HAVEN1', symbol: 'H1', llamaId: 'coingecko:haven1', geckoId: 'haven1', dexSlug: 'haven1', gtNetwork: 'haven1' },
  { id: 8866, name: 'Lumio', key: 'LUMIO', symbol: 'ETH', llamaId: 'coingecko:ethereum', geckoId: 'ethereum', dexSlug: 'lumio', gtNetwork: 'lumio' },
  { id: 9008, name: 'Shido Network', key: 'SHIDO_NETWORK', symbol: 'SHIDO', llamaId: 'coingecko:shido', geckoId: 'shido', dexSlug: 'shido', gtNetwork: 'shido' },
  { id: 12553, name: 'RSS3', key: 'RSS3', symbol: 'RSS3', llamaId: 'coingecko:rss3', geckoId: 'rss3', dexSlug: 'rss3', gtNetwork: 'rss3' },
  { id: 16718, name: 'AirDAO', key: 'AIRDAO', symbol: 'AMB', llamaId: 'coingecko:ambrosus', geckoId: 'ambrosus', dexSlug: 'airdao', gtNetwork: 'airdao' },
  { id: 32769, name: 'Zilliqa EVM', key: 'ZILLIQA_EVM', symbol: 'ZIL', llamaId: 'coingecko:zilliqa', geckoId: 'zilliqa', dexSlug: 'zilliqa-evm', gtNetwork: 'zilliqa-evm' },
  { id: 47763, name: 'Neo X', key: 'NEO_X', symbol: 'GAS', llamaId: 'coingecko:neo', geckoId: 'neo', dexSlug: 'neo-x', gtNetwork: 'neo-x' },
  { id: 47805, name: 'Rei Network', key: 'REI_NETWORK', symbol: 'REI', llamaId: 'coingecko:rei-network', geckoId: 'rei-network', dexSlug: 'rei-network', gtNetwork: 'rei-network' },
  { id: 70700, name: 'Proof of Play Apex', key: 'PROOF_OF_PLAY_APEX', symbol: 'ETH', llamaId: 'coingecko:ethereum', geckoId: 'ethereum', dexSlug: 'proof-of-play-apex', gtNetwork: 'proof-of-play-apex' },
  { id: 78225, name: 'Stack', key: 'STACK', symbol: 'STACK', llamaId: 'coingecko:stack', geckoId: 'stack-2', dexSlug: 'stack', gtNetwork: 'stack' },
  { id: 984122, name: 'Forma', key: 'FORMA', symbol: 'TIA', llamaId: 'coingecko:celestia', geckoId: 'celestia', dexSlug: 'forma', gtNetwork: 'forma' },
  { id: 1666600000, name: 'Harmony', key: 'HARMONY', symbol: 'ONE', llamaId: 'coingecko:harmony', geckoId: 'harmony', dexSlug: 'harmony', gtNetwork: 'harmony' },
  { id: 2046399126, name: 'Skale', key: 'SKALE', symbol: 'sFUEL', llamaId: null, geckoId: null, dexSlug: 'skale', gtNetwork: 'skale' },
];

// Fetch RPCs from chainlist.org
async function fetchChainData(chainId) {
  return new Promise((resolve, reject) => {
    https.get(`https://chainid.network/chains/${chainId}.json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const imports = [];
  const chainEntries = [];

  for (const chain of chainsToCreate) {
    console.log(`Fetching chain data for ${chain.name} (${chain.id})...`);
    const chainData = await fetchChainData(chain.id);

    let rpcEndpoints = [`https://${chain.id}.rpc.thirdweb.com`];
    if (chainData && chainData.rpc && chainData.rpc.length > 0) {
      rpcEndpoints = chainData.rpc
        .filter(url => typeof url === 'string' && url.startsWith('https'))
        .slice(0, 5);
      if (rpcEndpoints.length === 0) {
        rpcEndpoints = [`https://${chain.id}.rpc.thirdweb.com`];
      }
    }

    const llamaIdMap = chain.llamaId ? { [chain.symbol]: chain.llamaId } : {};

    const fileContent = `// Auto-generated from chainlist.org by tools/add-chains.mjs
// Do not edit by hand.

import type { ChainConfig } from "../types.js";

export const ${chain.key}: ChainConfig = {
  key: "${chain.key}",
  vm: "EVM",
  ...({
  CACHE_VERSION: 1,
  RPC: {
    ENDPOINTS: ${JSON.stringify(rpcEndpoints)},
  },
  CHAIN: {
    NAME: "${chain.name}",
    CHAIN_ID: ${chain.id},
    NATIVE_SYMBOL: "${chain.symbol}",
    NATIVE_NAME: "${chain.name} Native",
    NATIVE_DECIMALS: 18,
    NATIVE_LLAMA_ID: ${chain.llamaId ? `"${chain.llamaId}"` : 'null'},
    NATIVE_GECKO_ID: ${chain.geckoId ? `"${chain.geckoId}"` : 'null'},
    DEX_SLUG: "${chain.dexSlug}",
    GT_NETWORK: "${chain.gtNetwork}",
  },
  LLAMA_ID_MAP: ${JSON.stringify(llamaIdMap)},
} as Omit<ChainConfig, "key" | "vm">),
};

export default ${chain.key};
`;

    const filePath = path.join(chainsDir, `${chain.key}.ts`);
    fs.writeFileSync(filePath, fileContent, 'utf8');
    console.log(`Created ${chain.key}.ts`);

    imports.push(`import { ${chain.key} } from "./${chain.key}.js";`);
    chainEntries.push(`  ${chain.key},`);
  }

  // Update index.ts
  const indexPath = path.join(chainsDir, 'index.ts');
  let indexContent = fs.readFileSync(indexPath, 'utf8');

  // Add imports at the end of the import section
  const lastImportIndex = indexContent.lastIndexOf('import {');
  const lastImportEndIndex = indexContent.indexOf(';', lastImportIndex) + 1;

  const newImports = imports.join('\n');
  indexContent = indexContent.slice(0, lastImportEndIndex) + '\n' + newImports + indexContent.slice(lastImportEndIndex);

  // Add chain entries to the chains object
  const chainsObjectStart = indexContent.indexOf('export const chains: Record<string, ChainConfig> = {');
  const chainsObjectEnd = indexContent.indexOf('};', chainsObjectStart);

  const chainsObjectContent = indexContent.slice(chainsObjectStart, chainsObjectEnd);
  const newChainsObject = chainsObjectContent + '\n' + chainEntries.join('\n') + '\n';

  indexContent = indexContent.slice(0, chainsObjectStart) + newChainsObject + indexContent.slice(chainsObjectEnd);

  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log('Updated index.ts');
  console.log(`Created ${chainsToCreate.length} chain files.`);
}

main().catch(console.error);
