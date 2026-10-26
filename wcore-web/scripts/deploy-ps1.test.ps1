# Tests deploy.ps1 as an operator runs it on Windows: a real PowerShell process, real git
# and node, a throwaway repository whose path contains spaces, and a fake `railway.cmd`
# first on PATH that records every call. Nothing reaches Railway, no credential is used.
#
# Run: pwsh -NoProfile -File wcore-web/scripts/deploy-ps1.test.ps1   (CI: deploy-wrapper-windows)

$ErrorActionPreference = "Stop"
$failures = New-Object System.Collections.Generic.List[string]
function Check([bool]$Condition, [string]$Label) {
  if ($Condition) { Write-Host "ok   $Label" } else { Write-Host "FAIL $Label"; $failures.Add($Label) }
}

# A real CLI on PATH could be reached if the fake were not found first: refuse to run.
if (Get-Command railway -ErrorAction SilentlyContinue) { throw "a railway CLI is already on PATH; run these tests where it is not installed" }

$scriptsDir = $PSScriptRoot
$root = Join-Path ([IO.Path]::GetTempPath()) ("wcore deploy ps1 " + [guid]::NewGuid().ToString("N").Substring(0, 8))
$origin = Join-Path $root "origin.git"
$repo = Join-Path $root "repo with spaces"
$bin = Join-Path $root "fake bin"
$tmp = Join-Path $root "tmp dir"
$capture = Join-Path $root "calls.jsonl"
New-Item -ItemType Directory -Force -Path $bin, $tmp | Out-Null

function Invoke-Git { & git @args; if ($LASTEXITCODE -ne 0) { throw "git $args failed" } }
function Write-File([string]$Path, [string]$Content) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  [IO.File]::WriteAllText($Path, $Content)
}

Invoke-Git init --quiet --bare --initial-branch=master $origin
Invoke-Git clone --quiet $origin $repo
Invoke-Git -C $repo config user.email "test@example.invalid"
Invoke-Git -C $repo config user.name "test"
Invoke-Git -C $repo checkout --quiet -B master

# The scripts under test, copied so that deploy.ps1 resolves this repository as its root.
Copy-Item (Join-Path $scriptsDir "deploy.ps1") (New-Item -ItemType Directory -Force -Path "$repo\wcore-web\scripts")
Copy-Item (Join-Path $scriptsDir "railway-deploy.mjs") "$repo\wcore-web\scripts"
New-Item -ItemType Directory -Force -Path "$repo\wcore-web\apps\api\src" | Out-Null
Copy-Item (Join-Path $scriptsDir "..\apps\api\src\trust-proxy.ts") "$repo\wcore-web\apps\api\src"
Write-File "$repo\wcore-web\railway\deploy-manifest.json" (@{
  productionEnvironment = "production"; configSource = "config-as-code"; commonIgnore = @("docs/")
  services = @{ api = @{ config = "wcore-web/railway/api.json"; dockerfileMarkers = @('pnpm --filter "@wcore/api" build'); ignore = @("wcore-web/apps/web/"); trustProxyPreflight = $true } }
} | ConvertTo-Json -Depth 5)
Write-File "$repo\wcore-web\railway\api.json" '{"build":{"builder":"DOCKERFILE","dockerfilePath":"wcore-web/apps/api/Dockerfile.railway"}}'
Write-File "$repo\wcore-web\apps\api\Dockerfile.railway" "RUN pnpm --filter `"@wcore/api`" build`n"
Invoke-Git -C $repo add -A
Invoke-Git -C $repo commit --quiet -m initial
Invoke-Git -C $repo push --quiet origin master

Write-File "$bin\fake-railway.cjs" @'
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CAPTURE, JSON.stringify(args) + "\n");
if (args[0] === "status") process.stdout.write(JSON.stringify({ project: { id: "proj-1" } }));
if (args[0] === "variable") process.stdout.write(process.env.FAKE_VARS ?? JSON.stringify({ TRUST_PROXY: "100.64.0.0/10" }));
if (args[0] === "deployment") process.stdout.write(JSON.stringify([{ id: "d0", status: "SUCCESS" }]));
if (args[0] === "up" && !fs.existsSync(args[1] + "\\wcore-web\\build-info.json")) process.exit(90);
process.exit(args[0] === "up" ? Number(process.env.FAKE_UP_EXIT ?? 0) : 0);
'@
Write-File "$bin\railway.cmd" "@node `"%~dp0fake-railway.cjs`" %*`r`n"

$env:PATH = "$bin;$env:PATH"
$env:FAKE_CAPTURE = $capture
$env:TEMP = $tmp
$env:TMP = $tmp
$wrapper = "$repo\wcore-web\scripts\deploy.ps1"
$shell = (Get-Process -Id $PID).Path

function Invoke-Wrapper([string[]]$Arguments, [hashtable]$Env = @{}) {
  if (Test-Path $capture) { Remove-Item $capture }
  foreach ($key in @("FAKE_VARS", "FAKE_UP_EXIT")) { Remove-Item "env:$key" -ErrorAction SilentlyContinue }
  foreach ($key in $Env.Keys) { Set-Item "env:$key" $Env[$key] }
  $output = & $shell -NoProfile -NonInteractive -File $wrapper @Arguments 2>&1 | Out-String
  $calls = if (Test-Path $capture) { @(Get-Content $capture | ForEach-Object { , ($_ | ConvertFrom-Json) }) } else { @() }
  [pscustomobject]@{ Exit = $LASTEXITCODE; Output = $output; Calls = $calls; Ups = @($calls | Where-Object { $_[0] -eq "up" }) }
}

$target = @("-Service", "api", "-Ref", "origin/master", "-Environment", "production", "-Project", "proj-1")

try {
  $r = Invoke-Wrapper @("-Service", "api", "-Environment", "production", "-Project", "proj-1")
  Check ($r.Exit -ne 0 -and $r.Calls.Count -eq 0) "a missing -Ref fails before anything runs"

  $r = Invoke-Wrapper @("-Service", "worker", "-Ref", "origin/master", "-Environment", "production", "-Project", "proj-1")
  Check ($r.Exit -ne 0 -and $r.Calls.Count -eq 0) "an unknown -Service is rejected by the wrapper"

  $r = Invoke-Wrapper ($target + "-DryRun")
  Check ($r.Exit -eq 0) "-DryRun succeeds (exit $($r.Exit))"
  Check ($r.Ups.Count -eq 0) "-DryRun never calls railway up"
  Check (@($r.Calls | Where-Object { $_[0] -eq "deployment" }).Count -eq 1) "-DryRun still checks the deployments in progress"

  $sha = (& git -C $repo rev-parse origin/master).Trim()
  $r = Invoke-Wrapper $target
  Check ($r.Exit -eq 0) "a full run returns railway up's exit code 0 (exit $($r.Exit); $($r.Output.Trim()))"
  if ($r.Ups.Count -eq 1) {
    $up = $r.Ups[0]
    $flag = { param($name) $up[[array]::IndexOf($up, $name) + 1] }
    Check ((& $flag "--project") -eq "proj-1" -and (& $flag "--environment") -eq "production" -and (& $flag "--service") -eq "api") "project, environment and service reach railway up"
    Check ((& $flag "--message") -eq "wcore api $sha") "the message names the commit as one argument despite its spaces"
    Check ($up[1].StartsWith($tmp)) "the upload directory under a TEMP path with spaces stays one argument"
  } else {
    Check $false "exactly one railway up call (got $($r.Ups.Count))"
  }

  $r = Invoke-Wrapper $target @{ FAKE_UP_EXIT = "7" }
  Check ($r.Exit -eq 7) "railway up's failure code is propagated (exit $($r.Exit))"

  $r = Invoke-Wrapper $target @{ FAKE_VARS = '{"TRUST_PROXY":"0.0.0.0/1,128.0.0.0/1"}' }
  Check ($r.Exit -eq 2 -and $r.Ups.Count -eq 0 -and $r.Output -match "E_TRUST_PROXY" -and $r.Output -notmatch "128\.0\.0\.0") "an invalid TRUST_PROXY stops the deploy with exit 2, value not printed"

  $r = Invoke-Wrapper $target @{ FAKE_VARS = "{}" }
  Check ($r.Exit -eq 2 -and $r.Ups.Count -eq 0) "an unset TRUST_PROXY is refused without -AcceptSharedClientIp"
  $r = Invoke-Wrapper ($target + "-AcceptSharedClientIp") @{ FAKE_VARS = "{}" }
  Check ($r.Exit -eq 0 -and $r.Ups.Count -eq 1) "-AcceptSharedClientIp is forwarded"

  Write-File "$repo\local.txt" "local commit"
  Invoke-Git -C $repo add local.txt
  Invoke-Git -C $repo commit --quiet -m local
  $r = Invoke-Wrapper @("-Service", "api", "-Ref", "HEAD", "-Environment", "production", "-Project", "proj-1")
  Check ($r.Exit -eq 2 -and $r.Ups.Count -eq 0 -and $r.Output -match "E_NOT_PUBLISHED") "an unpushed commit is refused with exit 2"
} finally {
  Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}

if ($failures.Count -gt 0) { Write-Host "`n$($failures.Count) failure(s)"; exit 1 }
Write-Host "`nall deploy.ps1 checks passed"
# Explicit: the last wrapper call above exits 2 on purpose, and a pwsh step in GitHub
# Actions ends with $LASTEXITCODE.
exit 0
