# Railway : sortir de Config as Code avant le 2026-12-01

Railway cesse de lire les fichiers `railway.json` / `railway.toml` le 2026-12-01. Aujourd'hui, le Dockerfile, les watch patterns et le healthcheck de chaque service viennent du `railway.json` que `wcore-web/scripts/railway-deploy.mjs` écrit dans l'upload. Après la coupure, un build lancé ainsi partirait avec les réglages enregistrés sur le service (Railpack, sans Dockerfile ni healthcheck).

## Choix retenu : réglages enregistrés sur chaque service (`configSource: "service-settings"`)

- Les fichiers `wcore-web/railway/<service>.json` restent la référence versionnée des réglages attendus.
- Ces réglages sont posés une fois sur le service Railway (builder `DOCKERFILE`, chemin du Dockerfile, watch patterns, healthcheck et son délai). Rien d'autre n'est modifié : variables, domaines, volumes et sources restent tels quels.
- En mode `service-settings`, le déployeur :
  - n'écrit plus de `railway.json` et retire de l'upload tout `railway.json` / `railway.toml` résiduel (le fichier racine sélectionne le Dockerfile de l'API et ne doit jamais construire un autre service) ;
  - lit `railway config pull --json` (lecture seule) et refuse de publier si les réglages du service diffèrent du fichier du commit (`E_SETTINGS_DRIFT`) ou ne peuvent pas être lus (`E_SETTINGS_UNKNOWN`). Les variables lues ne sont ni journalisées ni conservées ;
  - continue de fonctionner après le 2026-12-01, alors que `config-as-code` y est refusé. Toute autre valeur de `configSource` est refusée.

## Ordre

1. Livrer ce mode avec `configSource` inchangé (`config-as-code`) : aucun effet sur la production.
2. Relever, sans les valeurs des variables, les réglages actuels des trois services.
3. Poser les réglages sur `cex-relay`, `api` puis `web` ; après chaque mutation, vérifier qu'aucun déploiement n'est parti et que rien n'est en attente.
4. Passer `configSource` à `service-settings` dans `wcore-web/railway/deploy-manifest.json`, puis livrer relais, API et site au même commit avec les gardes habituelles (sauvegarde, attestation TRUST_PROXY pour l'API).
5. Preuves par service : Dockerfile utilisé dans le build, commit dans `build-info.json`, sondes de santé, et pour le site HTTPS sur `wcore.xyz`.
6. Retirer les anciens `railway.json` du dépôt seulement après ces trois livraisons.

État au 2026-11-11 : étapes 1 à 6 faites. Relais et site livrés au commit `4c87f594`, API au commit `b1c435d8`, chacun construit avec le Dockerfile lu dans les réglages du service. Les quatre `railway.json` du dépôt sont retirés, et un test empêche leur retour.

## Retour arrière

Le retour durable est le dernier jeu de réglages `DOCKERFILE` validé plus le précédent déploiement sain (redéploiement depuis Railway). Revenir à `config-as-code` n'est possible qu'avant la coupure.
