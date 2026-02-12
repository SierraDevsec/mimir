# cli-hooks Memory
> Last curated: 2026-02-07 (curator audit)

## Code Patterns

### hook.sh Protocol
- stdin: JSON from Claude Code with `hook_event_name` field
- stdout: JSON response (hookSpecificOutput for SubagentStart/UserPromptSubmit)
- Must always exit 0 -- never block Claude Code regardless of errors
- Uses `set -o pipefail` but catches all failures silently
- Requires `jq` for JSON parsing; silently exits if jq not found
- 3-second curl timeout (`--max-time 3`) to daemon
- Only echoes response if curl succeeds AND response is non-empty AND not `{}`
- EVENT extracted via: `jq -r '.hook_event_name // "unknown"'`

### CLI Structure (commander.js)
- Entry point: `src/cli/index.ts` with `#!/usr/bin/env node` shebang
- Commands: start, stop, status, init, ui, logs
- Port configurable via `MIMIR_PORT` env var (default 3100)
- PID file at `data/mimir.pid`, log file at `data/mimir.log`
- Data directory resolved from `import.meta.dirname` (ESM pattern)

### Daemon Lifecycle
- `start`: spawns detached child process (`spawn` with `detached: true, stdio: ["ignore", logFd, logFd]`), writes PID file, calls `child.unref()`
- `stop`: reads PID file, sends SIGTERM, deletes PID file
- `isRunning()`: reads PID, uses `process.kill(pid, 0)` for existence check (signal 0)
- `status`: fetches `/api/health`, `/api/sessions?active=true`, `/api/agents?active=true`

### Init Command Flow
1. Resolve target path (default: cwd)
2. Generate project ID: `basename.toLowerCase().replace(/[^a-z0-9-]/g, "-")`
3. Make hook.sh executable: `fs.chmodSync(hookScript, 0o755)`
4. Read `templates/hooks-config.json`, replace `HOOK_SCRIPT_PATH` with actual path
5. Merge hooks into `.claude/settings.local.json` (preserves existing settings)
6. Copy templates (skip with `--hooks-only`):
   - Skills: all skill directories from templates/skills/
   - Agents: all .md files from templates/agents/ (currently mimir-curator.md, mimir-reviewer.md)
   - Rules: all .md files from templates/rules/ (currently team.md)
   - Agent memory: seed MEMORY.md for installed agents from templates/agent-memory/
7. Auto-start daemon if not running (with 1s startup wait)
8. Register project via `POST /hooks/RegisterProject` with 3 retries (500ms between)

### Template Copying
- Skills: folder structure `skills/{name}/SKILL.md` -- copies entire directory
- Agents: flat files `agents/{name}.md` -- conditional copy based on universalAgents list
- Rules: flat files `rules/{name}.md` -- conditional copy based on universalRules list
- All copies are idempotent: skips if destination file already exists (`!fs.existsSync(dest)`)

### Hook Config Structure
- 7 events configured: SessionStart, SessionEnd, SubagentStart, SubagentStop, PostToolUse, Stop, UserPromptSubmit
- Each event: `{ hooks: [{ type: "command", command: "HOOK_SCRIPT_PATH" }] }`
- Custom port: prepends `MIMIR_PORT=<port>` to command string

## Known Gotchas

- hook.sh path resolution: when installed via npm, hook.sh is at `<package>/src/hooks/hook.sh` (included via `files` field in package.json)
- `npx mimir` runs from npm cache, NOT local development directory -- for dev testing, use `node dist/cli/index.js` or `tsx src/cli/index.ts`
- hooks-config.json uses string replacement (`replaceAll("HOOK_SCRIPT_PATH", hookCommand)`) not template engine
- Non-default port: hook command becomes `MIMIR_PORT=3200 /path/to/hook.sh` (env var prefix)
- `mimir init` auto-starts daemon but the 1s wait may not be enough on slow systems -- project registration has retry logic for this
- `mimir logs -f` spawns a `tail -f` process that inherits stdio -- exits when user presses Ctrl+C
- `mimir ui` uses platform-specific open commands: `open` (macOS), `xdg-open` (Linux), `start` (Windows)

## Cross-domain Dependencies

- hook.sh depends on daemon running at `localhost:{MIMIR_PORT}` -- POSTs to `/hooks/{event}`
- Init command depends on templates existing at `../../templates/` relative to built CLI
- Init auto-starts daemon using `../server/index.js` relative path from built CLI
- Settings written to `.claude/settings.local.json` are read by Claude Code on session start
- Template agents reference agent-memory directory: `.claude/agent-memory/{agent-name}/MEMORY.md`

### Observer Integration (2026-02-09)
- PostToolUse hook now queues tool data to `observation_queue` via `queueObservation()` (fire-and-forget)
- SubagentStop hook processes queue: `processObservations()` → `generateSummary()` (both in try/catch, never block)
- Observer enabled/disabled via `MIMIR_OBSERVER` env var (checked by `isObserverEnabled()`)
- hook.sh unchanged — all observer logic is server-side in hooks.ts route handler

## Recent Context

- Init copies ALL template agents and rules by default; `--hooks-only` skips templates entirely
- Template agents: mimir-curator.md, mimir-reviewer.md (no worker.md -- removed)
- Template rules: team.md only (no mimir-usage.md -- removed)
- Agent memory seeding: only seeds MEMORY.md for agents that were actually installed
- Project registration has retry logic with 3 attempts for daemon startup race
- VSCode Extension has parallel auto-init logic in `auto-init.ts` (different from CLI init)
