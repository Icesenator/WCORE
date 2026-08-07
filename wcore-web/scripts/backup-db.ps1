# WCORE Database Backup Wrapper
# Reads the database URL from $env or a local, gitignored .env.backup file
# Usage:
#   1) Either preset:  $env:BACKUP_DATABASE_URL = "postgresql://..."; pwsh scripts/backup-db.ps1
#   2) Or create scripts/.env.backup with BACKUP_DATABASE_URL=... or DATABASE_URL=...

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

if (-not $env:BACKUP_DATABASE_URL) {
    if ($env:DATABASE_URL) {
        $env:BACKUP_DATABASE_URL = $env:DATABASE_URL
    }
    $envFile = Join-Path $scriptDir ".env.backup"
    if (-not $env:BACKUP_DATABASE_URL -and (Test-Path $envFile)) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*BACKUP_DATABASE_URL\s*=\s*(.+?)\s*$') {
                $env:BACKUP_DATABASE_URL = $matches[1].Trim('"').Trim("'")
            } elseif (-not $env:BACKUP_DATABASE_URL -and $_ -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
                $env:BACKUP_DATABASE_URL = $matches[1].Trim('"').Trim("'")
            }
        }
    }
}

if (-not $env:BACKUP_DATABASE_URL) {
    Write-Error "Database URL not set. Export BACKUP_DATABASE_URL/DATABASE_URL or create scripts/.env.backup"
    exit 2
}

Set-Location $projectDir
node scripts/backup-db.js

if ($LASTEXITCODE -ne 0) {
    Write-Error "Backup failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
