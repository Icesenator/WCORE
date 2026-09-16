# CM / tickets — namespace

Incidents, dette, backlog auxiliaire du sous-projet `WCORE/CM`.

- Convention : notes Markdown avec frontmatter `type: ticket` (mêmes clés que les autres projets :
  `status`, `priority`, `project`, `date`, + `priority_id` quand un `PRIORITY_ID` de `CM/ROADMAP.md` s'applique).
- Autorité : **auxiliaire** — ne remplace pas `CM/ROADMAP.md` (CURRENT) ni `CM/review-context.md`.
- `project: WCORE-CM` pour tous les tickets CM (isolé du ROOT WCORE).
- Scanné par le dashboard (`Get-ProjectTickets`, entrée `WCORE-CM`) et `scan-tickets.ps1`.
