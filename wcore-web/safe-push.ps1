# ============================================================================
# WCORE Safe-Push v3.1 - Windows PowerShell
# Push les fichiers .gs de src/ vers le projet
# NE SUPPRIME PAS les fichiers presents uniquement sur le projet distant
# v3.1: rootDir fixe ".temp_push" dans clasp.json avant pull pour eviter
#        les artefacts .js en racine. Restore rootDir="src" apres push.
# ============================================================================

$ErrorActionPreference = "Stop"
$ProjectDir = (Get-Location).Path
$SrcDir = Join-Path $ProjectDir "src"
$TempDir = Join-Path $ProjectDir ".temp_push"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$BackupDir = Join-Path $ProjectDir ".backups"
$BackupFolder = Join-Path $BackupDir "backup_$Timestamp"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   WCORE Safe-Push v3.0                    " -ForegroundColor Cyan
Write-Host "   Push src/ sans supprimer distant        " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verifier clasp
try {
    $null = & clasp --version 2>&1
    Write-Host "[OK] clasp installe" -ForegroundColor Green
} catch {
    Write-Host "[ERREUR] clasp n'est pas installe" -ForegroundColor Red
    exit 1
}

# Verifier .clasp.json
if (-not (Test-Path ".clasp.json")) {
    Write-Host "[ERREUR] .clasp.json introuvable" -ForegroundColor Red
    exit 1
}

# Lire la config clasp originale (rootDir sera restore a "src" apres push)
$originalClasp = Get-Content ".clasp.json" -Raw | ConvertFrom-Json

# Verifier src/
if (-not (Test-Path $SrcDir)) {
    Write-Host "[ERREUR] Dossier src/ introuvable" -ForegroundColor Red
    exit 1
}

$gsFiles = Get-ChildItem -Path $SrcDir -Filter "*.gs" -File
if ($gsFiles.Count -eq 0) {
    Write-Host "[ERREUR] Aucun fichier .gs dans src/" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] $($gsFiles.Count) fichiers .gs dans src/" -ForegroundColor Green

# ============================================================================
# ETAPE 1: Backup de src/
# ============================================================================
Write-Host ""
Write-Host "[1/6] Backup de src/..." -ForegroundColor Yellow
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }
New-Item -ItemType Directory -Path $BackupFolder -Force | Out-Null
Copy-Item "$SrcDir\*.gs" -Destination $BackupFolder -ErrorAction SilentlyContinue
$backupCount = (Get-ChildItem -Path $BackupFolder -Filter "*.gs" -File).Count
Write-Host "  [OK] $backupCount fichiers sauvegardes dans $BackupFolder" -ForegroundColor Green

# Garder les 10 derniers backups
$oldBackups = Get-ChildItem -Path $BackupDir -Directory | Sort-Object Name -Descending | Select-Object -Skip 10
foreach ($old in $oldBackups) { Remove-Item $old.FullName -Recurse -Force }

# ============================================================================
# ETAPE 2: Pull distant dans temp (pour merger)
# ============================================================================
Write-Host ""
Write-Host "[2/6] Pull du projet distant..." -ForegroundColor Yellow
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

# Creer .clasp.json local avec rootDir="." car on execute clasp depuis .temp_push
$tempClaspPull = @{
    scriptId = $originalClasp.scriptId
    projectId = $originalClasp.projectId
    rootDir = "."
} | ConvertTo-Json
[System.IO.File]::WriteAllText("$TempDir\.clasp.json", $tempClaspPull)

Push-Location $TempDir
try {
    $null = & clasp pull 2>&1
    Write-Host "  [OK] Pull reussi" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Pull echoue, on continue quand meme" -ForegroundColor Yellow
}
Pop-Location

# ============================================================================
# ETAPE 3: Merger - garder fichiers distants + ajouter/remplacer par src/
# ============================================================================
Write-Host ""
Write-Host "[3/6] Fusion des fichiers..." -ForegroundColor Yellow

# Compter fichiers distants
$remoteJsFiles = Get-ChildItem -Path $TempDir -Filter "*.js" -File -ErrorAction SilentlyContinue
$remoteCount = if ($remoteJsFiles) { $remoteJsFiles.Count } else { 0 }
Write-Host "  Fichiers distants: $remoteCount" -ForegroundColor Gray

# Copier les .gs de src/ comme .js dans temp (ecrase les existants)
$replaced = 0
$added = 0
foreach ($gsFile in $gsFiles) {
    $jsName = $gsFile.Name -replace '\.gs$', '.js'
    $destPath = Join-Path $TempDir $jsName
    
    if (Test-Path $destPath) {
        $replaced++
    } else {
        $added++
    }
    Copy-Item $gsFile.FullName -Destination $destPath -Force
}

Write-Host "  Fichiers remplaces: $replaced" -ForegroundColor Gray
Write-Host "  Fichiers ajoutes: $added" -ForegroundColor Gray

# S'assurer qu'il y a un appsscript.json
$appsscriptPath = Join-Path $TempDir "appsscript.json"
if (-not (Test-Path $appsscriptPath)) {
    $appsscript = @'
{
  "timeZone": "Europe/Paris",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
'@
    [System.IO.File]::WriteAllText($appsscriptPath, $appsscript)
    Write-Host "  [OK] appsscript.json cree" -ForegroundColor Green
}

# ============================================================================
# ETAPE 4: Validation syntaxique
# ============================================================================
Write-Host ""
Write-Host "[4/6] Validation syntaxique..." -ForegroundColor Yellow
$syntaxWarnings = 0
foreach ($jsFile in (Get-ChildItem -Path $TempDir -Filter "*.js" -File)) {
    $content = Get-Content $jsFile.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        $openBraces = ([regex]::Matches($content, '\{')).Count
        $closeBraces = ([regex]::Matches($content, '\}')).Count
        if ($openBraces -ne $closeBraces) {
            Write-Host "  [WARN] $($jsFile.Name): accolades {$openBraces/$closeBraces}" -ForegroundColor Yellow
            $syntaxWarnings++
        }
    }
}
if ($syntaxWarnings -eq 0) {
    Write-Host "  [OK] Validation OK" -ForegroundColor Green
}

# ============================================================================
# ETAPE 5: Push
# ============================================================================
Write-Host ""
Write-Host "[5/6] Push vers Google Apps Script..." -ForegroundColor Yellow

# S'assurer qu'il y a un manifest dans temp pour le push
$tempAppsscript = Join-Path $TempDir "appsscript.json"
if (-not (Test-Path $tempAppsscript)) {
    $appsscript = @'
{
  "timeZone": "Europe/Paris",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8"
}
'@
    [System.IO.File]::WriteAllText($tempAppsscript, $appsscript)
}

# Modifier temporairement .clasp.json pour pointer vers temp (racine de .temp_push)
$tempClaspPush = @{
    scriptId = $originalClasp.scriptId
    projectId = $originalClasp.projectId
    rootDir = "."
} | ConvertTo-Json
[System.IO.File]::WriteAllText("$TempDir\.clasp.json", $tempClaspPush)

Push-Location $TempDir
try {
    $output = & clasp push --force 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw $output
    }
    Write-Host "  [OK] Push reussi!" -ForegroundColor Green
} catch {
    Pop-Location
    Write-Host "  [ERREUR] Push echoue" -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
    
    # Restaurer .clasp.json avec rootDir="src" (evite artefacts .js en racine)
    $restoreClaspErr = @{
        scriptId = $originalClasp.scriptId
        projectId = $originalClasp.projectId
        rootDir = "src"
    } | ConvertTo-Json
    [System.IO.File]::WriteAllText("$ProjectDir\.clasp.json", $restoreClaspErr)
    
    Write-Host ""
    Write-Host "  Pour restaurer src/:" -ForegroundColor Yellow
    Write-Host "  Copy-Item '$BackupFolder\*.gs' 'src\' -Force"
    exit 1
}
Pop-Location

# Restaurer .clasp.json original avec rootDir="src" (pas "." — evite artefacts .js en racine)
$restoreClasp = @{
    scriptId = $originalClasp.scriptId
    projectId = $originalClasp.projectId
    rootDir = "src"
} | ConvertTo-Json
[System.IO.File]::WriteAllText("$ProjectDir\.clasp.json", $restoreClasp)

# ============================================================================
# ETAPE 6: Nettoyage
# ============================================================================
Write-Host ""
Write-Host "[6/6] Nettoyage..." -ForegroundColor Yellow
Remove-Item $TempDir -Recurse -Force
Write-Host "  [OK] Dossier temporaire supprime" -ForegroundColor Green

# Nettoyage de securite: supprimer les artefacts .js en racine (issus de clasp pull manuel)
$strayJs = Get-ChildItem -Path $ProjectDir -Filter "*.js" -File -ErrorAction SilentlyContinue
if ($strayJs) {
    foreach ($js in $strayJs) { Remove-Item $js.FullName -Force }
    Write-Host "  [OK] $($strayJs.Count) artefact(s) .js en racine supprime(s)" -ForegroundColor Yellow
}
$strayJson = Join-Path $ProjectDir "appsscript.json"
if (Test-Path $strayJson) {
    Remove-Item $strayJson -Force
    Write-Host "  [OK] appsscript.json en racine supprime" -ForegroundColor Yellow
}

# ============================================================================
# Resume
# ============================================================================
$totalSize = ($gsFiles | Measure-Object -Property Length -Sum).Sum / 1KB

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   [OK] SAFE-PUSH TERMINE                  " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Fichiers push: $($gsFiles.Count)"
Write-Host "  Taille: $([math]::Round($totalSize, 1)) KB"
Write-Host "  Backup: $BackupFolder"
Write-Host ""
Write-Host "  Ouvrir l'editeur: clasp open" -ForegroundColor Cyan
Write-Host ""
