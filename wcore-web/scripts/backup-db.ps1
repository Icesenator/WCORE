# WCORE Database Backup Wrapper
# Reads BACKUP_DATABASE_URL from $env or a local, gitignored .env.backup file
# Usage:
#   1) Either preset:  $env:BACKUP_DATABASE_URL = "postgresql://..."; pwsh scripts/backup-db.ps1
#   2) Or create scripts/.env.backup with line:  BACKUP_DATABASE_URL=postgresql://...

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

if (-not $env:BACKUP_DATABASE_URL) {
    $envFile = Join-Path $scriptDir ".env.backup"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*BACKUP_DATABASE_URL\s*=\s*(.+?)\s*$') {
                $env:BACKUP_DATABASE_URL = $matches[1].Trim('"').Trim("'")
            }
        }
    }
}

if (-not $env:BACKUP_DATABASE_URL) {
    Write-Error "BACKUP_DATABASE_URL not set. Either export it or create scripts/.env.backup"
    exit 2
}

Set-Location $projectDir
node scripts/backup-db.js

if ($LASTEXITCODE -ne 0) {
    Write-Error "Backup failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
