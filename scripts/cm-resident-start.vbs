' Lance le RUNTIME RESIDENT WCORE (continuité) en mode totalement invisible (aucune fenetre console).
' Remplace la Scheduled Task de wake : processus resident project-owned, sans Task Scheduler.
' Observabilite PRESERVEE : le superviseur ecrit .generated/cm-continuity/resident.log + resident-heartbeat.json.
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node ""K:\ProjetIA\WCORE\scripts\cm-resident-supervisor.cjs""", 0, False
