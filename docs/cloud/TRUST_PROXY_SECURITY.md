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
