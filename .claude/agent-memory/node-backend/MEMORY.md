# node-backend Memory
> Last curated: 2026-02-07 (curator audit)

## Code Patterns

### Service Layer Pattern
- Every service imports `getDb` (and `extractCount` when counting) from `../db.js`
- Functions follow: `const db = await getDb(); return db.all(query, ...params);`
- Insert with RETURNING: `db.all('INSERT ... RETURNING id', ...)` then `Number(rows[0].id)`
- Single-row lookups: `const rows = await db.all(query, id); return rows[0] ?? null;`
- No transactions used anywhere currently; multi-step deletes use sequential `db.run` calls

### DuckDB-Specific Patterns
- VARCHAR[] columns (tags) cannot use bind params; must use literal construction:
  ```
  const tagsSql = `[${tags.map(t => `'${t.replace(/'/g, "''")}'`).join(",")}]::VARCHAR[]`;
  ```
  Then interpolate into SQL (not as bind param): `VALUES (?, ?, ${tagsSql})`
- `extractCount()` wraps BigInt COUNT(*) result: `Number(result[0]?.count ?? 0)`
- LENGTH() on TEXT columns also returns BigInt; cast with `Number()` when serializing
- JSON columns use `?::JSON` cast in INSERT: `await db.run('INSERT ... VALUES (?, ?, ?::JSON)', ...)`
- Upsert pattern: `ON CONFLICT (id) DO UPDATE SET ...` (used in sessions, agents, projects)
- DuckDB does not support CASCADE on DELETE; agent deletion manually cleans activity_log, context_entries, file_changes first

### Hook Route Handler Pattern
- All hook events handled in single switch-case in `routes/hooks.ts` (11 events: SessionStart, SessionEnd, SubagentStart, SubagentStop, PostToolUse, Stop, UserPromptSubmit, PostContext, TeammateIdle, TaskCompleted, RegisterProject)
- SubagentStart MUST return `{ hookSpecificOutput: { hookEventName: "SubagentStart" } }` structure even on error
- UserPromptSubmit similarly must return hookSpecificOutput with hookEventName
- Other events return `{}` (empty JSON)
- `broadcast()` called after every state change for WebSocket real-time updates

### Intelligence Service (queries/ module)
- 11 query modules in `services/queries/`, each exports a single function
- All wrapped in `safeQuery<T>(label, fn)` for error isolation -- partial results on failure
- `buildSmartContext()` returns context string for SubagentStart additionalContext
- `buildPromptContext()` returns context string for UserPromptSubmit additionalContext
- `checkIncompleteTasks()` returns warning string or null for SubagentStop

### Transcript Extraction
- 500ms delay before reading transcript file (race condition with Claude Code file write)
- Reads JSONL, iterates lines backward to find last assistant message
- Sums all `message.usage` fields across all assistant entries for token totals
- `cache_read_input_tokens` added to `input_tokens` for total input calculation

### API Route Pattern
- All REST routes in `routes/api.ts`
- project_id filtering via query param: `c.req.query("project_id")`
- Stats endpoint uses `Promise.all()` for parallel count queries
- Task updates auto-add status_change comment when status field changes
- Usage endpoints read from Claude Code's `~/.claude/stats-cache.json` (external file)

## Known Gotchas

- ~~Test setup schema missing input_tokens/output_tokens~~ FIXED as of 2026-02-07: columns now present in setup.ts (lines 75-76), all 164 tests pass
- Queries test setup (`services/queries/__tests__/setup.ts`) has its own duplicated schema definition -- must be kept in sync with main test setup (both now include input_tokens/output_tokens)
- `deleteAgent()` has manual cascade: deletes from activity_log, context_entries, file_changes before deleting agent itself
- `deleteTask()` calls `deleteCommentsByTask()` before deleting task (manual cascade)
- Tags literal construction has SQL injection risk via single-quote escaping (`replace(/'/g, "''")`) -- not user-facing, but note for future
- `usage.ts` reads from filesystem (`~/.claude/stats-cache.json`) -- will return empty array if file doesn't exist

## Cross-domain Dependencies

- `routes/hooks.ts` imports from 7 service modules + intelligence + ws; it is the central integration point
- `routes/ws.ts` provides `broadcast()` used by both hooks.ts and api.ts for real-time updates
- WebSocket message format: `{ event: string, data: unknown, timestamp: ISO string }`
- Web UI `api.ts` types must mirror server response shapes (duplicated type definitions)
- VSCode Extension `api-client.ts` also duplicates API interface (third copy of types)
- `hook.sh` sends to `/hooks/:event` endpoint; shell script is the bridge between Claude Code and server

### Observer System Architecture (Implemented 2026-02-09)
- **Batch processing pattern**: PostToolUse queues to `observation_queue`, SubagentStop processes batch via SDK `query(model:"haiku", maxTurns:1)`
- **3 new tables**: `observation_queue` (raw tool data), `observations` (Haiku-curated), `session_summaries` (AI-generated)
- **observation-store.ts**: CRUD for all 3 tables. `saveObservation()` / `saveSummary()` use DuckDB VARCHAR[] literal construction (same pattern as tags)
- **observer.ts**: `processObservations()` reads queue → callHaiku → parseObservations → saveObservation + broadcast. `generateSummary()` similar flow
- **observer-parser.ts**: Regex-based XML parser for `<observation>` and `<summary>` blocks
- **observer-prompts.ts**: `buildInitPrompt()`, `buildObservationPrompt()`, `buildSummaryPrompt()` — XML output format instructions
- **source column**: `observations.source` — `enriched` (Haiku default), `manual` (MCP save_observation)
- **discovery_tokens**: Tracks Haiku token usage per observation/summary via `callHaiku()` return `{ text, tokens }`
- **isObserverEnabled()**: `CLNODE_OBSERVER` env check (default: enabled). Used in hooks.ts PostToolUse + SubagentStop

### Intelligence Service v2 (Updated 2026-02-09)
- **Stages 8-9 hints-only**: No longer inject full observation/summary content. Only show count hint (~30 tokens vs hundreds)
  - `getSiblingObservationCount()` / `getCrossSessionSummaryCount()` in queries module
- **4000-char budget**: `MAX_CONTEXT_CHARS = 4000` with priority-based section trimming
  - Priority order: tasks → messages → sibling results → prev agent → relevant → cross-session → obs hint → summary hint
- **90-day recency**: `searchObservations()` has default `days=90` filter via `INTERVAL '90 days'`
- **FTS with fallback**: `searchObservations()` tries ILIKE first (FTS extension may not be available on all platforms)

### Observer API Endpoints (routes/api.ts)
- `GET /api/observations` — list with optional project_id, agent_id, type, search, limit filters
- `GET /api/observations/:id` — single observation detail
- `GET /api/summaries` — list with optional project_id, agent_id, limit filters

## Recent Context

- Query modularization: intelligence.ts refactored from 342 to 183 lines (46% reduction), 11 query modules extracted to `services/queries/`
- VSCode Extension added: server serves as HTTP backend for both Web UI and Extension
- Project filtering added across all endpoints (sessions, agents, activities, stats)
- Token tracking columns (input_tokens, output_tokens) added to agents table with migration
- Observer System v2 implemented (2026-02-09): batch processing, hints-only smart context, 4000-char budget, 200 tests pass
