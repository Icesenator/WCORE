' Lance graphify-sync.ps1 sync en mode totalement invisible (aucune fenetre).
' Utilise par la tache planifiee WCORE Graphify Sync.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""K:\ProjetIA\WCORE\scripts\graphify-sync.ps1"" sync", 0, False
