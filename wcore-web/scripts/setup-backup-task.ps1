# WCORE - Setup Daily Database Backup Task
# Creates a Windows scheduled task that runs backup-db.ps1 every day at 03:00
# Must be run as Administrator for Register-ScheduledTask

$ErrorActionPreference = "Stop"

$taskName = "WCORE_DB_Backup"
$scriptPath = Join-Path $PSScriptRoot "backup-db.ps1"

if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Error "Backup script not found: $scriptPath"
    exit 1
}

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task: $taskName"
}

# backup-db.ps1 loads the gitignored scripts/.env.backup at task runtime. The
# database URL is never persisted in the scheduled task action or task XML.
$actionCommand = "& '$scriptPath'; exit `$LASTEXITCODE"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"$actionCommand`""
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
