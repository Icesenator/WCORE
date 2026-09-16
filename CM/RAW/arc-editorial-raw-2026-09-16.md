# RAW — vérification éditoriale Arc (2026-09-16)

Preuve brute (re-vérification indépendante) alimentant le candidat éditorial
`CM/editorial/arc-candidate-2026-09-16.md`.

- `CAPTURED_AT=2026-09-16` (session CM shell harmonization)
- `HOST=https://api-production-b5bf.up.railway.app`
- `METHOD=HTTP GET` (read-only) ; `ARC_PRIVATE_WALLET_DATA_EXPOSED=FALSE`

## GET /health → 200

```json
{"status":"ok","service":"wcore-api","coreVersion":"0.3.3","uptimeSec":9643,"chainCount":163}
```

## GET /api/chains → 200 (`count=163`)

Entrée ARC (verbatim) :

```json
{"key":"ARC","vm":"EVM","name":"Arc","chainId":5042,"disabled":false,"nativeSymbol":"USDC","rpcCount":4,"explorerUrl":null,"iconUrl":"https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-5042.json"}
```

## Lecture brute

- `chainCount` de `/health` (163) == `count` de `/api/chains` (163) ⇒ cohérent.
- Une **seule** entrée `ARC` ; `nativeSymbol="USDC"` ; `explorerUrl=null` ⇒ non affichable.
- Aucune donnée de ledger privé, aucun montant, aucune adresse wallet.

`PUBLICATION=NONE` — cette preuve ne publie rien ; elle alimente uniquement le candidat `CM/editorial/`.
