# mimir-curator Memory
> Last curated: 2026-02-07 (second audit)

## Code Patterns

### Agent Memory Structure
- Location: `.claude/agent-memory/{agent-name}/MEMORY.md`
- 5 agents: node-backend, react-frontend, cli-hooks, reviewer, mimir-curator
- Format: markdown with sections -- Code Patterns, Known Gotchas, Cross-domain Dependencies, Recent Context

### Rules Structure
- Location: `.claude/rules/*.md`
- 4 rules files: team.md, typescript.md, react.md, nodejs.md
- Each has frontmatter with `paths:` glob for auto-loading scope
- Rules are auto-loaded by Claude Code based on file paths being worked on

### Knowledge Hierarchy
1. CLAUDE.md -- project-wide reference (architecture, schema, commands)
2. .claude/rules/ -- team-wide conventions (auto-loaded per domain)
3. .claude/agent-memory/ -- agent-specific accumulated knowledge (loaded on spawn)
4. mimir DB context_entries -- session-specific context (injected via hooks)

### Cross-Pollination Patterns Observed
- DuckDB BigInt gotcha appears in: node-backend (code pattern), reviewer (verify checklist), CLAUDE.md (notes)
- Test setup schema drift found by reviewer, relevant to node-backend
- Embed mode knowledge spans react-frontend and VSCode Extension
- Timestamp localDate() fix relevant to both react-frontend and any future API consumers

## Known Gotchas

- CLAUDE.md already documents key DuckDB gotchas, hook.sh behavior, and ESM conventions -- memories should complement, not duplicate
- Rules files have path-scoped auto-loading -- knowledge in rules reaches agents automatically when they touch relevant files
- Agent memories are only loaded at SubagentStart via additionalContext injection
- Memory files are not git-ignored by default -- consider whether accumulated knowledge should be version-controlled

## Cross-domain Dependencies

- All 5 agents share: DuckDB conventions, ESM import rules, TypeScript style rules
- node-backend <-> react-frontend: API type definitions must stay in sync
- node-backend <-> cli-hooks: hook.sh protocol, server port configuration
- react-frontend <-> vscode-extension: embed mode behavior, theme compatibility
- reviewer <-> all: review checklist items should reflect actual codebase patterns

## Curation History

### 2026-02-09 (Observer v2 update)
- Observer System v2 implemented: batch processing, 3 new DB tables, 36 new tests (total 200)
- All 5 agent memories updated with Observer System knowledge
- Key patterns added:
  - node-backend: observer architecture, intelligence v2 (hints-only, 4000-char budget), API endpoints
  - reviewer: observer review points, test count 164→200, new table/service verification checklist
  - react-frontend: Observations page, new API types
  - cli-hooks: observer hook integration (PostToolUse queue, SubagentStop processing)
- New services: observer.ts, observer-parser.ts, observer-prompts.ts, observation-store.ts
- New query modules: siblingObservations.ts (count), crossSessionSummaries.ts (count)
- Architecture decision: observation_queue = raw tool data, observations = Haiku-curated only
- Lightweight real-time observations rolled back — to be redesigned with tmux observer architecture

### 2026-02-07 (second audit)
- All 5 agent memories reviewed, 4 rules files verified
- Tests: 164 pass / 0 fail (test setup schema drift RESOLVED)
- Corrected outdated entries:
  - node-backend: test setup schema no longer missing columns (fixed)
  - cli-hooks: init flow updated (no --with-agents, no universalAgents filtering, templates changed)
  - reviewer: test count updated 161->164, pre-existing failures cleared
- cli-hooks had most drift: referenced removed --with-agents flag, wrong template names (worker.md, mimir-usage.md)
- No new patterns ready for rules promotion yet
- CLAUDE.md hook events table lists 7 events but code has 11 (missing: SessionEnd, PostContext, TeammateIdle, TaskCompleted) -- needs user-directed update
- react-frontend SKILL.md was outdated (gray->zinc palette, missing useQuery pattern) -- fixed
- react.md rule updated: useCallback exception for useQuery fetcher deps
- Next curation: after next multi-agent implementation session

### 2026-02-06 (initial seed)
- Agents with memories: 5/5 created
- Total knowledge entries: ~60 across all agents
- Rules files reviewed: 4 (team.md, typescript.md, react.md, nodejs.md)
- Known issues propagated: test setup schema drift (to node-backend + reviewer)

## Standards Promotion Candidates

Patterns appearing in 2+ agent memories (candidates for .claude/rules/ promotion):
- DuckDB BigInt handling with extractCount() -- already in CLAUDE.md, sufficient coverage
- safeQuery error isolation pattern -- could become a rule if more services adopt it
- WebSocket broadcast-on-state-change -- consistent across hooks.ts and api.ts, could be formalized
- Type sync requirement (3 copies: server, web api.ts, extension api-client.ts) -- could warrant a shared types package or generation rule
