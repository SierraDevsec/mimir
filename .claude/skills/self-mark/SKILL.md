---
name: self-mark
description: >
  Instructs agents to mark important discoveries during work. Uses
  save_observation MCP tool when available (Agent Teams/tmux), falls back to
  curl HTTP API for Task tool subagents. Marks are stored in DuckDB and
  auto-surfaced to later agents working on related files.
version: 3.0.0
---

# Self-Marking Protocol

When you encounter something worth remembering, mark it **immediately**.
Not at the end — during work.

## How to Mark

**Option 1 — MCP tool** (if available):
```
save_observation({ text: "one sentence", type: "warning", concepts: ["keyword"], files: ["src/file.ts"] })
```

**Option 2 — curl fallback** (if MCP tool is unavailable):
```bash
curl -s -X POST http://localhost:${CLNODE_PORT:-3100}/api/observations \
  -H 'Content-Type: application/json' \
  -d '{"project_id":"'"${CLNODE_PROJECT_ID:-clnode}"'","text":"one sentence","type":"warning","concepts":["keyword"],"files":["src/file.ts"]}'
```

**Try MCP first.** If `save_observation` tool is not in your tool list, use curl via Bash.

---

## Rationalizations (Do Not Skip)

| Rationalization | Why It's Wrong | Required Action |
|-----------------|----------------|-----------------|
| "I'll mark at the end" | You'll forget context and nuance | Mark the moment you discover |
| "This is obvious" | Obvious to you now, not to Agent B tomorrow | If the code doesn't say it, mark it |
| "Too small to mark" | BigInt gotcha is 1 line — saved 3 agents hours | Small marks have outsized value |
| "I have too many things to mark" | You're batching — mark one, continue work | One mark per discovery, inline |

---

## Quick Reference

| Type | When to mark | Signal phrase |
|------|-------------|---------------|
| `warning` | Unexpected behavior, trap, gotcha | "This looks like X but actually does Y" |
| `decision` | Chose A over B, reason isn't in code | "We picked X because Y" |
| `discovery` | Learned something undocumented | "Turns out X works this way" |
| `note` | Context that doesn't fit above | "Worth knowing that X" |

For detailed type guidance with edge cases, see
[references/categories.md](references/categories.md).

---

## When NOT to Mark

- What the code does — code says it
- How something works — code shows it
- Routine changes — git history tracks it
- Things already in CLAUDE.md or rules/ — already in every agent's context

**Test**: "Would a fresh agent touching this file benefit from knowing this?"
If no → don't mark. If yes → mark.

---

## Mark Fields

| Field | Rule | Example |
|-------|------|---------|
| `text` | One sentence. What + why. | "hook.sh has 3s curl timeout — can't do heavy processing" |
| `type` | warning / decision / discovery / note | "warning" |
| `concepts` | 2-4 searchable keywords | ["hooks", "timeout", "curl"] |
| `files` | Related files (read or modified) | ["src/hooks/hook.sh"] |

---

## Examples by Domain

**Backend** (Hono, DuckDB, hooks):
```
text: "DuckDB VARCHAR[] needs literal construction, not bind parameters"
type: "warning", concepts: ["duckdb", "array", "bind-params"], files: ["src/server/db.ts"]
```

**Frontend** (React, Vite, Tailwind):
```
text: "container-type: inline-size required for @container queries in sidebar"
type: "discovery", concepts: ["css", "container-query", "sidebar"], files: ["src/web/components/Layout.tsx"]
```

**CLI/Hooks** (commander, hook.sh):
```
text: "hook.sh must exit 0 always — non-zero blocks Claude Code entirely"
type: "warning", concepts: ["hooks", "exit-code", "claude-code"], files: ["src/hooks/hook.sh"]
```

**Architecture decisions**:
```
text: "Chose Hono over Express — needed native SSE streaming for WebSocket fallback"
type: "decision", concepts: ["hono", "express", "sse", "server"], files: ["src/server/index.ts"]
```

---

## Rules

1. Mark **during work** — the moment you discover, not when you finish
2. **One mark per discovery** — do not batch multiple findings
3. **One sentence** for `text` — future agents scan, not read
4. Only mark what **the code alone cannot tell you**
5. **Include `files`** — the file(s) you were reading/modifying when you made the discovery

---

## How Marks Reach Other Agents

See [references/surfacing.md](references/surfacing.md) for the full pipeline.

**Short version**: Marks stored in DuckDB → SubagentStart hook queries marks
by task-related files → injected as `additionalContext` into the next agent.
You don't need to do anything — just mark and the system handles delivery.
