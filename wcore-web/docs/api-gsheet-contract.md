# Contrat de l'API `/api/gsheet/*` (WCORE)

Statut : documentation de l'existant, établie le 28/11/2026 par lecture du code (inventaire statique, tests lus mais non exécutés pour cet inventaire). Ce document ne contient aucune donnée personnelle. Les chemins sont relatifs à `wcore-web/apps/api/src` sauf mention contraire ; `core/` désigne `wcore-web/packages/core/src`.

Ce que ce document ne garantit pas : il n'existe pas de spécification OpenAPI ; la source de vérité reste le code. Il n'y a **aucun versionnage** de ces routes (ni segment de chemin, ni en-tête, ni `Accept-Version`). Seule la structure FX porte `fxMetadata.version:1`.

## 1. Règles communes

- Les neuf routes métier ne sont enregistrées que si `GSHEET_API_TOKEN` est configuré.
- Authentification : en-tête `x-gsheet-token` comparé en temps constant. Absent ou faux : `401 {error:"unauthorized"}`. Le cookie et le Bearer du middleware global ne suffisent pas. Pas de HMAC entrant. (`plugins/gsheet.ts:1138–1145,1342–1352`, `server-helpers.ts:95–106`)
- Limite de débit : compteur `catch_all` partagé, **par IP effective**, fenêtre fixe de 60 s, 120 requêtes par défaut (`RATE_LIMIT_CATCH_ALL`). Dépassement : `429 {error:"rate_limited",message}`. (`server.ts:167–172`, `server-helpers.ts:281–299`)
- Corps JSON : `Content-Type: application/json`, plafond 1 Mio ; `400` JSON invalide ou vide, `413` trop gros, `415` type non pris en charge. Erreurs du framework : `{statusCode,error,message,code?}`. Erreurs métier : `{error:string}` (avec `ok:false` pour `notify` et `trade-ack/take`).
- Aucun délai global de traitement HTTP ; seuls des délais internes par source existent.
- Les chemins ci-dessous sont relatifs à `/api/gsheet`.

## 2. Routes

| Méthode et chemin | Entrée | Réponse `200` | Erreurs |
|---|---|---|---|
| `GET /cache/get` | query `key` (obligatoire) | `{found:boolean,value:JSON\|null}` | `400 missing_key` |
| `DELETE /cache/price` | query `chain`, `contract` | `{ok:true,key:"price:{chain}:{contract}"}` | `400 chain_and_contract_required`, `503 cache_unavailable` |
| `GET /stocks/portfolio` | query facultative `fresh=true`, `symbols` (ignoré) | `{ok,generatedAt,ownerAddress,dynamicLimit,holdingsStale,rows[],stats}` | `400 unexpected_query`, `503 stock_portfolio_unavailable` |
| `GET /crypto/portfolio` | query facultative `fresh=true` | `{ok,generatedAt,rows:[{canonicalSymbol,name,rank,priceEur,marketCapEur}],stats:{ranked,unpriced}}` | `400 unexpected_query`, `503 crypto_portfolio_unavailable` |
| `POST /prices` | `{chain:string,tokens:string[]}` (au plus 100 contrats uniques) | `{ok,chain,fxRate,prices:Record<contrat,{priceEur,priceUsd,source,priceTs?}>,missing[]}` | `400 missing_chain\|missing_tokens\|invalid_tokens\|too_many_tokens`, `404 chain_not_found`, `503 price_batch_failed` |
| `POST /scan` | `{address,chain,forceRefresh?,strictTokens?,customTokens?[≤200],heldContracts?[≤300]}` | `{ok,chain,chainName,vm,timestamp,native,tokens[],totalValueEur,errors[],degraded,fxRate,scanMs,…}` | `400 missing_address\|missing_chain\|invalid_*\|too_many_*`, `404 chain_not_found` |
| `POST /fx-telemetry` | `{rate,ts?,sources?,runtime?,fxMetadata?}` | `{ok:true,key}` | `400 invalid_rate`, `503 telemetry_disabled` |
| `POST /notify` | `{event:"test"}` ou `{event:"strat_rebalance",category,occurrence,…}` | `{ok,sent,duplicate?}` | `400 invalid_body`, `409 pending`, `422 ntfy_refused`, `429 daily_cap`, `502`, `503` |
| `POST /trade-ack/take` | aucun | `{ok,categories[],acks[]}` | `503 ack_disabled\|unavailable` |

Notes par route :

- **`/scan`** : un wallet et une chaîne par appel ; le format de l'adresse est contrôlé par le moteur de la chaîne. Une chaîne désactivée ou une exception de scan renvoie `200` avec `ok:true`, `degraded:true`, résultats vides et une erreur `[WEB_SCAN_ERROR]`. La réparation de prix est limitée par défaut à 24 jetons. Le schéma des jetons dépend du moteur (EVM, SVM, Cosmos, TON) et n'est pas fermé. (`plugins/gsheet.ts:1232–1315`)
- **`/prices`** : ne renvoie que des prix EUR finis et strictement positifs ; concurrence par défaut de 3 jetons. (`plugins/gsheet.ts:1207–1230`)
- **`/stocks/portfolio`** : jusqu'à 5 000 titres demandés, 300 lignes classées plus les positions détenues ; `ownerAddress` est le wallet propriétaire configuré côté serveur. (`stocks/stock-portfolio.ts`)
- **`/notify`** : quota partagé de 20 envois par 24 h (`NTFY_DAILY_CAP`). **`/trade-ack/take`** : prise au plus une fois, dans les 2 h suivant l'acquittement.
- `HEAD` existe pour `/cache/get`, `/stocks/portfolio`, `/crypto/portfolio`. `OPTIONS` relève du CORS générique sans authentification ; `x-gsheet-token` n'est pas dans la liste des en-têtes CORS autorisés.

## 3. Adresses, IP et conservation (important pour la confidentialité)

Ce qui est **prouvé par le code** :

1. **Journaux de requêtes (Pino/Fastify)** : au niveau `info`, chaque requête journalise `method`, `url`, `host`, **`remoteAddress` (IP effective)** et `remotePort`, puis le statut et la durée. Le corps et les en-têtes ne sont pas journalisés. Le masquage de l'URL ne vise que les liens d'acquittement ; **toute adresse placée dans une query ou un paramètre d'URL serait donc journalisée avec l'IP**. L'adresse de `POST /scan` est dans le corps, donc absente du journal de requête. Les messages d'avertissement peuvent reprendre des messages d'erreur non expurgés. (`server.ts:54–80`, `trust-proxy.ts`)
2. **Redis** : le scan met en cache des clés qui contiennent **le wallet en clair**, par moteur : EVM `disc:`/`native:`/`bal_cache:`/`token:`…`:{wallet}` (24 h pour la découverte, 1 h pour les soldes, 10 min pour les portefeuilles vides) ; SVM, Cosmos et TON de 24 h à 1 h, avec des marqueurs « vide » de 2 min. L'IP figure dans la clé `rate_limit:catch_all:ip:{IP}`, TTL fixe de 60 s. Les TTL sont appliqués par `SET … PX`. (`core/engines/*`, `server-helpers.ts:281–299`)
3. **PostgreSQL** : aucune table ne stocke le wallet scanné ni l'IP. `scam_verdicts` et `scam_scan_logs` contiennent des adresses de **contrats** de jetons (pas du wallet), sans purge trouvée. `ops_events` (notify et trade-ack) ne contient qu'une empreinte dérivée et l'occurrence, purgé au-delà de 2 j (7 j au plus). (`prisma/schema.prisma`, `plugins/gsheet-notify.ts`)
4. **Métriques** : agrégats en mémoire et snapshots PostgreSQL sans dimension wallet ni IP, purgés au-delà de 7 j. Aucun export de traces.

Ce qui **n'est pas établi** par le code et qui est à vérifier côté exploitation avant d'annoncer une durée de conservation : la rétention des journaux de l'hébergeur (Railway), la persistance et les sauvegardes de Redis et de PostgreSQL, et ce que conservent les fournisseurs RPC et explorateurs appelés pendant un scan.

Recommandations pour un client qui veut limiter l'empreinte : utiliser `POST /scan` (adresse dans le corps), jamais de GET avec une adresse dans l'URL ; ne pas mettre d'adresse dans `sources` de `/fx-telemetry` ni dans une clé de `/cache/get` ; ne pas envoyer d'adresse avant d'avoir confirmé la durée de conservation de l'hébergeur.
