# Intégration xStocks Solana dans WCORE GSheet

> **Design initial (historique)** : certains choix structurants décrits ici (registre API `xstocks-registry.ts`, cache `xm`, layout `Ledger - Solana Action`, consolidation exclusivement via `Portefeuille Action Details`) ont évolué en production et diffèrent du code fusionné sur `master`. Consulter `wcore-gsheet/src/44_XSTOCKS_SOLANA.gs` et `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs` pour l'état réel avant toute reprise de ce design.

## Objectif

Intégrer les xStocks achetés directement sur DEX via Solana et Jupiter dans le portefeuille actions WCORE, avec une architecture cohérente avec le pipeline Crypto existant et adaptée aux petits montants.

La première version couvre la détection, la classification et la valorisation des positions. Elle ne calcule ni l’historique des swaps Jupiter, ni le prix de revient unitaire, ni la performance réalisée ou latente.

## Architecture retenue

Le wallet Ledger Solana est lu une seule fois. Le snapshot obtenu est partagé entre deux vues exclusives :

1. `Ledger - Solana Crypto`
2. `Ledger - Solana Action`

L’onglet actuel `Ledger - Solana` est renommé `Ledger - Solana Crypto`. Un nouvel onglet `Ledger - Solana Action` est créé selon les conventions visuelles et fonctionnelles des Ledgers Crypto existants.

Cette architecture évite les doubles appels RPC, les divergences entre scans et le double comptage des actifs.

## Règles de classification

Chaque actif du snapshot Solana est routé vers une seule vue.

### Vue Action

- xStocks dont le mint appartient au registre officiel xStocks ;
- EURC, traité comme trésorerie réservée aux achats d’actions.

### Vue Crypto

- SOL ;
- USDC ;
- USDT ;
- tous les autres tokens Solana qui ne sont pas reconnus comme xStocks officiels.

Un actif ne doit jamais apparaître simultanément dans les deux vues.

## Registre officiel xStocks

La classification repose sur les métadonnées publiques xStocks, notamment le symbole, le nom de l’actif sous-jacent, le mint Solana et le multiplier courant.

Le mint, et non le symbole seul, constitue l’identifiant de confiance. Un token imitant un symbole xStock sans mint officiel reste classé Crypto et ne doit pas alimenter le portefeuille actions.

Le registre doit pouvoir être rafraîchi sans modifier manuellement chaque feuille.

## Gestion du multiplier Token-2022

Sur Solana, les xStocks utilisent Token-2022 avec un multiplier qui reflète les opérations sur titres telles que dividendes, splits et reverse splits.

La quantité affichée et valorisée est calculée ainsi :

`quantité ajustée = quantité brute onchain × multiplier`

Pour chaque xStock, `Ledger - Solana Action` affiche explicitement :

- la quantité brute onchain ;
- le multiplier officiel ;
- la quantité ajustée utilisée par WCORE.

Pour EURC, le multiplier est fixé à `1` et les quantités brute et ajustée sont identiques.

Si le multiplier d’un xStock est absent ou invalide, la ligne reste visible mais sa valorisation ne doit pas être présentée comme fiable.

## Structure de `Ledger - Solana Action`

La nouvelle feuille reprend la structure, le style, les statuts, les contrôles, les dates de fraîcheur et le comportement de rafraîchissement d’un Ledger Crypto classique.

Elle ajoute les champs nécessaires aux xStocks :

- identité xStock et action sous-jacente ;
- mint Solana ;
- quantité brute ;
- multiplier ;
- quantité ajustée ;
- cours action WCORE ;
- valeur en EUR.

La colonne `Vérif` réutilise strictement la logique existante de `Ledger - Solana Crypto`. Les données propres aux xStocks n’introduisent pas une seconde variante fonctionnelle de cette colonne.

## Pipeline Portefeuille Action

Le flux cible reproduit le schéma du portefeuille Crypto :

`Ledger - Solana Action` et autres sources actions → `Portefeuille Action Details` → `Portefeuille Action`

`Portefeuille Action Details` devient la couche de consolidation détaillée de toutes les sources actions, notamment Bitpanda et xStocks Solana. `Portefeuille Action` dépend uniquement de cette couche de détails pour sa synthèse.

Les xStocks sont normalisés vers leur action ou ETF sous-jacent. Par exemple, `AAPLx` est exposé comme Apple dans la consolidation, tout en conservant la provenance xStocks/Solana dans les détails.

## Prix et valorisation

La V1 utilise le moteur de prix actions WCORE comme source de valorisation. Elle ne valorise pas les positions à partir d’une cotation Jupiter ni du prix public xStocks.

La valeur est calculée ainsi :

`valeur EUR = quantité ajustée × cours action WCORE converti en EUR`

Cette règle harmonise les positions Bitpanda et xStocks autour d’une même référence de cours dans le portefeuille consolidé.

## Actualisation et erreurs

Le rafraîchissement suit les conventions actuelles WCORE :

- un seul scan Solana alimente les deux vues ;
- la dernière donnée valide reste identifiable en cas d’échec temporaire ;
- les erreurs de scan, de registre, de multiplier ou de prix sont exposées sans transformer une donnée périmée en succès ;
- une position inconnue ou incomplète reste traçable sans être silencieusement supprimée ;
- aucune position ne doit être comptée dans Action et Crypto à la fois.

## Tests et critères d’acceptation

L’intégration est validée lorsque :

1. `Ledger - Solana` est renommé sans casser les références existantes ;
2. un scan unique alimente `Ledger - Solana Crypto` et `Ledger - Solana Action` ;
3. un mint xStock officiel apparaît uniquement dans Action ;
4. EURC apparaît uniquement dans Action ;
5. USDC et USDT apparaissent uniquement dans Crypto ;
6. un faux xStock au symbole similaire n’est pas classé comme action ;
7. quantité brute, multiplier et quantité ajustée sont visibles et cohérents ;
8. EURC utilise un multiplier égal à `1` ;
9. la colonne `Vérif` conserve le comportement du Ledger Crypto classique ;
10. `Portefeuille Action Details` reçoit les positions xStocks normalisées ;
11. `Portefeuille Action` est alimenté par `Portefeuille Action Details` ;
12. les références, formules, menus, refresh, watchdog et contrôles existants restent fonctionnels ;
13. aucun actif n’est doublement compté entre les portefeuilles Crypto et Action.

## Hors périmètre V1

- exécution des swaps Jupiter depuis WCORE ;
- import et analyse de l’historique Jupiter ;
- calcul du PRU ;
- calcul des frais de swap ;
- performance réalisée ou latente fondée sur le coût d’acquisition ;
- support initial d’Ink ou d’autres chaînes xStocks ;
- valorisation fondée sur la liquidité DEX ou le prix d’exécution immédiat.
