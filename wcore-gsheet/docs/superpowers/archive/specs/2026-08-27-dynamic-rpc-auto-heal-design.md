# Design — Auto-heal RPC renforcé

## Contexte

WCORE dispose déjà d’un registre RPC dynamique alimenté par `https://chainid.network/chains.json`. `UPDATE_DYNAMIC_RPCS()` récupère les endpoints publics, en teste un tiers par cycle, stocke les résultats dans `ScriptProperties`, puis alimente `CacheService` pour les lectures rapides. Les RPC statiques restent prioritaires et les RPC dynamiques servent de secours.

Deux limites sont visibles en production :

- le registre n’est renouvelé qu’après 25 jours ;
- un endpoint défaillant peut rester disponible plusieurs semaines lorsque Chainlist ne propose aucune alternative.

Botanix illustre le premier cas : ses endpoints statiques et Chainlist répondent `404` ou expirent. DuckChain illustre le second : ses deux endpoints répondent `502/522`, et la chaîne est volontairement désactivée.

## Objectif

Rendre la découverte RPC plus réactive sans compromettre les garanties WCORE : ne jamais inventer un endpoint, ne jamais écraser un cache portefeuille valide et ne jamais réactiver automatiquement une chaîne sans preuve de fonctionnement.

## Architecture retenue

### Rafraîchissement hebdomadaire

Le seuil de renouvellement du registre passe de 25 à 7 jours. Le trigger existant `UPDATE_DYNAMIC_RPCS` reste géré par l’auto-heal. Une exécution fraîche continue à s’auto-skip afin de limiter la consommation HTTP.

### Validation stricte des endpoints

Chaque endpoint testé doit satisfaire les conditions suivantes :

1. URL HTTPS publique sans variable de clé API ;
2. réponse JSON-RPC à `eth_chainId` dans le délai autorisé ;
3. `chainId` égal à la chaîne attendue ;
4. réponse valide à `eth_blockNumber` ;
5. bloc strictement positif.

Un endpoint en erreur, timeout ou mismatch est exclu du lot frais. Les endpoints non testés à cause de la rotation restent admissibles jusqu’à leur prochain cycle, mais un endpoint explicitement testé et invalide ne doit pas être réintroduit par la fusion historique.

### Sources

Chainlist/`chainid.network` reste la source principale. Les RPC statiques du fichier de chaîne restent des fallbacks configurés, mais ils passent par la santé RPC existante. Aucune URL alternative n’est ajoutée sans source officielle ou registre public vérifiable.

### Politique de réactivation

DuckChain conserve `FLAGS.DISABLE_CHAIN: true` tant qu’aucun endpoint n’a réussi la validation stricte. La découverte dynamique ne réactive pas une chaîne. La réactivation nécessitera une modification explicite et un test live réussi.

Botanix reste activée : WCORE conserve ses données en mode dégradé tant qu’aucun RPC sain n’est disponible. Le cache portefeuille valide n’est jamais purgé.

## État et fusion

Le registre conserve, par chaîne, uniquement les endpoints frais validés ou les endpoints différés non encore testés dans le cycle courant. Lorsqu’une chaîne a été testée et que tous ses RPC échouent, son lot dynamique devient vide au lieu de conserver silencieusement les anciennes URL mortes.

La fusion au runtime reste : RPC statiques, puis au maximum deux RPC dynamiques, avec tri par `RpcHealth`. Ce design évite un changement large du moteur de scan.

## Diagnostics

`UPDATE_DYNAMIC_RPCS()` et `DYNAMIC_RPC_STATUS()` exposeront au minimum :

- nombre d’endpoints testés, validés et rejetés ;
- nombre de mismatches `chainId` ;
- nombre de chaînes sans RPC sain après test ;
- date du dernier renouvellement ;
- bucket de rotation.

Le diagnostic doit permettre de distinguer « non testé ce cycle » de « testé et invalide ».

## Tests

Les tests automatisés couvriront :

- seuil de fraîcheur à 7 jours ;
- rejet timeout/HTTP invalide ;
- rejet d’un mauvais `chainId` ;
- rejet d’un bloc nul ou invalide ;
- suppression d’anciens endpoints lorsqu’un lot explicitement testé échoue entièrement ;
- préservation des endpoints des chaînes différées par rotation ;
- maintien de `DISABLE_CHAIN` pour DuckChain ;
- absence de purge du cache portefeuille.

Après déploiement : exécution forcée du registre dynamique, inspection de Botanix/DuckChain, puis relance contrôlée de Botanix uniquement si un endpoint passe. DuckChain ne sera réactivée qu’après preuve positive.

## Hors périmètre

- création d’un crawler RPC indépendant ;
- utilisation de services nécessitant une clé API ;
- réactivation automatique des chaînes désactivées ;
- suppression des données figées ou caches historiques ;
- modification du moteur de consensus RPC général.
