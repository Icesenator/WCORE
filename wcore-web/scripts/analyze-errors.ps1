# analyze-errors.ps1 - Scan API errors and suggest/apply RPC fixes
# Usage: powershell -File scripts/analyze-errors.ps1 [-AutoFix]

param(
    [switch]$AutoFix
)

$ErrorActionPreference = "Stop"
$API_URL = "https://api-production-b5bf.up.railway.app"
$CHAINS_DIR = "packages/core/src/chains"

Write-Host "=== WCORE Error Analyzer ===" -ForegroundColor Cyan
Write-Host "API: $API_URL" -ForegroundColor Gray
Write-Host ""

# Fetch error details
try {
    $r = Invoke-WebRequest -Uri "$API_URL/api/metrics/errors/detail" -UseBasicParsing -TimeoutSec 10
    $data = $r.Content | ConvertFrom-Json
} catch {
    Write-Host "FAIL: Cannot reach API - $_" -ForegroundColor Red
    exit 1
}

Write-Host "Total error samples: $($data.total)" -ForegroundColor Gray
Write-Host ""

# Parse raw JSON manually to avoid duplicate key issues
$rawJson = $r.Content
$byChainStart = $rawJson.IndexOf('"byChain":')
if ($byChainStart -lt 0) { Write-Host "No byChain data found"; exit 0 }

# Extract chain error counts from the summary endpoint
try {
    $summary = Invoke-WebRequest -Uri "$API_URL/api/metrics/errors" -UseBasicParsing -TimeoutSec 10
    $summaryData = $summary.Content | ConvertFrom-Json
} catch {
    Write-Host "FAIL: Cannot fetch summary - $_" -ForegroundColor Red
    exit 1
}

# Collect real errors (not BAL_CACHE, not pricing NO_PRICE)
$realErrors = @()
$recentErrors = $data.recent
foreach ($e in $recentErrors) {
    $msg = $e.message
    $chain = $e.chain
    $type = $e.type

    # Skip BAL_CACHE (expected) and pricing NO_PRICE (normal for long-tail)
    if ($msg -match "BAL_CACHE") { continue }
    if ($type -eq "pricing" -and $msg -match "NO_PRICE") { continue }

    $realErrors += @{ chain = $chain; type = $type; message = $msg }
}

if ($realErrors.Count -eq 0) {
    Write-Host "No real errors found. All clean!" -ForegroundColor Green
    exit 0
}

Write-Host "Real errors (excluding BAL_CACHE + NO_PRICE): $($realErrors.Count)" -ForegroundColor Yellow
Write-Host ""

# Group by chain
$byChain = @{}
foreach ($e in $realErrors) {
    if (-not $byChain.ContainsKey($e.chain)) { $byChain[$e.chain] = @() }
    $byChain[$e.chain] += $e.message
}

$fixes = @()

foreach ($chainKey in $byChain.Keys) {
    $messages = $byChain[$chainKey]
    $uniqueMessages = $messages | Select-Object -Unique

    Write-Host "--- $chainKey ($($messages.Count) errors) ---" -ForegroundColor White

    # Classify error types
    $blockRangeErrors = $uniqueMessages | Where-Object { $_ -match "block range|block range is too|block range too|max range|maximum.*blocks|limited to.*blocks" }
    $publicnodeErrors = $uniqueMessages | Where-Object { $_ -match "publicnode.*-32701|publicnode.*History has been pruned|publicnode.*specify an address" }
    $dnsErrors = $uniqueMessages | Where-Object { $_ -match "name resolution|could not be resolved|Le nom distant" }
    $timeoutErrors = $uniqueMessages | Where-Object { $_ -match "chain_timeout|exceeded limit" }
    $consensusErrors = $uniqueMessages | Where-Object { $_ -match "consensus failed" }
    $httpErrors = $uniqueMessages | Where-Object { $_ -match "HTTP [45]" }
    $otherErrors = $uniqueMessages | Where-Object { $_ -notmatch "block range|publicnode|resolution|chain_timeout|consensus|HTTP [45]" }

    $chainUpper = $chainKey.ToUpper()
    $chainFile = "$CHAINS_DIR/$chainUpper.ts"

    if (-not (Test-Path $chainFile)) {
        # Try case-insensitive search
        $found = Get-ChildItem -Path $CHAINS_DIR -Filter "*.ts" | Where-Object { $_.Name -replace "\.ts$","" -eq $chainUpper }
        if ($found) { $chainFile = $found.FullName }
    }

    # Determine MAX_LOG_RANGE from error messages
    $maxLogRange = $null
    foreach ($msg in $blockRangeErrors) {
        if ($msg -match "maximum.*?(\d+)" -or $msg -match "max range:?\s*(\d+)" -or $msg -match "limited to.*?(\d+)" -or $msg -match "maximum allowed is (\d+)") {
            $limit = [int]$Matches[1]
            if ($null -eq $maxLogRange -or $limit -lt $maxLogRange) { $maxLogRange = $limit }
        }
    }

    if ($blockRangeErrors.Count -gt 0 -and $maxLogRange) {
        Write-Host "  BLOCK RANGE: max $($maxLogRange) blocks" -ForegroundColor Red
        $fixes += @{ chain = $chainKey; type = "MAX_LOG_RANGE"; value = $maxLogRange; file = $chainFile }
    }

    if ($publicnodeErrors.Count -gt 0) {
        Write-Host "  PUBLICNODE: restricted/pruned (-32701)" -ForegroundColor Red
        $fixes += @{ chain = $chainKey; type = "REMOVE_PUBLICNODE"; file = $chainFile }
    }

    if ($dnsErrors.Count -gt 0) {
        Write-Host "  DNS: endpoint unreachable" -ForegroundColor Red
        $fixes += @{ chain = $chainKey; type = "REMOVE_DEAD_DNS"; file = $chainFile }
    }

    if ($timeoutErrors.Count -gt 0) {
        Write-Host "  TIMEOUT: $($timeoutErrors.Count)x chain_timeout" -ForegroundColor Yellow
        $fixes += @{ chain = $chainKey; type = "TIMEOUT"; file = $chainFile }
    }

    if ($consensusErrors.Count -gt 0) {
        Write-Host "  CONSENSUS: $($consensusErrors.Count)x consensus failed" -ForegroundColor Yellow
        $fixes += @{ chain = $chainKey; type = "CONSENSUS"; file = $chainFile }
    }

    if ($httpErrors.Count -gt 0) {
        Write-Host "  HTTP: $($httpErrors -join ', ')" -ForegroundColor Yellow
        $fixes += @{ chain = $chainKey; type = "HTTP_ERROR"; file = $chainFile }
    }

    if ($otherErrors.Count -gt 0) {
        Write-Host "  OTHER: $($otherErrors -join '; ')" -ForegroundColor Gray
    }

    Write-Host ""
}

# Summary
Write-Host "=== Suggested Fixes ===" -ForegroundColor Cyan
foreach ($fix in $fixes) {
    $icon = switch ($fix.type) {
        "MAX_LOG_RANGE" { "[FIX]" }
        "REMOVE_PUBLICNODE" { "[DEL]" }
        "REMOVE_DEAD_DNS" { "[DEL]" }
        "TIMEOUT" { "[TMO]" }
        "CONSENSUS" { "[CNS]" }
        "HTTP_ERROR" { "[HTTP]" }
        default { "[???]" }
    }
    Write-Host "  $icon $($fix.chain): $($fix.type) $(if ($fix.value) { "=$($fix.value)" })" -ForegroundColor White
}

Write-Host ""
Write-Host "Total fixes suggested: $($fixes.Count)" -ForegroundColor Cyan
Write-Host ""

if ($AutoFix -and $fixes.Count -gt 0) {
    Write-Host "Auto-fix mode enabled. Applying fixes..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "NOTE: Auto-fix is not yet implemented. Please apply fixes manually based on the suggestions above." -ForegroundColor Yellow
    Write-Host "Run: powershell -File scripts/analyze-errors.ps1 (without -AutoFix) to review, then edit chain files manually." -ForegroundColor Gray
}
