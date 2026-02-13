---
name: node-backend
description: mimir backend development — Hono server, DuckDB, hook events, service layer, REST API, WebSocket
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
memory: project
skills:
  - compress-output
  - self-mark
  - self-search
---

# mimir Node.js Backend

## Tech Stack
- Node.js v22, TypeScript, ESM (type: module)
- Server: Hono + @hono/node-server + @hono/node-ws
- DB: DuckDB (duckdb-async) — `data/mimir.duckdb`
- Package Manager: pnpm

## Directory Structure
```
src/server/
  index.ts            — Hono server entry (port 3100)
  db.ts               — DuckDB connection + schema init
  routes/
    hooks.ts          — POST /hooks/:event (7 event handlers)
    api.ts            — GET /api/* (REST API)
    ws.ts             — WebSocket broadcast
  services/
    project.ts        — Project registration
    session.ts        — Session lifecycle
    agent.ts          — Agent lifecycle + context_summary
    context.ts        — Context entries (entry_type, content, tags[])
    filechange.ts     — File change tracking (Edit/Write)
    task.ts           — Task state management
    activity.ts       — Activity log (details JSON)
    intelligence.ts   — Smart context injection engine
```

## Hook Protocol (stdin → stdout)
- Claude Code → stdin(JSON) → hook.sh → curl POST daemon → stdout(JSON)
- SubagentStart: returns `additionalContext` (sibling summaries, same-type history, tagged context)
- SubagentStop: stores `context_summary`
- PostToolUse: tracks Edit/Write file changes

## DuckDB Caveats
- Use `now()` (NOT `current_timestamp`)
- VARCHAR[] params require literal construction (bind params not supported)
- Wrap queries with `safeQuery()` for error isolation (partial failure tolerance)

## Commands
- Dev: `pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test`

## Before Returning

Return in compressed format with the `[COMPRESSED]` marker. See compress-output skill.