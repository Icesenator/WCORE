# WCORE DeFi Position Engine

## Architecture

Le moteur identifie les positions DeFi (staking, lending, airdrops...) et leur applique :
1. Un suffixe `[Flex]` ou `[Lock]` dans le nom affiché
2. Un pricing miroir (si l'underlying est connu, la position prend le prix du sous-jacent)
3. Un badge `DeFi` bleu dans le TokenTable web

```
apps/api/src/plugins/gsheet.ts          ← Orchester : appelle les 3 mécanismes
  ├── defi/registry.ts                  ← Registre statique (contrats connus)
  ├── defi/compound-v3.ts               ← Discovery on-chain Compound V3
  ├── plugins/chainbase-staking.ts      ← Discovery on-chain Chainbase Staking
  └── defi/positions.ts                 ← withLiquiditySuffix() : colle [Flex]/[Lock]
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
Discovery on-chain des positions Chainbase (C-Locked, C-Airdrop) via l'API Chainbase. Géré par le plugin `chainbase-staking.ts` dans l'API, appelé depuis `gsheet.ts:injectChainbaseStakingTokens()`.

## Comment le suffixe est appliqué

1. Le scan API (`gsheet.ts`) itère sur les tokens découverts
2. Pour chaque token, appelle `getDeFiPositionMetadata(chain, contract, symbol)` ou lit le champ `token.defi`
3. Si une métadonnée est trouvée, appelle `withLiquiditySuffix(name, meta)`
4. `withLiquiditySuffix` ajoute `[Flex]` ou `[Lock]` au nom UNIQUEMENT si le type n'est pas `"wallet_token"` et si le suffixe n'est pas déjà présent

## Badge DeFi web

Le composant `TokenTable.tsx` a sa propre détection basée sur regex (indépendante du moteur DeFi). Elle couvre les patterns courants :
- Noms contenant `[Flex]`, `[Lock]`
- Noms commençant par `Staked`
- Noms contenant `staking`, `liquid staking`, `receipt`, `vault`, `defi`
- Symboles `C-*` suivis de `staking`/`lock`/`airdrop` dans le nom
- Symboles `sXxx` + nom contenant `stak`/`receipt`

Le badge est purement visuel — il n'affecte PAS le pricing ni le nom.

## Pricing miroir

Quand `pricing.mode = "mirror_underlying"` :
- Le token DeFi prend le prix du contrat `underlying`
- Exemple : sKAITO (`0x548d...`) → prix de KAITO (`0x98d0...`)
- Géré dans `gsheet.ts` (lignes 240-320)

Quand `pricing.mode = "mirror_native"` :
- Prend le prix du token natif de la chaîne

## Flux de données

```
Scan GSheet (POST /api/gsheet/scan)
  → evm-scan.ts : découvre les tokens (logs + registry)
  → evm-pricing.ts : price les actifs directs et diffère les positions miroir
  → gsheet.ts : injectChainbaseStakingTokens() + applyStakedPriceMirrors()
    → getDeFiPositionMetadata() : match registre statique
    → withLiquiditySuffix() : ajoute [Flex]/[Lock] au nom
    → pricing miroir : si underlying connu
  → réponse directe à `41_GSHEET_WEB_SCAN.gs`
  → l'adaptateur Apps Script conserve le format à sept colonnes et son cache wallet
```

## Checklist : ajouter une position DeFi

1. **Registre statique** : ajouter l'entrée dans `defi/registry.ts` (si protocole non-standard)
2. **Ou discovery on-chain** : ajouter le protocole dans le plugin dédié
3. **Ajouter au `TOKEN_REGISTRY`** si le contrat n'est pas discoverable via logs (ex: tokens sans transfer events)
4. **Deployer l'API** : `powershell -File scripts/deploy.ps1 -Service api`
5. **Rescanner** les wallets concernés
