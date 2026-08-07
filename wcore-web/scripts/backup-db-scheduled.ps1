# WCORE DB Backup — scheduled task wrapper
# Sets DATABASE_URL and runs the Prisma backup script from apps/api

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

# Load DATABASE_URL from the environment or scripts/.env.backup (gitignored)
$envFile = Join-Path $scriptDir ".env.backup"
if (-not $env:DATABASE_URL -and $env:BACKUP_DATABASE_URL) {
    $env:DATABASE_URL = $env:BACKUP_DATABASE_URL
}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if (-not $env:DATABASE_URL -and $_ -match '^\s*BACKUP_DATABASE_URL\s*=\s*(.+?)\s*$') {
            $env:DATABASE_URL = $matches[1].Trim('"').Trim("'")
        } elseif (-not $env:DATABASE_URL -and $_ -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
            $env:DATABASE_URL = $matches[1].Trim('"').Trim("'")
        }
    }
}

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL not set. Create scripts/.env.backup with line: DATABASE_URL=postgresql://..."
    exit 2
}

# Run from apps/api where @prisma/client is installed.
Set-Location "$projectDir\apps\api"
& node backup-db.cjs

if ($LASTEXITCODE -ne 0) {
    Write-Error "Backup failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
