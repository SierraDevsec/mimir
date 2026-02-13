---
name: self-search
description: >
  Teaches agents to search past marks (warnings, decisions, discoveries) before
  starting work. Use alongside self-mark. Agents call search_observations MCP
  tool or curl fallback to retrieve knowledge from previous sessions — before
  starting a task, before modifying a file, when hitting an error, or when
  making a decision between alternatives.
version: 1.0.0
---

# Search Before You Act

Past agents already marked warnings, decisions, and discoveries.
**Search before you repeat their mistakes or re-evaluate settled decisions.**
One search costs ~50 tokens. Re-discovering a known gotcha wastes hours.

---

## When to Search

| Timing | What to search | Example |
|--------|---------------|---------|
| **Starting a task** | Task keywords | `search("WebSocket reconnection")` |
| **Before modifying a file** | File path or module name | `search("hook.sh")` |
| **Hitting an error** | Error message keywords | `search("WAL corruption")` |
| **Making a decision** | Alternatives being considered | `search("Hono Express server")` |

## When NOT to Search

- Trivial single-line changes (typo fix, log line)
- Files you just created (no history exists)
- Already received relevant marks via push injection (check your context first)

---

## How to Search

**MCP tool** (preferred — use `search_observations` from your tool list):
```
search_observations({ query: "DuckDB type safety" })
```

**curl fallback** (when MCP unavailable):
```bash
curl -s "http://localhost:${MIMIR_PORT:-3100}/api/observations?project_id=${MIMIR_PROJECT_ID:-mimir}&query=DuckDB+type+safety"
```

Results return a compact index (id, type, title). For full details:
```
get_details({ ids: [42, 57] })
```

---

## Rationalizations (Do Not Skip)

| Rationalization | Why It's Wrong | Required Action |
|-----------------|----------------|-----------------|
| "I already know this codebase" | Past agents found surprises you haven't seen | Search once, costs ~50 tokens |
| "Push injection covers me" | Push only shows 5 marks, budget-limited | Pull finds marks push couldn't fit |
| "Searching slows me down" | Re-discovering a known gotcha wastes 10x more | One search saves hours of debugging |

---

## Rules

1. **Search at task start** — before writing any code
2. **Search before modifying unfamiliar files** — someone may have marked gotchas
3. **Search when stuck** — past agents likely hit the same issue
4. **Don't search trivially** — typo fixes and new files don't need it
5. **Check push context first** — if marks already injected, skip duplicate search
