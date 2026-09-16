@echo off
set CM_INVOKE_AGENT=1
cd /d "K:\ProjetIA\WCORE"
node "K:\ProjetIA\WCORE\scripts\cm-continuity-runner.cjs" --tick=1 >> "K:\ProjetIA\WCORE\.generated\cm-continuity\commands.log" 2>&1
