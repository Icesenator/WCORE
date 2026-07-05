import { http, createConfig } from "wagmi";
import type { Chain } from "viem";
import { base, arbitrum, optimism, polygon, bsc, avalanche, gnosis, soneium,
  mainnet, zksync, scroll, linea, mantle, blast, sonic, celo, unichain, berachain, ink, abstract, worldchain, fraxtal, zora, mode, sei, superseed, shape, ancient8, bob, lisk, metalL2, cyber,
  immutableZkEvm, morph, mezo, swellchain, swan, vana, story } from "wagmi/chains";
// We intentionally do NOT register wagmi's `injected()` connector in the
// static config. Reason: a broken Turbopack chunk on `injected` throws
// `ReferenceError: injected is not defined` at module load and bricks the
// whole wagmi client (useConnectors() returns [], walletConnect breaks).
// The `injected` provider is only needed for browser-extension wallets; for
// users whose MetaMask + Zerion + etc. extensions fight over
// `window.ethereum`, WalletConnect QR code is the reliable fallback. Users
// with a single working extension can still connect via EIP-6963 picker in
// ConnectButton (we lazy-load @wagmi/connectors/injected there).
import { walletConnect, coinbaseWallet } from "@wagmi/connectors";

// Polygon zkEVM — defined manually because wagmi/chains version may have stale RPCs
const polygonZkEvm: Chain = {
  id: 1101,
  name: "Polygon zkEVM",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://zkevm-rpc.com", "https://polygon-zkevm.drpc.org"] },
    public: { http: ["https://zkevm-rpc.com", "https://polygon-zkevm.drpc.org"] },
  },
  blockExplorers: {
    default: { name: "PolygonScan zkEVM", url: "https://zkevm.polygonscan.com" },
  },
};

const redstone: Chain = {
  id: 690,
  name: "Redstone",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.redstonechain.com", "https://690.rpc.thirdweb.com"] },
    public: { http: ["https://rpc.redstonechain.com", "https://690.rpc.thirdweb.com"] },
  },
  blockExplorers: {
    default: { name: "Redstone Explorer", url: "https://explorer.redstone.xyz" },
  },
};

const robinhoodChain: Chain = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
    public: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
};

const appchain: Chain = {
  id: 466,
  name: "AppChain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.appchain.xyz", "https://466.rpc.thirdweb.com"] },
    public: { http: ["https://rpc.appchain.xyz", "https://466.rpc.thirdweb.com"] },
  },
  blockExplorers: {
    default: { name: "AppChain Explorer", url: "https://explorer.appchain.xyz" },
  },
};

const camp: Chain = {
  id: 484,
  name: "Camp",
  nativeCurrency: { name: "Camp", symbol: "CAMP", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.camp.raas.gelato.cloud", "https://484.rpc.thirdweb.com"] },
    public: { http: ["https://rpc.camp.raas.gelato.cloud", "https://484.rpc.thirdweb.com"] },
  },
  blockExplorers: {
    default: { name: "Camp Explorer", url: "https://explorer.camp.raas.gelato.cloud" },
  },
};

const duckchain: Chain = {
  id: 5545,
  name: "DuckChain",
  nativeCurrency: { name: "TON", symbol: "TON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.duckchain.io", "https://rpc-hk.duckchain.io", "https://5545.rpc.thirdweb.com"] },
    public: { http: ["https://rpc.duckchain.io", "https://rpc-hk.duckchain.io", "https://5545.rpc.thirdweb.com"] },
  },
  blockExplorers: {
    default: { name: "DuckChain Explorer", url: "https://scan.duckchain.io" },
  },
};

const rari: Chain = {
  id: 1380012617,
  name: "RARI Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.rpc.rarichain.org/http", "https://rari.drpc.org", "https://1380012617.rpc.thirdweb.com"] },
    public: { http: ["https://mainnet.rpc.rarichain.org/http", "https://rari.drpc.org", "https://1380012617.rpc.thirdweb.com"] },
  },
  blockExplorers: {
    default: { name: "RARI Chain Explorer", url: "https://explorer.rarichain.org" },
  },
};

const zircuit: Chain = {
  id: 48900,
  name: "Zircuit",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.zircuit.com", "https://48900.rpc.thirdweb.com"] },
    public: { http: ["https://mainnet.zircuit.com", "https://48900.rpc.thirdweb.com"] },
  },
  blockExplorers: {
    default: { name: "Zircuit Explorer", url: "https://explorer.zircuit.com" },
  },
};

// Pre-configured chains not in wagmi/chains — added proactively for future GM deployments
const mitosis: Chain = {
  id: 124816,
  name: "Mitosis",
  nativeCurrency: { name: "MITO", symbol: "MITO", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mitosis.org"] }, public: { http: ["https://rpc.mitosis.org"] } },
  blockExplorers: { default: { name: "Mitosis Explorer", url: "https://explorer.mitosis.org" } },
};

const fogo: Chain = {
  id: 4242,
  name: "Fogo",
  nativeCurrency: { name: "Fogo", symbol: "FOGO", decimals: 18 },
  rpcUrls: { default: { http: ["https://fogo.rpc.thirdweb.com"] }, public: { http: ["https://fogo.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Fogo Explorer", url: "https://fogo.explorer.thirdweb.com" } },
};

const core: Chain = {
  id: 1116,
  name: "Core",
  nativeCurrency: { name: "CoreDAO", symbol: "CORE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.coredao.org", "https://core.public.infstones.com", "https://1116.rpc.thirdweb.com"] }, public: { http: ["https://rpc.coredao.org", "https://core.public.infstones.com", "https://1116.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Core Explorer", url: "https://scan.coredao.org" } },
};

const conflux: Chain = {
  id: 1030,
  name: "Conflux eSpace",
  nativeCurrency: { name: "Conflux", symbol: "CFX", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm.confluxrpc.com", "https://conflux-espace-public.unifra.io", "https://1030.rpc.thirdweb.com"] }, public: { http: ["https://evm.confluxrpc.com", "https://conflux-espace-public.unifra.io", "https://1030.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Conflux Scan", url: "https://evm.confluxscan.io" } },
};

const mantaPacific: Chain = {
  id: 169,
  name: "Manta Pacific",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://pacific-rpc.manta.network/http", "https://manta-pacific.drpc.org", "https://169.rpc.thirdweb.com"] }, public: { http: ["https://pacific-rpc.manta.network/http", "https://manta-pacific.drpc.org", "https://169.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Manta Pacific Explorer", url: "https://pacific-explorer.manta.network" } },
};

const reya: Chain = {
  id: 1729,
  name: "Reya Network",
  nativeCurrency: { name: "Reya", symbol: "REYA", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.reya.network", "https://1729.rpc.thirdweb.com"] }, public: { http: ["https://rpc.reya.network", "https://1729.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Reya Explorer", url: "https://explorer.reya.network" } },
};

const intuition: Chain = {
  id: 1155,
  name: "Intuition",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.intuition.systems", "https://1155.rpc.thirdweb.com"] }, public: { http: ["https://rpc.intuition.systems", "https://1155.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Intuition Explorer", url: "https://explorer.intuition.systems" } },
};

const plume: Chain = {
  id: 98866,
  name: "Plume",
  nativeCurrency: { name: "Plume", symbol: "PLUME", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.plume.org", "https://plume.drpc.org", "https://plume-mainnet.gateway.tatum.io"] }, public: { http: ["https://rpc.plume.org", "https://plume.drpc.org", "https://plume-mainnet.gateway.tatum.io"] } },
  blockExplorers: { default: { name: "Plume Explorer", url: "https://explorer.plume.org" } },
};

const superposition: Chain = {
  id: 55244,
  name: "Superposition",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.superposition.so", "https://55244.rpc.thirdweb.com"] }, public: { http: ["https://rpc.superposition.so", "https://55244.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Superposition Explorer", url: "https://explorer.superposition.so" } },
};

const monad: Chain = {
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz", "https://rpc1.monad.xyz", "https://rpc3.monad.xyz", "https://rpc-mainnet.monadinfra.com"] }, public: { http: ["https://rpc.monad.xyz", "https://rpc1.monad.xyz", "https://rpc3.monad.xyz", "https://rpc-mainnet.monadinfra.com"] } },
  blockExplorers: { default: { name: "Monad Explorer", url: "https://monadexplorer.com" } },
};

const megaeth: Chain = {
  id: 4326,
  name: "MegaETH",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.megaeth.com/rpc", "https://megaeth.drpc.org", "https://rpc-megaeth-mainnet.globalstake.io"] }, public: { http: ["https://mainnet.megaeth.com/rpc", "https://megaeth.drpc.org", "https://rpc-megaeth-mainnet.globalstake.io"] } },
  blockExplorers: { default: { name: "MegaETH Explorer", url: "https://www.megaexplorer.xyz" } },
};

const katana: Chain = {
  id: 747474,
  name: "Katana",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.katana.network/", "https://katana.drpc.org/", "https://katana.gateway.tenderly.co", "https://747474.rpc.thirdweb.com/"] }, public: { http: ["https://rpc.katana.network/", "https://katana.drpc.org/", "https://katana.gateway.tenderly.co", "https://747474.rpc.thirdweb.com/"] } },
  blockExplorers: { default: { name: "Katana Explorer", url: "https://katanascan.com" } },
};

const syndicateCommons: Chain = {
  id: 510003,
  name: "Syndicate Commons",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.syndicate.io", "https://510003.rpc.thirdweb.com"] }, public: { http: ["https://rpc.syndicate.io", "https://510003.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Syndicate Explorer", url: "https://explorer.syndicate.io" } },
};

const race: Chain = {
  id: 6805,
  name: "RACE",
  nativeCurrency: { name: "Race", symbol: "RACE", decimals: 18 },
  rpcUrls: { default: { http: ["https://race.rpc.thirdweb.com"] }, public: { http: ["https://race.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "RACE Explorer", url: "https://race.explorer.thirdweb.com" } },
};

const doma: Chain = {
  id: 97477,
  name: "Doma",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.doma.finance", "https://97477.rpc.thirdweb.com"] }, public: { http: ["https://rpc.doma.finance", "https://97477.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Doma Explorer", url: "https://explorer.doma.finance" } },
};

const b2: Chain = {
  id: 223,
  name: "B2",
  nativeCurrency: { name: "B2", symbol: "B2", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.b2-rpc.com", "https://223.rpc.thirdweb.com"] }, public: { http: ["https://mainnet.b2-rpc.com", "https://223.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "B2 Explorer", url: "https://b2-explorer.com" } },
};

const juchain: Chain = {
  id: 210000,
  name: "JuChain Mainnet",
  nativeCurrency: { name: "JuChain", symbol: "JUCHAIN", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.juchain.org", "https://210000.rpc.thirdweb.com"] }, public: { http: ["https://rpc.juchain.org", "https://210000.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "JuChain Explorer", url: "https://explorer.juchain.org" } },
};

const mind: Chain = {
  id: 228,
  name: "Mind Network",
  nativeCurrency: { name: "Mind", symbol: "MIND", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mindnetwork.xyz", "https://228.rpc.thirdweb.com"] }, public: { http: ["https://rpc.mindnetwork.xyz", "https://228.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Mind Explorer", url: "https://explorer.mindnetwork.xyz" } },
};

const og: Chain = {
  id: 16661,
  name: "0G Mainnet",
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.0g.ai", "https://16661.rpc.thirdweb.com"] }, public: { http: ["https://rpc.0g.ai", "https://16661.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "0G Explorer", url: "https://explorer.0g.ai" } },
};

const zero: Chain = {
  id: 543210,
  name: "ZERO Network",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.zerion.io/v1/zero", "https://zero.drpc.org", "https://543210.rpc.thirdweb.com"] }, public: { http: ["https://rpc.zerion.io/v1/zero", "https://zero.drpc.org", "https://543210.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "ZERO Explorer", url: "https://explorer.zerion.io/zero" } },
};

const geb: Chain = {
  id: 11501,
  name: "GEB",
  nativeCurrency: { name: "GEB", symbol: "GEB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.geb.network", "https://11501.rpc.thirdweb.com"] }, public: { http: ["https://rpc.geb.network", "https://11501.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "GEB Explorer", url: "https://explorer.geb.network" } },
};

const flow: Chain = {
  id: 747,
  name: "Flow EVM",
  nativeCurrency: { name: "Flow", symbol: "FLOW", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.evm.nodes.onflow.org", "https://747.rpc.thirdweb.com"] }, public: { http: ["https://mainnet.evm.nodes.onflow.org", "https://747.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Flow Explorer", url: "https://evm.flowscan.io" } },
};

const openledger: Chain = {
  id: 1612,
  name: "OpenLedger",
  nativeCurrency: { name: "OpenLedger", symbol: "OPEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.openledger.xyz", "https://1612.rpc.thirdweb.com"] }, public: { http: ["https://rpc.openledger.xyz", "https://1612.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "OpenLedger Explorer", url: "https://scan.openledger.xyz" } },
};

const stable: Chain = {
  id: 988,
  name: "Stable",
  nativeCurrency: { name: "gUSDT", symbol: "gUSDT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.stable.xyz"] }, public: { http: ["https://rpc.stable.xyz"] } },
  blockExplorers: { default: { name: "Stable Explorer", url: "https://explorer.stable.xyz" } },
};

const tac: Chain = {
  id: 239,
  name: "TAC",
  nativeCurrency: { name: "TAC", symbol: "TAC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.tac.build", "https://239.rpc.thirdweb.com"] }, public: { http: ["https://rpc.tac.build", "https://239.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "TAC Explorer", url: "https://explorer.tac.build" } },
};

const b3: Chain = {
  id: 8333,
  name: "B3",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet-rpc.b3.fun", "https://8333.rpc.thirdweb.com"] }, public: { http: ["https://mainnet-rpc.b3.fun", "https://8333.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "B3 Explorer", url: "https://explorer.b3.fun" } },
};

const citrea: Chain = {
  id: 4114,
  name: "Citrea",
  nativeCurrency: { name: "Citrea Bitcoin", symbol: "cBTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.citrea.xyz"] }, public: { http: ["https://rpc.mainnet.citrea.xyz"] } },
  blockExplorers: { default: { name: "Citrea Explorer", url: "https://explorer.mainnet.citrea.xyz" } },
};

const cronos: Chain = {
  id: 25,
  name: "Cronos",
  nativeCurrency: { name: "Cronos", symbol: "CRO", decimals: 18 },
  rpcUrls: { default: { http: ["https://cronos.drpc.org", "https://cronos.blockpi.network/v1/rpc/public"] }, public: { http: ["https://cronos.drpc.org", "https://cronos.blockpi.network/v1/rpc/public"] } },
  blockExplorers: { default: { name: "Cronos Explorer", url: "https://explorer.cronos.org" } },
};

const fuse: Chain = {
  id: 122,
  name: "Fuse",
  nativeCurrency: { name: "Fuse", symbol: "FUSE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.fuse.io", "https://fuse.drpc.org"] }, public: { http: ["https://rpc.fuse.io", "https://fuse.drpc.org"] } },
  blockExplorers: { default: { name: "Fuse Explorer", url: "https://explorer.fuse.io" } },
};

const kaia: Chain = {
  id: 8217,
  name: "Kaia",
  nativeCurrency: { name: "Kaia", symbol: "KAIA", decimals: 18 },
  rpcUrls: { default: { http: ["https://public-en.node.kaia.io", "https://kaia.blockpi.network/v1/rpc/public"] }, public: { http: ["https://public-en.node.kaia.io", "https://kaia.blockpi.network/v1/rpc/public"] } },
  blockExplorers: { default: { name: "Kaia Explorer", url: "https://kaiascope.com" } },
};

const moonbeam: Chain = {
  id: 1284,
  name: "Moonbeam",
  nativeCurrency: { name: "Glimmer", symbol: "GLMR", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.api.moonbeam.network", "https://moonbeam.drpc.org", "https://1284.rpc.thirdweb.com"] }, public: { http: ["https://rpc.api.moonbeam.network", "https://moonbeam.drpc.org", "https://1284.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Moonbeam Explorer", url: "https://moonscan.io" } },
};

const moonriver: Chain = {
  id: 1285,
  name: "Moonriver",
  nativeCurrency: { name: "Moonriver", symbol: "MOVR", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.api.moonriver.moonbeam.network", "https://moonriver.drpc.org", "https://1285.rpc.thirdweb.com"] }, public: { http: ["https://rpc.api.moonriver.moonbeam.network", "https://moonriver.drpc.org", "https://1285.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Moonriver Explorer", url: "https://moonriver.moonscan.io" } },
};

const astar: Chain = {
  id: 592,
  name: "Astar",
  nativeCurrency: { name: "Astar", symbol: "ASTR", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm.astar.network", "https://astar.public.blastapi.io", "https://592.rpc.thirdweb.com"] }, public: { http: ["https://evm.astar.network", "https://astar.public.blastapi.io", "https://592.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Astar EVM Explorer", url: "https://astar.blockscout.com" } },
};

const aurora: Chain = {
  id: 1313161554,
  name: "Aurora",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.aurora.dev", "https://1rpc.io/aurora", "https://aurora.drpc.org"] }, public: { http: ["https://mainnet.aurora.dev", "https://1rpc.io/aurora", "https://aurora.drpc.org"] } },
  blockExplorers: { default: { name: "AuroraScan", url: "https://aurorascan.dev" } },
};

const metis: Chain = {
  id: 1088,
  name: "Metis",
  nativeCurrency: { name: "Metis", symbol: "METIS", decimals: 18 },
  rpcUrls: { default: { http: ["https://andromeda.metis.io/?owner=1088", "https://metis-rpc.publicnode.com", "https://metis.drpc.org"] }, public: { http: ["https://andromeda.metis.io/?owner=1088", "https://metis-rpc.publicnode.com", "https://metis.drpc.org"] } },
  blockExplorers: { default: { name: "Metis Explorer", url: "https://andromeda-explorer.metis.io" } },
};

const boba: Chain = {
  id: 288,
  name: "Boba",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.boba.network", "https://1rpc.io/boba/eth", "https://gateway.tenderly.co/public/boba-ethereum"] }, public: { http: ["https://mainnet.boba.network", "https://1rpc.io/boba/eth", "https://gateway.tenderly.co/public/boba-ethereum"] } },
  blockExplorers: { default: { name: "Bobascan", url: "https://bobascan.org" } },
};

const pulsechain: Chain = {
  id: 369,
  name: "PulseChain",
  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.pulsechain.com", "https://pulsechain-rpc.publicnode.com", "https://rpc-pulsechain.g4mm4.io"] }, public: { http: ["https://rpc.pulsechain.com", "https://pulsechain-rpc.publicnode.com", "https://rpc-pulsechain.g4mm4.io"] } },
  blockExplorers: { default: { name: "PulseScan", url: "https://scan.pulsechain.com" } },
};

const kcc: Chain = {
  id: 321,
  name: "KCC Mainnet",
  nativeCurrency: { name: "KuCoin Token", symbol: "KCS", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-mainnet.kcc.network", "https://kcc.drpc.org", "https://kcc-rpc.com"] }, public: { http: ["https://rpc-mainnet.kcc.network", "https://kcc.drpc.org", "https://kcc-rpc.com"] } },
  blockExplorers: { default: { name: "KCC Scan", url: "https://scan.kcc.io" } },
};

const flare: Chain = {
  id: 14,
  name: "Flare",
  nativeCurrency: { name: "Flare", symbol: "FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://flare-api.flare.network/ext/C/rpc", "https://rpc.ankr.com/flare", "https://flare.rpc.thirdweb.com", "https://rpc.au.cc/flare"] }, public: { http: ["https://flare-api.flare.network/ext/C/rpc", "https://rpc.ankr.com/flare", "https://flare.rpc.thirdweb.com", "https://rpc.au.cc/flare"] } },
  blockExplorers: { default: { name: "Flare Explorer", url: "https://flare-explorer.flare.network" } },
};

const xLayer: Chain = {
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com", "https://xlayer.drpc.org", "https://196.rpc.thirdweb.com"] }, public: { http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com", "https://xlayer.drpc.org", "https://196.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "OKX X Layer Explorer", url: "https://www.okx.com/explorer/xlayer" } },
};

const shibarium: Chain = {
  id: 109,
  name: "Shibarium",
  nativeCurrency: { name: "Bone ShibaSwap", symbol: "BONE", decimals: 18 },
  rpcUrls: { default: { http: ["https://shibarium.drpc.org", "https://rpc.shibarium.shib.io", "https://109.rpc.thirdweb.com"] }, public: { http: ["https://shibarium.drpc.org", "https://rpc.shibarium.shib.io", "https://109.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Shibariumscan", url: "https://shibariumscan.io" } },
};

const degen: Chain = {
  id: 666666666,
  name: "Degen",
  nativeCurrency: { name: "Degen", symbol: "DEGEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.degen.tips", "https://degen.drpc.org", "https://666666666.rpc.thirdweb.com"] }, public: { http: ["https://rpc.degen.tips", "https://degen.drpc.org", "https://666666666.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Degen Explorer", url: "https://explorer.degen.tips" } },
};

const beam: Chain = {
  id: 4337,
  name: "Beam",
  nativeCurrency: { name: "Beam", symbol: "BEAM", decimals: 18 },
  rpcUrls: { default: { http: ["https://build.onbeam.com/rpc", "https://subnets.avax.network/beam/mainnet/rpc", "https://4337.rpc.thirdweb.com"] }, public: { http: ["https://build.onbeam.com/rpc", "https://subnets.avax.network/beam/mainnet/rpc", "https://4337.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Beam Explorer", url: "https://subnets.avax.network/beam" } },
};

const ronin: Chain = {
  id: 2020,
  name: "Ronin",
  nativeCurrency: { name: "Ronin", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.roninchain.com/rpc", "https://ronin.drpc.org", "https://ronin.lgns.net/rpc"] }, public: { http: ["https://api.roninchain.com/rpc", "https://ronin.drpc.org", "https://ronin.lgns.net/rpc"] } },
  blockExplorers: { default: { name: "Ronin Explorer", url: "https://app.roninchain.com" } },
};

const opbnb: Chain = {
  id: 204,
  name: "opBNB",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://opbnb-mainnet-rpc.bnbchain.org", "https://opbnb.drpc.org", "https://opbnb-rpc.publicnode.com", "https://1rpc.io/opbnb"] }, public: { http: ["https://opbnb-mainnet-rpc.bnbchain.org", "https://opbnb.drpc.org", "https://opbnb-rpc.publicnode.com", "https://1rpc.io/opbnb"] } },
  blockExplorers: { default: { name: "opBNBScan", url: "https://opbnbscan.com" } },
};

const gravity: Chain = {
  id: 1625,
  name: "Gravity",
  nativeCurrency: { name: "Gravity", symbol: "G", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.gravity.xyz", "https://1625.rpc.thirdweb.com"] }, public: { http: ["https://rpc.gravity.xyz", "https://1625.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Gravity Explorer", url: "https://explorer.gravity.xyz" } },
};

const merlin: Chain = {
  id: 4200,
  name: "Merlin",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.merlinchain.io", "https://merlin.drpc.org", "https://4200.rpc.thirdweb.com"] }, public: { http: ["https://rpc.merlinchain.io", "https://merlin.drpc.org", "https://4200.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Merlin Scan", url: "https://scan.merlinchain.io" } },
};

const taikoAlethia: Chain = {
  id: 167000,
  name: "Taiko Alethia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.taiko.xyz", "https://taiko.drpc.org"] }, public: { http: ["https://rpc.mainnet.taiko.xyz", "https://taiko.drpc.org"] } },
  blockExplorers: { default: { name: "Taikoscan", url: "https://taikoscan.io" } },
};

const plasma: Chain = {
  id: 9745,
  name: "Plasma",
  nativeCurrency: { name: "Plasma", symbol: "XPL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.plasma.to", "https://plasma.drpc.org", "https://9745.rpc.thirdweb.com"] }, public: { http: ["https://rpc.plasma.to", "https://plasma.drpc.org", "https://9745.rpc.thirdweb.com"] } },
  blockExplorers: { default: { name: "Plasmascan", url: "https://plasmascan.to" } },
};

const hashkey: Chain = {
  id: 177,
  name: "HashKey",
  nativeCurrency: { name: "HashKey Token", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.hsk.xyz", "https://hashkey.drpc.org", "https://rpc.hashkey.hsk.xyz"] }, public: { http: ["https://mainnet.hsk.xyz", "https://hashkey.drpc.org", "https://rpc.hashkey.hsk.xyz"] } },
  blockExplorers: { default: { name: "HashKey Explorer", url: "https://explorer.hsk.xyz" } },
};

const hemi: Chain = {
  id: 43111,
  name: "Hemi",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hemi.network/rpc", "https://hemi.drpc.org"] }, public: { http: ["https://rpc.hemi.network/rpc", "https://hemi.drpc.org"] } },
  blockExplorers: { default: { name: "Hemi Explorer", url: "https://explorer.hemi.xyz" } },
};

const hyperevm: Chain = {
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "Hyperliquid", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm", "https://1rpc.io/hyperliquid", "https://hyperliquid.drpc.org"] }, public: { http: ["https://rpc.hyperliquid.xyz/evm", "https://1rpc.io/hyperliquid", "https://hyperliquid.drpc.org"] } },
  blockExplorers: { default: { name: "HyperEVM Scan", url: "https://hyperevmscan.io" } },
};

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

// Default WC project ID baked in. Overridden by NEXT_PUBLIC_WC_PROJECT_ID at build time.
// The empty-string-from-.env.local case is handled by falling back to this default
// so WalletConnect / Coinbase remain available as QR-code fallbacks for users whose
// browser extensions conflict on window.ethereum (e.g. MetaMask vs Zerion).
const DEFAULT_WC_PROJECT_ID = "3090760ada2bf4a459a27506fcdc16ec";
const projectId = (process.env.NEXT_PUBLIC_WC_PROJECT_ID && process.env.NEXT_PUBLIC_WC_PROJECT_ID.length > 0)
  ? process.env.NEXT_PUBLIC_WC_PROJECT_ID
  : DEFAULT_WC_PROJECT_ID;
if (!process.env.NEXT_PUBLIC_WC_PROJECT_ID) {
  console.warn("[wagmi] NEXT_PUBLIC_WC_PROJECT_ID not set — using built-in default. Get your own at https://cloud.reown.com");
}

const wagmiConnectors = [
  walletConnect({ projectId, showQrModal: true }),
  coinbaseWallet({ appName: "WCORE", appLogoUrl: "/icon.svg" }),
];

export const config = createConfig({
  chains: [base, arbitrum, optimism, polygon, bsc, avalanche, gnosis, soneium,
    mainnet, zksync, scroll, linea, mantle, blast, sonic, celo, unichain, berachain, ink, abstract, worldchain, fraxtal, polygonZkEvm, zora, mode, sei, superseed, shape, ancient8, bob, lisk, metalL2, redstone, robinhoodChain, appchain, camp, duckchain, cyber, rari, zircuit,
    mitosis, fogo, core, conflux, mantaPacific, reya, intuition, plume, superposition, monad, megaeth, katana, syndicateCommons, race, doma, b2, juchain, mind, og, zero, geb, flow, openledger, stable, tac, b3, citrea, cronos, fuse, kaia,     moonbeam, moonriver, astar, aurora, metis, boba, pulsechain, kcc, flare, xLayer, shibarium, degen, beam, ronin, opbnb,
    gravity, merlin, taikoAlethia, plasma, hashkey, hemi, hyperevm,
    immutableZkEvm, morph, mezo, swellchain, swan, vana, story],
  // as any needed — wagmi connector types mismatch with custom chain list
  connectors: wagmiConnectors as any,
  transports: {
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(),
    [avalanche.id]: http(),
    [gnosis.id]: http(),
    [soneium.id]: http(),
    [mainnet.id]: http(),
    [zksync.id]: http(),
    [scroll.id]: http(),
    [linea.id]: http(),
    [mantle.id]: http(),
    [blast.id]: http(),
    [sonic.id]: http(),
    [celo.id]: http(),
    [unichain.id]: http(),
    [berachain.id]: http(),
    [ink.id]: http(),
    [abstract.id]: http(),
    [worldchain.id]: http(),
    [fraxtal.id]: http(),
    [polygonZkEvm.id]: http(),
    [zora.id]: http(),
    [mode.id]: http(),
    [sei.id]: http(),
    [superseed.id]: http(),
    [shape.id]: http(),
    [ancient8.id]: http(),
    [bob.id]: http(),
    [lisk.id]: http(),
    [metalL2.id]: http(),
    [redstone.id]: http(),
    [robinhoodChain.id]: http(),
    [appchain.id]: http(),
    [camp.id]: http(),
    [duckchain.id]: http(),
    [cyber.id]: http(),
    [rari.id]: http(),
    [zircuit.id]: http(),
    [mitosis.id]: http(),
    [fogo.id]: http(),
    [core.id]: http(),
    [conflux.id]: http(),
    [mantaPacific.id]: http(),
    [reya.id]: http(),
    [intuition.id]: http(),
    [plume.id]: http(),
    [superposition.id]: http(),
    [monad.id]: http(),
    [megaeth.id]: http(),
    [katana.id]: http(),
    [syndicateCommons.id]: http(),
    [race.id]: http(),
    [doma.id]: http(),
    [b2.id]: http(),
    [juchain.id]: http(),
    [mind.id]: http(),
    [og.id]: http(),
    [zero.id]: http(),
    [geb.id]: http(),
    [flow.id]: http(),
    [openledger.id]: http(),
    [stable.id]: http(),
    [tac.id]: http(),
    [b3.id]: http(),
    [citrea.id]: http(),
    [cronos.id]: http(),
    [fuse.id]: http(),
    [kaia.id]: http(),
    [moonbeam.id]: http(),
    [moonriver.id]: http(),
    [astar.id]: http(),
    [aurora.id]: http(),
    [metis.id]: http(),
    [boba.id]: http(),
    [pulsechain.id]: http(),
    [kcc.id]: http(),
    [flare.id]: http(),
    [xLayer.id]: http(),
    [shibarium.id]: http(),
    [degen.id]: http(),
    [beam.id]: http(),
    [ronin.id]: http(),
    [opbnb.id]: http(),
    [gravity.id]: http(),
    [merlin.id]: http(),
    [taikoAlethia.id]: http(),
    [plasma.id]: http(),
    [hashkey.id]: http(),
    [hemi.id]: http(),
    [hyperevm.id]: http(),
    [immutableZkEvm.id]: http(),
    [morph.id]: http(),
    [mezo.id]: http(),
    [swellchain.id]: http(),
    [swan.id]: http(),
    [vana.id]: http(),
    [story.id]: http(),
  },
  ssr: false,
});
