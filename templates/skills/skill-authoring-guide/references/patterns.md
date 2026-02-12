# Proven Patterns from Top Skills

## Table of Contents

- Rationalizations Table (Trail of Bits)
- Modular Phase Split (Trail of Bits)
- Structured Finding Format (Sentry)
- Bundled Scripts (Sentry)
- Iterative Feedback Loop (Sentry)
- Anti-Hallucination Guards (Trail of Bits)
- Decision Tree Routing (Trail of Bits)
- Quality Thresholds (Trail of Bits)

---

## Rationalizations Table (Trail of Bits)

**Source**: audit-context-building, differential-review

Preempt excuses for skipping instructions. This pattern dramatically improves
agent compliance because it addresses the exact rationalizations models produce.

```markdown
| Rationalization | Why It's Wrong | Required Action |
|-----------------|----------------|-----------------|
| "Small PR, quick review" | Heartbleed was 2 lines | Classify by RISK, not size |
| "I know this codebase" | Familiarity breeds blind spots | Build explicit context |
| "I'll remember this" | Context degrades | Write it down explicitly |
| "This is taking too long" | Rushed work = hallucinated output | Slow is fast |
```

**When to use**: Any skill where agents might cut corners.
Best placed immediately after Core Principles, before the workflow.

---

## Modular Phase Split (Trail of Bits)

**Source**: differential-review (5 files, 217-line SKILL.md)

Break a complex workflow into phase files. SKILL.md becomes a router.

```
SKILL.md
├── Core Principles (5 lines)
├── Quick Reference (table)
├── Decision Tree → routes to phase files
├── Quality Checklist
└── Supporting Documentation links

methodology.md    — Phases 0-4 (the "how")
adversarial.md    — Phase 5 (conditional, HIGH RISK only)
reporting.md      — Phase 6 (output templates)
patterns.md       — Reference lookup (vulnerability patterns)
```

**Key insight**: SKILL.md alone is sufficient for quick triage.
Reference files are only needed for full deep analysis.

**When to use**: Skills with 3+ workflow phases or conditional branches
that don't always apply.

---

## Structured Finding Format (Sentry)

**Source**: find-bugs

Every finding follows a rigid structure. This prevents vague or inconsistent output.

```markdown
For each issue:
* **File:Line** - Brief description
* **Severity**: Critical/High/Medium/Low
* **Problem**: What's wrong
* **Evidence**: Why this is real (not already fixed, no existing test)
* **Fix**: Concrete suggestion
```

**When to use**: Any skill that produces categorized findings, marks,
or observations. Adapt the fields to your domain.

**clnode mark equivalent**:
```
save_observation({
  text: "DuckDB COUNT(*) returns BigInt — wrap with Number()",
  type: "warning",
  concepts: ["duckdb", "bigint", "type-safety"]
})
```

---

## Bundled Scripts (Sentry)

**Source**: iterate-pr

Skills can bundle executable scripts that return structured data:

```bash
uv run ${CLAUDE_SKILL_ROOT}/scripts/fetch_pr_checks.py
```

Returns structured JSON:
```json
{
  "summary": {"total": 5, "passed": 3, "failed": 2},
  "checks": [{"name": "tests", "status": "fail", "log_snippet": "..."}]
}
```

**Benefits**:
- Deterministic (no LLM interpretation needed)
- Token efficient (script runs without loading into context)
- Reusable across invocations

**When to use**: Repetitive data gathering, format conversion,
validation, or any task where the same code gets rewritten each time.

---

## Iterative Feedback Loop (Sentry)

**Source**: iterate-pr

Structured cycle with explicit exit conditions:

```
1. Identify → 2. Check status → 3. Fix → 4. Push → 5. Wait → 6. Repeat
                                                                   │
Exit conditions:                                                   │
  ✓ Success: all checks pass                                       │
  ✗ Ask help: same failure after 3 attempts                        │
  ✗ Stop: precondition not met                                     │
```

**Key elements**:
- Numbered sequential steps
- Clear exit conditions (success, failure, blocked)
- Maximum retry count to prevent infinite loops
- Fallback instructions when primary method fails

**When to use**: Any skill with a retry/iterate cycle.

---

## Anti-Hallucination Guards (Trail of Bits)

**Source**: audit-context-building

Explicit rules to prevent the model from making things up:

```markdown
## Stability Rules

- Never reshape evidence to fit earlier assumptions
- When contradicted: update the model, state the correction explicitly
- Avoid vague guesses — use "Unclear; need to inspect X" instead
- Cross-reference new insights against prior context
```

**When to use**: Skills where accuracy is critical and the model
might fill gaps with plausible-sounding but wrong information.

---

## Decision Tree Routing (Trail of Bits)

**Source**: differential-review

Replace prose with a visual tree for workflow branching:

```markdown
## Decision Tree

├─ Need detailed methodology?
│  └─ Read: methodology.md
│
├─ Analyzing HIGH RISK change?
│  └─ Read: adversarial.md
│
├─ Writing the final report?
│  └─ Read: reporting.md
│
└─ Quick triage only?
   └─ Use Quick Reference above
```

**Benefits**:
- Agent can scan in <5 seconds
- Prevents loading unnecessary reference files
- Works as a navigation index

**When to use**: Any skill with 2+ reference files or 3+ workflow branches.

---

## Quality Thresholds (Trail of Bits)

**Source**: audit-context-building OUTPUT_REQUIREMENTS.md

Set minimum quantitative standards:

```markdown
## Quality Thresholds

A complete analysis MUST include:
- Minimum 3 invariants per function
- Minimum 5 assumptions documented
- At least 1 First Principles application
- At least 3 combined 5 Whys/5 Hows applications
```

**When to use**: Skills where output quality varies and you want
a measurable bar. Avoids "technically followed the process but
produced shallow results."

---

## Pattern Selection Guide

| Your skill needs... | Use pattern |
|--------------------|-----------|
| Agents cut corners | Rationalizations Table |
| 3+ workflow phases | Modular Phase Split |
| Categorized output items | Structured Finding Format |
| Repetitive data gathering | Bundled Scripts |
| Retry/fix cycles | Iterative Feedback Loop |
| Accuracy-critical output | Anti-Hallucination Guards |
| Multiple reference files | Decision Tree Routing |
| Measurable output quality | Quality Thresholds |
