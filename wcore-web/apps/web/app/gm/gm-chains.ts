import { getActiveFactoryChains, getFactoryAddress } from "@wcore/shared";

export interface GmChain {
  key: string;
  name: string;
}

const GM_CHAIN_NAMES: Record<string, string> = {
  ethereum: "Ethereum", base: "Base", arbitrum_one: "Arbitrum One",
  optimism: "Optimism", polygon: "Polygon", bsc: "BNB Chain",
  avalanche: "Avalanche", gnosis: "Gnosis", soneium: "Soneium",
  zksync_era: "zkSync Era", scroll: "Scroll", linea: "Linea",
  mantle: "Mantle", celo: "Celo", fraxtal: "Fraxtal",
  worldchain: "World Chain", unichain: "Unichain", berachain: "Berachain",
  ink: "Ink", abstract: "Abstract", somnia: "Somnia", etherlink: "Etherlink", arbitrum_nova: "Arbitrum Nova", flow: "Flow EVM", dbk_chain: "DBK Chain",
  zora: "Zora", mode: "Mode",
  sei: "Sei", shape: "Shape",
  bob: "BOB",
  metal_l2: "Metal L2", robinhood_chain: "Robinhood Chain", appchain: "AppChain",
  camp: "Camp", duckchain: "DuckChain", cyber: "Cyber",
  zircuit: "Zircuit", openledger: "OpenLedger",
  stable: "Stable", tac: "TAC", mitosis: "Mitosis", sonic: "Sonic", citrea: "Citrea", cronos: "Cronos", fuse: "Fuse", kaia: "Kaia",
  astar: "Astar",
  aurora: "Aurora",
  metis: "Metis",
  boba: "Boba",
  pulsechain: "PulseChain",
  kcc: "KCC Mainnet",
  core: "Core",
  flare: "Flare",
  x_layer: "X Layer",
  shibarium: "Shibarium",
  beam: "Beam",
  ronin: "Ronin",
  opbnb: "opBNB",
  merlin: "Merlin",
  manta_pacific: "Manta Pacific",
  taiko_alethia: "Taiko Alethia",
  plasma: "Plasma",
  hashkey: "HashKey",
  hemi: "Hemi",
  hyperevm: "HyperEVM",
  immutable: "Immutable zkEVM",
  morph: "Morph",
  mezo: "Mezo",
  reya: "Reya Network",
  swan: "Swan",
  vana: "Vana",
  story: "Story",
  intuition: "Intuition",
  plume: "Plume",
  monad: "Monad",
  megaeth: "MegaETH",
  doma: "Doma",
  b2: "B2",
  katana: "Katana",
  arc: "Arc",
  moca: "Moca Chain",
  elysium: "Elysium",
};

const SOON_CHAIN_CANDIDATES: GmChain[] = [
  { key: "fogo", name: "Fogo" },
  { key: "astar", name: "Astar" },
  { key: "rootstock", name: "Rootstock" },
  { key: "kcc", name: "KCC" },
  { key: "xdc", name: "XDC Network" },
  { key: "conflux", name: "Conflux eSpace" },
  { key: "merlin", name: "Merlin" },
  { key: "manta_pacific", name: "Manta Pacific" },
  { key: "taiko_alethia", name: "Taiko Alethia" },
  { key: "plasma", name: "Plasma" },
  { key: "hashkey", name: "HashKey" },
  { key: "hemi", name: "Hemi" },
  { key: "hyperevm", name: "HyperEVM" },
  { key: "immutable", name: "Immutable zkEVM" },
  { key: "morph", name: "Morph" },
  { key: "mezo", name: "Mezo" },
  { key: "reya", name: "Reya Network" },
  { key: "swan", name: "Swan" },
  { key: "vana", name: "Vana" },
  { key: "story", name: "Story" },
  { key: "intuition", name: "Intuition" },
  { key: "plume", name: "Plume" },
  { key: "somnia", name: "Somnia" },
  { key: "monad", name: "Monad" },
  { key: "megaeth", name: "MegaETH" },
  { key: "matchain", name: "Matchain" },
  { key: "doma", name: "Doma" },
  { key: "b2", name: "B2" },
  { key: "codex", name: "Codex" },
  { key: "juchain", name: "JuChain Mainnet" },
  { key: "katana", name: "Katana" },
  { key: "lens", name: "Lens" },
  { key: "og", name: "0G Mainnet" },
  { key: "zetachain", name: "ZetaChain" },
  { key: "zklinknova", name: "zkLink Nova" },
  { key: "geb", name: "GEB" },
  { key: "bitlayer", name: "Bitlayer" },
  { key: "arc", name: "Arc" },
  { key: "moca", name: "Moca Chain" },
];

export function getGmChains(): GmChain[] {
  return getActiveFactoryChains()
    .filter((key) => GM_CHAIN_NAMES[key])
    .map((key) => ({ key, name: GM_CHAIN_NAMES[key]! }));
}

export function getSoonChains(): GmChain[] {
  return SOON_CHAIN_CANDIDATES.filter((chain) => !getFactoryAddress(chain.key));
}
