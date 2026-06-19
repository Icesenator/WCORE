# WCORE Staging Deploy with smoke tests and rollback
# Usage:
#   .\scripts\deploy-staging.ps1                  # Deploy and print start instructions
#   .\scripts\deploy-staging.ps1 -AutoStart       # Deploy, start API/Web, run smoke tests
#   .\scripts\deploy-staging.ps1 -Down            # Shut down Docker services
#   .\scripts\deploy-staging.ps1 -Rollback        # Restore a previous DB backup
#   .\scripts\deploy-staging.ps1 -SkipBuild       # Skip rebuild

param(
  [switch]$SkipBuild,
  [switch]$AutoStart,
  [switch]$Down,
  [switch]$Rollback
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$backupDir = Join-Path $root "packages\db\backups"

$apiPort = if ($env:API_PORT) { $env:API_PORT } else { "4001" }
$webPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { "3001" }
$dbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "5434" }
$redisPort = if ($env:REDIS_PORT) { $env:REDIS_PORT } else { "6381" }
$dbUser = if ($env:DB_USER) { $env:DB_USER } else { "wcore" }
$dbPass = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { "wcore_staging" }
$dbName = if ($env:DB_NAME) { $env:DB_NAME } else { "wcore" }

$env:DATABASE_URL = "postgresql://${dbUser}:${dbPass}@127.0.0.1:${dbPort}/${dbName}"
$env:NODE_ENV = "staging"
$env:CORS_ORIGIN = "http://localhost:$webPort,http://127.0.0.1:$webPort"
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:$apiPort"
$env:REDIS_HOST = "127.0.0.1"
$env:REDIS_PORT = "$redisPort"
if (-not $env:JWT_SECRET) {
  $stagingEnvPath = Join-Path $root ".env.staging"
  if (Test-Path $stagingEnvPath) {
    Get-Content $stagingEnvPath | ForEach-Object {
      if ($_ -match '^\s*JWT_SECRET\s*=\s*(.+)$') { $env:JWT_SECRET = $matches[1]; return }
    }
  }
  if (-not $env:JWT_SECRET) {
    $env:JWT_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
    Write-Host "  WARNING: Generated random JWT_SECRET -- tokens break on restart. Set JWT_SECRET in .env.staging" -ForegroundColor Yellow
  }
}

function Write-Step {
  param([string]$Number, [string]$Message)
  Write-Host "`n[$Number/5] $Message..." -ForegroundColor Yellow
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string]$FailureMessage = "Command failed"
  )

  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (exit $LASTEXITCODE)"
  }
}

function Restore-DatabaseBackup {
  param([string]$BackupFile)

  if (-not (Test-Path $BackupFile)) {
    Write-Host "  Backup file missing: $BackupFile" -ForegroundColor Yellow
    return
  }

  Get-Content $BackupFile | docker exec -i wcore-staging-postgres psql -U $dbUser -d $dbName 2>&1 | Out-Null
}

if ($Rollback) {
  Write-Host "`n=== Rollback Staging ===" -ForegroundColor Cyan
  $backups = Get-ChildItem $backupDir -Filter "wcore_backup_*.sql" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
  if (-not $backups) {
    Write-Host "  No backups found in $backupDir" -ForegroundColor Red
    exit 1
  }

  Write-Host "  Available backups:" -ForegroundColor Gray
  for ($i = 0; $i -lt $backups.Count; $i++) {
    Write-Host "    $i : $($backups[$i].Name) ($($backups[$i].Length) bytes)"
  }

  $choice = Read-Host "  Choose backup index (0 = latest)"
  if ($choice -eq "") { $choice = "0" }
  $backupFile = $backups[[int]$choice].FullName
  Write-Host "  Restoring $backupFile..." -ForegroundColor Yellow

  Push-Location $root
  try {
    Restore-DatabaseBackup $backupFile
    Write-Host "  DB restored. Run deploy again." -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
  return
}

if ($Down) {
  Write-Host "`n=== Shutting Down Staging ===" -ForegroundColor Cyan
  Push-Location $root
  try {
    docker compose -f docker-compose.staging.yml down -v 2>&1 | Out-Null
  }
  finally {
    Pop-Location
  }
  Write-Host "  Stopped" -ForegroundColor Green
  return
}

Write-Host "`n=== WCORE Staging Deploy ===" -ForegroundColor Cyan
Write-Step "1" "Docker services (Postgres + Redis)"

Push-Location $root
try {
  docker compose -f docker-compose.staging.yml up -d --remove-orphans 2>&1 | Out-Null
  $pgRunning = docker ps --filter "name=wcore-staging-postgres" --filter "status=running" -q 2>$null
  $redisRunning = docker ps --filter "name=wcore-staging-redis" --filter "status=running" -q 2>$null
  if (-not $pgRunning -or -not $redisRunning) { throw "Containers failed to start" }
  Write-Host "  Postgres + Redis running" -ForegroundColor Green
}
catch {
  Write-Host "  FAILED: $_" -ForegroundColor Red
  Pop-Location
  exit 1
}
finally {
  if ((Get-Location).Path -eq $root) { Pop-Location }
}

if (-not $SkipBuild) {
  Write-Step "2" "Building packages"
  Push-Location $root
  try {
    Invoke-Checked "pnpm install --frozen-lockfile" "pnpm install failed"
    Invoke-Checked "pnpm --filter @wcore/shared build" "shared build failed"
    Invoke-Checked "pnpm --filter @wcore/db db:generate" "prisma generate failed"
    Invoke-Checked "pnpm --filter @wcore/core build" "core build failed"
    Invoke-Checked "pnpm --filter @wcore/api build" "api build failed"
    Invoke-Checked "pnpm --filter @wcore/web build" "web build failed"

    # Next standalone build does NOT copy .next/static automatically (known gotcha).
    # Without this, the standalone server returns 404 for every JS/CSS asset.
    $staticSrc = Join-Path $root "apps\web\.next\static"
    $staticDst = Join-Path $root "apps\web\.next\standalone\apps\web\.next\static"
    if (Test-Path $staticSrc) {
      if (Test-Path $staticDst) { Remove-Item -Recurse -Force $staticDst }
      New-Item -ItemType Directory -Force -Path (Split-Path $staticDst -Parent) | Out-Null
      Copy-Item -Recurse -Force $staticSrc $staticDst
      Write-Host "  Copied .next/static -> standalone" -ForegroundColor Gray
    }
    Write-Host "  Build OK" -ForegroundColor Green
  }
  catch {
    Write-Host "  FAILED: $_" -ForegroundColor Red
    Pop-Location
    exit 1
  }
  finally {
    if ((Get-Location).Path -eq $root) { Pop-Location }
  }
}

Write-Step "3" "DB backup + migrate + seed"
Push-Location $root
try {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $backupFile = Join-Path $backupDir "wcore_backup_predeploy_$ts.sql"
  New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
  docker exec wcore-staging-postgres pg_dump -U $dbUser -d $dbName > $backupFile 2>$null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $backupFile) -or (Get-Item $backupFile).Length -le 0) {
    throw "Database backup failed or is empty: $backupFile"
  }
  Write-Host "  Backup: $backupFile" -ForegroundColor Gray

  Push-Location (Join-Path $root "packages\db")
  try {
    Write-Host "  Running prisma migrate deploy..." -ForegroundColor Gray
    Invoke-Expression "pnpm exec prisma migrate deploy" 2>&1 | Select-Object -Last 8
    $migrateExit = $LASTEXITCODE

    if ($migrateExit -ne 0) {
      throw "prisma migrate deploy failed (exit $migrateExit). Refusing automatic db push --accept-data-loss. Backup is available at $backupFile; fix migrations explicitly before retrying."
    }

    Invoke-Checked "pnpm db:seed" "db seed failed"
  }
  finally {
    Pop-Location
  }
  Write-Host "  DB ready" -ForegroundColor Green
}
finally {
  if ((Get-Location).Path -eq $root) { Pop-Location }
}

if ($AutoStart) {
  Write-Step "4" "Port check + API + Web"
  $portConflict = $false
  $apiListener = Get-NetTCPConnection -LocalPort $apiPort -ErrorAction SilentlyContinue | Select-Object -First 1
  $webListener = Get-NetTCPConnection -LocalPort $webPort -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($apiListener) { Write-Host "  WARNING: Port $apiPort in use by PID $($apiListener.OwningProcess)" -ForegroundColor Yellow; $portConflict = $true }
  if ($webListener) { Write-Host "  WARNING: Port $webPort in use by PID $($webListener.OwningProcess)" -ForegroundColor Yellow; $portConflict = $true }
  if ($portConflict) {
    $choice = Read-Host "  Continue anyway? (y/N)"
    if ($choice -ne "y") { Pop-Location; exit 1 }
  }
  Write-Host "  Ports OK" -ForegroundColor Green
  Push-Location $root
  try {
    Get-Job -Name "wcore-staging-api","wcore-staging-web" -ErrorAction SilentlyContinue | Stop-Job -ErrorAction SilentlyContinue
    Get-Job -Name "wcore-staging-api","wcore-staging-web" -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue

    $apiJob = Start-Job -Name "wcore-staging-api" -ScriptBlock {
      param($port, $dbUrl, $redisHost, $redisPort, $jwt, $cors, $root)
      Set-Location $root
      $env:NODE_ENV = "staging"
      $env:PORT = $port
      $env:HOST = "127.0.0.1"
      $env:DATABASE_URL = $dbUrl
      $env:REDIS_HOST = $redisHost
      $env:REDIS_PORT = $redisPort
      $env:JWT_SECRET = $jwt
      $env:CORS_ORIGIN = $cors
      $env:RATE_LIMIT_SCAN = "60"
      $env:RATE_LIMIT_AUTH = "30"
      $env:MAX_CHAINS_PER_SCAN = "120"
      $env:ANONYMOUS_MAX_CHAINS_PER_SCAN = "20"
      & pnpm --filter "@wcore/api" exec tsx src/server.ts 2>&1
    } -ArgumentList "$apiPort", "$env:DATABASE_URL", "$env:REDIS_HOST", "$redisPort", "$env:JWT_SECRET", "$env:CORS_ORIGIN", "$root"

    $webJob = Start-Job -Name "wcore-staging-web" -ScriptBlock {
      param($port, $apiUrl, $root)
      Set-Location $root
      $env:NODE_ENV = "production"
      $env:PORT = $port
      $env:HOSTNAME = "127.0.0.1"
      $env:NEXT_PUBLIC_API_URL = $apiUrl
      & node apps/web/.next/standalone/apps/web/server.js 2>&1
    } -ArgumentList "$webPort", "$env:NEXT_PUBLIC_API_URL", "$root"

    Write-Host "  Waiting for services..." -ForegroundColor Gray
    $maxWait = 60
    $start = Get-Date
    $apiReady = $false
    $webReady = $false
    while ($true) {
      if (-not $apiReady) {
        $apiReady = try { (Invoke-WebRequest -Uri "http://127.0.0.1:${apiPort}/health" -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200 } catch { $false }
      }
      if (-not $webReady) {
        $webReady = try { (Invoke-WebRequest -Uri "http://127.0.0.1:${webPort}" -TimeoutSec 2 -UseBasicParsing).StatusCode -eq 200 } catch { $false }
      }
      if ($apiReady -and $webReady) { break }
      if (((Get-Date) - $start).TotalSeconds -gt $maxWait) {
        Write-Host "  API logs:" -ForegroundColor Red
        Receive-Job $apiJob 2>&1 | Select-Object -Last 10
        Write-Host "  Web logs:" -ForegroundColor Red
        Receive-Job $webJob 2>&1 | Select-Object -Last 10
        throw "Services timeout after ${maxWait}s"
      }
      Start-Sleep 2
    }
    Write-Host "  API + Web running" -ForegroundColor Green

    Write-Step "5" "Smoke tests"
    $smokeScript = Join-Path (Split-Path -Parent $PSCommandPath) "smoke-test.ps1"
    if (Test-Path $smokeScript) {
      & $smokeScript -ApiPort $apiPort -WebPort $webPort
      if ($LASTEXITCODE -ne 0) {
        Write-Host "`n  Smoke tests failed; rolling back..." -ForegroundColor Red
        Stop-Job $apiJob -ErrorAction SilentlyContinue
        Stop-Job $webJob -ErrorAction SilentlyContinue
        Remove-Job $apiJob -Force -ErrorAction SilentlyContinue
        Remove-Job $webJob -Force -ErrorAction SilentlyContinue
        Restore-DatabaseBackup $backupFile
        Write-Host "  Rollback complete; DB restored from $backupFile" -ForegroundColor Yellow
        Pop-Location
        exit 1
      }
    }
    Write-Host "`n  All smoke tests passed" -ForegroundColor Green
  }
  catch {
    Write-Host "  FAILED: $_" -ForegroundColor Red
    Pop-Location
    exit 1
  }
  finally {
    if ((Get-Location).Path -eq $root) { Pop-Location }
  }
}
else {
  Write-Step "4" "Start services manually"
  Write-Host ""
  Write-Host "  Terminal 1 - API:" -ForegroundColor White
  Write-Host "    cd wcore-web; `$env:PORT='$apiPort'; `$env:HOST='127.0.0.1'; `$env:DATABASE_URL='$env:DATABASE_URL'; `$env:REDIS_HOST='127.0.0.1'; `$env:REDIS_PORT='$redisPort'; `$env:JWT_SECRET='$env:JWT_SECRET'; `$env:CORS_ORIGIN='http://localhost:$webPort'; `$env:NODE_ENV='staging'; pnpm --filter @wcore/api exec tsx src/server.ts" -ForegroundColor Gray
  Write-Host ""
  Write-Host "  Terminal 2 - Web:" -ForegroundColor White
  Write-Host "    cd wcore-web; `$env:PORT='$webPort'; `$env:HOSTNAME='127.0.0.1'; `$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:$apiPort'; node apps/web/.next/standalone/apps/web/server.js" -ForegroundColor Gray
  Write-Host ""

  Write-Step "5" "Smoke tests"
  Write-Host "  Start services, then: .\scripts\smoke-test.ps1 -ApiPort $apiPort -WebPort $webPort" -ForegroundColor Gray
}

Write-Host "`n=== WCORE Staging Deploy Complete ===" -ForegroundColor Green
Write-Host "  API:    http://127.0.0.1:${apiPort}/health" -ForegroundColor White
Write-Host "  Web:    http://127.0.0.1:${webPort}" -ForegroundColor White
Write-Host "  DB:     postgresql://127.0.0.1:${dbPort}" -ForegroundColor Gray
Write-Host "  Redis:  127.0.0.1:${redisPort}" -ForegroundColor Gray
Write-Host "`n  Stop: .\scripts\deploy-staging.ps1 -Down" -ForegroundColor Gray
Write-Host "  Undo: .\scripts\deploy-staging.ps1 -Rollback" -ForegroundColor Gray
