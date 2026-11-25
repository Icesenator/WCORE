// Chain Sentinel — guides « Comment recuperer mes fonds », par chaine.
//
// Contenu d'affichage seulement : aucun fait d'alerte (echeance, statut, exposition) n'en depend.
// Chaque guide porte ses propres sources officielles, relues a la main (retrievedAt) : le collecteur
// ne les surveille pas, et le registre sauvegarde en production n'a pas a etre modifie.
// Un guide n'est joint a une fiche que si la fiche annonce toujours le meme etat de recuperation
// que celui sous lequel le guide a ete ecrit (appliesWhen) : une fiche corrigee depuis par
// l'administration ne recoit jamais un guide perime.
// Regles de redaction : chaque affirmation cite au moins une source du guide ; conditionnel tant
// que la procedure n'est pas ouverte ou n'est connue que par annonce ; jamais de garantie.

import type { ChainLifecycleRecord, SourceRef } from "./chain-sentinel";

/** Une affirmation du guide, en francais et en anglais, rattachee a des sources du guide. */
export interface RecoveryGuideItem { fr: string; en: string; sourceIds: string[] }

/** Lien officiel a utiliser (portail, bridge, page d'aide), rattache a une source du guide. */
export interface RecoveryGuideLink { sourceId: string; labelFr: string; labelEn: string }

export interface RecoveryGuide {
  /** Etat de recuperation de la fiche sous lequel ce guide a ete ecrit. */
  appliesWhen: ChainLifecycleRecord["recoveryAfterShutdown"];
  links: RecoveryGuideLink[];
  /** Etapes ordonnees. */
  steps: RecoveryGuideItem[];
  /** Actifs concernes, seuils, cas particuliers. */
  eligibility?: RecoveryGuideItem[];
  /** Date d'ouverture annoncee de la procedure (ISO 8601 UTC) ; absente = deja ouverte ou rien d'annonce. */
  opensAt?: { at: string; approximate?: boolean; /** Libelle publie quand seul le mois est annonce. */ labelFr?: string; labelEn?: string; sourceIds: string[] };
  feesAndRisks?: RecoveryGuideItem[];
  sources: Record<string, SourceRef>;
  verifiedAt: string;
}

const READ_20261125 = "2026-11-25T05:50:00Z";

export const RECOVERY_GUIDES: Readonly<Record<string, RecoveryGuide>> = {
  sophon: {
    appliesWhen: "NOT_AVAILABLE",
    links: [
      { sourceId: "claim", labelFr: "Portail de retrait et de réclamation (claim.sophon.com)", labelEn: "Withdrawal and claim portal (claim.sophon.com)" },
      { sourceId: "docs", labelFr: "Guide officiel de migration", labelEn: "Official migration guide" },
    ],
    steps: [
      { fr: "Connecter à claim.sophon.com le portefeuille qui détient les actifs sur Sophon.", en: "Connect the wallet holding the assets on Sophon to claim.sophon.com.", sourceIds: ["docs"] },
      { fr: "Réclamer les récompenses de staking et Guardian encore dues.", en: "Claim any outstanding staking and Guardian rewards.", sourceIds: ["docs"] },
      { fr: "Pour chaque solde, choisir « Withdraw from Sophon », puis une des routes proposées via Jumper (directe ou par Ethereum) ; confirmer et attendre la fin du bridge.", en: "For each balance, choose “Withdraw from Sophon”, then one of the routes offered through Jumper (direct or via Ethereum); confirm and wait for the bridge to complete.", sourceIds: ["docs"] },
      { fr: "SOPH liquide : le retirer vers Ethereum par la route canonique ; aucun échange de jeton n'est nécessaire selon la documentation.", en: "Liquid SOPH: withdraw it to Ethereum through the canonical route; no token swap is needed according to the documentation.", sourceIds: ["docs"] },
    ],
    eligibility: [
      { fr: "Guardian NFT, vSOPH et SOPH stakés : transition annoncée comme automatique vers Ethereum, sans migration manuelle.", en: "Guardian NFTs, vSOPH and staked SOPH: transition announced as automatic to Ethereum, with no manual migration.", sourceIds: ["docs"] },
      { fr: "SOPH, ETH, USN et autres jetons liquides : à retirer soi-même.", en: "SOPH, ETH, USN and other liquid tokens: must be withdrawn by the holder.", sourceIds: ["docs"] },
    ],
    feesAndRisks: [
      { fr: "Le compte officiel demande de retirer avant le 25 novembre 2026 ; la chaîne s'arrêterait le 30 novembre (« don't risk losing access »).", en: "The official account asks users to withdraw by 25 November 2026; the chain would shut down on 30 November (“don't risk losing access”).", sourceIds: ["x-reminder"] },
      { fr: "La documentation ne donne pas encore ces dates : elles viennent du compte X officiel.", en: "The documentation does not yet give these dates: they come from the official X account.", sourceIds: ["docs", "x-reminder"] },
      { fr: "LayerZero ne permet plus de bridger le SOPH depuis ou vers Sophon depuis le 25 juin 2026.", en: "LayerZero can no longer bridge SOPH to or from Sophon since 25 June 2026.", sourceIds: ["docs"] },
    ],
    sources: {
      claim: { url: "https://claim.sophon.com/", publisher: "Sophon (portail officiel)", publisherEn: "Sophon (official portal)", official: true, retrievedAt: READ_20261125 },
      docs: { url: "https://docs.sophon.xyz/migration", publisher: "Sophon Documentation (officiel)", publisherEn: "Sophon Documentation (official)", official: true, retrievedAt: READ_20261125 },
      "x-reminder": { url: "https://x.com/Sophon/status/2117352374679244928", publisher: "Sophon (compte X officiel, rappel du 02/11/2026)", publisherEn: "Sophon (official X account, reminder of 2026-11-02)", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },

  abstract: {
    appliesWhen: "NOT_AVAILABLE",
    links: [
      { sourceId: "hub", labelFr: "Migration Hub (migrate.abs.xyz)", labelEn: "Migration Hub (migrate.abs.xyz)" },
      { sourceId: "bridge", labelFr: "Bridge natif Abstract", labelEn: "Abstract native bridge" },
    ],
    steps: [
      { fr: "Connecter au Migration Hub le portefeuille qui détient les fonds sur Abstract.", en: "Connect the wallet holding the funds on Abstract to the Migration Hub.", sourceIds: ["hub"] },
      { fr: "Sortir les fonds d'Abstract par le Migration Hub ou par le bridge natif (native-bridge.abs.xyz) ; le hub liste aussi Stargate, Relay et Jumper comme bridges alternatifs.", en: "Move the funds off Abstract through the Migration Hub or the native bridge (native-bridge.abs.xyz); the hub also lists Stargate, Relay and Jumper as alternative bridges.", sourceIds: ["hub"] },
      { fr: "Le faire sans attendre : le hub conseille de migrer « at your earliest convenience ».", en: "Do it without waiting: the hub advises migrating “at your earliest convenience”.", sourceIds: ["hub"] },
    ],
    feesAndRisks: [
      { fr: "Selon le hub, les fonds non migrés avant le 15 décembre 2026 seraient perdus (« will lose access to their funds »).", en: "According to the hub, funds not migrated by 15 December 2026 would be lost (“will lose access to their funds”).", sourceIds: ["hub"] },
      { fr: "Le hub n'indique ni frais ni montant minimum, et aucune instruction propre aux applications n'y est encore publiée.", en: "The hub states no fees or minimum amount, and no app-specific instructions are published there yet.", sourceIds: ["hub"] },
    ],
    sources: {
      hub: { url: "https://migrate.abs.xyz/", publisher: "Abstract (Migration Hub officiel)", publisherEn: "Abstract (official Migration Hub)", official: true, retrievedAt: READ_20261125 },
      bridge: { url: "https://native-bridge.abs.xyz/", publisher: "Abstract (bridge natif, lié depuis le hub)", publisherEn: "Abstract (native bridge, linked from the hub)", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },

  neon: {
    appliesWhen: "UNKNOWN",
    links: [
      { sourceId: "neonpass", labelFr: "NeonPass (retrait vers Solana)", labelEn: "NeonPass (withdrawal to Solana)" },
      { sourceId: "withdraw-doc", labelFr: "Instructions officielles de retrait", labelEn: "Official withdrawal instructions" },
      { sourceId: "site", labelFr: "Annonce de fin de Neon EVM", labelEn: "Neon EVM wind-down notice" },
    ],
    steps: [
      { fr: "Préparer dans le même navigateur un portefeuille compatible Neon EVM (MetaMask, Rabby…) et un portefeuille Solana (Phantom, Solflare…).", en: "Set up a Neon EVM-compatible wallet (MetaMask, Rabby…) and a Solana wallet (Phantom, Solflare…) in the same browser.", sourceIds: ["withdraw-doc"] },
      { fr: "Sur NeonPass, connecter les deux portefeuilles ; seul le sens Neon → Solana reste ouvert, les dépôts étant fermés.", en: "On NeonPass, connect both wallets; only the Neon → Solana direction remains open, as deposits are closed.", sourceIds: ["withdraw-doc"] },
      { fr: "Choisir le jeton et le montant, vérifier les frais affichés, puis signer dans les deux portefeuilles.", en: "Choose the token and amount, check the displayed fees, then sign in both wallets.", sourceIds: ["withdraw-doc"] },
    ],
    eligibility: [
      { fr: "Le jeton NEON (SPL sur Solana) n'est pas supprimé par l'arrêt, mais Neon ne garantit ni son utilité ni sa liquidité.", en: "The NEON token (SPL on Solana) is not removed by the wind-down, but Neon gives no assurance about its utility or liquidity.", sourceIds: ["site"] },
    ],
    feesAndRisks: [
      { fr: "Gaz payé en NEON ou dans le jeton retiré ; il faut du SOL sur le portefeuille Solana pour le premier retrait, plus cher car il crée le compte lié.", en: "Gas is paid in NEON or in the withdrawn token; the Solana wallet needs SOL for the first withdrawal, which costs more because it creates the linked account.", sourceIds: ["withdraw-doc"] },
      { fr: "Retraits à terminer avant le 31 décembre 2026 ; aucune date d'arrêt du réseau n'est publiée.", en: "Withdrawals should be completed before 31 December 2026; no network shutdown date is published.", sourceIds: ["site"] },
      { fr: "Neon ne demande jamais la clé privée ni la phrase secrète : vérifier que l'on est bien sur neonevm.org.", en: "Neon never asks for a private key or seed phrase: check that you are on neonevm.org.", sourceIds: ["site"] },
    ],
    sources: {
      site: { url: "https://neonevm.org/", publisher: "Neon EVM (site officiel)", publisherEn: "Neon EVM (official site)", official: true, retrievedAt: READ_20261125 },
      "withdraw-doc": { url: "https://docs.neonevm.org/docs/token_transferring/neonpass_withdrawal/", publisher: "Neon Docs (officiel)", publisherEn: "Neon Docs (official)", official: true, retrievedAt: READ_20261125 },
      neonpass: { url: "https://neonpass.live/", publisher: "NeonPass (lié depuis la documentation officielle)", publisherEn: "NeonPass (linked from the official docs)", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },

  cronos_zkevm: {
    appliesWhen: "NOT_AVAILABLE",
    links: [
      { sourceId: "bridge", labelFr: "Bridge officiel Cronos zkEVM", labelEn: "Official Cronos zkEVM bridge" },
      { sourceId: "blog", labelFr: "Annonce officielle de l'arrêt", labelEn: "Official shutdown announcement" },
    ],
    steps: [
      { fr: "Garder assez de zkCRO dans le portefeuille pour payer le gaz du retrait.", en: "Keep enough zkCRO in the wallet to pay the withdrawal gas.", sourceIds: ["blog"] },
      { fr: "Retirer les actifs pontés par le bridge officiel (zkevm.cronos.org/bridge), le plus tôt possible.", en: "Withdraw bridged assets through the official bridge (zkevm.cronos.org/bridge) as early as possible.", sourceIds: ["blog"] },
      { fr: "Pour une position dans une application (prêt, pool…), suivre l'annonce de cette application : chacune doit publier sa propre marche à suivre.", en: "For a position inside an app (lending, pool…), follow that app's announcement: each one is expected to publish its own instructions.", sourceIds: ["blog"] },
    ],
    feesAndRisks: [
      { fr: "Le bridge resterait ouvert environ 12 mois, « subject to change ».", en: "The bridge would remain open for about 12 months, “subject to change”.", sourceIds: ["blog"] },
      { fr: "Après l'arrêt du 3 juin 2027 à 03:00 UTC, les actifs restés sur la chaîne « will not be recoverable ».", en: "After the shutdown on 3 June 2027 at 03:00 UTC, assets left on the chain “will not be recoverable”.", sourceIds: ["blog"] },
    ],
    sources: {
      blog: { url: "https://blog.cronos.com/p/sunsetting-the-cronos-zkevm-alpha", publisher: "Cronos Labs (blog officiel)", publisherEn: "Cronos Labs (official blog)", official: true, retrievedAt: READ_20261125 },
      bridge: { url: "https://zkevm.cronos.org/bridge/", publisher: "Cronos zkEVM (bridge officiel, lié depuis le blog)", publisherEn: "Cronos zkEVM (official bridge, linked from the blog)", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },

  lisk: {
    appliesWhen: "PLANNED",
    links: [
      { sourceId: "blog", labelFr: "Annonce officielle de la fermeture (FAQ)", labelEn: "Official closure announcement (FAQ)" },
    ],
    opensAt: { at: "2027-01-01T00:00:00Z", approximate: true, labelFr: "janvier 2027", labelEn: "January 2027", sourceIds: ["blog"] },
    steps: [
      { fr: "Le portail et le bridge Lisk sont fermés depuis le 2 novembre 2026 : aucun retrait n'est possible par eux.", en: "The Lisk Portal and Bridge have been closed since 2 November 2026: no withdrawal is possible through them.", sourceIds: ["blog"] },
      { fr: "Lisk prévoit un processus de réclamation manuel en janvier 2027 ; les détails seraient publiés à ce moment-là.", en: "Lisk plans a manual claims process in January 2027; details would be shared then.", sourceIds: ["blog"] },
      { fr: "D'ici là, surveiller le blog officiel : aucun formulaire n'est ouvert à ce jour.", en: "Until then, watch the official blog: no form is open yet.", sourceIds: ["blog"] },
    ],
    feesAndRisks: [
      { fr: "Aucune garantie : ni les actifs concernés ni les conditions de la réclamation ne sont publiés.", en: "No guarantee: neither the eligible assets nor the claim conditions are published.", sourceIds: ["blog"] },
      { fr: "Les quelque 5,2 millions de LSK restés dans le contrat de récompenses de staking seraient brûlés après l'arrêt, y compris les récompenses gagnées mais jamais réclamées.", en: "The ~5.2 million LSK left in the staking rewards contract would be burned after the shutdown, including rewards earned but never claimed.", sourceIds: ["blog"] },
    ],
    sources: {
      blog: { url: "https://lisk.com/blog/posts/lisk-chain-has-closed", publisher: "Lisk (blog officiel)", publisherEn: "Lisk (official blog)", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },

  blast: {
    appliesWhen: "AVAILABLE",
    links: [
      { sourceId: "recovery", labelFr: "Site de récupération Blast (blast.io)", labelEn: "Blast recovery site (blast.io)" },
      { sourceId: "x-recovery", labelFr: "Annonce officielle (X, 04/11/2026)", labelEn: "Official announcement (X, 2026-11-04)" },
    ],
    steps: [
      { fr: "Sur blast.io (réseau Ethereum), vérifier l'adresse qui détenait des fonds sur Blast, ou un portefeuille autorisé à réclamer pour elle (par exemple le propriétaire d'un Safe).", en: "On blast.io (Ethereum network), check the address that held funds on Blast, or a wallet approved to claim for it (for example a Safe owner).", sourceIds: ["recovery"] },
      { fr: "Connecter le portefeuille et réclamer : les fonds seraient retirés directement des contrats de récupération sur Ethereum.", en: "Connect the wallet and claim: funds would be withdrawn directly from the recovery contracts on Ethereum.", sourceIds: ["recovery"] },
      { fr: "Blast Mobile : importer sa phrase secrète dans un portefeuille comme MetaMask ou Rabby, puis connecter ce portefeuille ; son adresse diffère de celle de Blast Mobile, ce que le site dit normal.", en: "Blast Mobile: import its seed phrase into a wallet such as MetaMask or Rabby, then connect that wallet; its address differs from the Blast Mobile one, which the site says is normal.", sourceIds: ["recovery"] },
    ],
    eligibility: [
      { fr: "ETH, WETH ou USDB détenus sur Blast, y compris dans Blast Mobile ; un retrait vers Ethereum jamais finalisé serait inclus automatiquement.", en: "ETH, WETH or USDB held on Blast, including in Blast Mobile; a withdrawal to Ethereum that never finished would be included automatically.", sourceIds: ["recovery", "x-recovery"] },
    ],
    feesAndRisks: [
      { fr: "Ne saisir la phrase secrète que dans l'application du portefeuille, jamais sur un site web (consigne du site).", en: "Only type the seed phrase into the wallet app, never into a website (the site's own instruction).", sourceIds: ["recovery"] },
      { fr: "Le site serait actif 12 mois, avec un support final le 4 novembre 2027.", en: "The site would stay live for 12 months, with final support on 4 November 2027.", sourceIds: ["x-recovery"] },
    ],
    sources: {
      recovery: { url: "https://blast.io/", publisher: "Blast (site officiel de récupération)", publisherEn: "Blast (official recovery site)", official: true, retrievedAt: READ_20261125 },
      "x-recovery": { url: "https://x.com/blast/status/2117993462356197406", publisher: "Blast (compte X officiel)", publisherEn: "Blast (official X account)", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },

  gravity: {
    appliesWhen: "UNKNOWN",
    links: [
      { sourceId: "galxe", labelFr: "Aide officielle Galxe (dates et consignes)", labelEn: "Official Galxe help (dates and instructions)" },
    ],
    steps: [
      { fr: "Gravity Alpha s'est arrêté le 1er novembre 2026 : selon l'aide officielle, les actifs restés dessus « can no longer be transferred ».", en: "Gravity Alpha stopped on 1 November 2026: according to the official help page, assets left on it “can no longer be transferred”.", sourceIds: ["galxe"] },
      { fr: "Aucune procédure de récupération n'est publiée ; la page renvoie vers le support Galxe pour toute question.", en: "No recovery procedure is published; the page points to Galxe Support for any question.", sourceIds: ["galxe"] },
    ],
    sources: {
      galxe: { url: "https://help.galxe.com/en/articles/16010489-gravity-l1-mainnet-is-now-live", publisher: "Galxe Help Center", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },

  forma: {
    appliesWhen: "AVAILABLE",
    links: [
      { sourceId: "x-shutdown", labelFr: "Annonce officielle (X, 22/10/2026)", labelEn: "Official announcement (X, 2026-10-22)" },
    ],
    steps: [
      { fr: "Selon l'annonce, le TIA resté sur Forma après l'arrêt serait migré vers Eden, à la même adresse (les deux réseaux sont EVM) : le retirer depuis Eden une fois la migration terminée.", en: "According to the announcement, TIA left on Forma after the halt would be migrated to Eden, at the same address (both are EVM networks): withdraw it from Eden once the migration is complete.", sourceIds: ["x-shutdown"] },
      { fr: "Les NFT seraient à réclamer sur le site Modularium relancé, sur Ethereum : aucun largage automatique n'est prévu.", en: "NFTs would have to be claimed on the relaunched Modularium site, on Ethereum: no automatic airdrop is planned.", sourceIds: ["x-shutdown"] },
    ],
    feesAndRisks: [
      { fr: "L'annonce renvoyait les instructions détaillées « in the coming weeks » ; aucune date limite de réclamation n'y figure.", en: "The announcement deferred detailed instructions to “the coming weeks”; it gives no claim deadline.", sourceIds: ["x-shutdown"] },
    ],
    sources: {
      "x-shutdown": { url: "https://x.com/modularium_art/status/2113385579555495982", publisher: "Forma / Modularium (compte X officiel)", publisherEn: "Forma / Modularium (official X account)", official: true, retrievedAt: READ_20261125 },
    },
    verifiedAt: READ_20261125,
  },
};

/** Guide d'une fiche, seulement si la fiche annonce toujours l'etat de recuperation du guide. */
export function recoveryGuideFor(rec: Pick<ChainLifecycleRecord, "chainKey" | "recoveryAfterShutdown">, guides: Readonly<Record<string, RecoveryGuide>> = RECOVERY_GUIDES): RecoveryGuide | null {
  const g = Object.prototype.hasOwnProperty.call(guides, rec.chainKey) ? guides[rec.chainKey] : undefined;
  return g && g.appliesWhen === rec.recoveryAfterShutdown ? g : null;
}

/** Problemes de forme d'un guide (sources manquantes, texte vide, lien non officiel) ; vide = valide. */
export function recoveryGuideProblems(g: RecoveryGuide): string[] {
  const out: string[] = [];
  const has = (id: string) => Object.prototype.hasOwnProperty.call(g.sources, id);
  const items = [...g.steps, ...(g.eligibility ?? []), ...(g.feesAndRisks ?? [])];
  if (!g.steps.length) out.push("no steps");
  if (!g.links.length) out.push("no links");
  for (const it of items) {
    if (!it.fr.trim() || !it.en.trim()) out.push(`empty text: ${it.fr || it.en}`);
    if (!it.sourceIds.length) out.push(`unsourced: ${it.fr}`);
    for (const id of it.sourceIds) if (!has(id)) out.push(`unknown source ${id}`);
  }
  for (const l of g.links) {
    if (!has(l.sourceId)) out.push(`unknown link source ${l.sourceId}`);
    else if (!g.sources[l.sourceId]!.official) out.push(`unofficial link ${l.sourceId}`);
    if (!l.labelFr.trim() || !l.labelEn.trim()) out.push(`empty label ${l.sourceId}`);
  }
  if (g.opensAt) {
    if (!Number.isFinite(Date.parse(g.opensAt.at))) out.push("bad opensAt");
    if (!g.opensAt.sourceIds.length || !g.opensAt.sourceIds.every(has)) out.push("unsourced opensAt");
  }
  for (const [id, s] of Object.entries(g.sources)) {
    if (!/^https:\/\//.test(s.url)) out.push(`non-https source ${id}`);
    if (!Number.isFinite(Date.parse(s.retrievedAt))) out.push(`bad retrievedAt ${id}`);
  }
  return out;
}
