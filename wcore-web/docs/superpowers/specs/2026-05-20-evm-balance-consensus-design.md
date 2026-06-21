# Design - EVM Balance Consensus

> **Historical/completed design.** Kept for implementation history only; verify current consensus behavior in `packages/core` before acting on it.

**Date** : 2026-05-20
**Status** : Draft - en attente de review utilisateur
**Auteur** : opencode

## Contexte

WCORE lit les balances EVM via `Multicall3`, puis fallback `eth_call balanceOf`, avec consensus strict multi-RPC. Le cache est deja utilise comme dernier recours quand le consensus RPC echoue et retourne zero.

Le probleme restant est que cette logique reste implicite et fragile :

- un token decouvert par Blockscout ou `eth_getLogs` peut disparaitre si la lecture balance RPC echoue ;
- un zero live faible peut effacer mentalement une balance positive connue ;
- les diagnostics ne disent pas quelle source a gagne ;
- le modele n'est pas pret pour des sources futures `explorer` ou `indexer` façon DeBank/Zerion.

Objectif v1 : fiabiliser les balances EVM sans changer le contrat API/frontend, en rendant la decision de balance explicite, testable et degradee quand necessaire.

## Scope

Inclus v1 :

- EVM uniquement.
- Nouveau module de consensus balance dans `packages/core/src/balances/`.
- Integration native balance EVM.
- Integration ERC-20 EVM autour de `Multicall3`, fallback `eth_call`, et cache.
- Cache balance avec timestamp pour appliquer une politique de staleness.
- Diagnostics `[DEGRADED]` quand cache/indexer gagne faute de live fiable.
- Tests unitaires du resolver et tests EVM cibles.

Exclus v1 :

- Refactor SVM/Cosmos.
- Nouveaux appels payants explorer pour lire les balances.
- Indexer maison.
- Changement UI pour afficher source/confidence par token.
- Stockage DB historique.

## Architecture

Ajouter un module dedie :

```typescript
// packages/core/src/balances/consensus.ts
export type BalanceSource = "rpc" | "multicall" | "cache" | "explorer" | "indexer";

export interface BalanceVote {
  source: BalanceSource;
  raw: bigint;
  confidence: number;
  staleMs?: number;
  endpoint?: string;
  error?: string;
}

export interface BalanceDecision {
  raw: bigint;
  source: BalanceSource;
  confidence: number;
  degraded: boolean;
  reason?: string;
  votes: BalanceVote[];
}

export interface BalanceConsensusPolicy {
  freshCacheMs: number;
  staleCacheMs: number;
  maxCacheMs: number;
  minLiveConfidence: number;
  minFallbackConfidence: number;
}

export function resolveBalance(votes: BalanceVote[], policy?: Partial<BalanceConsensusPolicy>): BalanceDecision;
```

`evm.ts` ne decide plus directement `raw = rpc || cache`. Il collecte des votes puis appelle `resolveBalance()`.

## Decision Rules

1. **Consensus live clair gagne**

Un vote `rpc` ou `multicall` issu d'un consensus strict gagne, y compris si la balance vaut `0`.

2. **Single live read sain peut gagner**

Sur une chaine single-RPC ou apres filtrage d'endpoints morts, un seul live read peut gagner si l'endpoint est sain. Sa confidence reste plus basse qu'un consensus multi-RPC.

3. **Zero live faible ne supprime pas un cache positif recent**

Si le live echoue, timeout, ou n'a pas de consensus clair, un cache positif recent gagne avec `degraded: true`.

4. **Cache staleness decroissante**

- `<= 1h` : cache fort, utilisable comme fallback normal.
- `1h - 24h` : cache moyen, utilisable avec `[DEGRADED]`.
- `> 24h` : cache faible, conserve le token comme last-known mais ne doit pas ecraser un live fiable.
- `> maxCacheMs` : ignore pour les totaux, sauf si une policy future decide d'afficher du last-known explicitement.

5. **Explorer/indexer confirme la presence token**

En v1, Blockscout reste une source de discovery/metadata. Si explorer voit un token mais la balance live echoue, le token ne doit pas disparaitre si un cache balance positif existe.

6. **Vrai zero confirme supprime**

Si un consensus live clair dit `0`, le cache est mis a jour a zero et la balance disparait du resultat token.

7. **Conflit positif vs positif**

Le vote live fiable gagne. Si seuls cache/indexer divergent, le plus recent gagne et la decision est degradee avec raison `balance_conflict`.

## Data Flow EVM

### Discovery

Le discovery reste responsable de la liste des tokens :

- registry ;
- Blockscout tokenlist ;
- `eth_getLogs` ;
- discovery cache.

Le merge actuel des tokens caches reste important : il evite qu'un scan incremental ou un explorer temporairement indisponible fasse disparaitre un token connu.

### Balance Reads

Pour chaque asset :

- `Multicall3` produit un vote `multicall` quand il retourne une valeur decodable ;
- le fallback `readErc20Balance` produit un vote `rpc` quand `eth_call balanceOf` atteint consensus ;
- le cache `token:{chain}:{contract}:{wallet}` produit un vote `cache` si present ;
- la native balance utilise la meme logique avec `native:{chain}:{wallet}`.

### Decision

`resolveBalance()` choisit la balance gagnante et retourne :

- `raw` ;
- `source` ;
- `confidence` ;
- `degraded` ;
- `reason` ;
- `votes` pour debug/tests.

### Persistence

Le cache est mis a jour uniquement si la decision est fiable :

- live consensus clair : write cache avec `{ balance, ts, source }` ;
- single live sain : write cache avec confidence plus basse ;
- cache fallback degrade : ne pas prolonger indefiniment le TTL sans nouveau live fiable ;
- explorer-only : ne pas ecraser un cache/live plus fiable.

### Output

Le format de retour API reste compatible. Les tokens affiches gardent `balance`, `priceEur`, `valueEur` comme aujourd'hui.

Diagnostics ajoutes dans `errors` quand utile :

```text
[DEGRADED] SYMBOL balance: using cached fallback (rpc consensus failed)
[DEGRADED] SYMBOL balance: balance_conflict, using latest reliable vote
```

## Cache Format

Format actuel :

```typescript
{ balance: string }
```

Nouveau format compatible lecture :

```typescript
{
  balance: string;
  ts: number;
  source?: "rpc" | "multicall" | "cache" | "explorer" | "indexer";
  confidence?: number;
}
```

Compatibilite : si `ts` est absent, traiter comme cache legacy stale mais utilisable en fallback degrade. Ne pas ajouter de migration Redis.

## Error Handling

- Les erreurs `execution reverted` sur tous les endpoints continuent d'alimenter `meta:skip:{chain}:{contract}` pour les non-ERC20.
- Les timeouts/consensus failures alimentent les votes live avec confidence faible ou absence de vote gagnant.
- Le cache fallback ne masque pas l'erreur : il retourne un resultat utilisable mais ajoute `[DEGRADED]`.
- Aucun fallback cache ne doit etre utilise pour un contrat explicitement marque non-ERC20.

## Testing

Tests unitaires `packages/core/src/balances/consensus.test.ts` :

- consensus live `0` bat cache positif recent ;
- live failed + cache positif fresh gagne degrade ;
- cache > 24h perd contre live single sain ;
- cache legacy sans `ts` reste fallback degrade ;
- conflit positif cache/indexer choisit le plus recent ;
- absence de vote retourne `0` degrade avec raison explicite.

Tests EVM cibles :

- token decouvert + RPC consensus fail + cache positif => token conserve ;
- token decouvert + live consensus zero => token retire et cache zero ecrit ;
- non-ERC20 skip ne lit pas cache fallback ;
- native balance utilise cache uniquement quand live echoue.

## Rollout

1. Ajouter le module `balances/consensus.ts` et ses tests.
2. Adapter les writes cache `native:` et `token:` pour inclure `ts/source/confidence`.
3. Adapter les reads cache pour accepter ancien et nouveau format.
4. Integrer `resolveBalance()` dans native balance EVM.
5. Integrer `resolveBalance()` dans ERC-20 EVM apres `multicall`/fallback.
6. Verifier avec tests core puis scan prod cible sur Base/Gnosis.

## Decisions

- `maxCacheMs` : 7 jours pour v1, car le cache balance existe deja comme last-known et les wallets inactifs doivent rester stables.
- Les details `source/confidence` ne sont pas exposes au frontend v1. Ils restent internes + erreurs/metrics.
