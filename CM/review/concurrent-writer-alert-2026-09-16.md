# ALERTE CUTOVER — écrivain CM concurrent (périmètre PRÉCISÉ)

Statut : **PÉRIMÉTRÉ ET NON BLOQUANT POUR L'EXÉCUTION** — voir la distinction ci-dessous.

## Détermination honnête (mesurée, pas supposée)

```
CM_DOUBLE_OWNER_DETECTED=FALSE                  (ownership d EXECUTION : single-flight respecte)
CM_CONCURRENT_PLANNING_WRITER_DETECTED=TRUE     (un autre agent ecrit des fichiers de planning CM)
ONE_ACTIVE_CM_EXECUTION_OWNER=TRUE
```

Preuves :

| Mesure | Valeur | Sens |
|---|---|---|
| `cm-continuity-runner.cjs --admit-status` → `held` | `false` | **aucun** lease d'exécution CM détenu ⇒ pas de second exécuteur |
| `token_prefix` | `null` | aucun token d'admission actif |
| Tests CM-owned (dont `cm-continuity-admission.test.cjs`) | **14/14 exit=0** | single-flight intact |
| mtimes de fichiers CM de **planning** | 12:23:43 → 12:38:33 | un autre agent écrit du contenu, pas des actions X |

## Fichiers concernés (écriture concurrente, travail préservé)

| Fichier | mtime (Paris) | Taille |
|---|---|---|
| `OWNERSHIP-MANIFEST.md` | 12:23:43 | 4798 o |
| `ROADMAP.md` (ajout `P1-GOV-CM-SHELL-HARMONIZATION`) | 12:27:05 | 3636 o |
| `AGENTS.md` | 12:37:26 | 3504 o |
| `README.md` | 12:38:09 | 2961 o |
| `INTERFACE.md` | 12:38:33 | 2410 o |
| `RAW/` (3 fichiers, nouveau) | 12:30:09–12:30:13 | — |
| `tickets/` (2 fichiers, nouveau) | 12:29:44–12:29:46 | — |

Le contenu correspond à l'item `P1-GOV-CM-SHELL-HARMONIZATION` (dashboard/status, tickets, RAW/Wiki,
Mem0) — appartenant à cet autre agent. **Aucun revert, aucune réécriture** depuis ce contexte.

## Incident transitoire observé et résolu

À 12:39, `cm-continuity-admission.test.cjs` a rendu `exit=1` une fois, pendant l'activité du
concurrent (ce test touche `.generated/cm-continuity/admission.json`). Re-mesuré **3 fois : exit=0**
(2 via le launcher, 1 en direct). Aucune action corrective prise.

## Conséquences

- Le **canari de cold-start** reste `PASS` avec ces fichiers modifiés.
- L'ownership d'exécution n'est pas contesté : `held=false`.
- Avant sa première **action X**, le nouvel agent doit néanmoins faire confirmer par l'opérateur
  qui porte `P1-GOV-CM-SHELL-HARMONIZATION`, afin d'éviter deux exécuteurs simultanés.
- `LEGACY_CM_EXECUTION_RETIRED=FALSE` reste requis jusqu'à `HANDOFF_ACCEPTED=TRUE` du nouvel agent.

Ne pas « nettoyer » les fichiers du concurrent : ils ne sont pas à l'ancien contexte.
