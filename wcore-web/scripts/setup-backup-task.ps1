# WCORE - Setup Daily Database Backup Task
# Creates a Windows scheduled task that runs backup-db-scheduled.ps1 every day at 03:00
# Must be run as Administrator for Register-ScheduledTask

$ErrorActionPreference = "Stop"

$taskName = "WCORE_DB_Backup"
$scriptDir = $PSScriptRoot
$projectRoot = Split-Path -Parent $scriptDir
$scriptPath = Join-Path $scriptDir "backup-db-scheduled.ps1"

if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "Backup script not found: $scriptPath"
    exit 2
}

# Prefer DATABASE_URL (scheduled wrapper); accept BACKUP_DATABASE_URL for compatibility
if (-not $env:DATABASE_URL -and -not $env:BACKUP_DATABASE_URL) {
    $envFile = Join-Path $scriptDir ".env.backup"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*(?:DATABASE_URL|BACKUP_DATABASE_URL)\s*=\s*(.+?)\s*$') {
                $val = $matches[1].Trim('"').Trim("'")
                if (-not $env:DATABASE_URL) { $env:DATABASE_URL = $val }
            }
        }
    }
}
if (-not $env:DATABASE_URL -and -not $env:BACKUP_DATABASE_URL) {
    Write-Error "DATABASE_URL not set. Export it or create scripts/.env.backup with DATABASE_URL=..."
    exit 2
}

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task: $taskName"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At 03:00
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Daily WCORE production database backup (7-day rotation)" -Force

Write-Host ""
Write-Host "=== Task Created Successfully ==="
Write-Host " Task: $taskName"
Write-Host " Schedule: Daily at 03:00"
Write-Host " Script: $scriptPath"
Write-Host " WorkingDirectory: $projectRoot"
Write-Host ""
Write-Host "To test now: Start-ScheduledTask -TaskName '$taskName'"
