$ErrorActionPreference = "Stop"
$testsPassed = 0
$testsFailed = 0

function Test-SafePush {
    param(
        [int]$PullExitCode,
        [int]$ExpectedExitCode,
        [bool]$ExpectPush,
        [string]$Label
    )

    $testRoot = Join-Path $env:TEMP "wcore-safe-push-test-$([guid]::NewGuid().ToString('N').Substring(0,8))"
    $mockBin = Join-Path $testRoot "mock-bin"
    $pushMarker = Join-Path $testRoot "push-called.txt"

    try {
        New-Item -ItemType Directory -Path (Join-Path $testRoot "src") -Force | Out-Null
        New-Item -ItemType Directory -Path $mockBin -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "safe-push.ps1") -Destination $testRoot
        Set-Content -LiteralPath (Join-Path $testRoot ".clasp.json") -Value '{"scriptId":"test-script","projectId":"test-project","rootDir":"src"}'
        Set-Content -LiteralPath (Join-Path $testRoot "src\Code.gs") -Value 'function test() { return true; }'
        Set-Content -LiteralPath (Join-Path $testRoot "src\appsscript.json") -Value '{"oauthScopes":[]}'

        $mock = @"
@echo off
if "%~1"=="--version" goto version
if "%~1"=="pull" goto pull
if "%~1"=="push" goto push
exit /b 1
:version
exit /b 0
:pull
if "$PullExitCode"=="0" goto pullsuccess
exit /b $PullExitCode
:pullsuccess
echo {"oauthScopes":[]}>appsscript.json
echo function remote^(^) { return true; }>Remote.js
exit /b 0
:push
echo called>"$pushMarker"
exit /b 0
"@
        Set-Content -LiteralPath (Join-Path $mockBin "clasp.cmd") -Value $mock

        $oldPath = $env:PATH
        $env:PATH = "$mockBin;$oldPath"
        Push-Location $testRoot
        try {
            $output = powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $testRoot "safe-push.ps1") 2>&1
            $actualExitCode = $LASTEXITCODE
        } finally {
            Pop-Location
            $env:PATH = $oldPath
        }

        $pushCalled = Test-Path $pushMarker
        if ($actualExitCode -ne $ExpectedExitCode -or $pushCalled -ne $ExpectPush) {
            throw "expected exit=$ExpectedExitCode push=$ExpectPush; got exit=$actualExitCode push=$pushCalled. Output: $($output -join ' | ')"
        }
        $script:testsPassed++
        Write-Host "PASS: $Label"
    } catch {
        $script:testsFailed++
        Write-Host "FAIL: $Label - $_" -ForegroundColor Red
    } finally {
        if (Test-Path $testRoot) { Remove-Item $testRoot -Recurse -Force }
    }
}

Test-SafePush -PullExitCode 17 -ExpectedExitCode 1 -ExpectPush $false -Label "nonzero clasp pull aborts before push"
Test-SafePush -PullExitCode 0 -ExpectedExitCode 0 -ExpectPush $true -Label "successful clasp pull permits push"

Write-Host "$testsPassed passed, $testsFailed failed"
if ($testsFailed -gt 0) { exit 1 }
