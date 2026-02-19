# Mimir — Claude Code Swarm Intelligence Plugin

**Persona**: Mimir is the main session manager — orchestrates all sessions, agents, and shared knowledge.
Agents share context through a local daemon via `additionalContext`. Leader stays lean, only high-level decisions.

## Architecture

```
Claude Code Session
├── Agent A starts/stops ──→ hook ──→ mimir daemon ──→ DuckDB
├── Agent B starts ──→ hook ──→ daemon ──→ DuckDB (read A's results)
│                                  └──→ stdout: additionalContext
└── Leader only sees final reports
```

## Tech Stack

Node.js v22 · TypeScript 5.9 ESM · Hono 4 · DuckDB (duckdb-async) + vss · Cloudflare bge-m3 RAG (1024-dim) · commander.js 14 · React 19 + Vite 7 + TailwindCSS 4 · @modelcontextprotocol/sdk · zod 4 · Vitest 4 · pnpm 10

## Directory Structure

```
src/
  cli/index.ts            — CLI entry (start/stop/init/status/ui/logs/curate/swarm/mcp)
  hooks/hook.sh           — stdin→stdout hook (jq + curl)
  server/
    index.ts              — Hono server (port 3100)
    db.ts                 — DuckDB connection + schema
    routes/               — hooks.ts, api.ts, ws.ts
    services/             — project, session, agent, context, filechange, task, comment,
                            activity, intelligence, observation-store, embedding, curation,
                            skill, message, notify, registry, statusline, swarm, tmux, flow,
                            usage, slack, queries/relevantMarks
  mcp/server.ts           — MCP server (11 tools: messaging + marks + promotion)
  web/                    — React SPA (Vite, served via VSCode extension webview)
    pages/                — Dashboard, Agents, Context, Tasks, Activity, Swarm,
                            Observations, Skills, Curation, Flows
vscode-extension/         — VSCode/Cursor Extension (standalone package)
.claude/
  init-manifest.json      — Distributable items for mimir init (single source of truth)
  agents/                 — 12 agent definitions
  agent-memory/           — Agent MEMORY.md files (via self-memory skill)
  skills/                 — 15 skills
  rules/                  — team.md, typescript.md, react.md, nodejs.md
```

## DuckDB Schema (16 tables)

**Core**: projects · sessions · agents · context_entries · file_changes · tasks · task_comments · activity_log · messages · agent_registry · tmux_sessions · tmux_panes

**Flow**: flows (id, project_id, name, mermaid_code, metadata JSON)

**Marks**: observations (type, title, concepts[], files_read[], files_modified[], embedding, promoted_to) · session_summaries

tasks has: `flow_id`, `flow_node_id`, `depends_on[]`

## Hook Events

| Event | Purpose |
|-------|---------|
| SessionStart | Register session, link to project |
| SubagentStart | Register agent, return additionalContext (smart context injection) |
| SubagentStop | Finalize agent, extract context_summary from transcript |
| PostToolUse | Track file changes (Edit/Write). **additionalContext NOT supported** |
| UserPromptSubmit | Return project context (active agents, open tasks) |
| TeammateIdle | Track Agent Teams teammate idle state |
| TaskCompleted | Sync shared task completion with mimir tasks |
| RegisterProject | Register project in DB (used by `mimir init`) |

## CLI Commands

```bash
mimir start                        # Start daemon (background, detached)
mimir stop                         # Stop daemon (graceful)
mimir status                       # Show active sessions/agents
mimir init [path]                  # Install hooks + agents/skills/rules + register project
mimir ui                           # Open Web UI in browser
mimir logs [-n N] [-f]             # View daemon logs
mimir curate [--background]        # Run mimir-curator agent
mimir swarm -a "a:opus,b:sonnet"   # Launch multi-agent tmux session
mimir mcp                          # Run MCP server (stdio mode)
```

```bash
pnpm dev / pnpm build / pnpm test / pnpm test:watch
```

## Important Notes

- Use `now()` not `current_timestamp` in DuckDB
- DuckDB `COUNT(*)` returns BigInt — wrap with `Number()`
- DuckDB VARCHAR[] needs literal construction, not bind params
- hook.sh exits 0 even on failure; **5s curl timeout**; requires `jq`
- Hook body field names are **snake_case**: `session_id`, `agent_id`, `agent_type`, `parent_agent_id`
- Server port: env var `MIMIR_PORT` (default 3100)
- **WAL auto-recovery**: on startup, if DB open fails and `.wal` file exists → delete `.wal` + retry (uncommitted data lost). Prefer `mimir stop` over `pkill` to avoid this.
- **Daemon background**: Bash `&` dies on shell exit — `mimir start` uses `spawn` + `detached: true`
- **Cursor extension**: `code --install-extension` → VSCode only; Cursor needs `cursor --install-extension`
- **Data API endpoints require `project_id`** — `/sessions`, `/agents`, `/tasks`, `/activities`, `/stats`, `/flows`, `/messages`, `/observations`, `/registry`, `/skills` etc. return 400 without it. Exception: `/usage/*` endpoints accept optional `project_id` for global analytics.
- **Optional API auth**: set `MIMIR_API_TOKEN` env var to enable Bearer token auth on all `/api/*` and `/hooks/*` routes. Web UI, hook.sh, MCP server, and VSCode Extension all read this env var automatically.

## Self-Marking System

All 12 agents preload `self-mark` + `self-search` + `self-memory` skills.

- **MCP tool** (`save_observation`): Agent Teams / tmux sessions
- **curl fallback** (`POST /api/observations`): Task tool subagents (no MCP available)

| Type | When |
|------|------|
| `warning` | Gotcha, trap, unexpected behavior |
| `decision` | Chose A over B with reason |
| `discovery` | Learned something undocumented |
| `note` | Other useful context |

**Do NOT mark**: what code does, how it works, routine changes (git tracks it).

Marks are **project-scoped**. Injected at SubagentStart: sibling marks (same session) + RAG cross-session marks (cosine similarity). Promoted marks (`promoted_to IS NOT NULL`) excluded from injection.

RAG env: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` — graceful ILIKE fallback if missing.

Memory hierarchy: Hot (current session) → Warm (past sessions, RAG) → Cold (MEMORY.md) → Permanent (rules/).

## VSCode Extension

Sidebar WebviewView + Editor WebviewPanel (iframe) + Terminal Manager + Status Bar + Auto-Init → mimir daemon (port 3100).

Key files: `extension.ts` (12 commands) · `claude-usage.ts` · `terminal-manager.ts` · `sidebar-view.ts` · `webview/panel.ts` · `api-client.ts` · `auto-init.ts` · `daemon.ts`

```bash
cd vscode-extension
pnpm build    # esbuild → dist/extension.js (CJS)
pnpm package  # vsce package → .vsix
code --install-extension mimir-vscode-*.vsix --force  # then Reload Window
```

- Extension icon must be PNG (not SVG) — convert with `rsvg-convert`
- `acquireVsCodeApi()` can only be called once per webview
- `container-type: inline-size` required for `@container` queries
- CJS output required (`format: 'cjs'`)
- StatuslineUpdate data is in-memory only — daemon restart clears it

## Platform Limitations

- **Nested subagents**: NOT WORKING — `Task(agent_type)` in tools frontmatter does not enable Task tool inside subagents
- **PostToolUse additionalContext**: NOT supported — cannot inject marks on file read
- **MCP tools in Task subagents**: NOT available — use curl HTTP fallback
- **Flat orchestration only**: Leader manages all agents directly; review-fix loops require Leader relay

## Known Issues

- Hooks require Claude Code session restart after `mimir init`
- Agent killed (ESC/context limit) → SubagentStop not fired → **auto-reaped within 2 hours** by periodic cleanup (every 10min). Manual Kill button in UI available for immediate cleanup.
- Transcript extraction needs 500ms delay (race condition with file write)
- VSCode Extension requires Reload Window after install

## Production Hardening (applied)

| Area | Mechanism | Details |
|------|-----------|---------|
| Hook reliability | 5s curl timeout + 4.5s server timeout | CF RAG API (2s AbortController) → fallback to ILIKE if slow |
| Zombie agents | Periodic reaper every 10min | Marks agents active > 2hr as completed; boot cleanup clears all zombies |
| WAL recovery | Auto-detect + delete + retry on startup | Uncommitted data lost, but DB always opens cleanly |
| Data isolation | `project_id` required on all list endpoints | 400 returned if omitted — cross-project leakage structurally impossible |
| API security | Optional Bearer token (`MIMIR_API_TOKEN`) | Covers `/api/*`, `/hooks/*`; hook.sh + MCP server + Extension all token-aware |

**Stale agent threshold**: 2 hours (hardcoded). Agents legitimately running > 2hr will be reaped — keep agents sized to 5-7 files per the swarm guidelines.

**Token auth setup** (opt-in, for SSH tunnel / container exposure scenarios):
```bash
# In .env or shell environment
MIMIR_API_TOKEN=your-secret-token
```
All consumers (hook.sh, MCP server, VSCode Extension, Web UI) read this automatically.

## Swarm Best Practices

- **Agent sizing**: 5-7 files per agent to avoid context exhaustion
- **Don't agent trivial tasks**: 3-line changes done by Leader directly
- **Reviewer is worth it**: always catches type safety, stale data, missing error handling
- **True parallelism**: requires same-message Task calls (separate messages = sequential)
- **Leader context is finite**: persist critical state to DB, not memory files
- **DB over memory files**: safer for concurrent writes in parallel agent scenarios

## Agent Management

`mimir init` installs: mimir-curator agent · skills (self-mark, self-search, self-memory, brainstorming, changelog-generator, content-research-writer, mcp-builder, skill-authoring-guide, test-driven-development) · team.md rule · curator MEMORY.md seed

Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) fully compatible — teammates fire SubagentStart/SubagentStop hooks automatically, zero code changes needed.
