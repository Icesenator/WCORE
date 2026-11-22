/**
 * Chain Sentinel — detection anticipee des fermetures et migrations de reseaux.
 *
 * Module metier pur (aucun reseau, aucune operation wallet) partage par l'API
 * (job serveur periodique) et le Web (rubrique « Chain Sentinel », badges).
 *
 * Invariants :
 * - une exposition n'est jamais declaree nulle sur la base d'un prix manquant
 *   ou d'un cache ancien : seul un solde 0 observe recemment vaut ZERO_ATTESTED ;
 * - une panne RPC ne change pas le statut de cycle de vie (seules des sources
 *   officielles le font) ;
 * - une alerte publique ne contient ni montant, ni adresse, ni position.
 */

import type { ScanResult as _ScanResultForAdapter } from "./scan-result";
export const LIFECYCLE_STATUSES = ["ACTIVE", "WINDING_DOWN", "RETIRED", "UNKNOWN"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const DEADLINE_KINDS = [
  "NON_NATIVE_BRIDGE_LAST",
  "BRIDGE_WITHDRAW_LAST",
  "UNSTAKE_LAST",
  "WITHDRAW_LAST",
  "NETWORK_SHUTDOWN",
  "CLAIM_END",
] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export interface SourceRef {
  url: string;
  publisher: string;
  /** Libelle anglais de la source, quand il differe (interface anglaise). */
  publisherEn?: string;
  /** true seulement pour un canal officiel du projet (site, docs, compte officiel). */
  official: boolean;
  retrievedAt: string;
  /** Empreinte du contenu lu, pour detecter une mise a jour de l'annonce. */
  contentSha256?: string;
}

export interface DeadlineFact {
  kind: DeadlineKind;
  /** ISO 8601 UTC. */
  at: string;
  sourceIds: string[];
  /** Actifs concernes (ex. ["G"], ["USDC", "USDT", "ETH"]) ; vide = tous. */
  assets?: string[];
  /**
   * true quand la source n'annonce qu'un jour approximatif (« around Dec 9 »), sans heure :
   * `at` garde la lecture la plus prudente (debut de journee UTC) pour les alertes, mais
   * l'interface ne doit jamais afficher cette heure comme si elle etait publiee.
   */
  approximate?: boolean;
}

export interface ChainLifecycleRecord {
  chainKey: string;
  chainId: number;
  name: string;
  status: LifecycleStatus;
  /** Reseau successeur eventuel : jamais fusionne automatiquement. */
  successorChainId?: number;
  deadlines: DeadlineFact[];
  sources: Record<string, SourceRef>;
  /** PLANNED = procedure officielle annoncee mais pas encore ouverte (aucune garantie). */
  recoveryAfterShutdown: "AVAILABLE" | "PLANNED" | "NOT_AVAILABLE" | "UNKNOWN";
  /** Precision libre et sourcee (ex. « reclamation manuelle prevue en janvier 2027 »). */
  recoveryNote?: string;
  /** Meme precision en anglais (interface anglaise) ; absente = la note francaise sert. */
  recoveryNoteEn?: string;
  lastVerifiedAt: string;
}

// ---------------------------------------------------------------------------
// Registre verifie (source officielle uniquement). Toute autre chaine = absente.
// ---------------------------------------------------------------------------
export const VERIFIED_LIFECYCLE_REGISTRY: readonly ChainLifecycleRecord[] = [
  {
    chainKey: "gravity",
    chainId: 1625,
    name: "Gravity Alpha Mainnet",
    status: "RETIRED",
    successorChainId: 127001,
    deadlines: [
      { kind: "NON_NATIVE_BRIDGE_LAST", at: "2026-10-23T00:00:00Z", sourceIds: ["galxe-l1-live"], assets: ["USDT", "USDC", "ETH"] },
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-10-26T03:00:00Z", sourceIds: ["galxe-l1-live", "galxe-bridge-g"], assets: ["G"] },
      { kind: "UNSTAKE_LAST", at: "2026-10-26T03:00:00Z", sourceIds: ["galxe-l1-live"], assets: ["G"] },
      { kind: "NETWORK_SHUTDOWN", at: "2026-11-01T00:00:00Z", sourceIds: ["galxe-l1-live"] },
    ],
    sources: {
      "galxe-l1-live": { url: "https://help.galxe.com/en/articles/16010489-gravity-l1-mainnet-is-now-live", publisher: "Galxe Help Center", official: true, retrievedAt: "2026-11-07T11:40:00Z" },
      "galxe-bridge-g": { url: "https://help.galxe.com/en/articles/16305612-how-to-bridge-g-tokens-from-gravity-alpha-to-gravity-l1-mainnet", publisher: "Galxe Help Center", official: true, retrievedAt: "2026-11-07T11:42:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    lastVerifiedAt: "2026-11-07T11:42:00Z",
  },
  {
    chainKey: "abstract",
    chainId: 2741,
    name: "Abstract",
    status: "WINDING_DOWN",
    // Heure non precisee par la source : debut de journee UTC retenu (lecture la plus prudente).
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2026-12-15T00:00:00Z", sourceIds: ["abs-migrate"] },
      { kind: "NETWORK_SHUTDOWN", at: "2026-12-15T00:00:00Z", sourceIds: ["abs-migrate"] },
    ],
    sources: {
      "abs-migrate": { url: "https://migrate.abs.xyz/", publisher: "Abstract (Migration Hub officiel)", publisherEn: "Abstract (official Migration Hub)", official: true, retrievedAt: "2026-11-07T12:25:00Z" },
    },
    recoveryAfterShutdown: "NOT_AVAILABLE",
    recoveryNote: "« Any users that do not migrate their assets by this date will lose access to their funds » ; bridge natif ~3 h.",
    recoveryNoteEn: "“Any users that do not migrate their assets by this date will lose access to their funds”; native bridge takes about 3 h.",
    lastVerifiedAt: "2026-11-07T12:25:00Z",
  },
  {
    chainKey: "cronos_zkevm",
    chainId: 388,
    name: "Cronos zkEVM Alpha",
    status: "WINDING_DOWN",
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2027-06-03T03:00:00Z", sourceIds: ["cronos-blog"] },
      { kind: "NETWORK_SHUTDOWN", at: "2027-06-03T03:00:00Z", sourceIds: ["cronos-blog"] },
    ],
    sources: {
      "cronos-blog": { url: "https://blog.cronos.com/p/sunsetting-the-cronos-zkevm-alpha", publisher: "Cronos Labs (blog officiel)", publisherEn: "Cronos Labs (official blog)", official: true, retrievedAt: "2026-11-07T12:20:00Z" },
    },
    recoveryAfterShutdown: "NOT_AVAILABLE",
    recoveryNote: "Assets remaining after the final shutdown will not be recoverable (blog officiel). Depots desactives.",
    recoveryNoteEn: "Assets remaining after the final shutdown will not be recoverable (official blog). Deposits disabled.",
    lastVerifiedAt: "2026-11-07T12:20:00Z",
  },
  {
    chainKey: "lisk",
    chainId: 1135,
    name: "Lisk Chain (L2)",
    status: "RETIRED",
    deadlines: [{ kind: "NETWORK_SHUTDOWN", at: "2026-11-02T00:00:00Z", sourceIds: ["lisk-blog"] }],
    sources: {
      "lisk-blog": { url: "https://lisk.com/blog/posts/lisk-chain-has-closed", publisher: "Lisk (blog officiel)", publisherEn: "Lisk (official blog)", official: true, retrievedAt: "2026-11-07T12:22:00Z" },
    },
    recoveryAfterShutdown: "PLANNED",
    recoveryNote: "Portal et Bridge fermes le 02/11/2026 ; « manual claims process in January 2027 », details a venir, aucune garantie.",
    recoveryNoteEn: "Portal and Bridge closed on 2026-11-02; “manual claims process in January 2027”, details to come, no guarantee.",
    lastVerifiedAt: "2026-11-07T12:22:00Z",
  },
  {
    chainKey: "blast",
    chainId: 81457,
    name: "Blast",
    status: "RETIRED",
    deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-10-26T00:00:00Z", sourceIds: ["theblock-blast"] },
      // L annonce officielle « has been shut down » date au plus tard du 04/11/2026.
      { kind: "NETWORK_SHUTDOWN", at: "2026-11-04T00:00:00Z", sourceIds: ["blast-x-recovery"] },
      { kind: "CLAIM_END", at: "2027-11-04T00:00:00Z", sourceIds: ["blast-x-recovery"], assets: ["ETH", "USD", "USDB", "WETH"] },
    ],
    sources: {
      "blast-x-recovery": { url: "https://x.com/blast/status/2117993462356197406", publisher: "Blast (compte X officiel)", publisherEn: "Blast (official X account)", official: true, retrievedAt: "2026-11-07T12:24:00Z" },
      "theblock-blast": { url: "https://x.com/TheBlockCo/status/2106037806795817420", publisher: "The Block (relais)", publisherEn: "The Block (relay)", official: false, retrievedAt: "2026-11-07T12:24:00Z" },
    },
    recoveryAfterShutdown: "AVAILABLE",
    recoveryNote: "Site de recuperation sur Ethereum, actif 12 mois, support final le 04/11/2027 (ETH/USD, retraits en attente, Blast Mobile).",
    recoveryNoteEn: "Recovery site on Ethereum, live for 12 months, final support on 2027-11-04 (ETH/USD, pending withdrawals, Blast Mobile).",
    lastVerifiedAt: "2026-11-07T12:24:00Z",
  },
  {
    chainKey: "sophon",
    chainId: 50104,
    name: "Sophon",
    status: "WINDING_DOWN",
    // 2026-11-08 : dates confirmees par le compte X officiel @Sophon (fil 1/4-4/4 du 19/10/2026, rappel du 02/11/2026,
    // post epingle du 22/10/2026). Le guide docs (« no fixed shutdown date yet ») est anterieur et ne contredit pas.
    // Heure non precisee : debut de journee UTC retenu (lecture la plus prudente). Chain ID 50104 verifie (eth_chainId 0xc3b8).
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2026-11-25T00:00:00Z", sourceIds: ["sophon-x-timeline", "sophon-x-reminder"] },
      { kind: "NETWORK_SHUTDOWN", at: "2026-11-30T00:00:00Z", sourceIds: ["sophon-x-timeline", "sophon-x-reminder"] },
    ],
    sources: {
      "sophon-x-timeline": { url: "https://x.com/Sophon/status/2112253258030882831", publisher: "Sophon (compte X officiel, fil du 19/10/2026)", publisherEn: "Sophon (official X account, thread of 2026-10-19)", official: true, retrievedAt: "2026-11-08T18:45:00Z" },
      "sophon-x-reminder": { url: "https://x.com/Sophon/status/2117352374679244928", publisher: "Sophon (compte X officiel, rappel du 02/11/2026)", publisherEn: "Sophon (official X account, reminder of 2026-11-02)", official: true, retrievedAt: "2026-11-08T18:47:00Z" },
      "sophon-docs": { url: "https://docs.sophon.xyz/migration", publisher: "Sophon Documentation (officiel, guide sans date fixe, anterieur au 19/10)", publisherEn: "Sophon Documentation (official, undated guide, earlier than 2026-10-19)", official: true, retrievedAt: "2026-11-08T18:50:00Z" },
      "cointelegraph-sophon": { url: "https://cointelegraph.com/news/sophon-sets-nov-25-withdrawal-deadline-ahead-of-mainnet-shutdown", publisher: "Cointelegraph (relais)", publisherEn: "Cointelegraph (relay)", official: false, retrievedAt: "2026-11-07T12:27:00Z" },
    },
    recoveryAfterShutdown: "NOT_AVAILABLE",
    recoveryNote: "« assets left on Sophon Chain after the deadline risk becoming permanently inaccessible » (X officiel). Retraits et recompenses staking/Guardian : claim.sophon.com ; farms : farm.sophon.xyz. Guardian NFT, vSOPH et SOPH stake : transition automatique vers Ethereum (docs). Depots fermes depuis le 25/06/2026.",
    recoveryNoteEn: "“assets left on Sophon Chain after the deadline risk becoming permanently inaccessible” (official X). Withdrawals and staking/Guardian rewards: claim.sophon.com; farms: farm.sophon.xyz. Guardian NFT, vSOPH and staked SOPH: automatic transition to Ethereum (docs). Deposits closed since 2026-06-25.",
    lastVerifiedAt: "2026-11-08T18:50:00Z",
  },
  {
    chainKey: "zetachain",
    chainId: 7000,
    name: "ZetaChain",
    status: "WINDING_DOWN",
    // 2026-11-12 : « The ZetaChain L1 halts around Dec 9, 2026 [...] and is not restarted » (blog officiel du 04/11/2026,
    // proposition de gouvernance 2 adoptee le 07/11/2026). L'arret est lie a une hauteur de bloc publiee, « expected around
    // Dec 9 » ; heure non precisee : debut de journee UTC retenu (lecture la plus prudente), marque approximate.
    // 2026-11-18 (signal WCORE CM, blog relu) : plus de WITHDRAW_LAST. Le blog ne demande de sortir avant
    // l'instantane qu'aux ZETA wrappes ou en pool ; les ZETA detenus, stakes ou en cours de retrait sont credites
    // a l'instantane et « Claims are checked against the published snapshot [...] so they work after the halt ».
    // L'echeance utile est donc l'arret lui-meme (instantane a la meme hauteur), detaille dans recoveryNote.
    deadlines: [
      { kind: "NETWORK_SHUTDOWN", at: "2026-12-09T00:00:00Z", sourceIds: ["zeta-blog"], approximate: true },
    ],
    sources: {
      "zeta-blog": { url: "https://www.zetachain.com/blog/zeta-moves-to-solana-dec-9", publisher: "ZetaChain (blog officiel)", publisherEn: "ZetaChain (official blog)", official: true, retrievedAt: "2026-11-18T19:50:00Z" },
      "zeta-hub-migrate": { url: "https://hub.zetachain.com/migrate", publisher: "ZetaHub (portail officiel de migration ZETA vers Solana)", publisherEn: "ZetaHub (official ZETA-to-Solana migration portal)", official: true, retrievedAt: "2026-11-14T10:15:00Z" },
      "zeta-hub-bridged": { url: "https://hub.zetachain.com/bridged-assets", publisher: "ZetaHub (portail officiel des actifs pontés)", publisherEn: "ZetaHub (official bridged-assets portal)", official: true, retrievedAt: "2026-11-14T10:15:00Z" },
    },
    // PLANNED : la reclamation est annoncee pour le jour de l'arret, elle n'est pas encore ouverte.
    recoveryAfterShutdown: "PLANNED",
    recoveryNote: "« Unwrap and exit pools before the snapshot. ZETA inside contracts and pools cannot be claimed by a key. » Avant l'instantane : sortir des pools et defaire l'emballage des ZETA ; aucune reclamation a faire avant le 9 decembre. Selon le plan officiel annonce (recuperation prevue, sans garantie) : le 9 decembre le portail hub.zetachain.com/migrate doit ouvrir ; on connecte le portefeuille qui detenait les ZETA et on signe un message (le plan precise : aucun frais, pas de SOL, jamais de phrase secrete) nommant un portefeuille Solana ; le solde complet est annonce livre en ZETA natif sur Solana (au moins 10 ZETA a l'instantane ; ZETA stake ou en cours de retrait credite a l'instantane selon le plan). Actifs encore detenus en ZRC-20 : hub.zetachain.com/bridged-assets, annonces payes sur leur chaine d'origine (minimum de 5 $ par jeton). Selon le plan, les reclamations sont verifiees sur l'instantane publie, donc possibles apres l'arret, sans date limite indiquee a ce jour.",
    recoveryNoteEn: "“Unwrap and exit pools before the snapshot. ZETA inside contracts and pools cannot be claimed by a key.” Before the snapshot: exit pools and unwrap ZETA; no claim to make before December 9. Per the announced official plan (recovery planned, no guarantee): on December 9 the portal at hub.zetachain.com/migrate is due to open; connect the wallet that held the ZETA and sign a message (the plan states: no fee, no SOL, never a seed phrase) naming a Solana wallet; the full balance is announced to be delivered as native ZETA on Solana (at least 10 ZETA at the snapshot; staked or unbonding ZETA is credited at the snapshot, per the plan). Assets still held as ZRC-20: hub.zetachain.com/bridged-assets, announced to be paid on their original chain (minimum of $5 per token). Per the plan, claims are checked against the published snapshot, so they are possible after the halt, with no deadline stated to date.",
    lastVerifiedAt: "2026-11-18T19:50:00Z",
  },
  {
    chainKey: "neon",
    chainId: 245022934,
    name: "Neon EVM",
    status: "WINDING_DOWN",
    // 2026-11-12 : « before December 31, 2026 » (annonce du site officiel). Heure non precisee : debut de journee UTC
    // retenu (lecture la plus prudente). Aucune date d'arret du reseau publiee : pas d'echeance NETWORK_SHUTDOWN.
    // Apres le 31/12, le module tiendra la sortie pour fermee (alerte « fonds bloques ») alors que la source ne dit
    // rien de l'apres : relire la source officielle avant cette date et ajuster la fiche.
    deadlines: [
      { kind: "WITHDRAW_LAST", at: "2026-12-31T00:00:00Z", sourceIds: ["neon-site"] },
    ],
    sources: {
      "neon-site": { url: "https://neonevm.org/", publisher: "Neon EVM (site officiel)", publisherEn: "Neon EVM (official site)", official: true, retrievedAt: "2026-11-12T18:10:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    recoveryNote: "« Users and developers relying on Neon EVM should complete any necessary migration or withdrawal steps before December 31, 2026. » Date d'arret du reseau non publiee.",
    recoveryNoteEn: "“Users and developers relying on Neon EVM should complete any necessary migration or withdrawal steps before December 31, 2026.” No network shutdown date published.",
    lastVerifiedAt: "2026-11-12T18:10:00Z",
  },
  {
    chainKey: "moonbeam",
    chainId: 1284,
    name: "Moonbeam",
    status: "RETIRED",
    // 2026-11-21 : annonce officielle du 03/07/2026 (page relue) : « All existing GLMR holders must bridge their tokens
    // from the Moonbeam parachain to Base before July 31, 2026 » ; la FAQ dit que Moonbeam fonctionne « till Jul 31, 2026 ».
    // La page ne donne aucune date d'arret du reseau : pas d'echeance NETWORK_SHUTDOWN, et aucune procedure de recuperation
    // n'y figure (UNKNOWN, jamais NOT_AVAILABLE sans source). Heure non precisee : debut de journee UTC, marque approximate.
    // Reseau retire du scan WCORE (isRetiredChain) : l'exposition reste NOT_COVERED, jamais un zero.
    successorChainId: 8453,
    deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-07-31T00:00:00Z", sourceIds: ["moonbeam-relaunch-base"], assets: ["GLMR"], approximate: true },
    ],
    sources: {
      "moonbeam-relaunch-base": { url: "https://moonbeam.network/news/moonbeam-strategic-update-moonbeam-network-relaunches-on-base", publisher: "Moonbeam Network (annonce officielle du 03/07/2026)", publisherEn: "Moonbeam Network (official announcement of 2026-07-03)", official: true, retrievedAt: "2026-11-21T10:00:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    recoveryNote: "Migration 1:1 du GLMR vers Base (ERC-20) a faire avant le 31/07/2026. « Once the chain winds down, funds left in on-chain protocols may become inaccessible. » Aucune procedure de recuperation apres cette date n'est publiee sur la page.",
    recoveryNoteEn: "1:1 migration of GLMR to Base (ERC-20) due before 2026-07-31. “Once the chain winds down, funds left in on-chain protocols may become inaccessible.” No recovery procedure after that date is published on the page.",
    lastVerifiedAt: "2026-11-21T10:00:00Z",
  },
  {
    chainKey: "moonriver",
    chainId: 1285,
    name: "Moonriver",
    status: "RETIRED",
    // 2026-11-21 : annonce officielle du 07/07/2026 (page relue) : migration 1:1 du MOVR vers Base, « Deadline: July 31, 2026 ».
    // Non confirme par la page (donc absent de la fiche) : date de fin des demandes tardives (30/09/2026 selon le proprietaire)
    // et date d'arret du reseau. Observation WCORE, hors source officielle : dernier bloc 2026-08-10T08:27:48Z (chaine figee).
    // Heure non precisee : debut de journee UTC, marque approximate. Exposition NOT_COVERED (reseau retire du scan WCORE).
    successorChainId: 8453,
    deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-07-31T00:00:00Z", sourceIds: ["moonriver-movr-base"], assets: ["MOVR"], approximate: true },
    ],
    sources: {
      "moonriver-movr-base": { url: "https://moonbeam.network/news/moonriver-strategic-update-movr-is-migrating-to-base", publisher: "Moonbeam Network (annonce officielle du 07/07/2026)", publisherEn: "Moonbeam Network (official announcement of 2026-07-07)", official: true, retrievedAt: "2026-11-21T10:00:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    recoveryNote: "Migration 1:1 du MOVR vers Base avant le 31/07/2026. « funds left in on-chain protocols may become permanently inaccessible » apres l'arret. Aucune procedure de recuperation apres la date limite n'est publiee sur la page ; reseau fige : dernier bloc observe par WCORE le 10/08/2026 a 08:27:48 UTC.",
    recoveryNoteEn: "1:1 migration of MOVR to Base before 2026-07-31. “funds left in on-chain protocols may become permanently inaccessible” once the chain winds down. No recovery procedure after the deadline is published on the page; the network is frozen: last block observed by WCORE on 2026-08-10 at 08:27:48 UTC.",
    lastVerifiedAt: "2026-11-21T10:00:00Z",
  },
  {
    chainKey: "swellchain",
    chainId: 1923,
    name: "Swellchain",
    status: "RETIRED",
    // 2026-11-21 : annonce officielle du 28/04/2026 « Sunsetting Swellchain: From L2 to Faro » (page relue) : depots coupes
    // le 05/05/2026, date limite de retrait le 15/06/2026, arret du reseau ANNONCE pour le 30/06/2026 d'apres la FAQ de
    // l'annonce (non constate : la chaine etait encore vivante le 17/07/2026, journal wcore-gsheet ; RPC public introuvable (DNS) le 21/11/2026).
    // Aucune recuperation officielle apres le 15/06/2026. Aucun successeur de chaine (Swell evolue vers Faro, hors registre).
    // Heure non precisee : debut de journee UTC, marque approximate. Reseau retire du scan WCORE (isRetiredChain) :
    // l'exposition reste NOT_COVERED, jamais un zero.
    deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-06-15T00:00:00Z", sourceIds: ["swellchain-sunset"], approximate: true },
      { kind: "NETWORK_SHUTDOWN", at: "2026-06-30T00:00:00Z", sourceIds: ["swellchain-sunset"], approximate: true },
    ],
    sources: {
      "swellchain-sunset": { url: "https://www.swellnetwork.io/post/sunsetting-swellchain-from-l2-to-faro", publisher: "Swell Network (annonce officielle du 28/04/2026)", publisherEn: "Swell Network (official announcement of 2026-04-28)", official: true, retrievedAt: "2026-11-21T12:00:00Z" },
    },
    recoveryAfterShutdown: "NOT_AVAILABLE",
    recoveryNote: "Depots coupes le 05/05/2026 ; retraits possibles jusqu'au 15/06/2026 ; arret du reseau ANNONCE pour le 30/06/2026 (FAQ de l'annonce) ; chaine encore observee vivante le 17/07/2026 par WCORE, RPC public introuvable (DNS) constate le 21/11/2026. Aucune recuperation officielle apres le 15/06/2026.",
    recoveryNoteEn: "Deposits closed on 2026-05-05; withdrawals possible until 2026-06-15; network shutdown ANNOUNCED for 2026-06-30 (announcement FAQ); chain still observed alive on 2026-07-17 by WCORE, public RPC not resolving (DNS) on 2026-11-21. No official recovery after 2026-06-15.",
    lastVerifiedAt: "2026-11-21T12:00:00Z",
  },
  {
    chainKey: "zero",
    chainId: 543210,
    name: "ZERO Network",
    status: "RETIRED",
    // 2026-11-21 : page d'aide officielle de Zerion du 21/05/2026 « How to bridge your assets off ZERϴ Network » (page relue) :
    // « ZERϴ Network is winding down on July 31, 2026 » ; le bridge d'entree est suspendu des l'annonce. Arret ANNONCE pour le
    // 31/07/2026 et constate par zero.network (la chaine ne produit plus de blocs) ; observation WCORE, hors source officielle :
    // les deux RPC (rpc.zerion.io, thirdweb) repondent « Node is not available » le 21/11/2026.
    // Aucune regle de recuperation apres la date limite n'est publiee : seul un formulaire d'aide figure sur zero.network
    // (« submit your address and we'll help you recover them »), cas par cas : UNKNOWN, jamais NOT_AVAILABLE ni AVAILABLE.
    // Aucun successeur de chaine. Heure non precisee : debut de journee UTC, marque approximate. Reseau retire du scan WCORE
    // (isRetiredChain) : l'exposition reste NOT_COVERED, jamais un zero.
    deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-07-31T00:00:00Z", sourceIds: ["zero-bridge-off"], approximate: true },
      { kind: "NETWORK_SHUTDOWN", at: "2026-07-31T00:00:00Z", sourceIds: ["zero-bridge-off"], approximate: true },
    ],
    sources: {
      "zero-bridge-off": { url: "https://help.zerion.io/en/articles/15214238-how-to-bridge-your-assets-off-zer%CE%B8-network", publisher: "Zerion (page d'aide officielle)", publisherEn: "Zerion (official help page)", official: true, retrievedAt: "2026-11-21T18:00:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    recoveryNote: "Arret du reseau ANNONCE pour le 31/07/2026 (page d'aide Zerion du 21/05/2026) ; bridge d'entree suspendu des l'annonce ; chaine constatee a l'arret par zero.network et RPC « Node is not available » le 21/11/2026 (observation WCORE). Aucune regle de recuperation apres la date limite n'est publiee : seul un formulaire d'aide figure sur zero.network (« submit your address and we'll help you recover them »).",
    recoveryNoteEn: "Network shutdown ANNOUNCED for 2026-07-31 (Zerion help page of 2026-05-21); inbound bridge suspended since the announcement; chain reported halted by zero.network and RPCs answering “Node is not available” on 2026-11-21 (WCORE observation). No recovery rule after the deadline is published: only a help form appears on zero.network (“submit your address and we'll help you recover them”).",
    lastVerifiedAt: "2026-11-21T18:00:00Z",
  },
  {
    chainKey: "forma",
    chainId: 984122,
    name: "Forma",
    status: "RETIRED",
    // 2026-11-22 : annonce officielle du 22/10/2026 (compte X de l'equipe, renomme @modularium_art ; post relu) : arret au bloc
    // 34 567 890, « estimated around November 5 », environ deux semaines pour retirer avant l'arret, puis instantane et
    // migration du TIA restant vers Eden (meme adresse, reseau EVM). Page officielle du bridge (docs.forma.art, relue le
    // 22/11/2026) : « Forma has shut down » et « All unbridged TIA on Forma has been airdropped to Eden » : recuperation
    // AVAILABLE (le TIA est deja credite sur Eden, a bridger vers Celestia). Les NFT se reclament sur le site Modularium relance
    // (pas de largage automatique). Observation WCORE, hors source officielle : le RPC public rend un dernier bloc
    // (34 262 256) date du 29/10/2026, avant le bloc annonce. Heure non precisee : debut de journee UTC, marque approximate.
    deadlines: [
      { kind: "BRIDGE_WITHDRAW_LAST", at: "2026-11-05T00:00:00Z", sourceIds: ["forma-shutdown-block"], approximate: true },
      { kind: "NETWORK_SHUTDOWN", at: "2026-11-05T00:00:00Z", sourceIds: ["forma-shutdown-block", "forma-bridge-shutdown"], approximate: true },
    ],
    sources: {
      "forma-shutdown-block": { url: "https://x.com/modularium_art/status/2113385579555495982", publisher: "Forma / Modularium (compte X officiel, annonce du 22/10/2026)", publisherEn: "Forma / Modularium (official X account, announcement of 2026-10-22)", official: true, retrievedAt: "2026-11-22T08:30:00Z" },
      "forma-bridge-shutdown": { url: "https://docs.forma.art/", publisher: "Forma (page officielle du bridge)", publisherEn: "Forma (official bridge page)", official: true, retrievedAt: "2026-11-22T08:30:00Z" },
    },
    recoveryAfterShutdown: "AVAILABLE",
    recoveryNote: "« All unbridged TIA on Forma has been airdropped to Eden. » Le TIA reste sur Forma a l'arret est credite sur Eden, a la meme adresse (reseau EVM) : le retirer depuis eden.zone vers Celestia. Les NFT Forma se reclament sur le site Modularium relance, sur Ethereum (aucun largage automatique). Aucune date limite de reclamation publiee.",
    recoveryNoteEn: "“All unbridged TIA on Forma has been airdropped to Eden.” TIA left on Forma at the halt is credited on Eden, at the same address (EVM network): withdraw it from eden.zone to Celestia. Forma NFTs are claimed on the relaunched Modularium site, on Ethereum (no automatic airdrop). No claim deadline published.",
    lastVerifiedAt: "2026-11-22T08:30:00Z",
  },
  {
    chainKey: "zklinknova",
    chainId: 810180,
    name: "zkLink Nova",
    status: "RETIRED",
    // 2026-11-22 : RETIRED faute de mieux, ce n'est PAS un arret annonce. Compte X officiel (posts du 29 et du 30/10/2026,
    // relus) : exploit du contrat Arbitrator sur Ethereum et Optimism ; « Block production on zkLink Nova suspended » et
    // canaux de retrait « temporarily disabled » ; reprise seulement « after we have fully confirmed that all risks have been
    // eliminated ». Prime de recuperation des fonds voles (jusqu'a 20 %), sans plan de remboursement des utilisateurs.
    // Aucune mise a jour officielle lue apres le 30/10/2026. Le reseau ne produit plus de blocs et rien ne peut sortir :
    // un statut ACTIVE ou UNKNOWN masquerait des fonds bloques. Si la reprise est annoncee, repasser la fiche en ACTIVE.
    // Observation WCORE, hors source officielle : le RPC public rend un dernier bloc date du 29/10/2026.
    // Aucune echeance publiee : pas de deadline. Recuperation UNKNOWN, jamais NOT_AVAILABLE sans source.
    deadlines: [],
    sources: {
      "zklink-halt": { url: "https://x.com/zkLink_Official/status/2115792847098216545", publisher: "zkLink (compte X officiel, mise a jour du 29/10/2026)", publisherEn: "zkLink (official X account, update of 2026-10-29)", official: true, retrievedAt: "2026-11-22T08:40:00Z" },
      "zklink-bounty": { url: "https://x.com/zkLink_Official/status/2116211025104216124", publisher: "zkLink (compte X officiel, 30/10/2026)", publisherEn: "zkLink (official X account, 2026-10-30)", official: true, retrievedAt: "2026-11-22T08:40:00Z" },
    },
    recoveryAfterShutdown: "UNKNOWN",
    recoveryNote: "Reseau suspendu, pas ferme : « Block production on zkLink Nova suspended » et retraits « temporarily disabled » depuis l'exploit du 28-29/10/2026. Reprise annoncee seulement « after we have fully confirmed that all risks have been eliminated », sans date. Aucun plan de remboursement des utilisateurs publie a ce jour (seule une prime pour retrouver les fonds voles).",
    recoveryNoteEn: "Network suspended, not closed: “Block production on zkLink Nova suspended” and withdrawals “temporarily disabled” since the 2026-10-28/29 exploit. Restoration announced only “after we have fully confirmed that all risks have been eliminated”, with no date. No user reimbursement plan published to date (only a bounty to recover the stolen funds).",
    lastVerifiedAt: "2026-11-22T08:40:00Z",
  },
];

// ---------------------------------------------------------------------------
// Exposition
// ---------------------------------------------------------------------------
export const EXPOSURE_STATES = ["POSITIVE", "ZERO_ATTESTED", "UNKNOWN", "NOT_COVERED"] as const;
export type ExposureState = (typeof EXPOSURE_STATES)[number];
export type PositionKind = "NATIVE" | "ERC20" | "STAKING" | "DEFI";

export interface ExposureInput {
  chainKey: string;
  kind: PositionKind;
  asset?: string;
  /** false = WCORE ne couvre pas ce type de position sur cette chaine. */
  covered: boolean;
  balance: number | null;
  /** Horodatage attesté de l'observation du solde (ms). */
  balanceObservedAt: number | null;
  /** Delai de deblocage (staking), en jours. */
  unbondingDays?: number;
}

/** Fraicheur maximale d'un solde pour en tirer une conclusion (6 h, contrat WalletCache). */
export const DEFAULT_BALANCE_MAX_AGE_MS = 6 * 3600 * 1000;

export function classifyExposure(input: ExposureInput, nowMs: number, maxAgeMs = DEFAULT_BALANCE_MAX_AGE_MS): ExposureState {
  if (!input.covered) return "NOT_COVERED";
  const b = input.balance;
  const ts = input.balanceObservedAt;
  if (b === null || !Number.isFinite(b) || ts === null || !Number.isFinite(ts) || ts <= 0 || ts > nowMs) return "UNKNOWN";
  if (b > 0) return "POSITIVE"; // un solde positif reste un fait, meme ancien
  if (b === 0 && nowMs - ts < maxAgeMs) return "ZERO_ATTESTED";
  return "UNKNOWN";
}

/** Agregat par chaine : jamais « sur » sans preuve de solde nul pour TOUTES les positions. */
export function aggregateExposure(states: readonly ExposureState[]): ExposureState {
  if (states.includes("POSITIVE")) return "POSITIVE";
  if (states.length === 0) return "NOT_COVERED";
  if (states.every((s) => s === "ZERO_ATTESTED")) return "ZERO_ATTESTED";
  if (states.every((s) => s === "NOT_COVERED")) return "NOT_COVERED";
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Echeance contraignante
// ---------------------------------------------------------------------------
export interface BindingDeadline {
  kind: DeadlineKind;
  /** Moment ou l'utilisateur doit avoir AGI (ms). */
  actionByMs: number;
  /** Deux sources officielles ou plus donnent des dates differentes pour ce type. */
  conflict: boolean;
  officialSourceUrls: string[];
  /** Au moins une source officielle soutient cette echeance. */
  verified: boolean;
  /** L'echeance retenue n'est annoncee qu'a un jour approximatif, sans heure (DeadlineFact.approximate). */
  approximate: boolean;
}

const DAY_MS = 86400000;

function factOfficialUrls(rec: ChainLifecycleRecord, f: DeadlineFact): string[] {
  return f.sourceIds.map((id) => rec.sources[id]).filter((s): s is SourceRef => !!s && s.official).map((s) => s.url);
}

/**
 * Premiere echeance financiere reellement contraignante, compte tenu des
 * positions : un staking avec deblocage de N jours doit etre engage N jours
 * avant la derniere date de retrait/bridge si aucune date d'unstake n'est publiee.
 * Retourne null si aucune echeance n'existe ; les echeances passees sont incluses
 * (actionByMs <= now) pour qualifier une immobilisation.
 */
export function bindingDeadline(rec: ChainLifecycleRecord, exposures: readonly ExposureInput[], nowMs: number): BindingDeadline | null {
  if (!rec.deadlines.length) return null;
  const byKind = new Map<DeadlineKind, DeadlineFact[]>();
  const held = exposures.filter((e) => e.covered === false || e.balance === null || (e.balance ?? 0) > 0);
  for (const f of rec.deadlines) {
    const t = Date.parse(f.at);
    if (!Number.isFinite(t)) continue;
    // Une echeance limitee a certains actifs ne contraint que si une position les concerne
    // (une position d'actif inconnu ou non couverte est consideree comme concernee).
    if (f.assets && f.assets.length && exposures.length && !held.some((e) => !e.asset || f.assets!.includes(e.asset))) continue;
    byKind.set(f.kind, [...(byKind.get(f.kind) || []), f]);
  }
  const candidates: BindingDeadline[] = [];
  const staking = exposures.filter((e) => e.kind === "STAKING" && e.covered && (e.balance === null || e.balance > 0));
  const maxUnbondDays = staking.reduce((m, e) => Math.max(m, e.unbondingDays || 0), 0);
  for (const [kind, facts] of byKind) {
    const times = facts.map((f) => Date.parse(f.at));
    const earliest = Math.min(...times);
    const officialFacts = facts.filter((f) => factOfficialUrls(rec, f).length > 0);
    const officialTimes = new Set(officialFacts.map((f) => Date.parse(f.at)));
    let actionBy = earliest;
    if (kind === "UNSTAKE_LAST" && staking.length === 0) continue; // sans staking, non contraignant
    if ((kind === "WITHDRAW_LAST" || kind === "BRIDGE_WITHDRAW_LAST") && maxUnbondDays > 0 && !byKind.has("UNSTAKE_LAST")) {
      actionBy = earliest - maxUnbondDays * DAY_MS;
    }
    candidates.push({
      kind,
      actionByMs: actionBy,
      conflict: officialTimes.size > 1,
      officialSourceUrls: Array.from(new Set(facts.flatMap((f) => factOfficialUrls(rec, f)))),
      verified: officialFacts.length > 0,
      approximate: facts.some((f) => f.approximate === true && Date.parse(f.at) === earliest),
    });
  }
  if (!candidates.length) return null;
  // Une sortie deja fermee (retrait, bridge ou arret passe) prime sur toute echeance future :
  // les fonds sont alors deja bloques, meme si le reseau tourne encore.
  const EXIT_KINDS: DeadlineKind[] = ["BRIDGE_WITHDRAW_LAST", "WITHDRAW_LAST", "NETWORK_SHUTDOWN"];
  const closedExits = candidates.filter((c) => c.actionByMs <= nowMs && EXIT_KINDS.includes(c.kind)).sort((a, b) => b.actionByMs - a.actionByMs);
  if (closedExits.length) return closedExits[0] ?? null;
  const future = candidates.filter((c) => c.actionByMs > nowMs).sort((a, b) => a.actionByMs - b.actionByMs);
  if (future.length) return future[0] ?? null;
  return candidates.sort((a, b) => b.actionByMs - a.actionByMs)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Alertes
// ---------------------------------------------------------------------------
export type AlertSeverity = "P0" | "P1" | "P2";
export type AlertCode =
  | "ACTION_REQUIRED_BEFORE_DEADLINE"
  | "FUNDS_STRANDED_AFTER_SHUTDOWN"
  | "EXPOSURE_UNKNOWN_AFTER_SHUTDOWN"
  | "RECOVERY_WINDOW_OPEN"
  | "RECOVERY_PLANNED"
  | "RETIRED_NO_EXPOSURE"
  | "UNVERIFIED_ANNOUNCEMENT"
  | "SENTINEL_STALE";

export interface SentinelAlert {
  id: string;
  chainKey: string;
  chainId: number;
  code: AlertCode;
  severity: AlertSeverity;
  actionByMs: number | null;
  countdownMs: number | null;
  deadlineKind: DeadlineKind | null;
  /** true : actionByMs vient d'une echeance annoncee sans heure ; l'interface n'affiche que le jour. */
  deadlineApproximate?: boolean;
  conflict: boolean;
  officialSourceUrls: string[];
  exposure: ExposureState;
  /** Detail prive (jamais publie) : etat par position, sans montant. */
  privateDetail?: { positions: { kind: PositionKind; asset?: string; state: ExposureState }[] };
}

function alertId(chainKey: string, code: AlertCode, actionByMs: number | null): string {
  return `${chainKey}|${code}|${actionByMs === null ? "-" : new Date(actionByMs).toISOString()}`;
}

export function evaluateChain(rec: ChainLifecycleRecord, exposures: readonly ExposureInput[], nowMs: number): SentinelAlert | null {
  // Une panne RPC ou un statut inconnu ne declenchent rien : seules les sources officielles comptent.
  if (rec.status === "ACTIVE" || rec.status === "UNKNOWN") return null;
  const states = exposures.map((e) => classifyExposure(e, nowMs));
  const exposure = aggregateExposure(states);
  const bd = bindingDeadline(rec, exposures, nowMs);
  const base = {
    chainKey: rec.chainKey,
    chainId: rec.chainId,
    deadlineKind: bd ? bd.kind : null,
    deadlineApproximate: bd ? bd.approximate : false,
    conflict: bd ? bd.conflict : false,
    // Sans echeance (reseau suspendu, par exemple), les sources officielles de la fiche restent citees.
    officialSourceUrls: bd ? bd.officialSourceUrls : Object.values(rec.sources).filter((s) => s.official).map((s) => s.url),
    exposure,
    privateDetail: { positions: exposures.map((e, i) => ({ kind: e.kind, asset: e.asset, state: states[i] ?? ("UNKNOWN" as ExposureState) })) },
  };
  const mk = (code: AlertCode, severity: AlertSeverity): SentinelAlert => {
    const actionByMs = bd ? bd.actionByMs : null;
    return { ...base, id: alertId(rec.chainKey, code, actionByMs), code, severity, actionByMs, countdownMs: actionByMs === null ? null : actionByMs - nowMs };
  };
  if (bd && !bd.verified) return mk("UNVERIFIED_ANNOUNCEMENT", exposure === "ZERO_ATTESTED" ? "P2" : "P1");
  const passed = !bd || bd.actionByMs <= nowMs;
  if (passed) {
    if (rec.recoveryAfterShutdown === "AVAILABLE" && exposure !== "ZERO_ATTESTED") {
      // L echeance utile devient la fin de la fenetre de reclamation, si elle est publiee.
      const claim = rec.deadlines.filter((f) => f.kind === "CLAIM_END").map((f) => ({ f, t: Date.parse(f.at) }))
        .filter((x) => Number.isFinite(x.t) && x.t > nowMs).sort((a, b) => a.t - b.t)[0];
      const a = mk("RECOVERY_WINDOW_OPEN", "P0");
      if (claim) {
        const urls = factOfficialUrls(rec, claim.f);
        return { ...a, id: alertId(rec.chainKey, "RECOVERY_WINDOW_OPEN", claim.t), actionByMs: claim.t, countdownMs: claim.t - nowMs, deadlineKind: "CLAIM_END", deadlineApproximate: claim.f.approximate === true, officialSourceUrls: urls.length ? urls : a.officialSourceUrls };
      }
      return a;
    }
    if (rec.recoveryAfterShutdown === "PLANNED" && exposure !== "ZERO_ATTESTED") return mk("RECOVERY_PLANNED", exposure === "POSITIVE" ? "P0" : "P1");
    if (exposure === "POSITIVE") return mk("FUNDS_STRANDED_AFTER_SHUTDOWN", "P0");
    if (exposure === "UNKNOWN" || exposure === "NOT_COVERED") return mk("EXPOSURE_UNKNOWN_AFTER_SHUTDOWN", "P1");
    return mk("RETIRED_NO_EXPOSURE", "P2");
  }
  if (exposure === "ZERO_ATTESTED") return mk("RETIRED_NO_EXPOSURE", "P2");
  const left = bd!.actionByMs - nowMs;
  return mk("ACTION_REQUIRED_BEFORE_DEADLINE", left <= 7 * DAY_MS ? "P0" : left <= 30 * DAY_MS ? "P1" : "P2");
}

// ---------------------------------------------------------------------------
// Deduplication, notifications, sante de la surveillance
// ---------------------------------------------------------------------------
export interface AlertDiff { added: SentinelAlert[]; unchanged: SentinelAlert[]; resolved: string[]; deadlineChanged: SentinelAlert[] }

export function diffAlerts(previous: readonly SentinelAlert[], current: readonly SentinelAlert[]): AlertDiff {
  const prevById = new Map(previous.map((a) => [a.id, a]));
  const prevByChainCode = new Map(previous.map((a) => [`${a.chainKey}|${a.code}`, a]));
  const added: SentinelAlert[] = [], unchanged: SentinelAlert[] = [], deadlineChanged: SentinelAlert[] = [];
  for (const a of current) {
    if (prevById.has(a.id)) { unchanged.push(a); continue; }
    if (prevByChainCode.has(`${a.chainKey}|${a.code}`)) deadlineChanged.push(a);
    else added.push(a);
  }
  const currentIds = new Set(current.map((a) => a.id));
  const changedKeys = new Set(deadlineChanged.map((a) => `${a.chainKey}|${a.code}`));
  const resolved = previous.filter((a) => !currentIds.has(a.id) && !changedKeys.has(`${a.chainKey}|${a.code}`)).map((a) => a.id);
  return { added, unchanged, resolved, deadlineChanged };
}

/** Alertes a pousser : P0/P1 non acquittees, y compris deja vues mais jamais acquittees. */
export function pendingNotifications(alerts: readonly SentinelAlert[], acknowledgedIds: ReadonlySet<string>): SentinelAlert[] {
  return alerts.filter((a) => (a.severity === "P0" || a.severity === "P1") && !acknowledgedIds.has(a.id))
    .sort((a, b) => (a.severity === b.severity ? (a.actionByMs ?? 0) - (b.actionByMs ?? 0) : a.severity === "P0" ? -1 : 1));
}

export function monitorHealthAlert(lastSuccessAtMs: number | null, nowMs: number, intervalMs: number): SentinelAlert | null {
  const stale = lastSuccessAtMs === null || nowMs - lastSuccessAtMs > 2 * intervalMs;
  if (!stale) return null;
  return {
    id: alertId("sentinel", "SENTINEL_STALE", null), chainKey: "sentinel", chainId: 0, code: "SENTINEL_STALE",
    severity: lastSuccessAtMs === null ? "P0" : "P1", actionByMs: null, countdownMs: null, deadlineKind: null,
    conflict: false, officialSourceUrls: [], exposure: "UNKNOWN",
  };
}

/** Projection publique : aucune donnee de portefeuille. */
export type PublicSentinelAlert = Omit<SentinelAlert, "exposure" | "privateDetail" | "id"> & { exposure: "AUTH_REQUIRED" };
export function toPublicAlert(a: SentinelAlert): PublicSentinelAlert {
  const { privateDetail: _p, exposure: _e, id: _i, ...rest } = a;
  return { ...rest, exposure: "AUTH_REQUIRED" };
}

/** Couverture des sources officielles sur un ensemble de chaines actives. */
export function officialSourceCoverage(activeChainKeys: readonly string[], registry: readonly ChainLifecycleRecord[] = VERIFIED_LIFECYCLE_REGISTRY): { monitored: number; withOfficialSource: number; ratio: number } {
  const keys = new Set(activeChainKeys.map((k) => k.toLowerCase()));
  // Une chaine n est couverte que si au moins une ECHEANCE est soutenue par une source officielle.
  const withSrc = registry.filter((r) => keys.has(r.chainKey) && r.deadlines.some((f) => factOfficialUrls(r, f).length > 0)).length;
  return { monitored: keys.size, withOfficialSource: withSrc, ratio: keys.size ? withSrc / keys.size : 0 };
}

// ---------------------------------------------------------------------------
// Adaptateur scans WCORE -> expositions (croisement financier)
// ---------------------------------------------------------------------------


export function normalizeChainKey(k: string): string {
  return String(k || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Construit les expositions d un utilisateur a partir de ses scans. Un scan
 * degrade ou en erreur ne peut jamais attester un solde nul ; les positions de
 * staking et DeFi ne sont pas couvertes par les scans actuels (NOT_COVERED).
 */
export function exposuresFromScans(scans: readonly _ScanResultForAdapter[], chainKeys: readonly string[]): ExposureInput[] {
  const wanted = new Set(chainKeys.map(normalizeChainKey));
  const out: ExposureInput[] = [];
  for (const scan of scans) {
    for (const chain of scan.chains || []) {
      const key = normalizeChainKey(chain.chainKey);
      if (!wanted.has(key)) continue;
      const observed = Date.parse(chain.cachedAt || scan.generatedAt);
      const ts = Number.isFinite(observed) ? observed : null;
      const unreliable = chain.degraded || (chain.errors && chain.errors.length > 0);
      const bal = (b: number) => (unreliable && b === 0 ? null : b);
      if (chain.native) out.push({ chainKey: key, kind: "NATIVE", asset: chain.native.symbol, covered: true, balance: bal(chain.native.balance), balanceObservedAt: ts });
      else out.push({ chainKey: key, kind: "NATIVE", covered: true, balance: null, balanceObservedAt: ts });
      for (const t of chain.tokens || []) out.push({ chainKey: key, kind: "ERC20", asset: t.symbol, covered: true, balance: bal(t.balance), balanceObservedAt: ts });
      out.push({ chainKey: key, kind: "STAKING", covered: false, balance: null, balanceObservedAt: null });
    }
  }
  return out;
}
