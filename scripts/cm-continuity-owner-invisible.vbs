' Lance le tick CM continuity owner en mode totalement invisible (aucune fenetre console).
' Observabilite PRESERVEE : le wrapper .cmd redirige stdout/stderr vers commands.log.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c ""K:\ProjetIA\WCORE\scripts\cm-continuity-owner-task.cmd""", 0, True
