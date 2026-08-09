## graphify

Graphify's project-scoped graph path is `K:\ProjetIA\WCORE\graphify-out\graph.json`. `K:\ProjetIA\WCORE\.tmp\graphify-input` is the only extraction corpus.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Use WCORE memory in this order:
1. **Graphify structure first.** For codebase structure, run a targeted `rtk graphify query "<question>" --graph "K:\ProjetIA\WCORE\graphify-out\graph.json"`, `rtk graphify path "<A>" "<B>" --graph "K:\ProjetIA\WCORE\graphify-out\graph.json"`, or `rtk graphify explain "<concept>" --graph "K:\ProjetIA\WCORE\graphify-out\graph.json"`.
2. **Obsidian decisions/history second.** Use the project MCP `obsidian_wcore` by default for WCORE rationale, decisions, plans, or history, then read only the matching note section or line range. Use the inherited global MCP `obsidian` only when the user explicitly requests a cross-project search.
3. **Raw source last.** Use targeted file search and narrow source reads only when the first two layers do not answer the question or source verification is required.

Rules:
- For narrow questions, never read all of `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `ROADMAP.md`, `AGENTS.md`, or `CHANGELOG.md`. Do not broadly crawl Graphify or Obsidian output.
- Keep Graphify operations project-local. Do not use global graphs, install Git hooks, start watchers, or configure an LLM/backend.
- Code-only AST extraction needs no provider extras or API keys. Never request or expose provider keys for it.
- Never run `graphify extract` or `graphify update` directly from the repository root, and never extract `K:\ProjetIA\WCORE` or `.`. `K:\ProjetIA\WCORE\.tmp\graphify-input` is the only extraction corpus.
- Rebuild or refresh only with `npm run graphify:sync`, which becomes available after repository setup in Task 2.
- A manual Obsidian export must use `rtk graphify export obsidian --graph "K:\ProjetIA\WCORE\graphify-out\graph.json" --dir "K:\ProjetIA\WCORE\.generated\graphify"`.

## Cross-project rules

See ../AGENTS.md:
1. **Data property** — collect proprietary data first, store locally
2. **Terminal + Obsidian** — CLI scripts connected to Obsidian MCPs
3. **Wiki & Raw (Karpathy)** — write Raw first, distill to Wiki after
4. **Monthly audit** — 1st of every month, full system audit
5. **No learning loops** — every output verifiable against ground truth
6. **Principle** — never build SEO projects with LLMs without rules 1-5