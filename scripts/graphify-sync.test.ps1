param([switch]$RealCorpus)

$ErrorActionPreference = 'Stop'
$wcoreRoot = Split-Path $PSScriptRoot -Parent
$hubRoot = Split-Path $wcoreRoot -Parent
$assertionCount = 0
$failed = $false

function Assert-True {
    param([bool]$Condition, [string]$Message)
    $script:assertionCount++
    if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    $script:assertionCount++
    if ($Actual -ne $Expected) { throw "Assertion failed: $Message (expected '$Expected', got '$Actual')" }
}

function Assert-ThrowsMatching {
    param([scriptblock]$Action, [string]$Pattern, [string]$Message)
    $script:assertionCount++
    try {
        & $Action
    } catch {
        if ($_.Exception.Message -notmatch $Pattern) {
            throw "Assertion failed: $Message (expected error matching '$Pattern', got '$($_.Exception.Message)')"
        }
        return
    }
    throw "Assertion failed: $Message (expected operation to throw)"
}

try {
    $shared = Join-Path $hubRoot 'scripts\graphify-project.ps1'
    Assert-True (Test-Path -LiteralPath $shared -PathType Leaf) "shared wrapper exists at $shared"

    $statusPath = Join-Path $wcoreRoot 'graphify-out\status.json'
    Assert-True (Test-Path -LiteralPath $statusPath -PathType Leaf) "status exists at $statusPath"
    $parsedStatus = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json -ErrorAction Stop
    Assert-True ([string]$parsedStatus.result -eq 'success') "status result is success: $($parsedStatus.result)"

    $graph = Join-Path $wcoreRoot 'graphify-out\graph.json'
    Assert-True (Test-Path -LiteralPath $graph -PathType Leaf) "graph exists at $graph"
    $parsed = Get-Content -LiteralPath $graph -Raw | ConvertFrom-Json -ErrorAction Stop
    Assert-True ($null -ne $parsed.nodes -and $null -ne $parsed.links) 'graph has nodes and links arrays'

    Write-Output "OK - $assertionCount assertions passed (WCORE Graphify delegate contract)"
} catch {
    Write-Output "FAILED: $($_.Exception.Message)"
    exit 1
}
