<#
.SYNOPSIS
Backup WCORE project data.
Usage: powershell -File scripts/backup-wcore.ps1
#>
$Root = Split-Path (Split-Path $PSCommandPath -Parent) -Parent
$BackupDir = Join-Path $Root 'backups'
$Date = Get-Date -Format 'yyyy-MM-dd'
$Name = "wcore-backup-$Date.zip"
$Target = Join-Path $BackupDir $Name

New-Item -ItemType Directory $BackupDir -Force | Out-Null
Compress-Archive -Path (Join-Path $Root 'HOME.md'), (Join-Path $Root 'AGENTS.md'), (Join-Path $Root 'CLAUDE.md'), (Join-Path $Root 'wcore-web'), (Join-Path $Root 'wcore-gsheet\src') -DestinationPath $Target -CompressionLevel Optimal

Get-ChildItem $BackupDir -Filter 'wcore-backup-*.zip' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 7 | Remove-Item -Force
Write-Output "WCORE backup: $Target"
