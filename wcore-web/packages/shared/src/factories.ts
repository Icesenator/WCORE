export const GM_PLATFORM_OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

export const GM_FACTORIES: Record<string, { address: string; chainId: number }> = {
  ethereum: { address: "0x07aa38ac2130ecc3b5b9d53ea7fed8b5727c8640", chainId: 1 },
  base: { address: "0xe7cfd4b041650ddc8861ffe066a2cd2cce0f6ecb", chainId: 8453 },
  arbitrum_one: { address: "0x8de14dd8d46cbaf88215ee554b8656a54a4580c2", chainId: 42161 },
  optimism: { address: "0x5264e7cf672f9bceab500906a38b4b85556b5156", chainId: 10 },
  polygon: { address: "0xedc34347c9196f1e1b58478e16b909adf1e686fc", chainId: 137 },
  bsc: { address: "0xb0d332778a61e23a3aa18a2e951a41b2e85353d4", chainId: 56 },
  avalanche: { address: "0x41f1d0773a28110427981f61cd1558ea5bc743f7", chainId: 43114 },
  gnosis: { address: "0xebb69593c4e3321ff25d0689bce6bf940c0698fe", chainId: 100 },
  soneium: { address: "0x103b96955462a06eee2b00ff12c6455e3132f38e", chainId: 1868 },
  zksync_era: { address: "0x052028eb444f53a4060359ac06175bf90a72f91f", chainId: 324 },
  scroll: { address: "0x592948005b31f70b4af1e565bf6105dd8a1f1f5b", chainId: 534352 },
  linea: { address: "0x5b06b9015e6203f0f1d01023b50179c41927fa9c", chainId: 59144 },
  mantle: { address: "0x1050b7e894e37d51fbfcb1c2a2bb29aa628447ce", chainId: 5000 },
  blast: { address: "0x88ec9eb3489282e10d7964d4a26431518bd7bf2b", chainId: 81457 },
  celo: { address: "0xa71fd1d986cbacfb6a7c4adbb4391641d3bc1b45", chainId: 42220 },
  fraxtal: { address: "0x49b825f0bcb2a1633dff0baff0f4592732943af9", chainId: 252 },
  worldchain: { address: "0x44eef927937c9cc495420f922510d02d60e46498", chainId: 480 },
  unichain: { address: "0x5bb13ad09aa5a4a5cfeba1c2b949a4b1f89f2efd", chainId: 130 },
  berachain: { address: "0x949a4fdbc5ea0533977bf6b68f8d44ef4bbac3bd", chainId: 80094 },
  ink: { address: "0xc7c30f076f8259c42ecf20723f8173f4b7c66135", chainId: 57073 },
  abstract: { address: "0x7635c2049a59f192727249b1851af2e7d97e56d9", chainId: 2741 },
  zora: { address: "0xd0f92622a510f82eef0178e596a4d6f17418c3c2", chainId: 7777777 },
  mode: { address: "0x7480f3d34784f45cd3c7f2f668822ee9a8029a90", chainId: 34443 },
  sei: { address: "0x71e7436f0854890d7984198e22226fb67f1dce24", chainId: 1329 },
  superseed: { address: "0x69ef3319b7d0831b9da96eeb7065f09a058f1166", chainId: 5330 },
  shape: { address: "0xc1ad3bb5827403edf623e7011b3c435165d0eafa", chainId: 360 },
  bob: { address: "0xb1334b848f5da4e9a3bf6773abf492140f6d6a69", chainId: 60808 },
  lisk: { address: "0xcc57c6df12d926f958f36fe98c0c8a8008fac490", chainId: 1135 },
  metal_l2: { address: "0xd1ccba23ffc3657fb1562f26b5c4301e54836a6c", chainId: 1750 },
  redstone: { address: "0xd1ccba23ffc3657fb1562f26b5c4301e54836a6c", chainId: 690 },
  robinhood_chain: { address: "0x4d90e914871921f0443bda53f70def868d9f2960", chainId: 4663 },
  appchain: { address: "0xda65daf33f4492352171161e5a07631c5cc47e4f", chainId: 466 },
  camp: { address: "0x2d2eb5d89eae3f8687676da0462753481e3a7785", chainId: 484 },
  duckchain: { address: "0xb22fb1dbbaf87990b738502bb5f3eed5c19a43e4", chainId: 5545 },
  cyber: { address: "0x0e6a5974de12170d3829b9b859610ed684eafd47", chainId: 7560 },
  zircuit: { address: "0xecdfe2eea30176a7817337d9a12106ba0df9a4a2", chainId: 48900 },
  openledger: { address: "0x21ebea3a638b810fd8649f34d39ce2439bcdd5f6", chainId: 1612 },
  stable: { address: "0x67d96a81e44761edd3e9a4ba5e3872ac5980122d", chainId: 988 },
  tac: { address: "0xdc73b2ddf853bd4959288b45d5e5ac348c73075a", chainId: 239 },
  mitosis: { address: "0x540dbcb3b2055ef5790b9fdaa197216bb4aac3c2", chainId: 124816 },
  b3: { address: "0x14bfaa1302ab5ea8041d3dfec9abb668efbf2f34", chainId: 8333 },
  sonic: { address: "0xb22fb1dbbaf87990b738502bb5f3eed5c19a43e4", chainId: 146 },
  citrea: { address: "0xf4b08900af3c44e42dfebe60624d5c7c32e743fd", chainId: 4114 },
  cronos: { address: "0xef4e94691589224a92e26741e098a3cbcd63d169", chainId: 25 },
  fuse: { address: "0x14716e9e0d8a6b671ae21d8d0fc22a79427adb0e", chainId: 122 },
  kaia: { address: "0x4216e11295c2727d5255ac73100031e5ad211b1e", chainId: 8217 },
  moonbeam: { address: "0x3fa756f1da5027a8ff692b2d65dface8eb446aaf", chainId: 1284 },
  moonriver: { address: "0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1", chainId: 1285 },
  astar: { address: "0x22606f8bb6a2419289583e7629fea788ece92ba7", chainId: 592 },
  aurora: { address: "0x3352c8ff0b225760cfb63840c212d39771cc1c59", chainId: 1313161554 },
  metis: { address: "0x493d13b68fcaf08a5036b185c29a08f22046cf0e", chainId: 1088 },
  boba: { address: "0xced8cacde0ea15adf489f6fca9ed65dff2fb1efe", chainId: 288 },
  pulsechain: { address: "0x245cb609aaff4b375ad3c60a4d2397a6963895c3", chainId: 369 },
  // KCC mainnet is pre-London (no baseFeePerGas) → pre-Shanghai → no PUSH0.
  // Both contracts were deployed via Paris EVM build (solc 0.8.19, evmVersion=paris).
  // Factory: tx 0x2a8a7ee971c531ab726fcdd6f13df7a6bcda651c067098c4b27966be0aa6c835
  //   block 52727377, bytecode 3490 chars, 0 PUSH0.
  // GmOnChain impl: tx 0x71d2ca39496a925ba5c5947529eb1aedd59fa41a3eb248a50b100657cc0e79c7
  //   block 52727373, bytecode 6246 chars, 0 PUSH0.
  // See `PARIS_BUILD_CHAINS` in apps/web/app/dev/deploy/build-selector.ts.
  kcc: { address: "0x76edb44d846b6378519aeed5c9ee2bcabcd2c15a", chainId: 321 },
  // Core DAO mainnet. Shanghai-capable (factory bytecode contains PUSH0 and
  // eth_getCode is non-empty → standard build, no Paris fallback needed).
  // Factory implementation() → 0xaf8bef6e942dbfef3de23c5881158e89595bec3e (GmOnChain impl).
  core: { address: "0x4532a3d14486bf7ac9cc3572d5db801711022312", chainId: 1116 },
  // Flare mainnet. Shanghai-capable (factory 1696 bytes, 61 PUSH0 opcodes) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x14fbfff414fad213cba7c15b71716dd464876d1f (GmOnChain impl, 2237 bytes).
  flare: { address: "0xbac99bdf0ec875dd9c20aa837441102665f4ab9a", chainId: 14 },
  // X Layer mainnet (OKX L2). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xa8ebec297788d13e21392050bf3948300fd623c8 (GmOnChain impl, 2237 bytes).
  x_layer: { address: "0x7d684eec7555ea8db863cdebe59474b63aae7462", chainId: 196 },
  // Shibarium mainnet. Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xbbfd44638fa928bfc7a28be19aafafc443222eef (GmOnChain impl, 2237 bytes).
  // Note: original www.shibrpc.com DNS fails — drpc.org + shib.io are the working RPCs.
  shibarium: { address: "0x04e5d61ba8cba9292b0a7f1d6242197a5ac7c0e4", chainId: 109 },
  // Degen mainnet (Base L3). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas ~12 gwei) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x5863a056ad0cbe06876b49c9ab7c50bcd0432718 (GmOnChain impl, 2237 bytes).
  degen: { address: "0xc3e5ef8c71712f55fabc6b3c07844a49103c9d8f", chainId: 666666666 },
  // Beam mainnet (Avalanche subnet, gaming-focused). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas ~1 gwei) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xb2d644fd73c2265d4e77e224d6ba9f8a4640d573 (GmOnChain impl, 2237 bytes).
  beam: { address: "0x972ccf14bd15754a3af879df4cb3416ddb000314", chainId: 4337 },
  // Ronin mainnet (Sky Mavis gaming chain). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas ~20 gwei) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xf6115c66ac8a2c0afbc698f44bf95b6da576796e (GmOnChain impl, 2237 bytes).
  ronin: { address: "0x65e1912819c08e49a3c46eea3f05e9b60473807b", chainId: 2020 },
  // opBNB mainnet (BNB Chain L2 / OP Stack Bedrock). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (genesis baseFeePerGas 0x53724e0, OP Stack EIP-1559 — latest can read 0x0 when idle).
  // Standard build, no Paris fallback needed.
  // Factory implementation() → 0x82ee3b6ef9f6b4af3a49a0a944d962cd0e745e2a (GmOnChain impl, 2237 bytes).
  opbnb: { address: "0x92d7a4784d4d11114f1eb79fe67b1ee0363b5748", chainId: 204 },
  // Gravity mainnet. Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x2ae71ff47b8beab5d8f6ad1411d787f5d4cfb3fa (GmOnChain impl, 2237 bytes).
  gravity: { address: "0x8d0cf2c602efdc3b696341cc03ec62e813771c48", chainId: 1625 },
  // Merlin mainnet (Bitcoin L2). Shanghai-capable (factory 1696 bytes, 61 PUSH0)
  // but pre-London (no baseFeePerGas → legacy gas pricing). Standard build OK.
  // Factory implementation() → 0x7021fd9cc5eb47cbae65401e7e30e8a348a5c6e1 (GmOnChain impl, 2237 bytes).
  merlin: { address: "0x22606f8bb6a2419289583e7629fea788ece92ba7", chainId: 4200 },
  // Manta Pacific mainnet. Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xe7a59341a4e64994e1531688d9ac0465850ead12 (GmOnChain impl, 2237 bytes).
  manta_pacific: { address: "0xf1ce6671f40506ee488a4cf69301cec187e33687", chainId: 169 },
  // Taiko Alethia mainnet. Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xc2dcf5024cb5ab40bed529a29ec3cf88efe5d857 (GmOnChain impl, 2237 bytes).
  taiko_alethia: { address: "0x2375bdb4f47835e984a863740a0d05c0278d37da", chainId: 167000 },
  // Plasma mainnet (XPL). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xd04f39cab83706d39ff6fd001b698b532c083351 (GmOnChain impl, 2237 bytes).
  plasma: { address: "0xff7abfe8e0975d4f8c68b27f3c1053dc4f151a98", chainId: 9745 },
  // HashKey Chain mainnet (HSK). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x7e573cf50c9a63b3df94e0110a80c3573442f2e3 (GmOnChain impl, 2237 bytes).
  hashkey: { address: "0x4a36400e6717d4201e22baf66832f06d8ad54bb1", chainId: 177 },
  // Hemi mainnet (Bitcoin-secured L2). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x439169fc5dfda12626bed153147b4eb1cd5686d0 (GmOnChain impl, 2237 bytes).
  hemi: { address: "0xd4930a277986021da6db82db18fd26e6c6c4a763", chainId: 43111 },
  // HyperEVM mainnet (Hyperliquid L1 EVM). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x6c247e1da61a9ca7604f78b518ae4dbda329fbd8 (GmOnChain impl, 2237 bytes).
  hyperevm: { address: "0xac53abe6ea605e37057cdb254768219f6eb183f0", chainId: 999 },
  // Immutable zkEVM mainnet (IMX). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xd931e6991691a8d40c5155a10a1767c2ea19ea73 (GmOnChain impl, 2237 bytes).
  immutable: { address: "0xcb9d414c0360a6886fdaf8a56b97d79a1bc79a6e", chainId: 13371 },
  // Morph mainnet (ETH L2). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x09df737457f7ae708706fb314b23ef315bbe7485 (GmOnChain impl, 2237 bytes).
  morph: { address: "0x6dfecaf825cc21685db6395b7f2375a1c1d3ce93", chainId: 2818 },
  // Mezo mainnet (Bitcoin L2, native BTC). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x46004a44e2b0ae9127c081a7e7c402e348d822f2 (GmOnChain impl, 2237 bytes).
  mezo: { address: "0x42fed67ad826a3f3f20a4e783e6800cc0be23c1f", chainId: 31612 },
  // Reya Network mainnet (REYA). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xc27fd79fad7cde5da93b562fdd0bd60838fe8323 (GmOnChain impl, 2237 bytes).
  reya: { address: "0x77f13c4522f0c5524ac53397ae8ec75613bc16ad", chainId: 1729 },
  // Swell Chain mainnet (ETH L2). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xaaf9c75f5cc4c8b001f2562173993445ed8946fa (GmOnChain impl, 2237 bytes).
  swellchain: { address: "0x3177892304a1b928f34b054e280cd77a0e83872a", chainId: 1923 },
  // Swan mainnet (ETH L2). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0x5cd87d2fdbdbbd1a46db7ccc42f4be5c73cc16d7 (GmOnChain impl, 2237 bytes).
  swan: { address: "0xf25ebed98426a4dc01e30a1e04ead7d3639579bd", chainId: 254 },
  // Vana mainnet (VANA). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xbac99bdf0ec875dd9c20aa837441102665f4ab9a (GmOnChain impl, 2237 bytes).
  vana: { address: "0x5bb633cab21365418569cadabf7eda2695d72d32", chainId: 1480 },
  // Story mainnet (IP). Shanghai-capable (factory 1696 bytes, 61 PUSH0) and
  // London (baseFeePerGas present) → standard build, no Paris fallback needed.
  // Factory implementation() → 0xcf7ec8bbf7c6352d33ff5e9b5b26750cc5a9632c (GmOnChain impl, 2237 bytes).
  story: { address: "0xaaf9c75f5cc4c8b001f2562173993445ed8946fa", chainId: 1514 },
  intuition: { address: "0xb6a0615caf1fc1d27688f77de251411776404110", chainId: 1155 },
  plume: { address: "0xc019e086f795661213b11884b52338e8752468d3", chainId: 98866 },
  superposition: { address: "0x8e2530ef73ef47a1f086f8baf423c1bdcd9e472f", chainId: 55244 },
  monad: { address: "0xd4930a277986021da6db82db18fd26e6c6c4a763", chainId: 143 },
  megaeth: { address: "0xc357a4e3741e57a9bf53a3ae1c7584e16413dd07", chainId: 4326 },
  doma: { address: "0x405376616102772a6045b5ad61f877fb31bafb93", chainId: 97477 },
  b2: { address: "0x4a36400e6717d4201e22baf66832f06d8ad54bb1", chainId: 223 },
  katana: { address: "0x79113a6c0517a2e748b87bab6e4058ad75eb4352", chainId: 747474 },
};

export function getFactoryChainIds(): number[] {
  return Object.values(GM_FACTORIES).map((f) => f.chainId);
}

// Canonical chainKey form used for ALL GM database rows (gm_contracts,
// onchain_gms, user_chain_gms). UPPERCASE matches the project-wide convention
// (the core chain registry normalizes to uppercase too). Always normalize a
// chainKey through this before writing it to, or matching it in, the DB.
export function canonicalChainKey(chainKey: string): string {
  return chainKey.trim().toUpperCase();
}

// Case-insensitive factory lookup. GM_FACTORIES keys are lowercase, but callers
// may pass canonical (UPPERCASE) or raw chainKeys — never index the map directly.
export function getFactory(chainKey: string): { address: string; chainId: number } | undefined {
  return GM_FACTORIES[chainKey.trim().toLowerCase()];
}

export function getFactoryAddress(chainKey: string): string | undefined {
  return getFactory(chainKey)?.address;
}

export function getActiveFactoryChains(): string[] {
  return Object.keys(GM_FACTORIES);
}
