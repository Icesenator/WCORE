---
type: guide
status: active
project: wcore
---
# Guide du vault Obsidian WCORE

Le vault Obsidian est la **racine du monorepo** (`K:\ProjetIA\WCORE`). Tous les `.md` du repo sont des notes. Point d'entrée : [[HOME]].

## Conventions frontmatter

Toute note gérée porte un frontmatter conforme à cette taxonomie :

```yaml
---
type: plan | spec | guide | reference | audit | moc | daily-log
status: draft | planned | active | done | archived | superseded | review
project: wcore | gsheet | web
date: YYYY-MM-DD
---
```

Règles :
- Utiliser uniquement les valeurs `type`, `status` et `project` listées ci-dessus.
- Toute nouvelle note gérée reçoit ce frontmatter dès sa création.
- `draft` = non validé, `planned` = validé non commencé, `active` = travail courant, `done` = livré, `review` = état à confirmer, `superseded` = remplacé, `archived` = déplacé dans une archive.
- Déplacer une note vers `archive/` avec `move_note`, puis utiliser `status: archived` afin de préserver ses backlinks.

## Structure

| Emplacement | Contenu |
|---|---|
| `HOME.md` | Index MOC — plans actifs, audits, docs clés |
| `journal/YYYY-MM-DD.md` | Journal de dev quotidien (daily notes) |
| `templates/` | Templates (daily-log) |
| `docs/superpowers/{plans,specs}` | Travaux transverses monorepo |
| `wcore-gsheet/docs/superpowers/...` | Travaux Apps Script |
| `wcore-web/docs/superpowers/...` | Travaux app web |
| `*/archive/` | Plans/specs terminés |

## Requêtes utiles (MCP Obsidian)

```
# Plans actifs, tous projets
query_notes where=[{key: status, op: eq, value: active}, {key: type, op: eq, value: plan}]

# Tout ce qui touche wcore-web
query_notes where=[{key: project, op: eq, value: web}] select=[status, type]

# Notes modifiées cette semaine
query_notes modifiedAfter=<ISO> sort=mtime order=desc
```

## Journal de dev (agents inclus)

En fin de session de travail significative, logger dans la daily note :

```
append_periodic_note period=daily content="## HH:MM — <sujet>\n- <résumé>\n- Commits : <hashes>"
```

Sections du template : `Sessions`, `Décisions`, `Blocages / À suivre`.

## Pièges connus

- **Tags parasites** : ne jamais écrire `#ERROR!`, `#ID`, ou des hex colors (`#a3e635`) en texte nu dans un `.md` — toujours les entourer de backticks, sinon ils polluent l'index de tags.
- **Titres ambigus** : beaucoup de notes s'appellent `README`/`ROADMAP`/`AUDIT`. Toujours utiliser des wikilinks avec chemin complet : `[[wcore-web/ROADMAP|ROADMAP web]]`.
- **Gros fichiers** (`wcore-web/ROADMAP.md` 272 KB, `AGENTS.md` 246 KB, `CHANGELOG.md` 184 KB) : ne pas les lire en entier — utiliser `outline_note` puis `read_note` par section.
- `.obsidian/workspace*.json` est gitignoré (état d'UI personnel) ; le reste de `.obsidian/` est versionné.
