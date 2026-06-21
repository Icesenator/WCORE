# WCORE GSheet

Google Sheets + Apps Script runtime for WCORE.

- **182 generated chain configs** across EVM, SVM/Solana, Cosmos SDK, and TON (`npm run build:chains` is the source for the current count).
- Canonical chain source for the web runtime via generated `dist/` package `@wcore/chains`.
- Apps Script wallet tracking, pricing, cache, CEX sync, watchdog, and diagnostics.
- Reference documentation: [AGENTS.md](./AGENTS.md).
- Unified repository overview: [../README.md](../README.md).

## Structure

```
wcore-gsheet/
├── .clasp.json              ← clasp config
├── src/                     ← Apps Script source and canonical chain configs
│   ├── 01_INIT.gs
│   ├── 02_UTILS.gs
│   └── ...
├── dist/                    ← Generated @wcore/chains package
│   └── chains/*.ts
├── tools/                   ← Extraction and validation tooling
├── pulls/                   ← Historique des pulls (créé automatiquement)
├── .backups/                ← Backups avant chaque push (créé automatiquement)
├── AGENTS.md                ← Documentation agent (gotchas, architecture)
├── pull-all.ps1             ← Télécharger le projet distant
└── safe-push.ps1            ← Envoyer src/ vers le projet
```

## Usage

### Télécharger le projet distant
```powershell
.\pull-all.ps1
```
- Crée un nouveau dossier daté dans `pulls/`
- **Ne modifie PAS** le dossier `src/`
- Utile pour voir ce qui est sur le projet distant

### Envoyer tes modifications
```powershell
.\safe-push.ps1
```
- Envoie les fichiers de `src/` vers Google Apps Script
- **Ne supprime PAS** les fichiers présents uniquement sur le projet distant
- Crée un backup automatique dans `.backups/`

## Chain Extraction

`wcore-gsheet/src/*.gs` is the source of truth for chain configs. The web runtime consumes the generated `@wcore/chains` package from `dist/`.

Do not edit `dist/` by hand. Change `src/*.gs`, run the extractor, then consume the generated package from `wcore-web`.

```powershell
npm run validate:static
npm run build:chains
npm run test:phase3-chains
```

## Fonctionnement

### Pull-All
1. Télécharge le projet distant (fichiers .js)
2. Convertit en .gs
3. Sauvegarde dans `pulls/pull_YYYYMMDD_HHMM/`
4. Tu peux comparer avec `src/` pour voir les différences

### Safe-Push
1. Crée un backup de `src/` dans `.backups/`
2. Télécharge le projet distant
3. **Fusionne** : garde les fichiers distants + ajoute/remplace par `src/`
4. Valide la syntaxe
5. Push vers Google Apps Script
6. Nettoie les fichiers temporaires

**Important** : Le safe-push ne supprime JAMAIS les fichiers présents uniquement sur le projet distant.

## Prérequis

1. **Node.js** : https://nodejs.org/
2. **clasp** : `npm install -g @google/clasp`
3. **Connexion** : `clasp login`
4. **API activée** : https://script.google.com/home/usersettings

## Sécurité

- Ne jamais committer de clés API, secrets CEX, tokens Railway, URLs DB réelles ou `.env*`.
- Les secrets Apps Script doivent être stockés dans `ScriptProperties`, `UserProperties`, `DocumentProperties` ou dans les secrets Railway selon le runtime.
- Les exemples de README et docs doivent rester des placeholders.

## Dépannage

### Erreur PowerShell "execution of scripts is disabled"
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Restaurer après un push raté
```powershell
Copy-Item '.backups\backup_XXXXXXXX\*.gs' 'src\' -Force
```

### Voir les différences entre src/ et le projet distant
```powershell
.\pull-all.ps1
Compare-Object (dir src\*.gs).Name (dir pulls\pull_XXXXXXXX\*.gs).Name
```

### Ouvrir l'éditeur en ligne
```cmd
clasp open
```
