# Contexte des candidats Cloud — sécurité

Ce document suit les lots de sécurité publiés sur `cloud-ready/wcore-20261026`. Chaque section garde les preuves telles qu’elles ont été obtenues, avec leur environnement et leur commit ; une preuve ancienne n’est pas réattribuée à un commit plus récent.

La publication Git n’est pas un déploiement. **Aucun déploiement n’est autorisé par ce document.** Aucun secret, environnement de production, accès financier ni donnée personnelle ne doit être copié dans les documents Cloud. L’incident de fiabilité J1 reste **OPEN** ; ces changements de sécurité ne démontrent pas sa résolution.

## Historique de la branche

| Lot | Commit | Intégration | Contenu |
|---|---|---|---|
| A | `1790bf4`, `4f07618` | base de la branche | routes GSheet encodées, classification CSRF/rate-limit, `TRUST_PROXY` par adresse |
| PR #8 | `b948cd3` | `4ae6c0f` | classification des cibles en forme absolue et des fragments comme le routeur |
| PR #9 | `daa5c25` | `19db72e` | Next.js 16.4.3, sharp 0.35.5, source-map-js 1.2.2, traçage standalone borné |
| PR #11 | `4e0e856` | `682714b` | Fastify 5.12.7, fast-uri 3.1.9 (find-my-way inchangé en 9.7.0) |
| Zod 4 | voir la PR | en revue | Zod 3.25.76 → 4.6.7, contrat `expiresAt` conservé, borne Zerion avant validation |

## Lot A — preuves Windows (historique, base `8456014`)

Ce candidat corrige l’authentification des routes GSheet normalisées, leur classification par le serveur réel et la configuration de confiance des reverse proxies. Il ne migre aucune dépendance.

Prérequis : Node.js 24 (version effectivement testée : 24.14.1) et pnpm 10.34.4. Les preuves de ce lot ont été obtenues sous Windows uniquement. Depuis `wcore-web`, sans dotenv ni `.env` :

```powershell
$env:NODE_ENV='test'
$env:npm_config_ignore_scripts='true'
pnpm install --frozen-lockfile --ignore-scripts
```

Depuis `wcore-web/packages/db`, client Prisma seul, sans moteur ni connexion DB :

```powershell
$env:DATABASE_URL='postgresql://local:local@127.0.0.1:1/unused'
node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma --no-engine
```

Depuis `wcore-web/apps/api` :

```powershell
node --import tsx --test --test-reporter=tap --test-force-exit src/plugins/gsheet-auth.test.ts src/route-classification.test.ts src/config.test.ts src/config-trust-proxy.test.ts
```

Résultats observés alors : 245 tests réussis, aucun échec ni test ignoré ; typecheck et compilation API réussis ; fixture de classification à 10 réussites. Depuis PR #8, la fixture compte 13 cas et son wrapper exige `# pass 13` et `# fail 0`.

## Preuves Linux et Alpine des lots suivants

Environnement : Linux, Node.js 22.22.0, pnpm 10.34.4, PostgreSQL 16 et Redis 7 temporaires, locaux et arrêtés après usage.

- **PR #8 (`b948cd3`)** : tests RED sur vraie socket TCP (cible absolue → 400 au lieu de 403 ; fragment → 401 au lieu de 429), puis GREEN. Fuzz différentiel routeur ↔ classification : 2 376 cibles, 538 routées, 0 écart.
- **PR #9 (`daa5c25`)** : Web 256/256, Shared 74/74, E2E critiques 7/7 au premier essai, build sans avertissement de traçage. Image `wcore-web/apps/web/Dockerfile.railway` construite et exécutée sous `node:22-alpine` (digest `sha256:fe4f6d74…`) : healthcheck, routes, `/_next/image` (local et hôtes autorisés optimisés, hôtes interdits, métadonnées cloud et loopback refusés en 400), même inventaire applicatif de 292 fichiers que la base, aucun `.env`, aucune source ni test. Cette image a été construite avec une CA de proxy propre au sandbox, absente d’un build réel.
- **PR #11 (`3280d67`, arbre identique à `4e0e856`)** : sécurité 245/245, fixture 13/13, fuzz 0 écart, suite API 867 ok / 0 échec / 19 annulés / 1 ignoré.
- **Zod 4 (cette PR)** : voir la description de la PR pour les commandes et les résultats exacts.

## Limites connues

- La CI GitHub reste rouge pour des causes antérieures à ces lots : tests Core DEGEN et Superposition, tests `portfolio-enrichment` (Zerion) annulés, `graph-artifact-guard`, Playwright 1.59.1 non pris en charge sur `ubuntu26.04`. Comme les tests Core échouent, la CI saute les tests Web et le build Next ; ces étapes ne sont validées que par les exécutions locales ci-dessus.
- Lancés ensemble avec `--test-force-exit`, les fichiers de test API peuvent perdre une partie de leur sortie TAP : des tests disparaissent du rapport sans être ni réussis ni échoués. Un décompte fiable s’obtient fichier par fichier.
- `wcore-web/apps/web/Dockerfile`, utilisé avec le contexte `wcore-web/`, ne se construit pas (`@wcore/chains` hors contexte). Le déploiement utilise `Dockerfile.railway`.
- `getCoverageStats()` utilise à l’exécution la constante de repli 159, car le registre des chaînes n’est pas copié dans l’image runner.
- `corepack prepare pnpm@10` résout pnpm 10.34.9 dans les images, et non la version 10.34.4 de `packageManager`.
- La topologie proxy de production, les services externes, le déploiement Railway et la résolution de J1 ne sont pas validés. Voir `TRUST_PROXY_SECURITY.md` avant toute préparation opérationnelle séparément autorisée.
