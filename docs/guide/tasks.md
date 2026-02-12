---
title: Tasks
layout: default
parent: Guide
nav_order: 5
---

# Task Management

Mimir provides a 6-stage kanban system for tracking work across agent sessions.

## Task Stages

```
idea → planned → pending → in_progress → needs_review → completed
```

| Stage | Description |
|-------|-------------|
| **idea** | Raw idea, not yet planned |
| **planned** | Plan comment added, ready to be assigned |
| **pending** | Assigned but not yet started |
| **in_progress** | Agent actively working |
| **needs_review** | Implementation complete, awaiting review |
| **completed** | Review passed, done |

## Automatic Status Updates

- **SubagentStart** → Auto-assigns pending tasks to `in_progress`
- **SubagentStop** → Auto-completes `in_progress` tasks

## Review Loop Protocol

When a reviewer finds issues:

```
Implement → Review → Fix → Ask user "Re-review?"
                              ├─ "yes" → Run reviewer again
                              └─ "no" → Add needs_review tag, end
```

Rules:
- **Warning/Critical** findings must be fixed
- **Suggestions** are optional
- Leader always asks user before triggering re-review (prevents infinite loops)

## Task API

```bash
# List tasks
curl http://localhost:3100/api/tasks

# Create task
curl -X POST http://localhost:3100/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Add user endpoint", "description": "REST API for user CRUD"}'

# Update task
curl -X PATCH http://localhost:3100/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "assigned_to": "backend-dev"}'
```

Tasks can also be managed through the Web UI kanban board.
