# Self-Marking: The Swarm That Remembers

## Why This Matters

Most AI memory systems follow the same pattern: an **external observer** watches what an agent does, then compresses it after the fact. This is like hiring someone to take meeting notes who wasn't actually in the meeting — they can describe what happened, but they can't tell you **why**.

clnode takes a fundamentally different approach: **agents mark their own discoveries as they work.**

```
Observer pattern (claude-mem etc.):
  Agent works → External AI watches → Guesses what was important → Stores summary
  Problem: The observer doesn't know WHY the agent did something

Self-marking pattern (clnode):
  Agent works → Discovers something important → Marks it immediately → Stored in DuckDB
  Advantage: The agent knows exactly what matters and why
```

## What Makes clnode Unique

No other public project combines all of these:

| Capability | clnode | claude-mem | MEMORY.md | RAG tools |
|-----------|--------|------------|-----------|-----------|
| Agent self-marking (not external AI) | Yes | No | No | No |
| Multi-agent propagation | Yes | No | No | No |
| Cross-session persistence | Yes | Yes | Yes | Yes |
| Automatic injection (push) | Yes | No | No | No |
| Zero additional API cost | Yes | No | N/A | Varies |
| Warm-to-cold promotion | Yes | No | No | No |
| Built on vanilla Claude Code | Yes | Yes | Yes | N/A |

**claude-mem** created "a remembering individual" — a single agent that recalls past work.
**clnode** created "a remembering team" — a swarm where knowledge flows between agents across sessions.

## How It Works

### Agent Self-Marking

When an agent encounters something worth remembering, it marks it immediately:

```
Agent A works on backend task
  → discovers DuckDB BigInt gotcha
  → marks: { type: "warning", text: "COUNT(*) returns BigInt, wrap with Number()" }
  → stored in DuckDB immediately

Agent B starts later, touches the same area
  → system auto-surfaces: "Warning from Agent A: BigInt needs Number() wrapping"
  → Agent B avoids the same mistake
```

### Mark Categories

| Type | When to mark | Example |
|------|-------------|---------|
| **warning** | Gotcha, trap, non-obvious behavior | "DuckDB BigInt needs Number() wrap" |
| **decision** | Chose A over B with reasoning | "Hono over Express: streaming SSE support" |
| **discovery** | Learned something undocumented | "hook.sh has 3s curl timeout" |
| **note** | Other useful context | "PostToolUse doesn't support additionalContext" |

### Three-Tier Memory Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  Cold (Permanent)     .claude/rules/ files              │
│  ─────────────────    Auto-loaded every conversation    │
│                       Zero cost per turn                │
│                       Promoted from repeated patterns   │
├─────────────────────────────────────────────────────────┤
│  Warm (Searchable)    DuckDB (past sessions)            │
│  ─────────────────    Auto-injected via hooks           │
│                       + MCP tools for manual search     │
│                       Curator promotes to Cold          │
├─────────────────────────────────────────────────────────┤
│  Hot (Immediate)      DuckDB (current session)          │
│  ─────────────────    Auto-injected to sibling agents   │
│                       Real-time, zero latency           │
└─────────────────────────────────────────────────────────┘
```

**Transitions:**
- **Hot → Warm**: Automatic (session ends, marks persist in DuckDB)
- **Warm → Cold**: Curator agent identifies repeated patterns → creates `rules/` file → marks promoted (excluded from future injection to avoid duplicates)

### Automatic Injection Pipeline

```
Agent marks something important
  → DuckDB INSERT (immediate)
  → Same session, other agent starts (SubagentStart hook)
      → Past marks auto-injected via additionalContext
  → Next session, Leader types prompt (UserPromptSubmit hook)
      → Past marks auto-injected via additionalContext
  → Next session, subagent starts (SubagentStart hook)
      → Past marks auto-injected via additionalContext
```

**Every path is automatic. No manual search needed. Zero additional API cost.**

### Marking Mechanism: Hybrid Approach

```
Agent Teams (tmux sessions):
  → MCP tool: save_observation (direct DuckDB access)

Task tool subagents:
  → curl POST /api/observations (HTTP fallback)
  → Reason: MCP tools unavailable in Task tool subagents
```

Both paths end at the same DuckDB table. The skill automatically detects the environment and uses the appropriate method.

## The Key Insight

> Agents don't talk to each other directly. They talk through time.
>
> Agent A finishes and leaves marks in DB.
> Agent B starts later and receives those marks automatically.
>
> The hook system is the message bus. DuckDB is the mailbox.
> And agents write their own messages — not an external observer.

## Cost Comparison

| System | Memory Creation Cost | Memory Retrieval Cost |
|--------|--------------------|-----------------------|
| claude-mem | Haiku API call per agent | MCP tool call |
| Custom RAG | Embedding API calls | Vector search API |
| clnode | **$0** (agent self-marks) | **$0** (hook auto-injection) |

clnode achieves long-term swarm memory with zero additional API cost because:
1. Marking is done by the agent already running (no extra AI call)
2. Injection is done by hooks (shell script + HTTP, no AI involved)
3. Search uses DuckDB FTS locally (no external API)

## Real-World Example

Session 1: Backend agent discovers DuckDB `COUNT(*)` returns BigInt, not Number.
```
→ Marks: { type: "warning", text: "DuckDB COUNT(*) returns BigInt — must wrap with Number()" }
```

Session 2: New agent starts working on a different feature that uses COUNT.
```
→ UserPromptSubmit hook fires
→ Past Marks automatically injected:
    "- [warning] DuckDB COUNT(*) returns BigInt — must wrap with Number()"
→ Agent sees the warning before writing any code
→ Bug prevented before it could happen
```

Session 5: Curator notices this warning appeared 4 times across sessions.
```
→ Promotes to .claude/rules/duckdb.md
→ Now loaded into EVERY agent's system prompt automatically
→ Original marks excluded from future injection (no duplicates)
```

This is the progression: **discovery → shared knowledge → permanent team wisdom**.
