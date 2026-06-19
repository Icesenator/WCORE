# Top Market Cap Google Finance

## Objectif

L'onglet `Google Finance` suit le Top 300 mondial par capitalisation via `companiesmarketcap.com`, puis alimente `Action Rebalancing` pour le rebalancing actions Bitpanda.

## Script

Source Apps Script : `src/34_TOP_MARKETCAP.gs`.

Fonctions principales :

- `UPDATE_TOP_MARKETCAP()` : met a jour `Google Finance` puis reconstruit `Action Rebalancing`.
- `INSTALL_TOP_MARKETCAP_TRIGGER()` : installe le trigger hebdomadaire du lundi 06h.
- `DIAG_TOP_MARKETCAP()` : affiche le mapping tickers sans ecrire dans la spreadsheet.

## Google Finance

Structure actuelle :

- `A` : ticker Google Finance ou symbole CSV si marche non supporte.
- `B` : prix live `GOOGLEFINANCE` quand disponible.
- `C` : devise live.
- `D` : `Price EUR`, toujours rempli. Si le prix live manque, fallback via `(MarketCap USD / Supply) / EUR-USD`.
- `G` : `Market Cap EUR`, fallback via `MarketCap USD / EUR-USD`.
- `H` : rang brut Top 300.
- `I` : supply calculee depuis le CSV.
- `J` : market cap USD CSV.
- `K` : pays.
- `L` : nom entreprise.
- `M` : checkbox `Ignore`.
- `N` : timestamp de mise a jour.

Table FX : `A1:C10`, avec `EUR-CNY` en ligne 10 pour les titres chinois CNY.

## Ignore

Cocher `Google Finance!M` garde la ligne visible dans `Google Finance`, mais l'exclut de `Action Rebalancing`.

Le script preserve les valeurs `Ignore` par ticker ou par nom lors des mises a jour suivantes.

Cas actuel : `Saudi Aramco` (`2222.SR`) est ignore par defaut car non accessible via Bitpanda / brokers retail classiques.

## Action Rebalancing

`Action Rebalancing` est reconstruit a partir des lignes non ignorees.

Important : la colonne `B` est un rang actif continu apres exclusion, pas le rang brut `Google Finance`. Cela evite les trous de rang (ex : Aramco ignore au rang brut 9) qui casseraient les formules de bornes comme `XLOOKUP(H1;B3:B;I3:I)`.

## Compatibilite Bitpanda

La valorisation spot actions (`Action Rebalancing!F`) lit uniquement :

- `CEX - Bitpanda Stocks`

Ne pas chercher dans Crypto/Commodity/Fiat pour les actions : certains tickers entrent en collision avec des actifs non-actions (`CAT`, `STX`, etc.).

L'ancien onglet `Bitpanda Spot Action` a ete supprime. Les lignes `action` exposees par l'API Bitpanda sont fusionnees dans `CEX - Bitpanda Stocks` par `UPDATE_BITPANDA_SPOT()` / `UPDATE_BITPANDA_STOCKS_FIAT()`.

Refresh manuel lie a cet onglet : `Action Rebalancing!Z1` met a jour seulement `CEX - Bitpanda Stocks` et `CEX - Bitpanda Fiat`.

Aliases maintenus pour les anciens symboles Bitpanda :

- `GOOGL` -> `GOOG`
- `FB` -> `META`
- `TSFA` -> `TSM`
- `BROA` -> `AVGO`
- `BRKB` -> `NYSE:BRK.B`
- `SSU` / `SMSN` -> `KRX:005930`
- `HYXS` -> `KRX:000660`
- `RDSA` -> `SHEL`
- `MC` -> `EPA:MC`
- `OR` -> `EPA:OR`
- `RMS` -> `EPA:RMS`
- `TM` -> `TYO:7203`

## Ratios Speciaux

Ces instruments Bitpanda ne correspondent pas toujours a une action ordinaire 1:1.

- Toyota : CompaniesMarketCap expose `TM` comme ADR NYSE. Le script mappe vers `TYO:7203` et multiplie la supply par 10 pour conserver la market cap. Bitpanda `TM` est mappe vers `TYO:7203`.
- Samsung : Bitpanda `SSU`/`SMSN` represente environ 25 actions ordinaires Samsung. Le spot multiplie donc la quantite par 25 pour `KRX:005930`.

## Verification Rapide

Couverture Bitpanda attendue apres update : toutes les positions `CEX - Bitpanda Stocks` avec solde > 0, hors `BCPEUR`, doivent etre presentes dans `Action Rebalancing` via ticker direct ou alias.

Exemples deja valides :

- Toyota : `0.39280479 * ~15.12 EUR = ~5.94 EUR`.
- Samsung : `0.01244396 * 25 * ~183.64 EUR = ~57.13 EUR`.
