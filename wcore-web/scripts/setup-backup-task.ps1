# WCORE - Setup Daily Database Backup Task
# Creates a Windows scheduled task that runs backup-db.ps1 every day at 03:00
# Must be run as Administrator for Register-ScheduledTask

$ErrorActionPreference = "Stop"

$taskName = "WCORE_DB_Backup"
$scriptPath = "C:\Users\strau\wcore-web\scripts\backup-db.ps1"

# BACKUP_DATABASE_URL must be set before running this script.
# Either: $env:BACKUP_DATABASE_URL = "postgresql://..."
# Or create scripts/.env.backup with: BACKUP_DATABASE_URL=postgresql://...
if (-not $env:BACKUP_DATABASE_URL) {
    $envFile = Join-Path $PSScriptRoot ".env.backup"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*BACKUP_DATABASE_URL\s*=\s*(.+?)\s*$') {
                $env:BACKUP_DATABASE_URL = $matches[1].Trim('"').Trim("'")
            }
        }
    }
}
if (-not $env:BACKUP_DATABASE_URL) {
    Write-Error "BACKUP_DATABASE_URL not set. Export it or create scripts/.env.backup with BACKUP_DATABASE_URL=..."
    exit 2
}

# Pass BACKUP_DATABASE_URL to the scheduled task so it runs headlessly

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task: $taskName"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-Command `"`$env:BACKUP_DATABASE_URL='$env:BACKUP_DATABASE_URL'; & '$scriptPath'`" -NoProfile -NonInteractive"
$trigger = New-ScheduledTaskTrigger -Daily -At 03:00
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Daily WCORE production database backup (7-day rotation)" -Force

Write-Host ""
Write-Host "=== Task Created Successfully ==="
Write-Host " Task: $taskName"
Write-Host " Schedule: Daily at 03:00"
Write-Host " Script: $scriptPath"
Write-Host ""
Write-Host "To test now: Start-ScheduledTask -TaskName '$taskName'"
