# Start WCORE API
# Usage:
#   .\scripts\start-api.ps1                    # Dev mode (port 4000, DB 5433, foreground)
#   .\scripts\start-api.ps1 -Staging           # Staging mode (port 4001, DB 5434, foreground)
#   .\scripts\start-api.ps1 -Staging -Detached # Staging mode, background (survives shell exit)

param([switch]$Staging, [switch]$Detached)

$ErrorActionPreference = "Stop"

if ($Staging) {
  $env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://wcore:wcore_staging@127.0.0.1:5434/wcore" }
  $env:REDIS_PORT   = if ($env:REDIS_PORT)   { $env:REDIS_PORT }   else { "6381" }
  $env:PORT         = if ($env:PORT)         { $env:PORT }         else { "4001" }
  $env:CORS_ORIGIN  = if ($env:CORS_ORIGIN)  { $env:CORS_ORIGIN }  else { "http://localhost:3001,http://127.0.0.1:3001" }
  $env:NODE_ENV     = "staging"
  $env:RATE_LIMIT_SCAN = "60"
  $env:RATE_LIMIT_AUTH = "30"
  $env:MAX_CHAINS_PER_SCAN = "120"
  $env:ANONYMOUS_MAX_CHAINS_PER_SCAN = "20"
} else {
  $env:DATABASE_URL = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { "postgresql://wcore:wcore_dev@127.0.0.1:5433/wcore" }
  $env:REDIS_PORT   = if ($env:REDIS_PORT)   { $env:REDIS_PORT }   else { "6380" }
  $env:PORT         = if ($env:PORT)         { $env:PORT }         else { "4000" }
  $env:CORS_ORIGIN  = if ($env:CORS_ORIGIN)  { $env:CORS_ORIGIN }  else { "http://localhost:3000,http://127.0.0.1:3000" }
  $env:NODE_ENV     = "development"
}

$env:REDIS_HOST = if ($env:REDIS_HOST) { $env:REDIS_HOST } else { "127.0.0.1" }
$env:HOST       = if ($env:HOST)       { $env:HOST }       else { "127.0.0.1" }
$root = Join-Path $PSScriptRoot ".."

if (-not $env:JWT_SECRET) {
  if ($Staging -and (Test-Path (Join-Path $root ".env.staging"))) {
    $stagingEnv = Get-Content (Join-Path $root ".env.staging") | ForEach-Object {
      if ($_ -match '^\s*JWT_SECRET\s*=\s*(.+)$') { $env:JWT_SECRET = $matches[1]; return }
    }
  }
  if (-not $env:JWT_SECRET) {
    $env:JWT_SECRET = "dev-secret-not-for-production-use-64-chars-minimum"
    Write-Host "WARNING: Using default JWT_SECRET (dev only) -- tokens WILL break on restart" -ForegroundColor Yellow
  } else {
    Write-Host "JWT_SECRET loaded from .env.staging" -ForegroundColor Gray
  }
}

$tsxPath = Join-Path $PSScriptRoot "..\apps\api\node_modules\.bin\tsx.CMD"
$serverPath = Join-Path $PSScriptRoot "..\apps\api\src\server.ts"
if (-not (Test-Path $tsxPath)) {
  throw "tsx not found at $tsxPath. Run 'pnpm install' first."
}

# Kill any existing API on target port
$existing = (Get-NetTCPConnection -LocalPort $env:PORT -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($existing) {
  Write-Host "Killing existing API on port $env:PORT (PID $existing)..." -ForegroundColor Yellow
  Stop-Process -Id $existing -Force -ErrorAction SilentlyContinue
  Start-Sleep 2
}

if ($Detached) {
  Write-Host "Starting API (detached) on http://127.0.0.1:$env:PORT ..." -ForegroundColor Cyan
  $envBlock = "`$env:NODE_ENV='$env:NODE_ENV'; `$env:PORT='$env:PORT'; `$env:HOST='$env:HOST'; `$env:DATABASE_URL='$env:DATABASE_URL'; `$env:REDIS_HOST='$env:REDIS_HOST'; `$env:REDIS_PORT='$env:REDIS_PORT'; `$env:JWT_SECRET='$env:JWT_SECRET'; `$env:CORS_ORIGIN='$env:CORS_ORIGIN'"
  if ($Staging) {
    $envBlock += "; `$env:RATE_LIMIT_SCAN='60'; `$env:RATE_LIMIT_AUTH='30'; `$env:MAX_CHAINS_PER_SCAN='120'; `$env:ANONYMOUS_MAX_CHAINS_PER_SCAN='20'"
  }
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$envBlock; Set-Location '$root'; & '$tsxPath' '$serverPath' 2>&1`"" -WindowStyle Hidden
  Start-Sleep 3
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$env:PORT/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "API ready: $($r.Content)" -ForegroundColor Green
  } catch {
    Write-Host "API may still be starting (not responding yet)" -ForegroundColor Yellow
  }
} else {
  Write-Host "Starting API (foreground) on http://127.0.0.1:$env:PORT ..." -ForegroundColor Cyan
  Set-Location $root
  & $tsxPath $serverPath
}
