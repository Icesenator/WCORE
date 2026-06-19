# ============================================================================
# WCORE Pull-All v3.0 - Windows PowerShell
# Telecharge le projet dans un nouveau dossier date (pulls/pull_YYYYMMDD_HHMM)
# ============================================================================

$ErrorActionPreference = "Stop"
$ProjectDir = (Get-Location).Path
$Timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$PullsDir = Join-Path $ProjectDir "pulls"
$PullFolder = Join-Path $PullsDir "pull_$Timestamp"
$TempDir = Join-Path $ProjectDir ".temp_pull"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   WCORE Pull-All v3.0                     " -ForegroundColor Cyan
Write-Host "   Telecharge dans pulls/pull_$Timestamp   " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verifier clasp
try {
    $null = & clasp --version 2>&1
    Write-Host "[OK] clasp installe" -ForegroundColor Green
} catch {
    Write-Host "[ERREUR] clasp n'est pas installe" -ForegroundColor Red
    Write-Host "Installez-le avec: npm install -g @google/clasp"
    exit 1
}

# Verifier .clasp.json
if (-not (Test-Path ".clasp.json")) {
    Write-Host "[ERREUR] .clasp.json introuvable" -ForegroundColor Red
    exit 1
}

# Creer les dossiers
Write-Host "[1/4] Preparation des dossiers..." -ForegroundColor Yellow
if (-not (Test-Path $PullsDir)) { New-Item -ItemType Directory -Path $PullsDir -Force | Out-Null }
New-Item -ItemType Directory -Path $PullFolder -Force | Out-Null
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

# Copier .clasp.json dans temp
Copy-Item ".clasp.json" -Destination $TempDir

# Pull dans temp
Write-Host "[2/4] Pull depuis Google Apps Script..." -ForegroundColor Yellow
Push-Location $TempDir
try {
    $output = & clasp pull 2>&1
    if ($LASTEXITCODE -ne 0) { throw $output }
    Write-Host "  [OK] Pull reussi" -ForegroundColor Green
} catch {
    Write-Host "  [ERREUR] Pull echoue: $_" -ForegroundColor Red
    Pop-Location
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
Pop-Location

# Convertir .js en .gs et copier dans le dossier pull
Write-Host "[3/4] Conversion .js -> .gs..." -ForegroundColor Yellow
$jsFiles = Get-ChildItem -Path $TempDir -Filter "*.js" -File
$converted = 0

foreach ($file in $jsFiles) {
    $gsName = $file.Name -replace '\.js$', '.gs'
    $destPath = Join-Path $PullFolder $gsName
    Copy-Item $file.FullName -Destination $destPath
    $converted++
}

# Copier appsscript.json si present
if (Test-Path (Join-Path $TempDir "appsscript.json")) {
    Copy-Item (Join-Path $TempDir "appsscript.json") -Destination $PullFolder
}

Write-Host "  [OK] $converted fichiers convertis en .gs" -ForegroundColor Green

# Nettoyer temp
Write-Host "[4/4] Nettoyage..." -ForegroundColor Yellow
Remove-Item $TempDir -Recurse -Force
Write-Host "  [OK] Dossier temporaire supprime" -ForegroundColor Green

# Resume
$gsCount = (Get-ChildItem -Path $PullFolder -Filter "*.gs" -File).Count
$totalSize = (Get-ChildItem -Path $PullFolder -Filter "*.gs" -File | Measure-Object -Property Length -Sum).Sum / 1KB

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "   [OK] PULL TERMINE                       " -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Dossier: $PullFolder"
Write-Host "  Fichiers .gs: $gsCount"
Write-Host "  Taille: $([math]::Round($totalSize, 1)) KB"
Write-Host ""
Write-Host "  Pour voir les differences avec src/:" -ForegroundColor Cyan
Write-Host "  Compare-Object (dir src\*.gs).Name (dir '$PullFolder\*.gs').Name"
Write-Host ""
