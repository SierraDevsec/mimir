# Mark Categories — Detailed Guide

## Table of Contents

- The 4 Types
- Type: warning
- Type: decision
- Type: discovery
- Type: note
- Edge Cases and Judgement Calls
- What NOT to Mark (Extended)

---

## The 4 Types

Marks capture **what the code alone cannot tell you**. Four types cover all cases:

| Type | Core question | Lifetime |
|------|--------------|----------|
| `warning` | "What will bite someone who doesn't know this?" | Until the gotcha is fixed or documented |
| `decision` | "Why did we choose A over B?" | Permanent (prevents revisiting settled decisions) |
| `discovery` | "What did we learn about the codebase?" | Until it's added to CLAUDE.md or rules/ |
| `note` | "What context might help someone later?" | Variable |

### Selection flowchart

```
Did something behave unexpectedly?
  YES → warning

Did you choose between alternatives?
  YES → decision

Did you learn something undocumented about how the codebase works?
  YES → discovery

None of the above, but still worth recording?
  YES → note
  NO  → don't mark
```

---

## Type: warning

**Core**: Something that behaves differently than expected, or could trap
someone who doesn't know about it.

### Good warning marks

```
"DuckDB COUNT(*) returns BigInt — must wrap with Number() for arithmetic"
  concepts: [duckdb, bigint, type-safety]

"hook.sh has 3s curl timeout — can't do heavy DB queries inside hooks"
  concepts: [hooks, timeout, performance]

"window.open() name collision in VSCode webview — use openPage() instead"
  concepts: [vscode, webview, naming]

"acquireVsCodeApi() can only be called once per webview — cache the result"
  concepts: [vscode, webview, api]

"npx mimir start runs from npm cache, not local build — use node dist/server/index.js for dev"
  concepts: [cli, npx, development]
```

### Not a warning

```
"This function returns a number"     → code says this
"Remember to handle errors"          → generic advice, not a specific gotcha
"Tests might fail"                   → too vague, no specific trap
```

### Warning signals in your work

You just spent time debugging something because it didn't work as expected.
You read documentation to understand a surprising behavior.
You got an error that wasn't obvious from the code.

→ These are warnings.

---

## Type: decision

**Core**: You chose A over B and the reason isn't obvious from looking at the code.
Without this mark, a future agent might revisit the decision and waste time
re-evaluating the same alternatives.

### Good decision marks

```
"Chose Hono over Express — needed native SSE streaming support"
  concepts: [hono, express, server, sse]

"DuckDB over SQLite — concurrent write safety for parallel agents"
  concepts: [duckdb, sqlite, database, concurrency]

"CJS output for VSCode extension — VSCode extensions must use CommonJS"
  concepts: [vscode, extension, cjs, esm]

"Fire-and-forget hook pattern — never block Claude Code, exit 0 always"
  concepts: [hooks, reliability, architecture]

"PNG for extension icon, not SVG — VSCode extension list requires PNG"
  concepts: [vscode, extension, icon, format]
```

### Not a decision

```
"Used TypeScript"                     → no alternative was considered
"Added error handling"                → implementation detail, not a choice
"Created a new file"                  → action, not a decision between alternatives
```

### Decision signals in your work

You evaluated two or more options.
You chose one for a specific reason that isn't in the code.
Someone might reasonably ask "why didn't you use X instead?"

→ That's a decision.

---

## Type: discovery

**Core**: You learned something about the codebase that isn't documented
anywhere — not in code comments, not in CLAUDE.md, not in rules/.

### Good discovery marks

```
"hook.sh's SubagentStart is the only hook that returns additionalContext"
  concepts: [hooks, subagent, context-injection]

"container-type: inline-size is required for @container queries in sidebar webview"
  concepts: [css, container-query, vscode, sidebar]

"Transcript extraction needs 500ms delay — race condition with file write"
  concepts: [transcript, race-condition, timing]

"Agent killed by ESC → SubagentStop not fired → zombie row in agents table"
  concepts: [agent, lifecycle, zombie, cleanup]
```

### Not a discovery

```
"This file exports 3 functions"       → code shows this
"The server runs on port 3100"        → already in CLAUDE.md
"DuckDB uses SQL syntax"              → common knowledge
```

### Discovery signals in your work

You read code to understand something that wasn't documented.
You found a behavior through experimentation rather than documentation.
The codebase works in a way you didn't expect based on the docs.

→ That's a discovery.

### Discovery → rules/ promotion

When the same discovery appears 3+ times across sessions, it should be
promoted to `rules/` or `CLAUDE.md` by the curator agent. At that point,
the mark becomes redundant (every agent reads rules/ automatically).

---

## Type: note

**Core**: Catch-all for context that doesn't fit the other three types
but is still worth recording for future agents.

### Good note marks

```
"PostToolUse hook might support additionalContext return — needs verification"
  concepts: [hooks, post-tool-use, investigation]

"VSCode Extension requires Reload Window after install — no hot reload"
  concepts: [vscode, extension, reload]

"Web UI embed mode activated by ?embed=true query parameter"
  concepts: [web-ui, embed, vscode]
```

### When to use note vs other types

- If it's a trap → `warning`
- If it's a choice with alternatives → `decision`
- If it's newly learned codebase behavior → `discovery`
- If it's context that helps but doesn't fit above → `note`

Use `note` sparingly. Most marks should be one of the three specific types.

---

## Edge Cases and Judgement Calls

### "This is already in CLAUDE.md"

Don't mark it. CLAUDE.md loads into every agent's context automatically.
Marking it creates duplicate information with no added value.

### "I fixed a bug — should I mark the bug?"

Mark the **gotcha that caused the bug**, not the fix itself.

```
Good:  type: warning, "DuckDB UNION ALL requires matching column count — silent data loss if mismatched"
Bad:   type: note, "Fixed the query to use correct column count"
```

The fix is in git history. The gotcha is what prevents the next person
from making the same mistake.

### "I'm not sure if this is worth marking"

Mark it. A slightly noisy DB is better than lost knowledge.
The curator agent can clean up low-value marks later.
But a mark you didn't create is gone forever.

### "Multiple related findings"

Create separate marks. One per discovery.

```
Good:
  Mark 1: "DuckDB BigInt from COUNT(*) needs Number() wrap"
  Mark 2: "DuckDB VARCHAR[] needs literal construction, not bind params"

Bad:
  Mark 1: "DuckDB has several type gotchas including BigInt and VARCHAR[]..."
```

Separate marks are independently searchable and can surface to different
agents working on different files.

---

## What NOT to Mark (Extended)

| Category | Example | Why not |
|----------|---------|---------|
| Code description | "This function validates input" | Code says it |
| Implementation detail | "Used map() instead of for loop" | Code shows it |
| Routine changes | "Added error handling to API endpoint" | Git history |
| Generic best practices | "Always handle edge cases" | Claude already knows |
| Already documented | "Server runs on port 3100" | In CLAUDE.md |
| Temporary state | "Currently debugging X" | No value to future agents |
| Personal preference | "I prefer tabs over spaces" | Not actionable knowledge |
