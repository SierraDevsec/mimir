---
title: Hook Events
layout: default
parent: Development
nav_order: 3
---

# Hook Events

clnode processes Claude Code lifecycle events via `hook.sh`, a shell script that reads JSON from stdin, POSTs to the daemon, and outputs the response to stdout.

## Event Flow

```
Claude Code → stdin (JSON) → hook.sh → curl POST → daemon → response → stdout → Claude Code
```

`hook.sh` always exits 0 to never block Claude Code. It has a 3-second curl timeout.

## Events

### SessionStart

**Trigger**: Claude Code session begins.

**Action**: Register session in DB, link to project via working directory path.

**Response**: `{}` (empty)

### SubagentStart

**Trigger**: Claude Code spawns a subagent.

**Input**:
```json
{
  "session_id": "...",
  "agent_id": "...",
  "agent_name": "backend-dev",
  "agent_type": "node-backend",
  "parent_agent_id": "..."
}
```

**Action**: Register agent in DB, build smart context.

**Response**:
```json
{
  "additionalContext": "## Sibling Agent Summaries\n- [reviewer] Found 3 issues..."
}
```

### SubagentStop

**Trigger**: Subagent completes.

**Input**: Includes `transcript` array with all agent messages.

**Action**: Extract `context_summary` from last assistant message, save to DB, record token usage.

**Response**: `{}` (empty)

### PostToolUse

**Trigger**: Any tool use completes.

**Action**: If tool is `Edit` or `Write`, record file change in DB.

**Response**: `{}` (empty)

### UserPromptSubmit

**Trigger**: User sends a message.

**Action**: Build project context (active agents, open tasks, decisions).

**Response**:
```json
{
  "additionalContext": "[clnode project context]\n\n## Active Agents\n..."
}
```

### RegisterProject

**Trigger**: `clnode init` command.

**Action**: Register project in DB with name and path.

**Response**: `{"project_id": "..."}`
