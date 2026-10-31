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

# B3 Mainnet — retrait du traitement actif, 2026-10-31

Différent des retraits ci-dessus : **la récupération des fonds n'est pas exclue**.

| Chaîne | chainId | Dernier scan réussi | Valeur affichée (figée) | Cause du retrait |
|---|---|---|---|---|
| B3 Mainnet | 8333 | 2026-10-30 19:43:57 | 6,47 € (cache périmé, non vérifiable) | Fermeture du réseau annoncée par B3 : le bridge officiel n'accepte plus de nouveaux retraits ; seuls les retraits déjà initiés peuvent être finalisés. Les deux RPC (relais vers thirdweb) répondaient `-32603` depuis le 2026-10-30. |

- **Récupération** : l'opérateur n'avait pas initié de retrait avant la date limite. Une demande de récupération exceptionnelle est en cours auprès du support officiel B3. **Aucune donnée de portefeuille, aucun historique ni aucune preuve ne doivent être supprimés** tant que cette demande n'est pas close.
- **Montant natif exact** : non recopié ici. Il est conservé dans le cache WalletCache et dans l'onglet `Ledger - B3`, à archiver avant tout retrait de l'onglet.
- **Ne pas confondre** : la suppression des *B3 Global Accounts* est un sujet distinct. Le token **B3 sur Base** (`0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3`) reste un actif suivi normalement.

Retiré du code :
- `wcore-gsheet/src/B3.gs`, `wcore-gsheet/dist/chains/B3.ts`, `wcore-web/packages/core/src/chains/B3.ts` ;
- `B3` des listes de `21_DASHBOARD`, `25_RPC_HEALTH_REPORT`, `27_ACTIVITY_REFRESH`, `33_DYNAMIC_RPC` ;
- la factory GM active (`GM_FACTORIES.b3`) et l'option de déploiement dev ;
- le relais Cloudflare `wcore-gsheet/railway-rpc-relay` (créé uniquement pour B3, slugs `b3-1`/`b3-2`). Le Worker déjà déployé reste à supprimer, sur GO distinct.

Conservé :
- tombstone `_wcoreRemovedChain_` (`B3`, `8333`, `0x208d`, `Ledger - B3`) : aucun scan, aucun rafraîchissement, aucune recréation ;
- formules existantes de l'onglet : `GET_WALLET_ASSETS_B3`, `CACHED_WALLET_ASSETS_B3`, `B3_REFRESH_STATUS`, `B3_STATS` renvoient `[CHAIN_REMOVED] B3 (8333)` sans aucune valeur numérique (ni solde, ni total), pour éviter à la fois `#NAME?` et un ancien montant présenté comme courant ;
- la factory GM dans `GM_HISTORICAL_FACTORIES.b3` (`0x14bfaa13…2f34`), l'explorateur `explorer.b3.fun`, l'icône et la définition de chaîne wallet : nécessaires pour identifier les contrats GM déjà déployés.
- le cache WalletCache B3 est **exclu de la purge d'urgence** de ScriptProperties (`04A_CACHE_CORE`) : n'étant plus rafraîchi, il serait sinon le premier candidat ;
- `DIAG_B3_CACHE_ASSETS(adresse)` reste disponible en lecture seule (aucun réseau, aucune écriture) pour consulter le cache conservé ; les autres diagnostics B3 (RPC, purge du cache) sont retirés.

**Effet sur le Recap tant que la ligne B3 n'est pas retirée** : l'onglet n'affiche plus de nombre. Un total en `SUM` comptera B3 pour 0 € sans le signaler ; une formule en `+` ou en `INDEX` peut afficher `#VALUE!` ou `#REF!`. Le retrait de la ligne B3 du Recap doit donc accompagner la publication GAS.

Onglet Google Sheets `Ledger - B3` : **non supprimé**. Archivage à exécuter sur GO distinct, dans l'ordre : copie complète (valeurs et formules) vers une archive privée et relecture ; retrait de la ligne B3 des totaux du Recap ; publication GAS ; aucune suppression d'onglet avant validation de l'archive.
