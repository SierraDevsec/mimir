---
name: compress-output
description: Forces agent to compress its final output before returning to Leader. Preload this skill in agent frontmatter to enforce output compression.
version: 2.0.2
---

# MANDATORY: Compress Your Output Before Returning

**This is a NON-NEGOTIABLE requirement. You MUST follow this protocol.**

## Rule

Before returning your final response, you MUST compress it directly:

1. Compose your full work report internally (do NOT output it)
2. Compress it to **10 lines max** using the format below
3. Return ONLY the compressed output as your final message

## Output Format

```
[COMPRESSED] agent_type: <your_type>
Changed files: file1.ts, file2.ts
Result: (1-3 line summary — what changed, key decisions, test results)
Decisions: (if any, omit if none)
Blockers: (if any, omit if none)
```

## Compression Rules

1. **10 lines max** — hard limit, never exceed 10 lines. Shorter is better.
2. **Signal over completeness** — one critical insight beats ten routine details
3. **Changed files as evidence** — file names, not code snippets
4. **Decisions over actions** — "chose X over Y because Z" beats "edited A, B, C"
5. **Blockers are priority 1** — if something blocks the next agent, lead with it
6. **No pleasantries** — no "I completed the task", no markdown headers

## NEVER DO THIS

- Never return your full uncompressed report directly
- Never skip compression "to save time"
- Never omit the `[COMPRESSED]` marker — the hook system checks for it
