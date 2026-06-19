# WCORE Database Backup Script
# Usage: .\backup-db.ps1
# Creates a timestamped SQL dump of the wcore database

$backupDir = Join-Path (Split-Path -Parent $PSScriptRoot) "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "wcore_backup_$timestamp.sql"

Write-Host "Backing up wcore database to $backupFile ..."

docker exec wcore-postgres pg_dump -U wcore wcore > $backupFile

if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $backupFile).Length
    Write-Host "Backup complete: $backupFile ($size bytes)"
    
    # Keep only the last 10 backups
    $backups = Get-ChildItem $backupDir -Filter "wcore_backup_*.sql" | Sort-Object LastWriteTime -Descending
    if ($backups.Count -gt 10) {
        $backups | Select-Object -Skip 10 | Remove-Item
        Write-Host "Cleaned up old backups (keeping last 10)"
    }
} else {
    Write-Host "ERROR: Backup failed. Is the PostgreSQL container running?"
    exit 1
}
