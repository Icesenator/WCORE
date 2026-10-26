# Sécurité de TRUST_PROXY

Date : 26 octobre 2026. Base publique : `8456014391009760a3a0d85529777bde180b8d5f`.

## Contrat de configuration

`TRUST_PROXY=true` et les nombres de sauts sont interdits : ils ne prouvent pas l’identité du pair connecté. Une configuration explicite doit désigner les **adresses IP ou plages CIDR des proxies réellement vérifiés**, jamais un nombre ou `true`. Les listes contenant une entrée vide ou numérique sont rejetées au démarrage.

L’absence de valeur et `false` conservent le repli historique limité au loopback. Les alias de réseaux reconnus par Fastify, notamment `loopback`, restent compatibles ; ils ne remplacent pas la vérification des adresses de l’infrastructure. Une valeur IP/CIDR mal formée reste soumise à la validation Fastify lors de l’initialisation.

Exemples exclusivement documentaires : `192.0.2.10` ou `192.0.2.0/24,2001:db8::/32`. Ne pas les utiliser comme configuration réelle et ne pas élargir une plage pour contourner une erreur.

## Pourquoi

Une confiance excessive envers `X-Forwarded-For`, `X-Forwarded-Host` ou `X-Forwarded-Proto` permet de falsifier l’identité ou le contexte d’une requête et peut compromettre les protections fondées sur l’IP. Voir l’avis `GHSA-3m5p-2c4r-xxw2`. Le pair direct doit être approuvé et les proxies doivent nettoyer les en-têtes transmis par les clients.

## Preuves et limites

Les tests locaux avec Fastify vérifient que les en-têtes d’un pair non approuvé sont ignorés et qu’une chaîne IP s’arrête au premier pair non approuvé. Ils couvrent également le refus des anciennes configurations et la compatibilité des listes IP/CIDR. Les commandes reproductibles et les résultats agrégés figurent dans `SESSION_CONTEXT.md`.

Ces tests ne certifient ni la topologie Cloud ni l’ensemble des dépendances. Aucun déploiement n’a été effectué ; aucune permission de déploiement ou d’accès aux secrets n’est donnée. L’incident J1 reste **OPEN** et distinct de ce lot. Avant tout déploiement séparément autorisé : vérifier le proxy direct, le filtrage réseau et la réécriture des en-têtes, puis tester les accès directs et via proxy sans exposer de secret.

## Validation stricte (26 octobre 2026, suite)

`apps/api/src/trust-proxy.ts` porte désormais toute la validation, sans dépendance au reste de l'API, pour que le préflight de déploiement applique exactement les mêmes règles :

- chaque entrée doit être une adresse IP, une plage CIDR (préfixe numérique ou masque IPv4 contigu) ou un alias Fastify (`loopback`, `linklocal`, `uniquelocal`). Une entrée mal formée (`10.0.0.0/33`, `999.1.1.1`, un nom d'hôte) était acceptée par la configuration puis faisait échouer la construction de Fastify, au chargement de `server.ts`, avec un message qui ne nommait pas la variable ;
- une plage plus large qu'un IPv4 `/8` ou un IPv6 `/16` est refusée. `0.0.0.0/1,128.0.0.0/1` (ou `::/1,8000::/1`) était accepté et faisait confiance au `X-Forwarded-For` de n'importe quel pair : c'était `true` écrit en deux entrées ;
- au plus 64 entrées ;
- le message d'erreur ne reprend jamais la valeur refusée ;
- en production, l'absence de valeur (repli `loopback`) est signalée une fois au démarrage : derrière un proxy, tous les clients anonymes partagent alors l'identité de rate-limit du proxy.

## Railway : ce qui est prouvé et ce qui ne l'est pas

Aucune plage d'adresses du proxy Railway n'est documentée comme stable. Sur le forum officiel, un employé Railway indique le 12 septembre 2026 que « 100.0.0.0/8 is not guaranteed to be stable » ; la plage citée dans un guide Caddy n'est donc pas une frontière de confiance. Le comportement de `X-Forwarded-For` (réécrit ou complété par l'edge) fait l'objet de réponses contradictoires. Aucune valeur ne doit être déduite de ces sources.

Valeurs admissibles pour le service API, dans l'ordre de préférence :

1. les adresses ou plages **mesurées** du pair direct (voir ci-dessous), aussi étroites que possible ;
2. à défaut, l'absence de valeur : pas d'usurpation possible, mais identité de rate-limit partagée entre clients anonymes (l'avertissement de démarrage le rappelle) ;
3. jamais `true`, un nombre, ni une plage couvrant Internet.

Mesure opérateur, sans exposer de secret : déployer d'abord sur un environnement de staging sans `TRUST_PROXY`, envoyer quelques requêtes `GET /health`, puis lire dans les logs Railway du service le champ `req.remoteAddress` des entrées `incoming request` (avec le repli `loopback`, c'est l'adresse du pair direct). Répéter sur plusieurs déploiements et plusieurs heures : si les adresses varient hors d'une plage étroite, garder l'option 2. Vérifier ensuite, toujours en staging, qu'un `X-Forwarded-For` fourni par le client ne change pas l'identité retenue.

Le préflight de déploiement (`wcore-web/scripts/railway-deploy.mjs`) lit `TRUST_PROXY` du service ciblé, applique ces règles et refuse la publication d'une valeur que l'API rejetterait au démarrage.
