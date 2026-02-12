---
title: Home
layout: default
nav_order: 1
---

# clnode

**Claude Code Swarm Intelligence Plugin** — Turn one Claude Code session into a coordinated dev team.

---

Claude Code's multi-agent mode has a fundamental limitation: **agents can't communicate with each other**. Every result must flow through the Leader agent, and after a few review cycles, the Leader's context explodes.

clnode solves this by using Claude Code's own hook system to create a shared memory layer:

```
Agent A finishes → summary saved to DB
Agent B starts   → receives A's summary automatically
Leader           → stays lean, only makes decisions
```

No wrapper. No custom framework. Just a plugin that fills the gap.

## Key Features

- **No MCP Required** — Pure hook-based, just `npx clnode init .`
- **Smart Context Injection** — Sibling summaries, same-type history, cross-session context
- **Context Compression** — Automatic 2-layer output compression (10-line limit)
- **Token Analytics** — Track token usage per agent
- **6-Stage Kanban** — Visual task tracking with auto status updates
- **Web UI & VSCode Extension** — Real-time dashboard

[Get Started](getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/SierraDevsec/clnode){: .btn .fs-5 .mb-4 .mb-md-0 }
