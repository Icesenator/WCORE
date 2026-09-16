# install-cm-continuity-owner.ps1 — enregistre l'owner PERSISTANT CM (WC-01) comme tache planifiee
# Windows project-owned. Pattern identique a "WCORE Graphify Sync" (VBS invisible).
# P1-GOV-CM-PERSISTENT-OWNER. Reversible via uninstall-cm-continuity-owner.ps1.
#
# NE PUBLIE RIEN. Le runner est read-only X. La re-invocation agent reste gated OFF par defaut
# (opt-in = renseigner la variable CM_INVOKE_AGENT=1 dans le .cmd wrapper).
param(
  [int]$IntervalMinutes = 12,
  [switch]$EnableAgentInvoke
)
$ErrorActionPreference = "Stop"
$TaskName = "WCORE CM Continuity Owner"
$Root = "K:\ProjetIA\WCORE"
$Wrapper = Join-Path $Root "scripts\cm-continuity-owner-task.cmd"

# 1) Wrapper .cmd (deterministe) : lance 1 tick du runner via node, mode invisible.
$invokeLine = if ($EnableAgentInvoke) { 'set CM_INVOKE_AGENT=1' } else { 'set CM_INVOKE_AGENT=0' }
$wrapperContent = @"
@echo off
$invokeLine
cd /d "$Root"
node "$Root\scripts\cm-continuity-runner.cjs" --tick=1 >> "$Root\.generated\cm-continuity\commands.log" 2>&1
"@
Set-Content -LiteralPath $Wrapper -Value $wrapperContent -Encoding ASCII

# 1b) Launcher VBS INVISIBLE (aucune fenetre console). Le .cmd reste le redirecteur de logs.
#     intWindowStyle=0 => fenetre cachee ; bWaitOnReturn=True => l'instance de tache dure TOUT le tick,
#     ce qui preserve la semantique "Queue" (aucun chevauchement de ticks).
$Vbs = Join-Path $Root "scripts\cm-continuity-owner-invisible.vbs"
$vbsContent = @'
' Lance le tick CM continuity owner en mode totalement invisible (aucune fenetre console).
' Observabilite PRESERVEE : le wrapper .cmd redirige stdout/stderr vers commands.log.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c ""__WRAPPER__""", 0, True
'@
$vbsContent = $vbsContent.Replace('__WRAPPER__', $Wrapper)
Set-Content -LiteralPath $Vbs -Value $vbsContent -Encoding ASCII

# 2) Tache planifiee : demarrage + repetition toutes les N minutes.
# QueueNew (PAS IgnoreNew) : un tick dure ~10-11 min (child bloquant) ; si le tick suivant tombe
# pendant qu'un tick est encore en cours, IgnoreNew le JETAIT -> trou de couverture de 24 min.
# QueueNew met le tick en file et l'execute des la fin du precedent => aucune couverture perdue.
$action    = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "//B `"$Vbs`""
$trigger   = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
             -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -StartWhenAvailable -MultipleInstances Queue -ExecutionTimeLimit (New-TimeSpan -Minutes 60) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description "WCORE CM continuity owner (WC-01). Read-only X, no publish. P1-GOV-CM-PERSISTENT-OWNER." -Force | Out-Null

"INSTALLED task=$TaskName interval=${IntervalMinutes}min invoke=$EnableAgentInvoke wrapper=$Wrapper"
