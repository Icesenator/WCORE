# Candidat éditorial — Arc (2026-09-16)

`STATUS=CANDIDATE_INTERNAL_QA_DONE` · `PUBLICATION_GATE=NOT_PASSED` · `PUBLICATION=NONE`
`OWNER=WCORE_CM` · `WORK_ITEM=WC01_ARC_EDITORIAL_PACKAGE_FROM_VERIFIED_E2E`
`ASSET_STATUS=BLOCKED_BY_ASSET_TOOLING`

## 0. Vérification des faits (host canonique)

`ARC_CANONICAL_API_HOST=https://api-production-b5bf.up.railway.app` · `INDEPENDENT_HTTP_REVALIDATION=PASS`

| Fait | Statut | Preuve |
|---|---|---|
| API répond | `INDEPENDENTLY_VERIFIED` | `GET /health` → 200 |
| `chainCount` | `INDEPENDENTLY_VERIFIED` | `/health` → `chainCount=163`, `coreVersion=0.3.3` |
| `/api/chains` répond | `INDEPENDENTLY_VERIFIED` | 200, `count=163` (cohérent avec `/health`) |
| **ARC présent** | `INDEPENDENTLY_VERIFIED` | `{key:"ARC", vm:"EVM", name:"Arc", chainId:5042, disabled:false, nativeSymbol:"USDC", rpcCount:4, explorerUrl:null}` |
| **`chainId=5042`** | `INDEPENDENTLY_VERIFIED` | même entrée |
| **USDC = actif natif d'Arc** | `INDEPENDENTLY_VERIFIED` | champ `nativeSymbol:"USDC"` |
| « pas de double ligne USDC ERC-20 » | `PARTIAL` | vrai au niveau **registre** (une seule entrée ARC, un seul `nativeSymbol`) ; le ledger d'agrégation n'est pas public ⇒ **non affirmé** publiquement |
| `Ledger - Degen` / `Recap Portfolio` préservés | `REPORTED_NOT_INDEPENDENTLY_VERIFIED` | rapport d'un autre agent |

## 1. Copy finale candidate (X, ≤ 280)

> Arc is live in WCORE.
>
> Arc lists USDC as its native asset — one chain, one native balance, no separate ERC-20 USDC entry.
>
> Cleaner portfolio reads for Arc users.

`CHARS≈192` · `TONE=sobre, factuel` · `EMOJI=none` · `LIEN=reply (à trancher au gate)`

## 2. Variante technique (fil / reply)

> Under the hood, WCORE reads Arc's declared `nativeSymbol` (USDC) from the chain registry, so the
> aggregation layer treats it as the chain's native asset. Ledger views such as Degen and Recap
> Portfolio are unaffected.

## 3. Brief visuel (DA WCORE) — `ASSET_STATUS=BLOCKED_BY_ASSET_TOOLING`

- **Dimensions cibles** : 1600×900 (primaire) ou 1080×1080 (carré).
- **Sujet** : ligne `USDC · Arc (native)` en clair ; en regard `USDC · ERC-20 (Arc)` en `ghost` barré,
  annotée `not listed`.
- **Texte** : `Native USDC · no separate ERC-20 entry` ; `@WCORExyz` discret.
- **Fond** : sombre WCORE, un seul accent.
- **À éviter** : prix, chiffres de marché, poids/parts, logos de marque sans autorisation, promesse de
  performance, `explorerUrl` d'Arc (= `null` au registre, donc non affichable).

### Condition exacte de déblocage

`BLOCKING_CONDITION=NO_CM_OWNED_GRAPHICAL_PIPELINE`
Constat : `CM/assets` absent, `CM/templates` absent, aucun script `cm-*` de rendu (`image|asset|render|visual|design|banner|svg|canvas`).
Interface partagée : aucune capacité d'asset déclarée dans `CM/INTERFACE.md`.
Déblocage : (a) un outil de rendu CM-owned est ajouté au périmètre CM, **ou** (b) un asset est fourni
via l'interface par ROOT, **ou** (c) l'opérateur autorise explicitement un service de génération d'image
avec la clé correspondante. Aucune de ces trois conditions n'est remplie ⇒ **aucune image finale n'est prétendue**.

## 4. Claim-proof map

| Claim | Statut | Preuve |
|---|---|---|
| « Arc is live in WCORE » | `INDEPENDENTLY_VERIFIED` | entrée `ARC` dans `/api/chains` |
| « lists USDC as its native asset » | `INDEPENDENTLY_VERIFIED` | `nativeSymbol:"USDC"` |
| « one chain, one native balance » | `INDEPENDENTLY_VERIFIED` (registre) | `chainId=5042`, une seule entrée ARC |
| « no separate ERC-20 USDC entry » | `PARTIAL` → limité au **registre** | une seule entrée ARC, pas de doublon déclaré |
| « Ledger views unaffected » | `REPORTED` → **retiré du draft**, conservé en variante sourcée | — |

## 5. Alt text

> « Schéma WCORE : la chaîne Arc avec une ligne USDC marquée *native*, et une ligne USDC ERC-20 en
> fantôme annotée *not listed*. »

## 6. QA visuelle

`VISUAL_QA=NOT_APPLICABLE_NO_ASSET` (aucun asset produit ⇒ rien à contrôler ; le brief reste le livrable).
Contrôles éditoriaux, eux, faits : copy claire · claims sourcées · aucun montant · aucune adresse wallet ·
aucun secret · aucune capture de ledger privée · aucun faux partenariat WCORE × Arc · aucune claim de
performance non démontrée · alt text présent.

`ARC_PRIVATE_WALLET_DATA_EXPOSED=FALSE` · `ARC_FALSE_PARTNERSHIP_CLAIM=FALSE` · `PUBLICATION=NONE`
