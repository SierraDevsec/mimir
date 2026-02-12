---
name: skill-authoring-guide
description: >
  Guide for creating well-structured Claude Code skills for the mimir project.
  Use when creating a new skill, refactoring an existing skill, or reviewing
  skill quality. Covers Progressive Disclosure, modular file structure,
  frontmatter conventions, and mimir-specific patterns (preloaded skills,
  MCP tool integration, agent frontmatter).
---

# Skill Authoring Guide

## Core Principle

> The context window is a public good.

Skills share the context window with system prompt, conversation history,
other skills, and the user's actual request. Every token must justify its cost.

**Claude is already very smart.** Only provide knowledge Claude does not have:
procedural workflows, project-specific conventions, domain schemas, tool
integration details. Never explain what code does — explain what Claude should do.

---

## Skill Anatomy

```
skill-name/
├── SKILL.md              (required — entry point, <500 lines)
├── references/            (optional — lazy-loaded detail docs)
│   ├── categories.md
│   └── patterns.md
├── scripts/               (optional — deterministic automation)
│   └── validate.py
└── assets/                (optional — templates, images for output)
```

### Frontmatter (YAML)

Only two fields matter:

```yaml
---
name: my-skill
description: >
  What this skill does AND when to use it. This is the ONLY trigger
  mechanism — the body loads AFTER triggering, so "When to Use" sections
  in the body are wasted tokens.
---
```

- `name`: kebab-case, unique across project
- `description`: comprehensive trigger conditions — include both purpose AND activation contexts

Do NOT put "When to Use This Skill" in the body. The body is invisible until triggered.

---

## Progressive Disclosure (3 Levels)

| Level | What loads | When | Budget |
|-------|-----------|------|--------|
| **1. Metadata** | name + description | Always in context | ~100 words |
| **2. SKILL.md body** | Core instructions | When skill triggers | <500 lines |
| **3. references/** | Detail docs | When Claude decides to read | Unlimited |

### When to Split into references/

Split when:
- SKILL.md approaches 500 lines
- Content serves multiple independent workflows (domain-specific docs)
- Sections are mutually exclusive (only one variant applies per invocation)
- Large examples or templates that aren't always needed

Keep in SKILL.md:
- Core workflow (the "happy path")
- Decision tree (which reference to read)
- Quick reference (for experienced agents)
- Quality checklist (completion criteria)

### Reference File Rules

- **1-level deep only** — all references link directly from SKILL.md, no nesting
- **100+ line files need a TOC** at the top
- **Describe when to read** each reference in SKILL.md's decision tree
- **No duplication** — information lives in SKILL.md OR reference, not both

---

## SKILL.md Body Structure

Proven structure from high-quality skills (Trail of Bits, Sentry, Anthropic):

### 1. Core Rule (3-5 lines)

The single most important instruction. If the agent reads nothing else, this
should be enough to get 80% of the behavior right.

### 2. Rationalizations Table (optional but powerful)

Preempt reasons to skip the skill's instructions:

```markdown
| Rationalization | Why It's Wrong | Required Action |
|-----------------|----------------|-----------------|
| "This is trivial" | Trivial things compose into complex bugs | Follow the process |
| "I'll do it at the end" | You'll forget context | Do it immediately |
```

This pattern (from Trail of Bits) dramatically improves compliance.

### 3. Decision Tree

Route the agent to the right reference file or workflow branch:

```markdown
├─ Need category guidance?    → Read: references/categories.md
├─ Want output examples?      → Read: references/examples.md
└─ Quick usage?               → Use Quick Reference below
```

### 4. Quick Reference

Compact lookup table for experienced agents who already know the skill:

```markdown
| Type | When | Example |
|------|------|---------|
| warning | Unexpected behavior | "BigInt needs Number() wrap" |
| decision | Chose A over B | "Hono over Express for SSE" |
```

### 5. Quality Checklist

Completion criteria before the skill's task is done:

```markdown
- [ ] All required sections present
- [ ] Evidence backs every claim
- [ ] Output format followed
```

### 6. Supporting Documentation Links

```markdown
- **[categories.md](references/categories.md)** — Detailed type guide
- **[patterns.md](references/patterns.md)** — Common patterns reference
```

---

## Output Patterns

### Template Pattern (strict output)

```markdown
ALWAYS use this exact format:
[COMPRESSED] agent_type: <type>
Changed files: file1.ts, file2.ts
Result: (1-3 lines)
```

### Examples Pattern (style guidance)

Provide input/output pairs when quality depends on seeing examples:

```markdown
**Example:**
Input: DuckDB COUNT(*) returns unexpected type
Output:
  text: "DuckDB COUNT(*) returns BigInt — wrap with Number() for arithmetic"
  type: warning
  concepts: [duckdb, bigint, type-safety]
```

Examples teach style better than descriptions.

---

## Degrees of Freedom

Match specificity to the task's fragility:

| Freedom | When | Example |
|---------|------|---------|
| **Low** (exact script) | Fragile, error-prone operations | PDF rotation, file format generation |
| **Medium** (pseudocode) | Preferred pattern exists, some variation OK | Code review checklist |
| **High** (text guidance) | Multiple valid approaches, context-dependent | Architecture decisions |

---

## mimir-Specific Conventions

See [references/mimir-conventions.md](references/mimir-conventions.md) for:
- Preloaded vs user-invoked skills
- MCP tool integration patterns
- Agent frontmatter `skills:` field
- compress-output interaction
- Version numbering

## Proven Patterns from Top Skills

See [references/patterns.md](references/patterns.md) for:
- Trail of Bits modular review structure
- Sentry bundled scripts + iterative workflow
- Anthropic Progressive Disclosure examples

---

## Anti-Patterns

| Don't | Why | Instead |
|-------|-----|---------|
| README.md in skill folder | Agents don't read READMEs | Put everything in SKILL.md |
| "When to Use" in body | Body loads AFTER trigger | Put in description field |
| Deeply nested references | Claude loses navigation context | 1-level deep only |
| Duplicate info across files | Stale data, wasted tokens | Single source of truth |
| Generic advice Claude already knows | Token waste | Only project-specific knowledge |
| Over 500 lines in SKILL.md | Context bloat | Split into references/ |
