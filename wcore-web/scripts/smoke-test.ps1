# WCORE Staging Smoke Tests
# Usage: .\scripts\smoke-test.ps1 [-ApiPort 4001] [-WebPort 3001]

param(
  [string]$ApiPort = "4001",
  [string]$WebPort = "3001"
)

$ErrorActionPreference = "Stop"
$failed = 0
$passed = 0
$api = "http://127.0.0.1:${ApiPort}"
$web = "http://127.0.0.1:${WebPort}"

function Test-Case {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Body
  )

  try {
    & $Body
    Write-Host "  OK   $Name" -ForegroundColor Green
    $global:passed++
  }
  catch {
    Write-Host "  FAIL $Name - $_" -ForegroundColor Red
    $global:failed++
  }
}

Write-Host "`n=== WCORE Staging Smoke Tests ===" -ForegroundColor Cyan

Test-Case "/health returns 200" {
  $r = Invoke-RestMethod -Uri "$api/health" -TimeoutSec 5
  if ($r.status -ne "ok") { throw "status=$($r.status)" }
  $openCircuits = @($r.circuits.PSObject.Properties.Value | Where-Object { $_.state -eq "OPEN" })
  if ($openCircuits.Count -gt 0) { throw "open circuits=$($openCircuits.Count)" }
}

Test-Case "/health shows uptime > 0" {
  $r = Invoke-RestMethod -Uri "$api/health" -TimeoutSec 5
  if ($r.uptimeSec -le 0) { throw "uptime=$($r.uptimeSec)" }
}

Test-Case "CORS preflight returns 204" {
  $r = Invoke-WebRequest -Uri "$api/api/scan" -Method Options -Headers @{
    "Origin" = $web
    "Access-Control-Request-Method" = "POST"
  } -TimeoutSec 5 -UseBasicParsing
  if ($r.StatusCode -ne 204) { throw "status=$($r.StatusCode)" }
  if (-not $r.Headers["access-control-allow-methods"]) { throw "missing Access-Control-Allow-Methods" }
}

Test-Case "CORS blocks unauthorized origin" {
  $r = Invoke-WebRequest -Uri "$api/api/scan" -Method Options -Headers @{
    "Origin" = "https://evil.com"
    "Access-Control-Request-Method" = "POST"
  } -TimeoutSec 5 -UseBasicParsing
  $cors = $r.Headers["Access-Control-Allow-Origin"]
  if ($cors -and $cors -eq "https://evil.com") { throw "allowed evil origin" }
}

Test-Case "/api/chains returns 180+ chains" {
  $r = Invoke-RestMethod -Uri "$api/api/chains" -TimeoutSec 5
  if ($r.count -lt 180) { throw "count=$($r.count)" }
}

Test-Case "/api/chains includes chainlist data" {
  $r = Invoke-RestMethod -Uri "$api/api/chains" -TimeoutSec 5
  $base = $r.chains | Where-Object { $_.key -eq "BASE" } | Select-Object -First 1
  if (-not $base) { throw "BASE not found" }
  if (-not $base.chainId) { throw "chainId missing" }
}

Test-Case "/api/circuit returns CLOSED" {
  $r = Invoke-RestMethod -Uri "$api/api/circuit" -TimeoutSec 5
  $openCircuits = @($r.circuits.PSObject.Properties.Value | Where-Object { $_.state -eq "OPEN" })
  if ($openCircuits.Count -gt 0) { throw "open circuits=$($openCircuits.Count)" }
}

Test-Case "/api/quests returns quests" {
  $r = Invoke-RestMethod -Uri "$api/api/quests" -TimeoutSec 5
  if (-not $r.quests -or $r.quests.Count -eq 0) { throw "no quests" }
}

Test-Case "/api/leaderboard returns array" {
  $r = Invoke-RestMethod -Uri "$api/api/leaderboard" -TimeoutSec 5
  if ($r.leaderboard -isnot [array]) { throw "not an array" }
}

Test-Case "/api/badges returns badges" {
  $r = Invoke-RestMethod -Uri "$api/api/badges" -TimeoutSec 5
  if (-not $r.badges -or $r.badges.Count -eq 0) { throw "no badges" }
}

Test-Case "POST /api/scan returns valid result" {
  $body = @{ address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; chains = @("BASE"); deepScan = $false } | ConvertTo-Json
  $r = Invoke-RestMethod -Uri "$api/api/scan" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 60
  if (-not $r.chains) { throw "no chains in response" }
  if (-not $r.totals) { throw "no totals" }
  if (-not $r.metrics) { throw "no metrics" }
  $chain = $r.chains | Where-Object { $_.chainKey -eq "base" } | Select-Object -First 1
  if (-not $chain) { throw "BASE chain not found in results" }
  if ($chain.vm -ne "EVM") { throw "wrong VM: $($chain.vm)" }
}

Test-Case "Web homepage loads (200 + WCORE)" {
  $r = Invoke-WebRequest -Uri $web -TimeoutSec 10 -UseBasicParsing
  if ($r.StatusCode -ne 200) { throw "status=$($r.StatusCode)" }
  if (-not ($r.Content -like "*<html*")) { throw "HTML shell not found" }
  if (-not ($r.Content -like "*WCORE*")) { throw "not WCORE (wrong app on port ${WebPort}?)" }
}

Test-Case "Web /profile page loads (200)" {
  $r = Invoke-WebRequest -Uri "$web/profile" -TimeoutSec 10 -UseBasicParsing
  if ($r.StatusCode -ne 200) { throw "status=$($r.StatusCode)" }
}

Test-Case "Web /leaderboard page loads (200)" {
  $r = Invoke-WebRequest -Uri "$web/leaderboard" -TimeoutSec 10 -UseBasicParsing
  if ($r.StatusCode -ne 200) { throw "status=$($r.StatusCode)" }
}

Test-Case "/api/stats returns metrics snapshot" {
  $r = Invoke-RestMethod -Uri "$api/api/stats" -TimeoutSec 5
  if (-not $r.uptimeSec) { throw "uptime missing" }
  if (-not $r.scans) { throw "scans missing" }
  if (-not $r.cache) { throw "cache missing" }
  if (-not $r.errors) { throw "errors missing" }
  if (-not $r.rateLimits) { throw "rateLimits missing" }
  if (-not $r.circuitBreaker) { throw "circuitBreaker missing" }
  if ($r.chainCount -lt 180) { throw "chainCount=$($r.chainCount)" }
}

Write-Host "`n=== Results: $passed passed, $failed failed ===" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
exit $failed
