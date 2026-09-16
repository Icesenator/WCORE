# Interface ROOT et CM

Coordination **durable et explicite**. Jamais de simulation de message utilisateur
(`NO_SYNTHETIC_USER_TURN=TRUE`), jamais de conversation auto-creee (`NO_AUTOCREATED_CONVERSATION=TRUE`).

## Sens ROOT vers CM

| Canal | Nature | Usage |
|---|---|---|
| `ROADMAP.md` (ROOT) | fichier de coordination | le CM **lit** un pointeur ; il ne copie jamais et ne selectionne jamais une ligne produit |
| `AGENTS.md` (racine) | fichier | regles + marqueurs durables (routage, garde fraicheur) |
| `docs/prompts/supervisor-wcore-cm.md` | miroir regenerable | politique normative, marqueurs durables dans `AGENTS.md` |
| Preuves produit (API, `wcore.xyz`, registre) | lecture HTTP/code | le CM peut s'en servir comme **source technique** pour un contenu |

## Sens CM vers ROOT

| Canal | Nature | Usage |
|---|---|---|
| `CM/ROADMAP.md` | fichier | file canonique CM (statuts des workstreams CM) |
| `CM/review-context.md` | fichier | etat CURRENT CM (couverture X, editorial, candidats) |
| `.generated/cm-continuity/heartbeat.json` | fichier etat | fraicheur X, breach, ledger |
| `Wiki/CM/` (decisions), `CM/RAW/` (preuves brutes), `CM/tickets/` | vault/sous-projet | connaissance distillee, preuves, tickets |
| `ROADMAP.md` (ROOT) | **lecture seule** | le CM **ne l'ecrit jamais** ; `WC-01` y est un pointeur (`ROOT_ROADMAP_IS_WORK_QUEUE=FALSE`) |

## Outillage transverse (harmonisation)

| Mecanisme | Regle CM |
|---|---|
| Dashboard `status.md` (`K:\ProjetIA\scripts\dashboard.config.psd1`) | entree dediee `WCORE-CM` (`Vault=WCORE\_vault`) ; **aucune** tache planifiee CM |
| Mem0 | `user_id=projet:WCORE-CM` ; memoires validees et **sourcees** (`Wiki/CM/`) |
| Contrat filesystem | `K:\ProjetIA\docs\PROJECT-FILESYSTEM-CONTRACT.md` (`CM_SHELL_HARMONIZED=TRUE`) |

## Regles d'execution

- `ONE_WORK_ITEM_ONE_OWNER=TRUE` : un item de roadmap a un seul proprietaire d'execution.
- `NO_CROSS_AGENT_IMPERSONATION=TRUE` : le CM ne modifie aucun artefact produit ; ROOT ne publie pas sur X.
- Le CM peut lire le travail d'un autre agent (ex. integration Arc) comme **source technique**, sans
  reprendre ses mutations produit.
- Le capteur CM est `SENSOR_ONLY` : il publie des faits (`wake-request.json`, heartbeat), il ne reveille
  pas le modele et n'injecte aucun message.
- Toute publication X reste soumise au gate R-024 (pertinent WCORE, utile, exact, non redondant,
  non paraphrase, aucune claim non sourcee) et a la propriete CM.
