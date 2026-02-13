---
title: How It Works
layout: default
parent: Guide
nav_order: 1
---

# How It Works

Mimir uses Claude Code's built-in hook system to intercept agent lifecycle events and route context through a local DuckDB database.

## Architecture

```
Claude Code Session
│
├── Agent A starts  ──→  hook ──→  mimir daemon ──→  DuckDB (store)
├── Agent A stops   ──→  hook ──→  mimir daemon ──→  DuckDB (save summary)
├── Agent B starts  ──→  hook ──→  mimir daemon ──→  DuckDB (read A's summary)
│                                       │
│                                       └──→ stdout: additionalContext
│                                             (A's results injected into B)
└── Leader only sees final reports — context stays minimal
```

## Hook Events

Mimir intercepts these Claude Code lifecycle events:

| Event | When | What Mimir Does |
|-------|------|------------------|
| **SessionStart** | Claude Code session begins | Register session, link to project |
| **SubagentStart** | Agent spawned | Register agent, inject smart context via `additionalContext` |
| **SubagentStop** | Agent finishes | Save agent's work summary to DB |
| **PostToolUse** | Edit/Write tool used | Track file changes |
| **UserPromptSubmit** | User sends a message | Attach project context (active agents, tasks, decisions) |

## The Key Insight

**Agents don't talk to each other directly. They talk through time.**

Agent A finishes and leaves a summary in DuckDB. Agent B starts later and receives that summary automatically through the hook system. The hook is the message bus, DuckDB is the mailbox.

## Components

| Component | Role |
|-----------|------|
| **hook.sh** | Shell script that reads stdin, POSTs to daemon, outputs to stdout |
| **Daemon** | Hono server on port 3100 — processes hook events, serves Web UI |
| **DuckDB** | Local database storing sessions, agents, context, tasks |
| **Skills** | LLM instructions preloaded into agents (self-mark, self-search, self-memory) |
| **Rules** | Project-wide conventions auto-loaded every conversation |
