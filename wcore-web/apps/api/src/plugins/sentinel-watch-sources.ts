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
];
