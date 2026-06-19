# Bitpanda Sync Replacement for SyncWith

## Objectif

Remplacer progressivement les imports SyncWith des onglets Bitpanda par Apps Script + API Bitpanda officielle.

Script : `src/35_BITPANDA_SYNC.gs`.

## API Key

Stocker la cle API dans `ScriptProperties`, jamais dans une cellule :

```javascript
SET_BITPANDA_API_KEY("...")
```

Pour supprimer la cle :

```javascript
CLEAR_BITPANDA_API_KEYS()
```

## Diagnostic

Avant de remplacer SyncWith, lancer :

```javascript
DIAG_BITPANDA_API()
```

Le diagnostic retourne les counts et samples pour :

- crypto
- commodity
- fiat
- stocks
- unknown

Important : l'API Bitpanda `/asset-wallets` peut exposer les stocks/actions dans des sous-buckets variables selon le compte. Le bucket `action` est fusionne dans `CEX - Bitpanda Stocks`; l'ancien onglet `Bitpanda Spot Action` n'est plus utilise.

## Mise a jour

Fonction principale :

```javascript
UPDATE_BITPANDA_SPOT()
```

Elle ecrit les onglets existants :

- `CEX - Bitpanda Crypto`
- `CEX - Bitpanda Commodity`
- `CEX - Bitpanda Fiat`
- `CEX - Bitpanda Stocks`

L'utilisateur a un seul compte Bitpanda. Il n'y a pas de `BITPANDA_ACTION_API_KEY` et plus d'onglet `Bitpanda Spot Action`; les lignes `action` exposees par l'API sont fusionnees dans `CEX - Bitpanda Stocks`.

Fonctions de refresh ciblees :

```javascript
UPDATE_BITPANDA_STOCKS_FIAT()
UPDATE_BITPANDA_CRYPTO_FIAT()
```

- `UPDATE_BITPANDA_STOCKS_FIAT()` ecrit seulement `CEX - Bitpanda Stocks` et `CEX - Bitpanda Fiat`.
- `UPDATE_BITPANDA_CRYPTO_FIAT()` ecrit seulement `CEX - Bitpanda Crypto` et `CEX - Bitpanda Fiat`.
- Ces fonctions fetchent l'API Bitpanda une fois, mais evitent de reecrire les onglets non concernes.

## Checkboxes manuelles

Les `onEdit` simples ne peuvent pas faire de `UrlFetchApp`. Les checkboxes posent donc un flag `ScriptProperties`, puis `BITPANDA_REFRESH_WATCHDOG()` traite le flag via trigger installable.

- `Action Rebalancing!Z1` -> `UPDATE_BITPANDA_STOCKS_FIAT()` : refresh `CEX - Bitpanda Stocks` + `CEX - Bitpanda Fiat` uniquement.
- `Portefeuille Crypto!AC2` -> `UPDATE_BITPANDA_CRYPTO_FIAT()` + `UPDATE_BINANCE_SPOT()` : refresh `CEX - Bitpanda Crypto` + `CEX - Bitpanda Fiat` + `CEX - Binance`.
- Les checkboxes des onglets Bitpanda en `A1` gardent le comportement global `UPDATE_BITPANDA_SPOT()`.

`CEX - Bitpanda Commodity` n'est touche que par le refresh global `UPDATE_BITPANDA_SPOT()`.

## Trigger

Installer un trigger horaire :

```javascript
INSTALL_BITPANDA_SYNC_TRIGGER()
```

## Statut

Lire le dernier statut :

```javascript
BITPANDA_SYNC_STATUS()
```
