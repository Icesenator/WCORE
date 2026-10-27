# Migration Railway : Config as Code → Infrastructure as Code

Date : 26 octobre 2026. Statut : **brouillon, rien n'est appliqué**. Aucune commande `railway config apply`, `railway config migrate --apply` ni modification de service n'est autorisée par ce document.

## Échéance

Sources officielles : [Config as Code](https://docs.railway.com/config-as-code), [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code), [référence IaC](https://docs.railway.com/infrastructure-as-code/reference).

- Config as Code (`railway.json` / `railway.toml`) est déprécié.
- Les services qui l'utilisent déjà continuent de le lire **jusqu'au 2026-12-01**, date de coupure définitive.
- Un nouveau service ne peut pas l'adopter.
- Le remplaçant est `.railway/railway.ts`, appliqué par la CLI : `railway config plan` est en lecture seule, `railway config apply` modifie Railway. Railway ne lit pas `.railway/` pendant un déploiement.
- Un plan est bloqué pour un service encore géré par Config as Code : il faut d'abord le migrer.

## Ce qui en dépend aujourd'hui

`wcore-web/scripts/railway-deploy.mjs` écrit dans l'upload le `railway.json` du service (`wcore-web/railway/<service>.json`). C'est ce fichier qui choisit le Dockerfile, les watch patterns et le healthcheck. À partir du 2026-12-01, Railway l'ignore : le Dockerfile utilisé devient celui réglé sur le service. Le déployeur refuse donc de publier à partir de cette date (`E_CONFIG_SOURCE`) tant que `configSource` vaut `config-as-code` dans `wcore-web/railway/deploy-manifest.json`.

Les fichiers `wcore-web/railway/*.json` sont une solution **transitoire**, valable jusqu'au 2026-11-30 inclus et uniquement pour des services qui lisent déjà Config as Code.

## Éligibilité legacy (à attester par l'opérateur, en lecture seule)

Un service est éligible au chemin transitoire s'il lit déjà Config as Code. Ce point n'est pas observable depuis le dépôt. Indice : l'historique (`AGENTS-ARCHIVE.md`, incidents de mai et août 2026) montre que `railway up` appliquait le `dockerfilePath` et les `watchPatterns` du `railway.json` envoyé, ce qui n'arrive qu'avec Config as Code. L'opérateur confirme service par service dans le tableau de bord (réglages Build/Deploy marqués comme venant du fichier de config). Un service non éligible ne doit pas être déployé avec ce chemin.

## Paramètres comparés

| Service | Paramètre | Config as Code actuel | IaC (`railway.draft.ts`) |
|---|---|---|---|
| api | builder | `DOCKERFILE` | à reprendre de `railway config pull` (non documenté) |
| api | dockerfilePath | `wcore-web/apps/api/Dockerfile.railway` | idem |
| api | watchPatterns | `wcore-web/railway/api.json`, `wcore-gsheet/dist/**`, `wcore-web/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml,tsconfig.base.json}`, `wcore-web/packages/{shared,core,db}/**`, `wcore-web/apps/api/**` | idem |
| api | healthcheck | `/health`, 120 s | `healthcheck: "/health"`, `healthcheckTimeout: 120` |
| web | builder / dockerfilePath | `DOCKERFILE`, `wcore-web/apps/web/Dockerfile.railway` | à reprendre de `railway config pull` |
| web | watchPatterns | `wcore-web/railway/web.json`, `wcore-gsheet/dist/**`, fichiers racine `wcore-web`, `wcore-web/packages/{shared,core}/**`, `wcore-web/apps/web/**` | idem |
| web | healthcheck | `/healthz`, 120 s | `healthcheck: "/healthz"`, `healthcheckTimeout: 120` |
| cex-relay | builder / dockerfilePath | `DOCKERFILE`, `wcore-gsheet/railway-relay/Dockerfile` | à reprendre de `railway config pull` |
| cex-relay | watchPatterns | `wcore-web/railway/cex-relay.json`, `wcore-gsheet/railway-relay/**` | idem |
| cex-relay | healthcheck | aucun | aucun |
| tous | variables, secrets, domaines, réplicas | tableau de bord | **non déclarés** : hors du partial |

Le contexte de build est la racine du dépôt pour les trois services (le `railway up --path-as-root` actuel). Le root directory réel côté Railway est à relever par l'opérateur.

## Périmètre et propriété

Le brouillon déclare un partial nommé `wcore-root` qui ne contient que `api`, `web` et `cex-relay`. Un partial ne gère que les ressources qu'il déclare : PostgreSQL, Redis, volumes, les autres services (relais RPC, etc.), variables et secrets restent hors du fichier. `cex-relay` est construit depuis `wcore-gsheet/railway-relay` : l'inclure dans ce partial est un choix de propriété à confirmer (sinon, le retirer et le confier à son propriétaire).

## Protocole de prévisualisation (sans écriture sur Railway)

Sur un checkout propre, jamais le workspace OpenCode, avec une session CLI **neuve** (l'ancienne session exposée doit être révoquée) :

1. `railway link` vers le projet et l'environnement visés (staging d'abord).
2. `railway config pull` : écrit `.railway/railway.ts` localement à partir de l'état réel. Lecture seule côté Railway.
3. Comparer ce fichier au brouillon et au tableau ci-dessus ; reporter les champs build (Dockerfile, watch patterns, root directory) tels que la CLI les écrit ; garder le partial limité aux trois services.
4. `railway config plan` : lecture seule ; les valeurs des variables restent masquées sans `--show-values` (ne pas l'utiliser). Le plan attendu ne modifie que les trois services et seulement les champs du tableau.
5. Archiver le plan, sans secret, et le faire valider. `apply` est une étape distincte soumise à autorisation.

## Réversibilité

- Avant toute application : le fichier produit par `railway config pull` est la photographie de l'état antérieur, à conserver.
- Tant que rien n'est appliqué, rien n'est à défaire.
- Après une application autorisée, revenir en arrière consiste à appliquer de nouveau la photographie antérieure. Un retour à Config as Code n'est pas possible après la coupure ; avant, il n'est pas documenté par Railway : ne pas en dépendre.
- Côté dépôt, passer `configSource` à une valeur IaC dans le manifeste n'est à faire qu'après l'application, avec un test de parité entre `.railway/railway.ts` et les Dockerfiles.

## Propriétaire et échéance

- Propriétaire proposé : session Cloud pour la préparation et les tests, opérateur pour `pull`, `plan` et l'application.
- Échéance : plan validé en staging avant le **2026-11-20**, application autorisée avant le **2026-11-27**, laissant une marge avant la coupure du 2026-12-01.
