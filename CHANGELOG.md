# Changelog

## 0.1.10 (2026-02-20)

### Security Hardening (4-round Opus review)

- **SQL injection prevention** — Centralized VARCHAR[] escaping (`escapeForVarcharArray` in db.ts) strips NUL/control chars, escapes backslashes and quotes; all consumers use shared utilities
- **ILIKE wildcard injection** — Added `ESCAPE '\'` clause with backslash-first escaping order; tests verify `_` and `%` treated as literals
- **INTERVAL bind parameters** — Replaced string interpolation with `(? * INTERVAL '1 day')` bind params across all search queries
- **Embedding literal validation** — Centralized `toEmbeddingLiteral()` with `Number.isFinite()` validation
- **Input validation** — Zod schemas on all POST/PATCH bodies; `clampInt()` on all query params; `parseId()` rejects non-positive IDs; agent name regex on CRUD ops
- **XSS prevention** — HTML entity escaping on sidebar innerHTML (agent_name, agent_type)
- **Optional API auth** — Bearer token (`MIMIR_API_TOKEN`) on all `/api/*` and `/hooks/*` routes; hook.sh, MCP server, VSCode Extension all token-aware
- **Project data isolation** — `project_id` required on all list endpoints (400 if omitted)

### Features

- **Flow Builder** — DB schema (flows table), 5 CRUD API endpoints, Web UI with Mermaid live preview + SVG node click selection, VSCode Extension integration (command + sidebar button)
- **Infinite scroll** — Marks page pagination with auto-load
- **Skills & Curation pages** — Web UI pages for skill browsing and mark curation
- **Swarm improvements** — Auto-kick agents on start, agent polling in UI, tmux socket handling

### Reliability

- **Migration tracking** — `runMigration()` with `_migrations` table replaces bare try-catch; `idempotent` parameter for future non-idempotent migrations
- **Transaction wrapping** — `deleteTask`, `deleteAgent`, `deleteProject` use BEGIN/COMMIT/ROLLBACK with error logging
- **Embedding concurrency** — `embeddingInFlight` Set prevents concurrent writes; properly chained retry with `.finally()` cleanup
- **Timer lifecycle** — Backfill timer explicit `startBackfill()`/`stopBackfill()` instead of module-level setInterval
- **WAL auto-recovery** — Delete `.wal` file on corrupt DB open, retry once
- **Zombie agent reaper** — Periodic cleanup every 10min for agents active > 2hr
- **Token refresh** — VSCode Extension clears cached tokens on network/auth failure

### VSCode Extension

- **Claude Usage dashboard** — OAuth token refresh with cache clearing, typed JSON responses, null usage handling
- **Sidebar hardening** — HTML escaping, stale data clearing on error

### Tests

- 189 tests across 16 files (all passing)
- New `searchObservations` test suite (ILIKE wildcard escaping, type filtering, promoted exclusion)
- Mock fixes with `importOriginal()` + spread for centralized utility functions

## 0.1.6 (2026-02-07)

### Features

- **VSCode Extension on Marketplace** — Published as [Mimir for VSCode](https://marketplace.visualstudio.com/items?itemName=DeeJayL.mimir-vscode)
- **/mimir-agents v2.0** — Discovery + generator skill (scan installed agents/skills/rules, create new agents interactively, auto-update team.md)
- **compress-review skill** — Reviewer-specific output compression
- **GitHub Pages docs site** — [sierradevsec.github.io/mimir](https://sierradevsec.github.io/mimir/) with just-the-docs theme (22 pages)

### Changes

- Simplified `mimir init` — always installs agents/skills/rules (removed `--with-agents` flag)
- Cleaned templates — 2 agents (reviewer, curator), 3 skills, 1 rule
- Removed dead skills (compress-context, session-usage)
- Updated VSCode extension icon (circular dark background, white nodes)
- README reorganized — screenshots to top, Quick Start with Claude Code / VSCode / Development sections

### Docs

- Full documentation site: Getting Started, Guide, Development, Reference
- Stable `docs/installation.md` for existing curl URL compatibility
- API reference, DuckDB schema, hook events, troubleshooting, uninstall guide
