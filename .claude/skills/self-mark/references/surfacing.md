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
  HTTP POST → mimir daemon → DuckDB INSERT (immediate)
       │
       │  ... time passes ... Agent B starts ...
       │
       ▼
  SubagentStart hook fires for Agent B
       │
       ▼
  buildSmartContext() queries DuckDB
       │
       ├── Stage 8: Sibling observations (same session, same parent)
       │   → "3 observation(s) from sibling agents available"
       │
       └── Stage 9: Cross-session summaries (same project, past sessions)
           → "2 past session summary(ies) available"
       │
       ▼
  Injected as additionalContext into Agent B's system prompt
       │
       ▼
  Agent B sees: "Team Observations: 3 observation(s)... Use search_observations to search"
  Agent B calls search_observations → gets_details → reads your mark
```

---

## Push: Automatic Injection (SubagentStart)

When a new agent starts, `buildSmartContext()` runs 9 priority stages:

| Priority | Stage | What it injects |
|----------|-------|----------------|
| 1 (highest) | Assigned tasks | Tasks for this agent |
| 2 | Pending messages | Unread messages |
| 3 | Sibling summaries | context_summary from sibling agents |
| 4 | Same-type history | Past agents with same name/type |
| 5 | Tagged context | Context entries matching agent |
| 6 | Cross-session context | Previous session entries |
| 7 | Fallback | Recent context (if nothing else found) |
| **8** | **Sibling observations** | **Count + search hint (your marks)** |
| **9** | **Cross-session summaries** | **Count + search hint** |

**Budget**: 4000 characters total. Stages are added top-down until budget is exhausted.
High-priority stages (tasks, messages, sibling summaries) take precedence.

**Current limitation**: Stages 8 and 9 only inject a **count and hint**,
not the actual mark content. The receiving agent must use MCP tools to
search and read the full marks. This is intentional — Progressive Disclosure
prevents context bloat from dumping all marks into every agent.

---

## Pull: On-Demand Search (MCP Tools)

Agents can search marks at any time using the 3-layer workflow:

```
1. search_observations(query)  → index (id, type, title, ~50 tokens/result)
2. get_timeline(anchor_id)     → chronological context around a mark
3. get_details(ids)            → full content (~500 tokens/result)
```

**When agents search**: When the push hint says "N observations available"
or when working on a file that might have related marks.

**When agents don't search**: Most of the time. Pull-based search requires
the agent to think "I should check for past marks" — which happens less
often than we'd like. This is why push (auto-injection) is the primary
delivery mechanism.

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
2. **That's it**

The system handles:
- Storage (DuckDB, immediate)
- Indexing (FTS for search)
- Push delivery (SubagentStart hook → buildSmartContext)
- Pull availability (MCP tools for on-demand search)
- Lifecycle (curator promotes repeated marks to rules/)

You don't need to:
- Notify other agents
- Format marks for delivery
- Tag marks with file paths (concepts handle searchability)
- Worry about deduplication (curator handles it)
