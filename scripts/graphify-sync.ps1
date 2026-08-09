param(
    [Parameter(Position = 0)]
    [ValidateSet('sync', 'watch', 'status', 'install-task', 'uninstall-task')]
    [string]$Mode = 'status',
    [int]$ParentPid = 0
)

$ErrorActionPreference = 'Stop'
$script:StagingMarkerName = '.wcore-graphify-staging'
$script:StagingMarkerContent = 'WCORE Graphify staging v1'
$script:FixtureFileSystemDiscoveryAuthorization = New-Object object

function Get-NormalizedPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $normalizedBase = (Get-NormalizedPath $BasePath) + [System.IO.Path]::DirectorySeparatorChar
    $normalizedPath = Get-NormalizedPath $Path
    if (-not $normalizedPath.StartsWith($normalizedBase, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$Path' is outside '$BasePath'."
    }
    return $normalizedPath.Substring($normalizedBase.Length)
}

function Test-ReparsePointAttributes {
    param([Parameter(Mandatory = $true)][System.IO.FileAttributes]$Attributes)

    return ($Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
}

function Assert-SafePathAncestry {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$AllowMissingLeaf
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    $target = Get-NormalizedPath $Path
    if ($target -ne $repository -and
        -not $target.StartsWith($repository + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path '$target' is outside repository root '$repository'."
    }
    if (-not (Test-Path -LiteralPath $repository -PathType Container)) {
        throw "Repository root does not exist or is not a directory: $repository"
    }

    $repositoryItem = Get-Item -LiteralPath $repository -Force
    if (Test-ReparsePointAttributes -Attributes $repositoryItem.Attributes) {
        throw "Repository root is a reparse point: $repository"
    }
    if ($target -eq $repository) {
        return
    }

    $current = $repository
    $missingComponent = $false
    foreach ($segment in ((Get-RelativePath -BasePath $repository -Path $target) -split '[\\/]')) {
        $current = Join-Path $current $segment
        if (-not (Test-Path -LiteralPath $current)) {
            $missingComponent = $true
            continue
        }
        if ($missingComponent) {
            throw "Physical ancestry cannot be proven for path: $target"
        }
        $item = Get-Item -LiteralPath $current -Force
        if (Test-ReparsePointAttributes -Attributes $item.Attributes) {
            throw "Path ancestry contains a reparse point: $current"
        }
    }
    if ($missingComponent -and -not $AllowMissingLeaf) {
        throw "Path does not exist; physical ancestry cannot be proven: $target"
    }
}

function Get-SafeFileSystemFiles {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$SourceRoot
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    $source = Get-NormalizedPath $SourceRoot
    Assert-SafePathAncestry -RepositoryRoot $repository -Path $source

    $directories = New-Object 'System.Collections.Generic.Queue[string]'
    $directories.Enqueue($source)
    $files = @()
    while ($directories.Count -gt 0) {
        $directory = $directories.Dequeue()
        Assert-SafePathAncestry -RepositoryRoot $repository -Path $directory
        foreach ($item in (Get-ChildItem -LiteralPath $directory -Force)) {
            if (Test-ReparsePointAttributes -Attributes $item.Attributes) {
                throw "Source traversal encountered a reparse point: $($item.FullName)"
            }
            Assert-SafePathAncestry -RepositoryRoot $repository -Path $item.FullName
            if ($item.PSIsContainer) {
                $directories.Enqueue($item.FullName)
            }
            elseif ($item -is [System.IO.FileInfo]) {
                $files += $item
            }
            else {
                throw "Source traversal encountered an unsupported filesystem object: $($item.FullName)"
            }
        }
    }
    return $files
}

function ConvertFrom-GitNullOutput {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][byte[]]$Bytes)

    if ($Bytes.Length -eq 0) {
        return @()
    }
    if ($Bytes[$Bytes.Length - 1] -ne 0) {
        throw 'git ls-files returned malformed output without a trailing NUL.'
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try {
        $text = $utf8.GetString($Bytes)
    }
    catch {
        throw 'git ls-files returned invalid UTF-8 output.'
    }
    return @($text.Split([char]0) | Select-Object -SkipLast 1)
}

function ConvertTo-NativeArgument {
    param([Parameter(Mandatory = $true)][string]$Value)

    $result = New-Object System.Text.StringBuilder
    $null = $result.Append('"')
    $backslashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') {
            $backslashes++
            continue
        }
        if ($character -eq '"') {
            $null = $result.Append(('\' * (($backslashes * 2) + 1)))
            $null = $result.Append('"')
        }
        else {
            if ($backslashes -gt 0) {
                $null = $result.Append(('\' * $backslashes))
            }
            $null = $result.Append($character)
        }
        $backslashes = 0
    }
    if ($backslashes -gt 0) {
        $null = $result.Append(('\' * ($backslashes * 2)))
    }
    $null = $result.Append('"')
    return $result.ToString()
}

function Invoke-GitLsFiles {
    param(
        [Parameter(Mandatory = $true)][string]$GitRoot,
        [Parameter(Mandatory = $true)][string]$PathSpec
    )

    $gitCommand = Get-Command git -CommandType Application -ErrorAction Stop
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $gitCommand.Source
    $startInfo.Arguments = (@('-C', $GitRoot, 'ls-files', '-z', '--', $PathSpec) | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $stdout = New-Object System.IO.MemoryStream
    try {
        if (-not $process.Start()) {
            throw 'Failed to start git ls-files.'
        }
        $stdoutTask = $process.StandardOutput.BaseStream.CopyToAsync($stdout)
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $null = $stdoutTask.GetAwaiter().GetResult()
        $stderr = $stderrTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) {
            throw "git ls-files failed for '$PathSpec' (exit $($process.ExitCode)): $($stderr.Trim())"
        }
        if (-not [string]::IsNullOrWhiteSpace($stderr)) {
            throw "git ls-files wrote unexpected stderr for '$PathSpec': $($stderr.Trim())"
        }
        return @(ConvertFrom-GitNullOutput -Bytes $stdout.ToArray())
    }
    finally {
        $stdout.Dispose()
        $process.Dispose()
    }
}

function Get-CorpusSourceFiles {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [object]$FixtureAuthorization,
        [string]$RepositoryRoot
    )

    $source = Get-NormalizedPath $SourceRoot
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Source root does not exist: $source"
    }
    if ($null -ne $FixtureAuthorization) {
        if (-not [object]::ReferenceEquals($FixtureAuthorization, $script:FixtureFileSystemDiscoveryAuthorization)) {
            throw 'Filesystem discovery requires internal fixture authorization.'
        }
        if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
            throw 'Fixture filesystem discovery requires RepositoryRoot.'
        }
        return @(Get-SafeFileSystemFiles -RepositoryRoot $RepositoryRoot -SourceRoot $source)
    }

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'SilentlyContinue'
        $gitRootOutput = @(& git -C $source rev-parse --show-toplevel 2>$null)
        $gitRootExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($gitRootExitCode -ne 0 -or $gitRootOutput.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$gitRootOutput[0])) {
        throw "Git repository discovery failed for source root: $source"
    }

    $gitRoot = Get-NormalizedPath ([string]$gitRootOutput[0])
    $physicalRepositoryRoot = if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) { $gitRoot } else { Get-NormalizedPath $RepositoryRoot }
    Assert-SafePathAncestry -RepositoryRoot $physicalRepositoryRoot -Path $source
    $pathSpec = (Get-RelativePath -BasePath $gitRoot -Path $source).Replace('\', '/')
    $trackedPaths = @(Invoke-GitLsFiles -GitRoot $gitRoot -PathSpec $pathSpec)
    if ($trackedPaths.Count -eq 0) {
        throw "git ls-files returned no tracked files for source root: $source"
    }

    $files = @()
    foreach ($trackedPath in $trackedPaths) {
        if ([string]::IsNullOrWhiteSpace([string]$trackedPath)) {
            throw "git ls-files returned an empty path for source root: $source"
        }
        $candidate = Get-NormalizedPath (Join-Path $gitRoot ([string]$trackedPath).Replace('/', '\'))
        try {
            $null = Get-RelativePath -BasePath $source -Path $candidate
        }
        catch {
            throw "git ls-files returned a path outside source root '$source': $trackedPath"
        }
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            throw "git ls-files returned a missing or invalid file: $trackedPath"
        }
        Assert-SafePathAncestry -RepositoryRoot $physicalRepositoryRoot -Path $candidate
        $files += Get-Item -LiteralPath $candidate
    }
    return $files
}

function Test-WebCorpusPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $allowedExtensions = @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json')
    $extension = [System.IO.Path]::GetExtension($RelativePath).ToLowerInvariant()
    if ($allowedExtensions -notcontains $extension) {
        return $false
    }

    $segments = @($RelativePath -split '[\\/]')
    $excludedDirectories = @(
        'node_modules', 'dist', 'build', 'coverage', '.next', 'generated', 'out',
        'cache', '.cache', '.turbo', '.omc'
    )
    foreach ($segment in $segments[0..([Math]::Max(0, $segments.Count - 2))]) {
        if ($excludedDirectories -contains $segment.ToLowerInvariant()) {
            return $false
        }
    }

    $fileName = $segments[$segments.Count - 1]
    if ($fileName -match '(?i)^\.env' -or
        $fileName -match '(?i)^dockerfile' -or
        $fileName -match '(?i)^docker-compose' -or
        $fileName -match '(?i)\.log($|\.)' -or
        $fileName -match '(?i)\.(db|db3|sqlite|sqlite3)(\.|$)') {
        return $false
    }

    return $true
}

function Copy-CorpusFile {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $parent = Split-Path -Parent $Destination
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::Copy($Source, $Destination, $true)
    return (Get-Item -LiteralPath $Destination).Length
}

function Sync-WebCorpus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [string]$RepositoryRoot
    )

    return Sync-WebCorpusInternal -SourceRoot $SourceRoot -DestinationRoot $DestinationRoot -RepositoryRoot $RepositoryRoot
}

function Sync-WebCorpusInternal {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [string]$RepositoryRoot,
        [object]$FixtureAuthorization
    )

    $source = Get-NormalizedPath $SourceRoot
    $destination = Get-NormalizedPath $DestinationRoot
    $count = 0
    [long]$bytes = 0

    foreach ($file in (Get-CorpusSourceFiles -SourceRoot $source -FixtureAuthorization $FixtureAuthorization -RepositoryRoot $RepositoryRoot)) {
        if (-not [string]::IsNullOrWhiteSpace($RepositoryRoot)) {
            Assert-SafePathAncestry -RepositoryRoot $RepositoryRoot -Path $file.FullName
        }
        $relativePath = Get-RelativePath -BasePath $source -Path $file.FullName
        if (-not (Test-WebCorpusPath -RelativePath $relativePath)) {
            continue
        }
        $bytes += Copy-CorpusFile -Source $file.FullName -Destination (Join-Path $destination $relativePath)
        $count++
    }

    return [pscustomobject]@{
        Count = $count
        Bytes = $bytes
    }
}

function Sync-GSheetCorpus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [string]$RepositoryRoot
    )

    return Sync-GSheetCorpusInternal -SourceRoot $SourceRoot -DestinationRoot $DestinationRoot -RepositoryRoot $RepositoryRoot
}

function Sync-GSheetCorpusInternal {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [string]$RepositoryRoot,
        [object]$FixtureAuthorization
    )

    $source = Get-NormalizedPath $SourceRoot
    $destination = Get-NormalizedPath $DestinationRoot
    $count = 0
    [long]$bytes = 0

    foreach ($file in (Get-CorpusSourceFiles -SourceRoot $source -FixtureAuthorization $FixtureAuthorization -RepositoryRoot $RepositoryRoot)) {
        if (-not [string]::IsNullOrWhiteSpace($RepositoryRoot)) {
            Assert-SafePathAncestry -RepositoryRoot $RepositoryRoot -Path $file.FullName
        }
        $relativePath = Get-RelativePath -BasePath $source -Path $file.FullName
        if ($file.Extension -ieq '.gs') {
            $destinationRelativePath = [System.IO.Path]::ChangeExtension($relativePath, '.js')
        }
        elseif ($file.Name -ieq 'appsscript.json') {
            $destinationRelativePath = $relativePath
        }
        else {
            continue
        }

        $bytes += Copy-CorpusFile -Source $file.FullName -Destination (Join-Path $destination $destinationRelativePath)
        $count++
    }

    return [pscustomobject]@{
        Count = $count
        Bytes = $bytes
    }
}

function Assert-SafeStagingPath {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$StagingRoot
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    $staging = Get-NormalizedPath $StagingRoot
    if ($staging -eq $repository -or
        -not $staging.StartsWith($repository + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
        $staging.EndsWith('.next', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe staging root: $staging"
    }

    Assert-SafePathAncestry -RepositoryRoot $repository -Path $staging -AllowMissingLeaf

    foreach ($path in @($staging, $staging + '.next', $staging + '.previous')) {
        if (Test-Path -LiteralPath $path) {
            Assert-SafePathAncestry -RepositoryRoot $repository -Path $path
        }
    }
}

function Write-StagingOwnershipMarker {
    param([Parameter(Mandatory = $true)][string]$Path)

    $markerPath = Join-Path $Path $script:StagingMarkerName
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($markerPath, $script:StagingMarkerContent, $utf8)
}

function Assert-OwnedStagingTree {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedPath
    )

    $normalizedPath = Get-NormalizedPath $Path
    $normalizedExpectedPath = Get-NormalizedPath $ExpectedPath
    if (-not $normalizedPath.Equals($normalizedExpectedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing staging operation outside expected path '$normalizedExpectedPath': $normalizedPath"
    }
    Assert-SafePathAncestry -RepositoryRoot $RepositoryRoot -Path $normalizedPath
    if (-not (Test-Path -LiteralPath $normalizedPath -PathType Container)) {
        throw "Expected staging tree does not exist: $normalizedPath"
    }
    $item = Get-Item -LiteralPath $normalizedPath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Refusing staging operation on a reparse point: $normalizedPath"
    }

    $markerPath = Join-Path $normalizedPath $script:StagingMarkerName
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf) -or
        [System.IO.File]::ReadAllText($markerPath) -cne $script:StagingMarkerContent) {
        throw "Refusing staging operation on an unowned tree: $normalizedPath"
    }
}

function Remove-OwnedStagingTree {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedPath
    )

    Assert-OwnedStagingTree -RepositoryRoot $RepositoryRoot -Path $Path -ExpectedPath $ExpectedPath
    Remove-Item -LiteralPath $Path -Recurse -Force
}

function Move-StagingTree {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [scriptblock]$Action
    )

    if ($null -ne $Action) {
        & $Action $Source $Destination
        return
    }
    Rename-Item -LiteralPath $Source -NewName (Split-Path -Leaf $Destination)
}

function Assert-SwapCandidate {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Phase,
        [scriptblock]$ValidationObserver
    )

    Assert-OwnedStagingTree -RepositoryRoot $RepositoryRoot -Path $Path -ExpectedPath $Path
    if ($null -ne $ValidationObserver) {
        & $ValidationObserver $Path $Phase
    }
}

function New-StagingTree {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [string]$StagingRoot,
        [switch]$FixtureFileSystemMode,
        [scriptblock]$MoveDirectoryAction,
        [scriptblock]$BeforeSwapAction,
        [scriptblock]$ValidationObserver
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    if ([string]::IsNullOrWhiteSpace($StagingRoot)) {
        $staging = Join-Path $repository '.tmp\graphify-input'
    }
    else {
        $staging = Get-NormalizedPath $StagingRoot
    }
    $next = $staging + '.next'
    $previous = $staging + '.previous'
    $hadPrevious = $false
    $validationFailed = $false
    Assert-SafeStagingPath -RepositoryRoot $repository -StagingRoot $staging

    $webSource = Join-Path $repository 'wcore-web\apps\api'
    $gsheetSource = Join-Path $repository 'wcore-gsheet\src'
    if (-not (Test-Path -LiteralPath $webSource -PathType Container)) {
        throw "Web source root does not exist: $webSource"
    }
    if (-not (Test-Path -LiteralPath $gsheetSource -PathType Container)) {
        throw "GSheet source root does not exist: $gsheetSource"
    }
    Assert-SafePathAncestry -RepositoryRoot $repository -Path $webSource
    Assert-SafePathAncestry -RepositoryRoot $repository -Path $gsheetSource

    if (Test-Path -LiteralPath $previous) {
        Assert-OwnedStagingTree -RepositoryRoot $repository -Path $previous -ExpectedPath $previous
        if (Test-Path -LiteralPath $staging) {
            Assert-OwnedStagingTree -RepositoryRoot $repository -Path $staging -ExpectedPath $staging
            Remove-OwnedStagingTree -RepositoryRoot $repository -Path $previous -ExpectedPath $previous
        }
        else {
            Move-StagingTree -Source $previous -Destination $staging -Action $MoveDirectoryAction
        }
    }
    if (Test-Path -LiteralPath $next) {
        Remove-OwnedStagingTree -RepositoryRoot $repository -Path $next -ExpectedPath $next
    }

    try {
        $stagingParent = Split-Path -Parent $staging
        if (-not (Test-Path -LiteralPath $stagingParent -PathType Container)) {
            New-Item -ItemType Directory -Path $stagingParent -Force | Out-Null
        }
        New-Item -ItemType Directory -Path $next | Out-Null
        Assert-SafePathAncestry -RepositoryRoot $repository -Path $next
        Write-StagingOwnershipMarker -Path $next
        $fixtureAuthorization = if ($FixtureFileSystemMode) { $script:FixtureFileSystemDiscoveryAuthorization } else { $null }
        $webResult = Sync-WebCorpusInternal -SourceRoot $webSource -DestinationRoot (Join-Path $next 'web-api') -RepositoryRoot $repository -FixtureAuthorization $fixtureAuthorization
        $gsheetResult = Sync-GSheetCorpusInternal -SourceRoot $gsheetSource -DestinationRoot (Join-Path $next 'gsheet') -RepositoryRoot $repository -FixtureAuthorization $fixtureAuthorization
        New-Item -ItemType Directory -Path (Join-Path $next '.git') | Out-Null
        try {
            Assert-SwapCandidate -RepositoryRoot $repository -Path $next -Phase 'CompletedNext' -ValidationObserver $ValidationObserver
        }
        catch {
            $validationFailed = $true
            throw
        }
        if ($null -ne $BeforeSwapAction) {
            & $BeforeSwapAction $next
        }
        try {
            Assert-SwapCandidate -RepositoryRoot $repository -Path $next -Phase 'BeforeFinalMove' -ValidationObserver $ValidationObserver
        }
        catch {
            $validationFailed = $true
            throw
        }

        if (Test-Path -LiteralPath $staging) {
            Assert-OwnedStagingTree -RepositoryRoot $repository -Path $staging -ExpectedPath $staging
            Move-StagingTree -Source $staging -Destination $previous -Action $MoveDirectoryAction
            $hadPrevious = $true
        }
        try {
            Assert-SwapCandidate -RepositoryRoot $repository -Path $next -Phase 'BeforeNextMove' -ValidationObserver $ValidationObserver
        }
        catch {
            $validationFailed = $true
            throw
        }
        Move-StagingTree -Source $next -Destination $staging -Action $MoveDirectoryAction
        if ($hadPrevious) {
            Remove-OwnedStagingTree -RepositoryRoot $repository -Path $previous -ExpectedPath $previous
        }
    }
    catch {
        $operationError = $_
        if ($hadPrevious -and
            -not (Test-Path -LiteralPath $staging) -and
            (Test-Path -LiteralPath $previous)) {
            try {
                Assert-OwnedStagingTree -RepositoryRoot $repository -Path $previous -ExpectedPath $previous
                Move-StagingTree -Source $previous -Destination $staging -Action $MoveDirectoryAction
            }
            catch {
                throw "Staging replacement failed and the prior tree could not be restored. It remains at '$previous'."
            }
        }
        if (-not $validationFailed -and (Test-Path -LiteralPath $next)) {
            Remove-OwnedStagingTree -RepositoryRoot $repository -Path $next -ExpectedPath $next
        }
        throw $operationError
    }

    return [pscustomobject]@{
        WebCount = $webResult.Count
        GSheetCount = $gsheetResult.Count
        WebBytes = $webResult.Bytes
        GSheetBytes = $gsheetResult.Bytes
        TotalBytes = [long]($webResult.Bytes + $gsheetResult.Bytes)
    }
}

function Get-GraphCollectionCount {
    param([Parameter(Mandatory = $true)]$Value)

    if ($Value -is [System.Array] -or $Value -is [System.Collections.IList]) {
        return $Value.Count
    }
    if ($Value -is [System.Collections.IDictionary]) {
        return $Value.Count
    }
    if ($null -ne $Value) {
        return @($Value.PSObject.Properties).Count
    }
    return 0
}

function Test-GraphPathValueContainsPrefix {
    param(
        $Value,
        [Parameter(Mandatory = $true)][string]$Prefix
    )

    if ($null -eq $Value) {
        return $false
    }
    if ($Value -is [string]) {
        $normalizedValue = $Value -replace '\\', '/'
        return [regex]::IsMatch(
            $normalizedValue,
            '(^|/)' + [regex]::Escape($Prefix) + '(/|$)',
            [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
        )
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        foreach ($item in $Value) {
            if (Test-GraphPathValueContainsPrefix -Value $item -Prefix $Prefix) {
                return $true
            }
        }
    }
    return $false
}

function Test-GraphValueContainsPrefix {
    param(
        $Value,
        [Parameter(Mandatory = $true)][string]$Prefix
    )

    if ($null -eq $Value -or $Value -is [string]) {
        return $false
    }
    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [System.Collections.IDictionary])) {
        foreach ($item in $Value) {
            if (Test-GraphValueContainsPrefix -Value $item -Prefix $Prefix) {
                return $true
            }
        }
        return $false
    }

    $pathPropertyNames = @('path', 'file', 'source_file', 'source_path', 'sourcePath', 'filePath')
    if ($Value -is [System.Collections.IDictionary]) {
        foreach ($key in $Value.Keys) {
            if (($pathPropertyNames -ccontains [string]$key) -and
                (Test-GraphPathValueContainsPrefix -Value $Value[$key] -Prefix $Prefix)) {
                return $true
            }
            if ([string]$key -ceq 'metadata' -and
                (Test-GraphValueContainsPrefix -Value $Value[$key] -Prefix $Prefix)) {
                return $true
            }
        }
        return $false
    }
    foreach ($property in $Value.PSObject.Properties) {
        if (($pathPropertyNames -ccontains $property.Name) -and
            (Test-GraphPathValueContainsPrefix -Value $property.Value -Prefix $Prefix)) {
            return $true
        }
        if ($property.Name -ceq 'metadata' -and
            (Test-GraphValueContainsPrefix -Value $property.Value -Prefix $Prefix)) {
            return $true
        }
    }
    return $false
}

function Get-PreviousGraphCount {
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $resultProperty = $State.PSObject.Properties['result']
    $lastSuccessProperty = $State.PSObject.Properties['lastSuccess']
    if ($null -ne $resultProperty -and [string]$resultProperty.Value -ieq 'error') {
        if ($null -ne $lastSuccessProperty -and $null -ne $lastSuccessProperty.Value) {
            return Get-PreviousGraphCount -State $lastSuccessProperty.Value -Name $Name
        }
        return 0
    }
    if ($null -ne $lastSuccessProperty -and $null -ne $lastSuccessProperty.Value) {
        return Get-PreviousGraphCount -State $lastSuccessProperty.Value -Name $Name
    }
    $property = $State.PSObject.Properties[$Name]
    if ($null -ne $property) {
        return [long]$property.Value
    }
    $countProperty = $State.PSObject.Properties[$Name + 'Count']
    if ($null -ne $countProperty) {
        return [long]$countProperty.Value
    }
    $graphProperty = $State.PSObject.Properties['graph']
    if ($null -ne $graphProperty -and $null -ne $graphProperty.Value) {
        $nestedProperty = $graphProperty.Value.PSObject.Properties[$Name]
        if ($null -ne $nestedProperty) {
            return [long]$nestedProperty.Value
        }
    }
    return 0
}

function Test-GraphArtifact {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$GraphPath,
        [Parameter(Mandatory = $true)][string]$PreviousStatePath
    )

    if (-not (Test-Path -LiteralPath $GraphPath -PathType Leaf)) {
        throw "Graph artifact does not exist: $GraphPath"
    }
    try {
        $graph = [System.IO.File]::ReadAllText($GraphPath) | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "Graph artifact is not valid JSON: $GraphPath"
    }
    $nodesProperty = if ($null -eq $graph) { $null } else { $graph.PSObject.Properties['nodes'] }
    $edgesProperty = if ($null -eq $graph) { $null } else { $graph.PSObject.Properties['edges'] }
    $linksProperty = if ($null -eq $graph) { $null } else { $graph.PSObject.Properties['links'] }
    if ($null -eq $nodesProperty -or ($null -eq $edgesProperty -and $null -eq $linksProperty)) {
        throw 'Graph artifact must contain nodes and at least one of edges or links.'
    }

    $edgesValue = $null
    if ($null -ne $edgesProperty) {
        $edgesValue = $edgesProperty.Value
    }
    $linksValue = $null
    if ($null -ne $linksProperty) {
        $linksValue = $linksProperty.Value
    }
    if ($null -eq $edgesValue -and $null -eq $linksValue) {
        throw 'Graph artifact must contain a non-null edges or links collection.'
    }
    if ($null -ne $edgesValue -and $null -ne $linksValue) {
        $edgesJson = ConvertTo-Json -InputObject $edgesValue -Depth 100 -Compress
        $linksJson = ConvertTo-Json -InputObject $linksValue -Depth 100 -Compress
        if ($edgesJson -cne $linksJson) {
            throw 'Graph artifact contains inconsistent edges and links collections.'
        }
    }
    $edgeCollection = $edgesValue
    if ($null -ne $linksValue) {
        $edgeCollection = $linksValue
    }

    $nodeCount = Get-GraphCollectionCount -Value $nodesProperty.Value
    $edgeCount = Get-GraphCollectionCount -Value $edgeCollection
    if ($nodeCount -le 0) {
        throw 'Graph artifact contains zero nodes.'
    }
    if ($edgeCount -le 0) {
        throw 'Graph artifact contains zero edges.'
    }
    if (-not (Test-GraphValueContainsPrefix -Value $graph.nodes -Prefix 'web-api')) {
        throw 'Graph artifact contains no nodes from web-api.'
    }
    if (-not (Test-GraphValueContainsPrefix -Value $graph.nodes -Prefix 'gsheet')) {
        throw 'Graph artifact contains no nodes from gsheet.'
    }

    if (Test-Path -LiteralPath $PreviousStatePath -PathType Leaf) {
        try {
            $previousState = [System.IO.File]::ReadAllText($PreviousStatePath) | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            $previousState = $null
        }
        if ($null -ne $previousState) {
            $previousNodes = Get-PreviousGraphCount -State $previousState -Name 'nodes'
            $previousEdges = Get-PreviousGraphCount -State $previousState -Name 'edges'
            if (($previousNodes -gt 0 -and ([long]$nodeCount * 100) -lt ($previousNodes * 60)) -or
                ($previousEdges -gt 0 -and ([long]$edgeCount * 100) -lt ($previousEdges * 60))) {
                throw 'Graph artifact shrank by more than 40 percent versus the prior successful state.'
            }
        }
    }

    return [pscustomobject]@{
        Nodes = $nodeCount
        Edges = $edgeCount
    }
}

function Enter-GraphifyMutex {
    [CmdletBinding()]
    param([scriptblock]$WaitAction)

    $name = 'Local\WCORE.Graphify.Sync'
    $mutex = New-Object System.Threading.Mutex($false, $name)
    $acquired = $false
    try {
        $acquired = if ($null -ne $WaitAction) { [bool](& $WaitAction $mutex) } else { $mutex.WaitOne(0) }
    }
    catch [System.Threading.AbandonedMutexException] {
        $acquired = $true
    }
    catch {
        $mutex.Dispose()
        throw
    }
    return [pscustomobject]@{
        Name = $name
        Mutex = $mutex
        Acquired = $acquired
    }
}

function Exit-GraphifyMutex {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$Handle)

    if ($null -eq $Handle.Mutex) {
        return
    }
    try {
        if ($Handle.Acquired) {
            $Handle.Mutex.ReleaseMutex()
            $Handle.Acquired = $false
        }
    }
    finally {
        $Handle.Mutex.Dispose()
    }
}

function Invoke-GraphifyProcess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][hashtable]$Environment
    )

    $graphifyCommand = @(Get-Command graphify -CommandType Application -ErrorAction Stop)[0]
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $graphifyCommand.Source
    $startInfo.Arguments = (@($Arguments) | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($key in $Environment.Keys) {
        $startInfo.EnvironmentVariables[[string]$key] = [string]$Environment[$key]
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            throw 'Failed to start Graphify.'
        }
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            StdOut = $stdoutTask.GetAwaiter().GetResult()
            StdErr = $stderrTask.GetAwaiter().GetResult()
            Partial = $false
            Error = $null
        }
    }
    finally {
        $process.Dispose()
    }
}

function Get-GraphifyWarningText {
    param([AllowEmptyString()][string]$StdErr)

    if ([string]::IsNullOrWhiteSpace($StdErr)) {
        return $null
    }

    $trimmedDiagnostic = $StdErr.Trim()
    $hubRelabelPattern = '^\[graphify\] community set changed since labeling \([0-9]+ saved labels, [0-9]+ communities now; renamed [0-9]+ community\(ies\) by their hub\)\. Run `graphify label` to refresh names with the LLM\.$'
    if ([regex]::IsMatch($trimmedDiagnostic, $hubRelabelPattern, [System.Text.RegularExpressions.RegexOptions]::CultureInvariant)) {
        return $trimmedDiagnostic
    }
    # Benign: export pruned Obsidian notes for nodes removed from the graph.
    $prunePattern = '^\[graphify\] pruned [0-9]+ note\(s\) for nodes no longer in the graph$'
    if ([regex]::IsMatch($trimmedDiagnostic, $prunePattern, [System.Text.RegularExpressions.RegexOptions]::CultureInvariant)) {
        return $trimmedDiagnostic
    }

    $diagnosticLines = @([regex]::Split($StdErr, '\r?\n') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($diagnosticLines.Count -eq 0 -or $diagnosticLines[0].Trim() -notmatch '^(?i:warning:)') {
        return $null
    }
    foreach ($line in $diagnosticLines | Select-Object -Skip 1) {
        if ($line.Trim() -match '^(?i:error:|fatal:)') {
            return $null
        }
    }

    $warning = $StdErr.Trim()
    if ($warning.Length -gt 2000) {
        return $warning.Substring(0, 1997) + '...'
    }
    return $warning
}

function Assert-GraphifyProcessResult {
    param(
        [Parameter(Mandatory = $true)]$Result,
        [Parameter(Mandatory = $true)][string]$Operation
    )

    if ($null -eq $Result -or $null -eq $Result.PSObject.Properties['ExitCode']) {
        throw "$Operation returned no complete process result."
    }
    if ([int]$Result.ExitCode -ne 0) {
        throw "$Operation failed with exit code $($Result.ExitCode): $([string]$Result.StdErr)"
    }
    if ($Result.PSObject.Properties['Partial'] -and [bool]$Result.Partial) {
        throw "$Operation reported a partial result."
    }
    if ($Result.PSObject.Properties['Error'] -and -not [string]::IsNullOrWhiteSpace([string]$Result.Error)) {
        throw "$Operation reported an error: $([string]$Result.Error)$([string]$Result.StdErr)"
    }
    if ($Result.PSObject.Properties['StdErr'] -and -not [string]::IsNullOrWhiteSpace([string]$Result.StdErr)) {
        $warning = Get-GraphifyWarningText -StdErr ([string]$Result.StdErr)
        if ([string]::IsNullOrWhiteSpace([string]$warning)) {
            throw "$Operation reported an error: $([string]$Result.Error)$([string]$Result.StdErr)"
        }
        return $warning
    }
}

function Test-SafeOutputItemAttributes {
    param(
        [Parameter(Mandatory = $true)][System.IO.FileAttributes]$Attributes,
        [Parameter(Mandatory = $true)][bool]$PSIsContainer,
        [Parameter(Mandatory = $true)][ValidateSet('Directory', 'File')][string]$ExpectedType
    )

    if (Test-ReparsePointAttributes -Attributes $Attributes) {
        return $false
    }
    return ($ExpectedType -eq 'Directory' -and $PSIsContainer) -or
        ($ExpectedType -eq 'File' -and -not $PSIsContainer)
}

function Assert-SafeOutputPath {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][ValidateSet('Directory', 'File')][string]$ExpectedType,
        [switch]$AllowMissing
    )

    Assert-SafePathAncestry -RepositoryRoot $RepositoryRoot -Path $Path -AllowMissingLeaf:$AllowMissing
    if (-not (Test-Path -LiteralPath $Path)) {
        if ($AllowMissing) {
            return
        }
        throw "Required output $($ExpectedType.ToLowerInvariant()) does not exist: $Path"
    }
    $item = Get-Item -LiteralPath $Path -Force
    if (-not (Test-SafeOutputItemAttributes -Attributes $item.Attributes -PSIsContainer $item.PSIsContainer -ExpectedType $ExpectedType)) {
        if (Test-ReparsePointAttributes -Attributes $item.Attributes) {
            throw "Output path is a reparse point: $Path"
        }
        throw "Output path has a file/directory collision; expected $ExpectedType`: $Path"
    }
}

function Assert-SafeOutputTree {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path
    )

    Assert-SafeOutputPath -RepositoryRoot $RepositoryRoot -Path $Path -ExpectedType Directory
    $directories = New-Object 'System.Collections.Generic.Queue[string]'
    $directories.Enqueue((Get-NormalizedPath $Path))
    while ($directories.Count -gt 0) {
        $directory = $directories.Dequeue()
        foreach ($item in (Get-ChildItem -LiteralPath $directory -Force)) {
            $expectedType = if ($item.PSIsContainer) { 'Directory' } else { 'File' }
            Assert-SafeOutputPath -RepositoryRoot $RepositoryRoot -Path $item.FullName -ExpectedType $expectedType
            if ($item.PSIsContainer) {
                $directories.Enqueue($item.FullName)
            }
        }
    }
}

function Test-GraphifyObsidianManifest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$GeneratedPath
    )

    $generated = Get-NormalizedPath $GeneratedPath
    $manifestPath = Join-Path $generated '.graphify_obsidian_manifest.json'
    Assert-SafeOutputPath -RepositoryRoot $RepositoryRoot -Path $manifestPath -ExpectedType File

    try {
        $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
        $manifestText = $utf8.GetString([System.IO.File]::ReadAllBytes($manifestPath))
    }
    catch {
        throw "Graphify Obsidian manifest is not valid UTF-8: $manifestPath"
    }
    try {
        $manifest = $manifestText | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "Graphify Obsidian manifest is not valid UTF-8 JSON: $manifestPath"
    }
    if ($null -eq $manifest -or -not ($manifest -is [System.Management.Automation.PSCustomObject])) {
        throw 'Graphify Obsidian manifest top level must be an object.'
    }

    $filesProperty = $manifest.PSObject.Properties['files']
    if ($null -eq $filesProperty -or -not ($filesProperty.Value -is [System.Collections.IList])) {
        throw 'Graphify Obsidian manifest files must exist and be an array.'
    }

    $canvasPath = Get-NormalizedPath (Join-Path $generated 'graph.canvas')
    $fileCount = 0
    foreach ($entry in $filesProperty.Value) {
        if (-not ($entry -is [string]) -or [string]::IsNullOrWhiteSpace($entry)) {
            throw 'Graphify Obsidian manifest file entries must be nonempty strings.'
        }
        if ([System.IO.Path]::IsPathRooted($entry)) {
            throw "Graphify Obsidian manifest file entries must be relative: $entry"
        }
        try {
            $ownedPath = Get-NormalizedPath (Join-Path $generated $entry)
        }
        catch {
            throw "Graphify Obsidian manifest contains an invalid relative path: $entry"
        }
        if (-not $ownedPath.StartsWith($generated + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Graphify Obsidian manifest path must normalize strictly beneath the generated directory: $entry"
        }
        if ($ownedPath.Equals($canvasPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Graphify Obsidian manifest must not own graph.canvas.'
        }
        if (-not (Test-Path -LiteralPath $ownedPath -PathType Leaf)) {
            throw "Graphify Obsidian manifest entry is missing or is not a regular file: $entry"
        }
        Assert-SafeOutputPath -RepositoryRoot $RepositoryRoot -Path $ownedPath -ExpectedType File
        $fileCount++
    }

    return [pscustomobject]@{ Files = $fileCount }
}

function Test-GraphifyJsonNumber {
    param($Value)

    return $Value -is [byte] -or $Value -is [sbyte] -or
        $Value -is [int16] -or $Value -is [uint16] -or
        $Value -is [int32] -or $Value -is [uint32] -or
        $Value -is [int64] -or $Value -is [uint64] -or
        $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]
}

function Test-GraphifyOrphanedExport {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$GeneratedPath
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    $generated = Get-NormalizedPath $GeneratedPath
    $expectedGenerated = Get-NormalizedPath (Join-Path $repository 'generated\graphify')
    if (-not $generated.Equals($expectedGenerated, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Orphan Graphify export validation is restricted to: $expectedGenerated"
    }
    Assert-SafeOutputTree -RepositoryRoot $repository -Path $generated

    $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
    $markdownCount = 0
    $hasGraphConfig = $false
    foreach ($item in (Get-ChildItem -LiteralPath $generated -Force)) {
        if ($item.PSIsContainer) {
            if ($item.Name -cne '.obsidian') {
                throw "Orphan Graphify export contains an unexpected directory: $($item.FullName)"
            }
            Assert-SafeOutputPath -RepositoryRoot $repository -Path $item.FullName -ExpectedType Directory
            $configItems = @(Get-ChildItem -LiteralPath $item.FullName -Force)
            if ($configItems.Count -ne 1 -or $configItems[0].PSIsContainer -or $configItems[0].Name -cne 'graph.json') {
                throw 'Orphan Graphify export .obsidian directory must contain only graph.json.'
            }
            $configPath = $configItems[0].FullName
            Assert-SafeOutputPath -RepositoryRoot $repository -Path $configPath -ExpectedType File
            try {
                $configText = $utf8.GetString([System.IO.File]::ReadAllBytes($configPath))
                $config = $configText | ConvertFrom-Json -ErrorAction Stop
            }
            catch {
                throw 'Orphan Graphify graph config must be valid UTF-8 JSON.'
            }
            if ($null -eq $config -or -not ($config -is [System.Management.Automation.PSCustomObject]) -or
                @($config.PSObject.Properties).Count -ne 1 -or $null -eq $config.PSObject.Properties['colorGroups'] -or
                -not ($config.colorGroups -is [System.Collections.IList])) {
                throw 'Orphan Graphify graph config must contain only the expected colorGroups array.'
            }
            foreach ($group in $config.colorGroups) {
                if ($null -eq $group -or -not ($group -is [System.Management.Automation.PSCustomObject]) -or
                    @($group.PSObject.Properties).Count -ne 2 -or $null -eq $group.PSObject.Properties['query'] -or
                    $null -eq $group.PSObject.Properties['color'] -or -not ($group.query -is [string]) -or
                    $group.query -notmatch '^tag:#community/[A-Za-z0-9_@./-]+$' -or $group.query.Contains('..') -or
                    $group.query.Contains('//') -or $group.query.Contains('\') -or
                    $group.query.EndsWith('/', [System.StringComparison]::Ordinal)) {
                    throw 'Orphan Graphify graph config contains an invalid colorGroups query.'
                }
                $color = $group.color
                if ($null -eq $color -or -not ($color -is [System.Management.Automation.PSCustomObject]) -or
                    @($color.PSObject.Properties).Count -ne 2 -or $null -eq $color.PSObject.Properties['a'] -or
                    $null -eq $color.PSObject.Properties['rgb'] -or -not (Test-GraphifyJsonNumber $color.a) -or
                    -not (Test-GraphifyJsonNumber $color.rgb)) {
                    throw 'Orphan Graphify graph config contains an invalid color object.'
                }
            }
            $hasGraphConfig = $true
            continue
        }

        if ($item.Name.StartsWith('.', [System.StringComparison]::Ordinal) -or
            ($item.Attributes -band [System.IO.FileAttributes]::Hidden) -ne 0 -or $item.Extension -cne '.md') {
            throw "Orphan Graphify export contains an unexpected hidden or non-Markdown file: $($item.FullName)"
        }
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $item.FullName -ExpectedType File
        try {
            $content = $utf8.GetString([System.IO.File]::ReadAllBytes($item.FullName))
        }
        catch {
            throw "Orphan Graphify Markdown is not valid UTF-8: $($item.Name)"
        }

        $isNodeNote = [regex]::IsMatch(
            $content,
            '^---\r?\nsource_file: "(?:\\.|[^"\\])+"\r?\ntype: "code"\r?\ncommunity: "(?:\\.|[^"\\])+"\r?\n(?:location: "(?:\\.|[^"\\])+"\r?\n)?tags:\r?\n  - graphify/code\r?\n  - graphify/EXTRACTED\r?\n  - community/[A-Za-z0-9_/-]+\r?\n---\r?\n',
            [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
        )
        $isCommunityNote = $item.Name.StartsWith('_COMMUNITY_', [System.StringComparison]::Ordinal) -and
            [regex]::IsMatch(
                $content,
                '^---\r?\ntype: community\r?\n(?:cohesion: [0-9]+\.[0-9]{2}\r?\n)?members: [0-9]+\r?\n---\r?\n',
                [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
            ) -and $content -match '(?m)^## Members\r?$' -and
            $content -match '(?m)^## Live Query \(requires Dataview plugin\)\r?$' -and
            $content -match '(?m)^TABLE source_file, type FROM #community/[A-Za-z0-9_/-]+\r?$' -and
            $content -match '(?m)^SORT file\.name ASC\r?$'
        if (-not $isNodeNote -and -not $isCommunityNote) {
            throw "Orphan Graphify Markdown lacks an exact generated signature: $($item.Name)"
        }
        $markdownCount++
    }
    if ($markdownCount -eq 0) {
        throw 'Orphan Graphify export recovery requires at least one signed Markdown note.'
    }
    return [pscustomobject]@{
        MarkdownFiles = $markdownCount
        HasGraphConfig = $hasGraphConfig
    }
}

function Initialize-GraphifyOrphanedExportRecovery {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$GeneratedPath
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    $generated = Get-NormalizedPath $GeneratedPath
    Assert-SafeOutputPath -RepositoryRoot $repository -Path $generated -ExpectedType Directory -AllowMissing
    if (-not (Test-Path -LiteralPath $generated -PathType Container)) {
        return $false
    }
    Assert-SafeOutputTree -RepositoryRoot $repository -Path $generated
    if (@(Get-ChildItem -LiteralPath $generated -Force).Count -eq 0) {
        return $false
    }
    $manifestPath = Join-Path $generated '.graphify_obsidian_manifest.json'
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $manifestPath -ExpectedType File
        return $false
    }

    $null = Test-GraphifyOrphanedExport -RepositoryRoot $repository -GeneratedPath $generated
    Assert-SafeOutputTree -RepositoryRoot $repository -Path $generated
    Remove-Item -LiteralPath $generated -Recurse -Force
    New-Item -ItemType Directory -Path $generated | Out-Null
    Assert-SafeOutputPath -RepositoryRoot $repository -Path $generated -ExpectedType Directory
    return $true
}

function Write-GraphifyStatus {
    param(
        [Parameter(Mandatory = $true)][string]$StatusPath,
        [Parameter(Mandatory = $true)]$Status,
        [scriptblock]$AfterNextWriteAction,
        [scriptblock]$CommitAction
    )

    $parent = Split-Path -Parent $StatusPath
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $nextPath = $StatusPath + '.next'
    $previousPath = $StatusPath + '.previous'
    if (Test-Path -LiteralPath $nextPath) {
        Remove-Item -LiteralPath $nextPath -Force
    }
    if (Test-Path -LiteralPath $previousPath) {
        Remove-Item -LiteralPath $previousPath -Force
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($nextPath, ($Status | ConvertTo-Json -Depth 8), $utf8)
        if ($null -ne $AfterNextWriteAction) {
            & $AfterNextWriteAction $nextPath
        }
        if (Test-Path -LiteralPath $StatusPath -PathType Leaf) {
            if ($null -ne $CommitAction) {
                & $CommitAction $nextPath $StatusPath $previousPath 'replace'
            }
            else {
                [System.IO.File]::Replace($nextPath, $StatusPath, $previousPath)
            }
        }
        else {
            if ($null -ne $CommitAction) {
                & $CommitAction $nextPath $StatusPath $previousPath 'move'
            }
            else {
                [System.IO.File]::Move($nextPath, $StatusPath)
            }
        }
    }
    finally {
        if (Test-Path -LiteralPath $nextPath) {
            Remove-Item -LiteralPath $nextPath -Force
        }
        if (Test-Path -LiteralPath $previousPath) {
            Remove-Item -LiteralPath $previousPath -Force
        }
    }
}

function Get-GraphifyStatus {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $repository = Get-NormalizedPath $RepositoryRoot
    $statusPath = Join-Path $repository 'graphify-out\status.json'
    if (-not (Test-Path -LiteralPath $statusPath -PathType Leaf)) {
        return [pscustomobject]@{
            result = 'never-run'
            error = $null
        }
    }
    try {
        return [System.IO.File]::ReadAllText($statusPath) | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "Graphify status is not valid JSON: $statusPath"
    }
}

function Copy-GraphifyBackup {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [scriptblock]$Action
    )

    Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $Source
    Assert-SafeOutputPath -RepositoryRoot $RepositoryRoot -Path $Destination -ExpectedType Directory -AllowMissing
    if ($null -ne $Action) {
        & $Action $Source $Destination
    }
    else {
        Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
    }
    Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $Destination
}

function Restore-GraphifyDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][bool]$Existed,
        [Parameter(Mandatory = $true)][string]$BackupPath,
        [scriptblock]$MoveAction,
        [scriptblock]$CopyAction
    )

    $candidate = $BackupPath + '.rollback'
    $quarantine = $BackupPath + '.quarantine'
    foreach ($recoveryPath in @($candidate, $quarantine)) {
        Assert-SafeOutputPath -RepositoryRoot $RepositoryRoot -Path $recoveryPath -ExpectedType Directory -AllowMissing
        if (Test-Path -LiteralPath $recoveryPath) {
            throw "Graphify recovery path already exists: $recoveryPath"
        }
    }

    $moveDirectory = {
        param([string]$Source, [string]$Destination)
        if ($null -ne $MoveAction) {
            & $MoveAction $Source $Destination
        }
        else {
            Move-Item -LiteralPath $Source -Destination $Destination
        }
    }
    $copyDirectory = {
        param([string]$Source, [string]$Destination)
        if ($null -ne $CopyAction) {
            & $CopyAction $Source $Destination
        }
        else {
            Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
        }
    }

    if (-not $Existed) {
        if (Test-Path -LiteralPath $Path) {
            Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $Path
            & $moveDirectory $Path $quarantine
        }
        return
    }
    if (-not (Test-Path -LiteralPath $BackupPath -PathType Container)) {
        throw "Required Graphify backup is missing: $BackupPath"
    }
    Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $BackupPath

    $canonicalMoved = $false
    $candidateReady = $false
    try {
        & $copyDirectory $BackupPath $candidate
        Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $candidate
        $candidateReady = $true
        if (Test-Path -LiteralPath $Path) {
            Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $Path
            & $moveDirectory $Path $quarantine
            $canonicalMoved = $true
        }
        & $moveDirectory $candidate $Path
        Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $Path
        if ($canonicalMoved -and (Test-Path -LiteralPath $quarantine)) {
            Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $quarantine
            Remove-Item -LiteralPath $quarantine -Recurse -Force
        }
    }
    catch {
        $restoreError = $_
        if (-not $canonicalMoved -and (Test-Path -LiteralPath $Path)) {
            Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $Path
            & $moveDirectory $Path $quarantine
            $canonicalMoved = $true
        }
        if ($canonicalMoved) {
            $failedCandidate = $BackupPath + '.failed'
            Assert-SafeOutputPath -RepositoryRoot $RepositoryRoot -Path $failedCandidate -ExpectedType Directory -AllowMissing
            if (Test-Path -LiteralPath $Path) {
                & $moveDirectory $Path $failedCandidate
            }
            $recoverySource = if ($candidateReady) { $candidate } else { $BackupPath }
            try {
                & $copyDirectory $recoverySource $Path
            }
            catch {
                & $moveDirectory $BackupPath $Path
            }
            Assert-SafeOutputTree -RepositoryRoot $RepositoryRoot -Path $Path
        }
        throw $restoreError
    }
}

function Invoke-GraphifySync {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [scriptblock]$StagingAction,
        [scriptblock]$ProcessAction,
        [scriptblock]$MutexAction,
        [scriptblock]$DirectoryMoveAction,
        [scriptblock]$DirectoryCopyAction,
        [scriptblock]$StatusWriteAction,
        [scriptblock]$SetupAction
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    if (-not (Test-Path -LiteralPath $repository -PathType Container)) {
        throw "Repository root does not exist: $repository"
    }
    $mutexHandle = if ($null -ne $MutexAction) { & $MutexAction } else { Enter-GraphifyMutex }
    if ($null -eq $mutexHandle -or -not $mutexHandle.Acquired) {
        if ($null -ne $mutexHandle) {
            Exit-GraphifyMutex -Handle $mutexHandle
        }
        return [pscustomobject]@{
            result = 'success'
            alreadyRunning = $true
            error = $null
        }
    }

    try {
        $start = [DateTimeOffset]::UtcNow
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $graphOut = Join-Path $repository 'graphify-out'
        $graphPath = Join-Path $graphOut 'graph.json'
        $reportPath = Join-Path $graphOut 'GRAPH_REPORT.md'
        $statusPath = Join-Path $graphOut 'status.json'
        $generatedPath = Join-Path $repository 'generated\graphify'
        $stagingPath = Join-Path $repository '.tmp\graphify-input'
        $backupRoot = Join-Path $repository ('.tmp\graphify-sync-' + [guid]::NewGuid().ToString('N'))
        $graphBackup = Join-Path $backupRoot 'graphify-out'
        $generatedBackup = Join-Path $backupRoot 'generated-graphify'
        $graphOutExisted = $false
        $generatedExisted = $false
        $backupsReady = $false
        $removeBackupRoot = $true
        $stagingResult = $null
        $validation = $null
        $operationError = $null
        $status = $null
        $lastSuccess = $null
        $generatedRoot = Join-Path $repository 'generated'
        $temporaryRoot = Join-Path $repository '.tmp'
        foreach ($outputDirectory in @($graphOut, $generatedRoot, $generatedPath, $temporaryRoot, $backupRoot)) {
            Assert-SafeOutputPath -RepositoryRoot $repository -Path $outputDirectory -ExpectedType Directory -AllowMissing
        }
        foreach ($outputFile in @($graphPath, $reportPath, $statusPath)) {
            Assert-SafeOutputPath -RepositoryRoot $repository -Path $outputFile -ExpectedType File -AllowMissing
        }

        if (Test-Path -LiteralPath $statusPath -PathType Leaf) {
            try {
                $priorStatus = [System.IO.File]::ReadAllText($statusPath) | ConvertFrom-Json -ErrorAction Stop
                $priorNodes = Get-PreviousGraphCount -State $priorStatus -Name 'nodes'
                $priorEdges = Get-PreviousGraphCount -State $priorStatus -Name 'edges'
                if ($priorNodes -gt 0 -or $priorEdges -gt 0) {
                    $lastSuccess = [pscustomobject]@{ nodes = [long]$priorNodes; edges = [long]$priorEdges }
                }
            }
            catch {
                $lastSuccess = $null
            }
        }
        if ($null -ne $SetupAction) {
            & $SetupAction
        }

        $stagingResult = if ($null -ne $StagingAction) {
            & $StagingAction $repository
        }
        else {
            New-StagingTree -RepositoryRoot $repository
        }

        if (-not (Test-Path -LiteralPath $temporaryRoot -PathType Container)) {
            New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
        }
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $temporaryRoot -ExpectedType Directory
        New-Item -ItemType Directory -Path $backupRoot | Out-Null
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $backupRoot -ExpectedType Directory
        $graphOutExisted = Test-Path -LiteralPath $graphOut -PathType Container
        $generatedExisted = Test-Path -LiteralPath $generatedPath -PathType Container
        if ($graphOutExisted) {
            Copy-GraphifyBackup -RepositoryRoot $repository -Source $graphOut -Destination $graphBackup -Action $DirectoryCopyAction
        }
        if ($generatedExisted) {
            Copy-GraphifyBackup -RepositoryRoot $repository -Source $generatedPath -Destination $generatedBackup -Action $DirectoryCopyAction
        }
        $backupsReady = $true

        $environment = @{
            GRAPHIFY_OUT = $graphOut
            GRAPHIFY_QUERY_LOG_DISABLE = '1'
        }
        $hadGraph = Test-Path -LiteralPath $graphPath -PathType Leaf
        $graphArguments = if ($hadGraph) {
            @('update', $stagingPath, '--force')
        }
        else {
            @('extract', $stagingPath, '--out', $repository, '--code-only')
        }
        $graphResult = if ($null -ne $ProcessAction) {
            & $ProcessAction $graphArguments $environment
        }
        else {
            Invoke-GraphifyProcess -Arguments $graphArguments -Environment $environment
        }
        $graphWarning = Assert-GraphifyProcessResult -Result $graphResult -Operation 'Graphify graph build'

        $clusterWarning = $null
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $reportPath -ExpectedType File -AllowMissing
        if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
            $clusterArguments = @('cluster-only', $repository, '--graph', $graphPath, '--no-viz', '--no-label')
            $clusterResult = if ($null -ne $ProcessAction) {
                & $ProcessAction $clusterArguments $environment
            }
            else {
                Invoke-GraphifyProcess -Arguments $clusterArguments -Environment $environment
            }
            $clusterWarning = Assert-GraphifyProcessResult -Result $clusterResult -Operation 'Graphify clustering'
        }

        $previousStatePath = if ($graphOutExisted) { Join-Path $graphBackup 'status.json' } else { $statusPath }
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $reportPath -ExpectedType File
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $graphPath -ExpectedType File
        $validation = Test-GraphArtifact -GraphPath $graphPath -PreviousStatePath $previousStatePath
        $null = Initialize-GraphifyOrphanedExportRecovery -RepositoryRoot $repository -GeneratedPath $generatedPath
        $exportArguments = @('export', 'obsidian', '--graph', $graphPath, '--dir', $generatedPath)
        $exportResult = if ($null -ne $ProcessAction) {
            & $ProcessAction $exportArguments $environment
        }
        else {
            Invoke-GraphifyProcess -Arguments $exportArguments -Environment $environment
        }
        $exportWarning = Assert-GraphifyProcessResult -Result $exportResult -Operation 'Graphify Obsidian export'
        $manifestPath = Join-Path $generatedPath '.graphify_obsidian_manifest.json'
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
            throw 'Graphify Obsidian export is missing required artifact: .graphify_obsidian_manifest.json'
        }
        $null = Test-GraphifyObsidianManifest -RepositoryRoot $repository -GeneratedPath $generatedPath

        $canvasPath = Join-Path $generatedPath 'graph.canvas'
        Assert-SafeOutputPath -RepositoryRoot $repository -Path $canvasPath -ExpectedType File -AllowMissing
        if (Test-Path -LiteralPath $canvasPath -PathType Leaf) {
            Remove-Item -LiteralPath $canvasPath -Force
        }
        Assert-SafeOutputTree -RepositoryRoot $repository -Path $generatedPath

        $stopwatch.Stop()
        $warnings = @()
        foreach ($processWarning in @(
            [pscustomobject]@{ Operation = 'Graphify graph build'; Text = $graphWarning },
            [pscustomobject]@{ Operation = 'Graphify clustering'; Text = $clusterWarning },
            [pscustomobject]@{ Operation = 'Graphify Obsidian export'; Text = $exportWarning }
        )) {
            if (-not [string]::IsNullOrWhiteSpace([string]$processWarning.Text)) {
                $warningText = "$($processWarning.Operation): $($processWarning.Text)"
                if ($warningText.Length -gt 2048) {
                    $warningText = $warningText.Substring(0, 2045) + '...'
                }
                $warnings += $warningText
            }
        }
        $status = [pscustomobject]@{
            startTime = $start.ToString('o')
            endTime = [DateTimeOffset]::UtcNow.ToString('o')
            durationMs = [long]$stopwatch.ElapsedMilliseconds
            webCount = [int]$stagingResult.WebCount
            gsheetCount = [int]$stagingResult.GSheetCount
            nodes = [int]$validation.Nodes
            edges = [int]$validation.Edges
            lastSuccess = [pscustomobject]@{ nodes = [int]$validation.Nodes; edges = [int]$validation.Edges }
            result = 'success'
            error = $null
            warnings = @($warnings)
            alreadyRunning = $false
        }
        if ($null -ne $StatusWriteAction) {
            & $StatusWriteAction $statusPath $status
        }
        else {
            Assert-SafeOutputPath -RepositoryRoot $repository -Path $statusPath -ExpectedType File -AllowMissing
            Write-GraphifyStatus -StatusPath $statusPath -Status $status
        }
        return $status
    }
    catch {
        $operationError = $_
        $restoreErrors = New-Object 'System.Collections.Generic.List[object]'
        if ($backupsReady) {
            foreach ($restore in @(
                [pscustomobject]@{ Path = $graphOut; Existed = $graphOutExisted; Backup = $graphBackup },
                [pscustomobject]@{ Path = $generatedPath; Existed = $generatedExisted; Backup = $generatedBackup }
            )) {
                try {
                    Restore-GraphifyDirectory -RepositoryRoot $repository -Path $restore.Path -Existed $restore.Existed -BackupPath $restore.Backup -MoveAction $DirectoryMoveAction -CopyAction $DirectoryCopyAction
                }
                catch {
                    $removeBackupRoot = $false
                    $restoreErrors.Add($_)
                }
            }
        }
        if ($null -ne $stopwatch -and $stopwatch.IsRunning) {
            $stopwatch.Stop()
        }
        $status = [pscustomobject]@{
            startTime = $start.ToString('o')
            endTime = [DateTimeOffset]::UtcNow.ToString('o')
            durationMs = [long]$stopwatch.ElapsedMilliseconds
            webCount = if ($null -eq $stagingResult) { 0 } else { [int]$stagingResult.WebCount }
            gsheetCount = if ($null -eq $stagingResult) { 0 } else { [int]$stagingResult.GSheetCount }
            nodes = if ($null -eq $validation) { 0 } else { [int]$validation.Nodes }
            edges = if ($null -eq $validation) { 0 } else { [int]$validation.Edges }
            lastSuccess = $lastSuccess
            result = 'error'
            error = $operationError.Exception.Message
            alreadyRunning = $false
        }
        $statusWriteError = $null
        try {
            if ($null -ne $StatusWriteAction) {
                & $StatusWriteAction $statusPath $status
            }
            else {
                Assert-SafeOutputPath -RepositoryRoot $repository -Path $graphOut -ExpectedType Directory -AllowMissing
                Assert-SafeOutputPath -RepositoryRoot $repository -Path $statusPath -ExpectedType File -AllowMissing
                Write-GraphifyStatus -StatusPath $statusPath -Status $status
            }
        }
        catch {
            $statusWriteError = $_.Exception.Message
        }
        if ($restoreErrors.Count -gt 0) {
            throw $restoreErrors[0]
        }
        if ($null -ne $statusWriteError) {
            throw "$($operationError.Exception.Message) Error status write failed: $statusWriteError"
        }
        throw $operationError
    }
    finally {
        try {
            if ($removeBackupRoot -and -not [string]::IsNullOrWhiteSpace([string]$backupRoot) -and (Test-Path -LiteralPath $backupRoot)) {
                Assert-SafeOutputTree -RepositoryRoot $repository -Path $backupRoot
                Remove-Item -LiteralPath $backupRoot -Recurse -Force
            }
        }
        finally {
            Exit-GraphifyMutex -Handle $mutexHandle
        }
    }
}

function Test-GraphifyWatchPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Path,
        [Nullable[bool]]$IsDirectory
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    $candidate = Get-NormalizedPath $Path
    $webRoot = Join-Path $repository 'wcore-web\apps\api'
    $gsheetRoot = Join-Path $repository 'wcore-gsheet\src'
    try {
        $webRelative = Get-RelativePath -BasePath $webRoot -Path $candidate
        $segments = @($webRelative -split '[\\/]')
        $excludedDirectories = @('node_modules', 'dist', 'build', 'coverage', '.next', 'generated', 'out', 'cache', '.cache', '.turbo', '.omc')
        foreach ($segment in $segments) {
            if ($excludedDirectories -contains $segment.ToLowerInvariant()) {
                return $false
            }
        }
        if ($IsDirectory -eq $true -or ($null -eq $IsDirectory -and [string]::IsNullOrEmpty([System.IO.Path]::GetExtension($webRelative)))) {
            $leaf = $segments[$segments.Count - 1]
            return $leaf -notmatch '(?i)^\.env' -and $leaf -notmatch '(?i)^dockerfile' -and $leaf -notmatch '(?i)^docker-compose'
        }
        return Test-WebCorpusPath -RelativePath $webRelative
    }
    catch {
    }
    try {
        $gsheetRelative = Get-RelativePath -BasePath $gsheetRoot -Path $candidate
        $fileName = [System.IO.Path]::GetFileName($gsheetRelative)
        $extension = [System.IO.Path]::GetExtension($gsheetRelative)
        return $IsDirectory -eq $true -or
            ($null -eq $IsDirectory -and [string]::IsNullOrEmpty($extension)) -or
            $extension -ieq '.gs' -or $fileName -ieq 'appsscript.json'
    }
    catch {
        return $false
    }
}

function Test-GraphifyWatchEvent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)]$Event
    )

    if ($Event.PSObject.Properties['ForceSync'] -and [bool]$Event.ForceSync) {
        return $true
    }
    $changeType = [string]$Event.ChangeType
    $isDirectory = if ($Event.PSObject.Properties['IsDirectory']) { $Event.IsDirectory } else { $null }
    if ($null -eq $isDirectory -and ($changeType -ieq 'Deleted' -or $changeType -ieq 'Renamed')) {
        $isDirectory = $true
    }
    foreach ($candidate in @([string]$Event.Path, [string]$Event.OldPath)) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and
            (Test-GraphifyWatchPath -RepositoryRoot $RepositoryRoot -Path $candidate -IsDirectory $isDirectory)) {
            return $true
        }
    }
    return $false
}

function New-GraphifyDebounceState {
    [CmdletBinding()]
    param()

    return [pscustomobject]@{
        Pending = $false
        LastEvent = $null
    }
}

function Add-GraphifyDebounceEvent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][DateTimeOffset]$Timestamp
    )

    return [pscustomobject]@{
        Pending = $true
        LastEvent = $Timestamp
    }
}

function Test-GraphifyDebounceReady {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$State,
        [Parameter(Mandatory = $true)][DateTimeOffset]$Timestamp,
        [int]$QuietPeriodSeconds = 3
    )

    return [bool]$State.Pending -and $null -ne $State.LastEvent -and
        ($Timestamp - [DateTimeOffset]$State.LastEvent).TotalSeconds -ge $QuietPeriodSeconds
}

function Clear-GraphifyDebounceState {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$State)

    return New-GraphifyDebounceState
}

function New-GraphifyFileSystemWatcher {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][System.IO.NotifyFilters]$NotifyFilter,
        [Parameter(Mandatory = $true)][bool]$IncludeSubdirectories,
        [Parameter(Mandatory = $true)][int]$InternalBufferSize
    )

    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = $Root
    $watcher.IncludeSubdirectories = $IncludeSubdirectories
    $watcher.NotifyFilter = $NotifyFilter
    $watcher.InternalBufferSize = $InternalBufferSize
    return $watcher
}

function New-GraphifyWatchOwnerState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Token,
        [Parameter(Mandatory = $true)][int]$WatcherPid,
        [int]$ParentPid = 0,
        [AllowNull()][string]$WatcherStartIdentity,
        [AllowNull()][string]$ParentStartIdentity,
        [Parameter(Mandatory = $true)][DateTimeOffset]$Timestamp,
        [bool]$Syncing = $false,
        [Nullable[DateTimeOffset]]$SyncStartedUtc
    )

    return [pscustomobject]@{
        token = $Token
        watcherPid = $WatcherPid
        parentPid = $ParentPid
        watcherStartIdentity = $WatcherStartIdentity
        parentStartIdentity = $ParentStartIdentity
        heartbeat = $Timestamp.ToString('o')
        syncing = $Syncing
        syncStartedUtc = if ($null -eq $SyncStartedUtc) { $null } else { ([DateTimeOffset]$SyncStartedUtc).ToString('o') }
    }
}

function Get-GraphifyProcessStartIdentity {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [scriptblock]$ProcessAction
    )

    try {
        $process = if ($null -ne $ProcessAction) { & $ProcessAction $ProcessId } else { Get-Process -Id $ProcessId -ErrorAction Stop }
        if ($null -eq $process) {
            return $null
        }
        if ($null -eq $process.StartTime) {
            return $null
        }
        return $process.StartTime.ToUniversalTime().Ticks.ToString([System.Globalization.CultureInfo]::InvariantCulture)
    }
    catch {
        return $null
    }
}

function Write-GraphifyWatchOwnerState {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$State
    )

    $nextPath = $Path + '.' + $State.token + '.next'
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($nextPath, ($State | ConvertTo-Json -Compress), $utf8)
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            [System.IO.File]::Replace($nextPath, $Path, $null)
        }
        else {
            [System.IO.File]::Move($nextPath, $Path)
        }
    }
    finally {
        if (Test-Path -LiteralPath $nextPath) {
            Remove-Item -LiteralPath $nextPath -Force
        }
    }
}

function Enter-GraphifyWatchLease {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [int]$ParentPid = 0,
        [AllowNull()][string]$ParentStartIdentity
    )

    $mutex = New-Object System.Threading.Mutex($false, 'Local\WCORE.Graphify.Watch')
    $acquired = $false
    try {
        $acquired = $mutex.WaitOne(0)
    }
    catch [System.Threading.AbandonedMutexException] {
        $acquired = $true
    }
    catch {
        $mutex.Dispose()
        throw
    }

    $ownerPath = Join-Path (Get-NormalizedPath $RepositoryRoot) '.tmp\graphify-watch.json'
    $token = [guid]::NewGuid().ToString('N')
    $ownerState = New-GraphifyWatchOwnerState -Token $token -WatcherPid $PID -ParentPid $ParentPid `
        -WatcherStartIdentity (Get-GraphifyProcessStartIdentity -ProcessId $PID) -ParentStartIdentity $ParentStartIdentity `
        -Timestamp ([DateTimeOffset]::UtcNow)
    try {
        if ($acquired) {
            $ownerParent = Split-Path -Parent $ownerPath
            if (-not (Test-Path -LiteralPath $ownerParent -PathType Container)) {
                New-Item -ItemType Directory -Path $ownerParent -Force | Out-Null
            }
            Write-GraphifyWatchOwnerState -Path $ownerPath -State $ownerState
        }
    }
    catch {
        if ($acquired) {
            $mutex.ReleaseMutex()
        }
        $mutex.Dispose()
        throw
    }
    return [pscustomobject]@{
        Acquired = $acquired
        Mutex = $mutex
        OwnerPath = $ownerPath
        ProcessId = $PID
        ParentPid = $ParentPid
        Token = $token
        OwnerState = $ownerState
    }
}

function Update-GraphifyWatchOwnerHeartbeat {
    param(
        [Parameter(Mandatory = $true)]$Lease,
        [Parameter(Mandatory = $true)][DateTimeOffset]$Timestamp,
        [Parameter(Mandatory = $true)][ValidateSet('heartbeat', 'sync-start', 'sync-end')][string]$Mode
    )

    $syncing = if ($Mode -eq 'sync-start') { $true } elseif ($Mode -eq 'sync-end') { $false } else { [bool]$Lease.OwnerState.syncing }
    $syncStartedUtc = if ($Mode -eq 'sync-start') {
        $Timestamp
    }
    elseif ($Mode -eq 'sync-end') {
        $null
    }
    else {
        $existingStart = $Lease.OwnerState.syncStartedUtc
        if ([string]::IsNullOrWhiteSpace([string]$existingStart)) { $null } else { [DateTimeOffset]::Parse([string]$existingStart) }
    }
    $Lease.OwnerState = New-GraphifyWatchOwnerState -Token $Lease.Token -WatcherPid $Lease.ProcessId -ParentPid $Lease.ParentPid `
        -WatcherStartIdentity $Lease.OwnerState.watcherStartIdentity -ParentStartIdentity $Lease.OwnerState.parentStartIdentity `
        -Timestamp $Timestamp -Syncing $syncing -SyncStartedUtc $syncStartedUtc
    Write-GraphifyWatchOwnerState -Path $Lease.OwnerPath -State $Lease.OwnerState
}

function Exit-GraphifyWatchLease {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$Lease,
        [scriptblock]$ReleaseMutexAction,
        [scriptblock]$CleanupMutexAction,
        [scriptblock]$ReadOwnerAction,
        [scriptblock]$DeleteOwnerAction
    )

    if ($null -eq $Lease) {
        return
    }
    $releaseAction = if ($null -ne $ReleaseMutexAction) { $ReleaseMutexAction } else {
        {
            param($CurrentLease)
            if ($CurrentLease.Acquired -and $null -ne $CurrentLease.Mutex) {
                $CurrentLease.Mutex.ReleaseMutex()
                $CurrentLease.Acquired = $false
            }
            if ($null -ne $CurrentLease.Mutex) {
                $CurrentLease.Mutex.Dispose()
            }
        }
    }
    $readAction = if ($null -ne $ReadOwnerAction) { $ReadOwnerAction } else {
        {
            param($Path)
            if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
            try { return [System.IO.File]::ReadAllText($Path) | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
        }
    }
    $deleteAction = if ($null -ne $DeleteOwnerAction) { $DeleteOwnerAction } else {
        { param($Path) Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue }
    }

    $removeMatchingOwner = {
        $owner = & $readAction $Lease.OwnerPath
        if ($null -ne $owner -and [string]$owner.token -ceq [string]$Lease.Token) {
            & $deleteAction $Lease.OwnerPath
        }
    }
    & $releaseAction $Lease
    if ($null -ne $CleanupMutexAction) {
        & $CleanupMutexAction $removeMatchingOwner
        return
    }

    $cleanupMutex = New-Object System.Threading.Mutex($false, 'Local\WCORE.Graphify.Watch')
    $cleanupAcquired = $false
    try {
        try {
            $cleanupAcquired = $cleanupMutex.WaitOne(0)
        }
        catch [System.Threading.AbandonedMutexException] {
            $cleanupAcquired = $true
        }
        if ($cleanupAcquired) {
            & $removeMatchingOwner
        }
    }
    finally {
        if ($cleanupAcquired) {
            $cleanupMutex.ReleaseMutex()
        }
        $cleanupMutex.Dispose()
    }
}

function Test-GraphifyProcessIdentity {
    param(
        [AllowNull()][string]$Expected,
        [AllowNull()][string]$Actual
    )

    if ([string]::IsNullOrWhiteSpace($Actual)) {
        return $false
    }
    if ([string]::IsNullOrWhiteSpace($Expected)) {
        return $true
    }
    return $Expected -ceq $Actual
}

function Invoke-GraphifyWatch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [int]$ParentPid = 0,
        [scriptblock]$WatcherFactory,
        [scriptblock]$EventRegistrationAction,
        [scriptblock]$EventDrainAction,
        [scriptblock]$ClockAction,
        [scriptblock]$SleepAction,
        [scriptblock]$SyncAction,
        [scriptblock]$ProcessExistsAction,
        [scriptblock]$ProcessIdentityAction,
        [scriptblock]$OwnerHeartbeatAction,
        [scriptblock]$LogAction,
        [scriptblock]$LeaseAction,
        [scriptblock]$LeaseReleaseAction
    )

    $repository = Get-NormalizedPath $RepositoryRoot
    $roots = @(
        (Join-Path $repository 'wcore-web\apps\api'),
        (Join-Path $repository 'wcore-gsheet\src')
    )
    $notifyFilter = [System.IO.NotifyFilters]::FileName -bor
        [System.IO.NotifyFilters]::DirectoryName -bor
        [System.IO.NotifyFilters]::LastWrite -bor
        [System.IO.NotifyFilters]::CreationTime
    $internalBufferSize = 32768
    $watcherAction = if ($null -ne $WatcherFactory) { $WatcherFactory } else {
        { param($Root, $Filter, $Recursive, $BufferSize) New-GraphifyFileSystemWatcher -Root $Root -NotifyFilter $Filter -IncludeSubdirectories $Recursive -InternalBufferSize $BufferSize }
    }
    $registerAction = if ($null -ne $EventRegistrationAction) { $EventRegistrationAction } else {
        { param($Watcher, $EventName, $SourceIdentifier) Register-ObjectEvent -InputObject $Watcher -EventName $EventName -SourceIdentifier $SourceIdentifier }
    }
    $drainAction = if ($null -ne $EventDrainAction) { $EventDrainAction } else {
        {
            param([string[]]$SourceIdentifiers)
            $events = @()
            foreach ($sourceIdentifier in $SourceIdentifiers) {
                foreach ($eventRecord in @(Get-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue)) {
                    if ($sourceIdentifier -match '\.Error\.') {
                        $events += [pscustomobject]@{ ChangeType = 'Error'; Path = $null; OldPath = $null; IsDirectory = $null; ForceSync = $true }
                    }
                    else {
                        $eventArguments = $eventRecord.SourceEventArgs
                        $path = [string]$eventArguments.FullPath
                        $oldPath = if ($eventArguments.PSObject.Properties['OldFullPath']) { [string]$eventArguments.OldFullPath } else { $null }
                        $isDirectory = if (-not [string]::IsNullOrWhiteSpace($path) -and (Test-Path -LiteralPath $path)) {
                            Test-Path -LiteralPath $path -PathType Container
                        }
                        else {
                            $null
                        }
                        $events += [pscustomobject]@{
                            ChangeType = [string]$eventArguments.ChangeType
                            Path = $path
                            OldPath = $oldPath
                            IsDirectory = $isDirectory
                            ForceSync = $false
                        }
                    }
                    Remove-Event -EventIdentifier $eventRecord.EventIdentifier -ErrorAction SilentlyContinue
                }
            }
            return $events
        }
    }
    $nowAction = if ($null -ne $ClockAction) { $ClockAction } else { { [DateTimeOffset]::UtcNow } }
    $waitAction = if ($null -ne $SleepAction) { $SleepAction } else { { param($Milliseconds) Start-Sleep -Milliseconds $Milliseconds } }
    $runSyncAction = if ($null -ne $SyncAction) { $SyncAction } else { { param($Root) Invoke-GraphifySync -RepositoryRoot $Root } }
    $identityAction = if ($null -ne $ProcessIdentityAction) { $ProcessIdentityAction } elseif ($null -ne $ProcessExistsAction) {
        throw 'ProcessExistsAction cannot verify PID reuse; inject ProcessIdentityAction with stable process start identity.'
    }
    else {
        { param($ProcessId) Get-GraphifyProcessStartIdentity -ProcessId $ProcessId }
    }
    $heartbeatAction = if ($null -ne $OwnerHeartbeatAction) { $OwnerHeartbeatAction } else {
        { param($CurrentLease, $Timestamp, $Mode) Update-GraphifyWatchOwnerHeartbeat -Lease $CurrentLease -Timestamp $Timestamp -Mode $Mode }
    }
    $writeLogAction = if ($null -ne $LogAction) { $LogAction } else { { param($ErrorRecord) Write-Warning ([string]$ErrorRecord) } }
    $acquireLeaseAction = if ($null -ne $LeaseAction) { $LeaseAction } else {
        { param($ParentStartIdentity) Enter-GraphifyWatchLease -RepositoryRoot $repository -ParentPid $ParentPid -ParentStartIdentity $ParentStartIdentity }
    }
    $releaseLeaseAction = if ($null -ne $LeaseReleaseAction) { $LeaseReleaseAction } else { { param($Lease) Exit-GraphifyWatchLease -Lease $Lease } }

    $watchers = New-Object 'System.Collections.Generic.List[object]'
    $registrations = New-Object 'System.Collections.Generic.List[object]'
    $sourceIdentifiers = New-Object 'System.Collections.Generic.List[string]'
    $lease = $null
    $reason = 'stopped'
    $parentStartIdentity = if ($ParentPid -ne 0) { & $identityAction $ParentPid } else { $null }
    if ($ParentPid -ne 0 -and [string]::IsNullOrWhiteSpace([string]$parentStartIdentity)) {
        return [pscustomobject]@{ reason = 'parent-exited' }
    }
    try {
        $lease = & $acquireLeaseAction $parentStartIdentity
        if ($null -eq $lease -or -not $lease.Acquired) {
            $reason = 'already-running'
            return [pscustomobject]@{ reason = $reason }
        }
        if ($ParentPid -ne 0 -and -not (Test-GraphifyProcessIdentity -Expected $parentStartIdentity -Actual (& $identityAction $ParentPid))) {
            $reason = 'parent-exited'
            return [pscustomobject]@{ reason = $reason }
        }
        foreach ($root in $roots) {
            if (-not (Test-Path -LiteralPath $root -PathType Container) -and $null -eq $WatcherFactory) {
                throw "Watch root does not exist: $root"
            }
            $watcher = & $watcherAction $root $notifyFilter $true $internalBufferSize
            $watchers.Add($watcher)
            foreach ($eventName in @('Changed', 'Created', 'Deleted', 'Renamed', 'Error')) {
                $sourceIdentifier = 'WCORE.Graphify.Watch.' + $eventName + '.' + [guid]::NewGuid().ToString('N')
                $sourceIdentifiers.Add($sourceIdentifier)
                $registrations.Add((& $registerAction $watcher $eventName $sourceIdentifier))
            }
            $watcher.EnableRaisingEvents = $true
        }

        $debounce = New-GraphifyDebounceState
        while ($true) {
            if ($ParentPid -ne 0 -and -not (Test-GraphifyProcessIdentity -Expected $parentStartIdentity -Actual (& $identityAction $ParentPid))) {
                $reason = 'parent-exited'
                break
            }
            $now = & $nowAction
            try {
                & $heartbeatAction $lease $now 'heartbeat'
            }
            catch {
                & $writeLogAction $_
            }
            foreach ($eventRecord in @(& $drainAction $sourceIdentifiers.ToArray())) {
                if ($null -ne $eventRecord -and (Test-GraphifyWatchEvent -RepositoryRoot $repository -Event $eventRecord)) {
                    $debounce = Add-GraphifyDebounceEvent -State $debounce -Timestamp $now
                }
            }
            $now = & $nowAction
            if (Test-GraphifyDebounceReady -State $debounce -Timestamp $now -QuietPeriodSeconds 3) {
                try {
                    try {
                        & $heartbeatAction $lease $now 'sync-start'
                    }
                    catch {
                        & $writeLogAction $_
                    }
                    try {
                        $syncResult = & $runSyncAction $repository
                        if ($null -ne $syncResult -and $syncResult.PSObject.Properties['alreadyRunning'] -and -not [bool]$syncResult.alreadyRunning) {
                            $debounce = Clear-GraphifyDebounceState -State $debounce
                        }
                        else {
                            $debounce = Add-GraphifyDebounceEvent -State $debounce -Timestamp $now
                        }
                    }
                    catch {
                        & $writeLogAction $_
                        $debounce = Add-GraphifyDebounceEvent -State $debounce -Timestamp $now
                    }
                }
                finally {
                    try {
                        & $heartbeatAction $lease (& $nowAction) 'sync-end'
                    }
                    catch {
                        & $writeLogAction $_
                    }
                }
            }
            & $waitAction 1000
        }
        return [pscustomobject]@{ reason = $reason }
    }
    finally {
        foreach ($watcher in $watchers) {
            $watcher.EnableRaisingEvents = $false
        }
        foreach ($registration in $registrations) {
            if ($null -ne $registration.PSObject.Properties['SourceIdentifier']) {
                Unregister-Event -SourceIdentifier ([string]$registration.SourceIdentifier) -ErrorAction SilentlyContinue
            }
            if ($null -ne $registration.PSObject.Methods['Dispose']) {
                $registration.Dispose()
            }
            elseif ($registration -is [System.Management.Automation.Job]) {
                Remove-Job -Job $registration -Force -ErrorAction SilentlyContinue
            }
        }
        foreach ($watcher in $watchers) {
            if ($null -ne $watcher.PSObject.Methods['Dispose']) {
                $watcher.Dispose()
            }
        }
        if ($null -ne $lease) {
            & $releaseLeaseAction $lease
        }
    }
}

function Get-GraphifyScheduledTaskConfig {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

    $repository = Get-NormalizedPath $RepositoryRoot
    $scriptPath = Join-Path $repository 'scripts\graphify-sync.ps1'
    $executable = Join-Path $PSHOME 'powershell.exe'
    $userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath, 'sync')
    return [pscustomobject]@{
        TaskName = 'WCORE Graphify Sync'
        Executable = $executable
        Arguments = $arguments
        ArgumentString = (@($arguments) | ForEach-Object { ConvertTo-NativeArgument ([string]$_) }) -join ' '
        WorkingDirectory = $repository
        TriggerKinds = @('Logon', 'Hourly')
        RepetitionInterval = [TimeSpan]::FromMinutes(60)
        MultipleInstances = 'IgnoreNew'
        RunLevel = 'Limited'
        UserId = $userId
        RestartCount = 3
        RestartInterval = [TimeSpan]::FromMinutes(1)
    }
}

function New-GraphifyScheduledTaskDefinition {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)]$Config)

    $requiredCommands = @(
        'New-ScheduledTaskAction', 'New-ScheduledTaskTrigger', 'New-ScheduledTaskSettingsSet',
        'New-ScheduledTaskPrincipal', 'New-ScheduledTask'
    )
    $missing = @($requiredCommands | Where-Object { $null -eq (Get-Command $_ -ErrorAction SilentlyContinue) })
    if ($missing.Count -gt 0) {
        throw "Windows ScheduledTasks APIs are unavailable: $($missing -join ', ')"
    }
    try {
        $action = New-ScheduledTaskAction -Execute $Config.Executable -Argument $Config.ArgumentString -WorkingDirectory $Config.WorkingDirectory
        $triggers = @(
            (New-ScheduledTaskTrigger -AtLogOn -User $Config.UserId),
            (New-ScheduledTaskTrigger -Once -At ([DateTime]::Now.AddMinutes(1)) -RepetitionInterval $Config.RepetitionInterval)
        )
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances $Config.MultipleInstances -RestartCount $Config.RestartCount -RestartInterval $Config.RestartInterval
        $principal = New-ScheduledTaskPrincipal -UserId $Config.UserId -LogonType Interactive -RunLevel $Config.RunLevel
        return New-ScheduledTask -Action $action -Trigger $triggers -Settings $settings -Principal $principal
    }
    catch {
        throw "Failed to create WCORE Graphify scheduled task definition with Windows ScheduledTasks APIs: $($_.Exception.Message)"
    }
}

function Install-GraphifyScheduledTask {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [scriptblock]$RegisterAction
    )

    $config = Get-GraphifyScheduledTaskConfig -RepositoryRoot $RepositoryRoot
    $task = New-GraphifyScheduledTaskDefinition -Config $config
    if ($null -ne $RegisterAction) {
        & $RegisterAction $config $task
        return
    }
    Register-ScheduledTask -TaskName $config.TaskName -InputObject $task -Force | Out-Null
}

function Uninstall-GraphifyScheduledTask {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [scriptblock]$GetTaskAction,
        [scriptblock]$UnregisterAction
    )

    $config = Get-GraphifyScheduledTaskConfig -RepositoryRoot $RepositoryRoot
    $installedAction = if ($null -ne $GetTaskAction) {
        & $GetTaskAction $config.TaskName
    }
    else {
        $task = Get-ScheduledTask -TaskName $config.TaskName -ErrorAction Stop
        if (@($task.Actions).Count -ne 1) {
            throw "Refusing to remove task '$($config.TaskName)' because it does not have exactly one action."
        }
        [pscustomobject]@{
            Execute = [string]$task.Actions[0].Execute
            Arguments = [string]$task.Actions[0].Arguments
            WorkingDirectory = [string]$task.Actions[0].WorkingDirectory
        }
    }
    $matches = $null -ne $installedAction -and
        ([string]$installedAction.Execute).Equals($config.Executable, [System.StringComparison]::OrdinalIgnoreCase) -and
        ([string]$installedAction.Arguments).Equals($config.ArgumentString, [System.StringComparison]::OrdinalIgnoreCase) -and
        ([string]$installedAction.WorkingDirectory).Equals($config.WorkingDirectory, [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $matches) {
        throw "Refusing to remove task '$($config.TaskName)' because its action is not the WCORE Graphify sync action."
    }
    if ($null -ne $UnregisterAction) {
        & $UnregisterAction $config.TaskName
    }
    else {
        Unregister-ScheduledTask -TaskName $config.TaskName -Confirm:$false
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $repositoryRoot = Get-NormalizedPath (Split-Path -Parent $PSScriptRoot)
    switch ($Mode) {
        'sync' { Invoke-GraphifySync -RepositoryRoot $repositoryRoot }
        'status' { Get-GraphifyStatus -RepositoryRoot $repositoryRoot }
        'watch' { Invoke-GraphifyWatch -RepositoryRoot $repositoryRoot -ParentPid $ParentPid }
        'install-task' { Install-GraphifyScheduledTask -RepositoryRoot $repositoryRoot }
        'uninstall-task' { Uninstall-GraphifyScheduledTask -RepositoryRoot $repositoryRoot }
    }
}
