# Chaînes retirées — 2026-09-30

Enregistrement figé de ce qui a été supprimé de WCORE, et pourquoi.
Ces montants sont des **valeurs figées**, pas des soldes vérifiables : aucune de
ces chaînes n'est plus joignable, donc l'état réel des fonds est inconnu. Le
dernier état connu est celui du dernier scan réussi, indiqué ci-dessous.

| Chaîne | chainId | Dernier scan réussi | Actif figé | Montant figé | Cause du retrait |
|---|---|---|---|---|---|
| Botanix | 3637 | 2026-08-17 15:11:04 | 7,61433952857e-7 BTC | 0,04 € | Tous endpoints 404 (3 testés le 2026-09-30). Projet arrêté. |
| Degen | 666666666 | 2026-09-02 08:59:37 | 144,82090080404 DEGEN | 0,12 € | `rpc.degen.tips` HTTP 530, autres 404. **Sunset officiel 2026-08-31.** |
| DuckChain | 5545 | 2026-07-31 02:48:44 | 0,5807962711891891 GRAM | 0,72 € | `rpc.duckchain.io` HTTP 521, autres 404. Déjà `DISABLE_CHAIN=true`. |
| Superposition | 55244 | 2026-09-08 11:57:14 | 8,0082430953107e-5 ETH | 0,17 € | `rpc.superposition.so` injoignable. Seul `55244.rpc.thirdweb.com` répond, et **uniquement sur `eth_chainId`** ; toutes les méthodes réelles (`eth_getBalance`, `eth_blockNumber`) renvoient `-32603`. Wind down terminé. |
| RACE | 6805 | 2026-09-14 18:35:44 | 7,73747056560817e-4 ETH | 1,69 € | **Les domaines de la chaîne ne résolvent plus en DNS** (`racemainnet.io` et `racescan.io` : NXDOMAIN). Seul `6805.rpc.thirdweb.com` répond, et seulement sur `eth_chainId`. Retraitée le 2026-09-30. |

**Total retiré : 2,74 €** (valeurs figées, non récupérables).

## Récupération des fonds : impossible, et documenté

Pour chacune de ces chaînes, le retrait a été **exigé avant une date limite** qui
est passée :

- **Botanix** — L2 Bitcoin shut down le 2026-06-09. Retrait exigé avant le
  **2026-07-09** ; « any funds remaining will be swept by the network's
  federation ». Les fonds non retirés sont allés à la fédération.
- **Degen** — sunset le **2026-08-31**. L2Beat : « make sure to bridge off your
  funds before the deadline ». Délai dépassé.
- **DuckChain, Superposition, RACE** — chaînes mortes, domaines disparus, aucune
  voie de retrait identifiée.

Un solde sur une chaîne morte ne peut pas être dépensé : il n'existe plus de
nœud pour signer la transaction. Ce n'est pas une limite d'accès de notre côté,
c'est l'absence de contrepartie.

Voies de récupération testées et écartées le 2026-09-30 : RPC publics, API
d'explorateurs (botanixscan, racescan, explorateur Degen, superscan), archives
Routescan/Blockscout, et fournisseurs d'archive (Ankr, drpc, publicnode,
LlamaRPC, NodeReal, blastapi). Aucun ne sert ces chaînes.

## Portefeuille

- Avant : **7 673,17 €**
- Après : **7 670,43 €**

## Wallet

`0x17d518736ee9341dcdc0a2498e013d33cfcdd080` (inchangé).

## Ce qui a été supprimé

- `wcore-gsheet/src/{BOTANIX,DEGEN,DUCKCHAIN,SUPERPOSITION,RACE}.gs`
- `wcore-gsheet/dist/chains/{BOTANIX,DEGEN,DUCKCHAIN,SUPERPOSITION,RACE}.ts` (généré)
- `wcore-web/packages/core/src/chains/{BOTANIX,DEGEN,DUCKCHAIN,SUPERPOSITION,RACE}.ts`
- Entrées correspondantes dans `dist/chains/index.ts` (généré)
- Onglets Google Sheets `Ledger - Botanix`, `Ledger - Degen`, `Ledger - DuckChain`, `Ledger - Superposition`, `Ledger - RACE`

## Comment réintroduire une chaîne

Recréer `src/<CHAINE>.gs` via `ChainFactory.createEvmChain`, puis `npm run build:chains`
depuis `wcore-gsheet/`. Pour restaurer les données d'onglet, il faut l'historique
de version Google Sheets (le tableur le conserve) ou le backup `safe-push`.

## Point d'attention

Les noms restent présents dans quelques listes de noms en lecture seule
(`21_DASHBOARD.gs`, `25_RPC_HEALTH_RPC*.gs`, `27_ACTIVITY_REFRESH.gs`,
`33_DYNAMIC_RPC.gs`). C'est **inoffensif** : ce sont des listes de noms connus,
pas des références à la configuration de la chaîne. Les retirer est cosmétique
et a été laissé tel quel pour éviter des modifications sans effet dans des
chemins chauds.
