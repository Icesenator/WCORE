# Contexte de revue — WCORE Community Manager (X, @WCORExyz)

> Maintenu par l'agent OpenCode à chaque fin de tâche. Le superviseur l'injecte en tête du packet envoyé à GPT (revue de cycle). Synthétique, factuel, ≤ 60 lignes.

## État actuel

- Mode : CM autonome continu sur X (observer → analyser → agir si seuil de valeur → vérifier live → journaliser → attente réelle). Cadence adaptative (revue 02/09) : contrôle à ~4h après une reply récente ou si un thread est chaud ; ~8h nocturnes seulement si aucun entrant et aucun thread chaud.
- État au 2026-09-02 15:45 : session X authentifiée via Chrome CDP 9222 (profil `C:\Users\strau\chrome-debug-profile`). 5 replies finales publiées et vérifiées (3 le 01/09, 2 le 02/09) ; une suppression corrective puis republication a été nécessaire sur ilmeaalim après mojibake (aucune duplication finale constatée). Followers 38 (plateau). Aucun entrant qualifié.
- La 5ᵉ reply (MEXC/Reno_Web3, 15:40) a été publiée sous le seuil renforcé après justification : famille identité/agrégation indépendante des 4 précédentes, traction réelle (115 likes), conséquence opérationnelle directe pour WCORE. Aucune autre 5ᵉ reply ne sera cherchée aujourd'hui.
- Le 01/09-02/09 a produit 4 publications (3 le 01/09, 1 à 04:00 le 02/09) après 2 jours de 0 action quasi-total : la veille ciblée par famille de risque (display integrity, exécution, droits temporels, encumbrance) est plus productive que la discovery générique. La 4ᵉ (04:00) reste dans la limite : 4ᵉ angle distinct, opportunité indépendante, pas un quota.

## Terminé depuis la dernière revue

- **Fix cap TCEHY (Portefeuille Action)** : companiesmarketcap.com double la cap Tencent (implied supply ~18,1 Md actions vs ~9,17 Md réelles filings T1-2026 ; cap réelle ~506-515 Md$ vérifiée stockanalysis + MacroTrends + Business Insider ; le prix ADR 1:1 est correct). Yahoo partage l'erreur (18,115 B), donc pas de contre-source distante. **Le `capDivisor: 2` en dur posé le matin même a été remplacé** (exigence utilisateur : aucune correction statique qui resterait fausse si CMC corrige) par un mécanisme auto-désengageant : registre local `apps/api/src/stocks/verified-shares.ts` (TCEHY = 9 173 000 000 shares, daté, sourcé) + porte à déviation ±20% entre shares implicites CSV (cap/price) et registre dans `buildSnapshot` → cap recalculée shares×prix si hors bande, `capCorrected`/`stats.capCorrections` + warn log ; convergence → CSV repris tel quel. Ratio cap/price invariant par split. Re-rang conditionnel `rerankCorrectedCaps` (Tencent 16→~22, lignes saines inchangées, renumérotation 1..N). Audit top 300 du CSV : TCEHY seule ligne double-comptée (BABA ×1,04, PDD ×1,02, banques CN/TSM ~×1,0). Tests : 75/75 stocks verts (3 intégration CSV + 5 registre) + typecheck API/web/core OK ; 8 échecs auth/wallet de la suite = Postgres test 5434 non lancé (préexistant, hors périmètre). Journal : `journal/2026-09-02.md`, mémoire Mem0 sourcée. **Statut : fix local testé, en attente décision humaine — déploiement Railway API uniquement (aucun .gs), le repo contient d'autres changements non commités d'autres sessions.**
- Corrections de la revue du 02/09 appliquées avant toute action : contradiction « aucune suppression nécessaire » corrigée dans ce fichier ; compte Mem0 vérifié par retrieval avec IDs (4 à ce stade, 5 au total après l'ajout $TWO `bba032a4`) ; cadence adaptative adoptée ; standalone droits temporels gelé jusqu'à seconde corroboration. Seuil renforcé après revue : plus de cinquième reply cherchée activement, 0 action est le résultat attendu.
- Reply `2095087836722540719` à @Reno_Web3 (infographie MEXC : RealStocks vs Tokenized Stocks vs Futures, 115 likes/133 réponses) : première publication famille identité/agrégation — même ticker, trois objets économiques (part qui règle, token backed 24/7, future avec funding/expiry) ; un portfolio qui clé sur le symbole avant la classe d'instrument fusionne trois risques en une ligne et lit les passages inter-structures comme self-transfers. Vérifiée live via `/with_replies` (page parent lazy-load).
- Reply `2094974618201182351` à @AltcoinSensei (cas $TWO/Twofold : « chaque dollar des pools est en même temps prêté », vault $413M, idle $0.00) : première publication famille 2 (encumbrance) — inventaire vérifié, simultanéité non testée (retrait + gros fill sur le même dollar dans le même bloc, aucune priorité documentée entre les deux livres) ; un portfolio valorisant la LP sur la nav du vault hérite du silence. Vérifiée live, 1 copie.
- Reply `2094669397050663308` à @ilmeaalim (tokenized stocks HIMS/WYFI sur Robinhood Chain) : 3 nombres par tokenized equity (last printed, underlying reference, gap) ; au-delà d'une bande saine, la valeur n'est pas un prix, c'est un pool. 37 vues.
- Reply `2094821814673269119` à @0xmani (unrealized PnL non-cashable) : mark circulaire sur rails AMM (le mark est imprimé par les achats de la position elle-même), sortie par tranches contre la profondeur réelle, ratio PnL/depth comme signal du piège. 4 vues, parent en croissance (936 vues, 41 likes).
- Reply `2094883544296198215` à @AndrewfillionX (Sceptre/Flare, fenêtre de claim 48h manquée = 14 jours relancés, balance inchangée) : première publication sur la famille 3 (droits offchain temporels) — un droit avec no balance ; la fenêtre est une position avec expiry qui doit alarmer. 88 vues.
- Incident corrigé : mojibake `â€"` sur la première publication ilmeaalim (`Get-Content -Raw` PS 5.1) → suppression ciblée + republication via `[System.IO.File]::ReadAllText`. Règle mémorisée (Mem0) : lecture UTF-8 explicite obligatoire pour tout texte de publication.
- 6 mémoires Mem0 CM sourcées ajoutées, une par cas, compte vérifié par retrieval Mem0 (IDs) : cas ilmeaalim (`6bc3fe09`), gotcha encoding (`c600102f`), cas MANI (`28780d9e`), cas Sceptre (`23df2bf1`), cas $TWO (`bba032a4`), cas MEXC/agrégation (`5f5c399e`). Journaux : `journal/2026-09-01.md` limité aux vagues du 01/09 + checkpoint post-redémarrage 03:42 ; les vagues 04:00, 07:25, 11:29 et 15:35 du 02/09 sont dans `journal/2026-09-02.md` ; sections concurrentes d'autres sessions préservées via prevHash. La mémoire produit TCEHY (`31779338`) n'entre pas dans ce compteur CM.

## En cours / bloqué

- Pause nocturne 8h lancée à 22:30 abortée par un redémarrage OpenCode ; checkpoint post-reboot 03:42 (0 action), puis vague 04:00 avec reply $TWO, pause adaptative re-armée après revue, à nouveau coupée par l'utilisateur ; contrôle 07:25 effectué (0 action). Les vagues du 02/09 sont rattachées à leur date réelle dans `journal/2026-09-02.md`.
- Suivi en cours : $TWO parent 3 056 vues/46 likes/9 réponses (notre reply 16 vues, aucune réponse qualifiée d'auteur), MANI parent 1 067/44, ilmeaalim parent 1 447, Sceptre parent 752. Reply MEXC fraîche (15:40), parent à 1 382 vues/115 likes.
- Blocage non-CM observé (autre session) : pushes clasp concurrents ont rewinds des fixes (SKHY, scams World Chain) — verrou `safe-push.ps1` v3.2 posé mais garde git-ancêtre encore manquante ; rien à faire côté CM.

## Questions pour la revue
- Tencent (TCEHY) : fix auto-désengageant en place (registre verified-shares ±20% + re-rang conditionnel, remplace le capDivisor statique). À arbitrer : (a) déployer Railway quand opportun (API seule) ; (b) vérifier à l'audit mensuel que `stats.capCorrections` reste à 1 et que le registre suit les rachats Tencent (~-1,6%/an, bande ±20% → marge de plusieurs années) ; (c) si CMC corrige, `capCorrections` retombe à 0 automatiquement — rien à retirer ; (d) l'ordre du CSV CMC reste la base, seules les lignes corrigées sont re-placées par cap.

- Décisions de la revue du 02/09 appliquées : cadence adaptative retenue ; 3 replies/jour non dilutives si angles distincts (confirmé pour le 01/09) ; 4+ replies/jour exceptionnelles et justifiées par des opportunités indépendantes, jamais un quota.
- Standalone famille 3 (droits temporels / "a deadline never shows up in a balance") : gelé tant qu'aucune seconde corroboration indépendante n'apparaît (réponse qualifiée ou second cas utilisateur concret) ; les 88 vues Sceptre seules ne suffisent pas.

## Invariants à préserver

- Qualité > volume : pas de reply sans élément nouveau (distinction, méthode, edge case, contre-exemple) ; 0 action est un résultat valide ; pas de paraphrase d'un angle déjà publié (anti-doublon via Mem0 + historique).
- Une seule copie de chaque reply ; vérification post-publication par URL exacte et unicité avant toute republication ; suppression ciblée (URL+marker) en cas de défaut.
- Textes ASCII/UTF-8 propres (jamais de `Get-Content -Raw` PS 5.1 pour la publication), pas de tirets cadratins ni tournures IA ; attention aux `$` dans les textes.
- Jamais prétendre à une reprise automatique sans mécanisme réel (`Start-Sleep` bloquant dans l'exécution) ; étiquettes d'état explicites ; journalisation à chaque vague avec prevHash (sessions concurrentes sur le même vault).
- Contenu propriétaire : pas de secrets, pas de positions/montants exacts dans les mémoires ; pas de follow non justifié ; pas de pitch forcé.

---

## Append — Session APP rank-5002 (WCORE GSheet, 2026-09-02 15:55)

### État
- Mode : WCORE GSheet (Portefeuille Action/Crypto). 120 combinaisons wallet-chaîne, 162 chaînes. Sujet du jour : bug valorisation APP (micro-cap Bitpanda delistée) tarifée ~268 € par contamination AppLovin (Nasdaq) sur boucle de feedback.
- État : fix v4.16.35 deployé (API Railway 13:49 UTC, safe-push GAS 13:50 UTC). CEX - Bitpanda Crypto E(APP) = 0,00 €, Portefeuille Crypto C(APP) = 0,00 € (rank 5002). Total crypto bornes retombe sous 7 k€ (vs ~7 022 € fantômes).
- **Suite (14:30)** : le safe-push de 13:50 a fait régresser HYXS/SKHY — la conversion `BP_STOCK_UNIT_CONVERSIONS` (HYXS→SKHY ×10) du 09-01 n'existe que non-commitée dans un worktree hotfix, jamais poussée vers origin/master. Le working tree racine (restauré depuis origin/master le matin) ne l'avait plus → push de la version amputée. Restaurée depuis `.backups/backup_20260901_1013` + safe-push 14:49 + sync 14:51 → SKHY 0,0752087 = 10,44 € (Vérif=V), ligne HYXS disparue, Portefeuille Action SKHY 138,79 € (Nasdaq) cohérent.

### Terminé depuis la dernière revue
- **Fix boucle contamination APP rank-5002** : boucle de feedback structurelle (priceMap ↔ Details!D ↔ Portfolio C ↔ CEX E) — sans authoritative null explicite + bypass prevVal, le prix ne peut jamais redescendre à 0.
  - `apps/api/src/plugins/cex.ts` : `priceSymbolsViaBitpandaTicker(symbols)` (cache 60 s) + GET /api/cex/prices : si `provider=bitpanda`, ticker public first → EUR>0 `{priceEur, source:"bitpanda-ticker"}` ; EUR=0 `{priceEur:null, source:"bitpanda-ticker"}` (authoritative null) ; symbole absent → DefiLlama inchangé.
  - `wcore-gsheet/src/35_BITPANDA_SYNC.gs` : branche `authoritativeZero` dans `_cexComputeAndAppendTotal_` — `webPrices[sym]==null` + `hasOwnProperty` → écrit 0, **bypass prevVal** (qui ré-inflait).
  - Tests : `cex-ticker-first.test.ts` 4/4 (listed-priced, listed-zero, absent-not-auth, failure empty) ; typecheck API OK ; validate:static GAS 3133 fonctions OK ; 61/62 tests GAS verts (kraken-stocks.test.js échec préexistant d'une autre session v4.16.37-39 sur xStocks Kraken).
  - Vérification prod : `clasp run UPDATE_BITPANDA_CRYPTO_FIAT` 11:59:49 UTC → E(APP)=0 € ligne 130 CEX - Bitpanda Crypto, C(APP)=0 € Portefeuille Crypto rank 5002.
  - **Restauration conversion HYXS→SKHY ×10** (`BP_STOCK_UNIT_CONVERSIONS` + `_bpApplyStockConversions_` dans `_bpBuildOutputBuckets_`) depuis le backup 09-01 10:13 — la récidive (3e du même pattern : fix non-commité écrasé par un push depuis un checkout divergent) est documentée dans `journal/2026-09-02.md`.
  - Journalisation : `journal/2026-09-02.md` appends (APP 17,7 KB + HYXS 20,6 KB) ; mem0 `bf4906fc` (APP) + `80cb08b8` (HYXS) ; CHANGELOG.md section v4.16.35 ajoutée.

### En cours / bloqué
- Réconciliation git master (HEAD 19 behind origin/master, 6 ahead) : branche locale contient fix TCEHY, fix SKHY restauration, fix APP, et travaux non-commités d'autres sessions (scam-detector v26 OFF, plugins gsheet xstocks, kraken 41 refactor v4.16.37-39). Deploy API fait avec `-SkipRemoteCheck` (validé utilisateur) — working tree = prod + fix APP, aucune régression. Le rebase des 6 commits reste à coordonner entre sessions (conflits probables mappings.ts / scam-enrichment / goplus).
- `kraken-stocks.test.js` en échec = préexistant, dû aux changements non-commités d'une autre session sur `41_KRAKEN_SYNC.gs` (v4.16.37-39 xStocks affichés avec x minuscule). Pas bloquant pour le fix APP.

### Questions pour la revue
- Le fix APP est-il complet ? (a) Pluie de symboles rank 5002 (GODL, LAI, KIP, etc.) — seront aussi tarifés 0 € au prochain sync Bitpanda via le même authoritative null. (b) CEX - Bitpanda Crypto affiche désormais 154 cryptos + ~25 manual rank 5002 (GODL etc.) à 0 €. Aucun actif manuel rank 5002 ne devrait être tarifé par DefiLlama s'il n'apparaît pas dans le ticker Bitpanda : ce sont souvent des jetons qu'on a reçu en airdrop hors Bitpanda. (c) Branche `else` à L1724+ (last-known prevVal) reste active pour les cas où l'API ne répond pas (HTTP error) — l'authoritative null ne couvre que le cas `webPrices[sym]==null` avec hasOwnProperty.
- Sync horaire suivante (~14:xx UTC) doit confirmer : Portefeuille Crypto total bornes < 17 € (sans APP), CEX - Bitpanda Crypto E(GODL)=0, E(KIP)=0.

### Invariants à préserver
- **Toujours** la branche authoritative null + bypass prevVal en cas de ticker Bitpanda EUR=0,0000. Tout refactor qui toucherait `_cexFetchWebPrices_` ou `_cexComputeAndAppendTotal_` doit préserver `webPrices[sym]==null` + `hasOwnProperty` (la condition clé de authoritativeZero).
- `priceSymbolsViaBitpandaTicker` cache 60 s : ne pas la supprimer en refactor, c'est elle qui évite 1 appel HTTP / symbole / sync.
- **`BP_STOCK_UNIT_CONVERSIONS` (HYXS→SKHY ×10) dans 35_BITPANDA_SYNC.gs est CRITIQUE et non-commité** — canari avant tout safe-push : `Select-String BP_STOCK_UNIT_CONVERSIONS src/35_BITPANDA_SYNC.gs`. Sans elle, CEX - Bitpanda Stocks repasse à HYXS brut (1,04 € au lieu de 10,44 €).
- Ne JAMAIS faire tomber APP ou un micro-cap delisté dans la branche ticker (re-test possible en supprimant la mémoire de la mémoire Mem0 et en observant le retour à 268 €).
- API deploy = `-SkipRemoteCheck` tant que la réconciliation git n'est pas faite (garde `deploy.ps1`).
- 1 HYXS = 10 SKHY, SKHY Nasdaq, HYXS=KRX:000660 (fix SKHY restauré ce matin, ne pas toucher).
