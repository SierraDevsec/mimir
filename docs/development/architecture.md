---
title: Architecture
layout: default
parent: Development
nav_order: 2
---

# Architecture

## Directory Structure

```
src/
  cli/index.ts          — CLI entry point (mimir start/stop/init/status/ui/logs)
  hooks/hook.sh         — stdin→stdout hook script (jq + curl)
  server/
    index.ts            — Hono server entry point (port 3100)
    db.ts               — DuckDB connection + schema initialization
    routes/
      hooks.ts          — POST /hooks/:event (hook event handlers)
      api.ts            — GET/PATCH/DELETE /api/* (REST API)
      ws.ts             — WebSocket broadcast utility
    services/
      project.ts        — Project registration
      session.ts        — Session lifecycle
      agent.ts          — Agent lifecycle + context_summary
      context.ts        — Context entries (entry_type, content, tags[])
      filechange.ts     — File change tracking (Edit/Write)
      task.ts           — Task state tracking (6-stage)
      comment.ts        — Task comments CRUD
      activity.ts       — Activity log (details JSON)
      intelligence.ts   — Smart context injection + prompt auto-attach
  web/                  — React SPA (Dashboard, Agents, Context, Tasks, Activity)

.claude/
  agents/               — Agent definitions (12 team agents + mimir-curator)
  agent-memory/         — Seed MEMORY.md files
  skills/               — Skills (self-mark, self-search, self-memory, etc.)
  rules/                — Project rules (team.md)
  init-manifest.json    — Distributable items for mimir init

vscode-extension/       — VSCode Extension (standalone package)
```

## Data Flow

```
User types in Claude Code
  ↓ UserPromptSubmit hook
  ↓ POST /hooks/UserPromptSubmit
  ↓ buildPromptContext(sessionId)
  ↓ Returns: active agents, open tasks, recent decisions
  ↓ Injected as userMessage prefix

Claude Code spawns agent
  ↓ SubagentStart hook
  ↓ POST /hooks/SubagentStart
  ↓ startAgent() — register in DB
  ↓ buildSmartContext() — sibling summaries, same-type history, etc.
  ↓ Returns: additionalContext

Agent uses Edit/Write tool
  ↓ PostToolUse hook
  ↓ POST /hooks/PostToolUse
  ↓ recordFileChange() — track in DB

Agent finishes
  ↓ SubagentStop hook
  ↓ POST /hooks/SubagentStop
  ↓ Extract context_summary from transcript
  ↓ stopAgent() — save to DB
  ↓ WebSocket broadcast to Web UI
```

## Key Services

### intelligence.ts

The brain of mimir. Two main functions:

- **`buildSmartContext()`** — Called on SubagentStart. Assembles relevant context from siblings, same-type history, cross-session data, and tagged entries.
- **`buildPromptContext()`** — Called on UserPromptSubmit. Shows active agents, open tasks, recent decisions/blockers, and completed agent summaries.
