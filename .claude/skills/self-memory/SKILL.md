---
name: self-memory
description: >
  Instructs agents to update their own MEMORY.md after significant work.
  Use alongside self-mark and self-search. Marks capture immediate discoveries
  (hot memory); MEMORY.md accumulates lasting patterns, gotchas, and domain
  knowledge across sessions (cold memory). Agents write to
  .claude/agent-memory/{agent-name}/MEMORY.md before finishing a task.
version: 1.0.0
---

# Update Your Memory Before You Finish

When you complete significant work, update your MEMORY.md with patterns and
gotchas that will help **your future self** on the next invocation.
Not every task — only when you learned something lasting.

## Memory File Location

```
.claude/agent-memory/{your-agent-name}/MEMORY.md
```

Read your MEMORY.md at **task start** (if it exists) to recall past knowledge.
Write to it **before finishing** when you have new lasting knowledge.

---

## When to Update Memory

| Trigger | Example |
|---------|---------|
| Discovered a code pattern | "Service functions always use `const db = await getDb()`" |
| Hit a gotcha that will recur | "DuckDB VARCHAR[] can't use bind params" |
| Found a cross-domain dependency | "API types in web/api.ts must match server responses" |
| Made an architectural decision | "Chose HNSW over IVFFlat for cosine similarity index" |

## When NOT to Update

- Trivial or one-off changes (typo fix, single log line)
- Things already in CLAUDE.md or rules/ (already in every agent's context)
- Session-specific context that won't matter next time (use `self-mark` for those)

**Test**: "Will I need to know this next time I work in this domain?"
If no -> skip. If yes -> update memory.

---

## MEMORY.md Structure

Follow this standard format (create sections as needed):

```markdown
# {agent-name} Memory
> Last updated: {date}

## Code Patterns
- Recurring patterns in your domain (service patterns, data fetching, etc.)

## Known Gotchas
- Traps, surprises, things that break in non-obvious ways

## Cross-domain Dependencies
- Files/modules that must stay in sync with other domains

## Recent Context
- Latest major changes or decisions affecting your domain
```

---

## Rationalizations (Do Not Skip)

| Rationalization | Why It's Wrong | Required Action |
|-----------------|----------------|-----------------|
| "Marks are enough" | Marks are transient; memory persists across promotions and pruning | Update memory for lasting patterns |
| "Curator will do it" | Curator runs infrequently; you have the freshest context | Write it now, curator refines later |
| "Too busy implementing" | 2 minutes now saves 20 minutes of re-discovery next session | Update before you finish |

---

## Rules

1. **Read memory at task start** — load your accumulated knowledge
2. **Update before finishing** — when you learned something lasting
3. **Append, don't overwrite** — add to existing sections, update stale entries
4. **Keep entries concise** — one line per pattern/gotcha, expand only if needed
5. **Update the date** — change "Last updated" to today's date
6. **Don't duplicate** — if it's in CLAUDE.md or rules/, don't repeat it here

---

## How Memory Fits the Knowledge Lifecycle

```
self-mark    -> immediate capture   -> DuckDB observations (hot)
self-search  -> retrieve past marks -> DuckDB observations (warm)
self-memory  -> lasting patterns    -> MEMORY.md file     (cold)
curator      -> quality control     -> rules/ promotion   (permanent)
```

Marks are for **discoveries in the moment**.
Memory is for **patterns that persist across sessions**.
