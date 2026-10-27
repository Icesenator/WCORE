# Railway deploy entry point for Windows. All checks and the upload live in
# railway-deploy.mjs (tested by railway-deploy.test.mjs); this wrapper only forwards.
#
#   powershell -File wcore-web\scripts\deploy.ps1 -Service api -Ref origin/master -Environment production -Project <railway project id>
#
# Every parameter is mandatory: the previous version defaulted to "web", deployed the
# working tree (local commits and uncommitted files included) and let -SkipRemoteCheck
# bypass the freshness guard. The context is now `git archive` of one pushed commit.
param(
  [Parameter(Mandatory = $true)][ValidateSet("api", "web", "cex-relay")][string]$Service,
  [Parameter(Mandatory = $true)][string]$Ref,
  [Parameter(Mandatory = $true)][string]$Environment,
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$TrustProxyAttestation,
  [switch]$DryRun,
  [switch]$AcceptSharedClientIp
)

$arguments = @((Join-Path $PSScriptRoot "railway-deploy.mjs"), "--service", $Service, "--ref", $Ref, "--environment", $Environment, "--project", $Project)
if ($TrustProxyAttestation) { $arguments += @("--trust-proxy-attestation", $TrustProxyAttestation) }
if ($DryRun) { $arguments += "--dry-run" }
if ($AcceptSharedClientIp) { $arguments += "--accept-shared-client-ip" }

& node @arguments
exit $LASTEXITCODE
