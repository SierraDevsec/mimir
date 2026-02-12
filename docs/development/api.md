---
title: API Reference
layout: default
parent: Development
nav_order: 4
---

# REST API Reference

Base URL: `http://localhost:3100`

## Health

```
GET /api/health
```

Returns `{ "status": "ok" }`.

## Projects

```
GET  /api/projects              # List all projects
GET  /api/projects/:id          # Get project by ID
```

## Sessions

```
GET  /api/sessions              # List sessions (?active=true for active only)
GET  /api/sessions/:id          # Get session by ID
```

## Agents

```
GET     /api/agents             # List agents (?active=true, ?session_id=..., ?project_id=...)
GET     /api/agents/:id         # Get agent by ID
DELETE  /api/agents/:id         # Kill agent (removes from DB)
```

## Context Entries

```
GET  /api/context               # List entries (?session_id=..., ?entry_type=..., ?search=...)
```

## File Changes

```
GET  /api/file-changes          # List changes (?session_id=..., ?agent_id=...)
```

## Tasks

```
GET    /api/tasks               # List tasks (?project_id=..., ?status=..., ?assigned_to=...)
GET    /api/tasks/:id           # Get task by ID
POST   /api/tasks               # Create task
PATCH  /api/tasks/:id           # Update task
DELETE /api/tasks/:id           # Delete task
```

**Create/Update body**:
```json
{
  "title": "Task title",
  "description": "Description",
  "status": "pending",
  "assigned_to": "backend-dev",
  "tags": ["backend", "api"],
  "project_id": "my-project"
}
```

## Task Comments

```
GET   /api/tasks/:id/comments   # List comments for task
POST  /api/tasks/:id/comments   # Add comment
```

**Comment body**:
```json
{
  "author": "reviewer",
  "comment_type": "review",
  "content": "LGTM, no issues found"
}
```

## Activity Log

```
GET  /api/activity              # List events (?session_id=..., ?event_type=...)
```

## Usage / Token Analytics

```
GET  /api/usage                 # Token usage stats (?session_id=..., ?project_id=...)
GET  /api/usage/summary         # Aggregated token summary
```

## Hook Events

```
POST  /hooks/SessionStart
POST  /hooks/SubagentStart
POST  /hooks/SubagentStop
POST  /hooks/PostToolUse
POST  /hooks/UserPromptSubmit
POST  /hooks/RegisterProject
```

See [Hook Events](hook-events) for details.

## WebSocket

```
ws://localhost:3100/ws
```

Broadcasts real-time events (agent start/stop, file changes, task updates) to connected Web UI clients.
