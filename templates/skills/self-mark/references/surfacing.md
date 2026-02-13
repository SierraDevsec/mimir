# How Marks Reach Other Agents

## Table of Contents

- The Full Pipeline
- Push: Automatic Injection (SubagentStart)
- Pull: On-Demand Search (MCP Tools)
- Hot → Warm → Cold Lifecycle
- What You Need to Do (Nothing)

---

## The Full Pipeline

```
You call save_observation()
       │
       ▼
  HTTP POST → mimir daemon → DuckDB INSERT + CHECKPOINT
       │
       │  async: Cloudflare bge-m3 embedding → UPDATE embedding column
       │
       │  ... time passes ... Agent B starts ...
       │
       ▼
  SubagentStart hook fires for Agent B
       │
       ▼
  buildSmartContext() queries DuckDB (6000 char budget)
       │
       ├── Stage 8: Sibling marks (same session, same parent)
       │   → "## Team Marks" with mark titles directly listed
       │
       └── Stage 9: Cross-session marks (RAG cosine similarity or fallback)
           → "## Past Marks" with mark titles directly listed
       │
       ▼
  Injected as additionalContext into Agent B's system prompt
       │
       ▼
  Agent B sees mark titles and can search for full details
```

---

## Push: Automatic Injection (SubagentStart)

When a new agent starts, `buildSmartContext()` runs priority stages:

| Priority | Stage | What it injects |
|----------|-------|----------------|
| 1 (highest) | Assigned tasks | Tasks for this agent |
| 2 | Pending messages | Unread messages |
| 3 | Sibling summaries | context_summary from sibling agents |
| 4 | Same-type history | Past agents with same name/type |
| 5 | Tagged context | Context entries matching agent |
| 6 | Cross-session context | Previous session entries |
| 7 | Fallback | Recent context (if nothing else found) |
| **8** | **Sibling marks** | **Mark titles from sibling agents (Team Marks)** |
| **9** | **Cross-session marks** | **RAG-ranked mark titles (Past Marks)** |

**Budget**: 6000 characters total. Stages are added top-down until budget is exhausted.
High-priority stages (tasks, messages, sibling summaries) take precedence.

**Stage 8** — Sibling Marks (same session, same parent agent):
- Queries marks from sibling agents in the current session
- Injects actual titles: `- [warning] DuckDB BigInt needs Number() (by node-backend)`
- Filters: `promoted_to IS NULL`, `status = 'active'`
- Limit: 5 marks

**Stage 9** — Cross-Session Marks:
- **RAG path** (when Cloudflare embedding enabled):
  Agent name + type + task titles → embedding → cosine similarity → TOP 5 relevant marks
- **Fallback path** (no embedding):
  File-based marks (matching agent's file changes) + project marks (recency) → deduplicated → 5 marks
- Injects actual titles: `- [decision] Chose Hono over Express (by node-backend)`
- Filters: different session, `promoted_to IS NULL`, `status = 'active'`

**Resolved marks** (`status = 'resolved'`) are excluded from all push injection.

---

## Pull: On-Demand Search (MCP Tools)

Agents can search marks at any time using the 3-layer workflow:

```
1. search_observations(query)  → index (id, type, title, ~50 tokens/result)
2. get_timeline(anchor_id)     → chronological context around a mark
3. get_details(ids)            → full content (~500 tokens/result)
```

**When to search**: See the `self-search` skill for timing guide and rationalizations.

**RAG transparency**: `search_observations` uses RAG (embedding + cosine similarity)
when available, falls back to ILIKE text matching otherwise. The caller doesn't need
to know which path is used — results are ranked by relevance either way.

**Resolved marks**: Included in pull search results (historical knowledge is preserved).
Only excluded from push injection.

---

## Hot → Warm → Cold Lifecycle

Marks have a natural lifecycle:

```
Hot (immediate)     → Current session marks
                      Pushed via buildSmartContext stages 8-9
                      Highest relevance, freshest context

Warm (searchable)   → Past session marks
                      Searchable via MCP tools
                      Still relevant, but needs explicit search

Cold (permanent)    → Promoted to rules/ or CLAUDE.md
                      Curator agent detects repeated marks (3+ occurrences)
                      Promotes them to project rules (auto-loaded every session)
                      The mark itself becomes redundant
```

### Promotion example

```
Session 1: Agent A marks "DuckDB BigInt needs Number()"
Session 2: Agent C marks "COUNT(*) returns BigInt, not Number"
Session 3: Agent E marks "BigInt from DuckDB — wrap with Number()"

Curator detects pattern → adds to rules/known-issues.md:
  "DuckDB COUNT(*) returns BigInt — always wrap with Number()"

Future: Every agent reads this from rules/ automatically.
        The individual marks are now redundant (but preserved in DB).
```

---

## What You Need to Do (Nothing)

As a marking agent, your only job is:

1. **Call `save_observation()`** when you find something worth marking
2. **Call `search_observations()`** before starting work (see `self-search` skill)
3. **That's it**

The system handles:
- Storage (DuckDB, immediate CHECKPOINT)
- Embedding (async Cloudflare bge-m3 for RAG search)
- Push delivery (SubagentStart hook → buildSmartContext)
- Pull availability (MCP tools for on-demand search)
- Lifecycle (curator promotes repeated marks to rules/)

You don't need to:
- Notify other agents
- Format marks for delivery
- Worry about deduplication (curator handles it)
