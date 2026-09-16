---
type: ticket
status: closed
priority: high
project: WCORE-CM
priority_id: P1-GOV-CM-SHELL-HARMONIZATION
date: 2026-09-16
closed: 2026-09-16
tags: [cm, governance, harmonization, filesystem]
---

# CM — conformité des prérequis transversaux (6 points)

Ticket de traçabilité de l'audit de conformité du sous-projet `WCORE/CM` contre les règles
transversales (`K:\ProjetIA\AGENTS.md` §1-11) et le contrat filesystem
(`K:\ProjetIA\docs\PROJECT-FILESYSTEM-CONTRACT.md`).

## Constat initial

6 écarts constatés : (1) drift `OWNERSHIP-MANIFEST` (`DUPLICATE_ROADMAP_STATE_COUNT=1` alors que la
réconciliation ROOT→pointeur était faite) ; (2) `review-context.md` obsolète vs `CM/ROADMAP.md` ;
(3) CM invisible du dashboard/`status.md` horaire ; (4) aucun ticket CM (`type: ticket`) ;
(5) aucune mémoire Mem0 pour les décisions CM ; (6) aucun pipeline RAW→Wiki CM.

## Résolution

- (1) `OWNERSHIP-MANIFEST.md` §5 corrigé : `DUPLICATE_ROADMAP_STATE_COUNT=0`, `RECONCILIATION_DONE=TRUE`.
- (2) `review-context.md` réécrit (sections canoniques, état aligné sur `CM/ROADMAP.md`).
- (3) Entrée `WCORE-CM` dans `K:\ProjetIA\scripts\dashboard.config.psd1` + support `Vault` dans
  `scan-tickets.ps1` / `monthly-audit.ps1` ; **aucune** tâche planifiée CM (respect `NO_SCHEDULED_TASK_WAKE`).
- (4) Namespace `CM/tickets/` + ce ticket.
- (5) `user_id=projet:WCORE-CM` (`scripts/mem0-usage.ps1`) ; décisions mémorisées depuis `Wiki/CM/`.
- (6) Namespace `CM/RAW/` (RAW d'abord) puis distillation `Wiki/CM/`.

## Preuve

- Gardes CM ALL PASS : `cm-boundary.test.cjs` 11/11, `cm-discovery-validate.test.cjs` 8/8,
  `cm-discovery-qualify.test.cjs` 8/8, `cm-turn-end-guard.test.cjs` 21/21, `cm-checkpoint-c2.test.cjs` 9/9.
- Dashboard : ligne `WCORE-CM` présente dans `K:\ProjetIA\status.md` (régénéré).
- `CM_SHELL_HARMONIZED=TRUE`.

`PUBLICATION=NONE` · aucune écriture produit/ROOT.
