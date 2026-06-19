# Test for scripts/deploy.ps1 - Task 6 / P1-4
# Verifies that the script propagates railway up exit code to its caller.
#
# Run: powershell -ExecutionPolicy Bypass -File scripts/deploy-ps1.test.ps1
#
# Methodology: spawn deploy.ps1 as a child process with a mock railway.cmd in
# PATH. The mock exits with a configurable code. We assert the script's exit
# code matches and that railway.json was restored in the finally block.

$ErrorActionPreference = "Stop"
$script:TestsPassed = 0
$script:TestsFailed = 0

function Test-DeployExitCodePropagation {
  param(
    [int]$RailwayExitCode,
    [int]$ExpectedScriptExitCode,
    [string]$Label
  )

  $testRoot = Join-Path $env:TEMP "wcore-deploy-test-$([guid]::NewGuid().ToString('N').Substring(0,8))"
  $scriptsDir = Join-Path $testRoot "scripts"
  $mockBin = Join-Path $testRoot "mock-bin"

  try {
    New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
    New-Item -ItemType Directory -Path $mockBin -Force | Out-Null

    $deploySrc = Join-Path $PSScriptRoot "deploy.ps1"
    $deployDst = Join-Path $scriptsDir "deploy.ps1"
    Copy-Item -LiteralPath $deploySrc -Destination $deployDst -Force

    $testJsonPath = Join-Path $testRoot "railway.json"
    $originalContent = '{"deploy":{"dockerfilePath":"apps/web/Dockerfile"}}'
    Set-Content -LiteralPath $testJsonPath -Value $originalContent -NoNewline

    $mockRailwayPath = Join-Path $mockBin "railway.cmd"
    $mockBody = "@echo off`r`nexit /b $RailwayExitCode`r`n"
    Set-Content -LiteralPath $mockRailwayPath -Value $mockBody -NoNewline

    $oldPath = $env:PATH
    $env:PATH = "$mockBin;$env:PATH"

    try {
      $output = powershell -ExecutionPolicy Bypass -File $deployDst -Service web 2>&1
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

    $lockPath = Join-Path $testRoot ".deploy.lock"
    if (Test-Path $lockPath) {
      $errors.Add("deploy lock file was not cleaned up")
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
Test-DeployExitCodePropagation -RailwayExitCode 42 -ExpectedScriptExitCode 42 -Label "railway exit 42 is propagated"
# Regression: success path still works.
Test-DeployExitCodePropagation -RailwayExitCode 0  -ExpectedScriptExitCode 0  -Label "railway exit 0 stays 0"
# Another non-zero code (common Railway failure code 1).
Test-DeployExitCodePropagation -RailwayExitCode 1  -ExpectedScriptExitCode 1  -Label "railway exit 1 is propagated"

Write-Host ""
Write-Host "Passed: $($script:TestsPassed), Failed: $($script:TestsFailed)"

if ($script:TestsFailed -gt 0) {
  exit 1
}
exit 0
