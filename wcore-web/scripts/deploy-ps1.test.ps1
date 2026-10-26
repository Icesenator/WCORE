# Windows entry point for the Railway deploy guard tests.
#
# Run: powershell -ExecutionPolicy Bypass -File wcore-web/scripts/deploy-ps1.test.ps1
#
# deploy.ps1 now only forwards to railway-deploy.mjs, so the guards are tested in Node:
# railway-deploy.test.mjs (every refusal before `railway up`, with a throwaway git
# repository and a fake `railway` first on PATH; nothing reaches Railway) and
# railway-config.test.mjs (service -> Dockerfile -> watch patterns -> upload parity).
# The same suites run in CI.

$repo = Join-Path $PSScriptRoot "..\.."
$suites = @(
  (Join-Path $PSScriptRoot "railway-deploy.test.mjs"),
  (Join-Path $repo "wcore-web\railway\railway-config.test.mjs")
)
& node --test @suites
exit $LASTEXITCODE
