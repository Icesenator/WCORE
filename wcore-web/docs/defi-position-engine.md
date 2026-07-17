# WCORE DeFi Position Engine

## Architecture

Le moteur couvre des `Selected DeFi positions` V1 : positions Compound V3, WCT, Chainbase et actifs stakés sélectionnés. Il ne revendique pas une couverture générale des LP, vaults ou protocoles. Il applique :
1. Un suffixe `[Flex]` ou `[Lock]` dans le nom affiché
2. Un pricing miroir (si l'underlying est connu, la position prend le prix du sous-jacent)
3. Un badge `DeFi` bleu dans le TokenTable web

```
packages/core/src/defi/                 ← Registre, Compound V3 et helpers de position
apps/api/src/plugins/gsheet.ts          ← Finalisation partagée WCT/Compound
apps/api/src/plugins/scan.ts            ← Applique la finalisation à /api/scan/batch
apps/api/src/plugins/chainbase-staking.ts ← Discovery Chainbase ciblée
apps/api/src/server-helpers.ts          ← Sérialise token.defi en flag DEFI
```

## Mécanismes de détection

### 1. Registre statique (`packages/core/src/defi/registry.ts`)
Mapping explicite contrat → métadonnées DeFi. Utilisé pour les tokens dont le protocole n'a pas d'API standard (mirrors stakés simples, WCT stake...).

**Ajouter une entrée :**
```ts
{
  chain: "BASE",
  contract: "0x...",           // adresse du token DeFi
  symbol: "sKAITO",            // optionnel : filtre plus fin
  protocol: "staked-mirror",
  type: "liquid_staking",
  underlying: "0x...",         // contrat du token sous-jacent (pour le pricing)
  liquidityStatus: "flex",     // "flex" → [Flex], "lock" → [Lock]
  confidence: "high",
  pricing: { mode: "mirror_underlying", sign: "asset" },
}
```

### 2. Compound V3 (`defi/compound-v3.ts`)
Discovery purement on-chain via `numAssets()` + `getAssetInfo(i)` sur le Comet proxy. Le Comet reste la cible de `collateralBalanceOf(user, asset)` ; l'adresse du collatéral devient `pricingContract` et contrat affiché. Les décimales viennent de `AssetInfo.scale`, y compris pour les actifs à 6 ou 8 décimales. Ajouter un marché dans `COMPOUND_V3_MARKETS` (une adresse Comet par chaîne).

### 3. Chainbase Staking (`plugins/chainbase-staking.ts`)
C-Locked lit `getDelegationAmount(address)` sur le staking proxy via le RPC Base. C-Airdrop lit `chainbase-airdrop.json`, car la claim Merkle n'est pas lisible on-chain. Le plugin `chainbase-staking.ts` est appelé depuis `gsheet.ts:injectChainbaseStakingTokens()`.

## Finalisation partagée

1. Le scan lit `getDeFiPositionMetadata(chain, contract, symbol)` ou le champ inline `token.defi`.
2. `applyStakedPriceMirrors()` ajoute `[Flex]`/`[Lock]`, applique le pricing miroir et produit les labels lisibles. `scan.ts` réutilise ce helper via `applyDeFiPositionMirrorsToWalletAssets()` pour `/api/scan/batch`; GSheet conserve le même passage avant sa réponse à sept colonnes.
3. Une position de dette reçoit balance et valeur négatives; `totalValueEur` agrège directement actifs et dettes pour conserver le net signé.
4. `withLiquiditySuffix()` ne suffixe pas `wallet_token` et évite les suffixes en double.

## Badge DeFi web

Le champ inline `token.defi` est sérialisé par l'API en flag `DEFI`. Ce flag fait autorité pour l'agrégation API et pour le badge/la classification dans `TokenTable.tsx`. `isDefiPosition(symbol, name)` reste seulement un fallback visuel legacy pour les anciennes lignes sans flag; il ne pilote ni pricing ni finalisation.

L'agrégation frontend au niveau wallet appelle encore `detectScam` sans bypass général fondé sur `DEFI`. Les contrats des positions Optimism officielles actuelles sont propres grâce à l'allowlist trusted dédiée. Un futur contrat officiel doit donc être ajouté au traitement trusted, ou l'agrégateur doit être explicitement adapté et testé.

## Pricing miroir

Quand `pricing.mode = "mirror_underlying"` :
- Le token DeFi prend le prix du contrat `underlying`
- Exemple : sKAITO (`0x548d...`) → prix de KAITO (`0x98d0...`)
- Géré par le helper partagé de `gsheet.ts`, appelé par GSheet et `/api/scan/batch`

Quand `pricing.mode = "mirror_native"` :
- Prend le prix du token natif de la chaîne

## Flux de données

```
Scan EVM
  → découvre Compound V3 une fois par batch et les autres tokens ciblés
  → price les actifs directs; diffère les positions miroir sans faux NO_PRICE
  → finalisation partagée : WCT lock, [Flex]/[Lock], mirrors, labels, dette signée
  ├── POST /api/gsheet/scan → réponse sept colonnes conservée par Apps Script
  └── POST /api/scan/batch → sérialisation DEFI → agrégation API + TokenTable + net signé
      → agrégation frontend wallet → detectScam → allowlist trusted pour les contrats Optimism officiels actuels
```

Un token long-tail sans source de prix conserve `NO_PRICE`; ce cas normal n'ajoute pas à lui seul une erreur et ne rend pas le scan `degraded`. Les garde-fous restent distincts pour les actifs majeurs attendus comme priceables.

## Checklist : ajouter une position DeFi

1. **Registre statique** : ajouter l'entrée dans `defi/registry.ts` (si protocole non-standard)
2. **Ou discovery on-chain** : ajouter le protocole dans le plugin dédié
3. **Ajouter au `TOKEN_REGISTRY`** si le contrat n'est pas discoverable via logs (ex: tokens sans transfer events)
4. **Vérifier** les tests core/shared, API et Web ciblés, le typecheck, le lint et les builds concernés
5. **Déployer séquentiellement** l'API puis le Web avec `powershell -File scripts/deploy.ps1 -Service api|web`; ne faire un `clasp push` que si du code Apps Script a réellement changé
6. **Contrôler** `/api/scan/batch` avec `forceRefresh=true`, les suffixes, flags, valeurs signées et `degraded/errors`, puis la sortie GSheet si elle est concernée
