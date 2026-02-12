---
title: Compression
layout: default
parent: Guide
nav_order: 4
---

# Context Compression

clnode uses a 2-layer compression system to prevent the Leader agent's context from exploding.

## The Problem

When agents return results, uncompressed output can be 50-100+ lines. With 3-4 agents, the Leader's context grows by hundreds of lines per cycle, eventually hitting limits.

## 2-Layer Architecture

| Layer | When | Mechanism | Limit |
|-------|------|-----------|-------|
| **Skill Layer** | Agent composing output | `compress-output` / `compress-review` skill in frontmatter | 10 lines (general) / 20 lines (reviewer) |
| **Hook Layer** | Agent returning to Leader | `SubagentStop` extracts `context_summary` | Stored in DB for future agents |

The two layers work in series:

```
Agent finishes work
  ↓
compress-output skill forces [COMPRESSED] format (≤ 10 lines)
  ↓
SubagentStop hook extracts context_summary from transcript
  ↓
Summary saved to DuckDB
  ↓
Next agent receives only the compressed summary
```

## Compressed Output Format

Agents with `compress-output` skill must return in this format:

```
[COMPRESSED]
## Changed Files
- src/server/routes/api.ts — added GET /api/users endpoint
- src/server/services/user.ts — new user service with CRUD

## Key Decisions
- Used DuckDB parameterized queries for SQL injection prevention

## Issues
- None
```

## Skills

### compress-output
- For implementation agents (backend, frontend, CLI, etc.)
- 5-10 line limit
- Preloaded via agent frontmatter: `skills: [compress-output]`

### compress-review
- For reviewer agents
- Preserves finding details while staying concise
- Preloaded via agent frontmatter: `skills: [compress-review]`
