---
title: Onglet CEX - Kraken Stocks et renommage CEX - Kraken Crypto
date: 2026-08-27
project: WCORE
status: draft
---

# Onglet `CEX - Kraken Stocks` et renommage `CEX - Kraken Crypto`

## Objectif

Anticiper la détention d'actions tokenisées (xStocks) chez Kraken dans le portefeuille WCORE, en réutilisant le modèle déjà éprouvé de `CEX - Bitpanda Stocks`.

Aujourd'hui, le sync Kraken (`41_KRAKEN_SYNC.gs`) écrit uniquement les cryptos dans l'onglet `CEX - Kraken`. À terme, l'utilisateur pourra détenir des xStocks chez Kraken et souhaite :

1. Renommer `CEX - Kraken` en `CEX - Kraken Crypto` (cohérence avec `CEX - Bitpanda Crypto`).
2. Créer un onglet frère `CEX - Kraken Stocks`, miroir structurel de `CEX - Bitpanda Stocks`.
3. Pouvoir consolider ces positions dans `Portefeuille Action Details` → `Portefeuille Action`.

Au moment de l'implémentation, l'API publique Kraken pour les actions tokenisées n'est **pas confirmée/disponible**. Le stub de sync doit donc être **read-only et fail-safe** : il ne casse jamais le refresh, journalise un avertissement et attend qu'une vraie source de données soit branchée plus tard.

## Contexte vérifié

- `41_KRAKEN_SYNC.gs:13` définit `SHEET: "CEX - Kraken"` et lit uniquement `/0/private/Balance` (spot crypto).
- `35_BITPANDA_SYNC.gs:47` définit `STOCKS: "CEX - Bitpanda Stocks"` et sert de référence structurelle.
- Les alias canoniques existent déjà dans `wcore-web/apps/api/src/stocks/mappings.ts` (`BITPANDA_SECURITIES`, `getBitpandaAliases`, `mapTopMarketCapTicker`).
- `42_STOCK_PORTFOLIO.gs:616` liste les sources consolidées de `Portefeuille Action Details`.
- Triggers/watchdogs Kraken listés dans `16B_AUTO_HEAL.gs`.

## Architecture retenue

### 1. Renommage `CEX - Kraken` → `CEX - Kraken Crypto`

- Mettre à jour la constante `SHEET` dans `41_KRAKEN_SYNC.gs` (`CEX - Kraken` → `CEX - Kraken Crypto`).
- Références associées dans :
  - `16B_AUTO_HEAL.gs` (watchdogs, triggers, fonctions de comptage).
  - `44_CEX_BULK.gs` (routage bulk non-relay).
  - Toute autre référence littérale `"CEX - Kraken"` trouvée par recherche ciblée.
- Le rename onglet est géré par la migration de mise en production (comme pour Solana/Bitpanda), hors périmètre code GSheet.

### 2. Création `CEX - Kraken Stocks`

- Nouvelle constante `SHEET_STOCKS: "CEX - Kraken Stocks"` dans `41_KRAKEN_SYNC.gs`.
- Même structure de colonnes que `CEX - Bitpanda Stocks` (s'appuyer sur le layout/format existant du fichier 35 pour l'énumération des colonnes).
- Onglet vide au départ, créé par la procédure de setup/migration.

### 3. Alias canonicité Kraken Stocks

- Ajouter un mapping `KRAKEN_STOCKS_ALIASES` dans `wcore-web/apps/api/src/stocks/mappings.ts`.
- Réutiliser la logique `BITPANDA_SECURITIES` : un xStock Kraken (ex. `JPMx`) doit être normalisé vers le symbole canonique (`JPM-US`, `AAPL-US`, …) identique au pipeline Bitpanda.
- `getBitpandaAliases` / les alias existants sont réutilisés ; aucun nouvel alias hors `BITPANDA_SECURITIES` nécessaire si les sous-jacents sont identiques.
- Si un sous-jacent Kraken n'a pas d'équivalent Bitpanda, le laisser tel quel (pas de mapping forcé).

### 4. Stub de sync `UPDATE_KRAKEN_STOCKS_FIAT()`

- Fonction **read-only** et **fail-safe** dans `41_KRAKEN_SYNC.gs`.
- Comportement actuel (API non disponible) :
  - Journalise un avertissement `WARN: Kraken Stocks API unavailable - skip` (une fois, pour ne pas saturer les logs).
  - Retourne un statut explicite sans exception.
  - Ne touche à aucune cellule de `CEX - Kraken Stocks` tant que la source n'est pas branchée.
- La structure de la fonction est conçue pour accepter plus tard un vrai fetch (même signature que `UPDATE_BITPANDA_STOCKS_FIAT`).
- Trigger horaire `UPDATE_KRAKEN_STOCKS_FIAT` (1h) ajouté aux listes managed/required de `16B_AUTO_HEAL.gs` (symétrie avec Bitpanda).

### 5. Consolidation `Portefeuille Action Details`

- Ajouter `"CEX - Kraken Stocks"` à la liste des sources de `42_STOCK_PORTFOLIO.gs:616`.
- La consolidation s'appuie sur les alias canoniques (étape 3) pour aligner sur `Portefeuille Action`.

### 6. Tests

- **API (TS)** : `kraken-stocks-alias.test.ts` — vérifie la normalisation `KRAKEN_STOCKS_ALIASES` (JPMx → JPM-US, AAPLx → AAPL-US, sous-jacent inconnu → inchangé).
- **GSheet (JS)** : `kraken-stocks.test.js` — vérifie :
  - le renommage de la constante `SHEET` ;
  - la présence de `SHEET_STOCKS` ;
  - le stub fail-safe (aucun throw, avertissement journalisé) ;
  - le trigger `UPDATE_KRAKEN_STOCKS_FIAT` dans les listes managed/required.
- **validate:static** inchangé.

## Erreurs et cas limites

- **API indisponible** : stub safe, pas de dégradation du refresh CEX existant.
- **Sous-jacent inconnu** : pas de mapping forcé ; le symbole brut est conservé.
- **Rename onglet** : le code ne dépend d'aucune valeur cellulaire de l'onglet pour le refresh (les projections reposent sur les constantes).
- **Double comptage** : `CEX - Kraken Crypto` (crypto) et `CEX - Kraken Stocks` (actions) sont exclusifs ; le portfolio Actions ne lit que Stocks, le portfolio Crypto que Crypto.

## Hors périmètre (V1)

- Aucune clé/API Kraken Securities demandée (non publique).
- Aucune collecte de prix spécifique à Kraken Stocks (le pricing existant WCORE est réutilisé via les alias canoniques).
- Aucune écriture live sur `CEX - Kraken Stocks` tant que la source n'est pas disponible.
- Ne pas renommer ni modifier `CEX - Bitpanda *`.

## Critères d'acceptation

1. `CEX - Kraken` renommé en `CEX - Kraken Crypto` sans casser les références.
2. Onglet `CEX - Kraken Stocks` créé, même structure que `CEX - Bitpanda Stocks`.
3. Le stub `UPDATE_KRAKEN_STOCKS_FIAT` ne lève jamais d'exception et journalise un warning unique.
4. Trigger `UPDATE_KRAKEN_STOCKS_FIAT` présent dans les listes managed/required.
5. Alias canonicité Kraken Stocks fonctionnels dans l'API.
6. `CEX - Kraken Stocks` listé dans les sources de `Portefeuille Action Details`.
7. Tests ciblés verts + suite GSheet + validate:static OK.
8. Aucune régression sur `CEX - Bitpanda *` ni sur le sync crypto Kraken.
