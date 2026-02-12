# reviewer Memory
> Last curated: 2026-02-07 (curator audit)

## Code Patterns

### Service Function Signatures
- All services follow consistent pattern: `async function name(params): Promise<ReturnType>`
- DB access: always `const db = await getDb();` then `db.all()` or `db.run()`
- Return patterns: arrays via `db.all()`, single rows via `rows[0] ?? null`, counts via `extractCount(result)`

### DuckDB Patterns to Verify
- `extractCount()` must wrap all COUNT(*) results -- DuckDB returns BigInt
- LENGTH() on TEXT columns also returns BigInt -- must cast with Number()
- VARCHAR[] cannot use parameterized queries -- uses string interpolation with escaping
- `now()` not `current_timestamp` for DuckDB timestamps
- No CASCADE support -- manual cascade deletes in agent.ts and task.ts
- `?::JSON` cast required for JSON column inserts (activity_log.details)
- `ON CONFLICT ... DO UPDATE SET` for upsert operations

### Error Handling Patterns
- `safeQuery<T>(label, fn)` in intelligence queries: catches and logs errors, returns empty array
- hooks.ts catch block: must return correct hookSpecificOutput structure for SubagentStart/UserPromptSubmit
- CLI commands: try/catch with user-friendly error messages
- hook.sh: all errors silently swallowed (exit 0 always)

### Test Architecture
- Main test setup: `src/__tests__/setup.ts` -- in-memory DuckDB, exports getTestDb, closeTestDb, truncateAllTables, fixtures, setupTestData
- Queries test setup: `services/queries/__tests__/setup.ts` -- SEPARATE in-memory DB with duplicated schema
- Test mocking: `vi.mock("../../db.js", ...)` replaces getDb with test DB
- ~~Pre-existing test setup bug~~ FIXED: input_tokens/output_tokens columns now present in both test setups; all 164 tests pass

### Build Verification Checklist
- TypeScript compilation: `pnpm build` (checks server + CLI)
- Vite web build: included in `pnpm build` (checks React components)
- Full test suite: `pnpm test` (currently 200 pass, 0 failures)
- VSCode Extension: `cd vscode-extension && pnpm build` (separate build)

## Known Gotchas

### Security Patterns
- Tags SQL uses string interpolation with single-quote escaping -- review any user-facing tag input carefully
- No input validation on most service functions -- route handlers should validate
- No authentication on any endpoint -- local-only daemon by design
- CORS not explicitly configured -- relies on same-origin for Web UI

### Common Review Findings (from past sessions)
- Type precision: check that function return types match actual DuckDB row shapes (BigInt vs Number)
- Test setup drift: test schemas may lack new columns added to production schema (migration pattern)
- Duplicate type definitions: api.ts (web), api-client.ts (extension), service types (server) -- can drift apart
- Missing error handling: new service functions should follow safeQuery pattern or have appropriate error wrapping
- WebSocket broadcast: any state-changing operation should call broadcast() for real-time UI updates

### Review Focus Areas by Domain
- **node-backend**: DuckDB query correctness, BigInt handling, safeQuery usage, broadcast calls
- **react-frontend**: useQuery dependency arrays, WebSocket reload logic, embed mode compatibility, timestamp display
- **cli-hooks**: Exit code safety (always 0), path resolution correctness, template file handling
- **vscode-extension**: CSP headers, CJS output format, acquireVsCodeApi single-call, theme variable usage

## Cross-domain Dependencies

- Server API response types must match Web UI api.ts types AND Extension api-client.ts types (3-way sync)
- Hook event names must match between hooks-config.json template, hook.sh event extraction, and hooks.ts switch-case (11 events total: SessionStart/End, SubagentStart/Stop, PostToolUse, Stop, UserPromptSubmit, PostContext, TeammateIdle, TaskCompleted, RegisterProject)
- Task status values: idea, planned, pending, in_progress, needs_review, completed (used in hooks.ts auto-assign, api.ts, web UI)
- WebSocket event format: `{ event, data, timestamp }` -- consumed by useWebSocket in web UI

### Observer System Review Points (Added 2026-02-09)
- **3 new tables**: observation_queue, observations, session_summaries — verify schema in db.ts matches test setup in `__tests__/setup.ts`
- **observation-store.ts**: VARCHAR[] literal construction for facts/concepts/files_read/files_modified (same SQL injection risk pattern as tags)
- **observer.ts**: `callHaiku()` uses SDK `query()` which spawns subprocess — verify error handling and `processingAgents` Set prevents double-processing
- **intelligence.ts**: stages 8-9 now hints-only (count queries, no content injection). Verify `MAX_CONTEXT_CHARS = 4000` budget enforcement
- **hooks.ts PostToolUse**: `queueObservation()` is fire-and-forget (`.catch()`) — never blocks hook response
- **hooks.ts SubagentStop**: `processObservations()` + `generateSummary()` wrapped in try/catch — observer failures don't block agent stop
- **source column**: `observations.source` values: `enriched` (default), `manual`. Verify default is applied correctly
- **Test coverage**: observation-store.test.ts covers queue/observation/summary CRUD, search, timeline, source parameter (36 new tests)

## Recent Context

- Query modularization review completed: 11 query modules, 29 new tests, 0 critical issues, 2 warnings (duplicate test setup, extractCount mock)
- Web UI refactoring review completed: component extraction and data fetching standardization verified
- extractCount re-review: type precision improved, duplicate removed via re-export, 5 edge case tests added
- Test setup schema drift issue resolved: both test setups now include all agent columns (input_tokens, output_tokens)
- Observer System v2 implemented (2026-02-09): test count 164→200, 3 new DB tables, observer service + store + parser + prompts
