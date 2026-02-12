# Changelog

## 0.1.6 (2026-02-07)

### Features

- **VSCode Extension on Marketplace** — Published as [clnode for VSCode](https://marketplace.visualstudio.com/items?itemName=DeeJayL.clnode-vscode)
- **/clnode-agents v2.0** — Discovery + generator skill (scan installed agents/skills/rules, create new agents interactively, auto-update team.md)
- **compress-review skill** — Reviewer-specific output compression
- **GitHub Pages docs site** — [sierradevsec.github.io/clnode](https://sierradevsec.github.io/clnode/) with just-the-docs theme (22 pages)

### Changes

- Simplified `clnode init` — always installs agents/skills/rules (removed `--with-agents` flag)
- Cleaned templates — 2 agents (reviewer, curator), 3 skills, 1 rule
- Removed dead skills (compress-context, session-usage)
- Updated VSCode extension icon (circular dark background, white nodes)
- README reorganized — screenshots to top, Quick Start with Claude Code / VSCode / Development sections

### Docs

- Full documentation site: Getting Started, Guide, Development, Reference
- Stable `docs/installation.md` for existing curl URL compatibility
- API reference, DuckDB schema, hook events, troubleshooting, uninstall guide
