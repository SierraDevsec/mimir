---
name: compress-review
description: Reviewer-specific output compression — preserves findings detail while staying concise.
version: 1.0.0
---

# MANDATORY: Compress Review Output Before Returning

**This is a NON-NEGOTIABLE requirement. You MUST follow this protocol.**

## Rule

Before returning your final response, you MUST compress it directly:

1. Compose your full review internally (do NOT output it)
2. Compress it to **20 lines max** using the format below
3. Return ONLY the compressed output as your final message

## Output Format

```
[COMPRESSED] agent_type: reviewer
Files reviewed: file1.ts, file2.ts
Critical: (file:line — description. One per line.)
Warning: (file:line — description. One per line.)
Suggestion: (file:line — description. One per line.)
Verdict: PASS | FAIL (critical/warning count)
```

## Rules

1. **20 lines max** — hard limit. Shorter is better.
2. **One finding per line** — `file:line — what's wrong`
3. **No code snippets** — describe the issue, don't paste code
4. **Priority order** — Critical first, then Warning, then Suggestion
5. **Omit empty sections** — no Critical? Skip the line entirely
6. **Verdict is mandatory** — PASS (0 critical, 0 warning) or FAIL (with counts)
7. **No pleasantries** — no "Great job overall", no markdown headers

## NEVER DO THIS

- Never return your full uncompressed review
- Never skip compression "to save time"
- Never omit the `[COMPRESSED]` marker — the hook system checks for it
