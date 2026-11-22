import type { WatchSource } from "./sentinel-watch.js";

/**
 * Pages d'actualites officielles relevees par la veille des annonces. Une ligne par chaine suivie
 * dans le classeur ; chaque URL a ete verifiee (reponse 2xx, plus de 1500 caracteres de texte
 * dans le HTML servi, liste d'articles dates, sans JavaScript ni defi anti-robot).
 * Ajouter une chaine = ajouter une ligne ; ne jamais y mettre un compte ou une adresse privee.
 * La cle est celle de packages/core/src/chains/<CLE>.ts en minuscules quand la chaine y figure.
 */
export const WATCH_SOURCES: readonly WatchSource[] = [
  // Petites et jeunes chaines (risque de fermeture le plus eleve)
  { chainKey: "astar", url: "https://astar.network/blog", publisher: "Astar Network" },
  { chainKey: "aurora", url: "https://aurora.dev/blog", publisher: "Aurora" },
  { chainKey: "bitlayer", url: "https://blog.bitlayer.org/", publisher: "Bitlayer" },
  { chainKey: "bob", url: "https://blog.gobob.xyz/", publisher: "BOB" },
  { chainKey: "camp", url: "https://campnetwork.xyz/blog", publisher: "Camp Network" },
  { chainKey: "citrea", url: "https://www.blog.citrea.xyz/", publisher: "Citrea" },
  { chainKey: "cyber", url: "https://cyber.co/blog", publisher: "Cyber" },
  { chainKey: "doma", url: "https://blog.doma.xyz/", publisher: "Doma" },
  { chainKey: "flare", url: "https://flare.network/news", publisher: "Flare Networks" },
  { chainKey: "flow", url: "https://flow.com/blog", publisher: "Flow" },
  { chainKey: "fraxtal", url: "https://frax.com/blog", publisher: "Frax Finance" },
  { chainKey: "fuse", url: "https://news.fuse.io/", publisher: "Fuse" },
  { chainKey: "gnosis", url: "https://www.gnosis.io/blog", publisher: "Gnosis" },
  { chainKey: "hemi", url: "https://hemi.xyz/blog", publisher: "Hemi" },
  { chainKey: "immutable", url: "https://www.immutable.com/blog", publisher: "Immutable" },
  { chainKey: "injective", url: "https://injective.com/blog", publisher: "Injective" },
  { chainKey: "intuition", url: "https://www.intuition.systems/blog", publisher: "Intuition" },
  { chainKey: "kaia", url: "https://blog.kaia.io/", publisher: "Kaia" },
  { chainKey: "katana", url: "https://katana.network/blog", publisher: "Katana" },
  { chainKey: "lens", url: "https://lens.xyz/news", publisher: "Lens" },
  { chainKey: "linea", url: "https://linea.build/blog", publisher: "Linea" },
  { chainKey: "mantle", url: "https://www.mantle.xyz/blog", publisher: "Mantle" }, // redirige vers l'accueil, qui liste les annonces datees
  { chainKey: "megaeth", url: "https://www.megaeth.com/", publisher: "MegaETH" }, // accueil : section « Blog & News » datee
  { chainKey: "mezo", url: "https://mezo.org/blog", publisher: "Mezo" },
  { chainKey: "moca", url: "https://moca.network/blog", publisher: "Moca Network" },
  { chainKey: "monad", url: "https://www.monad.xyz/blog", publisher: "Monad" },
  { chainKey: "morph", url: "https://www.morph.network/blog", publisher: "Morph" },
  { chainKey: "peaq", url: "https://www.peaq.xyz/blog", publisher: "peaq" },
  { chainKey: "plume", url: "https://plume.org/blog", publisher: "Plume" },
  { chainKey: "rootstock", url: "https://rootstock.io/blog", publisher: "Rootstock" },
  { chainKey: "sei", url: "https://blog.sei.io/", publisher: "Sei" },
  { chainKey: "shape", url: "https://shape.network/blog", publisher: "Shape" },
  { chainKey: "soneium", url: "https://soneium.org/en/blog/", publisher: "Soneium" },
  { chainKey: "story", url: "https://www.datafdn.org/blog", publisher: "The DATA Foundation (ex-Story)" },
  { chainKey: "tac", url: "https://tac.build/blog", publisher: "TAC" },
  { chainKey: "vana", url: "https://www.vana.org/posts", publisher: "Vana" },
  { chainKey: "worldchain", url: "https://world.org/blog", publisher: "World" },
  { chainKey: "xrplevm", url: "https://www.xrplevm.org/blog", publisher: "XRPL EVM" },
  { chainKey: "zetachain", url: "https://www.zetachain.com/blog", publisher: "ZetaChain" },
  { chainKey: "zksync_era", url: "https://zksync.io/blog", publisher: "ZKsync" },
  { chainKey: "zora", url: "https://zora.co/blog", publisher: "Zora" },
  { chainKey: "opbnb", url: "https://www.bnbchain.org/en/blog", publisher: "BNB Chain" },
  { chainKey: "unichain", url: "https://blog.uniswap.org/", publisher: "Uniswap Labs" },
  { chainKey: "arc", url: "https://www.circle.com/blog", publisher: "Circle" },
  { chainKey: "robinhood", url: "https://robinhood.com/us/en/newsroom/", publisher: "Robinhood" },
  // Grandes chaines
  { chainKey: "arbitrum_nova", url: "https://blog.arbitrum.io/", publisher: "Arbitrum" }, // meme page que arbitrum_one
  { chainKey: "arbitrum_one", url: "https://blog.arbitrum.io/", publisher: "Arbitrum" },
  { chainKey: "avalanche", url: "https://build.avax.network/blog", publisher: "Avalanche" },
  { chainKey: "base", url: "https://www.base.org/blog", publisher: "Base" },
  { chainKey: "celo", url: "https://blog.celo.org/", publisher: "Celo" },
  { chainKey: "ethereum", url: "https://blog.ethereum.org/", publisher: "Ethereum Foundation" },
  { chainKey: "optimism", url: "https://www.optimism.io/blog", publisher: "Optimism" },
  { chainKey: "polygon", url: "https://polygon.technology/blog", publisher: "Polygon" },
  // Ajouts du 21/11/2026 : pages editoriales (blog, flux RSS) verifiees par telechargement (2xx, texte dans le HTML servi,
  // aucun defi anti-robot, annonces datees).
  { chainKey: "aevo", url: "https://www.aevo.xyz/blog", publisher: "Aevo" },
  { chainKey: "bsc", url: "https://www.bnbchain.org/en/blog", publisher: "BNB Chain" },
  { chainKey: "celestia", url: "https://blog.celestia.org/rss/", publisher: "Celestia" },
  { chainKey: "creditcoin", url: "https://creditcoin.org/blog/", publisher: "Creditcoin" },
  { chainKey: "cysic", url: "https://www.cysic.xyz/blog/", publisher: "Cysic" },
  { chainKey: "dydx", url: "https://www.dydx.xyz/blog", publisher: "dYdX" },
  { chainKey: "ethereum_classic", url: "https://ethereumclassic.org/blog", publisher: "ETC Cooperative" },
  { chainKey: "gensyn", url: "https://blog.gensyn.ai/", publisher: "Gensyn" },
  { chainKey: "gravity", url: "https://gravity.xyz/blog", publisher: "Gravity" },
  { chainKey: "haven1", url: "https://www.haven1.org/blog", publisher: "Haven1" },
  { chainKey: "lightlink", url: "https://lightlink.io/blog", publisher: "LightLink" },
  { chainKey: "matchain", url: "https://www.matchain.io/blog", publisher: "Matchain" },
  { chainKey: "neo_x", url: "https://neo.org/news?type=1", publisher: "Neo" }, // melange Neo X et Neo N3
  { chainKey: "sonic", url: "https://www.soniclabs.com/blog/rss/", publisher: "Sonic Labs" },
  { chainKey: "swellchain", url: "https://www.swellnetwork.io/blog", publisher: "Swell Network" },
  { chainKey: "world_mobile", url: "https://worldmobile.io/blog", publisher: "World Mobile" },
  // Ajouts du 21/11/2026 (suite) : chaines qui n'avaient aucune source ; chaque URL verifiee avec le code de la veille
  // (2xx, texte dans le HTML servi, annonces ou avis dates). Les flux Medium sont exclus : defi anti-robot intermittent (429).
  { chainKey: "ancient8", url: "https://blog.ancient8.gg", publisher: "Ancient8" },
  { chainKey: "fogo", url: "https://www.fogo.io/blog", publisher: "Fogo" },
  { chainKey: "layerai", url: "https://aere.network/blog", publisher: "Aere Network" },
  { chainKey: "metal_l2", url: "https://metall2.com/news", publisher: "Metal L2" },
  { chainKey: "neon", url: "https://neonevm.org", publisher: "Neon EVM" }, // page unique « Wind-Down Announcement » : un nouveau passage d'arret est signale (un simple changement de date peut passer inaperçu)
  { chainKey: "numine", url: "https://numine.io/notice", publisher: "NUMINE" }, // liste d'avis datee AAAA.MM.JJ
  { chainKey: "plasma", url: "https://www.plasma.org/company/blog", publisher: "Plasma" },
  { chainKey: "ronin", url: "https://blog.roninchain.com/feed", publisher: "Ronin", strict: true }, // newsletter : « migration » y est un terme courant, seuls les mots d'arret sont retenus
  { chainKey: "somnia", url: "https://blog.somnia.network/feed", publisher: "Somnia" },
  { chainKey: "zircuit", url: "https://www.zircuit.com/blog", publisher: "Zircuit" },
  // Flux de versions GitHub/GitLab des organisations officielles (aucune page editoriale lisible) : mode strict,
  // seuls les mots d'arret comptent. Une annonce de fermeture n'y apparait que si l'equipe la met dans les notes de version.
  { chainKey: "berachain", url: "https://github.com/berachain/bera-reth/releases.atom", publisher: "Berachain", strict: true },
  { chainKey: "boba", url: "https://github.com/bobanetwork/boba/releases.atom", publisher: "Boba Network", strict: true },
  { chainKey: "core", url: "https://github.com/coredao-org/core-chain/releases.atom", publisher: "Core DAO", strict: true },
  { chainKey: "cosmos_hub", url: "https://github.com/cosmos/gaia/releases.atom", publisher: "Cosmos (Gaia)", strict: true },
  { chainKey: "cronos", url: "https://github.com/crypto-org-chain/cronos/releases.atom", publisher: "Cronos", strict: true },
  { chainKey: "fantom", url: "https://github.com/Fantom-foundation/Sonic/releases.atom", publisher: "Fantom Foundation", strict: true },
  { chainKey: "fvm", url: "https://github.com/filecoin-project/lotus/releases.atom", publisher: "Filecoin (Lotus)", strict: true },
  { chainKey: "harmony", url: "https://github.com/harmony-one/harmony/releases.atom", publisher: "Harmony", strict: true },
  { chainKey: "iota_evm", url: "https://github.com/iotaledger/iota/releases.atom", publisher: "IOTA Foundation", strict: true },
  { chainKey: "kava", url: "https://github.com/Kava-Labs/kava/releases.atom", publisher: "Kava Labs", strict: true },
  { chainKey: "manta_pacific", url: "https://github.com/Manta-Network/Manta/releases.atom", publisher: "Manta Network", strict: true },
  { chainKey: "metis", url: "https://github.com/MetisProtocol/mvm/releases.atom", publisher: "Metis", strict: true },
  { chainKey: "mitosis", url: "https://github.com/mitosis-org/chain/releases.atom", publisher: "Mitosis", strict: true },
  { chainKey: "neutron", url: "https://github.com/neutron-org/neutron/releases.atom", publisher: "Neutron", strict: true },
  { chainKey: "noble", url: "https://github.com/noble-assets/noble/releases.atom", publisher: "Noble", strict: true },
  { chainKey: "osmosis", url: "https://github.com/osmosis-labs/osmosis/releases.atom", publisher: "Osmosis Labs", strict: true },
  { chainKey: "pulsechain", url: "https://gitlab.com/pulsechaincom/go-pulse/-/tags?format=atom", publisher: "PulseChain", strict: true },
  { chainKey: "rei_network", url: "https://github.com/REI-Network/rei/releases.atom", publisher: "REI Network", strict: true },
  { chainKey: "scroll", url: "https://github.com/scroll-tech/go-ethereum/releases.atom", publisher: "Scroll", strict: true },
  { chainKey: "skale", url: "https://github.com/skalenetwork/skaled/releases.atom", publisher: "SKALE Network", strict: true },
  { chainKey: "solana", url: "https://github.com/anza-xyz/agave/releases.atom", publisher: "Anza (Agave)", strict: true },
  { chainKey: "stride", url: "https://github.com/Stride-Labs/stride/releases.atom", publisher: "Stride Labs", strict: true },
  { chainKey: "taiko_alethia", url: "https://github.com/taikoxyz/taiko-mono/releases.atom", publisher: "Taiko Labs", strict: true },
  { chainKey: "taraxa", url: "https://github.com/Taraxa-project/taraxa-node/releases.atom", publisher: "Taraxa", strict: true },
  { chainKey: "tempo", url: "https://github.com/tempoxyz/tempo/releases.atom", publisher: "Tempo", strict: true },
  { chainKey: "ton", url: "https://github.com/ton-blockchain/ton/releases.atom", publisher: "TON Foundation", strict: true },
  { chainKey: "x_layer", url: "https://github.com/okx/xlayer-reth/releases.atom", publisher: "OKX (X Layer)", strict: true },
  { chainKey: "zilliqa_evm", url: "https://github.com/Zilliqa/zq2/releases.atom", publisher: "Zilliqa", strict: true },
  // Ajouts du 22/11/2026 : chaines encore sans source ; chaque URL verifiee avec le code de la veille (2xx, texte servi,
  // au moins 3 dates). Ecartees : newsletter Beam, The Shib Daily et blog Stable, qui citent la fermeture d'autres
  // projets ou un evenement « Sunset » : une alerte y serait attribuee a tort a la chaine.
  { chainKey: "etherlink", url: "https://spotlight.tezos.com/", publisher: "Tezos (Spotlight, Etherlink)" },
  { chainKey: "kcc", url: "https://news.kcc.io/", publisher: "KCC" },
  { chainKey: "reya", url: "https://blog.reya.network/rss/", publisher: "Reya Network", strict: true },
];
