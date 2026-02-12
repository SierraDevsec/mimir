---
title: Quick Start
layout: default
parent: Getting Started
nav_order: 2
---

# Quick Start

Run your first multi-agent swarm session after installing mimir.

## 1. Start the Daemon

```bash
npx mimir start
```

The daemon runs on `http://localhost:3100` by default.

## 2. Open Claude Code

Start a new Claude Code session in your project directory. The hooks are already installed from `mimir init`.

## 3. Give a Multi-Agent Task

Ask Claude Code something like:

```
Create a REST API endpoint for user profiles.
Use a backend agent for implementation and a reviewer agent to check the code.
```

Claude Code will:
1. Spawn a backend agent → mimir records it via `SubagentStart` hook
2. Agent completes work → mimir saves summary via `SubagentStop` hook
3. Spawn a reviewer agent → mimir injects backend agent's summary automatically
4. Reviewer sees what was built without the Leader relaying it

## 4. Monitor in Web UI

```bash
npx mimir ui
```

See active agents, context entries, and task status in real-time.

## 5. Create Custom Agents

Use the `/mimir-agents` skill in Claude Code to:
- Discover installed agents, skills, and rules
- Create new agents with proper frontmatter

## Key Concept

Agents communicate **through time**, not through the Leader:

```
Agent A finishes → summary saved to DuckDB
Agent B starts   → receives A's summary via additionalContext
Leader           → only makes high-level decisions
```

This keeps the Leader's context minimal while agents share results automatically.
