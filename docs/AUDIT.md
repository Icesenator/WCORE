# WCORE - Audit transversal

> Date de verification: 2026-08-06
> Revision fonctionnelle auditee: `76fc4c82c159f242858c9be6ed63c6963203e666`; les correctifs de la seconde vague vont jusqu'a `8cd7fc5` et sont consignes dans "Findings du 2026-08-06".
> Perimetre: depot racine, Web, API, relais CEX, package `@wcore/chains`, Apps Script, CI, Railway, dependances, documentation et controles RPC non destructifs.
> Methode: inspection statique parallele, reconciliation de l'audit du 2026-07-16, tests/builds locaux, controles HTTP publics, inspection Railway, lecture du classeur, inspection des triggers/executions Apps Script et sondage direct des endpoints configures. Aucun secret n'a ete affiche ou copie.
> Suivi: les corrections fonctionnelles ont ete appliquees, verifiees, commitees et poussees. Apps Script 4.16.57, l'API `9a40ebd0-a375-4cf2-b126-f8d966dbde6d` et le Web `53b384d1-532d-4976-868d-4d47e7e44ca1` sont deployes. Les constats corriges sont marques RESOLU ci-dessous.

## Resume executif

WCORE compile, passe ses suites locales et sert correctement ses trois services. La CI GitHub est verte, les dependances ne remontent aucune vulnerabilite connue, CORS/CSRF et les routes sensibles testees echouent ferme. Aucun P0 n'a ete confirme.

Les quatre invariants critiques releves le 3 aout sont corriges ou explicitement contenus: Somnia utilise le bon chainId, les trois chaines sans endpoint viable sont desactivees, l'annulation traverse les moteurs et le store async est borne, et l'historique Prisma est reconstructible. La persistance Redis et le claim atomique des jobs restent requis avant tout passage de l'API a plusieurs repliques. `POLYNOMIAL` reste limitee par des HTTP 429 depuis Railway.

## Etat mesure

| Axe | Resultat au 2026-08-06 |
|---|---|
| Git | `master` et `origin/master` synchronises; worktree propre apres publication |
| GitHub Actions | corrections finales poussees sur `master`; validations locales completes |
| Railway | API `9a40ebd0`, Web `53b384d1` et relais `Online`; derniers deploys cibles `SUCCESS` |
| Production | Web/API/relais en HTTP 200 avec HSTS et CSP |
| Chaines API | 182 configurations; `DUCKCHAIN`, `STARGAZE` et `SYNDICATE_COMMONS` desactivees en plus des exclusions existantes |
| RPC uniques actifs lors du sweep initial | 13, dont `SYNDICATE_COMMONS`, desactivee depuis |
| Sweep RPC initial | 464 endpoints testes; 336 reponses valides, 128 echecs avec timeout 5 s/concurrence 24 |
| Reprise ciblee | 34 endpoints sur 18 chaines, timeout 10 s/concurrence 4; 16 valides, 18 en echec |
| Apps Script | worker CEX recree; executions de nettoyage puis d'auto-heal force chargees `Terminee` |
| Apps Script runtime | `WCORE_VERSION` et package genere en `4.16.57`; projet distant pousse et triggers verifies |
| Lint | passe, 0 erreur affichee |
| TypeScript | typecheck des 5 projets passe |
| Build | packages, API et Next.js 16.2.12 passent |
| Tests Core | 322/322 |
| Tests Shared | 21/21 |
| Tests Web | 173/173 |
| Tests relais | 37/37 |
| Tests GSheet | passent; 3 145 fonctions globales validees; ports Phase 3: 181 |
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

### P1-2 - Couverture active superieure a la couverture reellement scannable - RESOLU 2026-08-05

- Production expose 171 chaines actives. La reprise ciblee confirmait six chaines sans endpoint utilisable depuis cette machine: `DUCKCHAIN`, `NOBLE`, `POLYNOMIAL`, `STARGAZE`, `STRIDE`, `SYNDICATE_COMMONS`.
- **Corrige**: `POLYNOMIAL` (deux miroirs thirdweb verifies sur le chainId 8008 ajoutes devant les deux endpoints morts), `NOBLE` (publicnode repond 404 sur *toutes* les routes de module; failover `REST_URLS` ajoute) et `STRIDE` (publicnode repond 403 `unsupported platform`; meme traitement). Les endpoints ajoutes ont ete verifies sur les routes `bank` et `staking` reellement utilisees par le moteur, pas seulement sur le dernier bloc.
- **Decision finale**: `DUCKCHAIN` (ses deux RPC publies sont morts), `SYNDICATE_COMMONS` (aucun endpoint public de remplacement) et `STARGAZE` (statut `killed` dans Cosmos Chain Registry) portent desormais `FLAGS.DISABLE_CHAIN: true`. La factory GM DuckChain a aussi ete retiree du registre actif.
- Limite: les blocages RPC peuvent dependre de l'IP. Les endpoints defaillants sont retrogrades et non supprimes, sauf mauvaise chaine (cf. P1-10).
- Verification: `@wcore/chains` regenere en 4.16.49; l'API de production sert toujours 182 configurations et respecte les nouveaux drapeaux. `POLYNOMIAL` reste active mais degradee par des HTTP 429 depuis Railway.

### P1-3 - Les timeouts liberent les slots sans annuler les scans - RESOLU 2026-08-04

- Preuve: `wcore-web/apps/api/src/plugins/scan.ts:152-176,368-398,453-465,578-647` cree un `AbortSignal`, mais les moteurs appeles via `packages/core/src/engines/dispatch.ts:42-58` ne propagent pas l'annulation de bout en bout.
- Impact: apres timeout, les appels RPC/pricing continuent, le slot `p-limit` est reutilise et la concurrence reelle depasse les bornes configurees.
- Correction: le signal traverse desormais `dispatcher.ts` puis `client.ts` jusqu'au `fetch`, sur EVM scan/batch, SVM, Cosmos et TON. Helper partage `packages/core/src/abort.ts` (`linkAbortSignal`). Le client detache son ecouteur quand l'appel se termine: un signal de scan est partage par des centaines d'appels.
- Verification: 8 tests (`packages/core/src/abort.test.ts`), chacun valide par mutation du code de production. Deux passaient d'abord pour de mauvaises raisons - `AbortSignal` n'expose pas `listenerCount` (assertion silencieusement sautee, corrigee via `node:events`), et un rejet obtenu par le timeout de 60 s et non par l'annulation (corrige par une borne de promptitude).
- Verification production: scan 6 chaines, 372 tokens, aucune erreur d'annulation; `SOMNIA` et `REYA` restent `degraded=false`.

### P1-4 - Jobs async non bornes et non persistants - PARTIELLEMENT RESOLU 2026-08-04

- Preuve initiale: `wcore-web/apps/api/src/plugins/scan-job.ts:23` utilisait un `Map` process-local sans limite globale ou par utilisateur/IP.
- Avant correction, les gardes TTL marquaient les jobs en erreur mais n'arretaient pas les moteurs deja lances.
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
- Verification finale 2026-08-05: Apps Script 4.16.49 pousse, puis `WCORE_AUTO_HEAL_FORCE()` execute avec succes. La surveillance de staleness et la recreation ciblee constituent desormais le mecanisme de reprise.

### P1-9 - Limite de scan authentifie trop permissive - RESOLU 2026-08-03/04

- `wcore-web/apps/api/src/config.ts:222` autorise par defaut 2 000 requetes scan/minute par IP authentifiee.
- Chaque requete peut couvrir jusqu'a 120 chaines et declencher RPC, discovery et pricing.
- Impact: un seul compte peut saturer les RPC gratuits et le budget fournisseur.
- Correction: le cout n'est plus compte en requetes mais en chain-checks. Budget `RATE_LIMIT_SCAN_CHAIN_CHECKS` (5 000, 1 000 en anonyme) preleve dans les trois handlers de scan via `consumeScanBudget` / `scanRequestCost`, ce qui facture une requete a la hauteur de ce qu'elle declenche reellement.
- Complement 2026-08-04 (P1-4): plafond de jobs simultanes par appelant, ce que cette action reclamait aussi.

## Findings P2

### Securite et exploitation

- RESOLU 2026-08-03 - Les comparaisons `x-gsheet-token` etaient non constantes dans `plugins/cex.ts` et `plugins/gsheet.ts`; elles passent desormais par `safeEq`, comme `admin-auth.ts` et le relais.
- RESOLU 2026-08-03 - Le relais acceptait `RELAY_TOKEN` en query string, ce qui fuit dans les logs et les proxies. L'en-tete `x-relay-token` est prefere et la query devient opt-in **par endpoint** (`readRelayToken(req, allowQueryToken)`), fidele a l'existant: 10 endpoints legacy la gardent, 2 non. Les 5 appelants Apps Script sont passes a l'en-tete.
- RESOLU 2026-08-03 - Le relais n'avait aucun rate limit global: `relayRateLimit()` plafonne desormais par IP (600/min, `trust proxy` = 1, `/health` exempte).
- RESOLU 2026-08-05 - `ADMIN_TOKEN` n'etait pas configure sur le service API: les routes admin repondaient 401 et aucune operation admin n'etait possible. Un jeton aleatoire de 48 caracteres a ete pose dans Railway (jamais affiche). Verifie en production: 401 sans jeton, 200 avec.
- RESOLU 2026-08-04 - `CEX_SECRET` est bien configure en production, mais le code retombait sur `JWT_SECRET` puis sur une constante publique. Les deux secrets tournent independamment: une rotation du JWT aurait rendu silencieusement indechiffrable chaque identifiant d'echange stocke. La production refuse desormais, ce qui desactive la seule fonction CEX au lieu de chiffrer avec une cle non voulue; les replis sont conserves hors production pour ne pas rendre illisibles les identifiants deja stockes en dev ou staging.
- RESOLU 2026-08-03 - Le Web ne servait pas de Content-Security-Policy. Verifie en production: `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` plus `Cross-Origin-Opener-Policy: same-origin-allow-popups`. `script-src`, `connect-src` et `img-src` sont volontairement omis: les poser sans inventaire complet casserait les wallets injectes et les CDN de logos.
- RESOLU 2026-08-03 - Le message brut d'erreur CEX pouvait etre retourne et persiste. Il passe par `describeCexSyncFailure`, qui le classe; le detail brut ne subsiste que dans le log serveur.

### Production et RPC

- RESOLU 2026-08-03 - Un scan BASE valide revenait `degraded=true` parce que `base.drpc.org` repond 408 et `base-rpc.publicnode.com` 403 depuis Railway.
- RESOLU 2026-08-03 - L'ordre plachait ces deux endpoints defaillants avant les sains. Ils sont **retrogrades** en fin de liste et non supprimes: un blocage lie a l'IP peut ne pas s'appliquer depuis Apps Script, qui partage la meme config.
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
- RESOLU 2026-08-05 - Les prechargements DefiLlama et GeckoTerminal sont deux recherches independantes d'un seul appel chacune, attendues l'une apres l'autre: chaque scan EVM payait les deux latences a la suite. Elles partent ensemble et leurs resultats sont appliques dans l'ordre d'origine, donc GeckoTerminal garde la priorite sur DefiLlama pour un contrat que les deux valorisent. Chacune conserve son propre `catch`: l'echec d'un lot ne degrade que sa source.
- RESOLU 2026-08-05 - TON declarait `opts.sources` dans ses options sans jamais le lire: un appelant qui injectait un jeu de sources recevait silencieusement les sources internes, contrairement a tous les autres moteurs. Meme forme de defaut qu'une garde jamais appelee.
- RESOLU 2026-08-05 - Les reconstructions TON GeckoTerminal/OnchainV3 utilisent `opts.sharedPriceCache`; l'enrichissement Chainbase staking utilise `RedisPricingCache` lorsqu'un cache est fourni. Les markers de pricing concernes sont donc partages entre processus/instances via le cache configure.

### Comportement fonctionnel

- RESOLU 2026-08-04 - Un echec de `/api/gm/has-deployed` retournait `false`, donc un bouton Deploy etait propose a quelqu'un possedant deja un contrat. La fonction retourne l'etat inconnu (`null`) que ses deux appelants affichaient deja comme un chargement.
- RESOLU 2026-08-05 - La page GM ne precharge plus le prix natif des factories. Le prix n'est demande qu'au moment de l'action utilisateur; `gm-price-fanout.test.ts` interdit le retour du fan-out.
- RESOLU 2026-08-05 - Le cache wallet conserve et relit les entrees positives au-dela du TTL lorsque le pruning les preserve. Les formats compact et historique sont testes; les entrees zero continuent d'expirer.
- RESOLU 2026-08-05 - `dist/package.json` restait en `4.15.50` alors que les configs qu'il embarque etaient passees a `4.16.47`. Ce n'est pas que cosmetique: `@wcore/chains` est consomme par une dependance `file:` que pnpm materialise en copie figee dans son store, donc une version immobile ne donne aux consommateurs aucun signal de changement de config. L'extracteur l'ecrit desormais depuis `WCORE_VERSION`, et un test de garde echoue si les deux divergent a nouveau. Les versions de modules (`GSHEET_WEB_SCAN_VERSION`, etc.) restent independantes par conception du ModuleRegistry.

## Findings du 2026-08-06 - mecanismes definis mais jamais declenches

Cinq defauts trouves en tirant un seul fil, celui d'une cellule `B1` en erreur. Ils
partagent tous la meme signature, deja rencontree avec `assertNoDnsRebind` (P1-6):
**du code correct que personne n'appelle**. Rien n'echoue, aucune alerte ne se leve,
le systeme sert simplement une information fausse ou figee, en silence.

- RESOLU 2026-08-06 - `Portefeuille Action` parsait le JSON **apres** sa boucle de retry, la ou `Portefeuille Crypto` le parsait dedans. Une reponse HTTP 200 vide ou tronquee n'etait donc jamais reessayee et remontait telle quelle en `B1` (`ERROR: Unexpected end of JSON input`). Les deux chemins sont symetriques et testes sur corps vide, JSON tronque et statut HTTP authentique.
- RESOLU 2026-08-06 - L'alerte "DONNEES FIGEES" se declenchait a 2 h alors que `WATCHDOG_FROM_RECAP` ne repulse une feuille saine qu'au-dela de `WD_STALE_I1_HOURS` (5 h). Toute feuille valide etait donc signalee entre 2 h et 5 h, **par construction et non par accident**. Le seuil est desormais derive de cette constante, avec marge, pour que les deux ne puissent plus diverger.
- RESOLU 2026-08-06 - `cache.updatedAt` est rendu par `_fromEpochSec_` sous forme de **chaine**, mais `Format.datetime` exige un nombre (`Num.isValid` teste `typeof`). Les appelants testaient la valeur en truthy — une chaine passe — puis la formataient: le statut devenait `[CACHE_ONLY] [FRESH] N/A`. Un statut sans horodatage n'est pas qu'illisible, il est **non parsable par le watchdog**, qui extrait une date de `I1` pour planifier. Observe sur `Ledger - Degen`.
- RESOLU 2026-08-06 - `FLAGS.DISABLE_CHAIN` etait declare dans 14 configs **sans aucun lecteur cote Apps Script**: le drapeau n'agissait que sur `/api/chains`. Les onglets Ledger de ces chaines restaient pulses, et chaque pulse declenche un appel HTTP alors qu'aucun scan ne peut aboutir. Mesure sur `Ledger - DuckChain`: re-pulse a 13:45:55 puis 15:36:00, boucle entretenue par `[WEB_SCAN_PRESERVED]` qui force `needsPulse` sans condition. Statut terminal `[CHAIN_DISABLED]` ajoute, lu par les trois moteurs et respecte par le watchdog.
- RESOLU 2026-08-06 - Le store de RPC dynamiques annonce "TTL: 30 days (auto-expires if trigger stops running)" et suppose un trigger hebdomadaire **qui n'avait jamais ete installe**. `DYNAMIC_RPC_STATUS` renvoyait `EMPTY`: WCORE tournait depuis au moins un mois sur les seuls endpoints codes en dur, sans jamais decouvrir les nouveaux ni ecarter les morts. Premiere execution apres correction: **284 endpoints sur 106 chaines, dont 15 ecartes** parce qu'ils ne repondaient plus.

Repartition des horodatages clarifiee au passage: `I1`/`J1` datent la **tentative**
(J1 est le latch qui declenche le recalcul de `A1`; un latch figé empeche la ligne
`ERROR` d'etre reactualisee), tandis que l'age reel de la donnee appartient a la
ligne `ERROR`. Seul `[CACHE_ONLY]` conserve la date de la **donnee**, car la regle
de re-pulse v4.16.46 compare `B1` a cette date pour detecter un cache servi en boucle.

Incident introduit puis corrige le meme jour: `everyWeeks(1)` sans `onWeekDay()` est
rejete par GAS. L'exception interrompait `_wcoreAutoHealCreateManagedTriggers_`, donc
les triggers declares **apres** n'etaient pas recrees apres leur suppression
(`CEX_MANUAL_REFRESH_WORKER`, `LEDGER_ON_CHANGE`, `MASTER_ON_EDIT`). Detecte
immediatement en production, corrige, six declencheurs verifies presents. La creation
de ce trigger est desormais isolee par un `try/catch` qui remonte l'erreur dans
`stats`: un rafraichissement mensuel ne doit pas pouvoir bloquer des triggers
critiques. Un test statique ne pouvait pas voir ce defaut — il lisait du texte, pas
une execution.

Reste ouvert: `DEGEN` n'a plus qu'un endpoint au registre officiel
(`chainid.network`, chaine `incubating`), en HTTP 429 permanent depuis deux IP
distinctes. Les deux autres ont ete retires apres mesure sur `eth_chainId`,
`eth_blockNumber` et `eth_getBalance` — `degen.drpc.org` en 404 partout,
`666666666.rpc.thirdweb.com` servant le bon chainId mais refusant les methodes
utiles. Effet verifie en production: 6 erreurs de scan ramenees a 3. La chaine reste
active et son cache protege; seul un endpoint utilisable la debloquera.

### Findings API du 2026-08-06 - observabilite RPC

- RESOLU - Le cache des endpoints dynamiques API expirait apres 6 h alors que `warmDynamicRpcEndpoints()` n'etait appele qu'au demarrage. Un processus vivant plus de 6 h revenait donc silencieusement aux seuls endpoints statiques. Le warm est maintenant rejoue toutes les 5 h, avant le TTL, et son echec reste non bloquant.
- RESOLU - La classification d'erreurs utilisait notamment `includes("RPC")`, sensible a la casse. `https://rpc.degen.tips: HTTP 429` et `blockNumber unavailable on every endpoint` etaient classes `other`; une erreur mentionnant a la fois un prix et un fetch pouvait aussi alimenter deux categories. `classifyScanError()` impose maintenant une categorie exclusive. La premiere verification production a rendu DEGEN `rpc=36, pricing=0, other=0`.
- RESOLU - Ce premier total de 36 etait lui-meme double: `recordScan()` ajoutait les erreurs aux totaux, puis `recordRpcError()` ajoutait les memes une seconde fois pour conserver leurs echantillons. Les responsabilites sont separees. Verification production apres redemarrage: trois scans avec trois erreurs chacun donnent exactement `rpc=9`.
- RESOLU - Le premier detecteur `chain_unreachable` exigeait `tokensFound=0`. Or WCORE preserve justement le cache en panne et `buildChainScan()` compte toujours le natif: DEGEN remontait un token conserve, donc l'alerte ne pouvait jamais se lever. Chaque scan compte desormais separement le marqueur strict `unavailable on every endpoint` / `all RPC endpoints failed`, independamment du cache. Les circuits `OPEN` restent un signal suffisant.
- Verification bout en bout: trois scans forces DEGEN ont remonte le meme echec total, puis le snapshot suivant a persiste un unique `opsEvent` `chain_unreachable` (`scans=3`, `rpcErrors=9`, `circuitOpen=false`) le 2026-08-06 a 17:03:32 UTC. L'evenement est consultable sur `/api/admin/events`; l'ancien commentaire `/api/admin/health` pointait une route inexistante et a ete corrige.
- LIMITE - `ALERT_WEBHOOK_URL` n'est pas configure sur l'API Railway. `sendAlert()` est donc volontairement un no-op et aucune notification ne quitte encore Railway. Le log et l'`opsEvent` persistant constituent les canaux disponibles jusqu'a fourniture d'une URL de webhook.

## Findings P3 et dette documentaire

- RESOLU 2026-08-05 - La documentation figeait 183 chaines et une version Apps Script trois correctifs en retard. Ces phrases pointent desormais vers les sources de verite (`dist/chains` et `WCORE_VERSION`) au lieu de recopier des valeurs qui perimen au commit suivant.
- RESOLU 2026-08-05 - Le site public annoncait 183 chaines alors que le registre et `/api/chains` en livrent 182, et le test de garde epinglait le meme litteral: la derive etait verrouillee au lieu d'etre detectee. Le test lit maintenant le compte depuis le registre et refuse toute page qui en annonce un autre. Verifie en production: 182 partout.
- RESOLU 2026-08-05 - La documentation CEX decrit les triggers Bitpanda/Bitfinex/Kraken horaires et `UPDATE_CEX_RELAY_ROTATION()` toutes les 15 minutes. L'ancien `CEX_HOURLY_REFRESH` central est documente comme supprime.
- RESOLU 2026-08-05 - `.env.production.template` et `DEPLOY.md` annoncaient `RATE_LIMIT_SCAN=60` alors que la variable n'est pas definie en production, qui tourne donc au defaut de 2 000. Abaisser la limite a ete ecarte: un scan profond emet legitimement de nombreuses requetes de job, et la borne utile est desormais le budget en chain-checks, qui facture une requete a hauteur du travail declenche.
- RESOLU 2026-08-05 - `.env.production.template` couvre les limites de scan/GM, concurrences, caches, timeouts et TTL de jobs. Les secrets restent declares sans valeur.
- RESOLU 2026-08-05 - `DEPLOY.md` decrit desormais les trois services Railway, `cex-relay` compris.
- RESOLU 2026-08-05 - Ce n'etait pas documentaire: `getExplorerUrl` renvoyait `null`, donc un utilisateur venant de deployer un contrat voyait son adresse sans lien pour la verifier. Un test de garde exigeant qu'une chaine a factory resolve un lien en a trouve **dix** et non sept: `kaia`, `pulsechain` et `kcc` manquaient aussi. Deux d'entre elles annoncent un explorateur mort dans leur config (`kaiascope.com` repond 404, `explorer.kcc.io` ne resout plus), remplaces par `kaiascan.io` et `scan.kcc.io`. Chaque URL a ete verifiee contre une adresse reelle.
- RESOLU 2026-08-05 - `wcore-web/AGENTS.md` et `ROADMAP.md` presentent Coinbase et OKX comme actifs; le document transversal couvre les sept CEX.
- RESOLU 2026-08-05 - Les trois dependances n'ont aucun import dans le monorepo et sont retirees. `@cosmjs/crypto` et `@cosmjs/encoding` sont conservees: `auth.ts` derive les adresses Cosmos avec elles.
- RESOLU 2026-08-05 - `pnpm dev` lance `src/dev.ts`, qui applique `NODE_ENV=development` seulement lorsqu'il est absent; le comportement local rejoint `.env.example` sans ecraser un environnement explicite.
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
| Alerte RPC morte | `chain_unreachable` persiste pour DEGEN apres 3 scans; 9 erreurs, aucun double comptage |

## Priorites recommandees

### Sprint 0 - integrite immediate

1. FAIT: Somnia corrige, `dist/` regenere, valeur epinglee par un test.
2. FAIT: Polynomial, Noble et Stride repares; BASE reordonne; endpoint testnet de Reya supprime.
3. FAIT: migrations Prisma reconstructibles + job CI sur base vierge.
4. FAIT: garde-fou planifie `Chain IDs` contre la derive de chainId.
5. FAIT: API et Web deployes et verifies depuis la production. `/gm` n'affiche plus DuckChain ni Syndicate Commons.
6. FAIT: Apps Script pousse et auto-heal force; `WCORE_VERSION` et package genere en 4.16.49.
7. FAIT: P1-11 corrige et deploye. Somnia et Reya reviennent `degraded=false` sans aucune erreur.
8. FAIT: `CEX_MANUAL_REFRESH_WORKER` recree, surveillance de staleness ajoutee et auto-heal final execute.
9. FAIT: `DUCKCHAIN`, `SYNDICATE_COMMONS` et `STARGAZE` desactivees. RESTE: trouver un endpoint Polynomial non limite depuis Railway.

### Sprint 1 - resilience et securite

1. FAIT: annulation propagee et jobs async bornes. RESTE avant multi-replique: persistance Redis et claim atomique.
2. FAIT: protection DNS rebinding branchee sur les fetches GM.
3. FAIT: budget scan pondere, plafonds de jobs et rate limit relais.
4. FAIT: en-tetes privilegies et comparaisons constantes; query legacy limitee aux endpoints explicitement compatibles.

### Sprint 2 - coherence

1. FAIT: contrats Cosmos/SVM/queue CEX corriges et testes.
2. FAIT: versions, compte de chaines, triggers CEX et template d'environnement alignes.
3. FAIT pour les chainIds et le signal de chaine injoignable depuis Railway; RESTE: configurer un webhook externe si une notification hors plateforme est souhaitee.
4. FAIT pour les fan-outs identifies; poursuivre la surveillance du cout RPC en production.

## Limites

- Les tests API integration n'ont pas ete executes localement faute de DB/Redis de test dedies; ils ne doivent jamais viser la production.
- Le sweep RPC a ete lance depuis une seule machine. Des restrictions geographiques, IP ou rate limits peuvent produire des resultats differents depuis Google Apps Script et Railway.
- Les taux d'erreur Apps Script sont ceux affiches par Google sur la fenetre de son interface; les executions recentes visibles etaient terminees, sans detail historique complet exporte.
- Aucun scan exhaustif de wallets ni mutation destructive du classeur n'a ete effectue. Les deploiements et executions Apps Script mentionnes ont ete limites aux correctifs et controles decrits.
