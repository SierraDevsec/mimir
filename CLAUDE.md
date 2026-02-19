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

- **Runtime**: Node.js v22, TypeScript 5.9, ESM (type: module)
- **Server**: Hono 4 + @hono/node-server + @hono/node-ws
- **DB**: DuckDB (duckdb-async) + vss extension (vector similarity)
- **RAG**: Cloudflare Workers AI `@cf/baai/bge-m3` (1024-dim embedding) + DuckDB cosine similarity
- **CLI**: commander.js 14
- **Web UI**: React 19 + Vite 7 + TailwindCSS 4 + react-router-dom 7 + react-icons
- **MCP**: @modelcontextprotocol/sdk (messaging + self-marking + Progressive Disclosure)
- **Validation**: zod 4
- **Test**: Vitest 4
- **Package Manager**: pnpm 10
- **Optional**: @slack/bolt (Slack integration)

## Directory Structure

```
src/
  cli/index.ts            — CLI entry (mimir start/stop/init/status/ui/logs/curate/swarm/mcp)
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
      agent-definition.ts — Agent .md file parsing
      context.ts          — Context entries (entry_type, content, tags[])
      filechange.ts       — File change tracking (Edit/Write)
      task.ts             — Task state tracking (6-stage)
      comment.ts          — Task comments CRUD
      activity.ts         — Activity log (details JSON)
      intelligence.ts     — Smart context injection (4 stages)
      observation-store.ts — DuckDB CRUD for marks + markAsPromoted()
      embedding.ts        — Cloudflare bge-m3 embedding + backfill
      curation.ts         — Curation stats (last_curated, sessions/marks since)
      skill.ts            — Skill file discovery + parsing
      message.ts          — Inter-agent messaging
      notify.ts           — tmux pane notifications
      registry.ts         — Agent registry (tmux pane mapping)
      statusline.ts       — StatuslineUpdate data (in-memory)
      swarm.ts            — Swarm session management
      tmux.ts             — tmux session/pane lifecycle
      flow.ts             — Flow CRUD (mermaid_code + metadata JSON)
      usage.ts            — Claude usage tracking
      slack.ts            — Slack integration (optional)
      queries/
        relevantMarks.ts  — Sibling + project + file-based mark queries
  mcp/
    server.ts             — MCP server (7 tools: messaging + marks + promotion)
  web/                    — React SPA (served via VSCode extension webview)
    components/Layout.tsx — embed mode (?embed=true): hides sidebar
    lib/ProjectContext.tsx — URL ?project=<id> for project selection
    pages/                — Dashboard, Agents, Context, Tasks, Activity, Swarm, Observations, Skills, Curation, Flows
vscode-extension/         — VSCode/Cursor Extension (standalone package)
.claude/
  init-manifest.json      — Distributable items for mimir init (single source of truth)
  agents/                 — 12 agent definitions (backend-dev, frontend-dev, cli-hooks, etc.)
  agent-memory/           — Agent MEMORY.md files (accumulated via self-memory skill)
  skills/                 — 15 skills (self-mark, self-search, self-memory, brainstorming, canvas-design, changelog-generator, content-research-writer, doc-coauthoring, docx, frontend-design, mcp-builder, react-frontend, skill-authoring-guide, test-driven-development, webapp-testing)
  rules/                  — Rules (team.md, typescript.md, react.md, nodejs.md)
```

## DuckDB Schema (16 tables)

### Core Tables
- **projects**: id, name, path (UNIQUE), created_at
- **sessions**: id, project_id, started_at, ended_at, status
- **agents**: id, session_id, agent_name, agent_type, parent_agent_id, status, started_at, completed_at, context_summary, input_tokens, output_tokens
- **context_entries**: id, session_id, agent_id, entry_type, content, tags[], created_at
- **file_changes**: id, session_id, agent_id, file_path, change_type, created_at
- **tasks**: id, project_id, title, description, status, assigned_to, tags[], created_at, updated_at, flow_id, flow_node_id, depends_on[]
- **task_comments**: id, task_id, author, comment_type, content, created_at
- **activity_log**: id, session_id, agent_id, event_type, details JSON, created_at
- **messages**: id, project_id, from_name, to_name, content, priority, status, created_at
- **agent_registry**: agent_name, project_id (composite PK), tmux pane mapping
- **tmux_sessions**: session_name (PK), project_id
- **tmux_panes**: id, session_name, agent_name

### Flow Tables
- **flows**: id, project_id, name, description, status, mermaid_code, metadata (JSON), created_at, updated_at

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
mimir start              # Start daemon (background)
mimir stop               # Stop daemon
mimir status             # Show active sessions/agents
mimir init [path]        # Install hooks + agents/skills/rules + register project
mimir ui                 # Open Web UI in browser
mimir logs [-n N] [-f]   # View daemon logs
mimir curate             # Run mimir-curator agent (interactive)
mimir curate --background  # Run curator in tmux background
mimir swarm -a "a:opus,b:sonnet"  # Launch multi-agent tmux session
mimir mcp                # Run MCP server (stdio mode)
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

Agents mark important discoveries during work using the preloaded `self-mark` skill,
search past marks before starting work using the `self-search` skill,
and persist lasting patterns to MEMORY.md using the `self-memory` skill.

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
  Stage 3: Sibling marks (same session, max 5) → "## Team Marks"
  Stage 4: RAG-based cross-session marks (max 5) → "## Past Marks"
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

**When agents should pull** (taught via `self-search` skill v1.0.0):

| Timing | Trigger | Example |
|--------|---------|---------|
| Before starting a task | Search task keywords | `search("WebSocket reconnection")` |
| Before modifying a file | Search file path | `search("hook.sh")` |
| When hitting an error | Search error keywords | `search("WAL corruption")` |
| When making a decision | Search prior decisions | `search("Hono Express server")` |

**Current state**: Push + Pull both use RAG. Search timing guide in `self-search` skill (Phase 3 complete).

### Memory Hierarchy

```
Hot  (immediate)   Current session marks → auto-injected via Stage 8
Warm (searchable)  Past session marks → auto-injected via Stage 9 + MCP pull search
Cold (persistent)  Lasting patterns → agent MEMORY.md via self-memory skill
Permanent          Repeated patterns → promoted to rules/ via curator + promote_marks
```

**self-memory skill**: Agents update `.claude/agent-memory/{name}/MEMORY.md` before finishing
significant tasks. Captures code patterns, gotchas, and cross-domain dependencies that persist
across sessions. Curator refines and cross-pollinates; agents do the initial capture.

**Promotion rule**: Permanent facts (persona, naming, architecture decisions that never change)
should NOT stay as marks — promote to CLAUDE.md or `rules/`. Marks are for transient knowledge
that may become stale. If it's always true, put it where every session always reads it.

### Observation Persistence

Observations are agent memory — protected by immediate CHECKPOINT:

```
saveObservation() → INSERT → CHECKPOINT (WAL → DB flush)
                                 ↓
                           async embedding (CF bge-m3) → UPDATE embedding
                                 ↓
                           daemon restart → backfillEmbeddings() → ensureHnswIndex()
```

CHECKPOINT after every write ensures no data loss on crash. Embeddings are regenerable via backfill.

## VSCode Extension (Primary Client)

### Architecture

```
VSCode Extension (HTTP client)
├── Sidebar WebviewView — 7-button nav + Claude Usage bars + Active Agents
├── Editor WebviewPanel — iframe (Agents/Tasks/Marks/Skills/Curation/Flows) + custom HTML (Orchestration, Usage)
├── Terminal Manager — Claude CLI + Swarm tmux (Editor area tabs)
├── Status Bar — "mimir: N agents" or "mimir: offline"
└── Auto-Init — installs hooks + registers project on workspace open
     ↓ HTTP/WS
mimir daemon (port 3100)
```

### Key Files

```
vscode-extension/src/
  extension.ts              — activate, 12 commands
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

`mimir init` installs items listed in `.claude/init-manifest.json`:
- **Agent**: mimir-curator (knowledge curation)
- **Skills**: self-mark, self-search, self-memory, brainstorming, changelog-generator, content-research-writer, mcp-builder, skill-authoring-guide, test-driven-development
- **Rules**: team.md
- **Memory**: mimir-curator seed MEMORY.md

All 12 project agents preload: `self-mark` + `self-search` + `self-memory`.

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

## Completed Milestones

### Knowledge System (all phases complete)

| Phase | Feature | Key Files |
|-------|---------|-----------|
| 1. RAG | Cloudflare bge-m3 embedding + DuckDB vss cosine similarity | `embedding.ts`, `observation-store.ts`, `relevantMarks.ts` |
| 2. Lifecycle | `active`/`resolved` status on marks (resolved = pull-only) | `observation-store.ts`, `relevantMarks.ts` |
| 3. Search | `self-search` skill — agents pull past marks before acting | `.claude/skills/self-search/SKILL.md` |
| 4. Memory | `self-memory` skill — agents persist lasting patterns to MEMORY.md | `.claude/skills/self-memory/SKILL.md` |

- RAG env: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (graceful ILIKE fallback if missing)
- All 12 agents preload: `self-mark` + `self-search` + `self-memory`

### Skill Adoption

| Skill | Type | Origin |
|-------|------|--------|
| `test-driven-development` | preloaded (backend-dev, frontend-dev) | obra/superpowers |
| `changelog-generator` | user-invoked `/changelog` | Composio |
| `mcp-builder` | user-invoked `/mcp-builder` | Composio |
| `brainstorming` | user-invoked `/brainstorming` | obra/superpowers |
| `content-research-writer` | user-invoked `/content-research-writer` | Composio |
| `skill-authoring-guide` | user-invoked `/skill-authoring-guide` | custom |

### Flow Builder (Phase 1 complete)

| Phase | Feature | Status |
|-------|---------|--------|
| 1. DB + API | flows 테이블, CRUD 서비스 (`flow.ts`), REST 엔드포인트 | done |
| 2. Web UI List | 플로우 목록 페이지, 사이드바 링크 | done |
| 3. Mermaid Editor | Mermaid 코드 에디터 + 라이브 프리뷰 + 노드 메타데이터 | done |
| 4. VSCode Extension | `mimir.openFlows` 커맨드 + 사이드바 Flows 버튼 | done |
| 5. Flow Engine | Mermaid 파싱 → 태스크 생성 → tmux 에이전트 스폰 | not yet |

- Mermaid = source of truth (구조), metadata JSON = 노드별 설정 (agentType, model, prompt)
- Node:Task = 1:N (노드 = 단계, 하위에 여러 TDD 태스크)
- tasks 테이블 확장: `flow_id`, `flow_node_id`, `depends_on[]`
- Mermaid dynamic import: Vite auto code-splitting (491KB separate chunk)
- Key files: `services/flow.ts`, `pages/Flows.tsx`, `routes/api.ts` (flows endpoints)

### Curator Automation

- `mimir curate` — interactive curator session (`claude --agent=mimir-curator`)
- `mimir curate --background` — tmux background execution
- Cron: `0 */6 * * * mimir curate --background`
- `GET /api/curation/stats` — last curation date, new marks/sessions count, promotion candidates
- `POST /api/curation/complete` — record curation in activity_log
