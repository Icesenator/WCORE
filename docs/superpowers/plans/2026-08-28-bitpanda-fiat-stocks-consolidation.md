# Bitpanda Fiat/Stocks Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Router tous les fiats Bitpanda vers Stocks, EURC/EURCV vers Crypto, exclure Commodity et supprimer les deux feuilles obsolètes.

**Architecture:** Modifier le routage et la composition des sorties dans `35_BITPANDA_SYNC.gs`, puis retirer les références aux feuilles Fiat/Commodity des portfolios et de l’auto-heal. Conserver les noms de fonctions/triggers historiques pour compatibilité, mais ne produire que les feuilles Crypto et Stocks.

**Tech Stack:** Google Apps Script, Node.js tests (`node --test`), Google Sheets API, clasp.

---

### Task 1: Tests de routage Bitpanda

**Files:**
- Modify: `wcore-gsheet/tests/bitpanda-eurcv-merge.test.js`
- Modify: `wcore-gsheet/tests/cex-refresh-load-guard.test.js`
- Modify: `wcore-gsheet/tests/cex-info-total.test.js`

- [x] Ajouter des assertions vérifiant que EURCV devient EURC dans Crypto, que les fiats sont fusionnés avec Stocks et que Commodity n’est jamais écrit.
- [x] Exécuter les tests ciblés et confirmer l’échec avant implémentation.
- [x] Conserver les noms `UPDATE_BITPANDA_STOCKS_FIAT` et les kinds de queue historiques dans les assertions de compatibilité.

### Task 2: Routage et sorties Bitpanda

**Files:**
- Modify: `wcore-gsheet/src/35_BITPANDA_SYNC.gs:35-55, 750-830, 1160-1230, 1825-1845`

- [x] Supprimer les feuilles Fiat/Commodity de la configuration d’écriture active.
- [x] Fusionner `buckets.fiat` avec `stocks + action` avant l’écriture Stocks.
- [x] Écrire Crypto avec `EURCV → EURC` et ne jamais écrire Commodity.
- [x] Adapter les diagnostics et la réparation de structure à Crypto/Stocks uniquement.
- [x] Exécuter les tests ciblés et confirmer leur réussite.

### Task 3: Dépendances Portefeuille Action et Details

**Files:**
- Modify: `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs:629-644`
- Modify: `wcore-gsheet/src/44_XSTOCKS_SOLANA.gs:249-307, 415-430, 552-568`

- [x] Modifier la formule cash pour lire Bitpanda Stocks et Kraken Stocks uniquement.
- [x] Remplacer la source cash Details par `CEX - Bitpanda Stocks`.
- [x] Lire le solde `EUR` dans Stocks et conserver le retrait de l’EURC de Crypto Details.
- [x] Ajouter/adapter les tests statiques correspondants.

### Task 4: Auto-heal, diagnostics et validation statique

**Files:**
- Modify: `wcore-gsheet/src/16B_AUTO_HEAL.gs:200-220`
- Modify: `wcore-gsheet/tools/validate-static.js:260-275`
- Modify: tests trouvés par recherche ciblée qui référencent les feuilles supprimées.

- [x] Retirer Fiat et Commodity des feuilles CEX gérées.
- [x] Conserver les triggers historiques compatibles.
- [x] Exécuter `npm run validate:static` puis les tests GSheet complets.

### Task 5: Déploiement et migration live

**Files:**
- Deploy: `wcore-gsheet/src/*.gs`
- Delete sheets: `CEX - Bitpanda Fiat`, `CEX - Bitpanda Commodity`

- [x] Déployer via `safe-push.ps1`.
- [x] Exécuter `UPDATE_BITPANDA_STOCKS_FIAT`, `UPDATE_BITPANDA_SPOT`, `UPDATE_STOCK_PORTFOLIO`, `REFRESH_STOCK_PORTFOLIO_DETAILS`.
- [x] Vérifier les lignes EUR/EURC et l’absence de commodities.
- [x] Supprimer les deux feuilles via Sheets API.
- [x] Exécuter `WCORE_AUTO_HEAL_FORCE` et vérifier `WCORE_AUTO_HEAL_STATUS`.
- [x] Journaliser la migration et ajouter une mémoire Mem0 sourcée.
