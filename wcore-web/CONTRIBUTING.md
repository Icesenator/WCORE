# Contributing

## Ground Rules

- Keep changes small and focused. One fix should solve one problem.
- Do not commit secrets, `.env*`, database URLs, API keys, Railway tokens, wallet keys, or provider credentials.
- Do not revert unrelated work in the tree. Other agents or the user may be working at the same time.
- For behavior changes and bug fixes, add the test first and verify it fails before changing production code.
- Chain config source is `../wcore-gsheet/src/*.gs`. Regenerate extracted chain output instead of hand-editing generated dist files.
- Deploy Railway services with `scripts/deploy.ps1 -Service api` or `scripts/deploy.ps1 -Service web`. Do not run bare `railway up` from the repo root.

## Local Workflow

```powershell
pnpm install
pnpm typecheck
pnpm test
```

Use targeted checks while iterating, then run broader checks before a commit. See [TESTING.md](./TESTING.md) for common commands.

## Commit Style

- `fix(api): ...` for backend fixes.
- `fix(web): ...` for frontend fixes.
- `feat(gm): ...` for GM feature work.
- `test(...): ...` for test-focused changes.
- `docs: ...` for documentation-only changes.

Inspect `git status`, `git diff`, and recent commits before committing. Stage only intended files.
