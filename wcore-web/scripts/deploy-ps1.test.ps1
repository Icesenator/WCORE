# Test for scripts/deploy.ps1 - Task 6 / P1-4
# Verifies that the script propagates railway up exit code to its caller, restores
# railway.json, and scopes the uploaded build context via .railwayignore.
#
# Run: powershell -ExecutionPolicy Bypass -File scripts/deploy-ps1.test.ps1
#
# Methodology: spawn deploy.ps1 as a child process with a mock railway.cmd in
# PATH. The fixture mirrors the real layout (repo/wcore-web/scripts/deploy.ps1)
# so that $PSScriptRoot\..\.. resolves to the fake repo root. The mock captures
# the generated .railwayignore before exiting with a configurable code.

$ErrorActionPreference = "Stop"
$script:TestsPassed = 0
$script:TestsFailed = 0

function Test-Deploy {
  param(
    [int]$RailwayExitCode,
    [int]$ExpectedScriptExitCode,
    [string]$Service = "web",
    [string[]]$ExpectIgnoreContains = @(),
    [string[]]$ExpectIgnoreExcludes = @(),
    [string]$ExpectDockerfile,
    [string[]]$ExpectWatchContains = @(),
    [string]$PreExistingIgnore,
    [string]$Label
  )

  $testRoot = Join-Path $env:TEMP "wcore-deploy-test-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $scriptsDir = Join-Path $testRoot "wcore-web\scripts"
  $mockBin = Join-Path $testRoot "mock-bin"

  try {
    New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
    New-Item -ItemType Directory -Path $mockBin -Force | Out-Null

    $deploySrc = Join-Path $PSScriptRoot "deploy.ps1"
    $deployDst = Join-Path $scriptsDir "deploy.ps1"
    Copy-Item -LiteralPath $deploySrc -Destination $deployDst -Force

    $testJsonPath = Join-Path $testRoot "railway.json"
    $originalContent = '{"build":{"dockerfilePath":"apps/web/Dockerfile"}}'
    Set-Content -LiteralPath $testJsonPath -Value $originalContent -NoNewline

    $ignorePath = Join-Path $testRoot ".railwayignore"
    if ($PSBoundParameters.ContainsKey("PreExistingIgnore")) {
      Set-Content -LiteralPath $ignorePath -Value $PreExistingIgnore -NoNewline
    }

    # The mock snapshots .railwayignore and railway.json as seen by `railway up`, then exits.
    $capturePath = Join-Path $testRoot "captured-ignore.txt"
    $captureJsonPath = Join-Path $testRoot "captured-json.txt"
    $mockRailwayPath = Join-Path $mockBin "railway.cmd"
    $mockBody = "@echo off`r`nif exist `"$ignorePath`" copy /Y `"$ignorePath`" `"$capturePath`" >nul`r`ncopy /Y `"$testJsonPath`" `"$captureJsonPath`" >nul`r`nexit /b $RailwayExitCode`r`n"
    Set-Content -LiteralPath $mockRailwayPath -Value $mockBody -NoNewline

    $oldPath = $env:PATH
    $env:PATH = "$mockBin;$env:PATH"

    try {
      $output = powershell -ExecutionPolicy Bypass -File $deployDst -Service $Service 2>&1
      $actualExitCode = $LASTEXITCODE
    } finally {
      $env:PATH = $oldPath
    }

    $errors = New-Object System.Collections.Generic.List[string]

    if ($actualExitCode -ne $ExpectedScriptExitCode) {
      $errors.Add("expected script exit=$ExpectedScriptExitCode, got $actualExitCode")
    }

    $restored = Get-Content -LiteralPath $testJsonPath -Raw
    if ($restored -ne $originalContent) {
      $errors.Add("railway.json not restored. Got: $restored")
    }

    $lockPath = Join-Path $testRoot "wcore-web\.deploy.lock"
    if (Test-Path $lockPath) {
      $errors.Add("deploy lock file was not cleaned up")
    }

    # Match whole lines: "wcore-web/apps/web/__tests__/" must not satisfy a check for
    # "wcore-web/apps/web/", otherwise the guard silently accepts an over-broad exclusion.
    $capturedLines = if (Test-Path $capturePath) {
      @(Get-Content -LiteralPath $capturePath | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" -and -not $_.StartsWith("#") })
    } else { $null }
    if (($ExpectIgnoreContains.Count -gt 0 -or $ExpectIgnoreExcludes.Count -gt 0) -and $null -eq $capturedLines) {
      $errors.Add(".railwayignore was not present during railway up")
    }
    foreach ($needle in $ExpectIgnoreContains) {
      if ($null -ne $capturedLines -and $capturedLines -notcontains $needle) {
        $errors.Add(".railwayignore should exclude '$needle'. Got: $($capturedLines -join ', ')")
      }
    }
    foreach ($needle in $ExpectIgnoreExcludes) {
      if ($null -ne $capturedLines -and $capturedLines -contains $needle) {
        $errors.Add(".railwayignore must NOT exclude '$needle'")
      }
    }

    if ($PSBoundParameters.ContainsKey("ExpectDockerfile")) {
      $capturedJson = if (Test-Path $captureJsonPath) { Get-Content -LiteralPath $captureJsonPath -Raw } else { $null }
      if ($null -eq $capturedJson) {
        $errors.Add("railway.json was not present during railway up")
      } elseif ($capturedJson -notmatch [regex]::Escape($ExpectDockerfile)) {
        $errors.Add("railway.json should pin '$ExpectDockerfile'. Got: $capturedJson")
      }
    }

    # watchPatterns must be pinned per service too. Leaving the committed web-scoped
    # list in place made `railway up --service api` answer "no changes detected in watch
    # paths, build will skip": it returned success and deployed nothing.
    if ($ExpectWatchContains.Count -gt 0) {
      $capturedJson = if (Test-Path $captureJsonPath) { Get-Content -LiteralPath $captureJsonPath -Raw } else { $null }
      if ($null -eq $capturedJson) {
        $errors.Add("railway.json was not present during railway up")
      } else {
        foreach ($needle in $ExpectWatchContains) {
          if ($capturedJson -notmatch [regex]::Escape($needle)) {
            $errors.Add("watchPatterns should cover '$needle'. Got: $capturedJson")
          }
        }
      }
    }

    if ($PSBoundParameters.ContainsKey("PreExistingIgnore")) {
      if (-not (Test-Path $ignorePath)) {
        $errors.Add("pre-existing .railwayignore was deleted instead of restored")
      } else {
        $afterIgnore = Get-Content -LiteralPath $ignorePath -Raw
        if ($afterIgnore -ne $PreExistingIgnore) {
          $errors.Add("pre-existing .railwayignore not restored. Got: $afterIgnore")
        }
      }
    } elseif (Test-Path $ignorePath) {
      $errors.Add("generated .railwayignore was not cleaned up")
    }

    if ($errors.Count -eq 0) {
      Write-Host "PASS: $Label (railway exit=$RailwayExitCode -> script exit=$actualExitCode)"
      $script:TestsPassed++
    } else {
      Write-Host "FAIL: $Label" -ForegroundColor Red
      foreach ($e in $errors) {
        Write-Host "  - $e" -ForegroundColor Red
      }
      Write-Host "  output: $output"
      $script:TestsFailed++
    }
  } finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "=== deploy.ps1 exit code propagation tests ===" -ForegroundColor Cyan

# Primary RED test: railway fails -> script must return non-zero.
Test-Deploy -RailwayExitCode 42 -ExpectedScriptExitCode 42 -Label "railway exit 42 is propagated"
# Regression: success path still works.
Test-Deploy -RailwayExitCode 0  -ExpectedScriptExitCode 0  -Label "railway exit 0 stays 0"
# Another non-zero code (common Railway failure code 1).
Test-Deploy -RailwayExitCode 1  -ExpectedScriptExitCode 1  -Label "railway exit 1 is propagated"

Write-Host ""
Write-Host "=== .railwayignore build-context scoping (upload timeout 2026-08-02) ===" -ForegroundColor Cyan

# The API image never COPYs apps/web (24 MiB of public assets): it must not be uploaded.
Test-Deploy -RailwayExitCode 0 -ExpectedScriptExitCode 0 -Service "api" `
  -ExpectIgnoreContains @("wcore-web/apps/web/") `
  -ExpectIgnoreExcludes @("wcore-web/apps/api/", "wcore-web/packages/", "wcore-gsheet/dist") `
  -ExpectDockerfile "wcore-web/apps/api/Dockerfile.railway" `
  -ExpectWatchContains @("wcore-web/apps/api/**", "wcore-web/packages/db/**") `
  -Label "api deploy excludes apps/web but keeps its own build inputs"

# The web image needs apps/web/public, so it must never be excluded there.
Test-Deploy -RailwayExitCode 0 -ExpectedScriptExitCode 0 -Service "web" `
  -ExpectIgnoreContains @("wcore-web/apps/api/") `
  -ExpectIgnoreExcludes @("wcore-web/apps/web/", "wcore-web/packages/", "wcore-gsheet/dist") `
  -ExpectDockerfile "wcore-web/apps/web/Dockerfile.railway" `
  -ExpectWatchContains @("wcore-web/apps/web/**") `
  -Label "web deploy excludes apps/api but keeps apps/web"

# The relay builds from the repo root too: railway.json must be pinned to its own
# Dockerfile, and railway-relay/ must survive the ignore list.
Test-Deploy -RailwayExitCode 0 -ExpectedScriptExitCode 0 -Service "cex-relay" `
  -ExpectIgnoreContains @("wcore-web/") `
  -ExpectIgnoreExcludes @("wcore-gsheet/railway-relay/") `
  -ExpectDockerfile "wcore-gsheet/railway-relay/Dockerfile" `
  -ExpectWatchContains @("wcore-gsheet/railway-relay/**") `
  -Label "cex-relay deploy pins its Dockerfile and keeps railway-relay"

# A user-authored .railwayignore must survive the deploy untouched.
Test-Deploy -RailwayExitCode 0 -ExpectedScriptExitCode 0 -Service "api" `
  -PreExistingIgnore "# user file`nsomething/" `
  -Label "pre-existing .railwayignore is restored"

Write-Host ""
Write-Host "Passed: $($script:TestsPassed), Failed: $($script:TestsFailed)"

if ($script:TestsFailed -gt 0) {
  exit 1
}
exit 0
