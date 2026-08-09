---
type: reference
status: active
project: web
date: 2026-07-22
source_raw: "[[wcore-web/docs/raw/bridge-citrea-2026-07-22]]"
---

# Bridge Citrea : constats pour une future integration

Cette note conserve les informations verifiees pendant un parcours reel visant a obtenir du **cBTC natif sur Citrea**. Elle ne constitue pas une specification d'implementation. Les routes, liquidites et devis doivent etre verifies de nouveau au moment de l'integration.

## Donnees reseau

| Champ | Valeur |
|---|---|
| Reseau | Citrea Mainnet |
| Chain ID | `4114` (`0x1012`) |
| RPC | `https://rpc.mainnet.citrea.xyz` |
| Explorer | `https://explorer.mainnet.citrea.xyz` |
| Monnaie native | `cBTC`, 18 decimales |
| Token enveloppe | `wcBTC` : `0x3100000000000000000000000000000000000006` |

`cBTC` est la monnaie native utilisee pour le gas. Ce n'est pas un ERC-20 et il n'a pas d'adresse de contrat.

## Routes constatees

### BTC vers cBTC

- **Clementine** est le bridge canonique et trust-minimized de Citrea.
- Un depot Clementine accepte exactement **10 BTC par operation**. Ce n'est pas une route adaptee aux petits montants.
- Pour moins de 10 BTC, la documentation Citrea recommande **Atomiq** ou **Symbiosis**.
- Atomiq accepte Bitcoin on-chain et Lightning. Symbiosis effectue un cross-chain swap dont le devis depend de la liquidite disponible.

### Base vers Citrea via Stargate

- Observation du 22 juillet 2026 : l'interface Stargate proposait `CTR` de Base vers `CTR` sur Citrea, mais pas une sortie directe en `cBTC`.
- Bridger `CTR` ne le convertit pas en `cBTC`.
- Stargate documente `Advanced settings > Gas on Destination > Medium`, avec environ 2,50 USD de gas natif sur Citrea.
- Cette option doit apparaitre dans le devis de la route precise avant toute signature. Sa disponibilite ne doit pas etre presumee pour CTR ni codee en dur.
- Si le refuel est confirme, le parcours possible est `CTR Base -> CTR Citrea + petit montant de cBTC`, puis `CTR -> cBTC` sur Citrea.
- Sans refuel, l'utilisateur peut recevoir du CTR sur Citrea sans disposer du cBTC necessaire au swap suivant.

## Contrats CTR verifies

| Reseau | Actif | Contrat officiel |
|---|---|---|
| Base | CTR bridge | `0x11030f79109269d796fd0fb956d6244e502757f7` |
| Citrea | CTR (chaine native) | `0x547AfD93B9c47D552059FEb556909e017f8a9b25` |

Le marche Aerodrome officiel permet le swap `USDC -> CTR` sur Base. Sur Citrea, le swap officiel Citrea et Satsuma permettent de rechercher une conversion `CTR -> cBTC`, sous reserve d'un devis et de liquidite au moment de l'operation.

## Exigences pour WCORE

Une integration WCORE devrait :

1. Demander d'abord **l'actif final souhaite**, pas seulement le protocole ou la chaine de destination.
2. Afficher separement **l'actif transfere**, **l'actif final**, et **le gas natif recu**.
3. Montrer la route complete, y compris les swaps intermediaires, approvals, frais, slippage et delai estime.
4. Verifier avant execution que le wallet aura assez de gas sur chaque chaine concernee.
5. Bloquer ou avertir fortement lorsqu'une route laisse l'utilisateur avec un actif intermediaire sans gas pour terminer.
6. Ne jamais presenter `CTR -> CTR` comme une route vers `cBTC`.
7. Lire les routes et devis en temps reel chez le fournisseur ; ne pas conserver une disponibilite observee comme une garantie.
8. Commencer par un mode read-only comparant montant recu, frais, gas fourni et risques avant d'autoriser la signature.

## Sources officielles

- [Informations reseau Citrea](https://docs.citrea.xyz/welcome/chain-information-quickstart.md)
- [Guide Bridge to Citrea](https://docs.citrea.xyz/welcome/bridge-to-citrea.md)
- [Clementine Web App](https://docs.citrea.xyz/essentials/using-clementine/clementine-web-app.md)
- [Contrats canoniques Citrea](https://docs.citrea.xyz/developer-documentation/canonical-contract-addresses.md)
- [CTR : contrats Base et Citrea](https://docs.citrea.xyz/ctr-token/ctr-token.md)
- [Marches CTR references par Citrea](https://citrea.xyz/ctr-token)
- [Bridge Hub Citrea](https://app.citrea.xyz/bridge)
- [Swap Citrea](https://app.citrea.xyz/swap)
- [Stargate](https://stargate.finance/bridge)
- [Atomiq](https://app.atomiq.exchange/)
- [Symbiosis BTC vers cBTC](https://app.symbiosis.finance/swap?amountIn=0.001&chainIn=Bitcoin&chainOut=Citrea&tokenIn=BTC&tokenOut=CBTC)
- [Satsuma](https://www.satsuma.exchange/)

## Point de controle avant integration

Revalider les chaines et tokens disponibles, les contrats, le support du refuel, les minimums, les frais, les delais et la liquidite. Les observations d'interface de cette note sont datees du **22 juillet 2026**.
