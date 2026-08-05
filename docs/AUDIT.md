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

### P1-11 - Le consensus sur blockNumber marque des chaines saines comme degradees - RESOLU 2026-08-03

- Constat issu des scans de verification post-deploiement, sur `SOMNIA`, `POLYNOMIAL` et `REYA`: `blockNumber consensus failed; token log discovery limited to latest block`.
- Le consensus exige une majorite stricte sur une valeur qui change en permanence. Sur une chaine rapide ou peu d'endpoints repondent, deux endpoints sains renvoient naturellement deux hauteurs differentes et le consensus echoue alors qu'aucun n'est fautif.
- Impact: la chaine reste scannable mais est marquee `degraded`, la decouverte est limitee au dernier bloc, et le drapeau perd sa valeur de signal puisqu'il ne distingue plus une panne d'une simple course entre endpoints.
- Correction 2026-08-03: la hauteur retenue est la mediane basse des endpoints qui ont repondu, ce qui absorbe un noeud en retard et un noeud en avance sans jamais depasser la tete du plus lent. Une erreur n'est signalee que si tous echouent.
- Corollaire trouve dans la foulee: le curseur incremental reecrivait `fromBlock` sans respecter `MAX_LOG_RANGE`, donc des qu'il devenait plus ancien que la fenetre autorisee il l'**elargissait** et le RPC rejetait tout l'appel. Invisible jusqu'ici puisque l'echec de consensus empechait d'atteindre `eth_getLogs`. Toute chaine plafonnee etait exposee.
- Production apres deploiement: `SOMNIA` et `REYA` reviennent `degraded=false` avec zero erreur. `POLYNOMIAL` reste degradee mais pour une raison desormais exacte, ses deux miroirs repondent HTTP 429 depuis Railway.

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

### P1-3 - Les timeouts liberent les slots sans annuler les scans - RESOLU 2026-08-04

- Preuve: `wcore-web/apps/api/src/plugins/scan.ts:152-176,368-398,453-465,578-647` cree un `AbortSignal`, mais les moteurs appeles via `packages/core/src/engines/dispatch.ts:42-58` ne propagent pas l'annulation de bout en bout.
- Impact: apres timeout, les appels RPC/pricing continuent, le slot `p-limit` est reutilise et la concurrence reelle depasse les bornes configurees.
- Correction: le signal traverse desormais `dispatcher.ts` puis `client.ts` jusqu'au `fetch`, sur EVM scan/batch, SVM, Cosmos et TON. Helper partage `packages/core/src/abort.ts` (`linkAbortSignal`). Le client detache son ecouteur quand l'appel se termine: un signal de scan est partage par des centaines d'appels.
- Verification: 8 tests (`packages/core/src/abort.test.ts`), chacun valide par mutation du code de production. Deux passaient d'abord pour de mauvaises raisons - `AbortSignal` n'expose pas `listenerCount` (assertion silencieusement sautee, corrigee via `node:events`), et un rejet obtenu par le timeout de 60 s et non par l'annulation (corrige par une borne de promptitude).
- Verification production: scan 6 chaines, 372 tokens, aucune erreur d'annulation; `SOMNIA` et `REYA` restent `degraded=false`.

### P1-4 - Jobs async non bornes et non persistants - PARTIELLEMENT RESOLU 2026-08-04

- Preuve: `wcore-web/apps/api/src/plugins/scan-job.ts:23` utilise un `Map` process-local sans limite globale ou par utilisateur/IP.
- Les gardes TTL marquent les jobs en erreur mais n'arretent pas les moteurs deja lances.
- Impact: croissance memoire, perte au restart, incoherence multi-replique et amplification RPC.
- Correction bornage: `admitScanJob()` plafonne les scans simultanes par appelant (`SCAN_MAX_ASYNC_JOBS_PER_PRINCIPAL`, defaut 32) et la taille du store (`SCAN_MAX_ASYNC_JOBS`, defaut 200). Les jobs termines les plus anciens sont evinces avant tout refus, sinon une rafale de scans finis bloquerait les suivants pendant leur fenetre de polling. Le defaut par appelant laisse de la marge au frontend, qui lance `SCAN_CONCURRENCY / CHAIN_BATCH_SIZE` = 10 jobs simultanes.
- Correction annulation: chaque job porte un `AbortController` que les gardes TTL declenchent via `failJob()`, et `runWithTimeout()` s'y raccroche. Un job tue arrete reellement les chaines qu'il avait lancees, ce que P1-3 rend enfin possible.
- Verification: 8 tests (`apps/api/src/plugins/scan-job.test.ts`) + 3 sur le signal parent, tous valides par mutation. En production, plafond abaisse temporairement a 3: 4 requetes sur 15 simultanees repondent `429 too_many_jobs`, puis retour au defaut verifie (20/20 en succes).
- Reste: persistance Redis et claim atomique. Non traite volontairement - mesure sur la production, le service tourne en replique unique (6 creations/sondages async consecutifs, 0 `job_not_found`), donc l'incoherence multi-replique n'est pas un defaut vivant. La perte au restart reste connue et absorbee par le frontend. A reprendre avant tout passage a plusieurs repliques.

### P1-5 - Historique Prisma non reconstructible - RESOLU 2026-08-03

- `wcore-web/packages/db/prisma/schema.prisma:193,280` mappe `scam_overrides` et `tickets`, qu'aucune des 16 `CREATE TABLE` des migrations ne creait.
- Correction: `20260518102000_create_scam_overrides_and_tickets` cree les deux tables avant la migration qui les altere, puis `20260803090000_align_scam_override_unique` installe l'unicite composite du schema. Aucune migration deja appliquee n'a ete modifiee, ce qui aurait invalide sa somme de controle en production.
- Chaque bloc est garde par `to_regclass(...) IS NULL`, donc strictement no-op sur la base de production creee historiquement par `db push` puis baselinee.
- Verification: nouveau job CI `migrations` qui rejoue tout l'historique sur un PostgreSQL vierge puis exige `prisma migrate diff --exit-code` sans derive. Non verifiable localement, Docker n'etant pas disponible sur cette machine.

### P1-6 - Protection DNS rebinding inactive - RESOLU 2026-08-03

- `wcore-web/apps/api/src/lib/safe-http.ts:35` definit `assertNoDnsRebind`, mais aucun appelant n'a ete trouve.
- Les quatre fetches GM utilisent seulement `assertPublicHttp`, qui filtre le hostname litteral sans epingler les resolutions A/AAAA.
- Impact: un nom DNS public controle peut etre rebinde vers loopback, metadata cloud ou reseau prive.
- Correction: `safeFetch` unique, qui valide **toutes** les adresses A/AAAA et non la premiere. Plages ajoutees: `fd00::/8`, CGNAT `100.64/10`, IPv4 mappee en IPv6. Cinq appelants (`gm-contracts.ts:147,261`, `gm-helpers.ts:40`, `gm-onchain.ts:91`, `gm-streak-rebuild.ts:62`), dont deux que l'audit n'avait pas releves: `gm-contracts.ts:261` n'avait aucune protection et `gm-streak-rebuild.ts` ne verifiait que le protocole.
- Limite assumee: une fenetre TOCTOU subsiste entre la resolution validee et la connexion, Node n'exposant pas d'epinglage d'adresse sur `fetch`.

### P1-8 - Contrats de concurrence GSheet encore incorrects - RESOLU 2026-08-04

- Cosmos: la factory et quatre wrappers exposaient `(address, forceFull)` alors que la feuille appelle `CHAIN_REFRESH_STATUS(addr;"";I2:I;C1;B1)` et que `18_CLEANUP.gs:662` appelle `getWalletAssets(wallet,"","",true,false)`. `forceFull` recevait donc la case RPC vide: **la case C1 n'a jamais force un rafraichissement sur aucune chaine Cosmos**, et `B1` n'atteignait pas le garde-fou anti-repetition du moteur. Les 11 chaines Cosmos utilisent desormais le meme contrat a 5 arguments qu'EVM et SVM.
- Verification production: sur `Ledger - Cosmos Hub`, cocher C1 fait passer I1 de `[CACHE_ONLY] 11:49:57` a un scan reel `12:39:43`. Avant le correctif, le garde-fou aurait renvoye `[CACHE_ONLY]`.
- Queue CEX: lecture-modification-ecriture sans exclusion mutuelle, et plafonnement par `substring` sur le JSON serialise. Tronquer au milieu d'une structure rendait la valeur illisible, donc chaque lecteur repartait d'un tableau vide: un depassement **effacait toute la file** au lieu d'ecarter un job. Les mutations passent par un helper verrouille qui evince les entrees les plus anciennes et n'ecrit que du JSON valide.
- Consensus SVM: `getBalanceWithConsensus` retournait la premiere valeur ayant le plus de voix sans jamais exiger de majorite, donc trois endpoints en desaccord publiaient une minorite 1/3 comme un accord. La regle `votes * 2 > total` est appliquee sur les endpoints ayant repondu; sans majorite la fonction signale l'echec, ce qui fait conserver la balance en cache au lieu de l'ecraser.
- Chaque test de garde a ete valide par mutation du code de production.

### P1-12 - Denominations IBC irresolubles depuis IBC-Go v10 - RESOLU 2026-08-04

- Trouve en verifiant P1-8, pas par l'audit initial: `Ledger - Cosmos Hub` affichait `[WEB_SCAN_DEGRADED]` a chaque cycle.
- Le moteur n'interrogeait que `/ibc/apps/transfer/v1/denom_traces/{hash}`. IBC-Go v10 a retire cette route au profit de `/denoms/{hash}`, et les chaines scannees couvrent les deux generations: Cosmos Hub repond 501 sur l'ancienne, Injective et Terra repondent 501 sur la nouvelle. N'en interroger qu'une laissait donc tous les jetons IBC non resolus sur la moitie des chaines. Les deux sont desormais essayees.
- L'echec remontait `fetch failed` et non `HTTP 501`: le failover REST parcourt sa liste sur tout 5xx et le dernier endpoint de Cosmos Hub, `cosmoshub-api.lavenderfive.com`, ne resout plus. L'erreur reseau masquait la cause reelle.
- La convention micro-denom s'applique aussi au denom de base resolu, y compris aux derives de liquid staking qui heritent de l'echelle de ce qu'ils enveloppent (`stuatom` = `uatom` = 6). `staevmos` enveloppe `aevmos` en 18: lire tout `st` comme 6 serait faux de douze ordres de grandeur, donc seuls les cas reductibles a un micro-denom sont resolus.
- Production apres deploiement: **0 jeton resolu et 12 `decimals_unknown (fetch failed)` avant, 10 jetons resolus apres**. Restent `staevmos` et `stinj`, dont l'echelle est signalee plutot que devinee.

### P1-7 - Trigger manuel CEX requis mais desactive, et l'auto-heal ne le recupere pas - RESOLU 2026-08-05

- Apps Script affiche `CEX_MANUAL_REFRESH_WORKER` comme `Desactive`.
- Le code le declare requis dans `wcore-gsheet/src/16B_AUTO_HEAL.gs:217` et l'installe toutes les minutes (`:118`, `:715`). La queue est drainee par `wcore-gsheet/src/35_BITPANDA_SYNC.gs:415`.
- Impact: les refreshs manuels mis en queue depuis A1/Z1/AC2 peuvent rester bloques.
- Signaux associes: taux d'erreur UI de 29,79% pour `WCORE_AUTO_HEAL_TIMER`, 12,9% pour `QUOTA_RECOVERY_SWEEP` et 6,67% pour `STOCK_PORTFOLIO_HOURLY_REFRESH`; les executions les plus recentes chargees sont terminees.
- Verifie le 2026-08-03 apres le `clasp push`: le gel de triggers documente apres chaque push ne s'est **pas** produit, 13 des 15 triggers ont tourne normalement dans les minutes suivantes. `WCORE_AUTO_HEAL_FORCE()` a bien ete executee depuis l'editeur (18:11:07, 5,95 s, `Terminee`), et `CEX_MANUAL_REFRESH_WORKER` est **reste desactive**.
- Le remede documente est donc insuffisant pour ce trigger. `_wcoreAutoHealEnsureTriggers_` le declare requis et le recree en `force`, mais la creation est enveloppee dans un `try/catch` muet (`16B_AUTO_HEAL.gs:715`), donc un echec de recreation est invisible. Un trigger `everyMinutes(1)` est aussi le plus expose a une desactivation par Google.
- Signal corrobore: `WCORE_AUTO_HEAL_TIMER` affiche 33,55% d'erreurs et `QUOTA_RECOVERY_SWEEP` 40%. `PORTFOLIO_RECOVERY_REFRESH` est desactive de la meme facon.
- Diagnostic 2026-08-05, `WCORE_CEX_TRIGGER_CLEANUP_FORCE()` execute via Playwright dans l'editeur (11 s, `Terminee`, sans dialogue d'autorisation): le trigger est **recree et actif**, et il tourne depuis toutes les minutes (`09:19:56`, `09:20:56`, `09:21:56`, `09:22:56`, `09:24:27`, puis `09:35:27` apres un `clasp push`, 4 a 7 s par execution). La queue manuelle est de nouveau drainee.
- Cause reelle: ni la cadence ni un echec de creation. La creation en `_wcoreAutoHealEnsureTriggers_:118` n'est pas protegee par un `try/catch` et `WCORE_AUTO_HEAL_FORCE()` se terminait sans erreur, donc elle reussissait. Le probleme est que **`ScriptApp` n'expose aucun etat active/desactive**: `_wcoreAutoHealCountHandlers_` comptait le trigger comme sain alors que Google l'avait desactive, et l'auto-heal ne le reparait jamais. Seule la suppression + recreation inconditionnelle du nettoyage cible le reveille.
- Correction durable (v4.16.47): `_wcoreAutoHealCexQueueStaleness_` surveille l'**effet observable** plutot que le compte, comme le fait deja `_wcoreAutoHealJ1Staleness_` - une queue dont le job le plus ancien cesse d'etre consomme (seuil 10 min) declenche la suppression + recreation. L'echec de creation de `16B_AUTO_HEAL.gs:715` est desormais remonte au lieu d'etre avale: ce `catch` muet cachait la seule information qui aurait explique un worker jamais revenu.
- Faux positif ecarte: `PORTFOLIO_RECOVERY_REFRESH` n'est pas defaillant. Il est cree en one-shot (`16_REFRESH.gs:2081`, `.timeBased().after(delay)`) a la demande; un one-shot deja declenche s'affiche `Desactive`, c'est son etat normal de fin de vie.
- Action: essayer `WCORE_CEX_TRIGGER_CLEANUP_FORCE()`, qui cible specifiquement les triggers CEX; si la desactivation revient, remonter l'erreur de creation au lieu de l'avaler et revoir la cadence d'une minute.

### P1-9 - Limite de scan authentifie trop permissive - RESOLU 2026-08-03/04

- `wcore-web/apps/api/src/config.ts:222` autorise par defaut 2 000 requetes scan/minute par IP authentifiee.
- Chaque requete peut couvrir jusqu'a 120 chaines et declencher RPC, discovery et pricing.
- Impact: un seul compte peut saturer les RPC gratuits et le budget fournisseur.
- Correction: le cout n'est plus compte en requetes mais en chain-checks. Budget `RATE_LIMIT_SCAN_CHAIN_CHECKS` (5 000, 1 000 en anonyme) preleve dans les trois handlers de scan via `consumeScanBudget` / `scanRequestCost`, ce qui facture une requete a la hauteur de ce qu'elle declenche reellement.
- Complement 2026-08-04 (P1-4): plafond de jobs simultanes par appelant, ce que cette action reclamait aussi.

## Findings P2

### Securite et exploitation

- Les comparaisons `x-gsheet-token` sont non constantes dans `plugins/cex.ts:427` et `plugins/gsheet.ts:865`, contrairement a `admin-auth.ts` et au relais.
- Le relais accepte encore `RELAY_TOKEN` en query string sur les endpoints legacy (`railway-relay/server.js:1367` et suivants), ce qui peut fuiter dans les logs/proxies.
- Le relais n'a pas de rate limit global; `POST /api/cex/accounts/:id/sync` tombe dans le catch-all API a 120/min.
- `ADMIN_TOKEN` n'est pas configure sur le service API Railway. Les routes admin restent fermees en 401, mais les operations admin legitimes sont indisponibles.
- RESOLU 2026-08-04 - `CEX_SECRET` est bien configure en production, mais le code retombait sur `JWT_SECRET` puis sur une constante publique. Les deux secrets tournent independamment: une rotation du JWT aurait rendu silencieusement indechiffrable chaque identifiant d'echange stocke. La production refuse desormais, ce qui desactive la seule fonction CEX au lieu de chiffrer avec une cle non voulue; les replis sont conserves hors production pour ne pas rendre illisibles les identifiants deja stockes en dev ou staging.
- Le Web sert HSTS et `nosniff`, mais pas de Content-Security-Policy; API et relais en servent une.
- Le message brut d'erreur CEX peut etre retourne et persiste (`plugins/cex.ts:560-562`).

### Production et RPC

- Un scan BASE public valide retourne 200 en 7,1 s avec 16 tokens prices, mais `degraded=true`: `base.drpc.org` repond 408 et `base-rpc.publicnode.com` 403 depuis Railway. Les deux endpoints suivants (`mainnet.base.org`, `1rpc.io/base`) repondent, de meme que `base.gateway.tenderly.co`.
- L'ordre actuel dans `wcore-gsheet/src/BASE.gs:18-21` place donc deux endpoints defaillants avant les endpoints sains.
- 128/464 endpoints ont echoue au sweep initial. Ce nombre inclut rate limits et timeouts sensibles a la concurrence; il mesure la fragilite du pool, pas 128 pannes permanentes.
- RESOLU 2026-08-04 - Les logs API ne joignaient ni le `chainKey` ni la methode aux messages repetes `all RPC endpoints failed`: les logs de production se remplissaient de lignes identiques sans moyen de savoir quelle chaine tombait.

### Performance et cout

- RESOLU 2026-08-04 - Le circuit breaker de scan comptait deux fois un meme echec, ouvrant deux fois plus vite que son seuil nominal. La route synchrone prelevait un echec dans son `catch`, puis le meme resultat placeholder repassait dans la boucle d'agregation. La decision vit maintenant dans un helper unique partage par les trois handlers, ce qui rend le double prelevement impossible plutot que corrige. Un scan qui signale des erreurs mais renvoie des donnees exploitables n'est deliberement compte ni en echec ni en succes.
- RESOLU 2026-08-04 - Delegations, unbondings et rewards Cosmos sont trois lectures REST independantes attendues en serie: une chaine dont l'endpoint est lent payait cette latence trois fois, le failover autorisant a lui seul 10 s par appel. Elles partent ensemble et partagent un helper de repli sur cache.
- RESOLU 2026-08-04 - Les caches non-EVM faisaient `A x C` lectures Redis. La route batch utilise desormais le meme `mget` unique que le chemin EVM.
- RESOLU 2026-08-04 - `getEurUsdRate()` etait appele sans le cache partage dans les routes scan, CEX et chains: ses quatre appels HTTP repartaient apres chaque redemarrage et n'etaient jamais partages entre instances.
- RESOLU 2026-08-04 (hors audit) - Les denominations IBC etaient resolues a chaque scan alors qu'un hash est le condense de sa trace et ne change jamais. Cout: un appel REST par jeton, et surtout une dependance du portefeuille entier a la disponibilite immediate de l'endpoint. Mises en cache 30 jours.
- RESOLU 2026-08-05 - Discovery EVM batch non bornee: chaque wallet emet jusqu'a 5 appels logs par topic de transfert, et tous les wallets partaient ensemble. Un batch de 20 adresses mettait donc 200 `eth_getLogs` simultanes sur un seul pool d'endpoints, ce a quoi les RPC gratuits repondent par des limitations plutot que par des donnees. Les wallets avancent desormais par petits groupes, la rafale reste bornee quelle que soit la taille du batch.
- RESOLU 2026-08-05 - Les metadonnees de contrats etaient resolues une par une: un wallet touchant cinquante contrats payait cinquante allers-retours RPC successifs avant la premiere lecture de solde. Les contrats sont dedupliques d'abord puis resolus par groupes bornes; les reserver des la deduplication evite aussi d'interroger deux fois un contrat repete dans les logs.
- Les prechargements DefiLlama et GeckoTerminal independants sont sequentiels dans les scans EVM.
- TON ignore `opts.sources` et GeckoTerminal conserve certains markers uniquement en memoire process.

### Comportement fonctionnel

- RESOLU 2026-08-04 - Un echec de `/api/gm/has-deployed` retournait `false`, donc un bouton Deploy etait propose a quelqu'un possedant deja un contrat. La fonction retourne l'etat inconnu (`null`) que ses deux appelants affichaient deja comme un chargement.
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
5. FAIT: API et Web deployes et verifies depuis la production.
6. FAIT: Apps Script pousse (250 fichiers) et verifie par relecture du projet distant: `WCORE_VERSION` 4.16.43, Somnia `5031` + `MAX_LOG_RANGE`, adaptateur Web Scan 4.16.43.
7. FAIT: P1-11 corrige et deploye. Somnia et Reya reviennent `degraded=false` sans aucune erreur.
8. RESTE: `CEX_MANUAL_REFRESH_WORKER` toujours desactive malgre un auto-heal force reussi, cf. P1-7.
9. RESTE: trancher le sort de `DUCKCHAIN`, `SYNDICATE_COMMONS` et `STARGAZE`, et trouver un endpoint Polynomial non limite depuis Railway.

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
