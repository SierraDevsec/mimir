# Mimir — Claude Code Swarm Intelligence Plugin

**Persona**: Mimir is the main session manager for this project — named by the user.
Acts as the orchestrator that manages all sessions, agents, and shared knowledge.

Mimir adds swarm coordination to Claude Code using hooks, DuckDB, and self-marking.
Agents share context through a local daemon — when Agent B starts, it automatically
receives Agent A's results and marks via `additionalContext`. The Leader stays lean,
only making high-level decisions instead of carrying every intermediate result.

## Architecture

```
Claude Code Session
├── Agent A starts  ──→  hook ──→  mimir daemon ──→  DuckDB (store)
├── Agent A stops   ──→  hook ──→  mimir daemon ──→  DuckDB (save summary)
├── Agent B starts  ──→  hook ──→  mimir daemon ──→  DuckDB (read A's results)
│                                       └──→ stdout: additionalContext
└── Leader only sees final reports — context stays minimal
```

## Tech Stack

- **Runtime**: Node.js v22, TypeScript, ESM (type: module)
- **Server**: Hono + @hono/node-server + @hono/node-ws
- **DB**: DuckDB (duckdb-async) — `data/mimir.duckdb`
- **CLI**: commander.js
- **Web UI**: React 19 + Vite 7 + TailwindCSS 4 + react-icons
- **MCP**: mimir-messaging server (messaging + self-marking + Progressive Disclosure)
- **Test**: Vitest
- **Package Manager**: pnpm

## Directory Structure

```
src/
  cli/index.ts            — CLI entry (mimir start/stop/init/status/ui/logs)
  hooks/hook.sh           — stdin→stdout hook script (jq + curl)
  server/
    index.ts              — Hono server (port 3100)
    db.ts                 — DuckDB connection + schema init
    routes/
      hooks.ts            — POST /hooks/:event (8 event handlers)
      api.ts              — GET/PATCH/DELETE /api/* (REST API)
      ws.ts               — WebSocket broadcast
    services/
      project.ts          — Project registration
      session.ts          — Session lifecycle
      agent.ts            — Agent lifecycle + context_summary
      context.ts          — Context entries (entry_type, content, tags[])
      filechange.ts       — File change tracking (Edit/Write)
      task.ts             — Task state tracking (6-stage)
      comment.ts          — Task comments CRUD
      activity.ts         — Activity log (details JSON)
      intelligence.ts     — Smart context injection (9 stages)
      observation-store.ts — DuckDB CRUD for marks + markAsPromoted()
      queries/
        relevantMarks.ts  — Sibling + project + file-based mark queries
  mcp/
    server.ts             — MCP server (7 tools: messaging + marks + promotion)
  web/                    — React SPA (Agents, Tasks, Activity, Observations)
    components/Layout.tsx — embed mode (?embed=true): hides sidebar
    lib/ProjectContext.tsx — URL ?project=<id> for project selection
vscode-extension/         — VSCode/Cursor Extension (standalone package)
templates/
  hooks-config.json       — Hooks config template
  agents/                 — mimir-curator, mimir-reviewer
  agent-memory/           — Seed MEMORY.md files
  skills/                 — compress-output, compress-review, self-mark, mimir-agents
  rules/                  — Swarm rules (team.md)
```

## DuckDB Schema (15 tables)

### Core Tables
- **projects**: id, name, path (UNIQUE), created_at
- **sessions**: id, project_id, started_at, ended_at, status
- **agents**: id, session_id, agent_name, agent_type, parent_agent_id, status, started_at, completed_at, context_summary, input_tokens, output_tokens
- **context_entries**: id, session_id, agent_id, entry_type, content, tags[], created_at
- **file_changes**: id, session_id, agent_id, file_path, change_type, created_at
- **tasks**: id, project_id, title, description, status, assigned_to, tags[], created_at, updated_at
- **task_comments**: id, task_id, author, comment_type, content, created_at
- **activity_log**: id, session_id, agent_id, event_type, details JSON, created_at
- **messages**: id, project_id, from_name, to_name, content, priority, status, created_at
- **agent_registry**: agent_name, project_id (composite PK), tmux pane mapping
- **tmux_sessions**: session_name (PK), project_id
- **tmux_panes**: id, session_name, agent_name

### Mark Tables
- **observations**: agent self-marks (type: warning/decision/discovery/note, title, concepts[], files_read[], files_modified[], promoted_to)
- **session_summaries**: id, session_id, agent_id, project_id, request, investigated, learned, completed, next_steps, files_read[], files_modified[], notes, created_at

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
mimir start            # Start daemon (background)
mimir stop             # Stop daemon
mimir status           # Show active sessions/agents
mimir init [path]      # Install hooks + agents/skills/rules + register project
mimir ui               # Open Web UI in browser
mimir logs [-n N] [-f] # View daemon logs
```

## Development Commands

```bash
pnpm dev          # Dev server with tsx
pnpm build        # TypeScript + Vite build
pnpm test         # Run tests
pnpm test:watch   # Watch mode
```

## Important Notes

- Use `now()` instead of `current_timestamp` in DuckDB
- DuckDB `COUNT(*)` returns BigInt — wrap with `Number()`
- DuckDB VARCHAR[] needs literal construction, not bind params
- hook.sh exits 0 even on failure (never blocks Claude Code)
- hook.sh has 3s curl timeout, requires `jq`
- Hook body field names are **snake_case**: `session_id`, `agent_id`, `agent_type`, `parent_agent_id`
- Server port: env var `MIMIR_PORT` (default 3100)
- DuckDB WAL corruption on force kill — delete `.wal` file to recover (uncommitted data lost)
- **WAL repeated corruption**: If MCP server is writing to DB when daemon is killed, WAL gets corrupted. Use graceful shutdown (`mimir stop`) instead of `pkill`
- **Daemon background execution**: Bash `&` dies when shell exits — always use `mimir start` (internally `spawn` + `detached: true`)
- **After clnode→mimir rename**: If daemon is still running from old `clnode/` path, `dist/web` static file path mismatch causes SPA 404. Restart daemon required
- **Cursor extension install**: `code --install-extension` only installs to VSCode. Cursor needs `cursor --install-extension` separately

## Self-Marking System

Agents mark important discoveries during work using the preloaded `self-mark` skill.

### Mechanism

- **MCP tool** (`save_observation`): Available in Agent Teams / tmux sessions
- **curl fallback** (`POST /api/observations`): For Task tool subagents (MCP unavailable)
- Agents try MCP first, fall back to curl automatically

### Mark Categories

| Type | When | Example |
|------|------|---------|
| `warning` | Gotcha, trap, unexpected behavior | "DuckDB BigInt needs Number() wrap" |
| `decision` | Chose A over B with reason | "Hono over Express: SSE streaming" |
| `discovery` | Learned something undocumented | "hook.sh has 3s curl timeout" |
| `note` | Other useful context | "container-type required for @container" |

**Do NOT mark**: what code does (code says it), how it works (code shows it), routine changes (git tracks it).

### How Marks Are Surfaced

```
SubagentStart hook → buildSmartContext()
  Stage 8: Sibling marks (same session, max 5) → "## Team Marks"
  Stage 9: RAG-based cross-session marks (max 5) → "## Past Marks"
           Agent context (name + type + task titles) → embedding → cosine similarity
           Fallback: file-based + project marks (if RAG unavailable)
  → injected as additionalContext (6000 char budget)

UserPromptSubmit hook → buildPromptContext()
  getProjectMarks(projectId, sessionId, 5) → "## Past Marks"
  → only title shown (truncated), ORDER BY created_at DESC
```

Promoted marks (`promoted_to IS NOT NULL`) are excluded from injection.

### Push vs Pull Strategy

Marks use two retrieval modes: **push** (auto-injected) and **pull** (agent-initiated search).
Both use RAG (Cloudflare bge-m3 embedding + DuckDB cosine similarity) when available.

**Push (injection)** — context-relevant, auto-injected:
- Stage 9: agent context → embedding → cosine similarity → TOP 5 relevant marks
- Semantic relevance replaces naive recency ordering
- Fallback: file-based + project marks (ILIKE) when RAG unavailable

**Pull (active search)** — on-demand, semantic:
- Agents call `search_observations` MCP tool → query embedding → cosine similarity
- Falls back to ILIKE if embedding unavailable
- No limit — returns full results ranked by relevance

**When agents should pull** (add to self-mark skill or rules):

| Timing | Trigger | Example |
|--------|---------|---------|
| Before starting a task | Search task keywords | `search("observation WAL persistence")` |
| Before modifying a file | Search file path | `search("db.ts")` |
| When hitting an error | Search error keywords | `search("WAL corruption")` |
| When making a decision | Search prior decisions | `search("Hono decision")` |

**Current state**: Push uses RAG (Phase 1 complete), pull tool uses RAG transparently.
**TODO**: Update self-mark skill with search timing guide (Phase 3).

### Memory Hierarchy

```
Hot  (immediate)   Current session marks → auto-injected via Stage 8
Warm (searchable)  Past session marks → auto-injected via Stage 9 + MCP pull search
Cold (permanent)   Repeated patterns → promoted to rules/ via curator + promote_marks
```

**Promotion rule**: Permanent facts (persona, naming, architecture decisions that never change)
should NOT stay as marks — promote to CLAUDE.md or `rules/`. Marks are for transient knowledge
that may become stale. If it's always true, put it where every session always reads it.

### Observation Persistence (WAL Corruption Defense)

Observations are agent memory — protected with 3-layer durability:

1. **Immediate CHECKPOINT**: After `saveObservation()`, WAL → DB flush (marks are infrequent, no perf impact)
2. **JSON backup**: Every save dumps to `data/observations-backup.json`
3. **Auto restore**: On daemon startup, if observations table is empty and backup file exists, auto-restore

```
saveObservation() → INSERT → CHECKPOINT → backupObservations()
                                    ↓              ↓
                              async embedding   data/observations-backup.json
                              (CF bge-m3)              ↓
                                    ↓         daemon restart → restoreFromBackup()
                              UPDATE embedding              → backfillEmbeddings()
                                                            → ensureHnswIndex()
```

## VSCode Extension (Primary Client)

### Architecture

```
VSCode Extension (HTTP client)
├── Sidebar WebviewView — 3-button nav + Claude Usage bars + Active Agents
├── Editor WebviewPanel — iframe (Agents/Tasks) + custom HTML (Orchestration, Usage)
├── Terminal Manager — Claude CLI + Swarm tmux (Editor area tabs)
├── Status Bar — "mimir: N agents" or "mimir: offline"
└── Auto-Init — installs hooks + registers project on workspace open
     ↓ HTTP/WS
mimir daemon (port 3100)
```

### Key Files

```
vscode-extension/src/
  extension.ts              — activate, 10 commands
  claude-usage.ts           — macOS Keychain OAuth → Anthropic Usage API
  terminal-manager.ts       — Claude/Swarm terminal lifecycle
  sidebar-view.ts           — Sidebar HTML (nav + usage + agents)
  webview/
    panel.ts                — Panel routing (iframe / orchestration / usage)
    orchestration-html.ts   — StatusBar + Chat/Terminal tab HTML
    claude-usage-html.ts    — Account + Usage detail HTML
    html-provider.ts        — iframe HTML (?embed=true)
  api-client.ts             — REST client for daemon
  auto-init.ts              — workspace auto-init
  daemon.ts                 — daemon health + start/stop
  status-bar.ts             — status bar item
```

### Build & Deploy

```bash
cd vscode-extension
pnpm build                                            # esbuild → dist/extension.js (CJS)
pnpm package                                          # vsce package → .vsix
code --install-extension mimir-vscode-*.vsix --force  # Install → Reload Window
```

### Extension Notes

- Use `node dist/server/index.js` for local dev (not `npx mimir start`)
- After Web UI changes: `pnpm build` (root) → restart daemon → rebuild extension → install → reload
- Extension list icon must be PNG (not SVG): convert with `rsvg-convert`
- `acquireVsCodeApi()` can only be called once per webview
- `container-type: inline-size` required for `@container` queries
- CJS output required (`format: 'cjs'`)
- StatuslineUpdate data is in-memory only — daemon restart clears it

## Agent Management

`mimir init` installs two default agents: **mimir-reviewer** (code review) and **mimir-curator** (knowledge curation).

Use `/mimir-agents` skill to discover installed agents/skills/rules or create custom agents.

## Agent Teams Compatibility

Agent Teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) is fully compatible with Mimir.
Teammates fire SubagentStart/SubagentStop hooks — zero code changes needed.

```json
// .claude/settings.local.json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

## Platform Limitations

- **Nested subagents**: NOT WORKING. `Task(agent_type)` in tools frontmatter does not enable Task tool inside subagents.
- **PostToolUse additionalContext**: NOT supported. Cannot inject marks on file read.
- **MCP tools in Task tool subagents**: NOT available. Use curl HTTP fallback.
- **Flat orchestration only**: Leader manages all agents directly. Review-fix loops require Leader relay.

## Known Issues

- Hooks require Claude Code session restart after `mimir init`
- Agent killed by ESC or context limit → SubagentStop not fired → zombie in DB (use Kill button in UI)
- Transcript extraction needs 500ms delay (race condition with file write)
- VSCode Extension requires Reload Window after install

## Swarm Best Practices

- **Agent sizing**: 5-7 files per agent to avoid context exhaustion
- **Don't agent trivial tasks**: 3-line changes should be done by Leader directly
- **Reviewer is worth it**: Always catches type safety, stale data, missing error handling
- **True parallelism**: Requires same-message Task calls (separate messages = sequential)
- **Mimir's sweet spot**: Multi-step chains where Agent B needs Agent A's results
- **Agent Teams for peer-to-peer**: Use when agents need direct coordination
- **Leader context is finite**: All modes accumulate; persist critical state to DB
- **DB over memory files**: Safer for concurrent writes in parallel agent scenarios

## Roadmap

### Mark Improvement (priority order)

**Phase 1 — RAG (Cloudflare bge-m3 + DuckDB vss)** ✅ DONE:
- Embedding: Cloudflare Workers AI `@cf/baai/bge-m3` (free, multilingual, 1024-dim)
- Storage: DuckDB `vss` extension + `embedding FLOAT[1024]` column on observations
- `saveObservation()` → async Cloudflare API embedding → DuckDB UPDATE
- Push (SubagentStart Stage 9): agent context → embedding → cosine similarity → TOP 5 relevant marks
- Pull (search_observations): query → embedding → cosine similarity → ranked results
- Push + Pull both use RAG single pipeline — relevance auto-filters
- Graceful degradation: no Cloudflare key or API fail → ILIKE fallback (zero downtime)
- Backfill: on daemon start, batch embed `WHERE embedding IS NULL` (50/batch)
- HNSW index: auto-created after 10+ embeddings exist
- JSON backup excludes embedding column (too large, regenerable)
- Files: `src/server/services/embedding.ts` (new), `observation-store.ts`, `db.ts`, `intelligence.ts`, `relevantMarks.ts`
- Env: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`

**Phase 2 — Mark lifecycle (resolved status)** ← NEXT:
- Add `status` column to observations: `active` (default) | `resolved`
- `active` marks → push + pull eligible
- `resolved` marks → pull-only (searchable for history, excluded from RAG push)
- Add `resolve_observation` MCP tool (`src/mcp/server.ts`) + API endpoint (`PATCH /api/observations/:id/resolve`)
- Push queries: add `WHERE status = 'active'` to `getRelevantMarksRAG()`, `getProjectMarks()`, `getFileBasedMarks()`, `getSiblingMarks()`
- Files to modify: `db.ts` (migration), `observation-store.ts` (resolveObservation), `relevantMarks.ts` (status filter), `src/mcp/server.ts` (new tool), `src/server/routes/api.ts` (new endpoint)

**Phase 3 — Search skill** (after RAG):
- Add search timing guide to self-mark skill or create dedicated search skill
- Teaches agents when to call `search_observations` (before task, before file edit, on error, on decision)

### Other

- **Curator automation**: Periodic auto-run via cron/hook trigger
