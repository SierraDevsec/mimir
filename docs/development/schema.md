---
title: DuckDB Schema
layout: default
parent: Development
nav_order: 5
---

# DuckDB Schema

Mimir uses DuckDB as its local database. Data is stored at `data/mimir.duckdb`.

## Tables

### projects

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR PK | Project identifier |
| name | VARCHAR | Project name |
| path | VARCHAR UNIQUE | Filesystem path |
| created_at | TIMESTAMP | Auto-set via `now()` |

### sessions

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR PK | Session identifier |
| project_id | VARCHAR | FK to projects |
| started_at | TIMESTAMP | Auto-set via `now()` |
| ended_at | TIMESTAMP | Set on session end |
| status | VARCHAR | `active` / `ended` |

### agents

| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR PK | Agent identifier |
| session_id | VARCHAR | FK to sessions |
| agent_name | VARCHAR | Display name |
| agent_type | VARCHAR | Role type |
| parent_agent_id | VARCHAR | FK to agents (parent) |
| status | VARCHAR | `active` / `completed` |
| started_at | TIMESTAMP | Auto-set via `now()` |
| completed_at | TIMESTAMP | Set on stop |
| context_summary | TEXT | Extracted work summary |
| input_tokens | INTEGER | Token usage (input) |
| output_tokens | INTEGER | Token usage (output) |

### context_entries

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| session_id | VARCHAR | FK to sessions |
| agent_id | VARCHAR | FK to agents |
| entry_type | VARCHAR | `decision` / `blocker` / `handoff` / `agent_summary` / `note` |
| content | TEXT | Entry content |
| tags | VARCHAR[] | Tags for filtering |
| created_at | TIMESTAMP | Auto-set via `now()` |

### file_changes

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| session_id | VARCHAR | FK to sessions |
| agent_id | VARCHAR | FK to agents |
| file_path | VARCHAR | Changed file path |
| change_type | VARCHAR | `Edit` / `Write` |
| created_at | TIMESTAMP | Auto-set via `now()` |

### tasks

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| project_id | VARCHAR | FK to projects |
| title | VARCHAR | Task title |
| description | TEXT | Task details |
| status | VARCHAR | `idea` / `planned` / `pending` / `in_progress` / `needs_review` / `completed` |
| assigned_to | VARCHAR | Agent name |
| tags | VARCHAR[] | Tags |
| created_at | TIMESTAMP | Auto-set via `now()` |
| updated_at | TIMESTAMP | Auto-set via `now()` |

### task_comments

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| task_id | INTEGER | FK to tasks |
| author | VARCHAR | Comment author |
| comment_type | VARCHAR | `plan` / `review` / `note` |
| content | TEXT | Comment content |
| created_at | TIMESTAMP | Auto-set via `now()` |

### activity_log

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER PK | Auto-increment |
| session_id | VARCHAR | FK to sessions |
| agent_id | VARCHAR | FK to agents |
| event_type | VARCHAR | Event type |
| details | JSON | Event details |
| created_at | TIMESTAMP | Auto-set via `now()` |

## DuckDB Notes

- Always use `now()` — not `current_timestamp`
- `COUNT(*)` returns BigInt — wrap with `Number()`
- `VARCHAR[]` arrays need literal construction, bind params don't work
- Database file: `data/mimir.duckdb`
