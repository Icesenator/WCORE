param([switch]$RealCorpus)

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'graphify-sync.ps1'
$fixtureRoot = Join-Path $env:TEMP ("wcore-graphify-sync-{0}" -f [guid]::NewGuid().ToString('N'))
$assertionCount = 0
$failed = $false
$originalPath = $env:PATH
$originalFakeGitMode = $env:WCORE_FAKE_GIT_MODE
$originalFakeGitRoot = $env:WCORE_FAKE_GIT_ROOT
$originalGitTraceWasSet = Test-Path Env:GIT_TRACE
$originalGitTrace = $env:GIT_TRACE
$stagingMarkerName = '.wcore-graphify-staging'
$stagingMarkerContent = 'WCORE Graphify staging v1'
$junctionPaths = @()
$externalFixturePaths = @()
$activeRealCorpusFixtureRoot = $null

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    $script:assertionCount++
    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Message
    )

    $script:assertionCount++
    if ($Actual -ne $Expected) {
        throw "Assertion failed: $Message (expected '$Expected', got '$Actual')"
    }
}

function Assert-Throws {
    param(
        [scriptblock]$Action,
        [string]$Message
    )

    $script:assertionCount++
    try {
        & $Action
    }
    catch {
        return
    }
    throw "Assertion failed: $Message (expected operation to throw)"
}

function Assert-ThrowsMatching {
    param(
        [scriptblock]$Action,
        [string]$Pattern,
        [string]$Message
    )

    $script:assertionCount++
    try {
        & $Action
    }
    catch {
        if ($_.Exception.Message -notmatch $Pattern) {
            throw "Assertion failed: $Message (expected error matching '$Pattern', got '$($_.Exception.Message)')"
        }
        return
    }
    throw "Assertion failed: $Message (expected operation to throw)"
}

function Assert-InRange {
    param(
        [int]$Actual,
        [int]$Minimum,
        [int]$Maximum,
        [string]$Message
    )

    $script:assertionCount++
    if ($Actual -lt $Minimum -or $Actual -gt $Maximum) {
        throw "Assertion failed: $Message (expected $Minimum..$Maximum, got $Actual)"
    }
}

function Restore-TestEnvironmentVariable {
    param(
        [string]$Name,
        [bool]$WasSet,
        [AllowNull()][string]$Value
    )

    if ($WasSet) {
        Set-Item -LiteralPath "Env:$Name" -Value $Value
    }
    else {
        Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
    }
}

function Get-FixtureWriteAuthorization {
    param([string]$Path)

    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        throw "Fixture write escaped its isolated root: $Path"
    }
    $normalizedPath = [System.IO.Path]::GetFullPath($Path)
    $allowedRoots = @(
        [pscustomobject]@{ Root = $fixtureRoot; Anchor = $env:TEMP }
    )
    if (-not [string]::IsNullOrWhiteSpace([string]$script:activeRealCorpusFixtureRoot)) {
        $allowedRoots += [pscustomobject]@{
            Root = $script:activeRealCorpusFixtureRoot
            Anchor = Split-Path -Parent $PSScriptRoot
        }
    }
    foreach ($allowed in $allowedRoots) {
        $normalizedRoot = [System.IO.Path]::GetFullPath($allowed.Root).TrimEnd('\', '/')
        if ($normalizedPath.StartsWith($normalizedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            return [pscustomobject]@{
                Path = $normalizedPath
                Root = $normalizedRoot
                Anchor = [System.IO.Path]::GetFullPath($allowed.Anchor).TrimEnd('\', '/')
            }
        }
    }
    throw "Fixture write escaped its isolated root: $Path"
}

function Assert-SafeFixtureWritePath {
    param([string]$Path)

    $authorization = Get-FixtureWriteAuthorization -Path $Path
    $anchor = $authorization.Anchor
    $parent = Split-Path -Parent $authorization.Path
    if (-not $parent.StartsWith($anchor + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Fixture write cannot prove physical ancestry from anchor '$anchor': $Path"
    }

    $anchorItem = Get-Item -LiteralPath $anchor -Force
    if (-not $anchorItem.PSIsContainer -or ($anchorItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Fixture write anchor is not a safe directory: $anchor"
    }
    $current = $anchor
    $relativeParent = $parent.Substring($anchor.Length + 1)
    foreach ($segment in ($relativeParent -split '[\\/]')) {
        $current = Join-Path $current $segment
        if (-not (Test-Path -LiteralPath $current)) {
            New-Item -ItemType Directory -Path $current | Out-Null
        }
        $item = Get-Item -LiteralPath $current -Force
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Fixture write ancestry contains a reparse point: $current"
        }
        if (-not $item.PSIsContainer) {
            throw "Fixture write ancestry contains a non-directory component: $current"
        }
    }
    if (Test-Path -LiteralPath $authorization.Path) {
        $targetItem = Get-Item -LiteralPath $authorization.Path -Force
        if (($targetItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Fixture write target is a reparse point: $($authorization.Path)"
        }
        if ($targetItem.PSIsContainer) {
            throw "Fixture write target is a directory: $($authorization.Path)"
        }
    }
    return $authorization.Path
}

function Write-Utf8Fixture {
    param(
        [string]$Path,
        [string]$Content
    )

    $normalizedPath = Assert-SafeFixtureWritePath -Path $Path
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($normalizedPath, $Content, $utf8)
}

function Write-FakeObsidianExport {
    param(
        [string[]]$Arguments,
        [hashtable]$Environment
    )

    if ($Arguments.Count -ne 6 -or $Arguments[0] -cne 'export' -or $Arguments[1] -cne 'obsidian' -or
        $Arguments[2] -cne '--graph' -or $Arguments[4] -cne '--dir' -or
        -not [System.IO.Path]::IsPathRooted($Arguments[3]) -or -not [System.IO.Path]::IsPathRooted($Arguments[5]) -or
        $null -eq $Environment -or -not $Environment.ContainsKey('GRAPHIFY_OUT') -or
        -not [System.IO.Path]::IsPathRooted([string]$Environment['GRAPHIFY_OUT'])) {
        throw "Invalid fake Obsidian export arguments: $($Arguments -join '|')"
    }
    $graphPath = [System.IO.Path]::GetFullPath($Arguments[3])
    $graphOut = [System.IO.Path]::GetFullPath([string]$Environment['GRAPHIFY_OUT']).TrimEnd('\', '/')
    $generatedPath = [System.IO.Path]::GetFullPath($Arguments[5])
    $expectedGraphPath = [System.IO.Path]::GetFullPath((Join-Path $graphOut 'graph.json'))
    try {
        $null = Get-FixtureWriteAuthorization -Path $graphPath
        $null = Get-FixtureWriteAuthorization -Path $generatedPath
    }
    catch {
        throw "Invalid fake Obsidian export arguments: $($Arguments -join '|')"
    }
    if (-not $graphPath.Equals($expectedGraphPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Invalid fake Obsidian export arguments: $($Arguments -join '|')"
    }
    $noteName = 'generated-node.md'
    Write-Utf8Fixture (Join-Path $generatedPath $noteName) '# Generated fixture node'
    Write-Utf8Fixture (Join-Path $generatedPath '.graphify_obsidian_manifest.json') `
        ([pscustomobject]@{ files = @($noteName) } | ConvertTo-Json -Compress)
    Write-Utf8Fixture (Join-Path $generatedPath 'graph.canvas') '{}'
}

function Write-StagingMarker {
    param([string]$Root)

    Write-Utf8Fixture (Join-Path $Root $stagingMarkerName) $stagingMarkerContent
}

function Write-GraphFixture {
    param(
        [string]$Path,
        [object[]]$Nodes,
        [object[]]$Edges
    )

    Write-Utf8Fixture $Path ([pscustomobject]@{
        nodes = $Nodes
        edges = $Edges
    } | ConvertTo-Json -Depth 8)
}

function Write-GraphifyNodeNoteFixture {
    param(
        [string]$Root,
        [string]$Name = 'orphan-node.md'
    )

    Write-Utf8Fixture (Join-Path $Root $Name) @'
---
source_file: "web-api/src/orphan.ts"
type: "code"
community: "Fixture Community"
location: "L1"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Fixture_Community
---

# Orphan Node

#graphify/code #graphify/EXTRACTED #community/Fixture_Community
'@
}

function Write-GraphifyCommunityNoteFixture {
    param([string]$Root)

    Write-Utf8Fixture (Join-Path $Root '_COMMUNITY_Fixture Community.md') @'
---
type: community
cohesion: 0.75
members: 1
---

# Fixture Community

**Cohesion:** 0.75 - tightly connected
**Members:** 1 nodes

## Members
- [[orphan-node]] - code - web-api/src/orphan.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Fixture_Community
SORT file.name ASC
```
'@
}

function Write-GraphifyGraphConfigFixture {
    param([string]$Root)

    Write-Utf8Fixture (Join-Path $Root '.obsidian\graph.json') @'
{
  "colorGroups": [
    {
      "query": "tag:#community/@fixture/Community.ts",
      "color": {"a": 1, "rgb": 123456}
    }
  ]
}
'@
}

function Try-NewJunction {
    param(
        [string]$Path,
        [string]$Target
    )

    try {
        New-Item -ItemType Junction -Path $Path -Target $Target -ErrorAction Stop | Out-Null
        $script:junctionPaths += $Path
        return $true
    }
    catch {
        return $false
    }
}

function Remove-TestJunction {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) {
        [System.IO.Directory]::Delete($Path)
    }
    $script:junctionPaths = @($script:junctionPaths | Where-Object { $_ -ne $Path })
}

try {
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
        throw "Production script does not exist: $scriptPath"
    }
    . $scriptPath

    Assert-ThrowsMatching {
        Write-Utf8Fixture '--no-label\graph.canvas' '{}'
    } 'escaped its isolated root' 'fixture writes reject relative paths instead of leaking into the process working directory'
    Assert-ThrowsMatching {
        Write-Utf8Fixture (Join-Path (Split-Path -Parent $PSScriptRoot) 'unrelated-fixture-write.txt') '{}'
    } 'escaped its isolated root' 'fixture writes reject unrelated absolute workspace paths'

    $fixtureWriteReparseTarget = Join-Path $fixtureRoot 'fixture-write-reparse-target'
    Write-Utf8Fixture (Join-Path $fixtureWriteReparseTarget 'seed.txt') 'seed'
    $fixtureWriteReparsePath = Join-Path $fixtureRoot 'fixture-write-reparse-link'
    if (Try-NewJunction -Path $fixtureWriteReparsePath -Target $fixtureWriteReparseTarget) {
        Assert-ThrowsMatching {
            Write-Utf8Fixture (Join-Path $fixtureWriteReparsePath 'escaped.txt') 'must not be written'
        } 'reparse point' 'fixture writes reject junction components beneath an allowed root'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixtureWriteReparseTarget 'escaped.txt'))) 'fixture writes do not traverse a rejected junction'
        Remove-TestJunction $fixtureWriteReparsePath
    }
    else {
        'SKIP: fixture-write junction creation denied; mocked reparse attributes remain covered.'
    }

    $restoreProbeName = 'WCORE_FIXTURE_RESTORE_PROBE'
    Remove-Item -LiteralPath "Env:$restoreProbeName" -ErrorAction SilentlyContinue
    Set-Item -LiteralPath "Env:$restoreProbeName" -Value 'mutated'
    Restore-TestEnvironmentVariable -Name $restoreProbeName -WasSet $false -Value $null
    Assert-True (-not (Test-Path -LiteralPath "Env:$restoreProbeName")) 'environment restoration preserves an originally unset variable'
    Set-Item -LiteralPath "Env:$restoreProbeName" -Value 'mutated'
    Restore-TestEnvironmentVariable -Name $restoreProbeName -WasSet $true -Value 'original'
    Assert-True (Test-Path -LiteralPath "Env:$restoreProbeName") 'environment restoration preserves an originally set variable'
    Assert-Equal (Get-Item -LiteralPath "Env:$restoreProbeName").Value 'original' 'environment restoration restores the original value exactly'
    Remove-Item -LiteralPath "Env:$restoreProbeName" -ErrorAction SilentlyContinue

    Assert-True ($null -ne (Get-Command Sync-WebCorpus -ErrorAction SilentlyContinue)) 'exposes Sync-WebCorpus'
    Assert-True ($null -ne (Get-Command Sync-GSheetCorpus -ErrorAction SilentlyContinue)) 'exposes Sync-GSheetCorpus'
    Assert-True ($null -ne (Get-Command New-StagingTree -ErrorAction SilentlyContinue)) 'exposes New-StagingTree'
    Assert-True ($null -ne (Get-Command Test-GraphArtifact -ErrorAction SilentlyContinue)) 'exposes Test-GraphArtifact'
    Assert-True ($null -ne (Get-Command Test-GraphifyObsidianManifest -ErrorAction SilentlyContinue)) 'exposes Graphify Obsidian manifest validation'
    Assert-True ($null -ne (Get-Command Test-GraphifyOrphanedExport -ErrorAction SilentlyContinue)) 'exposes orphaned Graphify export validation'
    Assert-True ($null -ne (Get-Command Enter-GraphifyMutex -ErrorAction SilentlyContinue)) 'exposes Enter-GraphifyMutex'
    Assert-True ($null -ne (Get-Command Exit-GraphifyMutex -ErrorAction SilentlyContinue)) 'exposes Exit-GraphifyMutex'
    Assert-True ($null -ne (Get-Command Invoke-GraphifyProcess -ErrorAction SilentlyContinue)) 'exposes Invoke-GraphifyProcess'
    Assert-True ($null -ne (Get-Command Invoke-GraphifySync -ErrorAction SilentlyContinue)) 'exposes Invoke-GraphifySync'
    Assert-True ($null -ne (Get-Command Get-GraphifyStatus -ErrorAction SilentlyContinue)) 'exposes Get-GraphifyStatus'
    Assert-True ($null -ne (Get-Command Test-GraphifyWatchPath -ErrorAction SilentlyContinue)) 'exposes pure watch path filtering'
    Assert-True ($null -ne (Get-Command Test-GraphifyWatchEvent -ErrorAction SilentlyContinue)) 'exposes pure watch event filtering'
    Assert-True ($null -ne (Get-Command New-GraphifyDebounceState -ErrorAction SilentlyContinue)) 'exposes pure debounce state creation'
    Assert-True ($null -ne (Get-Command Add-GraphifyDebounceEvent -ErrorAction SilentlyContinue)) 'exposes pure debounce event updates'
    Assert-True ($null -ne (Get-Command Test-GraphifyDebounceReady -ErrorAction SilentlyContinue)) 'exposes pure debounce readiness checks'
    Assert-True ($null -ne (Get-Command Clear-GraphifyDebounceState -ErrorAction SilentlyContinue)) 'exposes pure debounce consumption'
    Assert-True ($null -ne (Get-Command Invoke-GraphifyWatch -ErrorAction SilentlyContinue)) 'exposes injected watch orchestration'
    Assert-True ($null -ne (Get-Command New-GraphifyWatchOwnerState -ErrorAction SilentlyContinue)) 'exposes pure watch owner state creation'
    Assert-True ($null -ne (Get-Command Get-GraphifyScheduledTaskConfig -ErrorAction SilentlyContinue)) 'exposes pure scheduled task configuration'
    Assert-True ($null -ne (Get-Command New-GraphifyScheduledTaskDefinition -ErrorAction SilentlyContinue)) 'exposes side-effect-free native task definition creation'
    Assert-True ($null -ne (Get-Command Install-GraphifyScheduledTask -ErrorAction SilentlyContinue)) 'exposes injected scheduled task installation'
    Assert-True ($null -ne (Get-Command Uninstall-GraphifyScheduledTask -ErrorAction SilentlyContinue)) 'exposes guarded scheduled task removal'
    Assert-True (-not (Get-Command Sync-WebCorpus).Parameters.ContainsKey('FileSystemMode')) 'public Web sync does not expose filesystem discovery'
    Assert-True (-not (Get-Command Sync-GSheetCorpus).Parameters.ContainsKey('FileSystemMode')) 'public GSheet sync does not expose filesystem discovery'
    Assert-Throws {
        Sync-WebCorpus -SourceRoot $env:TEMP -DestinationRoot (Join-Path $env:TEMP 'unused-web') -FileSystemMode
    } 'public Web sync rejects a filesystem discovery bypass'
    Assert-Throws {
        Sync-GSheetCorpus -SourceRoot $env:TEMP -DestinationRoot (Join-Path $env:TEMP 'unused-gsheet') -FileSystemMode
    } 'public GSheet sync rejects a filesystem discovery bypass'

    $manifestValidationRoot = Join-Path $fixtureRoot 'manifest-validation'
    $manifestValidationPath = Join-Path $manifestValidationRoot '.graphify_obsidian_manifest.json'
    $manifestNotePath = Join-Path $manifestValidationRoot 'generated-node.md'
    $liveGeneratedPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'generated\graphify'
    Assert-True ((Get-NormalizedPath $manifestValidationRoot) -ne (Get-NormalizedPath $liveGeneratedPath)) `
        'manifest validation uses an isolated fixture and does not depend on the absent live generated export manifest'
    Write-Utf8Fixture $manifestNotePath '# Generated fixture node'
    Write-Utf8Fixture $manifestValidationPath '{"files":["generated-node.md"]}'
    $manifestValidation = Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    Assert-Equal $manifestValidation.Files 1 'accepts the Graphify 0.9.18 files-array manifest schema'

    Write-Utf8Fixture $manifestValidationPath '{invalid'
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'valid UTF-8 JSON' 'rejects malformed manifest JSON'
    Write-Utf8Fixture $manifestValidationPath '{}'
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'files.*array' 'rejects an empty manifest object'
    foreach ($invalidManifestJson in @('[]', '{"files":"generated-node.md"}', '{"files":[""]}')) {
        Write-Utf8Fixture $manifestValidationPath $invalidManifestJson
        Assert-Throws {
            Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
        } "rejects invalid manifest structure: $invalidManifestJson"
    }

    Write-Utf8Fixture (Join-Path $fixtureRoot 'outside-owned.md') '# Outside generated root'
    Write-Utf8Fixture $manifestValidationPath '{"files":["..\\outside-owned.md"]}'
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'beneath|relative' 'rejects manifest path traversal'
    Write-Utf8Fixture $manifestValidationPath ([pscustomobject]@{ files = @($manifestNotePath) } | ConvertTo-Json -Compress)
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'relative' 'rejects absolute manifest entries'
    Write-Utf8Fixture $manifestValidationPath '{"files":["missing-node.md"]}'
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'missing|regular file' 'rejects a manifest-owned file that is absent'

    Write-Utf8Fixture (Join-Path $manifestValidationRoot 'graph.canvas') '{}'
    Write-Utf8Fixture $manifestValidationPath '{"files":["graph.canvas"]}'
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'graph\.canvas' 'rejects manifest ownership of the removed Canvas'
    $manifestOwnedDirectory = Join-Path $manifestValidationRoot 'owned-directory'
    New-Item -ItemType Directory -Path $manifestOwnedDirectory -Force | Out-Null
    Write-Utf8Fixture $manifestValidationPath '{"files":["owned-directory"]}'
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'regular file|collision' 'rejects a manifest entry naming a directory'

    $manifestReparseTarget = Join-Path $fixtureRoot 'manifest-reparse-target'
    Write-Utf8Fixture (Join-Path $manifestReparseTarget 'linked.md') '# Linked fixture'
    $manifestReparsePath = Join-Path $manifestValidationRoot 'owned-link'
    if (Try-NewJunction -Path $manifestReparsePath -Target $manifestReparseTarget) {
        Write-Utf8Fixture $manifestValidationPath '{"files":["owned-link/linked.md"]}'
        Assert-ThrowsMatching {
            Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
        } 'reparse point' 'rejects a manifest-owned file reached through a reparse point'
        Remove-TestJunction $manifestReparsePath
    }
    else {
        'SKIP: manifest junction creation denied; output ancestry reparse tests remain covered.'
    }

    [System.IO.File]::WriteAllBytes($manifestValidationPath, [byte[]](0x7B, 0xFF, 0x7D))
    Assert-ThrowsMatching {
        Test-GraphifyObsidianManifest -RepositoryRoot $fixtureRoot -GeneratedPath $manifestValidationRoot
    } 'UTF-8' 'rejects manifest bytes that are not valid UTF-8'

    $orphanValidationRepository = Join-Path $fixtureRoot 'orphan-validation-repository'
    $orphanValidationRoot = Join-Path $orphanValidationRepository 'generated\graphify'
    Write-GraphifyNodeNoteFixture -Root $orphanValidationRoot
    Write-GraphifyCommunityNoteFixture -Root $orphanValidationRoot
    Write-GraphifyGraphConfigFixture -Root $orphanValidationRoot
    $orphanValidation = Test-GraphifyOrphanedExport -RepositoryRoot $orphanValidationRepository -GeneratedPath $orphanValidationRoot
    Assert-Equal $orphanValidation.MarkdownFiles 2 'accepts exact emitted node and community Markdown signatures'
    Assert-True $orphanValidation.HasGraphConfig 'accepts the exact Graphify-owned .obsidian graph config path and schema'

    Write-Utf8Fixture (Join-Path $orphanValidationRoot '.obsidian\graph.json') '{"colorGroups":[{"query":"path:human","color":{"a":1,"rgb":1}}]}'
    Assert-ThrowsMatching {
        Test-GraphifyOrphanedExport -RepositoryRoot $orphanValidationRepository -GeneratedPath $orphanValidationRoot
    } 'graph config|colorGroups|community' 'rejects an invalid orphan Graphify graph config'
    Write-GraphifyGraphConfigFixture -Root $orphanValidationRoot
    Write-Utf8Fixture (Join-Path $orphanValidationRoot '.hidden-state') 'human state'
    Assert-ThrowsMatching {
        Test-GraphifyOrphanedExport -RepositoryRoot $orphanValidationRepository -GeneratedPath $orphanValidationRoot
    } 'unexpected|hidden|Markdown' 'rejects an extra hidden file in an orphan export'

    $fakeExportRepository = Join-Path $fixtureRoot 'fake-export-repository'
    $fakeExportGraphOut = Join-Path $fakeExportRepository 'graphify-out'
    $fakeExportGraphPath = Join-Path $fakeExportGraphOut 'graph.json'
    $fakeExportGeneratedPath = Join-Path $fakeExportRepository 'generated\graphify'
    Write-Utf8Fixture $fakeExportGraphPath '{}'
    $validFakeExportArguments = @('export', 'obsidian', '--graph', $fakeExportGraphPath, '--dir', $fakeExportGeneratedPath)
    $validFakeExportEnvironment = @{ GRAPHIFY_OUT = $fakeExportGraphOut }
    Write-FakeObsidianExport -Arguments $validFakeExportArguments -Environment $validFakeExportEnvironment
    Assert-True (Test-Path -LiteralPath (Join-Path $fakeExportGeneratedPath 'generated-node.md') -PathType Leaf) 'exact fake export arguments write an owned generated note'
    foreach ($invalidFakeExport in @(
        [pscustomobject]@{ Arguments = @('export', 'obsidian', '--wrong', $fakeExportGraphPath, '--dir', $fakeExportGeneratedPath); Environment = $validFakeExportEnvironment; Name = 'wrong graph flag' },
        [pscustomobject]@{ Arguments = @('export', 'obsidian', '--graph', 'relative-graph.json', '--dir', $fakeExportGeneratedPath); Environment = $validFakeExportEnvironment; Name = 'relative graph path' },
        [pscustomobject]@{ Arguments = @('export', 'obsidian', '--graph', (Join-Path $fixtureRoot 'outside-graph.json'), '--dir', $fakeExportGeneratedPath); Environment = $validFakeExportEnvironment; Name = 'graph outside GRAPHIFY_OUT' },
        [pscustomobject]@{ Arguments = @('export', 'obsidian', '--graph', $fakeExportGraphPath, '--dir', 'relative-generated'); Environment = $validFakeExportEnvironment; Name = 'relative generated path' },
        [pscustomobject]@{ Arguments = @('export', 'obsidian', '--graph', $fakeExportGraphPath, '--dir', (Join-Path (Split-Path -Parent $PSScriptRoot) 'outside-generated')); Environment = $validFakeExportEnvironment; Name = 'generated path outside fixture roots' }
    )) {
        Assert-ThrowsMatching {
            Write-FakeObsidianExport -Arguments $invalidFakeExport.Arguments -Environment $invalidFakeExport.Environment
        } 'Invalid fake Obsidian export arguments' "rejects fake export with $($invalidFakeExport.Name)"
    }

    $fakeGraphifyBin = Join-Path $fixtureRoot 'fake-graphify-bin'
    New-Item -ItemType Directory -Path $fakeGraphifyBin -Force | Out-Null
    [System.IO.File]::Copy((Join-Path $env:SystemRoot 'System32\where.exe'), (Join-Path $fakeGraphifyBin 'graphify.exe'))
    $env:PATH = $fakeGraphifyBin + [System.IO.Path]::PathSeparator + $originalPath
    Assert-Equal @(Get-Command graphify -CommandType Application)[0].Source (Join-Path $fakeGraphifyBin 'graphify.exe') 'process seam resolves the injected fake executable'
    $fakeProcessResult = Invoke-GraphifyProcess -Arguments @('graphify.exe') -Environment @{ PATH = $fakeGraphifyBin }
    Assert-Equal $fakeProcessResult.ExitCode 0 "process seam reports the native exit code without invoking real Graphify; stdout='$($fakeProcessResult.StdOut.Trim())' stderr='$($fakeProcessResult.StdErr.Trim())'"
    Assert-Equal $fakeProcessResult.StdOut.Trim() (Join-Path $fakeGraphifyBin 'graphify.exe') 'process seam forwards arguments and the injected child environment'
    Assert-True ([string]::IsNullOrWhiteSpace($fakeProcessResult.StdErr)) 'process seam captures empty stderr'

    $argumentCaptureScript = Join-Path $fixtureRoot 'capture arguments.ps1'
    Write-Utf8Fixture $argumentCaptureScript @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CapturedArguments)
[Console]::Out.Write(($CapturedArguments | ConvertTo-Json -Compress))
'@
    [System.IO.File]::Copy((Join-Path $PSHOME 'powershell.exe'), (Join-Path $fakeGraphifyBin 'graphify.exe'), $true)
    $nativeArguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $argumentCaptureScript,
        'space value',
        'embedded"quote',
        'trailing\'
    )
    $capturedArgumentsResult = Invoke-GraphifyProcess -Arguments $nativeArguments -Environment @{ PATH = $fakeGraphifyBin }
    Assert-Equal $capturedArgumentsResult.ExitCode 0 'native argument fixture exits successfully'
    Assert-True ([string]::IsNullOrWhiteSpace($capturedArgumentsResult.StdErr)) 'native argument fixture writes no stderr'
    [object[]]$capturedArguments = $capturedArgumentsResult.StdOut | ConvertFrom-Json
    Assert-Equal ($capturedArguments -join '|') (($nativeArguments[5..7]) -join '|') 'native invocation preserves spaces, embedded quotes, and trailing backslashes'
    $env:PATH = $originalPath

    $syntheticNames = @(
        'space name.ts',
        "caf$([char]0x00E9).ts",
        'quote"name.ts',
        "tab`tname.ts",
        "line`nbreak.ts"
    )
    $syntheticPayload = (New-Object System.Text.UTF8Encoding($false, $true)).GetBytes(($syntheticNames -join [char]0) + [char]0)
    $parsedNames = @(ConvertFrom-GitNullOutput -Bytes $syntheticPayload)
    Assert-Equal $parsedNames.Count $syntheticNames.Count 'parses every NUL-delimited synthetic Git path'
    for ($nameIndex = 0; $nameIndex -lt $syntheticNames.Count; $nameIndex++) {
        Assert-Equal $parsedNames[$nameIndex] $syntheticNames[$nameIndex] "preserves synthetic Git path $nameIndex"
    }
    Assert-Equal @(ConvertFrom-GitNullOutput -Bytes ([byte[]]@())).Count 0 'accepts empty git ls-files output for caller validation'
    Assert-Throws {
        ConvertFrom-GitNullOutput -Bytes ([byte[]](0x61, 0x62, 0x63))
    } 'rejects Git output without trailing NUL'
    Assert-Throws {
        ConvertFrom-GitNullOutput -Bytes ([byte[]](0xFF, 0x00))
    } 'rejects invalid UTF-8 Git output'
    Assert-True (Test-ReparsePointAttributes -Attributes ([System.IO.FileAttributes]::Directory -bor [System.IO.FileAttributes]::ReparsePoint)) 'detects mocked reparse-point attributes'
    Assert-True (-not (Test-ReparsePointAttributes -Attributes ([System.IO.FileAttributes]::Directory))) 'accepts mocked ordinary directory attributes'

    $repositoryRoot = Join-Path $fixtureRoot 'repository'
    $webRoot = Join-Path $repositoryRoot 'wcore-web\apps\api'
    $gsheetRoot = Join-Path $repositoryRoot 'wcore-gsheet\src'
    $stage = Join-Path $repositoryRoot '.tmp\graphify-input'

    $graphFixtureRoot = Join-Path $fixtureRoot 'graph-validation'
    $graphPath = Join-Path $graphFixtureRoot 'graph.json'
    $previousStatePath = Join-Path $graphFixtureRoot 'status.json'
    Assert-Throws {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'rejects a missing graph artifact'
    Write-Utf8Fixture $graphPath '{invalid json'
    Assert-Throws {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'rejects invalid graph JSON'
    Write-Utf8Fixture $graphPath ([pscustomobject]@{
        nodes = @(
            [pscustomobject]@{ path = 'web-api/src/service.ts' },
            [pscustomobject]@{ path = 'gsheet/ENGINE.js' }
        )
    } | ConvertTo-Json -Depth 8)
    Assert-ThrowsMatching {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'edges or links' 'rejects a graph missing both edge collection names'
    Write-GraphFixture -Path $graphPath -Nodes @() -Edges @([pscustomobject]@{ source = 'a'; target = 'b' })
    Assert-Throws {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'rejects a graph with zero nodes'
    Write-GraphFixture -Path $graphPath -Nodes @(
        [pscustomobject]@{ path = 'web-api/src/service.ts' },
        [pscustomobject]@{ path = 'gsheet/ENGINE.js' }
    ) -Edges @()
    Assert-Throws {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'rejects a graph with zero edges'
    Write-GraphFixture -Path $graphPath -Nodes @(
        [pscustomobject]@{ path = 'web-api/src/service.ts' },
        [pscustomobject]@{ metadata = [pscustomobject]@{ source_path = 'web-api/src/router.ts' } }
    ) -Edges @([pscustomobject]@{ source = 'a'; target = 'b' })
    Assert-Throws {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'rejects nodes only from the web-api prefix'
    Write-GraphFixture -Path $graphPath -Nodes @(
        [pscustomobject]@{ file = 'gsheet/ENGINE.js' },
        [pscustomobject]@{ metadata = [pscustomobject]@{ sourcePath = 'gsheet/CHAIN.js' } }
    ) -Edges @([pscustomobject]@{ source = 'a'; target = 'b' })
    Assert-Throws {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'rejects nodes only from the gsheet prefix'

    $balancedNodes = @(
        [pscustomobject]@{ path = 'web-api/src/service.ts' },
        [pscustomobject]@{ metadata = [pscustomobject]@{ source_path = 'gsheet/ENGINE.js' } }
    )
    Write-GraphFixture -Path $graphPath -Nodes $balancedNodes -Edges @([pscustomobject]@{ source = 'a'; target = 'b' })
    $graphValidation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    Assert-Equal $graphValidation.Nodes 2 'returns the validated node count'
    Assert-Equal $graphValidation.Edges 1 'returns the validated edge count'

    $realFormatNodes = @(
        [pscustomobject]@{ source_file = 'K:\fixture\.tmp\graphify-input\web-api\src\service.ts' },
        [pscustomobject]@{ source_file = 'K:/fixture/.tmp/graphify-input/gsheet/ENGINE.js' }
    )
    $realFormatLinks = @(
        [pscustomobject]@{ source = 'web'; target = 'gsheet' },
        [pscustomobject]@{ source = 'gsheet'; target = 'web' }
    )
    Write-Utf8Fixture $graphPath ([pscustomobject]@{
        directed = $true
        multigraph = $false
        graph = @{}
        nodes = $realFormatNodes
        links = $realFormatLinks
    } | ConvertTo-Json -Depth 8)
    $linksValidation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    Assert-Equal $linksValidation.Nodes 2 'accepts canonical absolute source_file paths in a real NetworkX-format graph'
    Assert-Equal $linksValidation.Edges 2 'returns the selected links collection count'

    Write-Utf8Fixture $graphPath ([pscustomobject]@{
        nodes = $realFormatNodes
        edges = $null
        links = $realFormatLinks
    } | ConvertTo-Json -Depth 8)
    $nonNullLinksValidation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    Assert-Equal $nonNullLinksValidation.Edges 2 'selects links when a present edges field is null'

    Write-Utf8Fixture $graphPath ([pscustomobject]@{
        nodes = $realFormatNodes
        edges = $realFormatLinks
        links = $realFormatLinks
    } | ConvertTo-Json -Depth 8)
    $equivalentDualValidation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    Assert-Equal $equivalentDualValidation.Edges 2 'accepts equivalent dual edge collections without double counting'

    Write-Utf8Fixture $graphPath ([pscustomobject]@{
        nodes = $realFormatNodes
        edges = @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
        links = $realFormatLinks
    } | ConvertTo-Json -Depth 8)
    Assert-ThrowsMatching {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'edges and links' 'rejects inconsistent ambiguous dual edge collections'

    $largeNodes = @()
    $largeEdges = @()
    for ($graphIndex = 0; $graphIndex -lt 59; $graphIndex++) {
        $prefix = if (($graphIndex % 2) -eq 0) { 'web-api' } else { 'gsheet' }
        $largeNodes += [pscustomobject]@{ path = "$prefix/file-$graphIndex.js" }
        $largeEdges += [pscustomobject]@{ source = "n$graphIndex"; target = "n$($graphIndex + 1)" }
    }
    Write-Utf8Fixture $previousStatePath ([pscustomobject]@{ result = 'success'; nodes = 100; edges = 100 } | ConvertTo-Json)
    Write-GraphFixture -Path $graphPath -Nodes $largeNodes -Edges $largeEdges
    Assert-Throws {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'rejects more than 40 percent node and edge shrink versus prior success'

    $largeNodes += [pscustomobject]@{ path = 'gsheet/boundary.js' }
    $largeEdges += [pscustomobject]@{ source = 'n59'; target = 'n60' }
    Write-GraphFixture -Path $graphPath -Nodes $largeNodes -Edges $largeEdges
    $boundaryValidation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    Assert-Equal $boundaryValidation.Nodes 60 'accepts exactly 40 percent node shrink'
    Assert-Equal $boundaryValidation.Edges 60 'accepts exactly 40 percent edge shrink'

    Write-Utf8Fixture $previousStatePath ([pscustomobject]@{ result = 'error'; nodes = 0; edges = 0; lastSuccess = $null } | ConvertTo-Json)
    Write-GraphFixture -Path $graphPath -Nodes @(
        [pscustomobject]@{ path = 'K:\fixture\.tmp\graphify-input\web-api\src\service.ts' },
        [pscustomobject]@{ metadata = [pscustomobject]@{ filePath = 'K:/fixture/.tmp/graphify-input/gsheet/ENGINE.js' } }
    ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
    $absolutePathValidation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    Assert-Equal $absolutePathValidation.Nodes 2 'accepts both source prefixes inside absolute paths'

    Write-GraphFixture -Path $graphPath -Nodes @(
        [pscustomobject]@{ path = 'other/service.ts'; label = 'web-api/src/service.ts' },
        [pscustomobject]@{ metadata = [pscustomobject]@{ description = 'gsheet/ENGINE.js' }; filePath = 'other/ENGINE.js' }
    ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
    Assert-ThrowsMatching {
        Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    } 'no nodes from web-api' 'ignores source-like text in arbitrary labels and descriptions'

    Assert-ThrowsMatching {
        Assert-GraphifyProcessResult -Result ([pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $true; Error = $null }) -Operation 'partial fixture'
    } 'partial result' 'rejects a zero-exit partial result independently'
    Assert-ThrowsMatching {
        Assert-GraphifyProcessResult -Result ([pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = 'reported failure' }) -Operation 'error fixture'
    } 'reported an error' 'rejects a zero-exit populated Error independently'
    Assert-ThrowsMatching {
        Assert-GraphifyProcessResult -Result ([pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = 'warning-shaped failure'; Partial = $false; Error = $null }) -Operation 'stderr fixture'
    } 'reported an error' 'rejects zero-exit non-empty stderr independently'
    $acceptedWarning = Assert-GraphifyProcessResult -Result ([pscustomobject]@{
        ExitCode = 0
        StdOut = ''
        StdErr = "warning: 2 source file(s) produced zero nodes while other files parsed successfully.`r`n  web-api/src/empty.ts`r`n  gsheet/EMPTY.js"
        Partial = $false
        Error = $null
    }) -Operation 'warning fixture'
    Assert-True ([string]$acceptedWarning -match '^warning: 2 source file') 'accepts exit-zero warning-only stderr'
    Assert-True ([string]$acceptedWarning -match 'web-api/src/empty.ts') 'accepts wrapped warning continuation lines'
    $hubRelabelNotice = '[graphify] community set changed since labeling (306 saved labels, 307 communities now; renamed 306 community(ies) by their hub). Run `graphify label` to refresh names with the LLM.'
    $acceptedHubRelabelNotice = Assert-GraphifyProcessResult -Result ([pscustomobject]@{
        ExitCode = 0
        StdOut = ''
        StdErr = "  $hubRelabelNotice`r`n"
        Partial = $false
        Error = $null
    }) -Operation 'hub relabel fixture'
    Assert-Equal $acceptedHubRelabelNotice $hubRelabelNotice 'accepts the exact deterministic Graphify hub-relabel notice with surrounding whitespace'
    foreach ($invalidHubRelabelNotice in @(
        '[graphify] arbitrary informational message.',
        '[graphify] community set changed since labeling (306 saved labels, 307 communities now; renamed 306 community(ies) by their hub).',
        ($hubRelabelNotice + "`n[graphify] extra diagnostic"),
        ($hubRelabelNotice + "`nerror: parser failed"),
        ($hubRelabelNotice + "`nfatal: parser crashed")
    )) {
        Assert-ThrowsMatching {
            Assert-GraphifyProcessResult -Result ([pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = $invalidHubRelabelNotice; Partial = $false; Error = $null }) -Operation 'invalid hub relabel fixture'
        } 'reported an error' 'rejects malformed, extra, error, fatal, or arbitrary Graphify stderr outside the exact hub-relabel notice'
    }
    Assert-ThrowsMatching {
        Assert-GraphifyProcessResult -Result ([pscustomobject]@{ ExitCode = 9; StdOut = ''; StdErr = 'warning: misleading'; Partial = $false; Error = $null }) -Operation 'nonzero fixture'
    } 'exit code 9' 'rejects nonzero results even when stderr starts with warning'
    foreach ($firstDiagnostic in @('error: parser failed', 'fatal: parser crashed')) {
        Assert-ThrowsMatching {
            Assert-GraphifyProcessResult -Result ([pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = $firstDiagnostic; Partial = $false; Error = $null }) -Operation 'diagnostic fixture'
        } 'reported an error' "rejects stderr whose first diagnostic is $firstDiagnostic"
    }
    foreach ($laterDiagnostic in @('error: parser failed', 'fatal: parser crashed')) {
        Assert-ThrowsMatching {
            Assert-GraphifyProcessResult -Result ([pscustomobject]@{
                ExitCode = 0
                StdOut = ''
                StdErr = "warning: parser recovered`n  wrapped context`n$laterDiagnostic"
                Partial = $false
                Error = $null
            }) -Operation 'mixed diagnostic fixture'
        } 'reported an error' "rejects warning stderr followed by $laterDiagnostic"
    }

    $firstMutex = $null
    $mutexProbe = @'
$mutex = New-Object System.Threading.Mutex($false, 'Local\WCORE.Graphify.Sync')
try {
    if (-not $mutex.WaitOne(0)) { exit 9 }
    $mutex.ReleaseMutex()
    exit 0
}
finally {
    $mutex.Dispose()
}
'@
    try {
        $firstMutex = Enter-GraphifyMutex
        Assert-True $firstMutex.Acquired 'first mutex owner enters without waiting'
        Assert-Equal $firstMutex.Name 'Local\WCORE.Graphify.Sync' 'uses the production mutex name'
        & powershell.exe -NoProfile -Command $mutexProbe
        Assert-Equal $LASTEXITCODE 9 'second zero-timeout mutex owner cannot enter'
        Exit-GraphifyMutex -Handle $firstMutex
        $firstMutex = $null
        & powershell.exe -NoProfile -Command $mutexProbe
        Assert-Equal $LASTEXITCODE 0 'releasing the first mutex allows a subsequent owner'
    }
    finally {
        if ($null -ne $firstMutex) { Exit-GraphifyMutex -Handle $firstMutex }
    }

    $unexpectedWaitAction = {
        param($Mutex)
        if (-not $Mutex.WaitOne(0)) { throw 'fixture could not acquire mutex before injected wait failure' }
        throw 'injected unexpected WaitOne failure'
    }
    Assert-ThrowsMatching {
        Enter-GraphifyMutex -WaitAction $unexpectedWaitAction
    } 'unexpected WaitOne failure' 'propagates an unexpected mutex wait failure'
    & powershell.exe -NoProfile -Command $mutexProbe
    Assert-Equal $LASTEXITCODE 0 'unexpected WaitOne failure disposes the acquired mutex handle'

    $scriptCommand = Get-Command $scriptPath
    Assert-True $scriptCommand.Parameters.ContainsKey('Mode') 'dispatch exposes Mode'
    Assert-True $scriptCommand.Parameters.ContainsKey('ParentPid') 'dispatch exposes ParentPid'
    $modeValidateSet = @($scriptCommand.Parameters['Mode'].Attributes | Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] })[0]
    Assert-Equal (($modeValidateSet.ValidValues | Sort-Object) -join ',') 'install-task,status,sync,uninstall-task,watch' 'dispatch limits Mode to planned commands'

    $watchRepository = 'K:\WCORE'
    Assert-True (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-web\apps\api\src\service.ts') 'Web API source changes trigger watch sync'
    Assert-True (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-gsheet\src\10_ENGINE.gs') 'GSheet source changes trigger watch sync'
    Assert-True (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-gsheet\src\appsscript.json') 'GSheet manifest changes trigger watch sync'
    Assert-True (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-web\apps\api\src\nested') 'Web directory-name changes trigger watch sync'
    Assert-True (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-gsheet\src\nested') 'GSheet directory-name changes trigger watch sync'
    Assert-True (-not (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-web\apps\api\node_modules\ignored.js')) 'excluded Web paths do not trigger watch sync'
    Assert-True (-not (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-web\apps\api\node_modules\nested')) 'excluded Web directory-name changes do not trigger watch sync'
    Assert-True (-not (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\wcore-gsheet\src\compat.js')) 'ignored GSheet compatibility paths do not trigger watch sync'
    Assert-True (-not (Test-GraphifyWatchPath -RepositoryRoot $watchRepository -Path 'K:\WCORE\README.md')) 'paths outside watched roots do not trigger watch sync'
    Assert-True (Test-GraphifyWatchEvent -RepositoryRoot $watchRepository -Event ([pscustomobject]@{
        ChangeType = 'Renamed'; Path = 'K:\WCORE\wcore-web\apps\api\node_modules\moved.ts'
        OldPath = 'K:\WCORE\wcore-web\apps\api\src\moved.ts'; IsDirectory = $false
    })) 'rename from included to excluded remains relevant through OldFullPath'
    Assert-True (Test-GraphifyWatchEvent -RepositoryRoot $watchRepository -Event ([pscustomobject]@{
        ChangeType = 'Renamed'; Path = 'K:\WCORE\wcore-web\apps\api\src\restored.ts'
        OldPath = 'K:\WCORE\wcore-web\apps\api\node_modules\restored.ts'; IsDirectory = $false
    })) 'rename from excluded to included is relevant through FullPath'
    Assert-True (Test-GraphifyWatchEvent -RepositoryRoot $watchRepository -Event ([pscustomobject]@{
        ChangeType = 'Renamed'; Path = 'K:\WCORE\wcore-web\apps\api\src\folder.with.dots'
        OldPath = 'K:\WCORE\wcore-web\apps\api\src\old.folder'; IsDirectory = $true
    })) 'explicit dotted directory rename is relevant'
    Assert-True (Test-GraphifyWatchEvent -RepositoryRoot $watchRepository -Event ([pscustomobject]@{
        ChangeType = 'Deleted'; Path = 'K:\WCORE\wcore-gsheet\src\deleted.folder'; OldPath = $null; IsDirectory = $null
    })) 'unknown dotted delete is handled conservatively as relevant'
    Assert-True (-not (Test-GraphifyWatchEvent -RepositoryRoot $watchRepository -Event ([pscustomobject]@{
        ChangeType = 'Changed'; Path = 'K:\WCORE\wcore-gsheet\src\ordinary.js'; OldPath = $null; IsDirectory = $false
    }))) 'known ignored ordinary file changes remain ignored'

    $debounceStart = [DateTimeOffset]::Parse('2026-07-19T10:00:00Z')
    $debounce = New-GraphifyDebounceState
    $debounce = Add-GraphifyDebounceEvent -State $debounce -Timestamp $debounceStart
    $debounce = Add-GraphifyDebounceEvent -State $debounce -Timestamp $debounceStart.AddSeconds(1)
    $debounce = Add-GraphifyDebounceEvent -State $debounce -Timestamp $debounceStart.AddSeconds(2)
    Assert-True (-not (Test-GraphifyDebounceReady -State $debounce -Timestamp $debounceStart.AddSeconds(4.9) -QuietPeriodSeconds 3)) 'debounce waits for three quiet seconds after the latest event'
    Assert-True (Test-GraphifyDebounceReady -State $debounce -Timestamp $debounceStart.AddSeconds(5) -QuietPeriodSeconds 3) 'debounce emits one request after the quiet period'
    $debounce = Clear-GraphifyDebounceState -State $debounce
    Assert-True (-not (Test-GraphifyDebounceReady -State $debounce -Timestamp $debounceStart.AddSeconds(9) -QuietPeriodSeconds 3)) 'consumed debounce request does not emit again'

    $watchState = [pscustomobject]@{
        Roots = New-Object 'System.Collections.Generic.List[string]'
        Registrations = New-Object 'System.Collections.Generic.List[string]'
        SyncAttempts = 0
        CompletedSyncs = 0
        SleepCalls = 0
        IdentityChecks = 0
        Heartbeats = 0
        OwnerModes = New-Object 'System.Collections.Generic.List[string]'
        Logs = 0
        LeaseReleased = $false
        WatchersDisposed = 0
        RegistrationsDisposed = 0
        Now = $debounceStart
        EventsReturned = $false
    }
    $watcherFactory = {
        param([string]$Root, [System.IO.NotifyFilters]$NotifyFilter, [bool]$IncludeSubdirectories, [int]$InternalBufferSize)
        $watchState.Roots.Add($Root)
        Assert-True $IncludeSubdirectories 'watchers recurse through each exact source root'
        Assert-InRange $InternalBufferSize 16384 65536 'watchers use a reasonably increased Windows buffer'
        $expectedNotifyFilter = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::DirectoryName -bor [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::CreationTime
        Assert-Equal ([int]$NotifyFilter) ([int]$expectedNotifyFilter) 'watchers use the exact planned notify filters'
        $watcher = [pscustomobject]@{ EnableRaisingEvents = $false }
        $watcher | Add-Member -MemberType ScriptMethod -Name Dispose -Value { $watchState.WatchersDisposed++ }
        return $watcher
    }
    $eventRegistrationAction = {
        param($Watcher, [string]$EventName, [string]$SourceIdentifier)
        $watchState.Registrations.Add($EventName)
        $registration = [pscustomobject]@{ SourceIdentifier = $SourceIdentifier }
        $registration | Add-Member -MemberType ScriptMethod -Name Dispose -Value { $watchState.RegistrationsDisposed++ }
        return $registration
    }
    $eventDrainAction = {
        if ($watchState.EventsReturned) { return @() }
        $watchState.EventsReturned = $true
        return @(
            [pscustomobject]@{ ChangeType = 'Changed'; Path = 'K:\WCORE\wcore-web\apps\api\src\one.ts'; OldPath = $null; IsDirectory = $false; ForceSync = $false },
            [pscustomobject]@{ ChangeType = 'Changed'; Path = 'K:\WCORE\README.md'; OldPath = $null; IsDirectory = $false; ForceSync = $false },
            [pscustomobject]@{ ChangeType = 'Renamed'; Path = 'K:\WCORE\wcore-web\apps\api\node_modules\ENGINE.gs'; OldPath = 'K:\WCORE\wcore-gsheet\src\ENGINE.gs'; IsDirectory = $false; ForceSync = $false }
        )
    }
    $sleepAction = {
        param([int]$Milliseconds)
        Assert-Equal $Milliseconds 1000 'watch mode polls at one-second intervals'
        $watchState.SleepCalls++
        $watchState.Now = $watchState.Now.AddSeconds(1)
    }
    $processIdentityAction = {
        param([int]$ProcessId)
        Assert-Equal $ProcessId 4242 'watch mode checks the injected nonzero parent PID'
        $watchState.IdentityChecks++
        if ($watchState.IdentityChecks -le 9) { return 'parent-start-a' }
        return $null
    }
    $watchLease = [pscustomobject]@{ Acquired = $true; Token = 'watch-token'; OwnerPath = 'fixture-owner.json'; ProcessId = 99; ParentPid = 4242 }
    $watchResult = Invoke-GraphifyWatch -RepositoryRoot $watchRepository -ParentPid 4242 `
        -WatcherFactory $watcherFactory -EventRegistrationAction $eventRegistrationAction -EventDrainAction $eventDrainAction `
        -ClockAction { $watchState.Now } -SleepAction $sleepAction -SyncAction {
            param([string]$Root)
            $watchState.SyncAttempts++
            if ($watchState.SyncAttempts -eq 1) { return [pscustomobject]@{ alreadyRunning = $true } }
            $watchState.CompletedSyncs++
            return [pscustomobject]@{ alreadyRunning = $false }
        } -ProcessIdentityAction $processIdentityAction -OwnerHeartbeatAction {
            param($Lease, $Timestamp, $Mode)
            $watchState.OwnerModes.Add([string]$Mode)
            if ($Mode -eq 'heartbeat') { $watchState.Heartbeats++ }
        } `
        -LogAction { param($ErrorRecord) $watchState.Logs++ } -LeaseAction { param($ParentStartIdentity) $watchLease } `
        -LeaseReleaseAction { param($Lease) $watchState.LeaseReleased = $true }
    Assert-Equal ($watchState.Roots -join '|') 'K:\WCORE\wcore-web\apps\api|K:\WCORE\wcore-gsheet\src' 'watch mode creates two watchers for the exact repository roots'
    Assert-Equal (($watchState.Registrations | Sort-Object -Unique) -join ',') 'Changed,Created,Deleted,Error,Renamed' 'watch mode registers data and overflow/error events'
    Assert-Equal $watchState.Registrations.Count 10 'watch mode registers all five events on both watchers'
    Assert-Equal $watchState.SyncAttempts 2 'contention preserves pending work and retries after a bounded delay'
    Assert-Equal $watchState.CompletedSyncs 1 'contention followed by success produces exactly one completed sync'
    Assert-Equal $watchState.Logs 0 'contention is retried without being logged as an exception'
    Assert-True ($watchState.Heartbeats -ge 1) 'watch owner heartbeat is updated on each live poll'
    Assert-Equal $watchState.Heartbeats $watchState.SleepCalls 'watch owner heartbeat is updated exactly once per completed poll'
    Assert-True ($watchState.OwnerModes -contains 'sync-start') 'owner state is marked syncing before synchronous sync'
    Assert-True ($watchState.OwnerModes -contains 'sync-end') 'owner state is reset after synchronous sync'
    Assert-Equal $watchResult.reason 'parent-exited' 'missing parent terminates watch mode'
    Assert-Equal $watchState.WatchersDisposed 2 'watch mode disposes both watchers'
    Assert-Equal $watchState.RegistrationsDisposed 10 'watch mode disposes all event registrations'
    Assert-True $watchState.LeaseReleased 'watch mode releases its ownership lease in finally'

    $throwState = [pscustomobject]@{ Now = $debounceStart; Poll = 0; Attempts = 0; Completed = 0; Logs = 0; EventsReturned = $false }
    $throwResult = Invoke-GraphifyWatch -RepositoryRoot $watchRepository -ParentPid 5000 `
        -WatcherFactory {
            param($Root, $Filter, $Recursive, $BufferSize)
            $watcher = [pscustomobject]@{ EnableRaisingEvents = $false }
            $watcher | Add-Member ScriptMethod Dispose {}
            $watcher
        } -EventRegistrationAction {
            param($Watcher, $EventName, $SourceIdentifier)
            $registration = [pscustomobject]@{ SourceIdentifier = $SourceIdentifier }
            $registration | Add-Member ScriptMethod Dispose {}
            $registration
        } -EventDrainAction {
            if ($throwState.EventsReturned) { return @() }
            $throwState.EventsReturned = $true
            @([pscustomobject]@{ ChangeType = 'Changed'; Path = 'K:\WCORE\wcore-gsheet\src\ENGINE.gs'; IsDirectory = $false; ForceSync = $false })
        } -ClockAction { $throwState.Now } -SleepAction { param($Milliseconds) $throwState.Now = $throwState.Now.AddSeconds(1) } `
        -SyncAction {
            param($Root)
            $throwState.Attempts++
            if ($throwState.Attempts -eq 1) { throw 'transient injected sync failure' }
            $throwState.Completed++
            [pscustomobject]@{ alreadyRunning = $false }
        } -ProcessIdentityAction {
            param($ProcessId)
            $throwState.Poll++
            if ($throwState.Poll -le 9) { 'parent-start' } else { $null }
        } -OwnerHeartbeatAction {} -LogAction { param($ErrorRecord) $throwState.Logs++ } `
        -LeaseAction { param($ParentStartIdentity) [pscustomobject]@{ Acquired = $true; Token = 'throw-token' } } -LeaseReleaseAction {}
    Assert-Equal $throwState.Attempts 2 'transient sync exception preserves pending work and retries'
    Assert-Equal $throwState.Completed 1 'transient sync exception is followed by exactly one completed sync'
    Assert-Equal $throwState.Logs 1 'transient sync exception is caught and logged once'
    Assert-Equal $throwResult.reason 'parent-exited' 'watcher remains alive after transient sync exception'

    $errorState = [pscustomobject]@{ Now = $debounceStart; Poll = 0; Syncs = 0; Returned = $false }
    $null = Invoke-GraphifyWatch -RepositoryRoot $watchRepository -ParentPid 6000 `
        -WatcherFactory {
            param($Root, $Filter, $Recursive, $BufferSize)
            $watcher = [pscustomobject]@{ EnableRaisingEvents = $false }
            $watcher | Add-Member ScriptMethod Dispose {}
            $watcher
        } -EventRegistrationAction {
            param($Watcher, $EventName, $SourceIdentifier)
            $registration = [pscustomobject]@{ SourceIdentifier = $SourceIdentifier }
            $registration | Add-Member ScriptMethod Dispose {}
            $registration
        } -EventDrainAction {
            if ($errorState.Returned) { return @() }
            $errorState.Returned = $true
            @([pscustomobject]@{ ChangeType = 'Error'; ForceSync = $true })
        } -ClockAction { $errorState.Now } -SleepAction { param($Milliseconds) $errorState.Now = $errorState.Now.AddSeconds(1) } `
        -SyncAction { param($Root) $errorState.Syncs++; [pscustomobject]@{ alreadyRunning = $false } } `
        -ProcessIdentityAction { param($ProcessId) $errorState.Poll++; if ($errorState.Poll -le 6) { 'parent-start' } else { $null } } `
        -OwnerHeartbeatAction {} -LogAction {} -LeaseAction { param($ParentStartIdentity) [pscustomobject]@{ Acquired = $true; Token = 'error-token' } } -LeaseReleaseAction {}
    Assert-Equal $errorState.Syncs 1 'watcher Error event forces one debounced full sync'

    $heartbeatState = [pscustomobject]@{ Now = $debounceStart; Poll = 0; Writes = 0; Logs = 0; Syncs = 0; Returned = $false }
    $heartbeatResult = Invoke-GraphifyWatch -RepositoryRoot $watchRepository -ParentPid 6500 `
        -WatcherFactory {
            param($Root, $Filter, $Recursive, $BufferSize)
            $watcher = [pscustomobject]@{ EnableRaisingEvents = $false }
            $watcher | Add-Member ScriptMethod Dispose {}
            $watcher
        } -EventRegistrationAction {
            param($Watcher, $EventName, $SourceIdentifier)
            $registration = [pscustomobject]@{ SourceIdentifier = $SourceIdentifier }
            $registration | Add-Member ScriptMethod Dispose {}
            $registration
        } -EventDrainAction {
            if ($heartbeatState.Returned) { return @() }
            $heartbeatState.Returned = $true
            @([pscustomobject]@{ ChangeType = 'Changed'; Path = 'K:\WCORE\wcore-gsheet\src\ENGINE.gs'; IsDirectory = $false; ForceSync = $false })
        } -ClockAction { $heartbeatState.Now } -SleepAction { param($Milliseconds) $heartbeatState.Now = $heartbeatState.Now.AddSeconds(1) } `
        -SyncAction { param($Root) $heartbeatState.Syncs++; [pscustomobject]@{ alreadyRunning = $false } } `
        -ProcessIdentityAction { param($ProcessId) $heartbeatState.Poll++; if ($heartbeatState.Poll -le 7) { 'parent-start' } else { $null } } `
        -OwnerHeartbeatAction {
            param($Lease, $Timestamp, $Mode)
            $heartbeatState.Writes++
            if ($heartbeatState.Writes -eq 1) { throw 'transient heartbeat write failure' }
        } -LogAction { param($ErrorRecord) $heartbeatState.Logs++ } `
        -LeaseAction { param($ParentStartIdentity) [pscustomobject]@{ Acquired = $true; Token = 'heartbeat-token' } } -LeaseReleaseAction {}
    Assert-True ($heartbeatState.Writes -ge 2) 'heartbeat writer retries on the next poll after a transient failure'
    Assert-Equal $heartbeatState.Logs 1 'transient heartbeat failure is caught and logged once'
    Assert-Equal $heartbeatState.Syncs 1 'event sync still executes after transient heartbeat failure'
    Assert-Equal $heartbeatResult.reason 'parent-exited' 'transient heartbeat failure does not terminate watcher'

    $reuseState = [pscustomobject]@{ Calls = 0 }
    $reuseResult = Invoke-GraphifyWatch -RepositoryRoot $watchRepository -ParentPid 7000 `
        -WatcherFactory { throw 'watchers must not start after parent PID reuse' } `
        -ProcessIdentityAction { param($ProcessId) $reuseState.Calls++; if ($reuseState.Calls -eq 1) { 'original-start' } else { 'replacement-start' } } `
        -LeaseAction { param($ParentStartIdentity) [pscustomobject]@{ Acquired = $true; Token = 'reuse-token' } } -LeaseReleaseAction {}
    Assert-Equal $reuseResult.reason 'parent-exited' 'parent PID reuse terminates watch mode by start identity'

    $ownerTimestamp = [DateTimeOffset]::Parse('2026-07-19T12:00:00Z')
    $ownerState = New-GraphifyWatchOwnerState -Token 'owner-token' -WatcherPid 111 -ParentPid 222 `
        -WatcherStartIdentity 'watcher-start' -ParentStartIdentity 'parent-start' -Timestamp $ownerTimestamp
    Assert-Equal $ownerState.token 'owner-token' 'owner state includes random identity token'
    Assert-Equal $ownerState.watcherPid 111 'owner state includes watcher PID'
    Assert-Equal $ownerState.parentPid 222 'owner state includes parent PID'
    Assert-Equal $ownerState.watcherStartIdentity 'watcher-start' 'owner state includes watcher process start identity'
    Assert-Equal $ownerState.parentStartIdentity 'parent-start' 'owner state includes parent process start identity'
    Assert-Equal $ownerState.heartbeat $ownerTimestamp.ToString('o') 'owner state includes heartbeat timestamp'
    Assert-True (-not $ownerState.syncing) 'owner state is idle by default'
    Assert-True ($null -eq $ownerState.syncStartedUtc) 'idle owner state has no sync start timestamp'
    $syncOwnerState = New-GraphifyWatchOwnerState -Token 'sync-token' -WatcherPid 111 -ParentPid 222 `
        -WatcherStartIdentity 'watcher-start' -ParentStartIdentity 'parent-start' -Timestamp $ownerTimestamp `
        -Syncing $true -SyncStartedUtc $ownerTimestamp.AddMinutes(-2)
    Assert-True $syncOwnerState.syncing 'sync owner state records active synchronous sync'
    Assert-Equal $syncOwnerState.syncStartedUtc $ownerTimestamp.AddMinutes(-2).ToString('o') 'sync owner state records stable sync start timestamp'
    $identityStart = [DateTime]::Parse('2026-07-19T12:00:00Z').ToUniversalTime()
    Assert-Equal (Get-GraphifyProcessStartIdentity -ProcessId 111 -ProcessAction { param($ProcessId) [pscustomobject]@{ StartTime = $identityStart } }) `
        $identityStart.Ticks.ToString([System.Globalization.CultureInfo]::InvariantCulture) 'process identity uses start time when available'
    Assert-True ($null -eq (Get-GraphifyProcessStartIdentity -ProcessId 111 -ProcessAction { param($ProcessId) [pscustomobject]@{ StartTime = $null } })) `
        'process identity is unverifiable when start time is unavailable'
    Assert-True ($null -eq (Get-GraphifyProcessStartIdentity -ProcessId 111 -ProcessAction { param($ProcessId) $null })) 'process identity distinguishes a missing process'
    Assert-ThrowsMatching {
        Invoke-GraphifyWatch -RepositoryRoot $watchRepository -ParentPid 111 -ProcessExistsAction { $true } `
            -LeaseAction { throw 'PID-only lifetime seam must be rejected before lease acquisition' }
    } 'ProcessIdentityAction' 'watch mode rejects PID-only parent lifetime checks'
    $ownerReleaseOrder = New-Object 'System.Collections.Generic.List[string]'
    $raceLease = [pscustomobject]@{ Acquired = $true; Token = 'old-token'; OwnerPath = 'fixture-owner.json'; Mutex = New-Object object }
    Exit-GraphifyWatchLease -Lease $raceLease -ReleaseMutexAction { param($Lease) $ownerReleaseOrder.Add('release') } `
        -CleanupMutexAction { param($CleanupAction) $ownerReleaseOrder.Add('cleanup-blocked') } `
        -ReadOwnerAction { param($Path) $ownerReleaseOrder.Add('read'); [pscustomobject]@{ token = 'successor-token' } } `
        -DeleteOwnerAction { param($Path) $ownerReleaseOrder.Add('delete') }
    Assert-Equal ($ownerReleaseOrder -join ',') 'release,cleanup-blocked' 'teardown skips owner deletion when a successor acquires the mutex'
    $ownerReleaseOrder.Clear()
    $tokenRaceLease = [pscustomobject]@{ Acquired = $true; Token = 'old-token'; OwnerPath = 'fixture-owner.json'; Mutex = New-Object object }
    Exit-GraphifyWatchLease -Lease $tokenRaceLease -ReleaseMutexAction { param($Lease) $ownerReleaseOrder.Add('release') } `
        -CleanupMutexAction { param($CleanupAction) $ownerReleaseOrder.Add('cleanup'); & $CleanupAction } `
        -ReadOwnerAction { param($Path) $ownerReleaseOrder.Add('read'); [pscustomobject]@{ token = 'successor-token' } } `
        -DeleteOwnerAction { param($Path) $ownerReleaseOrder.Add('delete') }
    Assert-Equal ($ownerReleaseOrder -join ',') 'release,cleanup,read' 'teardown never deletes a successor record with a different token'
    $ownerReleaseOrder.Clear()
    $matchingLease = [pscustomobject]@{ Acquired = $true; Token = 'matching-token'; OwnerPath = 'fixture-owner.json'; Mutex = New-Object object }
    Exit-GraphifyWatchLease -Lease $matchingLease -ReleaseMutexAction { param($Lease) $ownerReleaseOrder.Add('release') } `
        -CleanupMutexAction { param($CleanupAction) $ownerReleaseOrder.Add('cleanup'); & $CleanupAction } `
        -ReadOwnerAction { param($Path) $ownerReleaseOrder.Add('read'); [pscustomobject]@{ token = 'matching-token' } } `
        -DeleteOwnerAction { param($Path) $ownerReleaseOrder.Add('delete') }
    Assert-Equal ($ownerReleaseOrder -join ',') 'release,cleanup,read,delete' 'teardown deletes only its matching owner record while holding the cleanup mutex'

    $taskConfig = Get-GraphifyScheduledTaskConfig -RepositoryRoot 'K:\WCORE'
    Assert-Equal $taskConfig.TaskName 'WCORE Graphify Sync' 'scheduled task uses the exact approved name'
    Assert-Equal $taskConfig.WorkingDirectory 'K:\WCORE' 'scheduled task uses the repository root as working directory'
    Assert-True ([System.IO.Path]::IsPathRooted($taskConfig.Executable)) 'scheduled task PowerShell executable is absolute'
    Assert-Equal ($taskConfig.Arguments -join '|') "-NoProfile|-ExecutionPolicy|Bypass|-File|K:\WCORE\scripts\graphify-sync.ps1|sync" 'scheduled task action invokes the absolute script in sync mode'
    Assert-Equal ($taskConfig.TriggerKinds -join ',') 'Logon,Hourly' 'scheduled task has logon and hourly triggers'
    Assert-Equal $taskConfig.RepetitionInterval.TotalMinutes 60 'scheduled task repeats every 60 minutes'
    Assert-Equal $taskConfig.MultipleInstances 'IgnoreNew' 'scheduled task ignores overlapping starts'
    Assert-Equal $taskConfig.RunLevel 'Limited' 'scheduled task requests no elevation'
    Assert-Equal $taskConfig.UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) 'scheduled task configuration is scoped to the current user'
    Assert-Equal $taskConfig.RestartCount 3 'scheduled task bounds ordinary failure restarts to three attempts'
    $scheduledTaskCmdlets = @(
        'New-ScheduledTaskAction', 'New-ScheduledTaskTrigger', 'New-ScheduledTaskSettingsSet',
        'New-ScheduledTaskPrincipal', 'New-ScheduledTask'
    )
    if (@($scheduledTaskCmdlets | Where-Object { $null -eq (Get-Command $_ -ErrorAction SilentlyContinue) }).Count -eq 0) {
        $taskDefinition = New-GraphifyScheduledTaskDefinition -Config $taskConfig
        Assert-Equal @($taskDefinition.Actions).Count 1 'native task definition has one action'
        Assert-Equal @($taskDefinition.Triggers).Count 2 'native task definition has logon and hourly triggers'
        Assert-Equal (($taskDefinition.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ',') 'MSFT_TaskLogonTrigger,MSFT_TaskTimeTrigger' 'native task definition uses exact trigger types'
        Assert-Equal $taskDefinition.Triggers[1].Repetition.Interval 'PT1H' 'native task definition repeats hourly'
        Assert-Equal ([int]$taskDefinition.Settings.MultipleInstances) 2 'native task definition uses IgnoreNew CIM value'
        Assert-Equal ([int]$taskDefinition.Settings.RestartCount) 3 'native task definition restarts ordinary failures at most three times'
        Assert-Equal ([int]$taskDefinition.Principal.RunLevel) 0 'native task definition principal is limited'
        Assert-Equal $taskDefinition.Actions[0].WorkingDirectory 'K:\WCORE' 'native task definition has exact working directory'
        Assert-Equal $taskDefinition.Actions[0].Execute $taskConfig.Executable 'native task definition has exact PowerShell executable'
        Assert-Equal $taskDefinition.Actions[0].Arguments $taskConfig.ArgumentString 'native task definition has exact sync arguments'
    }
    else {
        'SKIP: Windows ScheduledTasks definition cmdlets are unavailable.'
    }
    $taskLifecycle = [pscustomobject]@{ Registered = $null; Definition = $null; Removed = $false }
    Install-GraphifyScheduledTask -RepositoryRoot 'K:\WCORE' -RegisterAction {
        param($Config, $Definition)
        $taskLifecycle.Registered = $Config
        $taskLifecycle.Definition = $Definition
    }
    Assert-True ($null -ne $taskLifecycle.Registered) 'task installation uses its injected registration seam'
    Assert-True ($null -ne $taskLifecycle.Definition) 'task installation passes the native task definition to registration'
    Uninstall-GraphifyScheduledTask -RepositoryRoot 'K:\WCORE' -GetTaskAction {
        param([string]$TaskName)
        [pscustomobject]@{ Execute = $taskConfig.Executable; Arguments = $taskConfig.ArgumentString; WorkingDirectory = $taskConfig.WorkingDirectory }
    } -UnregisterAction { param([string]$TaskName) $taskLifecycle.Removed = $true }
    Assert-True $taskLifecycle.Removed 'task removal unregisters an exactly matching task'
    Assert-ThrowsMatching {
        Uninstall-GraphifyScheduledTask -RepositoryRoot 'K:\WCORE' -GetTaskAction {
            param([string]$TaskName)
            [pscustomobject]@{ Execute = 'C:\unknown\powershell.exe'; Arguments = '-File C:\unknown.ps1 sync'; WorkingDirectory = 'C:\unknown' }
        } -UnregisterAction { throw 'must not unregister unknown task' }
    } 'Refusing' 'task removal refuses an unknown task action'

    $productionSource = [System.IO.File]::ReadAllText($scriptPath)
    Assert-True ($productionSource -match 'System\.IO\.FileSystemWatcher') 'production source constructs .NET FileSystemWatcher instances'
    Assert-True ($productionSource -match "'Changed'.*'Created'.*'Deleted'.*'Renamed'") 'production source names all required watcher events'
    Assert-True ($productionSource -match 'New-ScheduledTaskTrigger') 'production source creates native scheduled task triggers'
    Assert-True ($productionSource -match 'New-ScheduledTaskTrigger -AtLogOn -User') 'production logon trigger is explicitly scoped per-user'
    Assert-True ($productionSource -match 'Register-ScheduledTask') 'production source registers the scheduled task only through lifecycle implementation'
    Assert-True ($productionSource -match 'Unregister-ScheduledTask') 'production source unregisters only through guarded lifecycle implementation'

    $pluginPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.opencode\plugins\graphify-watch.js'
    Assert-True (Test-Path -LiteralPath $pluginPath -PathType Leaf) 'OpenCode auto-discovery plugin exists'
    $pluginProbePath = Join-Path $fixtureRoot 'plugin-probe.mjs'
    $pluginUrl = ([uri]$pluginPath).AbsoluteUri
    Write-Utf8Fixture $pluginProbePath @"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';

const pluginSource = readFileSync(new URL('$pluginUrl'), 'utf8');
const pluginModule = await import('data:text/javascript;base64,' + Buffer.from(pluginSource).toString('base64'));
const { default: plugin, createGraphifyWatchPlugin, isOwnerFresh, IDENTITY_CACHE_TTL_MS } = pluginModule;

assert.equal(typeof plugin, 'function');
assert.equal(IDENTITY_CACHE_TTL_MS, 30000, 'identity cache TTL is exactly 30 seconds');
const expectedArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'K:\\WCORE\\scripts\\graphify-sync.ps1', 'watch', '-ParentPid', '5150'];
const nowMs = Date.parse('2026-07-19T12:00:00.000Z');
const ownerRecord = (overrides = {}) => ({
  token: 'token', watcherPid: 1234, parentPid: 5150, watcherStartIdentity: 'start-1234',
  heartbeat: '2026-07-19T11:59:58.000Z', syncing: false, syncStartedUtc: null, ...overrides,
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
const makeDeps = (overrides = {}) => {
  const calls = { spawn: [], log: [], kill: 0, scheduled: [], intervals: [], unref: 0, identities: [] };
  const deps = {
    existsSync: () => false,
    readFileSync: () => '',
    isProcessAlive: () => false,
    resolveProcessIdentity: async (pid) => { calls.identities.push(pid); return null; },
    now: () => nowMs,
    scheduleReconcile: (callback) => calls.scheduled.push(callback),
    setInterval: (callback, milliseconds) => {
      const timer = { callback, milliseconds, unref: () => { calls.unref++; } };
      calls.intervals.push(timer);
      return timer;
    },
    spawn: (...args) => {
      calls.spawn.push(args);
      const child = new EventEmitter();
      child.unref = () => {};
      child.kill = () => { calls.kill++; };
      return child;
    },
    logError: (error) => calls.log.push(String(error)),
    processPid: 5150,
    ...overrides,
  };
  return { calls, deps };
};

assert.equal(isOwnerFresh(ownerRecord(), nowMs), true, 'fresh idle heartbeat is trusted');
assert.equal(isOwnerFresh(ownerRecord({ heartbeat: '2026-07-19T11:50:00.000Z', syncing: true, syncStartedUtc: '2026-07-19T11:45:00.000Z' }), nowMs), true, 'recent active sync tolerates old heartbeat');
assert.equal(isOwnerFresh(ownerRecord({ heartbeat: '2026-07-19T11:00:00.000Z', syncing: true, syncStartedUtc: '2026-07-19T11:20:00.000Z' }), nowMs), false, 'overlong active sync is stale');

{
  const { calls, deps } = makeDeps();
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\OTHER', directory: 'K:\\WCORE', project: { worktree: 'K:\\WCORE' } });
  assert.equal(calls.spawn.length, 0, 'wrong workspace must not spawn');
  assert.equal(calls.scheduled.length, 0, 'wrong workspace schedules no reconciliation');
}
{
  let ownerExists = true;
  let child;
  const { calls, deps } = makeDeps({
    existsSync: () => ownerExists,
    readFileSync: () => JSON.stringify(ownerRecord()),
    isProcessAlive: (pid) => pid === 1234,
    resolveProcessIdentity: async () => 'start-1234',
    spawn: (...args) => {
      calls.spawn.push(args);
      child = new EventEmitter();
      child.unref = () => {};
      child.kill = () => { calls.kill++; };
      return child;
    },
  });
  const hooks = await createGraphifyWatchPlugin(deps)({ worktree: 'k:\\wcore', directory: 'K:\\WCORE\\scripts' });
  assert.deepEqual(hooks, {});
  assert.equal(calls.spawn.length, 0, 'initialization is nonblocking and does not reconcile inline');
  assert.equal(calls.scheduled.length, 1, 'initial reconciliation is scheduled asynchronously');
  assert.equal(calls.intervals.length, 1, 'periodic reconciliation timer is installed');
  assert.equal(calls.unref, 1, 'periodic reconciliation timer is unrefed');
  calls.scheduled[0]();
  await flush();
  assert.equal(calls.spawn.length, 0, 'session B observes fresh valid session A without spawning');
  ownerExists = false;
  calls.intervals[0].callback();
  await flush();
  assert.equal(calls.spawn.length, 1, 'session B spawns once after session A disappears');
  assert.equal(calls.spawn[0][0], 'powershell.exe');
  assert.deepEqual(calls.spawn[0][1], expectedArgs);
  assert.deepEqual(calls.spawn[0][2], { detached: true, stdio: 'ignore', windowsHide: true });
  calls.intervals[0].callback();
  await flush();
  assert.equal(calls.spawn.length, 1, 'local child state prevents duplicate spawn during owner-file startup latency');
  child.emit('exit', 0, null);
  calls.intervals[0].callback();
  await flush();
  assert.equal(calls.spawn.length, 2, 'child exit clears local state for the next reconciliation retry');
  assert.equal(calls.kill, 0, 'plugin never kills the foreign or local watcher');
}
{
  let currentOwner = ownerRecord();
  let identityCalls = 0;
  let livenessCalls = 0;
  const { calls, deps } = makeDeps({
    existsSync: () => true,
    readFileSync: () => JSON.stringify(currentOwner),
    isProcessAlive: () => { livenessCalls++; return true; },
    resolveProcessIdentity: async () => { identityCalls++; return currentOwner.watcherStartIdentity; },
  });
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE' });
  calls.scheduled[0]();
  await flush();
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 1, 'repeated fresh immutable owner resolves identity once');
  currentOwner = { ...currentOwner, heartbeat: '2026-07-19T11:59:59.000Z' };
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 1, 'heartbeat changes do not re-resolve immutable owner identity');
  currentOwner = { ...currentOwner, token: 'token-2' };
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 2, 'owner token change re-resolves identity');
  currentOwner = { ...currentOwner, watcherPid: 4321 };
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 3, 'owner PID change re-resolves identity');
  currentOwner = { ...currentOwner, watcherStartIdentity: 'start-4321' };
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 4, 'owner process start identity change re-resolves identity');
  assert.equal(livenessCalls, 6, 'every fresh reconciliation still checks PID liveness');
  assert.equal(calls.spawn.length, 0, 'all exactly verified owners suppress spawning');
}
{
  let clock = nowMs;
  let currentOwner = ownerRecord();
  let identityCalls = 0;
  const { calls, deps } = makeDeps({
    existsSync: () => true,
    readFileSync: () => JSON.stringify(currentOwner),
    isProcessAlive: () => true,
    now: () => clock,
    resolveProcessIdentity: async () => {
      identityCalls++;
      return identityCalls === 1 ? currentOwner.watcherStartIdentity : 'reused-process-start';
    },
  });
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE' });
  calls.scheduled[0]();
  await flush();
  assert.equal(identityCalls, 1, 'initial owner identity is verified');
  clock = nowMs + 29999;
  currentOwner = { ...currentOwner, heartbeat: new Date(clock).toISOString() };
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 1, 'same fresh owner uses identity cache at 29,999ms');
  assert.equal(calls.spawn.length, 0, 'owner remains trusted within identity cache TTL');
  clock = nowMs + 30001;
  currentOwner = { ...currentOwner, heartbeat: new Date(clock).toISOString() };
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 2, 'same live tuple revalidates identity after 30,001ms');
  assert.equal(calls.spawn.length, 1, 'identity mismatch after TTL makes owner untrusted and spawns mutex loser');
}
{
  let identityCalls = 0;
  let child;
  const { calls, deps } = makeDeps({
    existsSync: () => true,
    readFileSync: () => JSON.stringify(ownerRecord()),
    isProcessAlive: () => true,
    resolveProcessIdentity: async () => { identityCalls++; return identityCalls === 1 ? null : 'start-1234'; },
    spawn: (...args) => {
      calls.spawn.push(args);
      child = new EventEmitter();
      child.unref = () => {};
      return child;
    },
  });
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE' });
  calls.scheduled[0]();
  await flush();
  assert.equal(identityCalls, 1, 'failed identity verification is attempted initially');
  child.emit('exit', 0, null);
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 2, 'failed identity verification retries on later reconciliation');
  assert.equal(calls.spawn.length, 1, 'successful retry trusts foreign owner without another spawn');
}
for (const invalidMode of ['malformed', 'stale', 'dead']) {
  let currentOwner = ownerRecord();
  let malformed = false;
  let alive = true;
  let identityCalls = 0;
  let child;
  const { calls, deps } = makeDeps({
    existsSync: () => true,
    readFileSync: () => malformed ? '{invalid' : JSON.stringify(currentOwner),
    isProcessAlive: () => alive,
    resolveProcessIdentity: async () => { identityCalls++; return 'start-1234'; },
    spawn: (...args) => {
      calls.spawn.push(args);
      child = new EventEmitter();
      child.unref = () => {};
      return child;
    },
  });
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE' });
  calls.scheduled[0]();
  await flush();
  if (invalidMode === 'malformed') malformed = true;
  if (invalidMode === 'stale') currentOwner = { ...currentOwner, heartbeat: '2026-07-19T11:00:00.000Z' };
  if (invalidMode === 'dead') alive = false;
  calls.intervals[0].callback();
  await flush();
  child.emit('exit', 0, null);
  malformed = false;
  alive = true;
  currentOwner = ownerRecord();
  calls.intervals[0].callback();
  await flush();
  assert.equal(identityCalls, 2, invalidMode + ' owner invalidates successful identity cache');
}
{
  for (const identityMode of ['mismatch', 'exact']) {
    const { calls, deps } = makeDeps({
      existsSync: () => true,
      readFileSync: () => JSON.stringify(ownerRecord()),
      isProcessAlive: () => true,
      resolveProcessIdentity: async () => identityMode === 'exact' ? 'start-1234' : 'different-start',
    });
    await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE' });
    calls.scheduled[0]();
    await flush();
    assert.equal(calls.spawn.length, identityMode === 'exact' ? 0 : 1, 'live PID requires exact process start identity: ' + identityMode);
  }
}
{
  let resolveIdentity;
  const { calls, deps } = makeDeps({
    existsSync: () => true,
    readFileSync: () => JSON.stringify(ownerRecord()),
    isProcessAlive: () => true,
    resolveProcessIdentity: () => new Promise((resolve) => { resolveIdentity = resolve; }),
  });
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE' });
  calls.scheduled[0]();
  calls.intervals[0].callback();
  resolveIdentity('different-start');
  await flush();
  assert.equal(calls.spawn.length, 1, 'pending reconciliation prevents duplicate concurrent spawn');
}
{
  let child;
  const { calls, deps } = makeDeps({
    spawn: (...args) => {
      calls.spawn.push(args);
      child = new EventEmitter();
      child.unref = () => {};
      child.kill = () => { calls.kill++; };
      return child;
    },
  });
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE', directory: 'K:\\WCORE\\nested' });
  calls.scheduled[0]();
  await flush();
  child.emit('exit', 7, null);
  assert.equal(calls.log.length, 1, 'nonzero child exit is logged');
  assert.match(calls.log[0], /exit.*7/i);
  assert.equal(calls.kill, 0, 'plugin does not kill a failed watcher child');
  calls.intervals[0].callback();
  await flush();
  assert.equal(calls.spawn.length, 2, 'nonzero exit clears local state for retry');
}
{
  let child;
  const { calls, deps } = makeDeps({
    spawn: (...args) => {
      calls.spawn.push(args);
      child = new EventEmitter();
      child.unref = () => {};
      return child;
    },
  });
  await createGraphifyWatchPlugin(deps)({ worktree: 'K:\\WCORE' });
  calls.scheduled[0]();
  await flush();
  child.emit('error', new Error('injected child error'));
  assert.equal(calls.log.length, 1, 'child error events are logged');
  calls.intervals[0].callback();
  await flush();
  assert.equal(calls.spawn.length, 2, 'child error clears local state for retry');
}
{
  const { calls, deps } = makeDeps({ spawn: () => { throw new Error('injected spawn failure'); } });
  await createGraphifyWatchPlugin(deps)({ directory: 'K:\\WCORE' });
  calls.scheduled[0]();
  await flush();
  assert.equal(calls.log.length, 1, 'spawn exceptions are logged without rejecting initialization');
}
console.log('PLUGIN PASS');
"@
    $pluginProbeOutput = & node $pluginProbePath 2>&1 | Out-String
    Assert-Equal $LASTEXITCODE 0 "plugin imports and passes injected behavior probe: $pluginProbeOutput"
    Assert-True ($pluginProbeOutput -match 'PLUGIN PASS') 'plugin behavior probe completes'

    $dispatchFixtureRepository = Join-Path $fixtureRoot 'dispatch repository'
    $dispatchFixtureScripts = Join-Path $dispatchFixtureRepository 'scripts'
    New-Item -ItemType Directory -Path $dispatchFixtureScripts -Force | Out-Null
    $dispatchFixtureScript = Join-Path $dispatchFixtureScripts 'graphify-sync.ps1'
    [System.IO.File]::Copy($scriptPath, $dispatchFixtureScript)
    $dotSourceProbe = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ". '$dispatchFixtureScript' -Mode sync; 'dot-source-no-dispatch'"
    Assert-Equal $LASTEXITCODE 0 'dot-sourcing with sync mode does not dispatch orchestration'
    Assert-Equal ($dotSourceProbe -join '').Trim() 'dot-source-no-dispatch' 'dot-sourcing emits only the probe marker'
    $differentCwd = Join-Path $fixtureRoot 'different cwd'
    New-Item -ItemType Directory -Path $differentCwd -Force | Out-Null
    Push-Location $differentCwd
    try {
        $statusProbe = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dispatchFixtureScript -Mode status | Out-String
    }
    finally {
        Pop-Location
    }
    Assert-Equal $LASTEXITCODE 0 'status dispatch succeeds from a different working directory'
    Assert-True ($statusProbe -match 'never-run') 'status dispatch resolves repository root from PSScriptRoot without invoking Graphify'

    $atomicStatusRoot = Join-Path $fixtureRoot 'atomic status'
    $atomicStatusPath = Join-Path $atomicStatusRoot 'status.json'
    $completeAtomicStatus = [pscustomobject]@{ result = 'success'; nodes = 40; edges = 50 }
    Write-GraphifyStatus -StatusPath $atomicStatusPath -Status $completeAtomicStatus
    $completeAtomicStatusText = [System.IO.File]::ReadAllText($atomicStatusPath)
    Assert-ThrowsMatching {
        Write-GraphifyStatus -StatusPath $atomicStatusPath -Status ([pscustomobject]@{ result = 'error' }) -AfterNextWriteAction {
            param([string]$NextPath)
            Assert-True (Test-Path -LiteralPath $NextPath -PathType Leaf) 'after-next status seam observes the complete temporary file'
            throw 'injected status failure after next write'
        }
    } 'after next write' 'surfaces status failure after writing .next'
    Assert-Equal ([System.IO.File]::ReadAllText($atomicStatusPath)) $completeAtomicStatusText 'after-next failure preserves previous complete status'
    Assert-True (-not (Test-Path -LiteralPath ($atomicStatusPath + '.next'))) 'after-next failure cleans status .next'
    Assert-True (-not (Test-Path -LiteralPath ($atomicStatusPath + '.previous'))) 'after-next failure cleans status .previous'
    Assert-ThrowsMatching {
        Write-GraphifyStatus -StatusPath $atomicStatusPath -Status ([pscustomobject]@{ result = 'error' }) -CommitAction {
            param([string]$NextPath, [string]$StatusPath, [string]$PreviousPath, [string]$Mode)
            Assert-Equal $Mode 'replace' 'status commit seam selects replace for an existing status'
            throw 'injected status replace failure'
        }
    } 'replace failure' 'surfaces failure during atomic status replacement'
    Assert-Equal ([System.IO.File]::ReadAllText($atomicStatusPath)) $completeAtomicStatusText 'replace failure preserves previous complete status'
    Assert-True (-not (Test-Path -LiteralPath ($atomicStatusPath + '.next'))) 'replace failure cleans status .next'
    Assert-True (-not (Test-Path -LiteralPath ($atomicStatusPath + '.previous'))) 'replace failure cleans status .previous'
    $moveFailureStatusPath = Join-Path $atomicStatusRoot 'new-status.json'
    Assert-ThrowsMatching {
        Write-GraphifyStatus -StatusPath $moveFailureStatusPath -Status ([pscustomobject]@{ result = 'success' }) -CommitAction {
            param([string]$NextPath, [string]$StatusPath, [string]$PreviousPath, [string]$Mode)
            Assert-Equal $Mode 'move' 'status commit seam selects move for a new status'
            throw 'injected status move failure'
        }
    } 'move failure' 'surfaces failure during initial atomic status move'
    Assert-True (-not (Test-Path -LiteralPath $moveFailureStatusPath)) 'move failure does not publish an incomplete status'
    Assert-True (-not (Test-Path -LiteralPath ($moveFailureStatusPath + '.next'))) 'move failure cleans initial status .next'
    Assert-True (-not (Test-Path -LiteralPath ($moveFailureStatusPath + '.previous'))) 'move failure leaves no initial status .previous'

    $syncRepository = Join-Path $fixtureRoot 'sync repository'
    New-Item -ItemType Directory -Path $syncRepository -Force | Out-Null
    $syncGraphPath = Join-Path $syncRepository 'graphify-out\graph.json'
    $syncReportPath = Join-Path $syncRepository 'graphify-out\GRAPH_REPORT.md'
    $syncStatusPath = Join-Path $syncRepository 'graphify-out\status.json'
    $syncGeneratedPath = Join-Path $syncRepository 'generated\graphify'
    Write-Utf8Fixture (Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json') '{"files":[]}'
    Write-Utf8Fixture (Join-Path $syncGeneratedPath 'graph.canvas') '{"legacy":true}'
    Write-Utf8Fixture (Join-Path $syncGeneratedPath 'human-note.md') 'human-authored fixture'
    $syncProcessState = [pscustomobject]@{
        Calls = New-Object 'System.Collections.Generic.List[object]'
        StagingCalls = 0
    }
    $syncStagingAction = {
        param([string]$RepositoryRoot)
        $syncProcessState.StagingCalls++
        Assert-Equal $RepositoryRoot $syncRepository 'sync injects the normalized repository root into staging'
        return [pscustomobject]@{ WebCount = 7; GSheetCount = 3; WebBytes = 70; GSheetBytes = 30; TotalBytes = 100 }
    }
    $fixtureStagingAction = {
        param([string]$RepositoryRoot)
        return [pscustomobject]@{ WebCount = 7; GSheetCount = 3; WebBytes = 70; GSheetBytes = 30; TotalBytes = 100 }
    }
    $successfulProcessAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        $syncProcessState.Calls.Add([pscustomobject]@{
            Arguments = @($Arguments)
            GraphifyOut = $Environment['GRAPHIFY_OUT']
            QueryLogDisable = $Environment['GRAPHIFY_QUERY_LOG_DISABLE']
        })
        if ($Arguments[0] -eq 'extract') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/service.ts' },
                [pscustomobject]@{ metadata = [pscustomobject]@{ source_path = 'gsheet/ENGINE.js' } }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
        }
        elseif ($Arguments[0] -eq 'update' -or $Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/service.ts' },
                [pscustomobject]@{ metadata = [pscustomobject]@{ source_path = 'gsheet/ENGINE.js' } }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Fixture graph report'
        }
        elseif ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }

    $initialSync = Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $successfulProcessAction
    Assert-Equal $syncProcessState.StagingCalls 1 'successful sync builds one fresh staging tree'
    Assert-Equal $syncProcessState.Calls.Count 3 'initial sync invokes extraction, clustering, and export'
    Assert-Equal ($syncProcessState.Calls[0].Arguments -join '|') ("extract|$syncRepository\.tmp\graphify-input|--out|$syncRepository|--code-only") 'initial extraction uses the exact absolute code-only argument array'
    Assert-Equal ($syncProcessState.Calls[1].Arguments -join '|') ("cluster-only|$syncRepository|--graph|$syncGraphPath|--no-viz|--no-label") 'initial clustering uses the exact absolute no-LLM, no-visualization argument array'
    Assert-Equal ($syncProcessState.Calls[2].Arguments -join '|') ("export|obsidian|--graph|$syncGraphPath|--dir|$syncGeneratedPath") 'export runs after clustering with the exact absolute argument array'
    Assert-Equal $syncProcessState.Calls[0].GraphifyOut (Join-Path $syncRepository 'graphify-out') 'extract receives absolute GRAPHIFY_OUT'
    Assert-Equal $syncProcessState.Calls[0].QueryLogDisable '1' 'extract disables Graphify query logging'
    Assert-Equal $syncProcessState.Calls[1].GraphifyOut (Join-Path $syncRepository 'graphify-out') 'cluster-only receives the same absolute GRAPHIFY_OUT'
    Assert-Equal $syncProcessState.Calls[1].QueryLogDisable '1' 'cluster-only disables Graphify query logging'
    Assert-Equal $syncProcessState.Calls[2].GraphifyOut (Join-Path $syncRepository 'graphify-out') 'export receives the same absolute GRAPHIFY_OUT'
    Assert-Equal $initialSync.result 'success' 'successful sync reports success'
    Assert-Equal $initialSync.webCount 7 'successful sync reports Web corpus count'
    Assert-Equal $initialSync.gsheetCount 3 'successful sync reports GSheet corpus count'
    Assert-Equal $initialSync.nodes 2 'successful sync reports graph nodes'
    Assert-Equal $initialSync.edges 1 'successful sync reports graph edges'
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$initialSync.startTime)) 'successful sync reports a start timestamp'
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$initialSync.endTime)) 'successful sync reports an end timestamp'
    Assert-True ([long]$initialSync.durationMs -ge 0) 'successful sync reports nonnegative duration'
    Assert-True (Test-Path -LiteralPath $syncReportPath -PathType Leaf) 'successful clustering publishes GRAPH_REPORT.md as a file'
    Assert-True (Test-Path -LiteralPath $syncStatusPath -PathType Leaf) 'successful sync writes status.json'
    Assert-True (Test-Path -LiteralPath (Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json') -PathType Leaf) 'successful export retains ownership manifest'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) 'successful export removes monolithic canvas'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'human-note.md'))) 'human-authored fixture' 'successful canvas cleanup preserves unrelated files'
    Assert-True (-not (Test-Path -LiteralPath ($syncStatusPath + '.next'))) 'successful status write leaves no atomic temporary file'
    Assert-True (-not (Test-Path -LiteralPath ($syncStatusPath + '.previous'))) 'successful status write cleans its atomic backup file'
    $savedStatus = Get-GraphifyStatus -RepositoryRoot $syncRepository
    Assert-Equal $savedStatus.result 'success' 'Get-GraphifyStatus reads the last result'
    Assert-Equal $savedStatus.nodes 2 'Get-GraphifyStatus reads graph counts'

    $orphanRecoveryState = [pscustomobject]@{ Mode = 'success'; ExportCalls = 0; SawEmptyExportRoot = $false }
    $orphanRecoveryProcessAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'extract') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/recovery.ts' },
                [pscustomobject]@{ path = 'gsheet/RECOVERY.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
        }
        elseif ($Arguments[0] -eq 'update' -or $Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/recovery.ts' },
                [pscustomobject]@{ path = 'gsheet/RECOVERY.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Orphan recovery report'
        }
        elseif ($Arguments[0] -eq 'export') {
            $orphanRecoveryState.ExportCalls++
            $orphanRecoveryState.SawEmptyExportRoot = @(Get-ChildItem -LiteralPath $Arguments[5] -Force).Count -eq 0
            if ($orphanRecoveryState.Mode -eq 'partial-failure') {
                Write-Utf8Fixture (Join-Path $Arguments[5] 'partial.md') 'partial export'
                return [pscustomobject]@{ ExitCode = 4; StdOut = ''; StdErr = 'partial orphan export failure'; Partial = $true; Error = 'partial orphan export failure' }
            }
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }

    $signedOrphanRepository = Join-Path $fixtureRoot 'signed orphan recovery repository'
    $signedOrphanGenerated = Join-Path $signedOrphanRepository 'generated\graphify'
    Write-GraphifyNodeNoteFixture -Root $signedOrphanGenerated
    Write-GraphifyCommunityNoteFixture -Root $signedOrphanGenerated
    Write-GraphifyGraphConfigFixture -Root $signedOrphanGenerated
    $orphanRecoveryState.Mode = 'success'
    $orphanRecoveryState.ExportCalls = 0
    $signedOrphanRecovery = Invoke-GraphifySync -RepositoryRoot $signedOrphanRepository -StagingAction $fixtureStagingAction -ProcessAction $orphanRecoveryProcessAction
    Assert-Equal $signedOrphanRecovery.result 'success' 'fully signed orphan export recovery succeeds'
    Assert-Equal $orphanRecoveryState.ExportCalls 1 'fully signed orphan export reaches export exactly once'
    Assert-True $orphanRecoveryState.SawEmptyExportRoot 'fully signed orphan export is recreated empty before export'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $signedOrphanGenerated 'orphan-node.md'))) 'successful orphan recovery removes stale signed notes before export'
    Assert-True (Test-Path -LiteralPath (Join-Path $signedOrphanGenerated '.graphify_obsidian_manifest.json') -PathType Leaf) 'successful orphan recovery publishes a validated manifest'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $signedOrphanGenerated 'graph.canvas'))) 'successful orphan recovery publishes no Canvas'

    $humanOrphanRepository = Join-Path $fixtureRoot 'human orphan rejection repository'
    $humanOrphanGenerated = Join-Path $humanOrphanRepository 'generated\graphify'
    Write-GraphifyNodeNoteFixture -Root $humanOrphanGenerated
    Write-Utf8Fixture (Join-Path $humanOrphanGenerated 'human-note.md') '# Human note without Graphify frontmatter'
    $orphanRecoveryState.Mode = 'success'
    $orphanRecoveryState.ExportCalls = 0
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $humanOrphanRepository -StagingAction $fixtureStagingAction -ProcessAction $orphanRecoveryProcessAction
    } 'exact generated signature' 'one unsigned human note aborts orphan recovery before export'
    Assert-Equal $orphanRecoveryState.ExportCalls 0 'unsigned human note prevents export invocation'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $humanOrphanGenerated 'human-note.md'))) '# Human note without Graphify frontmatter' 'unsigned human note remains unchanged after rejection'
    Assert-True (Test-Path -LiteralPath (Join-Path $humanOrphanGenerated 'orphan-node.md') -PathType Leaf) 'signed neighbor remains after human-note rejection'

    $partialOrphanRepository = Join-Path $fixtureRoot 'partial orphan rollback repository'
    $partialOrphanGenerated = Join-Path $partialOrphanRepository 'generated\graphify'
    Write-GraphifyNodeNoteFixture -Root $partialOrphanGenerated
    Write-GraphifyCommunityNoteFixture -Root $partialOrphanGenerated
    Write-GraphifyGraphConfigFixture -Root $partialOrphanGenerated
    $orphanNodeBeforeFailure = [System.IO.File]::ReadAllText((Join-Path $partialOrphanGenerated 'orphan-node.md'))
    $orphanCommunityBeforeFailure = [System.IO.File]::ReadAllText((Join-Path $partialOrphanGenerated '_COMMUNITY_Fixture Community.md'))
    $orphanConfigBeforeFailure = [System.IO.File]::ReadAllText((Join-Path $partialOrphanGenerated '.obsidian\graph.json'))
    $orphanRecoveryState.Mode = 'partial-failure'
    $orphanRecoveryState.ExportCalls = 0
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $partialOrphanRepository -StagingAction $fixtureStagingAction -ProcessAction $orphanRecoveryProcessAction
    } 'partial orphan export failure' 'partial export failure aborts signed orphan recovery'
    Assert-Equal $orphanRecoveryState.ExportCalls 1 'partial orphan export runs only after observing an empty recovery root'
    Assert-True $orphanRecoveryState.SawEmptyExportRoot 'partial orphan export starts from an empty recreated root'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $partialOrphanGenerated 'orphan-node.md'))) $orphanNodeBeforeFailure 'partial export rollback restores the signed node exactly'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $partialOrphanGenerated '_COMMUNITY_Fixture Community.md'))) $orphanCommunityBeforeFailure 'partial export rollback restores the community note exactly'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $partialOrphanGenerated '.obsidian\graph.json'))) $orphanConfigBeforeFailure 'partial export rollback restores the graph config exactly'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $partialOrphanGenerated 'partial.md'))) 'partial export rollback removes partial output'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $partialOrphanGenerated '.graphify_obsidian_manifest.json'))) 'partial export rollback restores the orphan state without fabricating a manifest'

    Assert-ThrowsMatching {
        Test-GraphifyOrphanedExport -RepositoryRoot $partialOrphanRepository -GeneratedPath $fixtureRoot
    } 'restricted to' 'orphan recovery validation refuses arbitrary repository paths'

    $longWarningContext = 'x' * 5000
    $warningProcessAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'update') {
            return [pscustomobject]@{
                ExitCode = 0
                StdOut = ''
                StdErr = "warning: 2 source file(s) produced zero nodes.`n  $longWarningContext"
                Partial = $false
                Error = $null
            }
        }
        if ($Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/service.ts' },
                [pscustomobject]@{ path = 'gsheet/ENGINE.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Warning fixture report'
            return [pscustomobject]@{
                ExitCode = 0
                StdOut = ''
                StdErr = ''
                Partial = $false
                Error = $null
            }
        }
        Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
        return [pscustomobject]@{
            ExitCode = 0
            StdOut = ''
            StdErr = "warning: export skipped one unsupported relation.`n  relation: fixture"
            Partial = $false
            Error = $null
        }
    }
    $warningSync = Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $warningProcessAction
    Assert-Equal @($warningSync.warnings).Count 2 'successful sync reports graph and export warnings'
    Assert-True ([string]$warningSync.warnings[0] -match '^Graphify graph build: warning: 2 source file') 'successful sync identifies the graph warning'
    Assert-True ([string]$warningSync.warnings[1] -match '^Graphify Obsidian export: warning: export skipped') 'successful sync identifies the export warning'
    Assert-True (([string]$warningSync.warnings[0]).Length -le 2048) 'successful status bounds each warning'
    $savedWarningStatus = Get-GraphifyStatus -RepositoryRoot $syncRepository
    Assert-Equal @($savedWarningStatus.warnings).Count 2 'persisted success status retains graph and export warnings'
    Assert-True (([string]$savedWarningStatus.warnings[0]).Length -le 2048) 'persisted success status keeps warning text bounded'

    $syncProcessState.Calls.Clear()
    $updateSync = Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $successfulProcessAction
    Assert-Equal $syncProcessState.Calls.Count 2 'update sync skips redundant clustering when update publishes the report'
    Assert-Equal ($syncProcessState.Calls[0].Arguments -join '|') ("update|$syncRepository\.tmp\graphify-input|--force") 'existing graph update uses the exact absolute argument array'
    Assert-Equal ($syncProcessState.Calls[1].Arguments -join '|') ("export|obsidian|--graph|$syncGraphPath|--dir|$syncGeneratedPath") 'update export runs directly after a complete update'
    Assert-Equal $syncProcessState.Calls[0].GraphifyOut (Join-Path $syncRepository 'graphify-out') 'update receives absolute GRAPHIFY_OUT'
    Assert-Equal $syncProcessState.Calls[0].QueryLogDisable '1' 'update disables Graphify query logging'
    Assert-Equal $updateSync.result 'success' 'successful update reports success'

    $missingBuildReportCalls = New-Object 'System.Collections.Generic.List[object]'
    $missingBuildReportAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        $missingBuildReportCalls.Add([pscustomobject]@{ Arguments = @($Arguments) })
        if ($Arguments[0] -eq 'update') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/service.ts' },
                [pscustomobject]@{ path = 'gsheet/ENGINE.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Remove-Item -LiteralPath (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') -Force
        }
        elseif ($Arguments[0] -eq 'cluster-only') {
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Recovered fixture report'
        }
        elseif ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    $missingBuildReportSync = Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $missingBuildReportAction
    Assert-Equal $missingBuildReportSync.result 'success' 'update missing its report recovers successfully'
    Assert-Equal $missingBuildReportCalls.Count 3 'update missing its report invokes clustering before export'
    Assert-Equal ($missingBuildReportCalls[0].Arguments -join '|') ("update|$syncRepository\.tmp\graphify-input|--force") 'missing-report recovery starts with update'
    Assert-Equal ($missingBuildReportCalls[1].Arguments -join '|') ("cluster-only|$syncRepository|--graph|$syncGraphPath|--no-viz|--no-label") 'missing-report recovery uses the exact deterministic clustering arguments'
    Assert-Equal ($missingBuildReportCalls[2].Arguments -join '|') ("export|obsidian|--graph|$syncGraphPath|--dir|$syncGeneratedPath") 'missing-report recovery exports only after clustering'

    $hubRelabelProcessAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'update') {
            Remove-Item -LiteralPath (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') -Force
            return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
        }
        elseif ($Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/service.ts' },
                [pscustomobject]@{ path = 'gsheet/ENGINE.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Hub relabel fixture report'
            return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = $hubRelabelNotice; Partial = $false; Error = $null }
        }
        elseif ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    $hubRelabelSync = Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $hubRelabelProcessAction
    Assert-Equal $hubRelabelSync.result 'success' 'exact deterministic hub-relabel notice does not block a valid sync'
    Assert-Equal @($hubRelabelSync.warnings).Count 1 'successful hub relabel sync records one warning'
    Assert-Equal $hubRelabelSync.warnings[0] ("Graphify clustering: " + $hubRelabelNotice) 'successful status identifies the exact clustering hub-relabel notice'
    $savedHubRelabelStatus = Get-GraphifyStatus -RepositoryRoot $syncRepository
    Assert-Equal $savedHubRelabelStatus.warnings[0] ("Graphify clustering: " + $hubRelabelNotice) 'persisted status records the deterministic hub-relabel notice without an LLM call'

    $preservedGraph = [System.IO.File]::ReadAllText($syncGraphPath)
    $preservedReport = [System.IO.File]::ReadAllText($syncReportPath)
    $preservedManifest = [System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json'))
    $preservedGeneratedNote = [System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'generated-node.md'))
    $preservedHumanNote = [System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'human-note.md'))

    $rejectedHubRelabelMode = [pscustomobject]@{ Value = $null }
    $rejectedHubRelabelAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'update') {
            Remove-Item -LiteralPath (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') -Force
            return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
        }
        elseif ($Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/rejected-notice.ts' },
                [pscustomobject]@{ path = 'gsheet/REJECTED_NOTICE.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Rejected hub relabel fixture report'
            $stderr = if ($rejectedHubRelabelMode.Value -eq 'malformed') {
                '[graphify] community set changed since labeling (306 saved labels, 307 communities now; renamed by their hub). Run `graphify label` to refresh names with the LLM.'
            }
            elseif ($rejectedHubRelabelMode.Value -eq 'extra') {
                $hubRelabelNotice + "`n[graphify] unknown extra line"
            }
            else {
                $hubRelabelNotice + "`nerror: injected cluster failure"
            }
            return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = $stderr; Partial = $false; Error = $null }
        }
        throw 'export must not run after rejected clustering stderr'
    }
    foreach ($rejectedMode in @('malformed', 'extra', 'error')) {
        $rejectedHubRelabelMode.Value = $rejectedMode
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $rejectedHubRelabelAction
        } 'Graphify clustering reported an error' "rejects $rejectedMode hub-relabel stderr before export"
        Assert-Equal ([System.IO.File]::ReadAllText($syncGraphPath)) $preservedGraph "$rejectedMode hub-relabel rejection restores the prior graph"
        Assert-Equal ([System.IO.File]::ReadAllText($syncReportPath)) $preservedReport "$rejectedMode hub-relabel rejection restores the prior report"
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json'))) $preservedManifest "$rejectedMode hub-relabel rejection preserves the prior manifest"
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'generated-node.md'))) $preservedGeneratedNote "$rejectedMode hub-relabel rejection preserves the prior generated note"
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'human-note.md'))) $preservedHumanNote "$rejectedMode hub-relabel rejection preserves the human note"
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) "$rejectedMode hub-relabel rejection preserves the no-canvas tree"
    }
    $clusterFailureCalls = New-Object 'System.Collections.Generic.List[string]'
    $failedClusterAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        $clusterFailureCalls.Add([string]$Arguments[0])
        if ($Arguments[0] -eq 'update') {
            Remove-Item -LiteralPath (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') -Force
        }
        if ($Arguments[0] -eq 'cluster-only') {
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Partial replacement report'
            return [pscustomobject]@{ ExitCode = 11; StdOut = ''; StdErr = 'cluster failed'; Partial = $false; Error = $null }
        }
        if ($Arguments[0] -eq 'export') { throw 'export must not run after failed clustering' }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $failedClusterAction
    } 'Graphify clustering failed with exit code 11' 'cluster-only failure aborts before validation and export'
    Assert-Equal ($clusterFailureCalls -join '|') 'update|cluster-only' 'cluster failure stops orchestration before export'
    Assert-Equal ([System.IO.File]::ReadAllText($syncReportPath)) $preservedReport 'cluster failure restores the prior report exactly'

    $missingReportCalls = New-Object 'System.Collections.Generic.List[string]'
    $missingReportAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        $missingReportCalls.Add([string]$Arguments[0])
        if ($Arguments[0] -eq 'update') {
            Remove-Item -LiteralPath (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') -Force
        }
        if ($Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/missing-report.ts' },
                [pscustomobject]@{ path = 'gsheet/MISSING_REPORT.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Remove-Item -LiteralPath (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') -Force
        }
        elseif ($Arguments[0] -eq 'export') {
            throw 'export must not run without GRAPH_REPORT.md'
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $missingReportAction
    } 'GRAPH_REPORT\.md|Required output file does not exist' 'successful cluster-only without a report fails before validation and export'
    Assert-Equal ($missingReportCalls -join '|') 'update|cluster-only' 'missing cluster report stops orchestration before export'
    Assert-Equal ([System.IO.File]::ReadAllText($syncGraphPath)) $preservedGraph 'missing cluster report restores the prior graph exactly'
    Assert-Equal ([System.IO.File]::ReadAllText($syncReportPath)) $preservedReport 'missing cluster report restores the prior report exactly'
    $failedUpdateAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'update') {
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') '{partial'
            return [pscustomobject]@{ ExitCode = 7; StdOut = ''; StdErr = 'update failed'; Partial = $true; Error = 'update failed' }
        }
        throw 'export must not run after failed update'
    }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $failedUpdateAction
    } 'exit code 7' 'nonzero partial update fails in process-result validation'
    Assert-Equal ([System.IO.File]::ReadAllText($syncGraphPath)) $preservedGraph 'failed update restores the prior graph exactly'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json'))) $preservedManifest 'failed update preserves the prior export manifest'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'generated-node.md'))) $preservedGeneratedNote 'failed update preserves the prior generated note'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) 'failed update preserves the prior no-canvas export contract'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'human-note.md'))) $preservedHumanNote 'failed update preserves unrelated generated-directory content'
    Assert-Equal (Get-GraphifyStatus -RepositoryRoot $syncRepository).result 'error' 'failed update atomically records error status'
    $failedUpdateStatus = Get-GraphifyStatus -RepositoryRoot $syncRepository
    Assert-Equal $failedUpdateStatus.lastSuccess.nodes 2 'failed update preserves the prior successful node baseline'
    Assert-Equal $failedUpdateStatus.lastSuccess.edges 1 'failed update preserves the prior successful edge baseline'
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$failedUpdateStatus.startTime)) 'error status contains startTime'
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$failedUpdateStatus.endTime)) 'error status contains endTime'
    Assert-True ([long]$failedUpdateStatus.durationMs -ge 0) 'error status contains nonnegative duration'
    Assert-Equal $failedUpdateStatus.webCount 7 'failed update status preserves Web corpus count'
    Assert-Equal $failedUpdateStatus.gsheetCount 3 'failed update status preserves GSheet corpus count'
    Assert-Equal $failedUpdateStatus.nodes 0 'failed update status has no validated node count'
    Assert-Equal $failedUpdateStatus.edges 0 'failed update status has no validated edge count'
    Assert-Equal $failedUpdateStatus.error 'Graphify graph build failed with exit code 7: update failed' 'failed update status records the original operation error'
    Assert-Equal $failedUpdateStatus.result 'error' 'failed update status reports error result'
    Assert-True (-not [bool]$failedUpdateStatus.alreadyRunning) 'failed update status is not an already-running result'
    Assert-Equal @(Get-ChildItem -LiteralPath (Join-Path $syncRepository '.tmp') -Directory | Where-Object { $_.Name -like 'graphify-sync-*' }).Count 0 'ordinary rollback removes its GUID recovery root'
    Assert-True (-not (Test-Path -LiteralPath ($syncStatusPath + '.next'))) 'failed status write leaves no atomic temporary file'
    Assert-True (-not (Test-Path -LiteralPath ($syncStatusPath + '.previous'))) 'failed status write cleans its atomic backup file'

    $failedExportAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/changed.ts' },
                [pscustomobject]@{ path = 'gsheet/CHANGED.js' }
            ) -Edges @([pscustomobject]@{ source = 'changed-web'; target = 'changed-gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Changed fixture report'
            return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
        }
        if ($Arguments[0] -eq 'update') {
            return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
        }
        if ($Arguments[0] -ne 'export') {
            throw "Unexpected failed-export fixture operation: $($Arguments[0])"
        }
        Write-Utf8Fixture (Join-Path $Arguments[5] 'graph.canvas') 'partial canvas'
        Write-Utf8Fixture (Join-Path $Arguments[5] 'partial.md') 'partial export'
        return [pscustomobject]@{ ExitCode = 4; StdOut = ''; StdErr = 'export failed'; Partial = $true; Error = 'export failed' }
    }
    Assert-Throws {
        Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $failedExportAction
    } 'failed export fails the sync'
    Assert-Equal ([System.IO.File]::ReadAllText($syncGraphPath)) $preservedGraph 'failed export restores the prior graph exactly'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json'))) $preservedManifest 'failed export restores the prior manifest exactly'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'generated-node.md'))) $preservedGeneratedNote 'failed export restores the prior generated note exactly'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) 'failed export restores the prior no-canvas generated tree'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'human-note.md'))) $preservedHumanNote 'failed export restores unrelated generated-directory content'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'partial.md'))) 'failed export removes partial generated output during restoration'
    $failedExportStatus = Get-GraphifyStatus -RepositoryRoot $syncRepository
    Assert-Equal $failedExportStatus.nodes 2 'failed export status reports validated graph nodes'
    Assert-Equal $failedExportStatus.edges 1 'failed export status reports validated graph edges'
    Assert-Equal $failedExportStatus.error 'Graphify Obsidian export failed with exit code 4: export failed' 'failed export status records the original export error'

    $missingManifestAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/service.ts' },
                [pscustomobject]@{ path = 'gsheet/ENGINE.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Missing manifest fixture report'
        }
        elseif ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
            Remove-Item -LiteralPath (Join-Path $Arguments[5] '.graphify_obsidian_manifest.json') -Force
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    Assert-Throws {
        Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $missingManifestAction
    } 'rejects an export missing its ownership manifest'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json'))) $preservedManifest 'missing-manifest export restores the prior generated directory'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'generated-node.md'))) $preservedGeneratedNote 'missing-manifest export restores the prior generated note'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) 'missing-manifest rollback restores the prior no-canvas tree'

    $invalidExportManifestMode = [pscustomobject]@{ Value = $null }
    $invalidExportManifestAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
            $manifestPath = Join-Path $Arguments[5] '.graphify_obsidian_manifest.json'
            if ($invalidExportManifestMode.Value -eq 'malformed') {
                Write-Utf8Fixture $manifestPath '{invalid'
            }
            elseif ($invalidExportManifestMode.Value -eq 'traversal') {
                Write-Utf8Fixture (Join-Path (Split-Path -Parent $Arguments[5]) 'outside-owned.md') '# Outside export root'
                Write-Utf8Fixture $manifestPath '{"files":["..\\outside-owned.md"]}'
            }
            elseif ($invalidExportManifestMode.Value -eq 'missing-file') {
                Write-Utf8Fixture $manifestPath '{"files":["missing-owned.md"]}'
            }
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    foreach ($invalidMode in @('malformed', 'traversal', 'missing-file')) {
        $invalidExportManifestMode.Value = $invalidMode
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $invalidExportManifestAction
        } 'Graphify Obsidian manifest' "wrapper rejects a successful export with a $invalidMode manifest"
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json'))) $preservedManifest "$invalidMode manifest rollback restores the prior manifest"
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'generated-node.md'))) $preservedGeneratedNote "$invalidMode manifest rollback restores the prior generated note"
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $syncGeneratedPath 'human-note.md'))) $preservedHumanNote "$invalidMode manifest rollback preserves the human note"
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) "$invalidMode manifest rollback restores the prior no-canvas tree"
    }

    $missingCanvasAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'cluster-only') {
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                [pscustomobject]@{ path = 'web-api/src/service.ts' },
                [pscustomobject]@{ path = 'gsheet/ENGINE.js' }
            ) -Edges @([pscustomobject]@{ source = 'web'; target = 'gsheet' })
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Missing canvas fixture report'
        }
        elseif ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
            Remove-Item -LiteralPath (Join-Path $Arguments[5] 'graph.canvas') -Force
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    $missingCanvasSync = Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $missingCanvasAction
    Assert-Equal $missingCanvasSync.result 'success' 'accepts an export that does not contain graph.canvas'
    Assert-True (Test-Path -LiteralPath (Join-Path $syncGeneratedPath '.graphify_obsidian_manifest.json') -PathType Leaf) 'canvas-free export still requires its ownership manifest'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $syncGeneratedPath 'graph.canvas'))) 'canvas is not required after a successful export'

    Write-Utf8Fixture $syncStatusPath ([pscustomobject]@{ result = 'success'; nodes = 100; edges = 100 } | ConvertTo-Json)
    Assert-Throws {
        Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $syncStagingAction -ProcessAction $successfulProcessAction
    } 'rejects unexplained shrink produced by an otherwise successful Graphify process'
    Assert-Equal ([System.IO.File]::ReadAllText($syncGraphPath)) $preservedGraph 'shrink rejection restores the prior graph'

    $baselineRepository = Join-Path $fixtureRoot 'baseline repository'
    New-Item -ItemType Directory -Path $baselineRepository -Force | Out-Null
    $baselineMode = [pscustomobject]@{ Value = 'success'; Calls = 0 }
    $baselineProcessAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'extract' -or $Arguments[0] -eq 'update') {
            if ($baselineMode.Value -eq 'failure') {
                return [pscustomobject]@{ ExitCode = 5; StdOut = ''; StdErr = 'injected baseline failure'; Partial = $false; Error = $null }
            }
            if ($Arguments[0] -eq 'extract') {
                Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes @(
                    [pscustomobject]@{ path = 'web-api/file-0.js' },
                    [pscustomobject]@{ path = 'gsheet/file-1.js' }
                ) -Edges @([pscustomobject]@{ source = 'n0'; target = 'n1' })
            }
            else {
                $count = if ($baselineMode.Value -eq 'shrink') { 59 } else { 100 }
                $nodes = @()
                $edges = @()
                for ($index = 0; $index -lt $count; $index++) {
                    $prefix = if (($index % 2) -eq 0) { 'web-api' } else { 'gsheet' }
                    $nodes += [pscustomobject]@{ path = "$prefix/file-$index.js" }
                    $edges += [pscustomobject]@{ source = "n$index"; target = "n$($index + 1)" }
                }
                Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes $nodes -Edges $edges
                Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Baseline fixture report'
            }
        }
        elseif ($Arguments[0] -eq 'cluster-only') {
            $count = if ($baselineMode.Value -eq 'shrink') { 59 } else { 100 }
            $nodes = @()
            $edges = @()
            for ($index = 0; $index -lt $count; $index++) {
                $prefix = if (($index % 2) -eq 0) { 'web-api' } else { 'gsheet' }
                $nodes += [pscustomobject]@{ path = "$prefix/file-$index.js" }
                $edges += [pscustomobject]@{ source = "n$index"; target = "n$($index + 1)" }
            }
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes $nodes -Edges $edges
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Baseline fixture report'
        }
        elseif ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    $null = Invoke-GraphifySync -RepositoryRoot $baselineRepository -StagingAction $fixtureStagingAction -ProcessAction $baselineProcessAction
    $baselineMode.Value = 'failure'
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $baselineRepository -StagingAction $fixtureStagingAction -ProcessAction $baselineProcessAction
    } 'exit code 5' 'records a failed sync after a successful baseline'
    $baselineErrorStatus = Get-GraphifyStatus -RepositoryRoot $baselineRepository
    Assert-Equal $baselineErrorStatus.lastSuccess.nodes 100 'error status carries forward successful node count'
    Assert-Equal $baselineErrorStatus.lastSuccess.edges 100 'error status carries forward successful edge count'
    $baselineMode.Value = 'shrink'
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $baselineRepository -StagingAction $fixtureStagingAction -ProcessAction $baselineProcessAction
    } 'shrank by more than 40 percent' 'rejects shrink against success preceding an error without rewriting status manually'

    foreach ($earlyFailurePhase in @('staging', 'backup')) {
        $earlyFailureRepository = Join-Path $fixtureRoot ("early baseline $earlyFailurePhase")
        New-Item -ItemType Directory -Path $earlyFailureRepository -Force | Out-Null
        $baselineMode.Value = 'success'
        $null = Invoke-GraphifySync -RepositoryRoot $earlyFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $baselineProcessAction
        $failingEarlyStaging = {
            param([string]$RepositoryRoot)
            throw 'injected staging failure after prior success'
        }
        $failingEarlyBackup = {
            param([string]$Source, [string]$Destination)
            throw 'injected backup failure after prior success'
        }
        if ($earlyFailurePhase -eq 'staging') {
            Assert-ThrowsMatching {
                Invoke-GraphifySync -RepositoryRoot $earlyFailureRepository -StagingAction $failingEarlyStaging -ProcessAction $baselineProcessAction
            } 'staging failure' 'records intended staging failure after a successful baseline'
        }
        else {
            Assert-ThrowsMatching {
                Invoke-GraphifySync -RepositoryRoot $earlyFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $baselineProcessAction -DirectoryCopyAction $failingEarlyBackup
            } 'backup failure' 'records intended backup failure after a successful baseline'
        }
        $earlyFailureStatus = Get-GraphifyStatus -RepositoryRoot $earlyFailureRepository
        Assert-Equal $earlyFailureStatus.lastSuccess.nodes 100 "$earlyFailurePhase failure preserves prior successful nodes"
        Assert-Equal $earlyFailureStatus.lastSuccess.edges 100 "$earlyFailurePhase failure preserves prior successful edges"
        $baselineMode.Value = 'shrink'
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $earlyFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $baselineProcessAction
        } 'shrank by more than 40 percent' "shrink after $earlyFailurePhase failure uses the prior successful baseline"
    }

    Write-Utf8Fixture $previousStatePath ([pscustomobject]@{ result = 'error'; nodes = 100; edges = 100; lastSuccess = $null } | ConvertTo-Json -Depth 4)
    Write-GraphFixture -Path $graphPath -Nodes $balancedNodes -Edges @([pscustomobject]@{ source = 'a'; target = 'b' })
    $noErrorBaselineValidation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
    Assert-Equal $noErrorBaselineValidation.Nodes 2 'error status counts without lastSuccess are not used as successful shrink baseline'

    $failedInitialExportRepository = Join-Path $fixtureRoot 'failed initial export baseline'
    New-Item -ItemType Directory -Path $failedInitialExportRepository -Force | Out-Null
    $initialExportMode = [pscustomobject]@{ FailExport = $true }
    $initialExportProcess = {
        param([string[]]$Arguments, [hashtable]$Environment)
        if ($Arguments[0] -eq 'cluster-only') {
            $count = if ($initialExportMode.FailExport) { 100 } else { 2 }
            $nodes = @()
            $edges = @()
            for ($index = 0; $index -lt $count; $index++) {
                $prefix = if (($index % 2) -eq 0) { 'web-api' } else { 'gsheet' }
                $nodes += [pscustomobject]@{ path = "$prefix/initial-export-$index.js" }
                $edges += [pscustomobject]@{ source = "n$index"; target = "n$($index + 1)" }
            }
            Write-GraphFixture -Path (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') -Nodes $nodes -Edges $edges
            Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'GRAPH_REPORT.md') '# Initial export fixture report'
            return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
        }
        if ($Arguments[0] -eq 'export' -and $initialExportMode.FailExport) {
            return [pscustomobject]@{ ExitCode = 6; StdOut = ''; StdErr = 'initial export failed'; Partial = $false; Error = $null }
        }
        if ($Arguments[0] -eq 'export') {
            Write-FakeObsidianExport -Arguments $Arguments -Environment $Environment
        }
        return [pscustomobject]@{ ExitCode = 0; StdOut = ''; StdErr = ''; Partial = $false; Error = $null }
    }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $failedInitialExportRepository -StagingAction $fixtureStagingAction -ProcessAction $initialExportProcess
    } 'initial export failed' 'initial validated graph still fails in export phase'
    $initialExportErrorStatus = Get-GraphifyStatus -RepositoryRoot $failedInitialExportRepository
    Assert-True ($null -eq $initialExportErrorStatus.lastSuccess) 'failed initial export does not create a successful baseline'
    Assert-Equal $initialExportErrorStatus.nodes 100 'failed initial export reports validated nodes only as current attempt data'
    $initialExportMode.FailExport = $false
    $initialExportRecovery = Invoke-GraphifySync -RepositoryRoot $failedInitialExportRepository -StagingAction $fixtureStagingAction -ProcessAction $initialExportProcess
    Assert-Equal $initialExportRecovery.result 'success' 'small graph after failed initial export is not rejected against error counts'

    foreach ($invalidOutputName in @('graphify-out', 'generated', '.tmp')) {
        $collisionRepository = Join-Path $fixtureRoot ("collision-$($invalidOutputName.Replace('.', 'dot'))")
        New-Item -ItemType Directory -Path $collisionRepository -Force | Out-Null
        Write-Utf8Fixture (Join-Path $collisionRepository $invalidOutputName) 'file collision'
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $collisionRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction
        } 'directory|filesystem object|collision' "rejects file collision at $invalidOutputName before output traversal"
    }

    Assert-True (Test-SafeOutputItemAttributes -Attributes ([System.IO.FileAttributes]::Directory) -PSIsContainer $true -ExpectedType Directory) 'accepts mocked ordinary output directory attributes'
    Assert-True (-not (Test-SafeOutputItemAttributes -Attributes ([System.IO.FileAttributes]::ReparsePoint -bor [System.IO.FileAttributes]::Directory) -PSIsContainer $true -ExpectedType Directory)) 'rejects mocked output reparse-point attributes'
    Assert-True (-not (Test-SafeOutputItemAttributes -Attributes ([System.IO.FileAttributes]::Normal) -PSIsContainer $false -ExpectedType Directory)) 'rejects mocked output file-as-directory attributes'

    $outputReparseRepository = Join-Path $fixtureRoot 'output reparse repository'
    New-Item -ItemType Directory -Path $outputReparseRepository -Force | Out-Null
    $outputReparseTarget = Join-Path $fixtureRoot 'output reparse target'
    New-Item -ItemType Directory -Path $outputReparseTarget -Force | Out-Null
    $outputJunction = Join-Path $outputReparseRepository 'graphify-out'
    if (Try-NewJunction -Path $outputJunction -Target $outputReparseTarget) {
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $outputReparseRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction
        } 'reparse point' 'rejects graphify-out junction before writing or backup traversal'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $outputReparseTarget 'graph.json'))) 'does not write through graphify-out junction'
        Remove-TestJunction $outputJunction
    }
    else {
        'SKIP: output junction creation denied; mocked output attributes remain covered.'
    }

    $nestedOutputRepository = Join-Path $fixtureRoot 'nested output reparse repository'
    $nestedGeneratedPath = Join-Path $nestedOutputRepository 'generated\graphify'
    New-Item -ItemType Directory -Path $nestedGeneratedPath -Force | Out-Null
    $nestedOutputJunction = Join-Path $nestedGeneratedPath 'linked-output'
    if (Try-NewJunction -Path $nestedOutputJunction -Target $outputReparseTarget) {
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $nestedOutputRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction
        } 'reparse point' 'rejects a nested generated output junction before recursive backup'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $outputReparseTarget 'graph.json'))) 'does not recurse or write through nested generated output junction'
        Remove-TestJunction $nestedOutputJunction
    }
    else {
        'SKIP: nested output junction creation denied; mocked output attributes remain covered.'
    }

    $initialFailureRepository = Join-Path $fixtureRoot 'initial failure repository'
    New-Item -ItemType Directory -Path $initialFailureRepository -Force | Out-Null
    $initialFailureAction = {
        param([string[]]$Arguments, [hashtable]$Environment)
        Write-Utf8Fixture (Join-Path $Environment['GRAPHIFY_OUT'] 'graph.json') '{partial'
        Write-Utf8Fixture (Join-Path $initialFailureRepository 'generated\graphify\partial.md') 'partial generated'
        return [pscustomobject]@{ ExitCode = 8; StdOut = ''; StdErr = 'initial failure'; Partial = $false; Error = $null }
    }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $initialFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $initialFailureAction
    } 'exit code 8' 'initial sync failure reports the intended process error'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $initialFailureRepository 'graphify-out\graph.json'))) 'initial failure leaves no partial canonical graph'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $initialFailureRepository 'generated\graphify'))) 'initial failure leaves no partial canonical generated output'
    Assert-Equal (Get-GraphifyStatus -RepositoryRoot $initialFailureRepository).result 'error' 'initial failure writes best-effort error status'

    $statusFailureRepository = Join-Path $fixtureRoot 'status failure repository'
    New-Item -ItemType Directory -Path $statusFailureRepository -Force | Out-Null
    $null = Invoke-GraphifySync -RepositoryRoot $statusFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction
    $statusFailurePath = Join-Path $statusFailureRepository 'graphify-out\status.json'
    $completeStatusBeforeFailure = [System.IO.File]::ReadAllText($statusFailurePath)
    $failingStatusWriter = { param([string]$StatusPath, $Status) throw 'injected atomic status write failure' }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $statusFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction -StatusWriteAction $failingStatusWriter
    } 'atomic status write failure' 'surfaces an injected atomic status write failure'
    Assert-Equal ([System.IO.File]::ReadAllText($statusFailurePath)) $completeStatusBeforeFailure 'status write failure preserves the previous complete status'

    foreach ($restoreFailureTarget in @('graphify-out', 'generated\graphify')) {
        $restoreRepository = Join-Path $fixtureRoot ("restore failure " + $restoreFailureTarget.Replace('\', '-'))
        New-Item -ItemType Directory -Path $restoreRepository -Force | Out-Null
        $null = Invoke-GraphifySync -RepositoryRoot $restoreRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction
        $restoreGraphPath = Join-Path $restoreRepository 'graphify-out\graph.json'
        $restoreManifestPath = Join-Path $restoreRepository 'generated\graphify\.graphify_obsidian_manifest.json'
        $validGraphBeforeRestoreFailure = [System.IO.File]::ReadAllText($restoreGraphPath)
        $validManifestBeforeRestoreFailure = [System.IO.File]::ReadAllText($restoreManifestPath)
        $restoreMoveState = [pscustomobject]@{ Failed = $false }
        $failingRestoreMove = {
            param([string]$Source, [string]$Destination)
            if (-not $restoreMoveState.Failed -and
                $Source -like '*.rollback' -and
                $Destination.EndsWith($restoreFailureTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
                $restoreMoveState.Failed = $true
                throw "injected restore move failure for $restoreFailureTarget"
            }
            Move-Item -LiteralPath $Source -Destination $Destination
        }
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $restoreRepository -StagingAction $fixtureStagingAction -ProcessAction $failedUpdateAction -DirectoryMoveAction $failingRestoreMove
        } 'injected restore move failure' "surfaces caught $restoreFailureTarget restore failure after recovery"
        Assert-Equal ([System.IO.File]::ReadAllText($restoreGraphPath)) $validGraphBeforeRestoreFailure "$restoreFailureTarget restore failure retains a valid canonical graph"
        Assert-Equal ([System.IO.File]::ReadAllText($restoreManifestPath)) $validManifestBeforeRestoreFailure "$restoreFailureTarget restore failure retains a valid canonical generated tree"
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $restoreRepository 'generated\graphify\graph.canvas'))) "$restoreFailureTarget restore failure retains the no-canvas contract"
        Assert-Equal (Get-GraphifyStatus -RepositoryRoot $restoreRepository).result 'error' "$restoreFailureTarget restore failure still writes error status best-effort"
        $recoveryDirectories = @(Get-ChildItem -LiteralPath (Join-Path $restoreRepository '.tmp') -Directory | Where-Object { $_.Name -like 'graphify-sync-*' })
        Assert-True ($recoveryDirectories.Count -ge 1) "$restoreFailureTarget restore failure retains recovery backup data"
        foreach ($fixedSiblingSuffix in @('.rollback', '.quarantine', '.failed')) {
            Assert-True (-not (Test-Path -LiteralPath ((Join-Path $restoreRepository $restoreFailureTarget) + $fixedSiblingSuffix))) "$restoreFailureTarget restore failure creates no fixed canonical $fixedSiblingSuffix sibling"
        }
        & powershell.exe -NoProfile -Command $mutexProbe
        Assert-Equal $LASTEXITCODE 0 "$restoreFailureTarget orchestration exception releases the production mutex"
        Assert-ThrowsMatching {
            Invoke-GraphifySync -RepositoryRoot $restoreRepository -StagingAction $fixtureStagingAction -ProcessAction $failedUpdateAction
        } 'exit code 7' "$restoreFailureTarget retained recovery artifacts do not block a later rollback"
        Assert-Equal ([System.IO.File]::ReadAllText($restoreGraphPath)) $validGraphBeforeRestoreFailure "$restoreFailureTarget second rollback preserves the canonical graph"
    }

    $copyRestoreRepository = Join-Path $fixtureRoot 'copy restore failure'
    New-Item -ItemType Directory -Path $copyRestoreRepository -Force | Out-Null
    $null = Invoke-GraphifySync -RepositoryRoot $copyRestoreRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction
    $copyRestoreGraphPath = Join-Path $copyRestoreRepository 'graphify-out\graph.json'
    $validGraphBeforeCopyFailure = [System.IO.File]::ReadAllText($copyRestoreGraphPath)
    $copyRestoreState = [pscustomobject]@{ Failed = $false }
    $failingRestoreCopy = {
        param([string]$Source, [string]$Destination)
        if (-not $copyRestoreState.Failed -and $Destination -like '*.rollback' -and $Source -like '*\graphify-out') {
            $copyRestoreState.Failed = $true
            Write-Utf8Fixture (Join-Path $Destination 'partial-only.txt') 'incomplete candidate'
            throw 'injected partial graph restore copy failure'
        }
        Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
    }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $copyRestoreRepository -StagingAction $fixtureStagingAction -ProcessAction $failedUpdateAction -DirectoryCopyAction $failingRestoreCopy
    } 'partial graph restore copy failure' 'surfaces partial graph restore candidate copy failure after recovery'
    Assert-Equal ([System.IO.File]::ReadAllText($copyRestoreGraphPath)) $validGraphBeforeCopyFailure 'restore copy failure reinstates the last-valid canonical graph'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $copyRestoreRepository 'graphify-out\partial-only.txt'))) 'partial restore candidate is never promoted to canonical output'
    Assert-Equal (Get-GraphifyStatus -RepositoryRoot $copyRestoreRepository).result 'error' 'restore copy failure still writes error status best-effort'
    $copyRecoveryDirectories = @(Get-ChildItem -LiteralPath (Join-Path $copyRestoreRepository '.tmp') -Directory | Where-Object { $_.Name -like 'graphify-sync-*' })
    Assert-True ($copyRecoveryDirectories.Count -ge 1) 'restore copy failure retains recovery backup data'
    Assert-True (@($copyRecoveryDirectories | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'graphify-out\graph.json') -PathType Leaf }).Count -ge 1) 'partial candidate failure retains the complete original graph backup'
    & powershell.exe -NoProfile -Command $mutexProbe
    Assert-Equal $LASTEXITCODE 0 'restore copy failure releases the production mutex'

    $primaryFailureRepository = Join-Path $fixtureRoot 'primary and status failure'
    New-Item -ItemType Directory -Path $primaryFailureRepository -Force | Out-Null
    $primaryFailureProcess = {
        param([string[]]$Arguments, [hashtable]$Environment)
        return [pscustomobject]@{ ExitCode = 19; StdOut = ''; StdErr = 'primary graph failure'; Partial = $false; Error = $null }
    }
    $secondaryStatusFailure = {
        param([string]$StatusPath, $Status)
        throw 'secondary status persistence failure'
    }
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $primaryFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $primaryFailureProcess -StatusWriteAction $secondaryStatusFailure
    } '^Graphify graph build failed with exit code 19: primary graph failure.*secondary status persistence failure' 'preserves primary operation failure and appends status-write context'

    $setupFailureRepository = Join-Path $fixtureRoot 'setup failure mutex release'
    New-Item -ItemType Directory -Path $setupFailureRepository -Force | Out-Null
    Assert-ThrowsMatching {
        Invoke-GraphifySync -RepositoryRoot $setupFailureRepository -StagingAction $fixtureStagingAction -ProcessAction $successfulProcessAction -SetupAction { throw 'injected post-acquisition setup failure' }
    } 'post-acquisition setup failure' 'propagates setup failure after mutex acquisition'
    & powershell.exe -NoProfile -Command $mutexProbe
    Assert-Equal $LASTEXITCODE 0 'post-acquisition setup failure releases the production mutex'

    $alreadyRunningState = [pscustomobject]@{ StagingCalled = $false }
    $mustNotStage = {
        param([string]$RepositoryRoot)
        $alreadyRunningState.StagingCalled = $true
        throw 'staging must not run while another sync owns the mutex'
    }
    $unavailableMutex = {
        return [pscustomobject]@{ Name = 'Local\WCORE.Graphify.Sync'; Mutex = $null; Acquired = $false }
    }
    $alreadyRunning = Invoke-GraphifySync -RepositoryRoot $syncRepository -StagingAction $mustNotStage -ProcessAction $successfulProcessAction -MutexAction $unavailableMutex
    Assert-True $alreadyRunning.alreadyRunning 'unavailable mutex returns an already-running success result'
    Assert-Equal $alreadyRunning.result 'success' 'already-running result is successful'
    Assert-True (-not $alreadyRunningState.StagingCalled) 'already-running sync does not rebuild staging'

    $emptyStatusRepository = Join-Path $fixtureRoot 'empty status repository'
    New-Item -ItemType Directory -Path $emptyStatusRepository -Force | Out-Null
    $emptyStatus = Get-GraphifyStatus -RepositoryRoot $emptyStatusRepository
    Assert-Equal $emptyStatus.result 'never-run' 'status clearly reports when no prior sync exists'

    $webFixtures = @{
        'src\service.ts' = 'export const service = true;'
        'src\view.tsx' = 'export const View = () => null;'
        'src\legacy.js' = 'module.exports = true;'
        'src\widget.jsx' = 'export const Widget = () => null;'
        'src\module.mjs' = 'export default true;'
        'src\common.cjs' = 'module.exports = true;'
        'package.json' = '{"name":"fixture"}'
    }
    foreach ($relativePath in $webFixtures.Keys) {
        Write-Utf8Fixture (Join-Path $webRoot $relativePath) $webFixtures[$relativePath]
    }

    Write-Utf8Fixture (Join-Path $webRoot 'node_modules\ignored.js') 'ignored dependency'
    Write-Utf8Fixture (Join-Path $webRoot 'dist\ignored.js') 'ignored build'
    Write-Utf8Fixture (Join-Path $webRoot 'cache\ignored.ts') 'ignored cache'
    Write-Utf8Fixture (Join-Path $webRoot '.cache\ignored.ts') 'ignored hidden cache'
    Write-Utf8Fixture (Join-Path $webRoot 'generated\ignored.ts') 'ignored generated output'
    Write-Utf8Fixture (Join-Path $webRoot '.next\ignored.js') 'ignored generated output'
    Write-Utf8Fixture (Join-Path $webRoot 'api.log') 'ignored log'
    Write-Utf8Fixture (Join-Path $webRoot '.env.json') '{"secret":true}'
    Write-Utf8Fixture (Join-Path $webRoot 'data.db.json') '{"rows":[]}'
    Write-Utf8Fixture (Join-Path $webRoot 'Dockerfile.json') '{"docker":true}'

    $gsContent = "function engine() {`r`n  return 'caf$([char]0x00E9)';`r`n}`r`n"
    $utf8Bom = New-Object System.Text.UTF8Encoding($true)
    $gsBytes = $utf8Bom.GetPreamble() + $utf8Bom.GetBytes($gsContent)
    New-Item -ItemType Directory -Path $gsheetRoot -Force | Out-Null
    [System.IO.File]::WriteAllBytes((Join-Path $gsheetRoot '10_ENGINE.gs'), $gsBytes)
    Write-Utf8Fixture (Join-Path $gsheetRoot 'nested\CHAIN.gs') 'function chain() {}'
    Write-Utf8Fixture (Join-Path $gsheetRoot '10_ENGINE.js') 'compatibility duplicate'
    Write-Utf8Fixture (Join-Path $gsheetRoot '10_ENGINE.compat.js') 'compatibility duplicate'
    Write-Utf8Fixture (Join-Path $gsheetRoot 'appsscript.json') '{"timeZone":"Etc/UTC"}'
    Write-Utf8Fixture (Join-Path $gsheetRoot 'ignored.json') '{"ignored":true}'

    Assert-Throws {
        Get-CorpusSourceFiles -SourceRoot $webRoot -RepositoryRoot $repositoryRoot -FixtureAuthorization (New-Object object)
    } 'filesystem discovery fails closed without New-StagingTree fixture authorization'

    $trackedRepository = Join-Path $fixtureRoot 'tracked repository'
    $trackedWebRoot = Join-Path $trackedRepository 'wcore-web\apps\api'
    $trackedDestination = Join-Path $trackedRepository '.tmp\tracked-output'
    $unicodeFileName = "caf$([char]0x00E9).ts"
    Write-Utf8Fixture (Join-Path $trackedWebRoot 'src\space name.ts') 'export const spaced = true;'
    Write-Utf8Fixture (Join-Path $trackedWebRoot (Join-Path 'src' $unicodeFileName)) 'export const unicode = true;'
    Write-Utf8Fixture (Join-Path $trackedWebRoot 'src\bracket[1].ts') 'export const bracket = true;'
    & git -C $trackedRepository init --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize tracked-path fixture repository.' }
    & git -C $trackedRepository add -- .
    if ($LASTEXITCODE -ne 0) { throw 'Failed to add tracked-path fixture files.' }
    $trackedResult = Sync-WebCorpus -SourceRoot $trackedWebRoot -DestinationRoot $trackedDestination
    Assert-Equal $trackedResult.Count 3 'discovers all unusual tracked fixture paths'
    Assert-True (Test-Path -LiteralPath (Join-Path $trackedDestination 'src\space name.ts')) 'preserves tracked path containing spaces'
    Assert-True (Test-Path -LiteralPath (Join-Path $trackedDestination (Join-Path 'src' $unicodeFileName))) 'preserves tracked non-ASCII path'
    Assert-True (Test-Path -LiteralPath (Join-Path $trackedDestination 'src\bracket[1].ts')) 'preserves tracked path containing Git pattern characters'

    $stderrDestination = Join-Path $trackedRepository '.tmp\stderr-output'
    $env:GIT_TRACE = '1'
    Assert-Throws {
        Sync-WebCorpus -SourceRoot $trackedWebRoot -DestinationRoot $stderrDestination
    } 'fails closed when git ls-files writes stderr with a zero exit code'
    Assert-True (-not (Test-Path -LiteralPath $stderrDestination)) 'stages nothing when git ls-files writes stderr'
    Restore-TestEnvironmentVariable -Name 'GIT_TRACE' -WasSet $originalGitTraceWasSet -Value $originalGitTrace

    $reparseTarget = Join-Path $fixtureRoot 'reparse-target'
    Write-Utf8Fixture (Join-Path $reparseTarget 'outside.ts') 'must not be traversed'

    $stagingReparseRepository = Join-Path $fixtureRoot 'staging-reparse-repository'
    Write-Utf8Fixture (Join-Path $stagingReparseRepository 'wcore-web\apps\api\src\service.ts') 'export const service = true;'
    Write-Utf8Fixture (Join-Path $stagingReparseRepository 'wcore-gsheet\src\ENGINE.gs') 'function engine() {}'
    $stagingTmpJunction = Join-Path $stagingReparseRepository '.tmp'
    if (Try-NewJunction -Path $stagingTmpJunction -Target $reparseTarget) {
        Assert-Throws {
            New-StagingTree -RepositoryRoot $stagingReparseRepository -FixtureFileSystemMode
        } 'rejects a reparse point in staging ancestry'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $reparseTarget 'graphify-input'))) 'does not write through staging ancestry reparse point'
        Remove-TestJunction $stagingTmpJunction
    }
    else {
        'SKIP: staging ancestry junction creation denied; mocked attribute predicate remains covered.'
    }

    $sourceReparseRepository = Join-Path $fixtureRoot 'source-reparse-repository'
    $sourceTarget = Join-Path $fixtureRoot 'source-reparse-target'
    Write-Utf8Fixture (Join-Path $sourceTarget 'src\linked.ts') 'must not be traversed'
    Write-Utf8Fixture (Join-Path $sourceReparseRepository 'wcore-gsheet\src\ENGINE.gs') 'function engine() {}'
    New-Item -ItemType Directory -Path (Join-Path $sourceReparseRepository 'wcore-web\apps') -Force | Out-Null
    $sourceJunction = Join-Path $sourceReparseRepository 'wcore-web\apps\api'
    if (Try-NewJunction -Path $sourceJunction -Target $sourceTarget) {
        Assert-Throws {
            New-StagingTree -RepositoryRoot $sourceReparseRepository -FixtureFileSystemMode
        } 'rejects a source root reparse point'
        Remove-TestJunction $sourceJunction
    }
    else {
        'SKIP: source-root junction creation denied; mocked attribute predicate remains covered.'
    }

    $nestedReparseRepository = Join-Path $fixtureRoot 'nested-reparse-repository'
    Write-Utf8Fixture (Join-Path $nestedReparseRepository 'wcore-web\apps\api\src\service.ts') 'export const service = true;'
    Write-Utf8Fixture (Join-Path $nestedReparseRepository 'wcore-gsheet\src\ENGINE.gs') 'function engine() {}'
    $nestedSourceJunction = Join-Path $nestedReparseRepository 'wcore-web\apps\api\src\linked'
    if (Try-NewJunction -Path $nestedSourceJunction -Target $sourceTarget) {
        Assert-Throws {
            New-StagingTree -RepositoryRoot $nestedReparseRepository -FixtureFileSystemMode
        } 'rejects a traversed nested source directory reparse point'
        Remove-TestJunction $nestedSourceJunction
    }
    else {
        'SKIP: nested source junction creation denied; mocked attribute predicate remains covered.'
    }

    $fileSymlinkRepository = Join-Path $fixtureRoot 'file-symlink-repository'
    $fileSymlinkTarget = Join-Path $fixtureRoot 'file-symlink-target.ts'
    Write-Utf8Fixture $fileSymlinkTarget 'must not be copied'
    Write-Utf8Fixture (Join-Path $fileSymlinkRepository 'wcore-web\apps\api\src\service.ts') 'export const service = true;'
    Write-Utf8Fixture (Join-Path $fileSymlinkRepository 'wcore-gsheet\src\ENGINE.gs') 'function engine() {}'
    $fileSymlink = Join-Path $fileSymlinkRepository 'wcore-web\apps\api\src\linked.ts'
    $fileSymlinkCreated = $false
    try {
        New-Item -ItemType SymbolicLink -Path $fileSymlink -Target $fileSymlinkTarget -ErrorAction Stop | Out-Null
        $fileSymlinkCreated = $true
    }
    catch {
        'SKIP: file symlink creation denied; mocked file attribute predicate remains covered.'
    }
    if ($fileSymlinkCreated) {
        Assert-Throws {
            New-StagingTree -RepositoryRoot $fileSymlinkRepository -FixtureFileSystemMode
        } 'rejects a traversed source file reparse point'
        Remove-Item -LiteralPath $fileSymlink -Force
    }

    $repositoryTarget = Join-Path $fixtureRoot 'repository-reparse-target'
    Write-Utf8Fixture (Join-Path $repositoryTarget 'wcore-web\apps\api\src\service.ts') 'export const service = true;'
    Write-Utf8Fixture (Join-Path $repositoryTarget 'wcore-gsheet\src\ENGINE.gs') 'function engine() {}'
    $repositoryJunction = Join-Path $fixtureRoot 'repository-junction'
    if (Try-NewJunction -Path $repositoryJunction -Target $repositoryTarget) {
        Assert-Throws {
            New-StagingTree -RepositoryRoot $repositoryJunction -FixtureFileSystemMode
        } 'rejects a repository root reparse point'
        Remove-TestJunction $repositoryJunction
    }
    else {
        'SKIP: repository-root junction creation denied; mocked attribute predicate remains covered.'
    }

    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -StagingRoot (Join-Path $fixtureRoot 'outside-staging') -FixtureFileSystemMode
    } 'rejects a staging path outside repository root'

    $fakeGitBin = Join-Path $fixtureRoot 'fake-git-bin'
    $fakeGit = Join-Path $fakeGitBin 'git.cmd'
    $fakeGitScript = Join-Path $fakeGitBin 'fake-git.ps1'
    $fakeGitContent = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fake-git.ps1" %*
exit /b %ERRORLEVEL%
'@
    $fakeGitScriptContent = @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArguments)

if ($GitArguments -contains 'rev-parse') {
    [Console]::Out.WriteLine($env:WCORE_FAKE_GIT_ROOT)
    exit 0
}

$stdout = [Console]::OpenStandardOutput()
switch ($env:WCORE_FAKE_GIT_MODE) {
    'outside' {
        $payload = [System.Text.Encoding]::UTF8.GetBytes('outside-source.ts' + [char]0)
    }
    'malformed' {
        $payload = [System.Text.Encoding]::UTF8.GetBytes('wcore-web/apps/api/src/service.ts')
    }
    'empty' {
        $payload = [byte[]]@()
    }
    'missing' {
        $payload = [System.Text.Encoding]::UTF8.GetBytes('wcore-web/apps/api/src/missing.ts' + [char]0)
    }
    default {
        [Console]::Error.Write('fake git ls-files failure')
        exit 7
    }
}
$stdout.Write($payload, 0, $payload.Length)
$stdout.Flush()
'@
    Write-Utf8Fixture $fakeGit $fakeGitContent
    Write-Utf8Fixture $fakeGitScript $fakeGitScriptContent
    $env:PATH = $fakeGitBin + [System.IO.Path]::PathSeparator + $originalPath
    $env:WCORE_FAKE_GIT_ROOT = $repositoryRoot

    $failedGitDestination = Join-Path $repositoryRoot 'failed-git-output'
    $env:WCORE_FAKE_GIT_MODE = 'failure'
    Assert-Throws {
        Sync-WebCorpus -SourceRoot $webRoot -DestinationRoot $failedGitDestination
    } 'fails closed when git ls-files exits nonzero'
    Assert-True (-not (Test-Path -LiteralPath $failedGitDestination)) 'stages nothing after git ls-files failure'

    $env:WCORE_FAKE_GIT_MODE = 'outside'
    Assert-Throws {
        Sync-WebCorpus -SourceRoot $webRoot -DestinationRoot $failedGitDestination
    } 'rejects a valid NUL-delimited tracked path outside the source root'
    Assert-True (-not (Test-Path -LiteralPath $failedGitDestination)) 'stages nothing after outside-source git output'

    $env:WCORE_FAKE_GIT_MODE = 'malformed'
    Assert-Throws {
        Sync-WebCorpus -SourceRoot $webRoot -DestinationRoot $failedGitDestination
    } 'rejects non-NUL-terminated git output without relying on line endings'
    Assert-True (-not (Test-Path -LiteralPath $failedGitDestination)) 'stages nothing after malformed git output'

    $env:WCORE_FAKE_GIT_MODE = 'empty'
    Assert-Throws {
        Sync-WebCorpus -SourceRoot $webRoot -DestinationRoot $failedGitDestination
    } 'rejects a valid empty NUL result'
    Assert-True (-not (Test-Path -LiteralPath $failedGitDestination)) 'stages nothing after empty git output'

    $env:WCORE_FAKE_GIT_MODE = 'missing'
    Assert-Throws {
        Sync-WebCorpus -SourceRoot $webRoot -DestinationRoot $failedGitDestination
    } 'rejects a valid tracked path that is missing on disk'
    Assert-True (-not (Test-Path -LiteralPath $failedGitDestination)) 'stages nothing after missing tracked path output'
    $env:PATH = $originalPath
    $env:WCORE_FAKE_GIT_MODE = $originalFakeGitMode
    $env:WCORE_FAKE_GIT_ROOT = $originalFakeGitRoot
    Restore-TestEnvironmentVariable -Name 'GIT_TRACE' -WasSet $originalGitTraceWasSet -Value $originalGitTrace

    $implicitFallbackStage = Join-Path $repositoryRoot '.tmp\implicit-filesystem-fallback'
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -StagingRoot $implicitFallbackStage
    } 'requires explicit filesystem mode outside Git'
    Assert-True (-not (Test-Path -LiteralPath $implicitFallbackStage)) 'implicit filesystem fallback stages no final tree'
    Assert-True (-not (Test-Path -LiteralPath ($implicitFallbackStage + '.next'))) 'implicit filesystem fallback cleans its owned staging.next tree'

    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Write-Utf8Fixture (Join-Path $stage 'stale.txt') 'old staging tree'
    New-Item -ItemType Directory -Path ($stage + '.next') -Force | Out-Null
    Write-Utf8Fixture (Join-Path ($stage + '.next') 'stale-next.txt') 'old next tree'
    Write-Utf8Fixture (Join-Path ($stage + '.next') $stagingMarkerName) ($stagingMarkerContent + "`n")
    Write-Utf8Fixture ($stage + '.unrelated') 'must survive'
    Write-Utf8Fixture (Join-Path $repositoryRoot 'must-survive.txt') 'must survive'

    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode
    } 'refuses to delete staging.next with trailing marker content'
    Assert-True (Test-Path -LiteralPath (Join-Path ($stage + '.next') 'stale-next.txt')) 'unowned staging.next sentinel survives'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path ($stage + '.next') $stagingMarkerName))) ($stagingMarkerContent + "`n") 'preserves rejected trailing marker content in staging.next'

    Write-StagingMarker ($stage + '.next')
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode
    } 'refuses to replace an unowned final staging tree'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'stale.txt')) 'unowned final staging sentinel survives'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path ($stage + '.next') 'stale-next.txt'))) 'owned stale staging.next is cleaned'

    Write-StagingMarker $stage
    $result = New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $stage $stagingMarkerName))) $stagingMarkerContent 'final staging marker has exact content'

    Write-Utf8Fixture (Join-Path $stage $stagingMarkerName) ($stagingMarkerContent + ' extra')
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode
    } 'rejects final staging with extra marker content'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $stage $stagingMarkerName))) ($stagingMarkerContent + ' extra') 'preserves final tree with rejected marker content'
    Write-StagingMarker $stage

    $previousStage = $stage + '.previous'
    New-Item -ItemType Directory -Path $previousStage -Force | Out-Null
    Write-Utf8Fixture (Join-Path $previousStage 'previous-sentinel.txt') 'must survive'
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode
    } 'refuses to delete an unowned sibling previous staging tree'
    Assert-True (Test-Path -LiteralPath (Join-Path $previousStage 'previous-sentinel.txt')) 'unowned sibling previous sentinel survives'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\src\service.ts')) 'final corpus survives unowned previous recovery failure'
    Write-StagingMarker $previousStage
    $result = New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode
    Assert-True (-not (Test-Path -LiteralPath $previousStage)) 'owned sibling previous is cleaned when final exists'

    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\src\service.ts')) 'copies Web TypeScript'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\src\view.tsx')) 'copies every Web allowlisted extension'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\package.json')) 'copies Web manifests'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'gsheet\10_ENGINE.js')) 'maps .gs to .js'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'gsheet\nested\CHAIN.js')) 'preserves GSheet relative paths'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'gsheet\10_ENGINE.gs'))) 'does not retain .gs'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'gsheet\10_ENGINE.compat.js'))) 'excludes compatibility JavaScript'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'gsheet\appsscript.json')) 'copies appsscript.json'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage $stagingMarkerName)) 'final staging tree has ownership marker'
    $stagingVcsBoundary = Join-Path $stage '.git'
    Assert-True (Test-Path -LiteralPath $stagingVcsBoundary -PathType Container) 'final staging tree has a local VCS boundary'
    Assert-Equal @(Get-ChildItem -LiteralPath $stagingVcsBoundary -Force).Count 0 'local VCS boundary stays empty'

    $actualGsBytes = [System.IO.File]::ReadAllBytes((Join-Path $stage 'gsheet\10_ENGINE.js'))
    Assert-Equal ([System.BitConverter]::ToString($actualGsBytes)) ([System.BitConverter]::ToString($gsBytes)) 'preserves Apps Script bytes and encoding'

    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\node_modules\ignored.js'))) 'excludes dependencies'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\dist\ignored.js'))) 'excludes dist output'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\api.log'))) 'excludes logs'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\.env.json'))) 'excludes environment files'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\data.db.json'))) 'excludes databases'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\cache\ignored.ts'))) 'excludes caches'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\Dockerfile.json'))) 'excludes Docker files'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'web-api\generated\ignored.ts'))) 'excludes generated output'

    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stage 'stale.txt'))) 'replaces the previous staging tree'
    Assert-True (-not (Test-Path -LiteralPath ($stage + '.next'))) 'moves staging.next into place'
    Assert-True (Test-Path -LiteralPath ($stage + '.unrelated')) 'does not delete a similarly named sibling'
    Assert-True (Test-Path -LiteralPath (Join-Path $repositoryRoot 'must-survive.txt')) 'does not delete outside staging roots'

    Assert-Equal $result.WebCount 7 'returns Web file count'
    Assert-Equal $result.GSheetCount 3 'returns GSheet file count'
    $stagedBytes = (Get-ChildItem -LiteralPath $stage -File -Recurse | Where-Object { $_.Name -ne $stagingMarkerName } | Measure-Object -Property Length -Sum).Sum
    Assert-Equal $result.TotalBytes $stagedBytes 'returns total staged bytes'

    $validationState = [pscustomobject]@{
        Phases = New-Object 'System.Collections.Generic.List[string]'
        BeforeSwapObserved = $false
    }
    $validationObserver = {
        param([string]$Path, [string]$Phase)
        Assert-Equal $Path ($stage + '.next') "validation phase $Phase observes staging.next"
        $validationState.Phases.Add($Phase)
    }
    $observeBeforeSwap = {
        param([string]$NextPath)
        Assert-Equal $validationState.Phases.Count 1 'completed staging.next is validated before BeforeSwapAction'
        Assert-Equal $validationState.Phases[0] 'CompletedNext' 'first validation phase precedes BeforeSwapAction'
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $NextPath $stagingMarkerName))) $stagingMarkerContent 'staging.next marker has exact content before swap'
        $validationState.BeforeSwapObserved = $true
    }
    $result = New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode -ValidationObserver $validationObserver -BeforeSwapAction $observeBeforeSwap
    Assert-True $validationState.BeforeSwapObserved 'BeforeSwapAction observes the completed-tree validation'
    Assert-Equal ($validationState.Phases -join ',') 'CompletedNext,BeforeFinalMove,BeforeNextMove' 'runs all three ordered swap-candidate validations'
    Assert-True (Test-Path -LiteralPath $stagingVcsBoundary -PathType Container) 'atomic replacement preserves the local VCS boundary'
    Assert-Equal @(Get-ChildItem -LiteralPath $stagingVcsBoundary -Force).Count 0 'replacement VCS boundary stays empty'
    Assert-Equal $result.WebCount 7 'replacement preserves Web file count'
    Assert-Equal $result.GSheetCount 3 'replacement preserves GSheet file count'
    Assert-Equal $result.TotalBytes $stagedBytes 'replacement preserves staged source bytes'

    foreach ($rejectedPhase in @('CompletedNext', 'BeforeFinalMove', 'BeforeNextMove')) {
        $priorSentinel = "prior final for $rejectedPhase"
        Write-Utf8Fixture (Join-Path $stage 'validation-prior-sentinel.txt') $priorSentinel
        $rejectedValidationState = [pscustomobject]@{ Snapshot = $null }
        $rejectValidation = {
            param([string]$Path, [string]$Phase)
            if ($Phase -ceq $rejectedPhase) {
                $rejectedValidationState.Snapshot = (@(Get-ChildItem -LiteralPath $Path -File -Recurse | ForEach-Object {
                    $relativePath = $_.FullName.Substring($Path.Length).TrimStart('\')
                    "$relativePath|$($_.Length)|$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
                } | Sort-Object) -join "`n")
                throw "observer rejected $Phase"
            }
        }
        Assert-Throws {
            New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode -ValidationObserver $rejectValidation
        } "validation observer can reject $rejectedPhase"
        $preservedSnapshot = (@(Get-ChildItem -LiteralPath ($stage + '.next') -File -Recurse | ForEach-Object {
            $relativePath = $_.FullName.Substring(($stage + '.next').Length).TrimStart('\')
            "$relativePath|$($_.Length)|$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
        } | Sort-Object) -join "`n")
        Assert-Equal $preservedSnapshot $rejectedValidationState.Snapshot "$rejectedPhase rejection preserves the exact staging.next candidate"
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $stage 'validation-prior-sentinel.txt'))) $priorSentinel "$rejectedPhase rejection leaves or restores the prior final"
        Assert-True (-not (Test-Path -LiteralPath $previousStage)) "$rejectedPhase rejection leaves no previous sibling after restoration"
    }
    $result = New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode

    $tamperNextMarker = {
        param([string]$NextPath)
        Write-Utf8Fixture (Join-Path $NextPath $stagingMarkerName) ($stagingMarkerContent + "`n")
    }
    $tamperedMoveState = [pscustomobject]@{ Count = 0 }
    $restorationFailureMustNotRun = {
        param([string]$Source, [string]$Destination)
        $tamperedMoveState.Count++
        throw 'move/restoration seam must not be reached for invalid staging.next'
    }
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode -BeforeSwapAction $tamperNextMarker -MoveDirectoryAction $restorationFailureMustNotRun
    } 'revalidates staging.next ownership immediately before swap'
    Assert-Equal $tamperedMoveState.Count 0 'invalid staging.next never moves final or invokes restoration'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\src\service.ts')) 'prior final survives tampered staging.next validation'
    Assert-True (Test-Path -LiteralPath (Join-Path ($stage + '.next') 'web-api\src\service.ts')) 'unowned staging.next is not moved or deleted'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path ($stage + '.next') $stagingMarkerName))) ($stagingMarkerContent + "`n") 'pre-swap seam leaves rejected trailing marker content untouched'
    Write-StagingMarker ($stage + '.next')
    $result = New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode

    $thirdValidationMoveState = [pscustomobject]@{ Count = 0 }
    $tamperAfterFinalMove = {
        param([string]$Source, [string]$Destination)
        $thirdValidationMoveState.Count++
        Rename-Item -LiteralPath $Source -NewName (Split-Path -Leaf $Destination)
        if ($thirdValidationMoveState.Count -eq 1) {
            Write-Utf8Fixture (Join-Path ($stage + '.next') $stagingMarkerName) ($stagingMarkerContent + ' after-final-move')
        }
    }
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode -MoveDirectoryAction $tamperAfterFinalMove
    } 'third validation rejects staging.next tampered after the prior final moves'
    Assert-Equal $thirdValidationMoveState.Count 2 'third validation restores previous without attempting next-to-final move'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\src\service.ts')) 'third-validation failure restores the prior final corpus'
    Assert-Equal ([System.IO.File]::ReadAllText((Join-Path ($stage + '.next') $stagingMarkerName))) ($stagingMarkerContent + ' after-final-move') 'third validation preserves invalid staging.next'
    Write-StagingMarker ($stage + '.next')
    $result = New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode

    $restoredMoveState = [pscustomobject]@{ Count = 0 }
    $failSecondMove = {
        param([string]$Source, [string]$Destination)
        $restoredMoveState.Count++
        if ($restoredMoveState.Count -eq 2) {
            throw 'injected next-to-final failure'
        }
        Rename-Item -LiteralPath $Source -NewName (Split-Path -Leaf $Destination)
    }
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode -MoveDirectoryAction $failSecondMove
    } 'restores previous when next-to-final move fails'
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\src\service.ts')) 'prior final corpus is restored after injected move failure'
    Assert-True (-not (Test-Path -LiteralPath $previousStage)) 'successful restoration consumes sibling previous'
    Assert-True (-not (Test-Path -LiteralPath ($stage + '.next'))) 'failed replacement cleans owned next after restoration'

    $failedRestoreMoveState = [pscustomobject]@{ Count = 0 }
    $failSecondAndRestoreMoves = {
        param([string]$Source, [string]$Destination)
        $failedRestoreMoveState.Count++
        if ($failedRestoreMoveState.Count -ge 2) {
            throw 'injected replacement and restoration failure'
        }
        Rename-Item -LiteralPath $Source -NewName (Split-Path -Leaf $Destination)
    }
    Assert-Throws {
        New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode -MoveDirectoryAction $failSecondAndRestoreMoves
    } 'preserves previous when immediate restoration fails'
    Assert-True (-not (Test-Path -LiteralPath $stage)) 'failed restoration leaves final missing'
    Assert-True (Test-Path -LiteralPath (Join-Path $previousStage 'web-api\src\service.ts')) 'failed restoration preserves the only prior corpus in sibling previous'
    Assert-True (Test-Path -LiteralPath (Join-Path $previousStage $stagingMarkerName)) 'preserved sibling previous remains owned'

    $result = New-StagingTree -RepositoryRoot $repositoryRoot -FixtureFileSystemMode
    Assert-True (Test-Path -LiteralPath (Join-Path $stage 'web-api\src\service.ts')) 'next run recovers owned previous before building'
    Assert-True (-not (Test-Path -LiteralPath $previousStage)) 'recovery removes sibling previous by renaming it to final'
    Assert-True (-not (Test-Path -LiteralPath ($stage + '.next'))) 'recovery run leaves no staging.next sibling'

    if ($RealCorpus) {
        $realRepositoryRoot = Split-Path -Parent $PSScriptRoot
        $realStage = Join-Path $realRepositoryRoot ('.tmp\graphify-input.fixture-' + [guid]::NewGuid().ToString('N'))
        $script:externalFixturePaths += $realStage
        $script:activeRealCorpusFixtureRoot = $realStage
        $oldStage = Join-Path $realRepositoryRoot 'graphify-input'
        Assert-True (-not (Test-Path -LiteralPath $oldStage)) 'old root staging path is absent'
        Assert-True (-not (Test-Path -LiteralPath ($oldStage + '.next'))) 'old root staging.next path is absent'

        $realResult = New-StagingTree -RepositoryRoot $realRepositoryRoot -StagingRoot $realStage
        Assert-InRange $realResult.WebCount 50 200 'real Web corpus count drifted outside the expected diagnostic range'
        Assert-InRange $realResult.GSheetCount 200 350 'real GSheet corpus count drifted outside the expected diagnostic range'
        Assert-True (Test-Path -LiteralPath (Join-Path $realStage 'web-api')) 'real Web prefix exists'
        Assert-True (Test-Path -LiteralPath (Join-Path $realStage 'gsheet')) 'real GSheet prefix exists'
        Assert-Equal ([System.IO.File]::ReadAllText((Join-Path $realStage $stagingMarkerName))) $stagingMarkerContent 'real final staging marker has exact content'

        Write-Utf8Fixture (Join-Path $realStage 'stale-atomic-marker.txt') 'must be replaced'
        $realResult = New-StagingTree -RepositoryRoot $realRepositoryRoot -StagingRoot $realStage
        Assert-InRange $realResult.WebCount 50 200 'real Web corpus count drifted after atomic replacement'
        Assert-InRange $realResult.GSheetCount 200 350 'real GSheet corpus count drifted after atomic replacement'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $realStage 'stale-atomic-marker.txt'))) 'real staging is atomically replaced'
        Assert-True (-not (Test-Path -LiteralPath ($realStage + '.next'))) 'real staging.next is moved into place'

        $forbidden = @(Get-ChildItem -LiteralPath $realStage -File -Recurse | Where-Object {
            $relativePath = $_.FullName.Substring($realStage.Length).TrimStart('\')
            $relativePath -match '(?i)(^|\\)(node_modules|dist|build|coverage|\.next|generated|out|cache|\.cache|\.turbo|\.omc)(\\|$)' -or
            $_.Extension -ieq '.gs' -or
            $_.Name -match '(?i)^\.env|^dockerfile|^docker-compose|\.log($|\.)|\.(db|db3|sqlite|sqlite3)(\.|$)'
        })
        Assert-Equal $forbidden.Count 0 'real staging contains no forbidden paths'

        $webExtensions = @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json')
        $gsheetExtensions = @('.js', '.json')
        $extensionViolations = @(Get-ChildItem -LiteralPath $realStage -File -Recurse | Where-Object {
            $relativePath = $_.FullName.Substring($realStage.Length).TrimStart('\')
            if ($relativePath -ceq $stagingMarkerName) {
                return $false
            }
            if ($relativePath.StartsWith('web-api\', [System.StringComparison]::OrdinalIgnoreCase)) {
                return $webExtensions -notcontains $_.Extension.ToLowerInvariant()
            }
            if ($relativePath.StartsWith('gsheet\', [System.StringComparison]::OrdinalIgnoreCase)) {
                return $gsheetExtensions -notcontains $_.Extension.ToLowerInvariant()
            }
            return $true
        })
        Assert-Equal $extensionViolations.Count 0 'every real staged file has an allowlisted prefix and extension, except the root marker'

        $workspacePath = Join-Path $realRepositoryRoot '.obsidian\workspace.json'
        if (Test-Path -LiteralPath $workspacePath -PathType Leaf) {
            $workspaceContent = [System.IO.File]::ReadAllText($workspacePath)
            Assert-True ($workspaceContent -notmatch '(?i)\.tmp[\\/]graphify-input') 'Obsidian workspace does not index real staging'
        }

        "REAL: Web=$($realResult.WebCount) GSheet=$($realResult.GSheetCount) Bytes=$($realResult.TotalBytes)"
    }

    "PASS: $assertionCount assertions"
}
catch {
    $failed = $true
    Write-Error "FAIL: $($_.Exception.Message)"
}
finally {
    $script:activeRealCorpusFixtureRoot = $null
    $env:PATH = $originalPath
    $env:WCORE_FAKE_GIT_MODE = $originalFakeGitMode
    $env:WCORE_FAKE_GIT_ROOT = $originalFakeGitRoot
    Restore-TestEnvironmentVariable -Name 'GIT_TRACE' -WasSet $originalGitTraceWasSet -Value $originalGitTrace
    foreach ($junctionPath in @($junctionPaths)) {
        Remove-TestJunction $junctionPath
    }
    foreach ($externalFixturePath in @($externalFixturePaths)) {
        foreach ($candidate in @($externalFixturePath, $externalFixturePath + '.next', $externalFixturePath + '.previous')) {
            if (Test-Path -LiteralPath $candidate) {
                Remove-Item -LiteralPath $candidate -Recurse -Force
            }
        }
    }
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}

if ($failed) {
    exit 1
}
