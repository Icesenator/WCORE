# uninstall-cm-continuity-owner.ps1 — desenregistre proprement l'owner PERSISTANT CM (WC-01).
# Reversibilite P1-GOV-CM-PERSISTENT-OWNER. Ne supprime PAS les heartbeats (preuve durable).
param(
  [switch]$RemoveWrapper
)
$ErrorActionPreference = "Stop"
$TaskName = "WCORE CM Continuity Owner"
$Wrapper  = "K:\ProjetIA\WCORE\scripts\cm-continuity-owner-task.cmd"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  "UNINSTALLED task=$TaskName"
} else {
  "NOOP task=$TaskName not found"
}
if ($RemoveWrapper -and (Test-Path -LiteralPath $Wrapper)) {
  Remove-Item -LiteralPath $Wrapper -Force
  "REMOVED wrapper=$Wrapper"
}
