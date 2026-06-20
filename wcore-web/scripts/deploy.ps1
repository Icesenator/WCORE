param(
  [ValidateSet("api","web")]
  [string]$Service = "web"
)

$jsonPath = Join-Path $PSScriptRoot "..\..\railway.json"
$lockPath = Join-Path $PSScriptRoot "..\.deploy.lock"

# Prevent concurrent deploys from racing on railway.json (documented incident 2026-05-19).
if (Test-Path $lockPath) {
  $lockAge = (Get-Date) - (Get-Item $lockPath).LastWriteTime
  if ($lockAge.TotalMinutes -lt 30) {
    Write-Error "Deploy lock exists ($lockPath, age=$($lockAge.TotalMinutes.ToString('F0'))min). Another deploy may be in progress. Remove the lock file manually if this is stale."
    exit 1
  }
  Write-Warning "Stale deploy lock found ($($lockAge.TotalMinutes.ToString('F0'))min old), removing."
  Remove-Item $lockPath -Force
}
New-Item -ItemType File -Path $lockPath -Force | Out-Null

$original = Get-Content -LiteralPath $jsonPath -Raw
$dockerfile = if ($Service -eq "web") { "wcore-web/apps/web/Dockerfile.railway" } else { "wcore-web/apps/api/Dockerfile.railway" }

$deployExitCode = 0
try {
  $updated = $original -replace '"dockerfilePath":\s*"[^"]*"', """dockerfilePath"": ""$dockerfile"""
  Set-Content -LiteralPath $jsonPath -Value $updated -NoNewline

  railway up (Join-Path $PSScriptRoot "..\..") --path-as-root --service $Service --ci
  $deployExitCode = $LASTEXITCODE
} finally {
  Set-Content -LiteralPath $jsonPath -Value $original -NoNewline
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
if ($deployExitCode -ne 0) { exit $deployExitCode }
