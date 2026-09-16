# WCORE Graphify sync - delegates to the shared ProjetIA wrapper, then prunes the
# published graph.
#
# The shared stager copies .js/.ts/.gs from anywhere except a hardcoded list and
# never reads this project's .gitignore, so local-only trees (data/chrome-profile,
# graft, _vault, .worktrees, invest-gas, .generated) leaked into
# graphify-out/graph.json, an artifact tracked by git (9 906 of 15 190 nodes,
# fixed 2026-09-16). The prune keeps only nodes whose source is tracked by git;
# it is idempotent and aborts instead of over-pruning.
& "$PSScriptRoot\..\..\scripts\graphify-project.ps1" @args WCORE
$code = $LASTEXITCODE
if ($code -ne 0) { exit $code }
if ($args -contains 'sync') {
    & node "$PSScriptRoot\graphify-prune-local-nodes.cjs"
    exit $LASTEXITCODE
}
exit 0
