# clnode — Claude Code Swarm Intelligence Plugin

## Why This Exists

Claude Code supports multi-agent mode (spawning subagents via the Task tool),
but **agents cannot communicate with each other**. Each agent runs in an
isolated context and has no awareness of what other agents are doing or have done.

This creates a critical problem: **the Leader agent's context explodes**.
When a reviewer finds issues and work needs to be re-assigned, everything
must flow through the Leader. Every round-trip of "review failed → tell Leader
→ Leader re-assigns → implementer fixes → send back" piles up context on the
Leader's window until it hits limits and loses track.

**clnode solves this by externalizing agent coordination state to a local DB.**

Using Claude Code's built-in features — **hooks**, **agents**, **skills**, and
**rules** — clnode builds a swarm mode layer on top of vanilla Claude Code:

- **hooks** intercept agent lifecycle events and route context through DuckDB
- **agents** define subagent roles (clnode-reviewer, clnode-curator, or custom via `/clnode-agents`)
- **skills** provide user-invoked commands and agent-preloaded behaviors (/compress-output, /compress-review)
- **rules** enforce project-wide conventions (auto-loaded every conversation)
- **DuckDB** acts as shared memory between agents (the communication channel)
- **observers** compress every tool use into structured knowledge via Claude Agent SDK

When Agent B starts, the SubagentStart hook automatically injects Agent A's
results via `additionalContext` — no Leader relay needed. The Leader stays lean,
only making high-level decisions instead of carrying every intermediate result.

## Core Value: "The Swarm That Remembers"

clnode's unique value is the combination of two capabilities no other tool provides:

1. **Real-time Swarm Orchestration** — Agents coordinate through DuckDB as shared memory
2. **Agent Self-Marking** — Agents annotate their own important discoveries as they work

```
claude-mem:  "A remembering individual"   (external AI compresses after the fact)
clnode:      "A remembering team"          (agents mark what matters as they work)
```

## Architecture

```
Claude Code Session (no native swarm support)
│
├── Agent A starts  ──→  hook ──→  clnode daemon ──→  DuckDB (store)
├── Agent A stops   ──→  hook ──→  clnode daemon ──→  DuckDB (save summary)
├── Agent B starts  ──→  hook ──→  clnode daemon ──→  DuckDB (read A's summary)
│                                       │
│                                       └──→ stdout: additionalContext
│                                             (A's results injected into B)
└── Leader only sees final reports — context stays minimal
```

## Key Insight

**Agents don't talk to each other directly. They talk through time.**
Agent A finishes and leaves a summary in DB. Agent B starts later and
receives that summary automatically. The hook system is the message bus,
DuckDB is the mailbox.

**Agents don't just leave summaries — they leave structured marks.**
When an agent encounters something important (a gotcha, a design decision, a warning),
it marks it directly. These marks are stored in DuckDB and automatically surfaced
to future agents working on related files or tasks.

## Tech Stack
- **Runtime**: Node.js v22, TypeScript, ESM (type: module)
- **Server**: Hono + @hono/node-server + @hono/node-ws
- **DB**: DuckDB (duckdb-async) — `data/clnode.duckdb` + FTS extension
- **Observer SDK**: @anthropic-ai/claude-agent-sdk — **scheduled for removal** (self-marking replaces observer)
- **CLI**: commander.js
- **Web UI**: React 19 + Vite 7 + TailwindCSS 4 + react-icons
- **Test**: Vitest
- **Package Manager**: pnpm

## Directory Structure
```
src/
  cli/index.ts          — CLI entry point (clnode start/stop/init/status/ui/logs)
  hooks/hook.sh         — stdin→stdout hook script (jq + curl)
  server/
    index.ts            — Hono server entry point (port 3100)
    db.ts               — DuckDB connection + schema initialization
    routes/
      hooks.ts          — POST /hooks/:event (7 event handlers + RegisterProject)
      api.ts            — GET/PATCH/DELETE /api/* (REST API)
      ws.ts             — WebSocket broadcast utility
    services/
      project.ts        — Project registration
      session.ts        — Session lifecycle
      agent.ts          — Agent lifecycle + context_summary
      context.ts        — Context entries (entry_type, content, tags[])
      filechange.ts     — File change tracking (Edit/Write)
      task.ts           — Task state tracking (5-stage)
      comment.ts        — Task comments CRUD
      activity.ts       — Activity log (details JSON)
      intelligence.ts   — Smart context injection (9 stages) + todo enforcer
      observer.ts       — Observer Manager (batch processing via SDK query)
      observer-prompts.ts — Observer XML prompt builders (init/observation/summary)
      observer-parser.ts  — XML observation/summary parser (regex-based)
      observation-store.ts — DuckDB CRUD for observer tables
      queries/
        siblingObservations.ts  — Stage 8: sibling agent observations
        crossSessionSummaries.ts — Stage 9: past session summaries
  mcp/
    server.ts           — MCP server (messaging + Progressive Disclosure tools)
  web/                  — React SPA (Dashboard, Agents, Context, Tasks, Activity, Observations)
    components/Layout.tsx — embed mode (?embed=true): hides sidebar + transparent background
    lib/ProjectContext.tsx — URL ?project=<id> parameter for initial project selection
vscode-extension/       — VSCode Extension (standalone package)
  src/
    extension.ts        — activate: sidebar + status bar + command registration
    sidebar-view.ts     — WebviewViewProvider: custom HTML sidebar (stats + nav + project selector)
    webview/panel.ts    — WebviewPanel: iframe webview in editor area
    webview/html-provider.ts — iframe HTML generation (?embed=true&project=<id>)
    auto-init.ts        — workspace auto-init + project registration
    daemon.ts           — daemon health check + start/stop
    api-client.ts       — REST client
    status-bar.ts       — status bar item
templates/
  hooks-config.json     — Hooks config template
  agents/               — 2 agent role definitions (clnode-curator, clnode-reviewer)
  agent-memory/         — Seed MEMORY.md files for agents (clnode-curator, clnode-reviewer)
  skills/               — Skills (compress-output, compress-review, clnode-agents)
  rules/                — Swarm rules (team)
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

### Mark Tables (Self-Marking System)
- **observations**: agent self-marks (type: warning/decision/discovery/note, title, concepts[], promoted_to)
- **session_summaries**: id, session_id, agent_id, project_id, request, investigated, learned, completed, next_steps, files_read[], files_modified[], notes, created_at

## Hook Events
| Event | Purpose |
|-------|---------|
| SessionStart | Register session, link to project |
| SubagentStart | Register agent, return additionalContext (smart context injection) |
| SubagentStop | Finalize agent, extract context_summary from transcript |
| PostToolUse | Track file changes (Edit/Write). additionalContext NOT supported here |
| UserPromptSubmit | Return project context (active agents, open tasks, decisions) |
| TeammateIdle | Track Agent Teams teammate idle state |
| TaskCompleted | Sync shared task completion with clnode tasks |
| RegisterProject | Register project in DB (used by `clnode init`) |

## CLI Commands
```bash
clnode start            # Start daemon (background)
clnode stop             # Stop daemon
clnode status           # Show active sessions/agents
clnode init [path]      # Install hooks + agents/skills/rules + register project
clnode ui               # Open Web UI in browser
clnode logs [-n N] [-f] # View daemon logs
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
- DuckDB `COUNT(*)` returns BigInt → wrap with `Number()`
- DuckDB VARCHAR[] needs literal construction, not bind params
- hook.sh exits 0 even on failure (never blocks Claude Code)
- hook.sh has 3s curl timeout, requires `jq`
- Server port: env var CLNODE_PORT (default 3100)

## VSCode Extension (Primary Client — 2026-02-13)

**VSCode/Cursor 플러그인이 유일한 클라이언트.** Electron 앱은 폐기.

### Architecture
```
VSCode Extension (primary client)
├── Sidebar WebviewView — 3-button nav (Agents/Orchestration/Tasks)
│                        + Claude Usage bars + Active Agents
├── Editor WebviewPanel — iframe (Agents/Tasks) + custom HTML (Orchestration, Usage)
├── Terminal Manager — Claude CLI (Editor area) + Swarm tmux (Editor area)
├── Status Bar — "clnode: N agents" or "clnode: offline"
└── Auto-Init — installs hooks + registers project on workspace open
     ↓ HTTP/WS
clnode daemon (port 3100)
```

### Sidebar (Simplified 2026-02-13)
```
clnode header
├── 3 nav buttons: Agents / Orchestration (badge) / Tasks
├── Claude Usage: 5h/7d/Son bars (click → full panel)
├── Active Agents: green dot + name list
└── (no stats grid, no project selector — auto-detect from workspace path)
```

### Key Files
```
vscode-extension/src/
  extension.ts              — activate, 10 commands
  claude-usage.ts           — macOS Keychain OAuth → Anthropic Usage API
  terminal-manager.ts       — Claude/Swarm 터미널 생명주기
  sidebar-view.ts           — 사이드바 HTML (nav + usage + agents, auto-detect project)
  webview/
    panel.ts                — 패널 라우팅 (iframe / orchestration / usage)
    orchestration-html.ts   — StatusBar + Chat/Terminal tab HTML
    claude-usage-html.ts    — Account + Usage 상세 HTML
    html-provider.ts        — 일반 iframe HTML (?embed=true)
  api-client.ts             — REST client for daemon
  auto-init.ts              — workspace 자동 초기화
  daemon.ts                 — daemon health + start/stop
  status-bar.ts             — "clnode: N agents" 상태 표시줄
```

### Claude Usage Pipeline (Verified 2026-02-13)
```
macOS Keychain ("Claude Code-credentials")
  → OAuth tokens (accessToken, refreshToken, expiresAt)
  → token refresh if expired (5min buffer)
  → GET https://api.anthropic.com/api/oauth/usage
  → { five_hour, seven_day, seven_day_sonnet, extra_usage }
  → sidebar compact bars (5h/7d/Son)
  → click → full panel (Account + Usage + Extra + 10min auto-refresh)
```

### Orchestration StatusBar Pipeline
```
StatuslineUpdate hook → in-memory store (updateStatusline)
  → GET /api/statusline/:projectId → { context_pct, rolling_5h_pct, weekly_pct }
  → orchestration-html.ts polls every 2s → minibar update
  → Chat tab (iframe) / Terminal tab ("Open in Editor Tab" → launchSwarm)
```

### Key Design Decisions
- **No embedded server**: Extension is a pure HTTP client connecting to the daemon
- **iframe embed**: Reuses Web UI as-is. `?embed=true` hides sidebar + transparent background
- **Custom sidebar HTML**: Theme-compatible via VSCode CSS variables
- **Auto project detection**: workspace path → DB projects.path 매칭 (selector 없음)
- **Usage bar race condition**: `_lastUsage` 캐시 + `onViewReady` 콜백으로 해결
- **CJS output**: VSCode extensions must use CommonJS (`format: 'cjs'`)
- **Terminal in Editor area**: Claude/Swarm 터미널은 Editor 영역 탭으로 열림 (bottom panel 아님)

### Extension Build & Deploy
```bash
cd vscode-extension
pnpm build                                              # esbuild → dist/extension.js (CJS)
pnpm package                                            # vsce package → .vsix
code --install-extension clnode-vscode-*.vsix --force   # VSCode/Cursor → Reload Window
```

### Important Notes (Extension)
- `npx clnode start` runs from npm cache → use `node dist/server/index.js` directly for local dev
- After Web UI changes: `pnpm build` (root) → restart daemon → rebuild extension → install → reload
- Beware `window.open()` name collision: use `openPage()` etc. in webview
- Extension list icon must be PNG (not SVG): convert with `rsvg-convert`
- `acquireVsCodeApi()` can only be called once per webview
- Use `vscode.getState()`/`vscode.setState()` in sidebar webview to persist selection state
- `container-type: inline-size` is required for `@container` queries to work
- `autoInitWorkspace` always calls `registerProject` regardless of hooks/agents presence
- Claude Usage CLIENT_ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e` (hardcoded, Claude Code OAuth)
- StatuslineUpdate data is in-memory only — daemon restart clears it

## Known Issues
- Hooks require Claude Code session restart after `clnode init`
- Agent killed by ESC or context limit → SubagentStop not fired → zombie in DB (use Kill button in UI)
- Transcript extraction needs 500ms delay (race condition with file write)
- VSCode Extension requires Reload Window after install (no hot reload)

## Agent Management

`clnode init` installs two default agents: **clnode-reviewer** (code review) and **clnode-curator** (knowledge curation).

To discover installed agents/skills/rules or create custom agents, use the `/clnode-agents` skill.
It provides interactive discovery (scan `.claude/` directory) and a scaffolding generator
that creates properly structured agent files with frontmatter, compress-output skill, and updates team.md.

## Context Management: Architectural Analysis (2026-02-07)

### The Leader Context Problem

Every agent interaction **forces content into Leader's context** — unavoidable
platform constraint regardless of communication mode (Task tool or Agent Teams).

```
Leader context growth per agent:
  No compression:   ~100-200 lines → 10 agents = ~1000-2000 lines
  compress-output:  ~10 lines      → 10 agents = ~100 lines
```

### compress-output: Slope Reduction Only

Reduces slope of context growth but does NOT prevent information loss.
When auto-compaction fires (~95% usage), old tool_results are deleted regardless
of size. Compression only delays the trigger point.

### Three Communication Modes Compared

| Aspect | Subagent (Task tool) | Agent Teams | Nested Subagent (2.1.33+) |
|--------|---------------------|-------------|---------------------------|
| Leader context load | tool_result (forced) | SendMessage + idle notifications | **Only top-level return** |
| Peer-to-peer | Impossible | SendMessage direct | Via parent agent |
| Review-fix loop | Leader relays everything | Peers DM (leader sees summary) | **Contained in parent** |
| clnode tracking | hooks | hooks | hooks (parent_agent_id chain) |
| Availability | Stable | Experimental | 2.1.33+ (tools frontmatter) |

### Nested Subagent Delegation (NOT WORKING — Tested 2026-02-07)

Claude Code 2.1.33 changelog mentions `Task(agent_type)` syntax in agent `tools`
frontmatter. In theory this would allow subagents to spawn their own subagents.

**Test result**: Task tool is NOT available inside subagents even with
`Task(general-purpose)` in tools frontmatter. The subagent context does not
expose the Task tool — only TaskCreate (task list management) is available.

```yaml
# Tested agent definition:
tools: Read, Grep, Glob, Task(general-purpose)
# Result: Task tool not available inside the subagent
```

The `Task(agent_type)` syntax may serve a different purpose (restricting which
agent types CAN be spawned when Task IS available, rather than enabling Task).
Or it may require additional configuration not yet documented.

**Conclusion**: Flat orchestration (Leader manages all agents directly) remains
the only working pattern. The review-fix loop still requires Leader relay.

### Agent Teams: Peer-to-Peer Advantage

Agent Teams SendMessage still loads Leader context (same problem as Task tool).
But peer-to-peer DMs have one real advantage:

> When a teammate sends a DM to another teammate, **only a brief summary**
> is included in the leader's idle notification (not the full message).

This means reviewer → implementer direct DMs reduce leader context vs relaying
through leader. But idle notifications and status messages still accumulate.

### Hybrid Memory Strategy

| Storage | Lifetime | Re-access | Cost |
|---------|----------|-----------|------|
| tool_result | Deleted on compaction | Impossible | One-time |
| DuckDB (clnode) | Permanent | API query | Per-query |
| File (agent-memory) | Permanent | Read tool | Per-read |
| MEMORY.md | Permanent (system prompt) | Always loaded | Every API call |

**Recommended**: DuckDB for session-scoped results, file-based agent-memory for
persistent knowledge, MEMORY.md sparingly (200-line limit, loaded every turn).

### Priorities (Updated 2026-02-13)

**Completed:**
1. ~~Progressive Disclosure MCP tools~~ — ✅ 5 MCP tools + 2 promotion tools (7 total)
2. ~~DuckDB FTS~~ — ✅ FTS extension (used for mark search)
3. ~~TeammateIdle/TaskCompleted hooks~~ — ✅ Tracked
4. ~~Test nested subagent~~ — NOT WORKING (confirmed 2026-02-07)
5. ~~**Resolve Q1: Marking mechanism**~~ — ✅ preloaded skill + MCP tool
6. ~~**Resolve Q3: PostToolUse additionalContext**~~ — ✅ NOT supported
7. ~~**Add self-mark skill to agents**~~ — ✅ All 5 agents + 2 templates
8. ~~**Redesign buildSmartContext()**~~ — ✅ Direct mark injection (sibling 5 + cross-session 5), budget 6000 chars
9. ~~**Remove Observer system**~~ — ✅ Deleted observer.ts, observer-prompts.ts, observer-parser.ts
10. ~~**Warm→Cold promotion**~~ — ✅ promotion-candidates API + MCP tools + curator workflow
11. ~~**Dead code cleanup**~~ — ✅ Deleted siblingObservations.ts, crossSessionSummaries.ts; removed unused exports from observation-store.ts, queries/index.ts
12. ~~**Test coverage**~~ — ✅ 197 tests green (relevantMarks 17, promotionCandidates 6, observation-store 10)
13. ~~**File-based mark matching**~~ — ✅ save_observation files param, getFileBasedMarks() with list_has_any(), Stage 9 merged injection

**Next (VSCode Extension — 2026-02-13):**
14. ~~**VSCode Extension UI 실사용 테스트**~~ — ✅ 완료 (2026-02-13)
    - 사이드바 간소화: 3버튼(Agents/Orchestration/Tasks) + Usage 바 + Active Agents
    - 제거: Stats 그리드, Project selector, Claude 버튼, More Pages(Dashboard/Context/Activity)
    - 수정: Usage 바 race condition (onViewReady 콜백), stats project_id 필터, 좀비 세션/에이전트 정리
    - 설치: `cursor --install-extension vscode-extension/clnode-vscode-0.3.2.vsix --force` → Reload
15. ~~**self-mark 실전 검증**~~ — ✅ 완료 (2026-02-13)
    - **발견**: Task tool subagent에서 MCP tool 사용 불가 (save_observation 접근 안됨)
    - **해결**: Hybrid 방식 — MCP tool (Agent Teams/tmux) + curl HTTP API fallback (Task tool subagent)
    - SKILL.md v3.0.0 + templates 동기화 완료
    - curl fallback 실전 테스트 성공 (observation id=9 저장됨)
16. ~~**코드 점검 수정 사항 반영 확인**~~ — ✅ 빌드+테스트 통과 (197 tests, 2026-02-13)

**Next:**
17. **MCP tool subagent 지원 모니터링** — Claude Code 향후 버전에서 subagent MCP 지원 시 curl fallback 제거 가능

**Deferred:**
18. Vector search — DuckDB vss extension. Optional, evaluate after self-marking works.
19. Curator automation — periodic auto-run (cron/hook trigger)
20. Promotion Web UI — currently API/MCP only
21. Electron app 코드 제거 — electron-app/ 디렉토리 삭제 (새 git repo 이동 시)

## Agent Teams Compatibility (Verified 2026-02-07)

Claude Code's experimental Agent Teams feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
is **fully compatible** with clnode — no code changes required.

### Verified Behavior
- Agent Teams teammate creation fires **SubagentStart hook** → recorded in DB
- Agent Teams teammate termination fires **SubagentStop hook** → context_summary extracted
- All teammates share the same session_id → visible in existing UI/API
- **Zero code changes needed** — existing hook system tracks Agent Teams natively

### Activation
```json
// .claude/settings.local.json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

### Agent Teams vs Subagent Mode
| | Subagent (Task tool) | Agent Teams |
|---|---|---|
| Communication | Leader relay only | SendMessage direct (peer-to-peer) |
| Leader context growth | tool_result per agent | SendMessage + idle/status notifications |
| Peer DM leader visibility | N/A | Brief summary only (not full message) |
| Task management | clnode DB | Shared file-based (`~/.claude/tasks/`) |
| clnode tracking | Yes (hooks) | Yes (hooks) |

### Hook Events (2.1.33+)
- **TeammateIdle**: Fires when Agent Teams teammate goes idle. Tracked by clnode (updates agent status).
- **TaskCompleted**: Fires when shared task completes. Tracked by clnode (syncs with tasks table).
- **StatuslineUpdate**: Fires with real-time session stats. Stored in-memory for dashboard.

### VSCode Terminal API Automation (Verified)
```typescript
// vscode.window.createTerminal({ location: { parentTerminal } }) for split panes
// terminal.sendText() to launch claude sessions in each terminal
// clnode hooks automatically track all sessions
```

## Swarm Best Practices
- **Agent sizing**: Keep to 5-7 files per agent to avoid context exhaustion
- **Don't agent trivial tasks**: 3-line changes should be done by Leader directly
- **Reviewer is worth it**: Always catches type safety, stale data, missing error handling
- **True parallelism**: Requires same-message Task calls (separate messages = sequential)
- **clnode's sweet spot**: Multi-step chains where Agent B needs Agent A's results
- **Nested delegation**: NOT WORKING (tested 2026-02-07, Task tool unavailable in subagents)
- **Agent Teams for peer-to-peer**: Use when agents need to coordinate directly
- **Leader context is always finite**: All modes accumulate; persist critical state to DB
- **DB over memory files**: Safer for concurrent writes in parallel agent scenarios

## Self-Marking System — Design Discussion (2026-02-12)

### Why Not Observer (claude-mem Pattern)

clnode initially borrowed the **Observer Agent pattern** from
[claude-mem](https://github.com/thedotmack/claude-mem) (27K+ stars):
PostToolUse captures all tool uses → Haiku AI compresses after agent stops
→ observations stored in DB.

**This was the wrong approach for a swarm system.**

| Problem | Detail |
|---------|--------|
| Observer guesses intent | External AI sees tool I/O but doesn't know WHY the agent did it |
| Noise ratio is high | 100 tool uses → maybe 5 actually matter. Observer can't distinguish |
| Cost for little value | Haiku SDK call per agent stop, produces mediocre summaries |
| Agent knows best | The agent doing the work knows what's important — not a post-hoc observer |

**Decision (2026-02-12)**: Replace Observer system with **Agent Self-Marking**.
Agents annotate important discoveries as they work. No external AI compression.

```
Observer (removed):   CCTV recording → AI editor picks highlights → hope it's right
Self-Marking (new):   Team member writes own meeting notes → accurate by definition
```

### Problems Resolved (2026-02-13)

1. ~~**Injection is meaningless**~~ — ✅ buildSmartContext() now directly injects mark titles
   (sibling 5 + cross-session 5), budget increased to 6000 chars.
2. **Compression doesn't exist** — `context_summary` = last assistant message from transcript.
   Not AI compression. Not structured. Just whatever the agent said last. (Unchanged — low priority)
3. ~~**Search tools exist but aren't used**~~ — ✅ Push-first approach (direct injection) replaces
   pull-only. Agents receive marks automatically without needing to search.
4. ~~**Observer doesn't fit swarm**~~ — ✅ Removed. Replaced by self-marking (agents annotate own work).

### Self-Marking: Core Concept

```
Agent A works on backend task
  → discovers DuckDB BigInt gotcha
  → marks: { type: "warning", content: "COUNT(*) returns BigInt, wrap with Number()", files: ["db.ts"] }
  → stored in DuckDB immediately

Agent B starts later, touches db.ts
  → system auto-surfaces: "Warning from Agent A: BigInt needs Number() wrapping"
  → Agent B avoids the same mistake
```

**The agent doing the work decides what's worth remembering.**
Not an external observer. Not post-hoc compression. Real-time, intent-aware annotation.

### Open Design Questions

#### Q1: Marking Mechanism — RESOLVED (2026-02-13, updated)

**Answer: Preloaded skill + Hybrid (MCP tool / curl HTTP fallback)**

```
self-mark skill v3.0.0 (preloaded, ~100% followed)
  → Agent Teams (tmux): save_observation MCP tool (direct)
  → Task tool subagent: curl POST /api/observations (MCP unavailable in subagents)
  → DuckDB INSERT (immediate)
```

Why this works:
- Skills are loaded into system prompt → agents follow them ~100%
- MCP tools are available in Agent Teams teammates (independent Claude sessions)
- MCP tools are NOT available in Task tool subagents (constrained subprocess)
- curl fallback uses existing REST API (`POST /api/observations`) — no new code needed
- Agent marks in real-time during work, not at the end

#### Q2: Marking Categories

Based on the comment quality analysis — only "Why" comments have value:

| Category | When to mark | Example |
|----------|-------------|---------|
| **why** | Chose A over B, non-obvious reason | "Hono over Express: streaming SSE support" |
| **warning** | Gotcha, trap, non-obvious behavior | "DuckDB BigInt needs Number() wrap" |
| **decision** | Architectural choice with alternatives | "DuckDB over SQLite: concurrent write safety" |
| **discovery** | Learned something about the codebase | "hook.sh has 3s curl timeout — can't do heavy work" |

**NOT marked**: What the code does (code says it), How it works (code shows it),
Phase/stage labels (git history), Section dividers (split the file instead).

#### Q3: Search & Surfacing — IMPLEMENTED (2026-02-13)

| Approach | Mechanism | Status |
|----------|-----------|--------|
| **Push at start** | SubagentStart → query sibling + project marks → inject via additionalContext | ✅ Implemented (direct title injection, up to 10 marks) |
| **Push on file read** | PostToolUse(Read) → query marks for that file → inject | ❌ NOT feasible (PostToolUse doesn't support additionalContext) |
| **Pull (MCP search)** | Agent explicitly searches past marks | ✅ Available (7 MCP tools) |

**Current implementation**: `buildSmartContext()` Stage 8 injects sibling marks (same session, max 5),
Stage 9 injects project marks (cross-session, max 5). Budget increased to 6000 chars.
Promoted marks (`promoted_to IS NOT NULL`) are excluded from injection.

**Future**: File-based matching (filter marks by files_read/files_modified overlap)
requires self-mark skill to include file info first.

#### Q4: Memory Hierarchy — IMPLEMENTED (2026-02-13)

```
Hot  (immediate)    Current session marks → direct injection via buildSmartContext Stage 8
Warm (searchable)   Past session marks → direct injection via Stage 9 + MCP pull search
Cold (permanent)    Repeated patterns → promoted to rules/ via curator + promote_marks MCP tool
```

- **Hot → Warm**: Automatic (session ends, marks appear in Stage 9 cross-session injection)
- **Warm → Cold**: Curator calls `get_promotion_candidates` → creates rules/ file → calls `promote_marks`
  - Promoted marks have `promoted_to` set → excluded from future injection (no duplicates)
  - All future agents read rules/ automatically (Claude Code built-in behavior)

#### Q5: Observer System — REMOVED (2026-02-12)

**Removed:**
- `observer.ts`, `observer-prompts.ts`, `observer-parser.ts` — deleted
- `observation_queue` table — removed
- Haiku SDK dependency — removed

**Kept and repurposed:**
- `observation-store.ts` — CRUD for self-marks + `markAsPromoted()`
- `observations` table — agent self-marks (+ `promoted_to` column for warm→cold tracking)
- `session_summaries` table — agent self-summaries
- MCP tools — 5 search tools + 2 promotion tools (Progressive Disclosure + warm→cold)
- DuckDB FTS — mark search

### What We Keep from claude-mem

| Pattern | Status | Reason to keep |
|---------|--------|---------------|
| Progressive Disclosure (3-layer search) | Keep | Retrieval pattern is sound regardless of storage |
| DuckDB + FTS | Keep | Storage/search infrastructure still needed |
| `__IMPORTANT` dummy MCP tool | Keep | Workflow enforcement pattern still useful |
| Fire-and-forget hook safety | Keep | Never block Claude Code |
| Exit 0 always | Keep | Graceful degradation |

| Pattern | Status | Reason to remove |
|---------|--------|-----------------|
| Observer Agent (external AI compression) | **Remove** | Agent self-marking is superior |
| Haiku SDK batch processing | **Remove** | No external AI needed |
| XML observation format | **Remove** | Marks use simpler structured format |
| observation_queue table | **Remove** | No batch queue needed |

### Comparison: claude-mem vs clnode (Updated View)

| | claude-mem | clnode (post-refactoring) |
|---|---|---|
| Memory source | External AI observer | **Agent self-marking** |
| Memory quality | AI guesses what matters | **Agent knows what matters** |
| Memory cost | Haiku API call per agent | **Zero additional cost** |
| Memory timing | Post-hoc (after agent stops) | **Real-time (during work)** |
| Search | Pull-only (MCP tools) | **Push-first** (auto-inject) + Pull fallback |
| Scope | Single session | **Cross-agent, cross-session** |

claude-mem = external observer compresses everything after the fact.
clnode = agents mark what matters as they work, system surfaces it automatically.
