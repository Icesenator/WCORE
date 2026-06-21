# Connecteur Binance (Spot + Earn) — Design

> **Historical/completed design.** Binance sync is documented in live CEX docs; keep this file for implementation history only.

Date: 2026-06-13
Statut: validé (en attente revue spec)

## Objectif

Reproduire pour Binance ce que `35_BITPANDA_SYNC.gs` fait pour Bitpanda :
récupérer les soldes crypto via l'API officielle et les écrire dans un onglet
Google Sheets, avec refresh manuel par checkbox et triggers automatiques.

Périmètre: **Spot + Simple Earn** (flexible + locked). Pas de Funding, Margin,
Futures, ni actions.

## Contraintes connues

- **Auth signée**: chaque requête nécessite `timestamp` + `signature` =
  HMAC-SHA256(queryString, apiSecret). Header `X-MBX-APIKEY` pour la clé.
- **IP datacenter**: Binance bloque frequemment les IP Google/Apps Script
  (HTTP 451 / -2015 / "Service unavailable from a restricted location").
  Le connecteur doit detecter et reporter clairement ce cas dans le statut,
  sans ecraser les donnees existantes. Si bloque, un proxy sera necessaire
  (hors scope de cette spec; a traiter a l'execution si le cas se presente).
- **Cle en lecture seule**: l'API key Binance doit avoir uniquement la
  permission "Enable Reading" (pas de trading, pas de withdraw).

## Authentification

- ScriptProperties:
  - `BINANCE_API_KEY`
  - `BINANCE_API_SECRET`
- Setup: `SET_BINANCE_API_KEYS(apiKey, apiSecret)` (injecte via bootstrap
  temporaire distant, comme pour Bitpanda; le secret ne transite jamais par
  une cellule ni le depot).
- Signature: `Utilities.computeHmacSha256Signature(queryString, secret)` →
  hex. `recvWindow=60000` pour tolerer le decalage horloge.

## Endpoints (lecture seule)

| Source | Endpoint | Champs |
|--------|----------|--------|
| spot | `GET /api/v3/account` | `balances[].free` + `balances[].locked` |
| earn-flexible | `GET /sapi/v1/simple-earn/flexible/position` | `rows[].asset`, `rows[].totalAmount` |
| earn-locked | `GET /sapi/v1/simple-earn/locked/position` | `rows[].asset`, `rows[].amount` |

Base URL: `https://api.binance.com`.

Notes:
- Spot: `balance = free + locked` par asset; on exclut les soldes nuls.
- Earn flexible/locked: peuvent etre pagines (`current`/`size`). On boucle si
  necessaire (taille de page 100, garde-fou max pages).

## Structure de sortie — onglet `Binance Spot Crypto`

Onglet **a creer** (n'existe pas). Une ligne par (symbole + source).

```
A1 = checkbox (refresh manuel), B1 = "Refresh Binance API. Last updated ..."
ligne 2 (en-tetes) = cryptocoin_symbol | balance | source | updated_at
lignes 3+ :
  BTC | 0,5        | spot          | 2026-06-13 16:00
  BTC | 0,3        | earn-flexible | 2026-06-13 16:00
  ETH | 1,0        | earn-locked   | 2026-06-13 16:00
```

- `source` ∈ `spot`, `earn-flexible`, `earn-locked`.
- Balances = vrais nombres, format cellule `0.########` (affichage virgule en
  locale fr_FR), comme Bitpanda.
- Pas de cumul entre sources (une ligne distincte par source). Cumul seulement
  si le meme asset apparait deux fois dans la MEME source (defensif).
- Soldes nuls exclus.

## Fonctions exposees

- `SET_BINANCE_API_KEYS(apiKey, apiSecret)` / `CLEAR_BINANCE_API_KEYS()`
- `DIAG_BINANCE_API()` — diagnostic sans ecriture: compte par source +
  echantillons; detecte/affiche le blocage IP eventuel.
- `UPDATE_BINANCE_SPOT()` — recupere et ecrit l'onglet (lock + statut).
- `BINANCE_SYNC_STATUS()` — lit le dernier statut JSON.
- `BINANCE_TRIGGER_STATUS()` — compte les triggers installes.
- `INSTALL_BINANCE_SYNC_TRIGGER()` — installe trigger horaire
  (`UPDATE_BINANCE_SPOT`, 1h) + watchdog (`BINANCE_REFRESH_WATCHDOG`, 1min).
- `BINANCE_REFRESH_WATCHDOG()` — trigger installable: traite le flag de coche.
- `SETUP_BINANCE_SHEET()` — cree l'onglet `Binance Spot Crypto` s'il manque,
  pose la checkbox A1 et les en-tetes.

## Refresh manuel (checkbox)

Meme architecture que Bitpanda (un `onEdit` SIMPLE ne peut pas faire de
UrlFetch):

1. Coche `A1` sur `Binance Spot Crypto` (onEdit simple) → pose flag
   ScriptProperty `BINANCE_REFRESH_REQUESTED` + decoche la case.
2. `BINANCE_REFRESH_WATCHDOG` (trigger installable, autorise HTTP, every 1min)
   lit le flag, le supprime, lance `UPDATE_BINANCE_SPOT`.

Branchement dans `WCORE_ON_EDIT` (16_REFRESH.gs): appel `BINANCE_ON_EDIT(e)`
en tete, comme `BITPANDA_ON_EDIT(e)`.

## Robustesse

- Lock `LockService` autour de `UPDATE_BINANCE_SPOT` (anti-concurrence).
- En cas d'erreur API (IP, signature, timestamp): NE PAS ecraser l'onglet;
  ecrire un statut `ok:false` avec le message d'erreur tronque.
- `_binSetStatus_` ne fait pas echouer la sync si ScriptProperties est plein.
- Soldes ecrits en matrice rectangulaire (4 colonnes), comme Bitpanda v4.15.64.

## Hors scope

- Funding / Margin / Futures / actions.
- Proxy de contournement IP (a decider seulement si Binance bloque a
  l'execution).
- Integration dans Action Rebalancing (Binance = crypto, pas actions).
