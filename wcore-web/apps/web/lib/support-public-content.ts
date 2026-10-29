export type SupportLanguage = "fr" | "en";
export const SUPPORT_ISSUES_URL = "https://github.com/Icesenator/WCORE/issues";
export interface SupportCoverage { readonly chainConfigCount: number; readonly cexProviderCount: number }
export interface SupportPublicContent {
  readonly title: string;
  readonly limitsHeading: string;
  readonly intro: string;
  readonly sections: ReadonlyArray<{ readonly heading: string; readonly body: string }>;
  readonly reportHeading: string;
  readonly reportItems: readonly string[];
  readonly channelHeading: string;
  readonly channelBody: string;
  readonly channelUrl: string;
  readonly channelCaveat: string;
  readonly walletHeading: string;
  readonly walletBody: string;
  readonly walletCta: string;
  readonly privacy: string;
}

export function buildSupportPublicContent(language: SupportLanguage, _coverage?: SupportCoverage): SupportPublicContent {
  if (language === "en") return {
    title: "Support", limitsHeading: "Before reporting a problem",
    intro: "Portfolio scanning reads balances without a transaction or wallet connection. Separate GM features can request signatures and on-chain transactions: check every wallet request. Never share a seed phrase or wallet private key.",
    sections: [
      { heading: "Zero, unknown and failed reads differ", body: "A zero shown alongside a source error does not prove an empty wallet. Check source errors and the last successful update before interpreting a balance." },
      { heading: "Coverage has limits", body: "A configured chain does not guarantee coverage of every token or DeFi position. Check the chain selector and About page; report the specific missing chain or protocol." },
      { heading: "Wallet and exchange data are separate", body: "Public on-chain addresses can be scanned without connecting a wallet. Exchange accounts use the Profile flow and read-only API credentials. Never put those credentials in a support report." },
      { heading: "Valuation is not an execution quote", body: "Displayed values are estimates. Liquidity, fees and slippage can change what a sale would return. A missing price is not a zero-valued asset." },
      { heading: "Delegated is not available", body: "Staked or delegated positions may have withdrawal conditions. Do not interpret them as immediately spendable balances." },
    ],
    reportHeading: "Useful report details",
    reportItems: ["Optional: a public wallet address, only if you accept exposing its activity. You can omit it.", "The chain, token or protocol concerned, without sensitive financial amounts.", "Expected behaviour, actual behaviour and reproduction steps.", "Approximate scan time and a redacted screenshot, if useful."],
    channelHeading: "Public technical issue tracker",
    channelBody: "The repository has a public GitHub issue tracker. Opening an issue requires a GitHub account; anyone can read the report.",
    channelUrl: SUPPORT_ISSUES_URL,
    channelCaveat: "A support triage owner and response capability are not verified. This is not a monitored support service, and a response is not guaranteed. Do not post confidential vulnerability details in a public issue.",
    walletHeading: "Existing wallet-linked tickets",
    walletBody: "You can also connect a wallet to access the existing ticket flow. Public help requires no wallet. Never include secrets in a ticket.",
    walletCta: "Connect to access your tickets",
    privacy: "Never publish a seed phrase, wallet private key, exchange API secret, password, account credentials or sensitive financial information. Redact screenshots before sharing.",
  };
  return {
    title: "Support", limitsHeading: "Avant de signaler un problème",
    intro: "Le scan de portefeuille lit les soldes sans transaction ni connexion de wallet. Les fonctions GM distinctes peuvent demander des signatures et des transactions on-chain : vérifiez chaque demande du wallet. Ne partagez jamais de phrase de récupération ni de clé privée de wallet.",
    sections: [
      { heading: "Zéro, inconnu et échec de lecture diffèrent", body: "Un zéro affiché avec une erreur source ne prouve pas un wallet vide. Vérifiez les erreurs et la dernière mise à jour réussie avant d'interpréter un solde." },
      { heading: "La couverture a des limites", body: "Une chaîne configurée ne garantit pas la couverture de tous ses tokens ou positions DeFi. Consultez le sélecteur de chaînes et la page About ; précisez la chaîne ou le protocole manquant." },
      { heading: "Wallet et exchange : deux parcours", body: "Une adresse on-chain publique peut être scannée sans connexion de wallet. Les comptes d'exchange utilisent le parcours Profile et des identifiants API en lecture seule. Ne joignez jamais ces identifiants à un signalement." },
      { heading: "Valorisation ne signifie pas prix d'exécution", body: "Les valeurs affichées sont des estimations. Liquidité, frais et slippage peuvent modifier le produit d'une vente. Un prix absent ne signifie pas un actif de valeur nulle." },
      { heading: "Délégué ne signifie pas disponible", body: "Les positions stakées ou déléguées peuvent avoir des conditions de retrait. Ne les interprétez pas comme des soldes immédiatement disponibles." },
    ],
    reportHeading: "Informations utiles au signalement",
    reportItems: ["Facultatif : une adresse publique de wallet, seulement si vous acceptez d'exposer son activité. Vous pouvez l'omettre.", "La chaîne, le token ou le protocole concerné, sans montant financier sensible.", "Le comportement attendu, le résultat observé et les étapes de reproduction.", "L'heure approximative du scan et, si utile, une capture expurgée."],
    channelHeading: "Registre public des problèmes techniques",
    channelBody: "Le dépôt possède un registre public GitHub Issues. Ouvrir une issue nécessite un compte GitHub ; tout le monde peut lire le signalement.",
    channelUrl: SUPPORT_ISSUES_URL,
    channelCaveat: "Le responsable de triage et la capacité de réponse sont non vérifiés. Ce registre n'est pas un service de support surveillé ; aucune réponse n'est garantie. Ne publiez pas les détails confidentiels d'une vulnérabilité dans une issue publique.",
    walletHeading: "Tickets existants liés au wallet",
    walletBody: "Vous pouvez aussi connecter un wallet pour accéder au parcours de tickets existant. L'aide publique ne demande aucun wallet. N'incluez jamais de secret dans un ticket.",
    walletCta: "Se connecter pour accéder aux tickets",
    privacy: "Ne publiez jamais de phrase de récupération, clé privée de wallet, secret API d'exchange, mot de passe, identifiants de compte ou information financière sensible. Expurgez vos captures avant partage.",
  };
}
