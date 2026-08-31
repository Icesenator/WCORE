# Consolidation Bitpanda Fiat/Stocks et suppression Commodity — Design

**Date :** 2026-08-28
**Statut :** validé

## Objectif

Supprimer les feuilles `CEX - Bitpanda Fiat` et `CEX - Bitpanda Commodity` sans perdre les soldes utiles :

- tous les fiats Bitpanda (`EUR`, `USD`, `CHF`, etc.) sont écrits dans `CEX - Bitpanda Stocks` ;
- `EURC` et `EURCV` sont écrits dans `CEX - Bitpanda Crypto`, normalisés en `EURC` ;
- tous les commodities Bitpanda sont exclus du pipeline et des portefeuilles ;
- les dépendances, formules, refresh, watchdogs, diagnostics et tests ne référencent plus les deux feuilles supprimées.

## Architecture

Le routage est corrigé à la source dans `35_BITPANDA_SYNC.gs`. Les buckets API internes peuvent rester distincts pendant la lecture afin de conserver le diagnostic, mais la phase d’écriture compose seulement deux sorties : Crypto et Stocks. La sortie Stocks fusionne `stocks + action + fiat`; la sortie Crypto contient les cryptos, avec `EURCV → EURC`; les commodities ne sont jamais écrits.

`Portefeuille Action` calcule son cash fiat depuis `CEX - Bitpanda Stocks` et `CEX - Kraken Stocks`. `Portefeuille Action Details` crée la ligne cash EUR depuis la ligne `EUR` de `CEX - Bitpanda Stocks`, tout en continuant à retrancher l’exposition EURC déjà comptée dans `Portefeuille Crypto Details`. Les anciens onglets sont supprimés seulement après déploiement et vérification des nouvelles données.

## Compatibilité

Les noms publics historiques `UPDATE_BITPANDA_STOCKS_FIAT` et les kinds de queue existants sont conservés pour éviter une migration risquée des triggers et de l’orchestration. Leur comportement devient « mise à jour Bitpanda Stocks consolidée ». `UPDATE_BITPANDA_CRYPTO_FIAT` reste un alias compatible qui actualise Crypto ; il ne crée plus de feuille Fiat.

## Migration live

1. Déployer le code Apps Script.
2. Lancer la synchronisation Bitpanda Stocks consolidée et Crypto.
3. Rafraîchir `Portefeuille Action` puis `Portefeuille Action Details`.
4. Vérifier que le solde EUR est dans Stocks, EURC dans Crypto et que les Vérif sont `V`.
5. Supprimer `CEX - Bitpanda Fiat` et `CEX - Bitpanda Commodity`.
6. Relancer auto-heal et confirmer les triggers.

## Critères d’acceptation

- Aucun code actif ne dépend des deux feuilles supprimées.
- `CEX - Bitpanda Stocks` contient tous les fiats et actions, dont `EUR`.
- `CEX - Bitpanda Crypto` contient `EURC`/`EURCV` sous le symbole canonique `EURC`.
- Aucun commodity Bitpanda n’apparaît dans une feuille CEX ou un portefeuille.
- La ligne cash de `Portefeuille Action Details` pointe vers `CEX - Bitpanda Stocks`.
- Les tests et `validate:static` passent avant déploiement.
