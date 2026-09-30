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

**Total retiré : 1,05 €** (valeurs figées, non récupérables).

## Portefeuille

- Avant : **7 673,17 €**
- Après : **7 672,12 €**

## Wallet

`0x17d518736ee9341dcdc0a2498e013d33cfcdd080` (inchangé).

## Ce qui a été supprimé

- `wcore-gsheet/src/{BOTANIX,DEGEN,DUCKCHAIN,SUPERPOSITION}.gs`
- `wcore-gsheet/dist/chains/{BOTANIX,DEGEN,DUCKCHAIN,SUPERPOSITION}.ts` (généré)
- `wcore-web/packages/core/src/chains/{BOTANIX,DEGEN,DUCKCHAIN,SUPERPOSITION}.ts`
- Entrées correspondantes dans `dist/chains/index.ts` (généré)
- Onglets Google Sheets `Ledger - Botanix`, `Ledger - Degen`, `Ledger - DuckChain`, `Ledger - Superposition`

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
