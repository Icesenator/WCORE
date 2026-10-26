# Contexte du candidat Cloud — lot sécurité A

Date : 26 octobre 2026. Base publique : `8456014391009760a3a0d85529777bde180b8d5f`.

## Périmètre

Ce candidat corrige l’authentification des routes GSheet normalisées, leur classification par le serveur réel et la configuration de confiance des reverse proxies. Il comprend les tests correspondants et des commentaires de configuration. Il ne migre aucune dépendance.

La publication Git n’est pas un déploiement. **Aucun déploiement n’est autorisé par ce document.** Aucun secret, environnement de production, accès financier ni donnée personnelle ne doit être copié dans les documents Cloud. L’incident de fiabilité J1 reste **OPEN** ; ces changements de sécurité ne démontrent pas sa résolution.

## Vérifications locales reproductibles

Prérequis : Node.js 24 (version effectivement testée : 24.14.1) et pnpm 10.34.4 (comme le build Docker). Node.js 22.13+ dans la branche 22 satisfait aussi les prérequis de module mocks et du lockfile, mais n’a pas été testé ici ; Node.js 20 n’est pas une cible de reproduction de ces tests. Les preuves de cette session sont obtenues sous Windows uniquement ; Linux n’a pas été exécuté. Depuis `wcore-web`, utiliser un environnement de test propre, sans charger dotenv ni un fichier `.env` :

```powershell
$env:NODE_ENV='test'
$env:npm_config_ignore_scripts='true'
pnpm install --frozen-lockfile --ignore-scripts
```

Depuis `wcore-web/packages/db`, générer uniquement le client Prisma, sans moteur ni connexion DB :

```powershell
$env:DATABASE_URL='postgresql://local:local@127.0.0.1:1/unused'
node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma --no-engine
```

Depuis `wcore-web/apps/api` :

```powershell
node --import tsx --test --test-reporter=tap --test-force-exit src/plugins/gsheet-auth.test.ts src/route-classification.test.ts src/config.test.ts src/config-trust-proxy.test.ts
```

Depuis `wcore-web` :

```powershell
pnpm --filter @wcore/api exec tsc --noEmit
pnpm --filter @wcore/api exec tsc
```

Résultats observés : 245 tests réussis, aucun échec ni test ignoré ; typecheck et compilation API réussis. Le wrapper de classification exige aussi les dix réussites de sa fixture séparée, avec le serveur réel et des providers simulés localement. Les tests proxy utilisent le vrai Fastify et des adresses réservées à la documentation.

## Limites

La suite complète du monorepo, les services externes, le déploiement Cloud, la topologie proxy de production et la résolution de J1 ne sont pas validés ici. Le lockfile public est conservé ; ce lot n’est pas une attestation de sécurité exhaustive des dépendances. Voir `TRUST_PROXY_SECURITY.md` avant toute préparation opérationnelle séparément autorisée.
