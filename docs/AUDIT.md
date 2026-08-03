# WCORE - Audit transversal

> Date de verification: 2026-08-03
> Revision auditee: `beb465ffbc542d6acef4e1cabe08c8f434334d19` (`master`, identique a `origin/master`)
> Perimetre: depot racine, Web, API, relais CEX, package `@wcore/chains`, Apps Script, CI, Railway, dependances, documentation et controles RPC non destructifs.
> Methode: inspection statique parallele, reconciliation de l'audit du 2026-07-16, tests/builds locaux, controles HTTP publics, inspection Railway, lecture du classeur, inspection des triggers/executions Apps Script et sondage direct des endpoints configures. Aucun secret n'a ete affiche ou copie.
> Suivi: les corrections du Sprint 0 ont ete appliquees, verifiees par la CI, puis deployees le meme jour. API `e18f126f` puis rebuild avec le correctif Somnia, Web `2ffd50b7`, toutes deux en `SUCCESS`. Les constats corriges sont marques RESOLU ci-dessous.

## Resume executif

WCORE compile, passe ses suites locales et sert correctement ses trois services. La CI GitHub est verte, les dependances ne remontent aucune vulnerabilite connue, CORS/CSRF et les routes sensibles testees echouent ferme. Aucun P0 n'a ete confirme.

L'etat n'est toutefois pas sain sur quatre invariants critiques:

1. Le registre de chaines contient de nouveau un `CHAIN_ID` Somnia faux dans la source canonique et le package deploye (`50311` au lieu de `5031`).
2. La production expose 171 chaines actives alors que plusieurs sont inutilisables depuis l'environnement audite; les logs API montrent une forte repetition de `all RPC endpoints failed`.
3. Les timeouts de scan ne stoppent pas le travail sous-jacent et les jobs async restent en memoire sans borne globale.
4. L'historique Prisma reste non reconstructible sur une base vide.

La plateforme est donc operationnelle, mais sa fiabilite multi-chain et sa capacite de reprise apres sinistre restent inferieures a ce que suggerent les checks de surface.

## Etat mesure

| Axe | Resultat du 2026-08-03 |
|---|---|
| Git | worktree propre avant audit; `HEAD == origin/master == beb465f` |
| GitHub Actions | `CI` et `Chains` verts sur `beb465f` |
| Railway | API, Web, relais, Postgres et Redis `Online`; derniers deploys `SUCCESS` |
| Production | Web/API/relais en HTTP 200 avec HSTS; API et relais avec CSP; Web sans header CSP |
| Chaines API | 182 configurations, 171 actives, 11 desactivees |
| RPC uniques actifs | 13: B3, CAMP, CITREA, FOGO, HORIZEN_EON, INJECTIVE, MITOSIS, NEXUS, OPENLEDGER, ROBINHOOD_CHAIN, STABLE, SYNDICATE_COMMONS, VANA |
| Sweep RPC initial | 464 endpoints testes; 336 reponses valides, 128 echecs avec timeout 5 s/concurrence 24 |
| Reprise ciblee | 34 endpoints sur 18 chaines, timeout 10 s/concurrence 4; 16 valides, 18 en echec |
| Apps Script | 15 triggers visibles; executions recentes chargees `Terminee`, mais un trigger requis est desactive |
| Apps Script runtime | sorties Web Scan en `4.16.41`; `WCORE_VERSION` racine en `4.16.40`; package genere en `4.15.50` |
| Lint | passe, 0 erreur affichee |
| TypeScript | typecheck des 5 projets passe |
| Build | packages, API et Next.js 16.2.12 passent |
| Tests Core | 291/291 |
| Tests Shared | 21/21 |
| Tests Web | 169/169 |
| Tests relais | 37/37 |
| Tests GSheet | passent; 3 142 fonctions globales validees; ports Phase 3: 181 |
| Dependances Web | `pnpm audit --prod --audit-level=high`: aucune vulnerabilite connue |
| Tests API integration | non executes localement: aucun `.env.test` ni DB/Redis de test dedies |
| Environnement local | Node 24.18.1; CI et images ciblent Node 22 |

## Findings P1

### P1-1 - Somnia deploye avec le mauvais chainId - RESOLU 2026-08-03

- Preuve: `wcore-gsheet/src/SOMNIA.gs:11` et `wcore-gsheet/dist/chains/SOMNIA.ts:22` declaraient `50311`.
- Preuve croisee: les cinq RPC configures repondent `5031`.
- Production au moment du constat: scan Somnia `degraded=true` avec `errors=80`.
- Correction: `CHAIN_ID` passe a `5031` dans la source canonique, `dist/` regenere, et la valeur est desormais epinglee par un test hors ligne (`packages/core/src/chains/chains.test.ts`). Production confirme `chainId: 5031`.
- Suite directe: le premier scan reel apres correction a revele ce que ce bug masquait, aucun `MAX_LOG_RANGE` n'etait configure et toute la decouverte echouait en `block range exceeds 1000`. Limite mesuree: un span de 1000 passe, 1001 est rejete; `MAX_LOG_RANGE: 999` applique et les endpoints bloques depuis Railway retrogrades. Cette erreur a disparu en production.

### P1-11 - Le consensus sur blockNumber marque des chaines saines comme degradees

- Constat issu des scans de verification post-deploiement, sur `SOMNIA`, `POLYNOMIAL` et `REYA`: `blockNumber consensus failed; token log discovery limited to latest block`.
- Le consensus exige une majorite stricte sur une valeur qui change en permanence. Sur une chaine rapide ou peu d'endpoints repondent, deux endpoints sains renvoient naturellement deux hauteurs differentes et le consensus echoue alors qu'aucun n'est fautif.
- Impact: la chaine reste scannable mais est marquee `degraded`, la decouverte est limitee au dernier bloc, et le drapeau perd sa valeur de signal puisqu'il ne distingue plus une panne d'une simple course entre endpoints.
- Ce n'est pas corrigeable par configuration: il faut une tolerance sur la hauteur de bloc, ou retirer `blockNumber` du consensus strict. A traiter avec la redefinition de la semantique de `degraded`.

### P1-10 - Endpoint testnet dans le pool mainnet de Reya - RESOLU 2026-08-03

- Trouve par le nouveau garde-fou, pas par l'audit initial qui l'avait classe en simple echec.
- `rpc.reya-cronos.gelato.digital` figurait dans les endpoints de `REYA` (mainnet `1729`) et repond `89346162`, soit Reya Cronos, le testnet.
- Impact: un endpoint d'un autre reseau dans un pool mainnet peut servir des soldes du mauvais reseau, et la regle produit interdit les testnets.
- Correction: endpoint supprime, pas retrograde. Contrairement a un blocage lie a l'IP, une mauvaise chaine n'est jamais un repli acceptable.

### P1-2 - Couverture active superieure a la couverture reellement scannable - PARTIELLEMENT RESOLU 2026-08-03

- Production expose 171 chaines actives. La reprise ciblee confirmait six chaines sans endpoint utilisable depuis cette machine: `DUCKCHAIN`, `NOBLE`, `POLYNOMIAL`, `STARGAZE`, `STRIDE`, `SYNDICATE_COMMONS`.
- **Corrige**: `POLYNOMIAL` (deux miroirs thirdweb verifies sur le chainId 8008 ajoutes devant les deux endpoints morts), `NOBLE` (publicnode repond 404 sur *toutes* les routes de module; failover `REST_URLS` ajoute) et `STRIDE` (publicnode repond 403 `unsupported platform`; meme traitement). Les endpoints ajoutes ont ete verifies sur les routes `bank` et `staking` reellement utilisees par le moteur, pas seulement sur le dernier bloc.
- **Non corrige, faute de candidat valide**: `DUCKCHAIN` (cinq candidats testes, tous morts; ledger `WEB_SCAN_PRESERVED` et fige depuis le 2026-07-31), `SYNDICATE_COMMONS` (endpoint officiel en 502) et `STARGAZE` (aucune alternative joignable depuis cette machine). Elles restent actives pour preserver le cache, conformement a la convention du depot.
- Limite: les blocages RPC peuvent dependre de l'IP. Les endpoints defaillants sont retrogrades et non supprimes, sauf mauvaise chaine (cf. P1-10).
- Reste a faire: decider du sort des trois chaines non scannables, et confirmer les nouveaux endpoints depuis Railway et Apps Script.

### P1-3 - Les timeouts liberent les slots sans annuler les scans

- Preuve: `wcore-web/apps/api/src/plugins/scan.ts:152-176,368-398,453-465,578-647` cree un `AbortSignal`, mais les moteurs appeles via `packages/core/src/engines/dispatch.ts:42-58` ne propagent pas l'annulation de bout en bout.
- Impact: apres timeout, les appels RPC/pricing continuent, le slot `p-limit` est reutilise et la concurrence reelle depasse les bornes configurees.
- Preuve runtime: les 300 dernieres lignes API sont presque entierement composees de `rpcFetch: all RPC endpoints failed`, avec des pools de 1 a 5 RPC.
- Action: propager `AbortSignal` dans RPC, REST, discovery et pricing; ne liberer le slot qu'apres annulation effective.

### P1-4 - Jobs async non bornes et non persistants

- Preuve: `wcore-web/apps/api/src/plugins/scan-job.ts:23` utilise un `Map` process-local sans limite globale ou par utilisateur/IP.
- Les gardes TTL marquent les jobs en erreur mais n'arretent pas les moteurs deja lances.
- Impact: croissance memoire, perte au restart, incoherence multi-replique et amplification RPC.
- Action: queue/store Redis avec TTL, limites globales et par principal, claim atomique et annulation reelle.

### P1-5 - Historique Prisma non reconstructible - RESOLU 2026-08-03

- `wcore-web/packages/db/prisma/schema.prisma:193,280` mappe `scam_overrides` et `tickets`, qu'aucune des 16 `CREATE TABLE` des migrations ne creait.
- Correction: `20260518102000_create_scam_overrides_and_tickets` cree les deux tables avant la migration qui les altere, puis `20260803090000_align_scam_override_unique` installe l'unicite composite du schema. Aucune migration deja appliquee n'a ete modifiee, ce qui aurait invalide sa somme de controle en production.
- Chaque bloc est garde par `to_regclass(...) IS NULL`, donc strictement no-op sur la base de production creee historiquement par `db push` puis baselinee.
- Verification: nouveau job CI `migrations` qui rejoue tout l'historique sur un PostgreSQL vierge puis exige `prisma migrate diff --exit-code` sans derive. Non verifiable localement, Docker n'etant pas disponible sur cette machine.

### P1-6 - Protection DNS rebinding inactive

- `wcore-web/apps/api/src/lib/safe-http.ts:35` definit `assertNoDnsRebind`, mais aucun appelant n'a ete trouve.
- Les quatre fetches GM utilisent seulement `assertPublicHttp`, qui filtre le hostname litteral sans epingler les resolutions A/AAAA.
- Impact: un nom DNS public controle peut etre rebinde vers loopback, metadata cloud ou reseau prive.
- Action: client HTTP unique avec validation A/AAAA, epinglage de l'adresse validee et tests IPv4/IPv6/TOCTOU.

### P1-7 - Trigger manuel CEX requis mais desactive

- Apps Script affiche `CEX_MANUAL_REFRESH_WORKER` comme `Desactive`.
- Le code le declare requis dans `wcore-gsheet/src/16B_AUTO_HEAL.gs:217` et l'installe toutes les minutes (`:118`, `:715`). La queue est drainee par `wcore-gsheet/src/35_BITPANDA_SYNC.gs:415`.
- Impact: les refreshs manuels mis en queue depuis A1/Z1/AC2 peuvent rester bloques.
- Signaux associes: taux d'erreur UI de 29,79% pour `WCORE_AUTO_HEAL_TIMER`, 12,9% pour `QUOTA_RECOVERY_SWEEP` et 6,67% pour `STOCK_PORTFOLIO_HOURLY_REFRESH`; les executions les plus recentes chargees sont terminees.
- Action: reparer/reautoriser le trigger depuis l'editeur, puis verifier la cause des taux d'erreur au lieu de se fier au seul statut `Terminee`.

### P1-8 - Contrats de concurrence GSheet encore incorrects

- Cosmos: `wcore-gsheet/src/19_CHAIN_FACTORY.gs:393` expose `getRefreshStatus(address, forceFull)` au lieu des cinq arguments utilises par les wrappers.
- Queue CEX: `_cexEnqueueManualJobs_` dans `35_BITPANDA_SYNC.gs:316-324` fait encore un read-modify-write sans verrou; les `.substring(0, 8000)` peuvent produire un JSON invalide.
- Consensus SVM: `14_SVM_ENGINE.gs:217-229` retourne la meilleure valeur sans exiger `maxCount * 2 > successfulVotes`.
- Impact: arguments perdus, jobs perdus/doubles et valeur minoritaire presentee comme consensus.

### P1-9 - Limite de scan authentifie trop permissive

- `wcore-web/apps/api/src/config.ts:222` autorise par defaut 2 000 requetes scan/minute par IP authentifiee.
- Chaque requete peut couvrir jusqu'a 120 chaines et declencher RPC, discovery et pricing.
- Impact: un seul compte peut saturer les RPC gratuits et le budget fournisseur.
- La documentation de production indique parfois 60, mais le defaut code et `.env.example` valent 2 000.
- Action: quota par utilisateur, cout pondere par chain-check, limite de jobs simultanes et valeur production explicitement verifiee.

## Findings P2

### Securite et exploitation

- Les comparaisons `x-gsheet-token` sont non constantes dans `plugins/cex.ts:427` et `plugins/gsheet.ts:865`, contrairement a `admin-auth.ts` et au relais.
- Le relais accepte encore `RELAY_TOKEN` en query string sur les endpoints legacy (`railway-relay/server.js:1367` et suivants), ce qui peut fuiter dans les logs/proxies.
- Le relais n'a pas de rate limit global; `POST /api/cex/accounts/:id/sync` tombe dans le catch-all API a 120/min.
- `ADMIN_TOKEN` n'est pas configure sur le service API Railway. Les routes admin restent fermees en 401, mais les operations admin legitimes sont indisponibles.
- `CEX_SECRET` est bien configure en production. Le risque de fallback sur `JWT_SECRET` subsiste dans le code (`plugins/cex.ts:104`) pour tout autre environnement.
- Le Web sert HSTS et `nosniff`, mais pas de Content-Security-Policy; API et relais en servent une.
- Le message brut d'erreur CEX peut etre retourne et persiste (`plugins/cex.ts:560-562`).

### Production et RPC

- Un scan BASE public valide retourne 200 en 7,1 s avec 16 tokens prices, mais `degraded=true`: `base.drpc.org` repond 408 et `base-rpc.publicnode.com` 403 depuis Railway. Les deux endpoints suivants (`mainnet.base.org`, `1rpc.io/base`) repondent, de meme que `base.gateway.tenderly.co`.
- L'ordre actuel dans `wcore-gsheet/src/BASE.gs:18-21` place donc deux endpoints defaillants avant les endpoints sains.
- 128/464 endpoints ont echoue au sweep initial. Ce nombre inclut rate limits et timeouts sensibles a la concurrence; il mesure la fragilite du pool, pas 128 pannes permanentes.
- Les logs API ne joignent pas le `chainKey` aux messages repetes `all RPC endpoints failed`, ce qui rend le diagnostic production inutilement couteux.

### Performance et cout

- Le circuit breaker de scan peut compter deux fois un meme echec (`plugins/scan.ts:158-180,196-202`), ouvrant deux fois plus vite que son seuil nominal.
- Discovery EVM batch non bornee: jusqu'a `10 x wallets` appels logs simultanes (`engines/evm-batch.ts:141-261`, `tokens/log-discovery.ts:72-99`).
- Les caches non-EVM font `A x C` lectures Redis au lieu d'un `mget` (`plugins/scan.ts:425-442`).
- Les metadonnees de contrats sont resolues sequentiellement (`tokens/discovery.ts:99-108`).
- Delegations, unbondings et rewards Cosmos independants sont attendus en serie (`engines/cosmos.ts:172-227`).
- `getEurUsdRate()` n'utilise pas le cache partage dans le plugin scan (`plugins/scan.ts:36-39`).
- Les prechargements DefiLlama et GeckoTerminal independants sont sequentiels dans les scans EVM.
- TON ignore `opts.sources` et GeckoTerminal conserve certains markers uniquement en memoire process.

### Comportement fonctionnel

- Echec de `/api/gm/has-deployed`: `useOnChainGm.ts:98-100` retourne `false`, ce qui peut afficher un chemin Deploy au lieu d'un etat inconnu.
- La page GM lance encore un fan-out de prix natifs pour toutes les factories; 86 entrees ont ete comptees.
- Le cache wallet positif expire purement au TTL (`04B_CACHE_WALLET.gs:779-786`) malgre la politique documentaire de preservation.
- `dist/package.json` reste en `4.15.50`, `WCORE_VERSION` en `4.16.40` et le module Web Scan en `4.16.41`.

## Findings P3 et dette documentaire

- `wcore-web/AGENTS.md` affiche encore 183 chaines et Apps Script `v4.15.36`; le runtime API expose 182 et le code racine vaut 4.16.40.
- Le footer public affiche `183 tracked chains`, alors que `/api/chains` retourne 182.
- `wcore-gsheet/AGENTS.md` et les docs CEX decrivent encore `CEX_HOURLY_REFRESH` toutes les 4 h, mais `35_BITPANDA_SYNC.gs:916-937` le supprime et installe des triggers individuels horaires plus une rotation relais.
- `.env.production.template` et `DEPLOY.md` indiquent `RATE_LIMIT_SCAN=60`; le defaut code vaut 2 000.
- Les templates omettent notamment `CEX_SECRET`, `RELAY_TOKEN`, `NON_EVM_SCAN_CONCURRENCY`, `RATE_LIMIT_CATCH_ALL` et plusieurs TTL/jobs.
- `DEPLOY.md` ne decrit que deux services Railway alors que le script en gere trois, dont `cex-relay`.
- Sept factories GM (`intuition`, `plume`, `superposition`, `megaeth`, `doma`, `b2`, `katana`) n'ont pas d'entree dans `apps/web/lib/explorers.ts`.
- `wcore-web/AGENTS.md` presente encore Coinbase/OKX comme a implementer alors que les sept CEX sont actifs.
- Trois dependances runtime API semblent mortes: `@cosmjs/amino`, `@cosmjs/proto-signing`, `fastify-type-provider-zod`.
- Le demarrage API local sans `NODE_ENV` ni `JWT_SECRET` est incoherent avec `.env.example`.
- 19 fichiers `.gs` depassent 1 000 lignes; `27_ACTIVITY_REFRESH.gs` atteint environ 3 151 lignes.

## Constats precedents resolus

- W1 conversion USD/EUR CEX: resolu et teste.
- W2 endpoint pricing CEX public non protege: resolu par token et bornes.
- W4/A7 CI racine: resolu; workflows `CI` et `Chains` verts.
- W9 preservation des avoirs CEX en panne: resolu et couvert par les tests Web.
- G2 compteur quota/delegation Web: verrou utilisateur et comptage WEB_SCAN ajoutes.
- G4 auto-heal declenche par un seul CEX stale: branche devenue diagnostique seulement.
- G6 retry A2/J1 infini: budget 3 retries/24 h ajoute.
- A4 scripts npm GSheet absents: les references cassees ne sont plus dans `package.json`.
- Mojibake des trois gros documents Web: les motifs historiques ne sont plus presents dans les fichiers controles.
- Derive `src/ -> dist/` silencieuse: workflow `Chains` ajoute et vert. Ce workflow ne valide toutefois pas les chainIds contre les RPC vivants.

## Controles production

| Controle | Resultat |
|---|---|
| `https://wcore.xyz` | 200, HTML WCORE, aucune erreur/warning propre a la page lors de la navigation fraiche |
| API `/health` | 200 JSON |
| Relais `/health` | 200 JSON |
| HSTS | actif sur les trois surfaces |
| CSRF scan sans Origin | 403 `csrf_origin_mismatch` |
| CSRF scan Origin hostile | 403 `csrf_origin_mismatch` |
| Scan BASE Origin WCORE | 200, donnees utiles mais degradees |
| `/api/metrics/errors` anonyme | 401 |
| `/api/health/detailed` anonyme | 401 |
| Relais `/binance` et `/all` sans token | 401 |
| FX Web | 0,868269 EUR/USD lors du controle |
| Parite FX GSheet/Web | `ok=true`, drift ~0,010% |
| Auth bearer production | variable explicitement configuree a `false` |
| Secrets CEX/JWT/relais/GSheet | variables presentes; valeurs non lues dans le rapport |

## Priorites recommandees

### Sprint 0 - integrite immediate

1. FAIT: Somnia corrige, `dist/` regenere, valeur epinglee par un test.
2. FAIT: Polynomial, Noble et Stride repares; BASE reordonne; endpoint testnet de Reya supprime.
3. FAIT: migrations Prisma reconstructibles + job CI sur base vierge.
4. FAIT: garde-fou planifie `Chain IDs` contre la derive de chainId.
5. RESTE: reparer `CEX_MANUAL_REFRESH_WORKER` et analyser les echecs auto-heal/quota. Necessite l'editeur Apps Script, `clasp run` etant indisponible.
6. FAIT: API et Web deployes et verifies depuis la production.
7. RESTE: deployer Apps Script (`clasp push`) pour que le runtime GSheet recoive les memes configs de chaines.
8. RESTE: trancher le sort de `DUCKCHAIN`, `SYNDICATE_COMMONS` et `STARGAZE`.
9. RESTE: traiter P1-11, qui masque desormais l'essentiel du bruit `degraded` restant.

### Sprint 1 - resilience et securite

1. Propager l'annulation des scans et borner/persister les jobs async.
2. Brancher une protection DNS rebinding reelle.
3. Reduire et ponderer le rate limit scan; limiter les syncs CEX et le relais.
4. Retirer les tokens des query strings et utiliser des comparaisons constantes.

### Sprint 2 - coherence

1. Corriger contrats Cosmos/SVM/queue CEX et les tests associes.
2. Aligner versions, compte de chaines, triggers CEX et templates d'environnement.
3. Ajouter une validation automatisee des chainIds et un health check RPC planifie depuis Railway.
4. Reduire les fan-outs et serialisations reseau identifies.

## Limites

- Les tests API integration n'ont pas ete executes localement faute de DB/Redis de test dedies; ils ne doivent jamais viser la production.
- Le sweep RPC a ete lance depuis une seule machine. Des restrictions geographiques, IP ou rate limits peuvent produire des resultats differents depuis Google Apps Script et Railway.
- Les taux d'erreur Apps Script sont ceux affiches par Google sur la fenetre de son interface; les executions recentes visibles etaient terminees, sans detail historique complet exporte.
- Aucun scan exhaustif de wallets, aucune mutation du classeur et aucun deploiement n'ont ete effectues pendant l'audit.
