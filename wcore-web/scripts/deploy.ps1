param(
  [ValidateSet("api","web","cex-relay")]
  [string]$Service = "web",
  [switch]$SkipRemoteCheck,
  # Verification uniquement : aucun upload, verrou ou fichier temporaire.
  [switch]$PreflightOnly,
  # Projet Railway attendu — empêche la création implicite d'un nouveau projet.
  [string]$ExpectedProjectId = "cbb16f4a-79c1-46ef-92b2-019c9c9940d7",
  [string]$ExpectedEnvironment = "production"
)

$jsonPath = Join-Path $PSScriptRoot "..\..\railway.json"
$lockPath = Join-Path $PSScriptRoot "..\.deploy.lock"
$ignorePath = Join-Path $PSScriptRoot "..\..\.railwayignore"

# --- Railway link guard (P2-MAINT-WEB-RAILWAY-LINK-MISSING) ---
# Refuse de déployer si le lien Railway n'est pas vérifiable ou ne correspond
# pas au projet/environnement attendu. Ne crée jamais de projet implicitement.
function Assert-RailwayLink {
  param(
    [string]$ExpectedProjectId,
    [string]$ExpectedEnvironment,
    [string]$Service
  )
  # railway status --json renvoie la structure du projet.
  # On vérifie : project.id, que l'environnement existe, que le service existe.
  $statusJson = railway status --json 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $statusJson) {
    Write-Error "Railway non lié : 'railway status --json' a echoue ou n'a rien retourne. Exécutez 'railway link -p <projectId> -e <environment> -s <service>' avant de déployer."
    exit 1
  }
  if ([string]::IsNullOrWhiteSpace($ExpectedProjectId) -or [string]::IsNullOrWhiteSpace($ExpectedEnvironment)) {
    throw "Destination Railway explicite incomplete : deploiement refuse."
  }
  $status = $statusJson | ConvertFrom-Json -ErrorAction Stop
  $actualProjectId = if ($status.id) { $status.id } else { "" }
  $availableEnvironments = @()
  if ($status.environments -and $status.environments.edges) {
    $availableEnvironments = @($status.environments.edges | ForEach-Object { $_.node.name })
  }
  $availableServices = @()
  if ($status.services -and $status.services.edges) {
    $availableServices = @($status.services.edges | ForEach-Object { $_.node.name })
  }

  if (-not $actualProjectId) {
    Write-Error "Impossible de determiner le projet Railway lie (champ 'id' absent). Lien requis."
    exit 1
  }
  if ($actualProjectId -ne $ExpectedProjectId) {
    Write-Error "Projet Railway inattendu : '$actualProjectId' (attendu '$ExpectedProjectId'). Refus de déployer pour eviter la creation d'un projet parasite."
    exit 1
  }
  if ($availableEnvironments -notcontains $ExpectedEnvironment) {
    Write-Error "Environnement '$ExpectedEnvironment' introuvable dans le projet $actualProjectId. Disponibles : $($availableEnvironments -join ', ')."
    exit 1
  }
  if ($availableServices -notcontains $Service) {
    Write-Error "Service '$Service' introuvable dans le projet $actualProjectId. Disponibles : $($availableServices -join ', ')."
    exit 1
  }
  $environments = @($status.environments.edges | Where-Object { $_.node.name -eq $ExpectedEnvironment })
  $services = @($status.services.edges | Where-Object { $_.node.name -eq $Service })
  if ($environments.Count -ne 1 -or $services.Count -ne 1 -or
      -not $environments[0].node.id -or -not $services[0].node.id) {
    throw "Destination Railway incomplete ou ambigue : deploiement refuse."
  }
  Write-Host "Destination Railway verifiee : WCORE / $ExpectedEnvironment / $Service"
  return @{ Project = $actualProjectId; Environment = $environments[0].node.id; Service = $services[0].node.id }
}

$railwayTarget = Assert-RailwayLink -ExpectedProjectId $ExpectedProjectId -ExpectedEnvironment $ExpectedEnvironment -Service $Service
if ($PreflightOnly) {
  Write-Host "Preflight valide : aucun deploiement execute."
  exit 0
}

# Incident 2026-09-02 : un deploy depuis un master local 19 commits behind origin a
# re-remis en prod une regression SKHY (retour au pricing KRX) deja corrigee sur
# origin/master. Garde : exiger que HEAD soit base sur origin/master a jour.
# -SkipRemoteCheck existe pour les deploys hors repo git (CI) et ne doit pas etre
# utilise en local pour contourner une divergence reelle.
if (-not $SkipRemoteCheck) {
  git fetch origin master 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Error "git fetch origin master a echoue - impossible de verifier que HEAD est a jour. Corrige le depot ou passe -SkipRemoteCheck explicitement."
    exit 1
  }
  $aheadBehind = git rev-list --left-right --count "origin/master...HEAD" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $aheadBehind) {
    Write-Error "HEAD n'est pas ratache a origin/master (detached/worktree?). Verifie la branche avant de deployer."
    exit 1
  }
  $parts = $aheadBehind.Trim() -split '\s+'
  $behind = [int]$parts[0]
  $ahead  = [int]$parts[1]
  if ($behind -gt 0) {
    Write-Error "master local est $behind commits DERRIERE origin/master (et $ahead devant). Deployer ecraserait les fixes deja en prod. Faire d'abord: git pull --rebase (ou merge), re-tester, puis re-deployer."
    exit 1
  }
  Write-Host "Remote check OK: HEAD = origin/master +$ahead commits locaux."
}

# Prevent concurrent deploys from racing on railway.json (documented incident 2026-05-19).
if (Test-Path $lockPath) {
  $lockAge = (Get-Date) - (Get-Item $lockPath).LastWriteTime
  if ($lockAge.TotalMinutes -lt 30) {
    Write-Error "Deploy lock exists ($lockPath, age=$($lockAge.TotalMinutes.ToString('F0'))min). Another deploy may be in progress. Remove the lock file manually if this is stale."
    exit 1
  }
  Write-Warning "Stale deploy lock found ($($lockAge.TotalMinutes.ToString('F0'))min old), removing."
  Remove-Item $lockPath -Force
}
New-Item -ItemType File -Path $lockPath -Force | Out-Null

$original = Get-Content -LiteralPath $jsonPath -Raw
# All three services build from the repo root, so railway.json must always be pinned to the
# right Dockerfile. Leaving it on another service's Dockerfile is how a service ends up
# serving the wrong app (documented incident 2026-05-19).
$dockerfile = switch ($Service) {
  "web"       { "wcore-web/apps/web/Dockerfile.railway" }
  "api"       { "wcore-web/apps/api/Dockerfile.railway" }
  "cex-relay" { "wcore-gsheet/railway-relay/Dockerfile" }
}

# watchPatterns must be pinned per service too, not just the Dockerfile.
# The committed value is scoped to the web image, so `railway up --service api` answered
# "no changes detected in watch paths, build will skip" and returned success while
# deploying nothing (incident 2026-08-03: an entire security release was skipped this
# way). Each list must cover every path the matching Dockerfile copies.
$watchPatterns = switch ($Service) {
  "web" { @(
    "railway.json",
    "wcore-gsheet/dist/**",
    "wcore-web/package.json",
    "wcore-web/pnpm-lock.yaml",
    "wcore-web/pnpm-workspace.yaml",
    "wcore-web/tsconfig.base.json",
    "wcore-web/packages/shared/**",
    "wcore-web/packages/core/**",
    "wcore-web/apps/web/**"
  ) }
  "api" { @(
    "railway.json",
    "wcore-gsheet/dist/**",
    "wcore-web/package.json",
    "wcore-web/pnpm-lock.yaml",
    "wcore-web/pnpm-workspace.yaml",
    "wcore-web/tsconfig.base.json",
    "wcore-web/packages/shared/**",
    "wcore-web/packages/core/**",
    "wcore-web/packages/db/**",
    "wcore-web/apps/api/**"
  ) }
  "cex-relay" { @(
    "railway.json",
    "wcore-gsheet/railway-relay/**"
  ) }
}

# The archive uploaded by `railway up` IS the Docker build context. Shipping paths that
# the selected Dockerfile never COPYs wasted 15x the bytes and made the upload exceed the
# CLI request timeout on a slow uplink (incident 2026-08-02, ~0.8 Mbps up, 31.6 MiB sent
# for a 2 MiB API context). Keep these lists in sync with the two Dockerfile.railway files.
$ignoreLines = @(
  "# Auto-generated by deploy.ps1 for service '$Service'. Removed after the deploy.",
  "docs/",
  ".github/",
  ".git/",
  ".obsidian/",
  ".tmp/",
  ".generated/",
  "graphify-out/",
  "**/node_modules/",
  "wcore-gsheet/docs/",
  "wcore-gsheet/pulls/",
  "wcore-gsheet/src/"
)
$ignoreLines += switch ($Service) {
  # apps/web is 24 MiB of public assets and is never COPYd by the API Dockerfile.
  "api"       { @("wcore-web/apps/web/", "wcore-web/docs/", "wcore-web/contracts/", "wcore-gsheet/railway-relay/") }
  # The web image copies app/components/hooks/lib/public only: tests never ship.
  "web"       { @("wcore-web/apps/api/", "wcore-web/docs/", "wcore-web/contracts/", "wcore-web/apps/web/__tests__/", "wcore-web/apps/web/e2e/", "wcore-gsheet/railway-relay/") }
  # The relay image only COPYs wcore-gsheet/railway-relay: nothing from wcore-web is needed.
  "cex-relay" { @("wcore-web/", "wcore-gsheet/dist/") }
}

$hadIgnore = Test-Path -LiteralPath $ignorePath
$originalIgnore = if ($hadIgnore) { Get-Content -LiteralPath $ignorePath -Raw } else { $null }

$deployExitCode = 0
try {
  $config = $original | ConvertFrom-Json
  # Add-Member -Force rather than direct assignment: watchPatterns may be absent.
  $config.build | Add-Member -NotePropertyName dockerfilePath -NotePropertyValue $dockerfile -Force
  $config.build | Add-Member -NotePropertyName watchPatterns -NotePropertyValue $watchPatterns -Force
  Set-Content -LiteralPath $jsonPath -Value ($config | ConvertTo-Json -Depth 10) -NoNewline
  Set-Content -LiteralPath $ignorePath -Value ($ignoreLines -join "`n") -NoNewline

  railway up (Join-Path $PSScriptRoot "..\..") --path-as-root --project $railwayTarget.Project --environment $railwayTarget.Environment --service $railwayTarget.Service --ci
  $deployExitCode = $LASTEXITCODE
} finally {
  Set-Content -LiteralPath $jsonPath -Value $original -NoNewline
  if ($hadIgnore) {
    Set-Content -LiteralPath $ignorePath -Value $originalIgnore -NoNewline
  } else {
    Remove-Item -LiteralPath $ignorePath -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
}
if ($deployExitCode -ne 0) { exit $deployExitCode }
