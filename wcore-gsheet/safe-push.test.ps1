$ErrorActionPreference = "Stop"
$testsPassed = 0
$testsFailed = 0

function Test-SafePush {
    param(
        [int]$PullExitCode,
        [int]$ExpectedExitCode,
        [bool]$ExpectPush,
        [string]$Label,
        # Fichiers ajoutes dans src/ (nom -> contenu).
        [hashtable]$SrcFiles = @{},
        # Copie tous les .gs reels du depot dans src/, sauf ceux de -ExcludeRealSrc.
        [switch]$RealSrc,
        [string[]]$ExcludeRealSrc = @(),
        # Contenu du 19_CHAIN_FACTORY.js ramene par le pull simule (vide = aucun).
        [string]$RemoteFactory = "",
        # Autres fichiers ramenes par le pull simule (nom .js -> contenu).
        [hashtable]$RemoteFiles = @{},
        # Lance le safe-push.ps1 du depot (et non sa copie) depuis le dossier de test.
        [switch]$RunFromRepo,
        # Fichiers que la garde chaines retirees doit nommer (vide = aucun refus de la garde).
        [string[]]$ExpectRefusedFiles = @(),
        # Fichiers en ligne que la garde doit signaler en avertissement (vide = aucun avertissement).
        [string[]]$ExpectOnlineWarnings = @(),
        # Appels a clasp attendus, dans l'ordre, separes par des virgules ("*" = non verifie).
        [string]$ExpectClaspCalls = "*",
        # Expressions que la sortie doit contenir.
        [string[]]$ExpectOutput = @()
    )

    $testRoot = Join-Path $env:TEMP "wcore-safe-push-test-$([guid]::NewGuid().ToString('N').Substring(0,8))"
    $mockBin = Join-Path $testRoot "mock-bin"
    $pushMarker = Join-Path $testRoot "push-called.txt"
    $claspLog = Join-Path $testRoot "clasp-calls.txt"
    $remoteFixtures = Join-Path $testRoot "remote-fixtures"

    try {
        New-Item -ItemType Directory -Path (Join-Path $testRoot "src") -Force | Out-Null
        New-Item -ItemType Directory -Path $mockBin -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "safe-push.ps1") -Destination $testRoot
        Set-Content -LiteralPath (Join-Path $testRoot ".clasp.json") -Value '{"scriptId":"test-script","projectId":"test-project","rootDir":"src"}'
        Set-Content -LiteralPath (Join-Path $testRoot "src\Code.gs") -Value 'function test() { return true; }'
        Set-Content -LiteralPath (Join-Path $testRoot "src\appsscript.json") -Value '{"oauthScopes":[]}'
        if ($RealSrc) {
            Get-ChildItem -Path (Join-Path $PSScriptRoot "src") -Filter "*.gs" -File |
                Where-Object { $ExcludeRealSrc -notcontains $_.Name } |
                Copy-Item -Destination (Join-Path $testRoot "src")
        }
        foreach ($name in $SrcFiles.Keys) {
            Set-Content -LiteralPath (Join-Path $testRoot "src\$name") -Value $SrcFiles[$name]
        }
        $remoteContents = @{} + $RemoteFiles
        if ($RemoteFactory) { $remoteContents["19_CHAIN_FACTORY.js"] = $RemoteFactory }
        $pullRemoteLine = ""
        if ($remoteContents.Count -gt 0) {
            New-Item -ItemType Directory -Path $remoteFixtures -Force | Out-Null
            foreach ($name in $remoteContents.Keys) {
                Set-Content -LiteralPath (Join-Path $remoteFixtures $name) -Value $remoteContents[$name]
            }
            $pullRemoteLine = "copy /y `"$remoteFixtures\*.js`" . >nul"
        }

        $mock = @"
@echo off
echo %~1>>"$claspLog"
if "%~1"=="--version" goto version
if "%~1"=="pull" goto pull
if "%~1"=="push" goto push
exit /b 1
:version
exit /b 0
:pull
if "$PullExitCode"=="0" goto pullsuccess
exit /b $PullExitCode
:pullsuccess
echo {"oauthScopes":[]}>appsscript.json
echo function remote^(^) { return true; }>Remote.js
$pullRemoteLine
exit /b 0
:push
echo called>"$pushMarker"
exit /b 0
"@
        Set-Content -LiteralPath (Join-Path $mockBin "clasp.cmd") -Value $mock

        $scriptUnderTest = Join-Path $testRoot "safe-push.ps1"
        if ($RunFromRepo) { $scriptUnderTest = Join-Path $PSScriptRoot "safe-push.ps1" }

        $oldPath = $env:PATH
        $env:PATH = "$mockBin;$oldPath"
        Push-Location $testRoot
        try {
            $output = powershell -NoProfile -ExecutionPolicy Bypass -File $scriptUnderTest 2>&1
            $actualExitCode = $LASTEXITCODE
        } finally {
            Pop-Location
            $env:PATH = $oldPath
        }

        $pushCalled = Test-Path $pushMarker
        if ($actualExitCode -ne $ExpectedExitCode -or $pushCalled -ne $ExpectPush) {
            throw "expected exit=$ExpectedExitCode push=$ExpectPush; got exit=$actualExitCode push=$pushCalled. Output: $($output -join ' | ')"
        }

        $refusedFiles = @($output | ForEach-Object { if ("$_" -match '^\[ERREUR\] src\\(\S+) appelle ChainFactory\.createEvmChain') { $Matches[1] } } | Sort-Object -Unique)
        $expectedRefused = @($ExpectRefusedFiles | Sort-Object -Unique)
        if (($refusedFiles -join ',') -ne ($expectedRefused -join ',')) {
            throw "expected refused files=[$($expectedRefused -join ',')]; got [$($refusedFiles -join ',')]. Output: $($output -join ' | ')"
        }

        $onlineWarnings = @($output | ForEach-Object { if ("$_" -match '^\s*\[WARN\] Fichier en ligne (\S+) appelle ChainFactory\.createEvmChain') { $Matches[1] } } | Sort-Object -Unique)
        $expectedWarnings = @($ExpectOnlineWarnings | Sort-Object -Unique)
        if (($onlineWarnings -join ',') -ne ($expectedWarnings -join ',')) {
            throw "expected online warnings=[$($expectedWarnings -join ',')]; got [$($onlineWarnings -join ',')]. Output: $($output -join ' | ')"
        }

        if ($ExpectClaspCalls -ne "*") {
            $claspCalls = ""
            if (Test-Path $claspLog) { $claspCalls = (@(Get-Content $claspLog) | ForEach-Object { $_.Trim() }) -join ',' }
            if ($claspCalls -ne $ExpectClaspCalls) {
                throw "expected clasp calls=[$ExpectClaspCalls]; got [$claspCalls]"
            }
        }

        foreach ($pattern in $ExpectOutput) {
            if (-not (($output -join "`n") -match $pattern)) {
                throw "output does not match '$pattern'. Output: $($output -join ' | ')"
            }
        }

        if ($ExpectedExitCode -ne 0 -and (Test-Path (Join-Path $testRoot ".temp_push"))) {
            throw ".temp_push left behind after a refusal"
        }
        # Le verrou de deploiement doit etre libere, refus compris.
        if (Test-Path (Join-Path $testRoot ".push.lock")) {
            throw ".push.lock left behind"
        }

        $script:testsPassed++
        Write-Host "PASS: $Label"
    } catch {
        $script:testsFailed++
        Write-Host "FAIL: $Label - $_" -ForegroundColor Red
    } finally {
        if (Test-Path $testRoot) { Remove-Item $testRoot -Recurse -Force }
    }
}

Test-SafePush -PullExitCode 17 -ExpectedExitCode 1 -ExpectPush $false -Label "nonzero clasp pull aborts before push"
Test-SafePush -PullExitCode 0 -ExpectedExitCode 0 -ExpectPush $true -Label "successful clasp pull permits push"

# ----------------------------------------------------------------------------
# Garde chaines retirees (constat G7): un fichier qui appelle
# ChainFactory.createEvmChain pour un nom de WCORE_REMOVED_CHAINS est refuse.
# ----------------------------------------------------------------------------

# Fabrique fictive. Les commentaires citent des noms entre guillemets: seuls
# les litteraux des tableaux "ids" doivent etre lus.
$fixtureFactory = @'
var ChainFactory = ChainFactory || {};
// Le jeton "KEEPTOKEN" et le reseau "ALIVE" ne sont PAS concernes.
var WCORE_REMOVED_CHAINS = [
  { label: "Old Chain (4242)", ids: ["4242", "OLDCHAIN", "LEDGER - OLDCHAIN"] },
  /* "ALIVE2" : ne jamais l ajouter ici. */
  { label: "Gone (77)", ids: ["77", "GONE"] }
];
ChainFactory.createEvmChain = function(chainName, chainConfig) {
  if (_wcoreRemovedChain_(chainName)) throw new Error("CHAIN_REMOVED: " + chainName);
  return {};
};
'@

# Forme reelle de LISK.gs et GRAVITY.gs: appel de fabrique au chargement.
$fixtureRemovedChain = @'
/**
 * OLDCHAIN.gs - Old Chain
 */
var _OLDCHAIN = ChainFactory.createEvmChain("OLDCHAIN", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://rpc.oldchain.example"] },
 CHAIN: { NAME: "Old Chain", CHAIN_ID: 4242 }
});
function GET_WALLET_ASSETS_OLDCHAIN(a){return _OLDCHAIN.getWalletAssets(a);}
'@

# Meme chaine retiree: la fabrique compare apres trim + majuscules.
$fixtureRemovedChainLoose = @'
var _GONE = ChainFactory . createEvmChain( ' gone ' , {});
'@

# Chaines actives: noms hors liste, nom qui contient un identifiant retire,
# nom cite seulement dans un commentaire de la liste, autre fabrique (seule
# createEvmChain leve CHAIN_REMOVED).
$fixtureActiveChains = @'
var _ALIVE = ChainFactory.createEvmChain("ALIVE", {
 RPC: { ENDPOINTS: ["https://rpc.alive.example/v1"] },
 CHAIN: { NAME: "Alive", CHAIN_ID: 1 }
});
var _GONE2 = ChainFactory.createEvmChain("GONE2", {});
var _OLDCHAIN_L1 = ChainFactory.createEvmChain("OLDCHAIN_L1", {});
var _KEEPTOKEN = ChainFactory.createEvmChain("KEEPTOKEN", {});
var _ALIVE2 = ChainFactory.createEvmChain('ALIVE2', {});
var _COSMOS = ChainFactory.createCosmosChain("OLDCHAIN", {});
'@

# Nom retire seulement en commentaire ou dans une chaine de caracteres, sans
# appel de fabrique execute (forme d'un fichier tombstone comme B3.gs).
$fixtureMentionsOnly = @'
// OLDCHAIN (4242) retiree: var _OLDCHAIN = ChainFactory.createEvmChain("OLDCHAIN", {});
/*
 * Ancien code:
 * var _GONE = ChainFactory.createEvmChain("GONE", { CHAIN: { CHAIN_ID: 77 } });
 */
var DOC_URL = "https://example.org/docs"; // ChainFactory.createEvmChain('GONE', {})
function OLDCHAIN_REFRESH_STATUS() { return "[CHAIN_REMOVED] Old Chain (4242)"; }
function OLDCHAIN_HELP() { return 'ChainFactory.createEvmChain("OLDCHAIN", {}) leve CHAIN_REMOVED'; }
var REMOVED_NAMES = ["OLDCHAIN", "GONE", "4242"];
'@

# Refus avant tout appel a clasp (liste lue dans le src/ pousse).
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory; "OLDCHAIN.gs" = $fixtureRemovedChain } `
    -ExpectRefusedFiles @("OLDCHAIN.gs") `
    -ExpectOutput @('createEvmChain\("OLDCHAIN"\): chaine retiree Old Chain \(4242\)', 'Retire ce fichier du dossier de publication', 'Ce controle \(A\) suit la fabrique du dossier pousse ou du depot') `
    -Label "removed-chain file is refused before any clasp call"
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory; "GONE.gs" = $fixtureRemovedChainLoose; "ALIVE.gs" = $fixtureActiveChains } `
    -ExpectRefusedFiles @("GONE.gs") -ExpectOutput @('chaine retiree Gone \(77\)') `
    -Label "removed-chain name is matched after trim and uppercase"

# Publications legitimes: jamais bloquees.
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true -ExpectClaspCalls "--version,pull,push" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory; "ALIVE.gs" = $fixtureActiveChains } `
    -ExpectOutput @('Aucun fichier de chaine retiree \(5 identifiants') `
    -Label "active-chain files and the factory itself are pushed"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory; "TOMBSTONE.gs" = $fixtureMentionsOnly } `
    -Label "removed name only in comments or strings is pushed"

# Dossier de publication minimal (sans la fabrique): la liste vient du pull.
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "--version,pull" `
    -SrcFiles @{ "OLDCHAIN.gs" = $fixtureRemovedChain } -RemoteFactory $fixtureFactory `
    -ExpectRefusedFiles @("OLDCHAIN.gs") -ExpectOutput @('Push annule') `
    -Label "minimal folder: removed-chain file is refused after pull, before push"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "ALIVE.gs" = $fixtureActiveChains; "TOMBSTONE.gs" = $fixtureMentionsOnly } -RemoteFactory $fixtureFactory `
    -Label "minimal folder: active-chain and tombstone files are pushed"

# Formes d'appel que la detection litterale ne voyait pas (revue de la PR 131).
$fixtureCommentBetween = @'
var _GONE = ChainFactory./* fabrique */createEvmChain(/* nom */ "GONE", {});
'@
$fixtureVariableName = @'
var name = "GONE";
var _GONE = ChainFactory.createEvmChain(name, {});
'@
$fixtureConcatenation = @'
var _GONE = ChainFactory.createEvmChain("GO" + "NE", {});
'@
$fixtureTemplate = @'
var _GONE = ChainFactory.createEvmChain(`GONE`, {});
'@
$fixtureBracket = @'
var _GONE = ChainFactory["createEvmChain"]("GONE", {});
'@
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory; "COMMENTED.gs" = $fixtureCommentBetween } `
    -ExpectRefusedFiles @("COMMENTED.gs") -ExpectOutput @('createEvmChain\("GONE"\): chaine retiree Gone \(77\)') `
    -Label "a comment between the parts of the call does not hide it"
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory; "VARIABLE.gs" = $fixtureVariableName; "CONCAT.gs" = $fixtureConcatenation; "TEMPLATE.gs" = $fixtureTemplate; "BRACKET.gs" = $fixtureBracket } `
    -ExpectRefusedFiles @("BRACKET.gs", "CONCAT.gs", "TEMPLATE.gs", "VARIABLE.gs") -ExpectOutput @('de facon non verifiable') `
    -Label "a call that cannot be checked (variable, concatenation, template, string access) is refused"

# Fichiers presents seulement en ligne: safe-push ne les supprime jamais.
# Refus si cette publication retire leur chaine (le classeur charge aujourd'hui
# et ne chargerait plus); avertissement seulement si la fabrique en ligne la
# retirait deja (version en ligne deja cassee: un refus empecherait de pousser
# la reparation).
$fixtureFactoryOnlineOld = @'
var ChainFactory = ChainFactory || {};
var WCORE_REMOVED_CHAINS = [
  { label: "Gone (77)", ids: ["77", "GONE"] }
];
ChainFactory.createEvmChain = function(chainName, chainConfig) {
  if (_wcoreRemovedChain_(chainName)) throw new Error("CHAIN_REMOVED: " + chainName);
  return {};
};
'@
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "--version,pull" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory } -RemoteFactory $fixtureFactoryOnlineOld `
    -RemoteFiles @{ "OLDCHAIN.js" = $fixtureRemovedChain; "ALIVE.js" = $fixtureActiveChains } `
    -ExpectOutput @('\[ERREUR\] Fichier en ligne OLDCHAIN\.js appelle ChainFactory\.createEvmChain\("OLDCHAIN"\): chaine retiree par cette publication Old Chain \(4242\)', 'Chaines retirees par cette publication .*: Old Chain \(4242\)', 'Push annule') `
    -Label "online-only file of a chain this publication removes is refused"
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "--version,pull" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory } `
    -RemoteFiles @{ "OLDCHAIN.js" = $fixtureRemovedChain } `
    -ExpectOutput @('chaine retiree par cette publication Old Chain \(4242\)', 'Push annule') `
    -Label "without a readable online factory nothing proves the online file was broken: refused"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true -ExpectClaspCalls "--version,pull,push" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory } -RemoteFactory $fixtureFactory `
    -RemoteFiles @{ "OLDCHAIN.js" = $fixtureRemovedChain; "ALIVE.js" = $fixtureActiveChains } `
    -ExpectOnlineWarnings @("OLDCHAIN.js") `
    -ExpectOutput @('Fichier en ligne OLDCHAIN\.js appelle ChainFactory\.createEvmChain\("OLDCHAIN"\): chaine retiree Old Chain \(4242\)', 'La fabrique en ligne retire deja cette chaine', 'neutralise ou supprime dans le projet Apps Script avant ou avec cette publication', 'RAPPEL: fichier\(s\) en ligne de chaine retiree .*: OLDCHAIN\.js') `
    -Label "online-only file already broken online warns and the push still happens"
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "--version,pull" `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory } -RemoteFactory $fixtureFactoryOnlineOld `
    -RemoteFiles @{ "VARIABLE.js" = $fixtureVariableName } `
    -ExpectOutput @('Fichier en ligne VARIABLE\.js appelle ChainFactory\.createEvmChain de facon non verifiable', 'Push annule') `
    -Label "online-only unverifiable call is refused when this publication removes a chain"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "ALIVE.gs" = $fixtureActiveChains } -RemoteFactory $fixtureFactory `
    -RemoteFiles @{ "VARIABLE.js" = $fixtureVariableName } `
    -ExpectOnlineWarnings @("VARIABLE.js") `
    -Label "online-only unverifiable call only warns when this publication removes no chain"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "ALIVE.gs" = $fixtureActiveChains } -RemoteFactory $fixtureFactory `
    -RemoteFiles @{ "GONE.js" = $fixtureRemovedChainLoose } `
    -ExpectOnlineWarnings @("GONE.js") `
    -Label "minimal folder: online-only removed-chain file warns and the push still happens"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory } `
    -RemoteFiles @{ "ALIVE.js" = $fixtureActiveChains; "TOMBSTONE.js" = $fixtureMentionsOnly } `
    -Label "healthy online files give no warning"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = $fixtureFactory; "OLDCHAIN.gs" = $fixtureMentionsOnly } `
    -RemoteFiles @{ "OLDCHAIN.js" = $fixtureRemovedChain } `
    -Label "online removed-chain file replaced by a neutralized src file gives no warning"

# Aucune liste lisible (ni src/, ni depot voisin, ni projet distant): la garde
# avertit et ne refuse rien.
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "OLDCHAIN.gs" = $fixtureRemovedChain } `
    -ExpectOutput @('\[WARN\] Garde chaines retirees') `
    -Label "no readable removed-chain list warns and does not block"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true `
    -SrcFiles @{ "19_CHAIN_FACTORY.gs" = 'var ChainFactory = {};'; "OLDCHAIN.gs" = $fixtureRemovedChain } `
    -ExpectOutput @('WCORE_REMOVED_CHAINS illisible') `
    -Label "unparseable removed-chain list warns and does not block"

# Liste reelle du depot (fige le format de WCORE_REMOVED_CHAINS dans
# src/19_CHAIN_FACTORY.gs): script lance depuis le depot, dossier courant
# minimal, liste lue a cote du script.
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "" -RunFromRepo `
    -SrcFiles @{ "SUPERSEED.gs" = 'var _SUPERSEED = ChainFactory.createEvmChain("SUPERSEED", {});' } `
    -ExpectRefusedFiles @("SUPERSEED.gs") -ExpectOutput @('SUPERSEED \(5330\)', 'depot voisin du script') `
    -Label "real list next to the script refuses a removed chain"

# Corpus reel du depot. LISK.gs et GRAVITY.gs appellent encore la fabrique au
# chargement (a retirer de -ExpectRefusedFiles et de -ExcludeRealSrc le jour
# ou ils deviennent des tombstones); aucun autre fichier reel n'est refuse.
Test-SafePush -ExpectedExitCode 1 -ExpectPush $false -ExpectClaspCalls "" -RealSrc `
    -ExpectRefusedFiles @("GRAVITY.gs", "LISK.gs") `
    -Label "real src: only LISK.gs and GRAVITY.gs are refused"
Test-SafePush -ExpectedExitCode 0 -ExpectPush $true -RealSrc -ExcludeRealSrc @("GRAVITY.gs", "LISK.gs") `
    -Label "real src without removed-chain files is pushed"

Write-Host "$testsPassed passed, $testsFailed failed"
if ($testsFailed -gt 0) { exit 1 }
