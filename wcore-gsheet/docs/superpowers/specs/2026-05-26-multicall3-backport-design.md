# Backport Multicall3 wcore-web vers wcore-gsheet

Date: 2026-05-26

## Objectif

Retro-porter uniquement la couche Multicall3 de `wcore-web` vers `wcore-gsheet` pour reduire le nombre de requetes HTTP RPC pendant les scans EVM existants.

Le systeme Google Sheets reste base sur les contrats listes manuellement en `I2:I`. Il n'y a pas de decouverte autonome, pas de `eth_getLogs`, pas de cursor de bloc, et aucune ecriture automatique dans les feuilles Ledger.

## Scope

Inclus:

- Ajouter un encodeur/decodeur Multicall3 `tryAggregate(false, calls)` en Apps Script.
- Executer les appels ERC20 `balanceOf`, `decimals`, `symbol`, `name` via un seul `eth_call` Multicall3 quand possible.
- Integrer Multicall3 dans le flux de consensus existant de `SimpleBalanceFetcher._scanBatch()`.
- Conserver le chemin JSON-RPC batch actuel comme fallback complet.
- Respecter les gardes existants: cache vote, forceFull, activityForced, `MAX_BATCH_SIZE`, `DISABLE_JSON_RPC_BATCH`, retry RPC, preservation du cache valide.

Exclus:

- Decouverte de tokens via `eth_getLogs`.
- Cursor incremental de bloc.
- Triggers/admin discovery.
- Modification automatique de `I2:I`.
- Refactor global des engines.

## Architecture

### Primitive Multicall3

Ajouter dans `05_RPC.gs` une primitive compacte, par exemple `Multicall3` ou `RpcClient.multicall3`, avec:

- Adresse constante: `0xcA11bde05977b3631167028862bE2a173976CA11`.
- Selector `tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls)`: `0xbce38bd7`.
- Encodage ABI manuel par manipulation de strings hex, adapte de `wcore-web/packages/core/src/rpc/multicall.ts`.
- Decodage du retour `((bool success, bytes returnData)[])`.
- Retour stable: un resultat par call d'entree, sous forme `{ success: boolean, returnData: string }`.

La primitive ne doit pas enregistrer de donnees en cache et ne doit pas muter l'etat hors `RpcHealth.recordSuccess/recordFailure` si elle gere elle-meme l'appel RPC.

### Integration scan EVM

`09_SIMPLE_ROTATION.gs` reste le point d'integration principal.

Dans `_scanBatch()`:

- La construction actuelle des `requests` reste la source de verite pour les calls ERC20.
- Pour chaque RPC participant au consensus, transformer les `requests` `eth_call` en calls Multicall3 `{ target, callData }`.
- Tenter Multicall3 sauf si une config le desactive explicitement.
- Reconstituer un tableau compatible avec le parsing actuel: `{ id, result }` pour les sous-calls reussis, `{ id, error, result: null }` pour les sous-calls echoues.
- Le reste de `_scanBatch()` continue d'utiliser `respById`, `decimalsIdx`, `symbolIdx`, `nameIdx`, `balanceOfIdx` sans changer la logique metier.

### Fallback

Si Multicall3 echoue pour un RPC, retourne un nombre de resultats incoherent, ou renvoie des erreurs pour tous les sous-calls, le code retombe sur le transport existant pour ce RPC:

- `batchCallIndividual()` si `RPC.DISABLE_JSON_RPC_BATCH`.
- `batchCallChunked()` si `RPC.MAX_BATCH_SIZE` impose une limite.
- `Http.post(currentRpc, requests, ...)` sinon.

Ce fallback garantit que les chaines sans Multicall3 deploye gardent le comportement actuel.

## Config

Ajouter une option globale permissive:

- Multicall3 active par defaut sur EVM.
- Desactivation chain-specific possible via `config.RPC.DISABLE_MULTICALL3 === true`.

Ne pas ajouter de liste chain-specific positive. L'adresse CREATE2 est commune, et le fallback couvre les exceptions.

## Contraintes GAS

- Un scan `@customfunction` doit rester dans le budget 30 s.
- Multicall3 reduit les requetes HTTP, mais augmente la taille du payload et la complexite d'encodage. Garder les batchs limites par la rotation existante.
- Ne pas utiliser `eth_getLogs` ni operation historique.
- Ne pas stocker de nouveaux gros objets dans `ScriptProperties`.
- Ne pas introduire de syntaxe incompatible Apps Script.

## Erreurs Et Degradation

- Un sous-call Multicall3 en echec ne doit pas faire echouer tout le batch, grace a `tryAggregate(false, ...)`.
- Un echec Multicall3 complet doit etre traite comme un echec de transport et fallback JSON-RPC.
- Aucune erreur ne doit ecraser un cache valide.
- Les decisions de balance restent prises par `ConsensusHelper.getConsensusBalanceWithFallback()`.

## Tests Et Verification

Verification statique:

- `npm test` depuis `wcore-gsheet`.

Verification fonctionnelle recommandee apres push:

- Executer un diagnostic sur une chaine EVM connue avec plusieurs tokens.
- Comparer `INFO_NATIVE`/scan stats avant-apres: balances identiques, moins d'appels RPC attendus.
- Tester une chaine avec `RPC.MAX_BATCH_SIZE` ou RPC fragile pour confirmer le fallback.

## Risques

- Encodage ABI incorrect: mitige par tests unitaires legers sur encode/decode ou diagnostics Apps Script.
- Certains RPCs peuvent limiter la taille d'un `eth_call` Multicall3: mitige par fallback JSON-RPC existant.
- Multicall3 non deploye sur certaines chaines: mitige par fallback.
- Decodage string metadata non standard: la logique existante de `AbiDecode.decodeStringOrBytes32` reste inchangee.

## Definition De Fini

- Multicall3 est utilise pour les calls ERC20 EVM quand disponible.
- Le fallback JSON-RPC conserve le comportement actuel en cas d'echec.
- Aucun code de decouverte autonome n'est ajoute.
- `npm test` passe.
- Les changements restent limites a `05_RPC.gs`, `09_SIMPLE_ROTATION.gs`, et eventuellement un diagnostic minimal si necessaire.
