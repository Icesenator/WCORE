#!/usr/bin/env node
// `npm run push` (racine) ne publie plus rien. Il appelait safe-push.ps1, qui remplace dans le
// GAS LIVE tous les fichiers de ./src : depuis wcore-gsheet, ~240 fichiers du depot d'un coup,
// au risque d'ecraser des correctifs presents seulement dans le LIVE (regression du 07/11/2026).
// Decision du Supervisor Codex, deleguee par le proprietaire, le 11/11/2026 (audit, point 17).
const lines = [
  "npm run push est desactive : il publierait tout wcore-gsheet/src vers le GAS LIVE.",
  "Procedure de publication GAS :",
  "  1. tirer une copie fraiche du LIVE (projects.getContent) ;",
  "  2. appliquer le correctif sur cette copie et verifier qu'elle egale le depot ;",
  "  3. dossier de publication minimal : .clasp.json, safe-push.ps1 et src/ avec les seuls fichiers modifies ;",
  "  4. lancer safe-push.ps1 depuis ce dossier, puis relire le LIVE (seuls ces fichiers ont change).",
];
process.stderr.write(lines.join("\n") + "\n");
process.exit(1);
