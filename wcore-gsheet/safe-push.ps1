# ============================================================================
# WCORE Safe-Push v3.3 - Windows PowerShell
# Push les fichiers .gs de src/ vers le projet
# NE SUPPRIME PAS les fichiers presents uniquement sur le projet distant
# v3.1: rootDir fixe ".temp_push" dans clasp.json avant pull pour eviter
#        les artefacts .js en racine. Restore rootDir="src" apres push.
# v3.2: verrou de deploiement atomique (.push.lock, handle OS) pour
#        serialiser les pushs concurrents (agents multiples). Un push
#        concurrent echoue proprement au lieu d'ecraser le projet distant.
# v3.3: refus des fichiers de chaines retirees (appel a
#        ChainFactory.createEvmChain pour un nom de WCORE_REMOVED_CHAINS):
#        publies, ils leveraient CHAIN_REMOVED au chargement du script.
# ============================================================================

$ErrorActionPreference = "Stop"
$ProjectDir = (Get-Location).Path
$SrcDir = Join-Path $ProjectDir "src"
$TempDir = Join-Path $ProjectDir ".temp_push"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmm"
$BackupDir = Join-Path $ProjectDir ".backups"
$BackupFolder = Join-Path $BackupDir "backup_$Timestamp"
$PushLockPath = Join-Path $ProjectDir ".push.lock"

# ============================================================================
# ETAPE 0: Verrou de deploiement (serialise les pushs concurrents)
# ============================================================================
# Le verrou repose sur un handle OS (FileMode.CreateNew + FileShare.None):
# l'acquisition est atomique et le handle est libere par l'OS meme si le
# processus est tue. Un agent concurrent recoit une erreur claire au lieu
# d'ecraser le projet distant avec une version perimee.
Write-Host ""
Write-Host "[0/7] Verrou de deploiement..." -ForegroundColor Yellow
$lockStream = $null
$lockAcquired = $false
$lockAttempts = 6
$lockDelayMs = 5000
for ($attempt = 1; $attempt -le $lockAttempts; $attempt++) {
    try {
        $lockStream = [System.IO.FileStream]::new($PushLockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $lockAcquired = $true
        break
    } catch [System.IO.IOException] {
        if ($attempt -lt $lockAttempts) {
            Write-Host "  [WAIT] Push en cours par un autre agent (tentative $attempt/$lockAttempts)..." -ForegroundColor Yellow
            Start-Sleep -Milliseconds $lockDelayMs
        }
    }
}
if (-not $lockAcquired) {
    $lockOwner = ""
    try { $lockOwner = (Get-Content $PushLockPath -Raw -ErrorAction SilentlyContinue).Trim() } catch {}
    Write-Host "[ERREUR] Verrou .push.lock pris par un autre deploiement: $lockOwner" -ForegroundColor Red
    Write-Host "  Attends la fin du push concurrent puis relance. Aucune modification effectuee." -ForegroundColor Red
    exit 1
}
try {
    [System.IO.File]::WriteAllText($PushLockPath, "pid=$PID machine=$env:COMPUTERNAME started=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
} catch {}
$lockStream.Flush()
Write-Host "  [OK] Verrou acquis (PID $PID)" -ForegroundColor Green

try {

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   WCORE Safe-Push v3.3                    " -ForegroundColor Cyan
Write-Host "   Push src/ sans supprimer distant         " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# GARDE: fichiers de chaines retirees (aucun appel a clasp avant ce controle)
# ============================================================================
# 19_CHAIN_FACTORY.gs leve CHAIN_REMOVED dans ChainFactory.createEvmChain pour
# les noms de WCORE_REMOVED_CHAINS (c'est la seule fabrique qui leve: Ton, Svm
# et Cosmos ne levent pas). Un fichier de chaine retiree (LISK.gs, GRAVITY.gs)
# appelle cette fabrique au chargement: publie, il ferait echouer le chargement
# de tout le script et plus rien ne fonctionnerait dans le classeur.
#
# Regle: refus si un src/*.gs contient, hors commentaire et hors chaine de
# caracteres, ChainFactory.createEvmChain(<litteral> dont le litteral, apres
# trim + majuscules (comme _wcoreRemovedChainLabel_), est exactement un des
# "ids" de WCORE_REMOVED_CHAINS. La liste n'est jamais recopiee ici: elle est
# lue dans 19_CHAIN_FACTORY, a deux moments:
#   A. avant clasp et avant tout reseau: src/19_CHAIN_FACTORY.gs du dossier
#      pousse; a defaut celui du depot a cote de ce script (src/ voisin);
#      a defaut rien n'est lisible en local et ce controle A ne refuse rien;
#   B. apres le pull et la fusion, avant le push: 19_CHAIN_FACTORY.js de
#      .temp_push, c'est-a-dire la fabrique qui sera reellement en ligne
#      (celle de src/ si elle est poussee, sinon celle du projet distant).
#      C'est B qui couvre le dossier de publication minimal (un ou deux
#      fichiers, sans la fabrique).
# A suit donc la fabrique du dossier pousse ou du depot et peut etre plus
# strict que l'etat en ligne; B suit la fabrique qui sera en ligne.
# Liste absente ou illisible: avertissement, jamais de refus.
#
# Les commentaires sont retires avant l'analyse: un commentaire place entre
# deux elements de l'appel ne le cache pas. Un appel qui ne peut pas etre
# verifie est refuse lui aussi: premier argument qui n'est pas un litteral
# simple ("..." ou '...') suivi de "," ou ")" (variable, concatenation,
# gabarit), acces par chaine (ChainFactory["createEvmChain"]), alias. Seule
# la definition de la fabrique (ChainFactory.createEvmChain = function) est
# admise. Le corpus reel (146 fichiers) n'a que des appels litteraux.
#
# Fichiers presents seulement en ligne: ce script ne supprime jamais un
# fichier distant. Si la fabrique qui sera en ligne retire une chaine dont le
# fichier reste en ligne (X.gs enleve de src/ mais X.js toujours distant), le
# script publie leve CHAIN_REMOVED au chargement. B examine donc aussi les .js
# ramenes par le pull qui ne viennent pas de src/, avec la meme detection:
#   - REFUS si cette publication retire la chaine (elle est dans la liste de la
#     fabrique qui sera en ligne, et pas dans celle de la fabrique en ligne
#     avant la fusion): le classeur charge aujourd'hui, la publication le
#     casserait. Fabrique en ligne absente ou illisible: rien n'est prouve,
#     toute chaine de la liste compte comme retiree par la publication.
#   - AVERTISSEMENT si la fabrique en ligne retirait deja la chaine: la
#     version en ligne est deja cassee, et un refus empecherait de pousser la
#     reparation.
#   - Appel non verifiable dans un fichier en ligne: refus si la publication
#     retire au moins une chaine, avertissement sinon.
$JsCommentPattern = '/\*[\s\S]*?\*/|//[^\r\n]*'
$JsStringPattern = '"(?:\\.|[^"\\\r\n])*"|''(?:\\.|[^''\\\r\n])*''|`(?:\\.|[^`\\])*`'
$RemovedChainLiteralCallPattern = '^createEvmChain\s*\(\s*(?<q>["''])(?<name>[^"''\\\r\n]*)\k<q>\s*[,)]'
$UnverifiableLabel = 'appel non verifiable'

# Retourne @{ ID_EN_MAJUSCULES = libelle } lu dans WCORE_REMOVED_CHAINS, ou
# $null si le fichier ou le bloc est illisible. Seuls les litteraux des
# tableaux "ids" comptent: un nom cite dans un commentaire du bloc est ignore.
function Get-RemovedChainIndex([string]$factoryPath) {
    try { $text = [System.IO.File]::ReadAllText($factoryPath) } catch { return $null }
    $code = [regex]::Replace($text, "(?<c>$JsCommentPattern)|(?<s>$JsStringPattern)", {
        param($m) if ($m.Groups['c'].Success) { ' ' } else { $m.Value }
    })
    $block = [regex]::Match($code, '\bWCORE_REMOVED_CHAINS\s*=\s*\[(?<body>[\s\S]*?)\]\s*;')
    if (-not $block.Success) { return $null }
    $index = @{}
    $entryPattern = '(?:\blabel\s*:\s*(?<lq>["''])(?<label>[^"''\r\n]*)\k<lq>\s*,\s*)?\bids\s*:\s*\[(?<ids>[^\]]*)\]'
    foreach ($entry in [regex]::Matches($block.Groups['body'].Value, $entryPattern)) {
        foreach ($literal in [regex]::Matches($entry.Groups['ids'].Value, '(?<q>["''])(?<id>[^"''\r\n]*)\k<q>')) {
            $id = $literal.Groups['id'].Value.Trim().ToUpperInvariant()
            if (-not $id) { continue }
            $index[$id] = if ($entry.Groups['label'].Success) { $entry.Groups['label'].Value } else { $id }
        }
    }
    if ($index.Count -eq 0) { return $null }
    return $index
}

# Retourne les appels a refuser ou signaler, sous la forme { File; Name; Label }:
# un appel ChainFactory.createEvmChain(<nom retire>), ou un appel non
# verifiable (Label = $UnverifiableLabel, Name = extrait de la ligne).
# Les commentaires sont retires d'abord (les chaines sont gardees telles
# quelles); ensuite une chaine est consommee avant l'identifiant par
# l'alternance: un appel cite dans une chaine n'est donc jamais retenu.
function Find-RemovedChainCalls($files, $index) {
    foreach ($file in $files) {
        try { $content = [System.IO.File]::ReadAllText($file.FullName) } catch { continue }
        $code = [regex]::Replace($content, "(?<c>$JsCommentPattern)|(?<s>$JsStringPattern)", {
            param($m) if ($m.Groups['c'].Success) { ' ' } else { $m.Value }
        })
        foreach ($m in [regex]::Matches($code, "(?<s>$JsStringPattern)|\bcreateEvmChain\b")) {
            if ($m.Groups['s'].Success) {
                $inner = if ($m.Value.Length -ge 2) { $m.Value.Substring(1, $m.Value.Length - 2) } else { '' }
                # ChainFactory["createEvmChain"](...): acces par chaine, non verifiable.
                # `${ChainFactory.createEvmChain(...)}`: appel execute dans un gabarit, non verifiable.
                if ($inner -eq 'createEvmChain' -or ($m.Value.StartsWith('`') -and $inner -match '\$\{[\s\S]*\bcreateEvmChain\b')) {
                    $excerpt = ($m.Value -split "\r?\n", 2)[0].Trim()
                    if ($excerpt.Length -gt 60) { $excerpt = $excerpt.Substring(0, 60) }
                    [pscustomobject]@{ File = $file.Name; Name = $excerpt; Label = $UnverifiableLabel }
                }
                continue
            }
            $tail = $code.Substring([Math]::Max(0, $m.Index - 64), [Math]::Min(64, $m.Index))
            $qualified = $tail -match 'ChainFactory\s*\.\s*$'
            $after = $code.Substring($m.Index)
            if ($qualified -and $after -match '^createEvmChain\s*=\s*function\b') { continue }
            $call = [regex]::Match($after, $RemovedChainLiteralCallPattern)
            if ($qualified -and $call.Success) {
                $chainName = $call.Groups['name'].Value
                $chainId = $chainName.Trim().ToUpperInvariant()
                if ($index.ContainsKey($chainId)) { [pscustomobject]@{ File = $file.Name; Name = $chainName; Label = $index[$chainId] } }
                continue
            }
            $excerpt = ($after -split "\r?\n", 2)[0].Trim()
            if ($excerpt.Length -gt 60) { $excerpt = $excerpt.Substring(0, 60) }
            [pscustomobject]@{ File = $file.Name; Name = $excerpt; Label = $UnverifiableLabel }
        }
    }
}

# Retourne $true si un fichier doit etre refuse (les messages sont affiches).
function Test-RemovedChainFiles([string]$factoryPath, $files, [string]$origin) {
    $index = Get-RemovedChainIndex $factoryPath
    if ($null -eq $index) {
        Write-Host "[WARN] Garde chaines retirees: WCORE_REMOVED_CHAINS illisible dans $origin, controle ignore" -ForegroundColor Yellow
        return $false
    }
    $hits = @(Find-RemovedChainCalls $files $index)
    $refused = $hits.Count -gt 0
    foreach ($hit in $hits) {
        if ($hit.Label -eq $UnverifiableLabel) {
            Write-Host "[ERREUR] src\$($hit.File) appelle ChainFactory.createEvmChain de facon non verifiable: $($hit.Name)" -ForegroundColor Red
        } else {
            Write-Host "[ERREUR] src\$($hit.File) appelle ChainFactory.createEvmChain(""$($hit.Name)""): chaine retiree $($hit.Label)" -ForegroundColor Red
        }
    }
    if ($refused) {
        Write-Host "  Liste WCORE_REMOVED_CHAINS lue dans $origin." -ForegroundColor Red
        Write-Host "  Publie, ce fichier leverait CHAIN_REMOVED au chargement et bloquerait tout le script du classeur." -ForegroundColor Red
        Write-Host "  Un appel non verifiable s'ecrit ChainFactory.createEvmChain(""NOM"", {...}) avec un nom litteral." -ForegroundColor Red
        Write-Host "  Retire ce fichier du dossier de publication (src/) puis relance." -ForegroundColor Red
    } else {
        Write-Host "[OK] Aucun fichier de chaine retiree ($($index.Count) identifiants lus dans $origin)" -ForegroundColor Green
    }
    return $refused
}

# Fichiers presents seulement en ligne qui appellent la fabrique pour une
# chaine retiree (regle en tete de cette garde). $indexBefore est la liste de
# la fabrique en ligne avant la fusion ($null si absente ou illisible).
# Retourne @{ Refused = <bool>; Warnings = <appels signales sans refus> }.
function Test-RemovedChainOnlineFiles([string]$factoryPath, $indexBefore, $files) {
    $result = @{ Refused = $false; Warnings = @() }
    $index = Get-RemovedChainIndex $factoryPath
    if ($null -eq $index) { return $result }
    $before = if ($null -eq $indexBefore) { @{} } else { $indexBefore }
    $newlyRemoved = @($index.Keys | Where-Object { -not $before.ContainsKey($_) } | Sort-Object)
    $hits = @(Find-RemovedChainCalls $files $index)
    if ($hits.Count -eq 0) { return $result }
    $refused = @()
    $warned = @()
    foreach ($hit in $hits) {
        if ($hit.Label -eq $UnverifiableLabel) {
            if ($newlyRemoved.Count -gt 0) { $refused += $hit } else { $warned += $hit }
        } elseif ($before.ContainsKey($hit.Name.Trim().ToUpperInvariant())) {
            $warned += $hit
        } else {
            $refused += $hit
        }
    }
    if ($refused.Count -gt 0) {
        foreach ($hit in $refused) {
            if ($hit.Label -eq $UnverifiableLabel) {
                Write-Host "[ERREUR] Fichier en ligne $($hit.File) appelle ChainFactory.createEvmChain de facon non verifiable: $($hit.Name)" -ForegroundColor Red
            } else {
                Write-Host "[ERREUR] Fichier en ligne $($hit.File) appelle ChainFactory.createEvmChain(""$($hit.Name)""): chaine retiree par cette publication $($hit.Label)" -ForegroundColor Red
            }
        }
        $newLabels = @($newlyRemoved | ForEach-Object { $index[$_] } | Sort-Object -Unique) -join ", "
        Write-Host "  Chaines retirees par cette publication (absentes de la liste de la fabrique en ligne): $newLabels" -ForegroundColor Red
        Write-Host "  Le classeur charge aujourd'hui avec ce fichier; publiee, la nouvelle fabrique leverait CHAIN_REMOVED au chargement" -ForegroundColor Red
        Write-Host "  et bloquerait tout le script. Inclure dans src/ une version neutralisee de ce fichier (ou le supprimer" -ForegroundColor Red
        Write-Host "  du projet Apps Script), puis relancer." -ForegroundColor Red
        $result.Refused = $true
        return $result
    }
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Yellow
    Write-Host "  [WARN] FICHIER EN LIGNE DE CHAINE RETIREE" -ForegroundColor Red
    foreach ($hit in $warned) {
        if ($hit.Label -eq $UnverifiableLabel) {
            Write-Host "  [WARN] Fichier en ligne $($hit.File) appelle ChainFactory.createEvmChain de facon non verifiable: $($hit.Name)" -ForegroundColor Red
        } else {
            Write-Host "  [WARN] Fichier en ligne $($hit.File) appelle ChainFactory.createEvmChain(""$($hit.Name)""): chaine retiree $($hit.Label)" -ForegroundColor Red
        }
    }
    Write-Host "  Ce fichier n'est pas dans src/ et safe-push ne supprime jamais un fichier en ligne." -ForegroundColor Red
    Write-Host "  La fabrique en ligne retire deja cette chaine (ou cette publication n'en retire aucune nouvelle):" -ForegroundColor Red
    Write-Host "  la version en ligne est deja dans cet etat, cette publication ne la casse pas." -ForegroundColor Red
    Write-Host "  Il doit etre neutralise ou supprime dans le projet Apps Script avant ou avec cette publication" -ForegroundColor Red
    Write-Host "  (avec = sa version neutralisee dans src/). Sinon, fais-le juste apres ce push." -ForegroundColor Red
    Write-Host "  Publication poursuivie: un refus empecherait de pousser une reparation." -ForegroundColor Yellow
    Write-Host "  ========================================" -ForegroundColor Yellow
    Write-Host ""
    $result.Warnings = $warned
    return $result
}

# Controle A (local, avant clasp). Si src/ manque, les verifications plus bas
# donnent leur propre erreur.
$guardFiles = @()
if (Test-Path $SrcDir) { $guardFiles = @(Get-ChildItem -Path $SrcDir -Filter "*.gs" -File) }
$guardFactoryPushed = Join-Path $SrcDir "19_CHAIN_FACTORY.gs"
$guardFactoryRepo = Join-Path (Join-Path $PSScriptRoot "src") "19_CHAIN_FACTORY.gs"
if (Test-Path -LiteralPath $guardFactoryPushed) {
    $guardRefused = Test-RemovedChainFiles $guardFactoryPushed $guardFiles "src/19_CHAIN_FACTORY.gs (dossier pousse)"
} elseif (Test-Path -LiteralPath $guardFactoryRepo) {
    $guardRefused = Test-RemovedChainFiles $guardFactoryRepo $guardFiles "19_CHAIN_FACTORY.gs du depot voisin du script"
} else {
    $guardRefused = $false
    Write-Host "[INFO] Garde chaines retirees: 19_CHAIN_FACTORY.gs absent en local, controle refait apres le pull" -ForegroundColor Gray
}
if ($guardRefused) {
    Write-Host "  Ce controle (A) suit la fabrique du dossier pousse ou du depot: il peut etre plus strict" -ForegroundColor Red
    Write-Host "  que l'etat en ligne. Le controle B, apres le pull, suit la fabrique qui sera en ligne." -ForegroundColor Red
    Write-Host "  Aucun appel a clasp, aucune modification effectuee." -ForegroundColor Red
    exit 1
}

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
    $pullOutput = & clasp pull 2>&1
    $pullExitCode = $LASTEXITCODE
    if ($pullExitCode -ne 0) {
        throw "clasp pull a echoue avec le code $pullExitCode`n$($pullOutput -join [Environment]::NewLine)"
    }
    $pullSucceeded = $true
    Write-Host "  [OK] Pull reussi" -ForegroundColor Green
} catch {
    Pop-Location
    Write-Host "  [ERREUR] Pull distant echoue; push annule" -ForegroundColor Red
    Write-Host $_ -ForegroundColor Red
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    exit 1
}
Pop-Location

# Un push ne gele les triggers que si l'autorisation OAuth change (nouveau
# scope ou nouveau service avance). Sinon les triggers gardent l'autorisation
# deja accordee et continuent de tourner: mesure du 2026-08-06, watchdog, scan
# web et triggers CEX toujours actifs 23 min apres un push, sans auto-heal.
# On compare donc le manifest local au manifest distant ramene par le pull et
# on n'exige une reautorisation que si l'un des deux a bouge.
function Get-ManifestAuthSignature($manifestPath) {
    if (-not (Test-Path $manifestPath)) { return $null }
    try { $m = Get-Content $manifestPath -Raw | ConvertFrom-Json } catch { return $null }
    $scopes = @()
    if ($m.oauthScopes) { $scopes = @($m.oauthScopes) | Sort-Object }
    $services = @()
    if ($m.dependencies -and $m.dependencies.enabledAdvancedServices) {
        $services = @($m.dependencies.enabledAdvancedServices | ForEach-Object { "$($_.serviceId):$($_.version)" }) | Sort-Object
    }
    return (($scopes -join "|") + " ## " + ($services -join "|"))
}

$localAuth = Get-ManifestAuthSignature (Join-Path $SrcDir "appsscript.json")
$remoteAuth = Get-ManifestAuthSignature (Join-Path $TempDir "appsscript.json")
if ($null -eq $localAuth -or $null -eq $remoteAuth) {
    $authState = "unknown"
} elseif ($localAuth -eq $remoteAuth) {
    $authState = "unchanged"
} else {
    $authState = "changed"
}

# ============================================================================
# ETAPE 3: Merger - garder fichiers distants + ajouter/remplacer par src/
# ============================================================================
Write-Host ""
Write-Host "[3/6] Fusion des fichiers..." -ForegroundColor Yellow

# Compter fichiers distants
$remoteJsFiles = Get-ChildItem -Path $TempDir -Filter "*.js" -File -ErrorAction SilentlyContinue
$remoteCount = if ($remoteJsFiles) { $remoteJsFiles.Count } else { 0 }
Write-Host "  Fichiers distants: $remoteCount" -ForegroundColor Gray

# Garde chaines retirees: liste de la fabrique en ligne AVANT la fusion (celle
# que le pull vient de ramener). Elle dit si un fichier present seulement en
# ligne est deja casse en ligne, ou si cette publication le casserait.
$guardFactoryOnlineBefore = Join-Path $TempDir "19_CHAIN_FACTORY.js"
$guardOnlineIndexBefore = $null
if (Test-Path -LiteralPath $guardFactoryOnlineBefore) { $guardOnlineIndexBefore = Get-RemovedChainIndex $guardFactoryOnlineBefore }

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

# Le manifest de src/ est source de verite au meme titre que les .gs. Sans cette
# copie, clasp repousse le manifest ramene du distant: un scope ajoute dans
# src/appsscript.json ne serait jamais applique, alors que l'etape 7 reclamerait
# une reautorisation pour ce scope absent du projet deploye.
$localManifest = Join-Path $SrcDir "appsscript.json"
if (Test-Path $localManifest) {
    Copy-Item $localManifest -Destination (Join-Path $TempDir "appsscript.json") -Force
    Write-Host "  Manifest: src/appsscript.json pousse" -ForegroundColor Gray
}

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

# Garde chaines retirees, controle B: meme regle que le controle A, avec la
# liste de la fabrique qui sera reellement en ligne apres le push (celle de
# src/ si elle est poussee, sinon celle que le pull vient de ramener). Un
# fichier de src/ fautif est refuse; un fichier present seulement en ligne
# (ramene par le pull, absent de src/) est refuse si cette publication retire
# sa chaine, et seulement signale si la fabrique en ligne la retirait deja.
$guardOnlineHits = @()
$guardFactoryMerged = Join-Path $TempDir "19_CHAIN_FACTORY.js"
if (Test-Path -LiteralPath $guardFactoryMerged) {
    if (Test-RemovedChainFiles $guardFactoryMerged $gsFiles "19_CHAIN_FACTORY apres fusion (fabrique qui serait en ligne)") {
        Write-Host "  Push annule: aucune modification du projet distant." -ForegroundColor Red
        if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
        exit 1
    }
    $guardPushedJs = @($gsFiles | ForEach-Object { $_.Name -replace '\.gs$', '.js' })
    $guardOnlineFiles = @(Get-ChildItem -Path $TempDir -Filter "*.js" -File | Where-Object { $guardPushedJs -notcontains $_.Name })
    $guardOnline = Test-RemovedChainOnlineFiles $guardFactoryMerged $guardOnlineIndexBefore $guardOnlineFiles
    if ($guardOnline.Refused) {
        Write-Host "  Push annule: aucune modification du projet distant." -ForegroundColor Red
        if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
        exit 1
    }
    $guardOnlineHits = @($guardOnline.Warnings)
} else {
    Write-Host "  [WARN] Garde chaines retirees: 19_CHAIN_FACTORY absent du projet distant et de src/, controle ignore" -ForegroundColor Yellow
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

if (-not $pullSucceeded) {
    Write-Host "  [ERREUR] Push --force refuse sans pull distant reussi" -ForegroundColor Red
    exit 1
}

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
# ETAPE 7: Post-push - verifier et reparer les triggers
# ============================================================================
Write-Host ""
Write-Host "[7/7] Verification des triggers..." -ForegroundColor Yellow

$scriptId = $originalClasp.scriptId
$editorUrl = "https://script.google.com/home/projects/$scriptId/edit"

if ($authState -eq "changed") {
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Yellow
    Write-Host "  SCOPES OAUTH MODIFIES: reautorisation requise" -ForegroundColor Red
    Write-Host "  Les triggers existants tournent sous l'ancienne" -ForegroundColor Red
    Write-Host "  autorisation et vont echouer en silence." -ForegroundColor Red
    Write-Host "  ========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Ouvre l'editeur Apps Script:" -ForegroundColor Cyan
    Write-Host "     $editorUrl" -ForegroundColor White
    Write-Host ""
    Write-Host "  2. Selectionne WCORE_AUTO_HEAL_FORCE puis clique 'Executer'" -ForegroundColor Cyan
    Write-Host "     (accepte le dialogue d'autorisation Google)" -ForegroundColor Gray
    Write-Host "  ========================================" -ForegroundColor Yellow
    Write-Host ""
    try {
        Start-Process $editorUrl
        Write-Host "  [OK] Editeur Apps Script ouvert" -ForegroundColor Green
    } catch {
        Write-Host "  [INFO] Copie l'URL ci-dessus pour ouvrir l'editeur" -ForegroundColor Gray
    }
} elseif ($authState -eq "unchanged") {
    Write-Host "  [OK] Scopes OAuth et services avances inchanges" -ForegroundColor Green
    Write-Host "  Les triggers gardent leur autorisation: aucun auto-heal requis." -ForegroundColor Gray
    Write-Host "  Controle: dans 'Recap Portfolio', les colonnes PULSE (B1), STATUS (I1)" -ForegroundColor Gray
    Write-Host "  et LAST SCAN (J1) doivent continuer d'avancer. Si elles se figent," -ForegroundColor Gray
    Write-Host "  lance WCORE_AUTO_HEAL_FORCE depuis l'editeur." -ForegroundColor Gray
} else {
    Write-Host "  [WARN] Manifest illisible: comparaison des scopes impossible" -ForegroundColor Yellow
    Write-Host "  Verifie 'Recap Portfolio' et lance WCORE_AUTO_HEAL_FORCE si les" -ForegroundColor Gray
    Write-Host "  horodatages cessent d'avancer:" -ForegroundColor Gray
    Write-Host "     $editorUrl" -ForegroundColor White
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
if ($guardOnlineHits.Count -gt 0) {
    $guardOnlineNames = @($guardOnlineHits | ForEach-Object { $_.File } | Sort-Object -Unique) -join ", "
    Write-Host "  [WARN] RAPPEL: fichier(s) en ligne de chaine retiree a neutraliser ou supprimer dans le projet Apps Script: $guardOnlineNames" -ForegroundColor Red
    Write-Host ""
}

} finally {
    # Liberer le verrou: fermer le stream supprime le fichier si vide, sinon
    # on l'efface explicitement. Le handle OS garantit l'exclusivite jusqu'ici.
    if ($lockStream) {
        try { $lockStream.Dispose() } catch {}
    }
    try { Remove-Item $PushLockPath -Force -ErrorAction SilentlyContinue } catch {}
}
